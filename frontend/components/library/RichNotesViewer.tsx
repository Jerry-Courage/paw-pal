'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { API_BASE, libraryApi } from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  X, Maximize2, Sparkles, Flame, ChevronLeft, ChevronRight, 
  CheckCircle2, Lock, BookOpen, Layers, Award, Eye, FileText
} from 'lucide-react'

interface RichNotesViewerProps {
  notes: any
  isEditing: boolean
  setIsEditing: (v: boolean) => void
  isMathMode?: boolean
  onSave: (notes: any) => void
  onOpenMath?: (prob: string) => void
  resourceId?: number
}

const ACCENT = [
  'text-blue-400 border-blue-400/30 bg-blue-500/5',
  'text-violet-400 border-violet-400/30 bg-violet-500/5',
  'text-emerald-400 border-emerald-400/30 bg-emerald-500/5',
  'text-orange-400 border-orange-400/30 bg-orange-500/5',
  'text-pink-400 border-pink-400/30 bg-pink-500/5',
  'text-cyan-400 border-cyan-400/30 bg-cyan-500/5',
  'text-fuchsia-400 border-fuchsia-400/30 bg-fuchsia-500/5',
  'text-lime-400 border-lime-400/30 bg-lime-500/5',
]

export default function RichNotesViewer({
  notes,
  isEditing,
  setIsEditing,
  isMathMode,
  onSave,
  onOpenMath,
  resourceId,
}: RichNotesViewerProps) {
  const queryClient = useQueryClient()
  const completeStepMutation = useMutation({
    mutationFn: (step: string) => libraryApi.completeStep(resourceId!, step, 100),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      queryClient.invalidateQueries({ queryKey: ['progress', resourceId] })
    }
  })

  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [currentPart, setCurrentPart] = useState(0)
  const [viewMode, setViewMode] = useState<'study' | 'scroll'>('study')
  const [celebration, setCelebration] = useState<{ title: string; subtext: string; xp: number } | null>(null)
  const [completedAll, setCompletedAll] = useState(false)
  const [showStreakBadge, setShowStreakBadge] = useState(false)
  const [showNextStepPrompt, setShowNextStepPrompt] = useState(false)
  const [unlockedProgress, setUnlockedProgress] = useState(0) // tracks furthest step read

  const contentRef = useRef<HTMLDivElement>(null)
  const sections = notes?.sections || []
  const totalParts = sections.length
  const progressPercent = totalParts > 0 ? ((unlockedProgress + 1) / totalParts) * 100 : 0
  const isLastPart = currentPart >= totalParts - 1

  useEffect(() => {
    if (!celebration) return
    const timer = window.setTimeout(() => setCelebration(null), 3000)
    return () => window.clearTimeout(timer)
  }, [celebration])

  useEffect(() => {
    if (contentRef.current && viewMode === 'study') {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [currentPart, viewMode])

  if (!notes) return null

  const cleanTitle = (t: string) =>
    (t || '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/, '').trim()

  const cleanContent = (text: string) => {
    if (!text) return ''
    return text
      .replace(/ACTION:\s*\{.*?\}/gi, '')
      .replace(/\\n\\n/g, '\n\n')
      .replace(/\\n/g, '\n')
      .replace(/\*\*(Key Question:|Memory Trick:|Quick Summary:|Deep Dive:)\*\*/g, '\n\n**$1**')
      .trim()
  }

  const normalizeMath = (text: string) => {
    if (!text) return ''
    return text
      .replace(/\\\[([\s\S]*?)\\\]/g, (_: string, m: string) => `\n$$\n${m.trim()}\n$$\n`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_: string, m: string) => `$${m.trim()}$`)
      .replace(/(?<=:\s{0,3})((?:[A-Za-z]\s*[=<>≤≥±∓×÷∑∏∫√∞∂∇][^.\n]{2,60}))/g, (_: string, m: string) => `$${m.trim()}$`)
  }

  const resolveUrl = (url: string) => {
    if (!url) return ''
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) return url
    const base = API_BASE?.replace(/\/api\/?$/, '')?.replace(/\/$/, '') || ''
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`
  }

  const handlePrevious = () => {
    if (currentPart === 0) return
    setCurrentPart(Math.max(currentPart - 1, 0))
    setCelebration(null)
  }

  const handleAdvance = () => {
    if (isLastPart) {
      setCompletedAll(true)
      setShowStreakBadge(true)
      setShowNextStepPrompt(true)
      setCelebration({
        title: 'Mastery Achieved!',
        subtext: 'You finished every part of this study kit. Streak Badge unlocked!',
        xp: 50,
      })
      if (resourceId) {
        completeStepMutation.mutate('notes')
      }
      return
    }

    const nextPart = currentPart + 1
    setCurrentPart(nextPart)
    if (nextPart > unlockedProgress) {
      setUnlockedProgress(nextPart)
      setCelebration({
        title: 'Part complete!',
        subtext: `You earned 25 XP for completing part ${currentPart + 1}.`,
        xp: 25,
      })
    }
  }

  const handleStepClick = (idx: number) => {
    if (idx <= unlockedProgress) {
      setCurrentPart(idx)
    }
  }

  return (
    <div className="w-full px-3 py-4 sm:px-6 md:px-8 sm:py-8 text-[#e2e2e2] max-w-7xl mx-auto">
      
      {/* ── Header / Controls ─────────────────────────────────── */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/[0.06] pb-5 sm:pb-6">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-500/10 text-orange-400 mb-2 border border-orange-500/20">
            <Sparkles className="w-3 h-3" />
            {isMathMode ? 'Logical Derivation' : 'Study Notes'}
          </span>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white leading-snug tracking-tight">
            {notes.overview?.title || 'Study Material'}
          </h1>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center self-start md:self-center bg-[#121214] border border-white/5 p-1 rounded-2xl">
          <button
            onClick={() => setViewMode('study')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
              viewMode === 'study' ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white"
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            Study Mode
          </button>
          <button
            onClick={() => setViewMode('scroll')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
              viewMode === 'scroll' ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white"
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            Scroll Mode
          </button>
        </div>
      </div>

      {/* ── Study Mode Layout (Interactive Pages) ────────────── */}
      {viewMode === 'study' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Mobile Horizontal Progress Scroller */}
          <div className="lg:hidden w-full overflow-x-auto scrollbar-hide py-1 mb-2">
            <div className="flex items-center gap-2.5 min-w-max px-1">
              {sections.map((sec: any, idx: number) => {
                const isCompleted = idx < currentPart
                const isActive = idx === currentPart
                const isLocked = idx > unlockedProgress
                
                return (
                  <button
                    key={idx}
                    onClick={() => handleStepClick(idx)}
                    disabled={isLocked}
                    className={cn(
                      "flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border transition-all text-xs font-black uppercase tracking-wider",
                      isActive 
                        ? "bg-orange-500 text-black border-orange-400 font-extrabold shadow-lg shadow-orange-500/20" 
                        : isCompleted
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : isLocked
                            ? "bg-[#121214] border-white/5 text-zinc-600 cursor-not-allowed opacity-50"
                            : "bg-[#18181c] border-white/10 text-zinc-300 hover:bg-zinc-800"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : isLocked ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                    )}
                    Part {idx + 1}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Desktop Table of Contents Sidebar */}
          <div className="hidden lg:block lg:col-span-3 sticky top-24 bg-[#121214]/60 border border-white/5 p-5 rounded-[2rem] backdrop-blur-2xl">
            <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500 mb-4 px-2">Table of Contents</h3>
            <div className="space-y-2">
              {sections.map((sec: any, idx: number) => {
                const isCompleted = idx < currentPart
                const isActive = idx === currentPart
                const isLocked = idx > unlockedProgress
                const accentClass = ACCENT[idx % ACCENT.length]
                const accentText = accentClass.split(' ')[0]

                return (
                  <button
                    key={idx}
                    disabled={isLocked}
                    onClick={() => handleStepClick(idx)}
                    className={cn(
                      "w-full text-left flex items-start gap-3 p-3 rounded-2xl border transition-all group",
                      isActive 
                        ? "bg-[#1d1d22] border-white/10 text-white" 
                        : isLocked
                          ? "bg-transparent border-transparent text-zinc-600 cursor-not-allowed opacity-40"
                          : "bg-transparent border-transparent text-zinc-400 hover:bg-[#18181c] hover:text-white"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : isLocked ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center border-orange-500/50", isActive && "border-orange-500 animate-pulse")}>
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[9px] font-black tracking-widest uppercase text-zinc-500">Part {idx + 1}</span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                      </div>
                      <p className="text-xs font-bold truncate leading-relaxed mt-0.5">
                        {cleanTitle(sec.title)}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Active Canvas Column */}
          <div className="lg:col-span-9" ref={contentRef}>
            <AnimatePresence mode="wait">
              {sections.map((section: any, idx: number) => {
                if (idx !== currentPart) return null
                const accentClass = ACCENT[idx % ACCENT.length]
                const accentText  = accentClass.split(' ')[0]
                const accentBorder = accentClass.split(' ')[1]
                const accentBg = accentClass.split(' ')[2]
                const images: any[] = section.images || []

                // Custom markdown component overrides scoped to the current active accent
                const md: any = {
                  table: ({ children }: any) => (
                    <div className="my-5 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#121214]/40">
                      <table className="min-w-full border-collapse text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }: any) => <thead className="bg-white/[0.03] text-slate-400 border-b border-white/[0.08]">{children}</thead>,
                  th: ({ children }: any) => (
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-zinc-400">{children}</th>
                  ),
                  td: ({ children }: any) => (
                    <td className="px-4 py-3.5 text-sm text-zinc-300 border-b border-white/[0.04] leading-relaxed">{children}</td>
                  ),
                  tr: ({ children }: any) => <tr className="hover:bg-white/[0.01] transition-all">{children}</tr>,

                  h1: ({ children }: any) => (
                    <h2 className="text-lg sm:text-xl font-black text-white mt-8 mb-4 tracking-tight">{children}</h2>
                  ),
                  h2: ({ children }: any) => (
                    <h3 className="text-md sm:text-lg font-black text-white mt-7 mb-3 tracking-tight">{children}</h3>
                  ),
                  p: ({ children }: any) => (
                    <p className="mb-4 text-sm sm:text-base leading-relaxed sm:leading-[1.85] text-zinc-300 last:mb-0">{children}</p>
                  ),
                  strong: ({ children }: any) => {
                    const text = String(children || '')
                    const isLabel = ['Key Question:', 'Deep Dive:', 'Memory Trick:', 'Quick Summary:'].some(l =>
                      text.trim().startsWith(l)
                    )
                    if (isLabel) {
                      return (
                        <span className={cn('block text-[11px] font-black uppercase tracking-wider mb-2 mt-5 first:mt-0', accentText)}>
                          {text}
                        </span>
                      )
                    }
                    return <strong className={cn('font-bold', accentText)}>{children}</strong>
                  },
                  blockquote: ({ children }: any) => (
                    <blockquote className={cn('my-6 p-4 rounded-2xl border bg-white/[0.02] backdrop-blur-xl shadow-lg relative overflow-hidden', accentBorder)}>
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-400 to-amber-500" />
                      <div className="text-sm sm:text-base text-zinc-300 italic leading-relaxed flex gap-3.5">
                        <Sparkles className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                        <div>{children}</div>
                      </div>
                    </blockquote>
                  ),
                  ul: ({ children }: any) => <ul className="mb-5 space-y-2.5 pl-1">{children}</ul>,
                  ol: ({ children }: any) => <ol className="mb-5 space-y-2.5 pl-1 list-none">{children}</ol>,
                  li: ({ children }: any) => (
                    <li className="flex gap-3 text-sm sm:text-base text-zinc-300 leading-relaxed">
                      <span className={cn('mt-[0.65em] w-1.5 h-1.5 rounded-full shrink-0 opacity-80', accentText.replace('text-', 'bg-'))} />
                      <span className="flex-1">{children}</span>
                    </li>
                  ),
                  a: ({ children, href }: any) => (
                    <a
                      href={href}
                      className={cn('underline underline-offset-4 font-bold transition-opacity hover:opacity-70', accentText)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  ),
                  hr: () => <div className="my-6 h-px bg-white/[0.06]" />,
                  code: ({ node, inline, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '')
                    const content = Array.isArray(children) ? children.join('') : String(children || '')
                    const cleanedCode = content.replace(/\n$/, '')
                    const isMathBlock =
                      match?.[1] === 'math' ||
                      (!inline && (cleanedCode.includes('\\') || cleanedCode.includes('_') || cleanedCode.includes('^')))

                    if (isMathBlock) {
                      return (
                        <div className="my-6 py-5 px-4 bg-black/40 rounded-2xl border border-white/[0.06] overflow-x-auto scrollbar-hide">
                          <div
                            className="text-sm sm:text-base min-w-max mx-auto text-center"
                            dangerouslySetInnerHTML={{
                              __html: katex.renderToString(cleanedCode.replace(/\\\\/g, '\\'), {
                                displayMode: true,
                                throwOnError: false,
                                trust: true,
                              }),
                            }}
                          />
                        </div>
                      )
                    }
                    if (inline) {
                      return (
                        <code className="px-2 py-0.5 rounded-lg bg-white/[0.07] font-mono text-xs text-orange-300" {...props}>
                          {children}
                        </code>
                      )
                    }
                    return (
                      <div className="my-5 rounded-2xl bg-black/50 border border-white/[0.06] overflow-x-auto scrollbar-hide">
                        <pre className="p-4">
                          <code className="font-mono text-xs sm:text-sm text-slate-300 leading-relaxed" {...props}>
                            {children}
                          </code>
                        </pre>
                      </div>
                    )
                  },
                }

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3 }}
                    className="bg-[#121214]/30 border border-white/5 p-4 sm:p-6 md:p-8 rounded-[2rem] backdrop-blur-2xl shadow-xl"
                  >
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 pb-4 border-b border-white/[0.06]">
                      <div className="flex items-center gap-3">
                        <span className={cn('text-3xl font-black tracking-tight tabular-nums', accentText)}>
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                          {cleanTitle(section.title)}
                        </h2>
                      </div>
                      <span className="self-start sm:self-center px-3 py-1 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        {images.length} Media Attached
                      </span>
                    </div>

                    {/* Content Section */}
                    <div className="clearfix">
                      {/* Floating Images (Desktop only, inline floating) */}
                      {images.length > 0 && (
                        <div className="float-right ml-6 mb-4 space-y-4 w-[38%] max-w-[280px] hidden sm:block">
                          {images.slice(0, 2).map((img: any, i: number) => {
                            const url = resolveUrl(img.url)
                            if (!url) return null
                            return (
                              <div
                                key={i}
                                className="group cursor-zoom-in rounded-2xl overflow-hidden border border-white/[0.08] hover:border-white/20 transition-all bg-black/20"
                                onClick={() => setZoomedImage(url)}
                              >
                                <img src={url} alt={img.caption} className="w-full h-auto object-cover" />
                                {img.caption && (
                                  <p className="text-[10px] text-zinc-400 px-3 py-2 italic border-t border-white/[0.05] text-center leading-normal">
                                    {cleanContent(img.caption)}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Markdown Text Body */}
                      {section.content ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkMath, remarkGfm]}
                          rehypePlugins={[rehypeKatex]}
                          components={md}
                        >
                          {normalizeMath(cleanContent(section.content))}
                        </ReactMarkdown>
                      ) : (
                        <div className="space-y-6">
                          {/* Key Question */}
                          {section.key_question && (
                            <div className="p-4 rounded-2xl border border-white/5 bg-[#18181c]/50 relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-indigo-600" />
                              <div className="flex gap-3">
                                <span className="text-xl shrink-0">❓</span>
                                <div>
                                  <span className="block text-[10px] font-black uppercase tracking-wider text-blue-400">Key Question</span>
                                  <p className="text-sm sm:text-base font-bold text-white mt-0.5">{cleanContent(section.key_question)}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Plain English Explanation */}
                          {section.plain_english && (
                            <div className="p-5 rounded-2xl border border-white/5 bg-[#121214]/60 relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500 to-teal-600" />
                              <div className="flex gap-3">
                                <span className="text-xl shrink-0">💡</span>
                                <div>
                                  <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-400">Simple Analogy / Plain English</span>
                                  <p className="text-sm sm:text-base leading-relaxed text-zinc-300 mt-1">{cleanContent(section.plain_english)}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Deep Dive Academic Content */}
                          {section.deep_dive && (
                            <div className="py-2">
                              <span className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-3 px-1">Detailed Explanation</span>
                              <ReactMarkdown
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={[rehypeKatex]}
                                components={md}
                              >
                                {normalizeMath(cleanContent(section.deep_dive))}
                              </ReactMarkdown>
                            </div>
                          )}

                          {/* Memory Trick Acronym / Analogy */}
                          {section.memory_trick && (
                            <div className="p-4 rounded-2xl border border-orange-500/20 bg-orange-500/5 relative overflow-hidden shadow-lg shadow-orange-500/5">
                              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-400 to-amber-500" />
                              <div className="flex gap-3">
                                <span className="text-xl shrink-0">⚡</span>
                                <div>
                                  <span className="block text-[10px] font-black uppercase tracking-wider text-orange-400">Memory Mnemonic / Trick</span>
                                  <p className="text-sm sm:text-base text-zinc-300 mt-1 leading-relaxed">{cleanContent(section.memory_trick)}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Quick Summary Feynman Recap */}
                          {section.quick_summary && (
                            <div className="p-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-400 to-fuchsia-500" />
                              <div className="flex gap-3">
                                <span className="text-xl shrink-0">🎯</span>
                                <div>
                                  <span className="block text-[10px] font-black uppercase tracking-wider text-purple-400">Feynman Recap</span>
                                  <p className="text-sm sm:text-base text-zinc-300 mt-1 leading-relaxed">{cleanContent(section.quick_summary)}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Mobile Images (renders under text flow) */}
                      {images.length > 0 && (
                        <div className="sm:hidden mt-6 space-y-4">
                          {images.slice(0, 2).map((img: any, i: number) => {
                            const url = resolveUrl(img.url)
                            if (!url) return null
                            return (
                              <div
                                key={i}
                                className="rounded-2xl overflow-hidden border border-white/[0.08] bg-black/20 cursor-zoom-in"
                                onClick={() => setZoomedImage(url)}
                              >
                                <img src={url} alt={img.caption} className="w-full h-auto" />
                                {img.caption && (
                                  <p className="text-[10px] text-zinc-400 px-3 py-2.5 italic text-center border-t border-white/[0.05] leading-normal">
                                    {cleanContent(img.caption)}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Extra Overflow Images (3+) */}
                      {images.length > 2 && (
                        <div className="mt-6 grid grid-cols-2 gap-4 clear-both">
                          {images.slice(2).map((img: any, i: number) => {
                            const url = resolveUrl(img.url)
                            if (!url) return null
                            return (
                              <div
                                key={i}
                                className="rounded-2xl overflow-hidden border border-white/[0.08] bg-black/20 cursor-zoom-in"
                                onClick={() => setZoomedImage(url)}
                              >
                                <img src={url} alt={img.caption} className="w-full h-auto" />
                                {img.caption && (
                                  <p className="text-[10px] text-zinc-400 px-3 py-2 italic text-center border-t border-white/[0.05] leading-normal">
                                    {cleanContent(img.caption)}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Progress navigation at bottom of card */}
                    <div className="mt-8 pt-5 border-t border-white/[0.06] flex items-center justify-between">
                      <button
                        onClick={handlePrevious}
                        disabled={currentPart === 0}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/5 text-zinc-300 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Prev
                      </button>

                      <button
                        onClick={handleAdvance}
                        className={cn(
                          "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                          isLastPart 
                            ? "bg-gradient-to-r from-orange-500 to-amber-500 text-black shadow-lg shadow-orange-500/10 hover:brightness-110"
                            : "bg-white text-black hover:bg-zinc-200"
                        )}
                      >
                        {isLastPart ? 'Complete Kit' : 'Next Part'}
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        /* ── Scroll Mode Layout (Continuous Document) ─────────── */
        <div className="space-y-12">
          {sections.map((section: any, idx: number) => {
            const accentClass = ACCENT[idx % ACCENT.length]
            const accentText  = accentClass.split(' ')[0]
            const accentBorder = accentClass.split(' ')[1]
            const images: any[] = section.images || []

            const md: any = {
              table: ({ children }: any) => (
                <div className="my-5 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#121214]/40">
                  <table className="min-w-full border-collapse text-sm">{children}</table>
                </div>
              ),
              thead: ({ children }: any) => <thead className="bg-white/[0.03] text-slate-400 border-b border-white/[0.08]">{children}</thead>,
              th: ({ children }: any) => (
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-zinc-400">{children}</th>
              ),
              td: ({ children }: any) => (
                <td className="px-4 py-3.5 text-sm text-zinc-300 border-b border-white/[0.04] leading-relaxed">{children}</td>
              ),
              tr: ({ children }: any) => <tr className="hover:bg-white/[0.01] transition-all">{children}</tr>,
              h1: ({ children }: any) => (
                <h3 className="text-base sm:text-lg font-black text-white mt-8 mb-4 tracking-tight">{children}</h3>
              ),
              h2: ({ children }: any) => (
                <h4 className="text-sm sm:text-base font-black text-white mt-6 mb-3 tracking-tight">{children}</h4>
              ),
              p: ({ children }: any) => (
                <p className="mb-4 text-sm sm:text-base leading-relaxed sm:leading-[1.8] text-zinc-300 last:mb-0">{children}</p>
              ),
              strong: ({ children }: any) => {
                const text = String(children || '')
                if (['Key Question:', 'Deep Dive:', 'Memory Trick:', 'Quick Summary:'].some(l => text.trim().startsWith(l))) {
                  return <span className={cn('block text-[11px] font-black uppercase tracking-wider mb-2 mt-5 first:mt-0', accentText)}>{text}</span>
                }
                return <strong className={cn('font-bold', accentText)}>{children}</strong>
              },
              blockquote: ({ children }: any) => (
                <blockquote className={cn('my-6 p-4 rounded-2xl border bg-white/[0.02] backdrop-blur-xl shadow-lg relative overflow-hidden', accentBorder)}>
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-400 to-amber-500" />
                  <div className="text-sm sm:text-base text-zinc-300 italic leading-relaxed flex gap-3">
                    <Sparkles className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                    <div>{children}</div>
                  </div>
                </blockquote>
              ),
              ul: ({ children }: any) => <ul className="mb-5 space-y-2 pl-1">{children}</ul>,
              ol: ({ children }: any) => <ol className="mb-5 space-y-2 pl-1 list-none">{children}</ol>,
              li: ({ children }: any) => (
                <li className="flex gap-3 text-sm sm:text-base text-zinc-300 leading-relaxed">
                  <span className={cn('mt-[0.65em] w-1.5 h-1.5 rounded-full shrink-0 opacity-80', accentText.replace('text-', 'bg-'))} />
                  <span className="flex-1">{children}</span>
                </li>
              ),
              a: ({ children, href }: any) => (
                <a href={href} className={cn('underline underline-offset-4 font-bold transition-opacity hover:opacity-70', accentText)} target="_blank" rel="noopener noreferrer">{children}</a>
              ),
              hr: () => <div className="my-6 h-px bg-white/[0.06]" />,
              code: ({ node, inline, className, children, ...props }: any) => {
                const match = /language-(\w+)/.exec(className || '')
                const content = Array.isArray(children) ? children.join('') : String(children || '')
                const cleanedCode = content.replace(/\n$/, '')
                const isMathBlock = match?.[1] === 'math' || (!inline && (cleanedCode.includes('\\') || cleanedCode.includes('_') || cleanedCode.includes('^')))

                if (isMathBlock) {
                  return (
                    <div className="my-6 py-5 px-4 bg-black/40 rounded-2xl border border-white/[0.06] overflow-x-auto scrollbar-hide">
                      <div className="text-sm sm:text-base min-w-max mx-auto text-center" dangerouslySetInnerHTML={{ __html: katex.renderToString(cleanedCode.replace(/\\\\/g, '\\'), { displayMode: true, throwOnError: false, trust: true }) }} />
                    </div>
                  )
                }
                if (inline) {
                  return <code className="px-2 py-0.5 rounded-lg bg-white/[0.07] font-mono text-xs text-orange-300" {...props}>{children}</code>
                }
                return (
                  <div className="my-5 rounded-2xl bg-black/50 border border-white/[0.06] overflow-x-auto scrollbar-hide">
                    <pre className="p-4"><code className="font-mono text-xs sm:text-sm text-slate-300 leading-relaxed" {...props}>{children}</code></pre>
                  </div>
                )
              },
            }

            return (
              <div
                key={idx}
                className="bg-[#121214]/20 border border-white/5 p-4 sm:p-6 md:p-8 rounded-[2rem] backdrop-blur-2xl"
              >
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.06]">
                  <span className={cn('text-2xl font-black tracking-tight tabular-nums', accentText)}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    {cleanTitle(section.title)}
                  </h2>
                </div>

                <div className="clearfix">
                  {/* Floating Images (Desktop only) */}
                  {images.length > 0 && (
                    <div className="float-right ml-6 mb-4 space-y-4 w-[38%] max-w-[280px] hidden sm:block">
                      {images.slice(0, 2).map((img: any, i: number) => {
                        const url = resolveUrl(img.url)
                        if (!url) return null
                        return (
                          <div
                            key={i}
                            className="group cursor-zoom-in rounded-2xl overflow-hidden border border-white/[0.08] hover:border-white/20 transition-all bg-black/20"
                            onClick={() => setZoomedImage(url)}
                          >
                            <img src={url} alt={img.caption} className="w-full h-auto object-cover" />
                            {img.caption && (
                              <p className="text-[10px] text-zinc-400 px-3 py-2 italic border-t border-white/[0.05] text-center leading-normal">
                                {cleanContent(img.caption)}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {section.content ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex]}
                      components={md}
                    >
                      {normalizeMath(cleanContent(section.content))}
                    </ReactMarkdown>
                  ) : (
                    <div className="space-y-6">
                      {/* Key Question */}
                      {section.key_question && (
                        <div className="p-4 rounded-2xl border border-white/5 bg-[#18181c]/50 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-indigo-600" />
                          <div className="flex gap-3">
                            <span className="text-xl shrink-0">❓</span>
                            <div>
                              <span className="block text-[10px] font-black uppercase tracking-wider text-blue-400">Key Question</span>
                              <p className="text-sm sm:text-base font-bold text-white mt-0.5">{cleanContent(section.key_question)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Plain English Explanation */}
                      {section.plain_english && (
                        <div className="p-5 rounded-2xl border border-white/5 bg-[#121214]/60 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500 to-teal-600" />
                          <div className="flex gap-3">
                            <span className="text-xl shrink-0">💡</span>
                            <div>
                              <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-400">Simple Analogy / Plain English</span>
                              <p className="text-sm sm:text-base leading-relaxed text-zinc-300 mt-1">{cleanContent(section.plain_english)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Deep Dive Academic Content */}
                      {section.deep_dive && (
                        <div className="py-2">
                          <span className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-3 px-1">Detailed Explanation</span>
                          <ReactMarkdown
                            remarkPlugins={[remarkMath, remarkGfm]}
                            rehypePlugins={[rehypeKatex]}
                            components={md}
                          >
                            {normalizeMath(cleanContent(section.deep_dive))}
                          </ReactMarkdown>
                        </div>
                      )}

                      {/* Memory Trick Acronym / Analogy */}
                      {section.memory_trick && (
                        <div className="p-4 rounded-2xl border border-orange-500/20 bg-orange-500/5 relative overflow-hidden shadow-lg shadow-orange-500/5">
                          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-400 to-amber-500" />
                          <div className="flex gap-3">
                            <span className="text-xl shrink-0">⚡</span>
                            <div>
                              <span className="block text-[10px] font-black uppercase tracking-wider text-orange-400">Memory Mnemonic / Trick</span>
                              <p className="text-sm sm:text-base text-zinc-300 mt-1 leading-relaxed">{cleanContent(section.memory_trick)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Quick Summary Feynman Recap */}
                      {section.quick_summary && (
                        <div className="p-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-400 to-fuchsia-500" />
                          <div className="flex gap-3">
                            <span className="text-xl shrink-0">🎯</span>
                            <div>
                              <span className="block text-[10px] font-black uppercase tracking-wider text-purple-400">Feynman Recap</span>
                              <p className="text-sm sm:text-base text-zinc-300 mt-1 leading-relaxed">{cleanContent(section.quick_summary)}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mobile Images */}
                  {images.length > 0 && (
                    <div className="sm:hidden mt-6 space-y-4">
                      {images.slice(0, 2).map((img: any, i: number) => {
                        const url = resolveUrl(img.url)
                        if (!url) return null
                        return (
                          <div
                            key={i}
                            className="rounded-2xl overflow-hidden border border-white/[0.08] bg-black/20 cursor-zoom-in"
                            onClick={() => setZoomedImage(url)}
                          >
                            <img src={url} alt={img.caption} className="w-full h-auto" />
                            {img.caption && (
                              <p className="text-[10px] text-zinc-400 px-3 py-2.5 italic text-center border-t border-white/[0.05] leading-normal">
                                {cleanContent(img.caption)}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Gamified XP & Celebration Popup ────────────────────── */}
      <AnimatePresence>
        {celebration && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[150] max-w-sm w-[90%] bg-[#121214]/95 border border-orange-500/20 shadow-[0_10px_50px_rgba(249,115,22,0.15)] rounded-2xl p-4 backdrop-blur-2xl flex items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-orange-500/10 p-2 text-orange-400 animate-bounce">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-black text-white uppercase tracking-wider">{celebration.title}</p>
                <p className="text-xs text-zinc-400 mt-0.5 leading-normal">{celebration.subtext}</p>
              </div>
            </div>
            <div className="shrink-0 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase">
              +{celebration.xp} XP
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Image Lightbox / Zoom ─────────────────────────────── */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[200] bg-black/92 backdrop-blur-md flex items-center justify-center p-4 sm:p-10"
          onClick={() => setZoomedImage(null)}
        >
          <button
            className="absolute top-5 right-5 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
            onClick={() => setZoomedImage(null)}
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={zoomedImage}
            alt="Full size"
            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
