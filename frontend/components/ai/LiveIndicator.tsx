'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'

interface LiveIndicatorProps {
  isListening: boolean
  onClick: () => void
}

export default function LiveIndicator({ isListening, onClick }: LiveIndicatorProps) {
  return (
    <motion.button
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 group flex items-center gap-3 bg-white/10 dark:bg-slate-900/40 backdrop-blur-xl border border-white/20 dark:border-slate-800/60 p-2 pr-4 rounded-full shadow-2xl active:scale-95 transition-all"
    >
      <div className="relative">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
          <Zap className="w-5 h-5 text-white" />
        </div>
        
        {isListening && (
          <motion.div 
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute inset-0 bg-primary rounded-full -z-10"
          />
        )}
      </div>

      <div className="flex flex-col items-start leading-none gap-1">
        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          Live Bridge
        </span>
        <span className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
          {isListening ? 'Flow is Ready' : 'Connecting...'}
        </span>
      </div>
    </motion.button>
  )
}
