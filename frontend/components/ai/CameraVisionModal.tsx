'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Camera, CameraOff, Mic, MicOff, Volume2, VolumeX, MessageSquare, FlipHorizontal, Maximize2, Minimize2 } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type LiveState = 'idle' | 'connecting' | 'listening' | 'analyzing' | 'speaking' | 'ended'

interface SubtitleEntry {
  role: 'user' | 'ai'
  text: string
  ts: number
}

export default function CameraVisionModal({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const canvasDrawRef = useRef<number>(0)

  // Playback state — gapless scheduling via source.start(scheduledTime)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])
  const playDoneTimeoutRef = useRef<any>(null)

  // Mic state — ScriptProcessorNode with silent gain
  const micCtxRef = useRef<AudioContext | null>(null)
  const micNodeRef = useRef<ScriptProcessorNode | null>(null)
  const micMutedRef = useRef(false)

  const [state, setState] = useState<LiveState>('idle')
  const [micMuted, setMicMuted] = useState(false)
  const [speakerMuted, setSpeakerMuted] = useState(false)
  const [showSubtitles, setShowSubtitles] = useState(true)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [subtitles, setSubtitles] = useState<SubtitleEntry[]>([])
  const [aiStatusText, setAiStatusText] = useState('Connecting...')
  const [fullscreen, setFullscreen] = useState(false)
  const [waveformBars, setWaveformBars] = useState<number[]>(new Array(12).fill(0))
  const inputRef = useRef<HTMLInputElement>(null)
  const [textInput, setTextInput] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { micMutedRef.current = micMuted }, [micMuted])

  const cleanup = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null }
    if (micNodeRef.current) { micNodeRef.current.disconnect(); micNodeRef.current = null }
    if (micCtxRef.current) { micCtxRef.current.close(); micCtxRef.current = null }
    // Stop all active playback sources
    activeSourcesRef.current.forEach(s => { try { s.stop() } catch {} })
    activeSourcesRef.current = []
    if (playbackCtxRef.current) { playbackCtxRef.current.close(); playbackCtxRef.current = null }
    if (playDoneTimeoutRef.current) clearTimeout(playDoneTimeoutRef.current)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (canvasDrawRef.current) cancelAnimationFrame(canvasDrawRef.current)
    nextPlayTimeRef.current = 0
  }, [])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (err: any) {
      toast.error('Camera access denied. Please allow camera permissions.')
    }
  }, [facingMode])

  const startMic = useCallback(async () => {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 16000 },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      micStreamRef.current = micStream

      const ctx = new AudioContext({ sampleRate: 48000 })
      micCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(micStream)

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser

      const processor = ctx.createScriptProcessor(4096, 1, 1)
      micNodeRef.current = processor
      source.connect(processor)

      // Connect to silent gain — required for onaudioprocess to fire,
      // but prevents mic audio going to speakers (feedback loop)
      const silentGain = ctx.createGain()
      silentGain.gain.value = 0
      processor.connect(silentGain)
      silentGain.connect(ctx.destination)

      processor.onaudioprocess = (e) => {
        if (micMutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        const input = e.inputBuffer.getChannelData(0)
        const outputLen = Math.floor(input.length / 3)
        const pcm16 = new Int16Array(outputLen)
        for (let i = 0; i < outputLen; i++) {
          const s = Math.max(-1, Math.min(1, input[i * 3]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }
        const bytes = new Uint8Array(pcm16.buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        wsRef.current.send(JSON.stringify({ type: 'audio', data: btoa(binary) }))
      }
    } catch (err: any) {
      console.warn('Mic access denied:', err)
    }
  }, [])

  const enqueueAiAudio = useCallback((b64Pcm: string) => {
    if (speakerMuted) return

    const raw = atob(b64Pcm)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    const int16 = new Int16Array(bytes.buffer)
    const pcm = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      pcm[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF)
    }

    const ctx = playbackCtxRef.current || new AudioContext()
    playbackCtxRef.current = ctx

    const buffer = ctx.createBuffer(1, pcm.length, 24000)
    buffer.copyToChannel(pcm as any, 0)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    // Schedule gapless — start exactly when previous chunk ends
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current)
    source.start(startAt)
    nextPlayTimeRef.current = startAt + buffer.duration

    activeSourcesRef.current.push(source)
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source)
    }

    // Reset playhead after all chunks finish
    clearTimeout(playDoneTimeoutRef.current)
    playDoneTimeoutRef.current = setTimeout(() => {
      nextPlayTimeRef.current = 0
    }, (nextPlayTimeRef.current - ctx.currentTime) * 1000 + 500)
  }, [speakerMuted])

  const drawWaveform = useCallback(() => {
    if (!analyserRef.current) return
    const data = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(data)
    const bars = Array.from({ length: 12 }, (_, i) => {
      const idx = Math.floor(i * data.length / 12)
      return data[idx] / 255
    })
    setWaveformBars(bars)
    animFrameRef.current = requestAnimationFrame(drawWaveform)
  }, [])

  const captureAndSendFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !wsRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'camera_frame', data: dataUrl }))
    }
  }, [])

  const startFrameCapture = useCallback(() => {
    const tick = () => {
      captureAndSendFrame()
      canvasDrawRef.current = requestAnimationFrame(tick)
    }
    canvasDrawRef.current = requestAnimationFrame(tick)
  }, [captureAndSendFrame])

  const connectWebSocket = useCallback(async () => {
    setState('connecting')
    setAiStatusText('Connecting to Flow AI...')
    try {
      const wsUrl = await aiApi.getLiveVisionWsUrl()
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'start',
          voice: 'default',
          system_prompt: ''
        }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          switch (msg.type) {
            case 'ready':
              setState('listening')
              setAiStatusText('Camera active — show me something!')
              startFrameCapture()
              startMic()
              break
            case 'ai_audio':
              enqueueAiAudio(msg.data)
              break
            case 'ai_text':
              setSubtitles(prev => [...prev.slice(-20), { role: 'ai', text: msg.text, ts: Date.now() }])
              break
            case 'user_transcript':
              setSubtitles(prev => [...prev.slice(-20), { role: 'user', text: msg.text, ts: Date.now() }])
              break
            case 'status':
              if (msg.state === 'listening') setAiStatusText('Listening...')
              else if (msg.state === 'analyzing') setAiStatusText('Analyzing camera...')
              else if (msg.state === 'speaking') setAiStatusText('Speaking...')
              setState(msg.state as LiveState)
              break
            case 'error':
              toast.error(msg.message)
              break
            case 'ended':
              cleanup()
              setState('ended')
              break
          }
        } catch {}
      }

      ws.onerror = () => {
        toast.error('WebSocket connection failed')
        setState('idle')
      }

      ws.onclose = () => {
        if (state !== 'ended') {
          setState('idle')
          setAiStatusText('Disconnected')
        }
      }
    } catch (err) {
      toast.error('Failed to connect to live vision')
      setState('idle')
    }
  }, [startFrameCapture, startMic, enqueueAiAudio, cleanup, state])

  const endSession = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end' }))
    }
    cleanup()
    onClose()
  }, [cleanup, onClose])

  const flipCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }, [])

  const sendTextQuery = useCallback(() => {
    if (!textInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'text_query', text: textInput.trim() }))
    setTextInput('')
  }, [textInput])

  useEffect(() => {
    startCamera()
    connectWebSocket()
    return () => cleanup()
  }, [facingMode])

  useEffect(() => {
    if (analyserRef.current && !micMuted) {
      animFrameRef.current = requestAnimationFrame(drawWaveform)
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [micMuted, drawWaveform])

  return (
    <div ref={containerRef} className={cn(
      'fixed inset-0 z-[999] bg-black flex flex-col overflow-hidden',
      fullscreen && 'bg-black'
    )}>
      <canvas ref={canvasRef} className="hidden" />

      {/* Video feed */}
      <div className="absolute inset-0 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />
      </div>

      {/* AI Status Badge */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
        <div className={cn(
          'flex items-center gap-3 px-5 py-2.5 rounded-full backdrop-blur-xl border transition-all duration-300',
          state === 'listening' && 'bg-emerald-500/15 border-emerald-500/30',
          state === 'analyzing' && 'bg-amber-500/15 border-amber-500/30',
          state === 'speaking' && 'bg-primary/15 border-primary/30',
          state === 'connecting' && 'bg-white/5 border-white/10',
          state === 'ended' && 'bg-red-500/15 border-red-500/30',
        )}>
          <div className="relative">
            <div className={cn(
              'w-3 h-3 rounded-full',
              state === 'listening' && 'bg-emerald-400 animate-pulse',
              state === 'analyzing' && 'bg-amber-400 animate-pulse',
              state === 'speaking' && 'bg-primary animate-pulse',
              state === 'connecting' && 'bg-white/40 animate-pulse',
              state === 'ended' && 'bg-red-400',
            )} />
            {state === 'listening' && (
              <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 animate-ping opacity-40" />
            )}
          </div>
          <span className="text-xs font-bold text-white/90 tracking-wide">{aiStatusText}</span>
        </div>
      </div>

      {/* Waveform visualizer */}
      {(state === 'listening' || state === 'speaking') && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-end gap-1 h-8">
          {waveformBars.map((bar, i) => (
            <div
              key={i}
              className="w-1 rounded-full transition-all duration-75"
              style={{
                height: `${Math.max(4, bar * 32)}px`,
                backgroundColor: state === 'speaking'
                  ? `rgba(255, 140, 50, ${0.4 + bar * 0.6})`
                  : `rgba(52, 211, 153, ${0.3 + bar * 0.7})`,
              }}
            />
          ))}
        </div>
      )}

      {/* Subtitles overlay */}
      {showSubtitles && subtitles.length > 0 && (
        <div className="absolute bottom-32 left-0 right-0 z-20 px-6 pointer-events-none">
          <div className="max-w-2xl mx-auto space-y-2">
            {subtitles.slice(-4).map((sub, i) => (
              <div
                key={sub.ts + i}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-md animate-fade-in transition-all',
                  sub.role === 'ai'
                    ? 'bg-black/60 text-white border border-white/10 ml-0 mr-12'
                    : 'bg-primary/20 text-primary border border-primary/20 ml-12 mr-0'
                )}
              >
                {sub.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top-right controls */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
        <button
          onClick={() => setShowSubtitles(!showSubtitles)}
          className={cn('p-2.5 rounded-full backdrop-blur-md border transition-all', showSubtitles ? 'bg-white/10 border-white/20' : 'bg-black/30 border-white/5')}
        >
          <MessageSquare className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="p-2.5 rounded-full bg-black/30 backdrop-blur-md border border-white/10 transition-all"
        >
          {fullscreen ? <Minimize2 className="w-4 h-4 text-white" /> : <Maximize2 className="w-4 h-4 text-white" />}
        </button>
        <button
          onClick={endSession}
          className="p-2.5 rounded-full bg-red-500/80 backdrop-blur-md border border-red-500/30 transition-all hover:bg-red-500"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-6">
        {/* Text input bar */}
        <div className="max-w-xl mx-auto mb-4 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendTextQuery() }}
            placeholder="Type a question while showing something..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 text-white text-sm placeholder-white/40 outline-none focus:border-primary/40 transition-all"
          />
          <button
            onClick={sendTextQuery}
            disabled={!textInput.trim()}
            className="px-4 py-2.5 rounded-xl bg-primary/80 text-white text-sm font-bold disabled:opacity-30 transition-all"
          >
            Ask
          </button>
        </div>

        {/* Main controls row */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setMicMuted(!micMuted)}
            className={cn(
              'p-4 rounded-full backdrop-blur-md border transition-all',
              micMuted ? 'bg-red-500/20 border-red-500/30' : 'bg-white/10 border-white/20 hover:bg-white/20'
            )}
          >
            {micMuted ? <MicOff className="w-5 h-5 text-red-400" /> : <Mic className="w-5 h-5 text-white" />}
          </button>

          <button
            onClick={flipCamera}
            className="p-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 transition-all"
          >
            <FlipHorizontal className="w-5 h-5 text-white" />
          </button>

          <button
            onClick={endSession}
            className="p-5 rounded-full bg-red-500 hover:bg-red-600 transition-all shadow-lg shadow-red-500/30"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          <button
            onClick={() => setSpeakerMuted(!speakerMuted)}
            className={cn(
              'p-4 rounded-full backdrop-blur-md border transition-all',
              speakerMuted ? 'bg-red-500/20 border-red-500/30' : 'bg-white/10 border-white/20 hover:bg-white/20'
            )}
          >
            {speakerMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-white" />}
          </button>

          <button
            onClick={captureAndSendFrame}
            className="p-4 rounded-full bg-primary/80 backdrop-blur-md border border-primary/30 hover:bg-primary transition-all"
          >
            <Camera className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}
