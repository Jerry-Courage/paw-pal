'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mic, MicOff, Hand, MessageSquare, BookOpen, Volume2, VolumeX, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSpeechExchange, SpeechState } from '@/hooks/useSpeechExchange'
import { aiApi } from '@/lib/api'
import { toast } from 'sonner'

interface StudyCallProps {
  resourceId: number
  resourceTitle: string
  notes: any
  onClose: () => void
}

export default function StudyCall({ resourceId, resourceTitle, notes, onClose }: StudyCallProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [transcripts, setTranscripts] = useState<{ role: 'user' | 'assistant', text: string }[]>([])
  const [isIntroPlayed, setIsIntroPlayed] = useState(false)
  const [isConnecting, setIsConnecting] = useState(true)

  // Initialize Voice Engine
  const { state, startListening, stopListening, playAudio, error } = useSpeechExchange({
    onCommand: async (query) => {
      handleUserCommand(query)
    },
    isVoiceResponseEnabled: true
  })

  // Start the interaction
  useEffect(() => {
    // startListening(true) - In Tutor mode we jump straight to engagement
    if (!isIntroPlayed) {
      handleIntro()
    }
    return () => stopListening()
  }, [])

  const handleIntro = async () => {
    setIsConnecting(true)
    try {
      // We use the agent to get a "Voice-Ready" greeting based on the resource
      const res = await aiApi.askAgent(
        `The user just started a Live Tutor session for "${resourceTitle}". Give a warm, 1-sentence greeting and ask where they want to start.`, 
        JSON.stringify(notes || {}), 
        true, 
        undefined, 
        [], 
        true
      )
      
      setIsConnecting(false)
      setIsIntroPlayed(true)

      if (res.data.audio_url) {
        setTranscripts([{ role: 'assistant', text: res.data.reply }])
        playAudio(res.data.audio_url, () => startListening(true))
      } else {
        // If no audio, just start listening
        startListening(true)
      }
    } catch (e) {
      console.error("Intro failed", e)
      setIsConnecting(false)
      startListening(true) // Fallback to listening even if greet fails
    }
  }

  const handleUserCommand = async (query: string) => {
    setTranscripts(prev => [...prev, { role: 'user', text: query }])
    
    try {
      // Build history for context
      const history = transcripts.map(t => ({ 
        role: t.role, 
        content: t.text 
      }))

      // Use text-based askAgent for faster turnaround when we already have the string
      const response = await aiApi.askAgent(
        query, 
        JSON.stringify({ resource: resourceTitle, notes }), 
        true, 
        undefined, 
        history,
        true
      )

      if (response.data.reply) {
        setTranscripts(prev => [...prev, { role: 'assistant', text: response.data.reply }])
        if (response.data.audio_url) {
          playAudio(response.data.audio_url, () => startListening(true))
        } else {
          startListening(true)
        }
      } else {
        startListening(true)
      }
    } catch (e) {
      toast.error("I'm having trouble connecting to the logic brain.")
      startListening(true)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-between p-6 sm:p-12 overflow-hidden select-none">
      
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[120px] transition-all duration-1000",
          state === 'speaking' ? "bg-indigo-500/20 opacity-60" : 
          state === 'listening' ? "bg-emerald-500/20 opacity-40" : 
          "bg-indigo-500/10 opacity-20"
        )} />
      </div>

      {/* Header */}
      <div className="w-full max-w-5xl flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
            <BookOpen className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-white font-black text-lg sm:text-xl tracking-tight uppercase italic">{resourceTitle}</h2>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Live Tutor Session</span>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setShowTranscript(!showTranscript)}
          className={cn(
            "p-3 rounded-2xl transition-all border",
            showTranscript ? "bg-white text-slate-950 border-white" : "bg-white/5 text-white/60 border-white/10"
          )}
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>

      {/* MODAL: NEURAL ORB STAGE */}
      <div className="relative flex items-center justify-center flex-1 w-full z-10">
        
        {/* The Outer Rings */}
        <AnimatePresence>
          {state === 'speaking' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1.5, opacity: 0.3 }}
              exit={{ scale: 2, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
              className="absolute w-64 h-64 rounded-full border-2 border-indigo-500/30"
            />
          )}
        </AnimatePresence>

        {/* The Main Neural Orb */}
        <motion.div
            animate={{
                scale: state === 'speaking' ? [1, 1.1, 1] : state === 'listening' ? [1, 1.05, 1] : 1,
                rotate: [0, 90, 180, 270, 360]
            }}
            transition={{
                scale: { repeat: Infinity, duration: state === 'speaking' ? 0.3 : 2 },
                rotate: { repeat: Infinity, duration: 20, ease: "linear" }
            }}
            className={cn(
                "relative w-40 h-40 sm:w-64 sm:h-64 rounded-full shadow-[0_0_100px_rgba(99,102,241,0.4)] flex items-center justify-center",
                "bg-gradient-to-tr from-indigo-600 via-violet-500 to-indigo-400 overflow-hidden"
            )}
        >
            {/* Liquid Surface Effect */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
            
            {/* Inner Core */}
            <div className="w-1/2 h-1/2 bg-white/20 rounded-full blur-2xl" />
        </motion.div>

        {/* State Indicators */}
        <div className="absolute top-[calc(50%+100px)] sm:top-[calc(50%+140px)] flex flex-col items-center w-full px-6">
            <AnimatePresence mode="wait">
                <motion.div
                    key={state + (isConnecting ? '-conn' : '')}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-center"
                >
                    <span className="text-white/60 text-xs font-black uppercase tracking-[0.4em] block">
                        {isConnecting ? "Establishing Neural Link..." :
                         state === 'thinking' ? "Synthesizing Knowledge..." : 
                         state === 'speaking' ? "Flow is Explaining..." : 
                         state === 'listening' ? "Go ahead, I'm listening" : 
                         "Ask me anything"}
                    </span>
                </motion.div>
            </AnimatePresence>
        </div>
      </div>

      {/* Transcript Overlay (Bottom Third) */}
      <AnimatePresence>
        {showTranscript && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: '30vh', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full max-w-4xl bg-white/5 backdrop-blur-3xl rounded-[3rem] border border-white/10 mb-8 p-8 overflow-y-auto custom-scrollbar z-20"
          >
            <div className="space-y-6">
              {transcripts.map((t, i) => (
                <div key={i} className={cn(
                  "flex flex-col gap-2",
                  t.role === 'user' ? "items-end" : "items-start"
                )}>
                  <span className="text-[10px] font-black uppercase text-white/30 tracking-widest">{t.role === 'user' ? "You" : "FlowAI"}</span>
                  <p className={cn(
                    "max-w-md px-6 py-4 rounded-3xl text-sm leading-relaxed",
                    t.role === 'user' ? "bg-indigo-600 text-white" : "bg-white/5 text-white/80"
                  )}>
                    {t.text}
                  </p>
                </div>
              ))}
              {transcripts.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full opacity-20">
                  <Sparkles className="w-8 h-8 text-white mb-2" />
                  <p className="text-xs font-black uppercase text-white tracking-widest">Transcript Empty</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls HUD */}
      <div className="w-full max-w-xl flex items-center justify-between gap-6 z-10 px-8 py-6 bg-white/5 backdrop-blur-2xl rounded-full border border-white/10">
        
        <button 
          onClick={() => {
            if (isMuted) startListening(); else stopListening();
            setIsMuted(!isMuted);
          }}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95",
            isMuted ? "bg-rose-500 text-white" : "bg-white/10 text-white/60 hover:text-white"
          )}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        <button 
          onClick={onClose}
          className="flex-1 sm:flex-none px-6 sm:px-10 h-14 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-full shadow-2xl shadow-rose-600/30 transition-all active:scale-95 text-[10px] sm:text-xs uppercase tracking-widest"
        >
          End Call
        </button>

        <button 
          className="w-14 h-14 rounded-full bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-all active:scale-95"
          onClick={() => {
            // "Raise Hand" logic - stops speaking to let user ask
            window.speechSynthesis.cancel()
            // Reset to listening state
            startListening()
          }}
        >
          <Hand className="w-6 h-6" />
        </button>

      </div>

    </div>
  )
}
