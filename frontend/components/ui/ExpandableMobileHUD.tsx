'use client'

import React, { useState } from 'react'
import { 
  X, Brain, HelpCircle, GitGraph, Wand2, 
  BookOpen, Music2, Headphones, Sparkles, Radio, Mic2,
  Loader2, MessageSquare, ChevronRight, Edit3,
  Calculator
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolItem {
  id: string
  icon: any
  label: string
  color: string
  desc: string
}

interface ExpandableMobileHUDProps {
  onOpenQuiz: () => void
  onOpenMindmap: () => void
  onOpenMusic: () => void
  onOpenFlashcards: () => void
  onOpenPractice: () => void
  onOpenPodcast: () => void
  onOpenChat: () => void
  onOpenMath: () => void
  onEdit?: () => void
  isGenerating?: string | null
  className?: string
}

export default function ExpandableMobileHUD({ 
  onOpenQuiz, 
  onOpenMindmap, 
  onOpenMusic,
  onOpenFlashcards,
  onOpenPractice,
  onOpenPodcast,
  onOpenChat,
  onOpenMath,
  onEdit,
  isGenerating,
  className 
}: ExpandableMobileHUDProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  const tools: ToolItem[] = [
    ...(onEdit ? [{
      id: 'edit',
      icon: Edit3,
      label: 'Edit Material',
      desc: 'Modify Notes',
      color: 'bg-slate-700'
    }] : []),
    { 
      id: 'quiz', 
      icon: HelpCircle, 
      label: 'Quiz', 
      desc: 'Mastery MCQ',
      color: 'bg-orange-500'
    },
    { 
      id: 'podcast', 
      icon: Radio, 
      label: 'Podcast', 
      desc: 'FlowCast AI',
      color: 'bg-pink-500'
    },
    { 
      id: 'flashcards', 
      icon: BookOpen, 
      label: 'Flashcards', 
      desc: 'Recall Boost',
      color: 'bg-sky-500'
    },
    { 
      id: 'mindmap', 
      icon: GitGraph, 
      label: 'Mind Map', 
      desc: 'Visual Flow',
      color: 'bg-indigo-500'
    },
    { 
      id: 'practice', 
      icon: Wand2, 
      label: 'Practice', 
      desc: 'AI Grading',
      color: 'bg-emerald-500'
    },
    {
      id: 'math',
      icon: Calculator,
      label: 'Math Solver',
      desc: 'Step-by-Step',
      color: 'bg-emerald-600'
    },
    { 
      id: 'music', 
      icon: Music2, 
      label: 'Music', 
      desc: 'Focus Audio',
      color: 'bg-indigo-400'
    },
  ]

  const handleToolClick = (toolId: string, action: () => void) => {
    setIsOpen(false)
    action()
  }

  return (
    <div className={cn("fixed bottom-24 right-6 z-[120] lg:hidden", className)}>
      {/* Global Loading Overlay (Pops over the whole screen) */}
      {isGenerating && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-2xl animate-in fade-in duration-500">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-3xl animate-pulse rounded-full" />
            <div className="relative w-24 h-24 bg-gradient-to-br from-primary to-violet-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-primary/40 animate-bounce">
              <Sparkles className="w-12 h-12 text-white animate-pulse" />
            </div>
          </div>
          <div className="mt-8 text-center space-y-2">
            <h3 className="text-xl font-black text-white uppercase tracking-tighter">FlowAI is Thinking...</h3>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest animate-pulse">Generating your {isGenerating} kit</p>
          </div>
          <div className="absolute bottom-12 flex flex-col items-center gap-4">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl animate-in fade-in duration-300 pointer-events-auto"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Tools Container */}
      {isOpen && (
        <div className="absolute bottom-20 right-0 w-[85vw] max-w-sm flex flex-col gap-4 animate-in slide-in-from-bottom-10 zoom-in-95 duration-300">
          
          {/* Header Action - Chat */}
          <button
            onClick={() => handleToolClick('chat', onOpenChat)}
            className="flex items-center justify-between p-4 rounded-3xl bg-primary text-white shadow-2xl shadow-primary/30"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 fill-current" />
              </div>
              <div className="text-left">
                <div className="font-black text-sm uppercase tracking-tight">Ask FlowAI</div>
                <div className="text-[10px] opacity-70 font-bold">Document Brain Assistant</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 opacity-40" />
          </button>

          {/* Tools Grid */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-white/10 shadow-2xl overflow-hidden">
            {tools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => handleToolClick(tool.id, (
                  tool.id === 'edit' ? onEdit! :
                  tool.id === 'quiz' ? onOpenQuiz : 
                  tool.id === 'flashcards' ? onOpenFlashcards :
                  tool.id === 'mindmap' ? onOpenMindmap :
                  tool.id === 'math' ? onOpenMath :
                  tool.id === 'practice' ? onOpenPractice :
                  tool.id === 'podcast' ? onOpenPodcast : onOpenMusic
                ))}
                disabled={!!isGenerating}
                className={cn(
                  "relative group flex flex-col p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-left transition-all active:scale-95",
                  isGenerating === tool.id ? "ring-2 ring-primary border-transparent" : "",
                  isGenerating && isGenerating !== tool.id ? "opacity-40" : ""
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg",
                    tool.color
                  )}>
                    {isGenerating === tool.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <tool.icon className="w-4.5 h-4.5" />
                    )}
                  </div>
                </div>
                <div className="font-black text-[11px] text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-1">
                  {tool.label}
                </div>
                <div className="text-[9px] text-slate-500 font-bold opacity-60">
                  {tool.desc}
                </div>
              </button>
            ))}
          </div>

          <div className="text-center px-4 py-2">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest opacity-40">FlowState Intelligent Study HUD</p>
          </div>
        </div>
      )}

      {/* Main Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90",
          isOpen 
            ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rotate-90" 
            : "bg-primary text-white"
        )}
      >
        {isOpen ? <X className="w-7 h-7" /> : <Brain className="w-8 h-8 group-hover:animate-pulse" />}
      </button>
    </div>
  )
}
