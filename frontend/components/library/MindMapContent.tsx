'use client'

import React, { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Sparkles, Brain, Cpu, Database, Network } from 'lucide-react'

interface MindMapContentProps {
  data: {
    center: string
    branches: {
      topic: string
      subtopics: string[]
    }[]
  }
}

export default function MindMapContent({ data }: MindMapContentProps) {
  const branchColors = [
    'text-violet-500 border-violet-500/30 bg-violet-500/5',
    'text-emerald-500 border-emerald-500/30 bg-emerald-500/5',
    'text-amber-500 border-amber-500/30 bg-amber-500/5',
    'text-sky-500 border-sky-500/30 bg-sky-500/5',
    'text-rose-500 border-rose-500/30 bg-rose-500/5',
    'text-indigo-500 border-indigo-500/30 bg-indigo-500/5',
  ]

  const branchIcons = [Cpu, Network, Database, Brain]

  return (
    <div className="relative w-full max-w-7xl mx-auto py-12 px-4 sm:px-10">
      {/* Central Hub */}
      <div className="flex justify-center mb-16 sm:mb-24 relative z-20">
        <div className="group relative">
          <div className="absolute -inset-4 bg-primary/20 rounded-[3rem] blur-xl opacity-40 group-hover:opacity-60 transition-opacity animate-pulse" />
          <div className="relative px-10 py-6 bg-slate-900 border-2 border-primary rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-2 transform hover:scale-105 transition-transform duration-500 cursor-default">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/40 -mt-12 group-hover:rotate-12 transition-transform">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="text-[10px] font-black text-primary/60 uppercase tracking-[0.4em] mb-1">Central Matrix</div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tighter text-center uppercase">
              {data.center}
            </h1>
          </div>
        </div>
      </div>

      {/* Connection Paths (Background SVG) */}
      <div className="absolute inset-x-0 top-[150px] bottom-0 pointer-events-none z-0 overflow-hidden hidden lg:block">
        <svg Title="Neural Paths" width="100%" height="100%" className="opacity-20 dark:opacity-40">
           {/* Dynamic paths could be added here if we had coordinates, but let's use CSS for simplicity for now */}
        </svg>
      </div>

      {/* Main Branches */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-16 relative z-10 justify-items-center">
        {data.branches?.map((branch, i) => {
          const ColorClass = branchColors[i % branchColors.length]
          const Icon = branchIcons[i % branchIcons.length]
          
          return (
            <div key={i} className="w-full max-w-sm group/branch animate-in slide-in-from-bottom-8 duration-700" style={{ animationDelay: `${i * 100}ms` }}>
              {/* Branch Header */}
              <div className="relative mb-6">
                {/* Connecting Line (Vertical) */}
                <div className="absolute -top-16 left-1/2 w-[2px] h-16 bg-gradient-to-b from-transparent to-primary/30 hidden lg:block" />
                
                <div className={cn(
                  "p-5 rounded-[2rem] border-2 shadow-lg transition-all duration-500 hover:shadow-xl relative overflow-hidden bg-white dark:bg-slate-900",
                  ColorClass
                )}>
                  {/* Neon Glow Corner */}
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                  
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-current/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[8px] font-black uppercase tracking-[0.2em] opacity-60 mb-0.5">Focus Branch</div>
                      <h3 className="font-black text-sm uppercase tracking-tight truncate leading-none">
                        {branch.topic}
                      </h3>
                    </div>
                  </div>
                </div>
              </div>

              {/* Concept Node List */}
              <div className="space-y-3 pl-8 relative">
                {/* Side Connector Path */}
                <div className="absolute left-4 top-0 bottom-4 w-[2px] bg-gradient-to-b from-slate-100 to-transparent dark:from-slate-800" />
                
                {branch.subtopics?.map((sub, j) => (
                  <div 
                    key={j} 
                    className="group/sub relative pl-6 animate-in slide-in-from-left-4 duration-500"
                    style={{ animationDelay: `${(i * 100) + (j * 50)}ms` }}
                  >
                    {/* Horizontal Connector Arm */}
                    <div className="absolute left-[-16px] top-4 w-4 h-[2px] bg-slate-100 dark:bg-slate-800 group-hover/sub:bg-primary/40 transition-colors" />
                    
                    <div className="px-4 py-3 bg-white dark:bg-slate-800/40 backdrop-blur-xl border border-slate-100 dark:border-slate-800 rounded-2xl text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 shadow-sm hover:shadow-md hover:border-primary/20 transition-all transform hover:translate-x-1 cursor-default">
                      {sub}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
