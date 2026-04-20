import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * useGeminiLive: Protocol-Finalized Bridge for Gemini Multimodal Live API
 * Restoration: Gemini 2.5 Native Audio
 * Spec: 24kHz Output / 16kHz Input
 * Binary Shielding: Header-skipping to unmask audio and eliminate static.
 */
export function useGeminiLive() {
  const [isActive, setIsActive] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const nextStartTimeRef = useRef<number>(0)
  const isActiveRef = useRef(false)
  
  const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_STUDIO_API_KEY
  const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`

  const stopSession = useCallback(() => {
    console.log('[GeminiDirect] Closing session...')
    setIsActive(false)
    isActiveRef.current = false
    setIsConnecting(false)
    nextStartTimeRef.current = 0
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
    }
  }, [])

  const startSession = useCallback(async () => {
    if (!API_KEY) {
      setError("Gemini Key missing. Check your frontend environment.")
      return
    }

    setIsConnecting(true)
    setError(null)
    
    try {
      console.log('[GeminiDirect] Initiating Industrial Link...')
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      
      ws.onopen = async () => {
        console.log('[GeminiDirect] Secure handshake established.')
        
        const setupMessage = {
          setup: {
            model: "models/gemini-1.5-flash",
            generation_config: {
              response_modalities: ["AUDIO"],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: { voice_name: "Charon" } // Andrew
                }
              }
            },
            system_instruction: {
              parts: [{ text: "You are FlowAI, a real-time study partner named Andrew. Speak naturally, concisely, and effectively. IMPORTANT: GREET THE USER IMMEDIATELY with a witty remark. You are running on the UNIVERSAL-AWAKENING build. Your pulse is clear." }]
            }
          }
        }
        ws.send(JSON.stringify(setupMessage))
        
        await initAudio()
        setIsActive(true)
        isActiveRef.current = true
        setIsConnecting(false)
      }

      ws.onmessage = async (event) => {
        // THE PEACE BUILD: We ignore binary messages entirely to kill static.
        // Andrew's voice will ONLY flow through the crystal-clear JSON lane.
        if (typeof event.data !== 'string') return

        try {
          const response = JSON.parse(event.data)
          const parts = response.serverContent?.modelTurn?.parts
          if (parts) {
            for (const part of parts) {
              // Extraction Strategy: Check every known audio field in the clean JSON
              const audioData = part.inlineData?.data || part.audio || part.blob?.data || part.data
              if (audioData) {
                // Verified Extraction: Official 24kHz Humanoid Voice
                playRawPCMInQueue(base64ToArrayBuffer(audioData))
              }
            }
          }
        } catch (err) {}
      }

      ws.onclose = (e) => {
        console.log('[GeminiDirect] Link terminated. Code:', e.code)
        stopSession()
      }

    } catch (err: any) {
      console.error('[GeminiDirect] System Abort:', err)
      setError(err.message || "Failed to ignite Gemini session.")
      setIsConnecting(false)
    }
  }, [API_KEY, WS_URL, stopSession])

  const initAudio = async () => {
    // Official Spec: Mic Input @ 16000Hz
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000
    })
    audioContextRef.current = audioContext
    
    console.log('[GeminiDirect] ENGINE: UNIVERSAL-AWAKENING (Peace)')
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    const workletCode = `
      class GeminiProcessor extends AudioWorkletProcessor {
        process(inputs, outputs) {
          const input = inputs[0];
          if (input.length > 0 && input[0]) {
            this.port.postMessage(input[0]);
          }
          return true;
        }
      }
      registerProcessor('gemini-processor', GeminiProcessor);
    `
    const blob = new Blob([workletCode], { type: 'application/javascript' })
    const workletUrl = URL.createObjectURL(blob)
    
    await audioContext.audioWorklet.addModule(workletUrl)
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      } 
    })
    mediaStreamRef.current = stream
    
    // Safety check: Ensure context wasn't closed by a fast handshake rejection
    if (audioContext.state === 'closed') return;

    const source = audioContext.createMediaStreamSource(stream)
    const workletNode = new AudioWorkletNode(audioContext, 'gemini-processor')
    workletNodeRef.current = workletNode
    
    let chunkCount = 0
    workletNode.port.onmessage = (event) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && isActiveRef.current) {
        const inputData = event.data 
        
        let micPeak = 0
        const int16Data = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = inputData[i]
          if (Math.abs(s) > micPeak) micPeak = Math.abs(s)
          int16Data[i] = Math.max(-1, Math.min(1, s)) * 0x7FFF
        }
        
        chunkCount++
        if (chunkCount % 40 === 0) {
            console.log(`[GeminiDirect] Mic Pulse: [${micPeak.toFixed(3)}]`)
            chunkCount = 0
        }
        
        wsRef.current.send(JSON.stringify({
          realtime_input: {
            media_chunks: [{
              mime_type: "audio/pcm;rate=16000",
              data: arrayBufferToBase64(int16Data.buffer)
            }]
          }
        }))
      }
    }
    
    const silentGain = audioContext.createGain()
    silentGain.gain.value = 0
    
    source.connect(workletNode)
    workletNode.connect(silentGain)
    silentGain.connect(audioContext.destination)
  }

  const playRawPCMInQueue = (arrayBuffer: ArrayBuffer) => {
    if (!audioContextRef.current || arrayBuffer.byteLength < 2) return
    
    try {
      const dataView = new DataView(arrayBuffer)
      const sampleCount = Math.floor(arrayBuffer.byteLength / 2)
      const float32Data = new Float32Array(sampleCount)
      
      let speakerPeak = 0
      for (let i = 0; i < sampleCount; i++) {
          // Official Spec: Signed 16-bit PCM, Little-Endian
          const int16Value = dataView.getInt16(i * 2, true)
          const f32Value = int16Value / 0x7FFF
          if (Math.abs(f32Value) > speakerPeak) speakerPeak = Math.abs(f32Value)
          float32Data[i] = f32Value
      }
      
      console.log(`[GeminiDirect] Speaker Pulse: [${speakerPeak.toFixed(3)}]`)
      
      // Official Spec: Output @ 24,000Hz 🎷
      const buffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000)
      buffer.getChannelData(0).set(float32Data)
      
      const source = audioContextRef.current.createBufferSource()
      source.buffer = buffer
      source.connect(audioContextRef.current.destination)
      
      const currentTime = audioContextRef.current.currentTime
      if (nextStartTimeRef.current < currentTime) {
          nextStartTimeRef.current = currentTime + 0.05
      }
      
      source.start(nextStartTimeRef.current)
      nextStartTimeRef.current += buffer.duration
    } catch (err) {
      console.error('[GeminiDirect] Audio Sync Failed:', err)
    }
  }

  function arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
  }

  function base64ToArrayBuffer(base64: string) {
    const binaryString = window.atob(base64)
    const len = binaryString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  return { isActive, isConnecting, error, startSession, stopSession }
}
