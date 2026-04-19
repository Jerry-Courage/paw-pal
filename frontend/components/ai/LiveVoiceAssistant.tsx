'use client'

import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Zap, X, Volume2, Waves } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SERVER_URL, getAuthToken } from '@/lib/api'

interface LiveVoiceAssistantProps {
  onClose: () => void
  token?: string | null
}

export default function LiveVoiceAssistant({ onClose }: LiveVoiceAssistantProps) {
  const [isActive, setIsActive] = useState(false)
  const [isConnecting, setIsConnecting] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [volume, setVolume] = useState(0)
  
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  
  // Playout Buffer
  const audioQueue: Int16Array[] = []
  const isPlayingRef = useRef(false)

  useEffect(() => {
    connect()
    return () => {
      stopService()
    }
  }, [])

  const connect = async () => {
    try {
      // Automatically grab the active session token for the security handshake
      const authToken = await getAuthToken()
      
      // Derive WS URL from the production SERVER_URL
      let wsUrl = SERVER_URL.replace(/^http/, 'ws') + '/ws/ai/live/'
      if (authToken) {
        wsUrl += `?token=${authToken}`
      }
      
      console.log('[Live] Establishing secure signal...')
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnecting(false)
        setIsActive(true)
        toast.success('Live Intelligence Signal Established')
        startMic()
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        
        if (data.audio) {
          // Playback the AI audio chunk
          queueAudio(data.audio)
        }
        
        if (data.text) {
          // You could display the text live if needed
          console.log('[Live] AI:', data.text)
        }
        
        if (data.error) {
          toast.error(data.error)
          onClose()
        }
      }

      ws.onclose = () => {
        setIsActive(false)
        setIsConnecting(false)
        toast.info('Live Session Ended')
      }

      ws.onerror = (err) => {
        console.error('WS Error:', err)
        toast.error('Signal Connection Failed')
        onClose()
      }
    } catch (err) {
      console.error('Connection Exception:', err)
      onClose()
    }
  }

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 })
      audioContextRef.current = audioCtx
      
      const source = audioCtx.createMediaStreamSource(stream)
      // Capture 4096 samples at a time
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!isListening) return
        
        const inputData = e.inputBuffer.getChannelData(0)
        
        // Calculate Volume (RMS) for visual feedback
        let sum = 0
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i]
        }
        const rms = Math.sqrt(sum / inputData.length)
        // Scale to 0-100 range for UI
        setVolume(Math.min(100, rms * 1000))

        // Convert Float32 to Int16 for Gemini
        const int16Data = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          int16Data[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF
        }
        
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(int16Data.buffer)
        }
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)
      setIsListening(true)
    } catch (err) {
      console.error('Mic Error:', err)
      toast.error('Microphone Access Denied')
      setIsListening(false)
    }
  }

  const queueAudio = (base64Data: string) => {
    const binary = atob(base64Data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const int16 = new Int16Array(bytes.buffer)
    audioQueue.push(int16)
    
    if (!isPlayingRef.current) {
      playNext()
    }
  }

  const playNext = async () => {
    if (audioQueue.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false
      return
    }

    isPlayingRef.current = true
    const chunk = audioQueue.shift()!
    
    const audioCtx = audioContextRef.current
    const buffer = audioCtx.createBuffer(1, chunk.length, 16000)
    const channelData = buffer.getChannelData(0)
    
    for (let i = 0; i < chunk.length; i++) {
      channelData[i] = chunk[i] / 0x7FFF
    }

    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.connect(audioCtx.destination)
    source.onended = () => playNext()
    source.start()
  }

  const stopService = () => {
    setIsListening(false)
    setIsActive(false)
    
    if (wsRef.current) wsRef.current.close()
    if (processorRef.current) processorRef.current.disconnect()
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop())
    if (audioContextRef.current) audioContextRef.current.close()
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors z-20"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 pb-12 flex flex-col items-center text-center">
          <div className="relative mb-8">
            <motion.div 
              animate={{ 
                scale: isListening ? 1 + (volume / 200) : 1,
                boxShadow: isListening 
                  ? `0 0 ${20 + (volume / 2)}px rgba(139,92,246,0.5)` 
                  : 'none'
              }}
              className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center relative z-10 transition-all duration-100",
                isListening ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
              )}
            >
              {isListening ? <Waves className="w-10 h-10 animate-pulse" /> : <MicOff className="w-10 h-10" />}
            </motion.div>
            
            {isListening && (
              <>
                <motion.div 
                  animate={{ 
                    scale: [1, 1.5 + (volume / 100), 1], 
                    opacity: [0.3, 0.1, 0.3] 
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 bg-primary rounded-full -z-0"
                />
                <motion.div 
                  animate={{ 
                    scale: [1, 2 + (volume / 50), 1], 
                    opacity: [0.2, 0, 0.2] 
                  }}
                  transition={{ repeat: Infinity, duration: 3, delay: 0.5 }}
                  className="absolute inset-0 bg-primary rounded-full -z-0"
                />
              </>
            )}
          </div>

          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
            {isConnecting ? 'Connecting Signal...' : 'Gemini 3 Flash Live'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-10 max-w-[240px]">
            {isListening 
              ? 'Signal is active. You can speak naturally now—no lag, just flow.' 
              : 'Initializing low-latency multimodal bridge...'}
          </p>

          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-3xl border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Latency</div>
              <div className="text-lg font-black text-emerald-500 tracking-tight">~120ms</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-3xl border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quota</div>
              <div className="text-lg font-black text-primary tracking-tight">Unlimited</div>
            </div>
          </div>

          <button 
            onClick={stopService}
            className="mt-8 w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-bold flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl"
          >
            Stop Live Session
          </button>
        </div>

        {/* Status Bar */}
        <div className="bg-slate-50 dark:bg-slate-800/30 px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Real-time Connected</span>
          </div>
          <Zap className="w-4 h-4 text-primary animate-bounce" />
        </div>
      </div>
    </motion.div>
  )
}
