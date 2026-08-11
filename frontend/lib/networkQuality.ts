/**
 * NetworkQualityMonitor
 * 
 * Monitors WebSocket connection quality in real-time and provides
 * adaptive settings for audio streaming based on network conditions.
 * 
 * Tracks:
 * - Buffered amount (backpressure detection)
 * - Round-trip time (send → ack)
 * - Packet loss (missing acks)
 * - Connection state
 * 
 * Outputs adaptive settings:
 * - chunkSize: 512 (excellent) → 4096 (terrible)
 * - sampleRate: 16000 (excellent) → 8000 (terrible)
 * - enabled: true/false (fallback to text mode)
 */

export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'terrible'

export interface AdaptiveSettings {
  chunkSize: number        // samples per chunk (512-4096)
  sampleRate: number       // Hz (8000-16000)
  quality: NetworkQuality
  sendBinary: boolean      // use binary frames (true on good+)
  textFallback: boolean    // fall back to text mode
  maxBufferedBytes: number // backpressure threshold
}

const PRESETS: Record<NetworkQuality, AdaptiveSettings> = {
  excellent: {
    chunkSize: 512,        // ~32ms @ 16kHz — lowest latency
    sampleRate: 16000,
    quality: 'excellent',
    sendBinary: true,
    textFallback: false,
    maxBufferedBytes: 64 * 1024,
  },
  good: {
    chunkSize: 1024,       // ~64ms @ 16kHz — balanced
    sampleRate: 16000,
    quality: 'good',
    sendBinary: true,
    textFallback: false,
    maxBufferedBytes: 128 * 1024,
  },
  fair: {
    chunkSize: 2048,       // ~128ms @ 16kHz — more reliable
    sampleRate: 16000,
    quality: 'fair',
    sendBinary: true,
    textFallback: false,
    maxBufferedBytes: 256 * 1024,
  },
  poor: {
    chunkSize: 4096,       // ~256ms @ 16kHz — high reliability
    sampleRate: 16000,
    quality: 'poor',
    sendBinary: true,
    textFallback: false,
    maxBufferedBytes: 512 * 1024,
  },
  terrible: {
    chunkSize: 4096,       // ~512ms @ 8kHz — text fallback ready
    sampleRate: 8000,      // halved bandwidth
    quality: 'terrible',
    sendBinary: true,
    textFallback: false,   // don't auto-fallback, let user choose
    maxBufferedBytes: 1024 * 1024,
  },
}

export class NetworkQualityMonitor {
  private ws: WebSocket | null = null
  private quality: NetworkQuality = 'good'
  private listeners: Set<(settings: AdaptiveSettings) => void> = new Set()

  // Metrics
  private rttHistory: number[] = []
  private sendTimes: Map<number, number> = new Map()
  private ackCounter = 0
  private lossCounter = 0
  private lastBufferedAmount = 0
  private checkInterval: ReturnType<typeof setInterval> | null = null

  attach(ws: WebSocket) {
    this.detach()
    this.ws = ws
    this.rttHistory = []
    this.sendTimes.clear()
    this.ackCounter = 0
    this.lossCounter = 0

    // Start monitoring every 2 seconds
    this.checkInterval = setInterval(() => this._evaluate(), 2000)
  }

  detach() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    this.ws = null
    this.listeners.clear()
  }

  onQualityChange(cb: (settings: AdaptiveSettings) => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /** Call when a message is sent to track delivery */
  trackSend(msgId: number) {
    this.sendTimes.set(msgId, performance.now())
  }

  /** Call when an ack is received to measure RTT */
  trackAck(msgId: number) {
    const sentAt = this.sendTimes.get(msgId)
    if (sentAt) {
      const rtt = performance.now() - sentAt
      this.rttHistory.push(rtt)
      if (this.rttHistory.length > 10) this.rttHistory.shift()
      this.sendTimes.delete(msgId)
      this.ackCounter++
    }
  }

  /** Get current adaptive settings */
  getSettings(): AdaptiveSettings {
    return PRESETS[this.quality]
  }

  /** Get current quality level */
  getQuality(): NetworkQuality {
    return this.quality
  }

  /** Check if backpressure is too high */
  isBackedUp(): boolean {
    if (!this.ws) return false
    return this.ws.bufferedAmount > PRESETS[this.quality].maxBufferedBytes
  }

  /** Get human-readable status */
  getStatusText(): string {
    const labels: Record<NetworkQuality, string> = {
      excellent: 'Excellent connection',
      good: 'Good connection',
      fair: 'Fair — adjusting quality',
      poor: 'Poor — optimized for reliability',
      terrible: 'Very slow — may switch to text',
    }
    return labels[this.quality]
  }

  private _evaluate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    // 1. RTT analysis
    const avgRtt = this.rttHistory.length > 0
      ? this.rttHistory.reduce((a, b) => a + b, 0) / this.rttHistory.length
      : 100

    // 2. Buffered amount (backpressure)
    const buffered = this.ws.bufferedAmount
    const bufferGrew = buffered > this.lastBufferedAmount + 1024
    this.lastBufferedAmount = buffered

    // 3. Packet loss estimate
    const totalSends = this.ackCounter + this.lossCounter
    const lossRate = totalSends > 5 ? this.lossCounter / totalSends : 0

    // 4. Determine quality
    let newQuality: NetworkQuality

    if (avgRtt < 100 && !bufferGrew && lossRate < 0.02) {
      newQuality = 'excellent'
    } else if (avgRtt < 200 && lossRate < 0.05) {
      newQuality = 'good'
    } else if (avgRtt < 400 || bufferGrew) {
      newQuality = 'fair'
    } else if (avgRtt < 800 || lossRate < 0.15) {
      newQuality = 'poor'
    } else {
      newQuality = 'terrible'
    }

    // 5. Smooth transitions (don't oscillate)
    if (newQuality !== this.quality) {
      const qualityOrder: NetworkQuality[] = ['excellent', 'good', 'fair', 'poor', 'terrible']
      const currentIdx = qualityOrder.indexOf(this.quality)
      const newIdx = qualityOrder.indexOf(newQuality)

      // Only jump one step at a time
      if (Math.abs(newIdx - currentIdx) > 1) {
        newQuality = qualityOrder[currentIdx + (newIdx > currentIdx ? 1 : -1)]
      }

      if (newQuality !== this.quality) {
        this.quality = newQuality
        const settings = PRESETS[this.quality]
        this.listeners.forEach(cb => cb(settings))
      }
    }

    // 6. Track loss (unsent buffered data that's been sitting too long)
    if (bufferGrew && buffered > 50 * 1024) {
      this.lossCounter++
    }
  }
}
