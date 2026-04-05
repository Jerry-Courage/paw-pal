'use client'

import React from 'react'
import { Sparkles, Cpu, MousePointer2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DigitalBlackboardProps {
  children: React.ReactNode
  onSolve?: () => void
  label?: string
  variant?: 'default' | 'mini'
}

export default function DigitalBlackboard({ 
  children, 
  onSolve, 
  label = 'Mathematical Logic',
  variant = 'default'
}: DigitalBlackboardProps) {
  const isMini = variant === 'mini'

  return (
    <div className={cn(
      "relative group/bb animate-in zoom-in-95 duration-500",
      isMini ? "my-4" : "my-12"
    )}>
      {/* Blueprint Grid Background */}
      <div className={cn(
        "absolute -inset-1 bg-primary/20 rounded-3xl blur opacity-20 group-hover/bb:opacity-30 transition-opacity",
        isMini ? "rounded-xl" : "rounded-[2.5rem]"
      )} />
      
      <div className={cn(
        "relative overflow-hidden bg-slate-950 border border-primary/30 shadow-2xl",
        isMini ? "rounded-xl p-4" : "rounded-[2.5rem] p-8 sm:p-12"
      )}>
        {/* The Digital Grid */}
        <div className="absolute inset-0 digital-grid opacity-20" />
        
        {/* Header HUD */}
        <div className="relative flex items-center justify-between mb-6 z-10">
          <div className="flex items-center gap-3">
            <div className={cn(
              "rounded-lg bg-primary/10 flex items-center justify-center text-primary",
              isMini ? "w-6 h-6" : "w-10 h-10"
            )}>
              <Cpu className={isMini ? "w-3 h-3" : "w-5 h-5"} />
            </div>
            <div>
              <div className="text-[8px] font-black text-primary/60 uppercase tracking-[0.3em] leading-none mb-1">Matrix v2.4</div>
              <h4 className={cn(
                "font-black text-white uppercase tracking-tighter",
                isMini ? "text-[10px]" : "text-sm"
              )}>{label}</h4>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex gap-1">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-1 h-1 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
            {onSolve && !isMini && (
              <button 
                onClick={onSolve}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
              >
                <Sparkles className="w-3 h-3" />
                Analyze Logic
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className={cn(
          "relative z-10 text-phosphor overflow-x-auto scrollbar-hide flex items-center justify-center",
          isMini ? "py-2 min-h-[60px]" : "py-4 min-h-[100px]"
        )}>
          <div className={cn(
            "transition-all duration-700 group-hover/bb:scale-[1.02]",
            isMini ? "" : "scale-110 sm:scale-125"
          )}>
            {children}
          </div>
        </div>

        {/* Scanline Effect */}
        <div className="absolute inset-x-0 h-12 bg-gradient-to-b from-transparent via-primary/5 to-transparent animate-scan pointer-events-none opacity-20" />
      </div>
    </div>
  )
}
