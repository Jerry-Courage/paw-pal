import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * useGeminiLive: Native Browser Bridge for Gemini Multimodal Live API
 * Provides zero-latency voice interaction by connecting directly to Google.
 */
export function useGeminiLive() {
  const [isActive, setIsActive] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  
  const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_STUDIO_API_KEY
  // Gemini Live WebSocket Endpoint (v1alpha)
  const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`

  const stopSession = useCallback(() => {
    console.log('[GeminiDirect] Closing session...')
    setIsActive(false)
    
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
    
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
  }, [])

  const startSession = useCallback(async () => {
    if (!API_KEY) {
      setError("Gemini Key missing in frontend environment.")
      return
    }

    setIsConnecting(true)
    setError(null)
    
    try {
      console.log('[GeminiDirect] Initiating direct link...')
      
      // 1. Open Native WebSocket
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      
      ws.onopen = async () => {
        console.log('[GeminiDirect] Secure handshake established.')
        
        // 2. Transmit Persona Setup (Andrew/Charon)
        const setupMessage = {
          setup: {
            model: "models/gemini-2.0-flash-exp", // The engine-id for Multimodal Live
            generation_config: {
              response_modalities: ["AUDIO"],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: { voice_name: "Charon" }
                }
              }
            },
            system_instruction: {
              parts: [{ text: "You are FlowAI, a witty, expert, and real-time study partner named Andrew. Speak naturally, concisely, and with energy." }]
            }
          }
        }
        ws.send(JSON.stringify(setupMessage))
        
        // 3. Initialize Audio
        await initAudio()
        setIsActive(true)
        setIsConnecting(false)
      }

      ws.onmessage = async (event) => {
        const response = JSON.parse(event.data)
        
        // Handle server-side audio chunks (Andrew speaking)
        if (response.serverContent?.modelTurn?.parts) {
          const parts = response.serverContent.modelTurn.parts
          for (const part of parts) {
            if (part.inlineData) {
              console.log('[GeminiDirect] Processing Andrew Audio Chunk...')
              playAudioChunk(part.inlineData.data)
            }
          }
        }
      }

      ws.onerror = (e) => {
        console.error('[GeminiDirect] Signal Error:', e)
        setError("Connection to Gemini Brain interrupted.")
        stopSession()
      }

      ws.onclose = () => {
        console.log('[GeminiDirect] Link terminated.')
        setIsActive(false)
      }

    } catch (err: any) {
      console.error('[GeminiDirect] Critical Abort:', err)
      setError(err.message || "Failed to ignite Gemini session.")
      setIsConnecting(false)
    }
  }, [API_KEY, WS_URL, stopSession])

  const initAudio = async () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000 // Gemini expects 16kHz
    })
    audioContextRef.current = audioContext
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    })
    mediaStreamRef.current = stream
    
    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(2048, 1, 1)
    processorRef.current = processor
    
    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0)
        // Convert Float32 to Int16 for the brain-link
        const int16Data = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          int16Data[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF
        }
        
        // Wrap in the realtime_input protocol
        const audioMsg = {
          realtime_input: {
            media_chunks: [{
              mime_type: "audio/pcm;rate=16000",
              data: arrayBufferToBase64(int16Data.buffer)
            }]
          }
        }
        wsRef.current.send(JSON.stringify(audioMsg))
      }
    }
    
    source.connect(processor)
    processor.connect(audioContext.destination)
  }

  const playAudioChunk = (base64Data: string) => {
    // Basic playout implementation (Standard browser approach)
    // In a prod system, a buffer queue/SourceBuffer is better, but this is high-speed low-latency
    const audioData = base64ToArrayBuffer(base64Data)
    if (audioContextRef.current) {
      audioContextRef.current.decodeAudioData(audioData, (buffer) => {
        const source = audioContextRef.current!.createBufferSource()
        source.buffer = buffer
        source.connect(audioContextRef.current!.destination)
        source.start()
      })
    }
  }

  // Helpers
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

  return {
    isActive,
    isConnecting,
    error,
    startSession,
    stopSession
  }
}
