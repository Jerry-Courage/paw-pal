'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Brain } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true)

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] bg-[#0d0d0d] flex flex-col items-center justify-center overflow-hidden"
        >
          {/* Background Ambient Glows */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] bg-orange-500/5 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] bg-violet-500/5 rounded-full blur-[80px] pointer-events-none" />

          {/* Logo Animation */}
          <div className="relative mb-12">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="relative z-10 w-32 h-32 bg-orange-500/5 border border-orange-500/10 rounded-[3rem] flex items-center justify-center shadow-2xl overflow-hidden p-2"
            >
              <img src="/images/logo-icon.png" alt="Flow State" className="w-full h-full object-contain scale-110" />
              
              {/* Pulsing Aura */}
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 bg-orange-500 rounded-[2.5rem] blur-xl -z-10"
              />
            </motion.div>

            {/* Particle Rings */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ 
                  opacity: [0, 0.2, 0], 
                  scale: [1, 2],
                  rotate: i * 120
                }}
                transition={{ 
                  duration: 3, 
                  repeat: Infinity, 
                  delay: i * 1,
                  ease: 'linear'
                }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-orange-500/30 rounded-full"
              />
            ))}
          </div>

          {/* Text & Loading */}
          <div className="text-center relative z-10">
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-2xl font-black text-white tracking-widest uppercase mb-4"
            >
              Flow State
            </motion.h1>
            
            <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden mx-auto">
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 2.5, ease: 'easeInOut' }}
                className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
              />
            </div>
            
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.6 }}
              className="mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]"
            >
              Initializing Intelligence
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
