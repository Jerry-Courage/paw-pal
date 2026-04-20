import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * useGeminiLive: Fluid Voice Bridge for Gemini Multimodal Live API
 * Provides zero-latency, zero-pop audible speech via a scheduled sequential queue.
 */
export function useGeminiLive() {
  const [isActive, setIsActive] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const nextStartTimeRef = useRef<number>(0)
  
  const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_STUDIO_API_KEY
  const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`

  const stopSession = useCallback(() => {
    console.log('[GeminiDirect] Closing session...')
    setIsActive(false)
    setIsConnecting(false)
    nextStartTimeRef.current = 0
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
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
      console.log('[GeminiDirect] Initiating Fluid Link...')
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      
      ws.onopen = async () => {
        console.log('[GeminiDirect] Secure handshake established.')
        
        const setupMessage = {
          setup: {
            model: "models/gemini-2.5-flash-native-audio-latest",
            generation_config: {
              response_modalities: ["AUDIO"],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: { voice_name: "Charon" }
                }
              }
            },
            system_instruction: {
              parts: [{ text: "You are FlowAI, a real-time study partner named Andrew. Speak naturally, concisely, and immediately." }]
            }
          }
        }
        ws.send(JSON.stringify(setupMessage))
        
        await initAudio()
        setIsActive(true)
        setIsConnecting(false)
      }

      ws.onmessage = async (event) => {
        // 1. Handle Binary Audio Stream (Andrew Speaking)
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer()
          playRawPCMInQueue(arrayBuffer)
          return
        }

        // 2. Handle Handshake/Metadata
        try {
          const response = JSON.parse(event.data)
          if (response.serverContent?.modelTurn?.parts) {
            const parts = response.serverContent.modelTurn.parts
            for (const part of parts) {
              if (part.inlineData) {
                playRawPCMInQueue(base64ToArrayBuffer(part.inlineData.data))
              }
            }
          }
          if (response.serverContent?.turnComplete) {
              console.log('[GeminiDirect] Speaker Turn Finished.')
          }
        } catch (err) {
          // console.error('[GeminiDirect] JSON Skip:', err)
        }
      }

      ws.onclose = (e) => {
        console.log('[GeminiDirect] Link terminated. Code:', e.code)
        stopSession()
        if (e.code !== 1000 && e.code !== 1001) {
            setError(`Signal Terminated (Code ${e.code}).`)
        }
      }

    } catch (err: any) {
      console.error('[GeminiDirect] Critical Abort:', err)
      setError(err.message || "Failed to ignite Gemini session.")
      setIsConnecting(false)
    }
  }, [API_KEY, WS_URL, stopSession])

  const initAudio = async () => {
    // 24000Hz is the high-fidelity native rate for Gemini output
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000
    })
    audioContextRef.current = audioContext
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      } 
    })
    mediaStreamRef.current = stream
    
    const source = audioContext.createMediaStreamSource(stream)
    // Using 4096 to reduce JSON-chat overhead while maintaining responsiveness
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor
    
    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && isActive) {
        const inputData = e.inputBuffer.getChannelData(0)
        
        // Simple downsample from 24k to 16k for the Gemini brain
        const factor = 24000 / 16000 // 1.5
        const resampledLength = Math.floor(inputData.length / factor)
        const int16Data = new Int16Array(resampledLength)
        
        for (let i = 0; i < resampledLength; i++) {
          const index = Math.floor(i * factor)
          int16Data[i] = Math.max(-1, Math.min(1, inputData[index])) * 0x7FFF
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
    
    source.connect(processor)
    processor.connect(audioContext.destination)
  }

  const playRawPCMInQueue = (arrayBuffer: ArrayBuffer) => {
    if (!audioContextRef.current) return
    
    const int16Data = new Int16Array(arrayBuffer)
    const float32Data = new Float32Array(int16Data.length)
    for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 0x7FFF
    }
    
    const buffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000)
    buffer.getChannelData(0).set(float32Data)
    
    const source = audioContextRef.current.createBufferSource()
    source.buffer = buffer
    source.connect(audioContextRef.current.destination)
    
    const currentTime = audioContextRef.current.currentTime
    // If the queue has gone cold, start slightly ahead of current time for smoothness
    if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime + 0.05
    }
    
    source.start(nextStartTimeRef.current)
    nextStartTimeRef.current += buffer.duration
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
