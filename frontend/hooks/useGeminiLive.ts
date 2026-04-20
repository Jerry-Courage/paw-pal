import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * useGeminiLive: Industrial-Grade Bridge for Gemini Multimodal Live API
 * Uses AudioWorklets to eliminate pops, stuttering, and deprecation warnings.
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
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer()
          playRawPCMInQueue(arrayBuffer)
          return
        }

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
        } catch (err) {}
      }

      ws.onclose = (e) => {
        console.log('[GeminiDirect] Link terminated. Code:', e.code)
        stopSession()
      }

    } catch (err: any) {
      console.error('[GeminiDirect] Error:', err)
      setError(err.message || "Failed to ignite Gemini session.")
      setIsConnecting(false)
    }
  }, [API_KEY, WS_URL, stopSession])

  const initAudio = async () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000
    })
    audioContextRef.current = audioContext
    
    // 1. Create the Worklet Processor Blob
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
    
    const source = audioContext.createMediaStreamSource(stream)
    const workletNode = new AudioWorkletNode(audioContext, 'gemini-processor')
    workletNodeRef.current = workletNode
    
    workletNode.port.onmessage = (event) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && isActive) {
        const inputData = event.data // Float32Array from the background thread
        
        // Simple downsample from 24k to 16k
        const factor = 1.5
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
    
    source.connect(workletNode)
    // We don't connect workletNode to destination because we don't want to hear the mic loopback
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
