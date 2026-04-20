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
  const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`

  const stopSession = useCallback(() => {
    console.log('[GeminiDirect] Closing session...')
    setIsActive(false)
    setIsConnecting(false)
    
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
      setError("Gemini Key missing. Add NEXT_PUBLIC_GOOGLE_STUDIO_API_KEY to your env.")
      return
    }

    setIsConnecting(true)
    setError(null)
    
    try {
      console.log('[GeminiDirect] Initiating direct link...')
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      
      ws.onopen = async () => {
        console.log('[GeminiDirect] Secure handshake established.')
        
        // Protocol: Setup message must be the absolute first packet
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
              parts: [{ text: "You are FlowAI, an elite, real-time study partner named Andrew. Speak naturally and concisely." }]
            }
          }
        }
        ws.send(JSON.stringify(setupMessage))
        
        await initAudio()
        setIsActive(true)
        setIsConnecting(false)
      }

      ws.onmessage = async (event) => {
        const response = JSON.parse(event.data)
        
        // Handle server audio (Andrew speaking)
        if (response.serverContent?.modelTurn?.parts) {
          const parts = response.serverContent.modelTurn.parts
          for (const part of parts) {
            if (part.inlineData) {
              console.log('[GeminiDirect] Receiving Andrew Audio...')
              playRawPCM(part.inlineData.data)
            }
          }
        }
        
        if (response.serverContent?.turnComplete) {
            console.log('[GeminiDirect] Turn complete.')
        }
      }

      ws.onerror = (e) => {
        console.error('[GeminiDirect] Signal Error:', e)
        setError("Brain Link Error: Connection refused by Gemini.")
      }

      ws.onclose = (e) => {
        console.log('[GeminiDirect] Link terminated. Code:', e.code, 'Reason:', e.reason || 'None')
        setIsActive(false)
        setIsConnecting(false)
        if (e.code !== 1000 && e.code !== 1001) {
            setError(`Signal Terminated: Code ${e.code}. Check your API Key and Region.`)
        }
      }

    } catch (err: any) {
      console.error('[GeminiDirect] Critical Abort:', err)
      setError(err.message || "Failed to ignite Gemini session.")
      setIsConnecting(false)
    }
  }, [API_KEY, WS_URL])

  const initAudio = async () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000
    })
    audioContextRef.current = audioContext
    
    // Ensure Context is running
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
    const processor = audioContext.createScriptProcessor(2048, 1, 1)
    processorRef.current = processor
    
    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && isActive) {
        const inputData = e.inputBuffer.getChannelData(0)
        const int16Data = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          int16Data[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF
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

  const playRawPCM = (base64Data: string) => {
    if (!audioContextRef.current) return
    
    const arrayBuffer = base64ToArrayBuffer(base64Data)
    const int16Data = new Int16Array(arrayBuffer)
    const float32Data = new Float32Array(int16Data.length)
    
    // Convert Int16 to Float32 for the AudioContext
    for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 0x7FFF
    }
    
    const buffer = audioContextRef.current.createBuffer(1, float32Data.length, 16000)
    buffer.getChannelData(0).set(float32Data)
    
    const source = audioContextRef.current.createBufferSource()
    source.buffer = buffer
    source.connect(audioContextRef.current.destination)
    source.start()
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
