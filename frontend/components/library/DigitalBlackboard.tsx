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
        "relative overflow-hidden bg-white border border-slate-200 shadow-xl",
        isMini ? "rounded-xl p-4" : "rounded-[3rem] p-10 sm:p-14"
      )}>
        {/* Subtle Background Detail */}
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-40" />
        
        {/* Header HUD - Refined */}
        <div className="relative flex items-center justify-between mb-10 z-10">
          <div className="flex items-center gap-4">
            <div className={cn(
              "rounded-2xl bg-sky-50 flex items-center justify-center text-sky-500 shadow-sm border border-sky-100/50",
              isMini ? "w-8 h-8" : "w-12 h-12"
            )}>
              <Cpu className={isMini ? "w-4 h-4" : "w-6 h-6"} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">Logic Synthesis</div>
              <h4 className={cn(
                "font-black text-slate-900 uppercase tracking-tight",
                isMini ? "text-xs" : "text-lg"
              )}>{label}</h4>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {onSolve && !isMini && (
              <button 
                onClick={onSolve}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-slate-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-slate-200"
              >
                <Sparkles className="w-4 h-4" />
                Solve Step
              </button>
            )}
          </div>
        </div>

        {/* Content Area - Clean Academic */}
        <div className={cn(
          "relative z-10 text-slate-800 overflow-x-auto scrollbar-hide flex items-center justify-center font-medium",
          isMini ? "py-4 min-h-[80px]" : "py-8 min-h-[140px]"
        )}>
          <div className={cn(
            "transition-all duration-700 group-hover/bb:scale-[1.02]",
            isMini ? "" : "scale-110 sm:scale-125"
          )}>
            {children}
          </div>
        </div>

        {/* Decorative corner accent */}
        <div className="absolute bottom-0 right-0 p-4 opacity-5 pointer-events-none">
          <Cpu className="w-24 h-24 text-slate-900" />
        </div>
      </div>
    </div>
  )
}
