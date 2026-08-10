/**
 * Noise Gate AudioWorklet Processor
 * 
 * Adaptive noise gate that learns the ambient noise floor during silence
 * and gates audio below that threshold. This provides real-time noise
 * cancellation without requiring external libraries.
 * 
 * Features:
 * - Adaptive noise floor estimation (learns background noise level)
 * - Soft knee gating (smooth transition, no clicking)
 * - Hangover timer (prevents cutting off speech tails)
 * - Voice Activity Detection output
 */
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super()

    // Noise floor estimation
    this.noiseFloor = 0.01
    this.noiseEstimate = 0.01
    this.noiseAlpha = 0.02       // slow learning rate for noise floor
    this.noiseFloorMin = 0.005   // minimum noise floor (prevents over-gating)

    // Gating
    this.openThreshold = 0       // computed dynamically
    this.closeThreshold = 0
    this.gateOpen = false
    this.hangoverFrames = 0
    this.hangoverMax = 6         // ~28ms hangover at 44.1kHz (prevents speech tail clipping)

    // Voice Activity Detection
    this.vadEnergy = 0
    this.vadThreshold = 0.02

    // RMS smoothing
    this.smoothRms = 0
    this.smoothAlpha = 0.3
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    const output = outputs[0]

    if (!input || !input[0] || input[0].length === 0) {
      return true
    }

    const inputChannel = input[0]
    const outputChannel = output[0]
    const len = inputChannel.length

    // Compute RMS of this block
    let sumSquares = 0
    for (let i = 0; i < len; i++) {
      sumSquares += inputChannel[i] * inputChannel[i]
    }
    const rms = Math.sqrt(sumSquares / len)

    // Smooth RMS for stability
    this.smoothRms += this.smoothAlpha * (rms - this.smoothRms)

    // Adapt noise floor estimate during silence
    if (this.smoothRms < this.noiseEstimate * 1.5) {
      this.noiseEstimate += this.noiseAlpha * (this.smoothRms - this.noiseEstimate)
      this.noiseEstimate = Math.max(this.noiseEstimate, this.noiseFloorMin)
      this.noiseFloor = this.noiseEstimate
    }

    // Dynamic thresholds (noise floor * multipliers)
    this.openThreshold = this.noiseFloor * 3.5   // open gate when signal > 3.5x noise
    this.closeThreshold = this.noiseFloor * 2.5  // close gate when signal < 2.5x noise (hysteresis)

    // Determine gate state with hysteresis
    if (this.smoothRms > this.openThreshold) {
      this.gateOpen = true
      this.hangoverFrames = this.hangoverMax
    } else if (this.smoothRms < this.closeThreshold) {
      if (this.hangoverFrames > 0) {
        this.hangoverFrames--
      } else {
        this.gateOpen = false
      }
    } else {
      // In hysteresis zone — keep current state
      if (this.hangoverFrames > 0) this.hangoverFrames--
    }

    // Voice Activity Detection
    this.vadEnergy = this.smoothRms
    const isSpeech = this.smoothRms > this.vadThreshold

    // Apply gate with soft knee
    for (let i = 0; i < len; i++) {
      if (this.gateOpen) {
        outputChannel[i] = inputChannel[i]
      } else {
        // Soft knee: smooth attenuation near threshold
        const absVal = Math.abs(inputChannel[i])
        if (absVal > this.closeThreshold * 0.5) {
          // Partial attenuation in the transition zone
          const ratio = Math.min(1, absVal / this.closeThreshold)
          const gain = ratio * ratio * ratio  // cubic curve for smooth transition
          outputChannel[i] = inputChannel[i] * gain
        } else {
          outputChannel[i] = 0
        }
      }
    }

    // Send VAD status to main thread (throttled — every 10 blocks ~4.6ms)
    if (sampleRate > 0 && Math.random() < 0.1) {
      this.port.postMessage({
        type: 'vad',
        isSpeech,
        energy: this.smoothRms,
        noiseFloor: this.noiseFloor,
      })
    }

    return true
  }
}

registerProcessor('noise-gate', NoiseGateProcessor)
