'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Volume2, ShieldCheck, Zap } from 'lucide-react'
import { useGeminiLive } from '@/hooks/useGeminiLive'

interface LiveVoiceAssistantProps {
  onClose: () => void
}

export default function LiveVoiceAssistant({ 
  onClose 
}: LiveVoiceAssistantProps) {
  const { 
    isActive, 
    isConnecting, 
    error, 
    startSession, 
    stopSession 
  } = useGeminiLive()

  // Auto-ignite session on mount
  React.useEffect(() => {
    startSession()
    return () => {
      stopSession()
    }
  }, [startSession, stopSession])

  const handleClose = () => {
    stopSession()
    onClose()
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-sm overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">Gemini 2 Flash Live</h2>
          </div>
          <button 
            onClick={handleClose}
            className="p-2 transition-colors rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Core Content */}
        <div className="flex flex-col items-center justify-center p-8 space-y-8 text-center">
          {/* Pulsing Visualizer - Central Orb */}
          <div className="relative">
            <motion.div
              animate={{
                scale: isActive ? [1, 1.2, 1] : 1,
                opacity: isActive ? [0.3, 0.6, 0.3] : 0.2
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute inset-0 bg-blue-500 rounded-full blur-3xl opacity-20"
            />
            <div className="relative flex items-center justify-center w-32 h-32 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full shadow-lg shadow-blue-500/20">
              <Volume2 className={`text-white transition-all duration-300 ${isActive ? 'scale-110 opacity-100' : 'scale-90 opacity-50'}`} size={48} />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {isConnecting ? 'Establishing Link...' : 'Signal Active'}
            </h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-[240px] mx-auto">
              {isConnecting 
                ? 'Syncing with the Imperial neural net...' 
                : isActive 
                  ? 'Andrew is listening. Speak naturally—no lag, just flow.' 
                  : 'Waiting for signal...'}
            </p>
            {error && (
              <p className="text-xs font-bold text-rose-500 bg-rose-500/10 px-4 py-2 rounded-2xl border border-rose-500/20">
                {error}
              </p>
            )}
          </div>

          {/* Status Metrics */}
          <div className="grid grid-cols-2 gap-4 w-full">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col items-center gap-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Latency</span>
              <div className="flex items-center gap-1 text-emerald-500 font-black">
                <Zap size={12} />
                <span className="text-sm">~2ms</span>
              </div>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col items-center gap-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Protocol</span>
              <div className="flex items-center gap-1 text-blue-500 font-black">
                <ShieldCheck size={12} />
                <span className="text-sm uppercase">Direct</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-2xl transition-all shadow-xl active:scale-[0.98] hover:shadow-black/5"
          >
            Stop Live Session
          </button>
        </div>

        {/* Footer Detail */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
            Secure Native Bridge
          </div>
          <Zap size={14} className="text-blue-500 animate-pulse" />
        </div>
      </motion.div>
    </motion.div>
  )
}
