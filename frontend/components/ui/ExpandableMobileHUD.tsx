'use client'

import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X, Brain, HelpCircle, GitGraph, Wand2,
  BookOpen, Music2, Sparkles, Radio,
  Loader2, MessageSquare, ChevronRight, Edit3,
  Calculator, Layers, ChevronUp
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface ToolItem {
  id: string
  icon: any
  label: string
  color: string
  desc: string
  href?: string
}

interface ExpandableMobileHUDProps {
  resourceId?: number
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
  resourceId,
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
  className,
}: ExpandableMobileHUDProps) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  const tools: ToolItem[] = [
    ...(onEdit ? [{ id: 'edit', icon: Edit3, label: 'Edit Notes', desc: 'Modify content', color: 'bg-slate-600' }] : []),
    { id: 'quiz',       icon: HelpCircle, label: 'Quiz',        desc: 'Mastery MCQ',    color: 'bg-orange-500', href: resourceId ? `/library/${resourceId}/quiz`       : undefined },
    { id: 'flashcards', icon: Layers,     label: 'Flashcards',  desc: 'Recall boost',   color: 'bg-sky-500',    href: resourceId ? `/library/${resourceId}/flashcards` : undefined },
    { id: 'podcast',    icon: Radio,      label: 'Podcast',     desc: 'AI conversation',color: 'bg-pink-500',   href: resourceId ? `/library/${resourceId}/podcast`    : undefined },
    { id: 'mindmap',    icon: GitGraph,   label: 'Mind Map',    desc: 'Visual flow',    color: 'bg-indigo-500', href: resourceId ? `/library/${resourceId}/mindmap`    : undefined },
    { id: 'practice',   icon: Wand2,      label: 'Written Test',desc: 'AI grading',     color: 'bg-emerald-500',href: resourceId ? `/library/${resourceId}/practice`   : undefined },
    { id: 'examprep',   icon: Brain,      label: 'Exam Prep',   desc: 'Feynman + exam', color: 'bg-violet-500', href: resourceId ? `/library/${resourceId}/examprep`   : undefined },
    { id: 'math',       icon: Calculator, label: 'Math Solver', desc: 'Step-by-step',   color: 'bg-teal-500',   href: resourceId ? `/library/${resourceId}/solver`     : undefined },
    { id: 'music',      icon: Music2,     label: 'Focus Music', desc: 'Study audio',    color: 'bg-purple-500' },
  ]

  const handleToolClick = (tool: ToolItem) => {
    setIsOpen(false)
    if (tool.href) { router.push(tool.href); return }
    const actions: Record<string, () => void> = {
      edit: onEdit!,
      quiz: onOpenQuiz,
      flashcards: onOpenFlashcards,
      mindmap: onOpenMindmap,
      math: onOpenMath,
      practice: onOpenPractice,
      podcast: onOpenPodcast,
      music: onOpenMusic,
    }
    actions[tool.id]?.()
  }

  return (
    <>
      {/* Loading overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0d0d0d]/90 backdrop-blur-xl">
          <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-orange-400 animate-pulse" />
          </div>
          <p className="text-white font-black text-base">FlowAI is thinking...</p>
          <p className="text-slate-500 text-xs mt-1 uppercase tracking-widest font-medium">Generating {isGenerating}</p>
          <div className="flex gap-1.5 mt-4">
            {[0,1,2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom sheet trigger pill — always visible at bottom ── */}
      <div className={cn('fixed bottom-20 left-0 right-0 flex justify-center z-[120] lg:hidden pointer-events-none', className)}>
        <button
          onClick={() => setIsOpen(true)}
          className="pointer-events-auto flex items-center gap-2.5 px-5 py-3 rounded-full bg-[#1a1a1a] border border-white/10 shadow-2xl shadow-black/60 active:scale-95 transition-all"
        >
          <div className="flex -space-x-1.5">
            {tools.slice(0, 4).map(t => (
              <div key={t.id} className={cn('w-5 h-5 rounded-full border-2 border-[#1a1a1a] flex items-center justify-center', t.color)}>
                <t.icon className="w-2.5 h-2.5 text-white" />
              </div>
            ))}
          </div>
          <span className="text-xs font-black text-white">Study Tools</span>
          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* ── Bottom sheet ── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[125] lg:hidden bg-black/70 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[130] lg:hidden bg-[#111] rounded-t-3xl border-t border-white/8 shadow-2xl"
              style={{ maxHeight: '80vh' }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-black text-white">Study Tools</p>
                  <p className="text-[10px] text-slate-500">Choose a tool to open</p>
                </div>
                <button onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* Ask FlowAI */}
              <div className="px-4 pb-3">
                <button
                  onClick={() => { setIsOpen(false); onOpenChat() }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-orange-500 text-white active:scale-[0.98] transition-all"
                >
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-black">Ask FlowAI</p>
                    <p className="text-[10px] opacity-70">Chat about this material</p>
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-60" />
                </button>
              </div>

              {/* Tools list */}
              <div className="overflow-y-auto px-4 pb-8" style={{ maxHeight: 'calc(80vh - 180px)' }}>
                <div className="grid grid-cols-2 gap-2.5">
                  {tools.map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => handleToolClick(tool)}
                      disabled={!!isGenerating}
                      className={cn(
                        'flex items-center gap-3 p-3.5 rounded-2xl bg-[#1a1a1a] border border-white/5 text-left active:scale-[0.97] transition-all',
                        isGenerating && isGenerating !== tool.id ? 'opacity-40' : ''
                      )}
                    >
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', tool.color)}>
                        {isGenerating === tool.id
                          ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                          : <tool.icon className="w-4 h-4 text-white" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-white truncate">{tool.label}</p>
                        <p className="text-[10px] text-slate-500 truncate">{tool.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
