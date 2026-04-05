'use client'

import React from 'react'
import { HelpCircle, GitGraph, Music2, Brain, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolItem {
  id: string
  icon: any
  label: string
  color: string
}

interface MobileToolDockProps {
  onOpenQuiz: () => void
  onOpenMindmap: () => void
  onOpenMusic: () => void
  isGenerating?: string | null
  className?: string
}

export default function MobileToolDock({ 
  onOpenQuiz, 
  onOpenMindmap, 
  onOpenMusic,
  isGenerating,
  className 
}: MobileToolDockProps) {
  
  const tools: ToolItem[] = [
    { 
      id: 'quiz', 
      icon: HelpCircle, 
      label: 'Quiz', 
      color: 'bg-orange-500'
    },
    { 
      id: 'mindmap', 
      icon: GitGraph, 
      label: 'Mind Map', 
      color: 'bg-indigo-500'
    },
    { 
      id: 'music', 
      icon: Music2, 
      label: 'Music', 
      color: 'bg-emerald-500'
    },
  ]

  return (
    <div className={cn(
      "fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] lg:hidden",
      "flex items-center gap-2 p-2 rounded-3xl bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden",
      className
    )}>
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={tool.id === 'quiz' ? onOpenQuiz : tool.id === 'mindmap' ? onOpenMindmap : onOpenMusic}
          disabled={!!isGenerating}
          className={cn(
            "group flex flex-col items-center gap-1 min-w-[64px] py-1.5 rounded-2xl transition-all",
            isGenerating && isGenerating !== tool.id ? "opacity-30 pointer-events-none" : ""
          )}
        >
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg transition-transform active:scale-90",
            tool.color
          )}>
            {isGenerating === tool.id ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <tool.icon className="w-5 h-5" />
            )}
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-active:text-white transition-colors">
            {tool.label}
          </span>
        </button>
      ))}
      
      {/* Visual Separator */}
      <div className="w-px h-8 bg-white/5 mx-1" />
      
      {/* Brain Toggle (Example additional action) */}
      <button className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-indigo-400">
        <Brain className="w-5 h-5 animate-pulse" />
      </button>
    </div>
  )
}
