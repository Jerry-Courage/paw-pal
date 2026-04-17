'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Sparkles, X, Send, Bot, User, 
  Settings, Maximize2, Minimize2, 
  CheckCircle2, AlertCircle, Loader2,
  Calendar, BookOpen, ClipboardList, Layout,
  Mic, MicOff, Volume2, VolumeX
} from 'lucide-react'
import { aiApi, API_BASE, SERVER_URL } from '@/lib/api'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import { usePathname } from 'next/navigation'
import { useSpeechExchange } from '@/hooks/useSpeechExchange'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  action?: any
  execution_result?: string | null
}

export default function GlobalAgentAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isVoiceResponseEnabled, setIsVoiceResponseEnabled] = useState(true)
  const pathname = usePathname()
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { 
    state: speechState,
    isSpeaking, isThinking,
    startListening, stopListening, isAwake, isHearing,
    micVolume, rawTranscription, forceSession,
    isListening: isStarted,
    speak, playAudio, error: speechError 
  } = useSpeechExchange({
    isVoiceResponseEnabled,
    onCommand: (cmd) => {
      console.log('[Assistant] Voice command received:', cmd)
      // Auto-open the panel if a command is received while closed
      setIsOpen(true)
      handleSend(cmd)
    },
    onWake: () => {
      setIsOpen(true)
      toast.success('Flow Awakened', { 
        id: 'voice-wake',
        icon: '✨',
        duration: 2000 
      })
    }
  })

  // Start listening globally as soon as the app loads
  useEffect(() => {
    startListening()
  }, [startListening])

  const toggleVoiceRecording = () => {
    // In hands-free mode, this button toggles the listening state entirely
    if (speechState !== 'idle' && speechState !== 'error') {
      stopListening()
    } else {
      startListening(true)
    }
  }

  // Sync local loading state with hook thinking state
  useEffect(() => {
    setIsLoading(isThinking)
  }, [isThinking])

  // Handle Send from transcription
  const handleSend = useCallback(async (overrideQuery?: string) => {
    const finalQuery = overrideQuery || query
    if (!finalQuery.trim() || isLoading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: finalQuery
    }

    setMessages(prev => [...prev, userMsg])
    if (!overrideQuery) setQuery('')
    setIsLoading(true)

    // OPTIMISTIC HUMAN BRIDGE: Instant humanoid hesitation to mask thinking
    if (isVoiceResponseEnabled) {
      const isComplex = finalQuery.length > 25
      const fillers = isComplex 
        ? ["/audio/think.mp3", "/audio/see.mp3"] 
        : ["/audio/hmm.mp3", "/audio/uh.mp3", "/audio/um.mp3"]
      
      const randomAudio = fillers[Math.floor(Math.random() * fillers.length)]
      // Using playAudio ensures the Acoustic Shield keeps the mic MUTED during the bridge
      playAudio(randomAudio)
    }

    try {
      const context = `User is currently viewing the ${pathname} page.`
      // Format history for the AI (last 10 turns)
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      
      // Pass voice settings and history to backend
      const response = await aiApi.askAgent(finalQuery, context, isVoiceResponseEnabled, undefined, history)
      
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.data.reply,
        action: response.data.action,
        execution_result: response.data.execution_result
      }

      setMessages(prev => [...prev, assistantMsg])
      
      // Voice Response: Handle Humanoid Expressions
      if (isVoiceResponseEnabled) {
        // MASKER: If AI clears throat or coughs, play the real audio before speaking
        if (assistantMsg.content.toLowerCase().includes('(clears throat)')) {
          new Audio('/audio/ahem.mp3').play().catch(() => {})
        } else if (assistantMsg.content.toLowerCase().includes('[coughs]')) {
          new Audio('/audio/cough.mp3').play().catch(() => {})
        }

        if (response.data.audio_url) {
          // DELAY FOR ASYNC: Wait 400ms to ensure the backend background thread
          // has finished writing the MP3 file to disk.
          setTimeout(() => {
            playAudio(`${SERVER_URL}${response.data.audio_url}`)
          }, 400)
        } else {
          speak(response.data.speech_text || response.data.reply)
        }
      }

      if (response.data.action && response.data.execution_result) {
        toast.success('Action complete', {
          description: response.data.execution_result,
          icon: <Sparkles className="w-4 h-4 text-emerald-500" />
        })
      }
    } catch (err: any) {
      toast.error('Agent failure', {
        description: err.response?.data?.error || 'Could not reach FlowAI'
      })
    } finally {
      setIsLoading(false)
    }
  }, [query, isLoading, pathname, isVoiceResponseEnabled, playAudio, speak])

  // Handle scrolling and errors
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (speechError) {
      toast.error('Voice Assistant Error', {
        description: speechError,
        icon: <MicOff className="w-4 h-4 text-red-500" />
      })
    }
  }, [speechError])

  const isFlowActive = speechState !== 'idle' && speechState !== 'error'

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none z-[99999] active-orb-layer">
      {/* Floating Action Button - Visible on all pages for voice feedback */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        drag
        dragMomentum={true}
        dragConstraints={{ left: -1000, right: 100, top: -1000, bottom: 100 }}
        dragElastic={0.6}
        dragTransition={{ bounceStiffness: 200, bounceDamping: 20 }}
        onClick={() => {
          if (!isAwake) {
            forceSession()
          } else {
            setIsOpen(true)
          }
        }}
        className={`fixed bottom-8 right-8 pointer-events-auto p-7 rounded-full shadow-[0_0_50px_rgba(0,0,0,0.3)] dark:shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/40 group overflow-hidden touch-none z-[9999] active:scale-95 ${
          speechError ? 'bg-red-500 shadow-red-500/40' :
          isLoading ? 'bg-amber-500 shadow-amber-500/40' : 
          isSpeaking ? 'bg-emerald-500 shadow-emerald-500/40' : 
          isAwake ? 'bg-rose-500 shadow-rose-500/60 ring-4 ring-white/30' : 
          'bg-gradient-to-br from-sky-400 via-indigo-500 to-purple-600 shadow-sky-500/40'
        }`}
      >
        {/* RAW VOLUME BAR - Visual hardware confirmation */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 overflow-hidden">
            <motion.div 
               animate={{ width: `${micVolume}%` }}
               className="h-full bg-white/60"
            />
        </div>

        {/* RAW TRANSCRIPTION OVERLAY (Debug Mode) */}
        {rawTranscription && (
          <div className="absolute bottom-full right-0 mb-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[10px] text-white/80 whitespace-nowrap border border-white/10 pointer-events-none shadow-lg">
             Hearing: "{rawTranscription}"
          </div>
        )}

        {/* WAKE HINT: If mic is blocked by browser, show a hint */}
        {!isStarted && !speechError && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-full right-0 mb-4 px-3 py-2 bg-sky-500 rounded-xl text-[11px] text-white font-semibold whitespace-nowrap shadow-xl shadow-sky-500/30"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3 h-3 animate-spin" />
              <span>Tap to Wake Flow</span>
            </div>
            {/* Pointer arrow */}
            <div className="absolute top-full right-6 -mt-1 border-8 border-transparent border-t-sky-500" />
          </motion.div>
        )}

        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
        
        {/* The Mist Orb - Multi-layered glowing gradients */}
        <div className="absolute inset-0 overflow-hidden rounded-full">
            <motion.div 
              animate={{ 
                rotate: 360,
                scale: [1, 1.1, 1],
              }}
              transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
              className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent,rgb(56,189,248),transparent,rgb(99,102,241),transparent)] opacity-70 blur-2xl"
            />
            <motion.div 
              animate={{ 
                rotate: -360,
                scale: [1, 1.4, 1],
              }}
              transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
              className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent,rgb(244,63,94),transparent,rgb(168,85,247),transparent)] opacity-50 blur-3xl"
            />
        </div>

        {/* State-aware inner pulse for the FAB */}
        {(speechState !== 'idle' || isLoading || isAwake || isHearing) && (
          <motion.div 
            animate={{ 
              scale: (isAwake || isHearing) ? [1, 1.6, 1] : [1, 1.3, 1], 
              opacity: (isAwake || isHearing) ? [0.6, 0.9, 0.6] : [0.2, 0.5, 0.2] 
            }}
            transition={{ repeat: Infinity, duration: (isAwake || isHearing) ? 1.5 : 3 }}
            className={`absolute inset-0 rounded-full blur-md ${(isAwake || isHearing) ? 'bg-white/40' : 'bg-white/20'}`}
          />
        )}
        
        {/* Core Glow */}
        <div className="absolute inset-2 bg-gradient-to-br from-white/40 to-white/10 rounded-full blur-sm z-20" />
      </motion.button>

      {/* Agent Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className={`fixed right-0 z-[70] bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 pointer-events-auto ${
              isMinimized ? 'bottom-6 right-6 h-14 w-80 rounded-2xl' : 'top-0 h-full w-full md:w-[400px]'
            }`}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="relative">
                  {/* Multi-layered Premium Pulse AI Indicator */}
                  <AnimatePresence>
                    {(speechState !== 'idle' || isSpeaking || isLoading) && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        {/* 1. Outer Echo Ring */}
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ 
                            scale: [1, 2.2], 
                            opacity: [0.5, 0] 
                          }}
                          transition={{ 
                            repeat: Infinity, 
                            duration: 2,
                            ease: "easeOut" 
                          }}
                          className={`absolute inset-0 rounded-lg ${
                            isLoading ? 'bg-amber-400' : isSpeaking ? 'bg-emerald-400' : speechState === 'listening' ? 'bg-rose-400' : 'bg-sky-400'
                          }`}
                        />
                        {/* 2. Middle Aura Ring */}
                        <motion.div 
                          animate={{ 
                            scale: [1, 1.6, 1], 
                            opacity: [0.3, 0.6, 0.3] 
                          }}
                          transition={{ 
                            repeat: Infinity, 
                            duration: 3,
                            ease: "easeInOut" 
                          }}
                          className={`absolute inset-0 rounded-lg blur-md ${
                            isLoading ? 'bg-amber-500' : isSpeaking ? 'bg-emerald-500' : speechState === 'listening' ? 'bg-rose-500' : 'bg-sky-500'
                          }`}
                        />
                        {/* 3. Core Pulse */}
                        <motion.div 
                          animate={{ 
                            scale: [1, 1.2, 1],
                          }}
                          transition={{ 
                            repeat: Infinity, 
                            duration: 1.5,
                            ease: "easeInOut" 
                          }}
                          className={`absolute inset-0 rounded-lg shadow-xl ${
                            isLoading ? 'bg-amber-500' : isSpeaking ? 'bg-emerald-500' : speechState === 'listening' ? 'bg-rose-500' : 'bg-sky-500'
                          }`}
                        />
                      </div>
                    )}
                  </AnimatePresence>
 
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-lg relative z-10 transition-colors duration-500 ${
                    speechError ? 'bg-red-500' :
                    isLoading ? 'bg-amber-500' : 
                    isSpeaking ? 'bg-emerald-500' : 
                    speechState === 'listening' ? 'bg-rose-500' : 
                    speechState === 'idle' ? 'bg-sky-500' : 
                    'bg-slate-400'
                  }`}>
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : speechError ? (
                      <MicOff className="w-5 h-5" />
                    ) : (
                      <Bot className={`w-5 h-5 ${isSpeaking ? 'animate-bounce' : ''}`} />
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">FlowAI Assistant</h3>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      speechError ? 'bg-red-500' :
                      speechState === 'listening' ? 'bg-rose-500 animate-pulse' : 
                      speechState === 'idle' ? 'bg-sky-500 animate-pulse' : 
                      isSpeaking ? 'bg-emerald-500 animate-pulse' : 
                      isLoading ? 'bg-amber-500 animate-spin' :
                      'bg-slate-300'
                    }`} />
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                      {speechError ? 'Mic Error' : 
                       speechState === 'listening' ? 'Hearing you...' : 
                       speechState === 'idle' ? 'Listening for Wake' : 
                       isSpeaking ? 'Flow is Speaking' : 
                       isLoading ? 'Thinking...' :
                       'Ready'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsVoiceResponseEnabled(!isVoiceResponseEnabled)}
                  className={`p-2 rounded-lg transition-colors ${isVoiceResponseEnabled ? 'text-sky-500 bg-sky-50 dark:bg-sky-900/20' : 'text-slate-400 hover:bg-slate-100'}`}
                  title={isVoiceResponseEnabled ? 'Disable Voice Response' : 'Enable Voice Response'}
                >
                  {isVoiceResponseEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button 
                  onClick={toggleVoiceRecording}
                  className={`p-2 rounded-lg transition-colors ${speechState === 'listening' ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20' : isFlowActive ? 'text-sky-500 bg-sky-50' : 'text-slate-400 hover:bg-slate-100'}`}
                  title={isFlowActive ? 'Stop Listening' : 'Start Always-Listening'}
                >
                  {speechState === 'listening' ? <Mic className="w-4 h-4 animate-pulse text-rose-500" /> : isFlowActive ? <Mic className="w-4 h-4 text-sky-500" /> : <Mic className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                >
                  {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-slate-400 hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Body */}
            {!isMinimized && (
              <>
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
                >
                  {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                      <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-sky-500">
                        <Sparkles className="w-8 h-8" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">How can I help you today?</p>
                        <p className="text-xs text-slate-400 mt-1">I can control the site, schedule sessions, create assignments, and more.</p>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2 w-full mt-4">
                        {[
                          { label: 'Schedule a session', icon: Calendar },
                          { label: 'Create new assignment', icon: ClipboardList },
                          { label: 'Summarize recent work', icon: BookOpen }
                        ].map((btn, i) => (
                          <button
                            key={i}
                            onClick={() => setQuery(btn.label)}
                            className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left transition-all group"
                          >
                            <btn.icon className="w-4 h-4 text-sky-500 group-hover:scale-110 transition-transform" />
                            <span className="text-xs text-slate-600 dark:text-slate-300">{btn.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === 'user' 
                          ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' 
                          : 'bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800'
                      }`}>
                        <ReactMarkdown className="prose prose-sm dark:prose-invert">
                          {msg.content}
                        </ReactMarkdown>
                        
                        {msg.execution_result && (
                          <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center gap-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Executed: {msg.execution_result}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-4 py-4 flex gap-1">
                        <motion.span 
                          animate={{ opacity: [0.4, 1, 0.4] }} 
                          transition={{ repeat: Infinity, duration: 1 }}
                          className="w-1.5 h-1.5 rounded-full bg-slate-400" 
                        />
                        <motion.span 
                          animate={{ opacity: [0.4, 1, 0.4] }} 
                          transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                          className="w-1.5 h-1.5 rounded-full bg-slate-400" 
                        />
                        <motion.span 
                          animate={{ opacity: [0.4, 1, 0.4] }} 
                          transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                          className="w-1.5 h-1.5 rounded-full bg-slate-400" 
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Input */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="relative flex items-end gap-2">
                    <textarea 
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSend()
                        }
                      }}
                      placeholder="Ask FlowAI to do something..."
                      className="w-full bg-white dark:bg-slate-800 rounded-xl px-4 py-2.5 text-sm border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none resize-none max-h-32 transition-all shadow-sm"
                      rows={1}
                    />
                    <button 
                      onClick={() => handleSend()}
                      disabled={isLoading || !query.trim()}
                      className="p-2.5 rounded-xl bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:grayscale transition-all shadow-lg shadow-sky-500/20"
                    >
                      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-center text-slate-400 mt-2">
                    Platform Agent Alpha • Controls Assignments, Planner & Workspace
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
