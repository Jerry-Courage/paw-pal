'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
  CheckCircle2, Lock, BookOpen, Layers, Award, Eye, FileText,
  Map, Wand2, Radio, Calculator, Brain
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
  const router = useRouter()
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
    <div className="w-full h-full text-[#e2e2e2]">
      
      {/* ── Header with Title / Controls ─────────────────────────────────── */}
      <div className="px-4 sm:px-6 pt-6 pb-4 border-b border-white/[0.06]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-orange-500/10 text-orange-400 mb-2 border border-orange-500/20">
              <Sparkles className="w-2.5 h-2.5" />
              {isMathMode ? 'Logical Derivation' : 'Study Notes'}
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight">
              {notes.overview?.title || 'Study Material'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {notes.overview?.description || 'Understand how the digestive system breaks down food and absorbs nutrients.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
            {/* Study Mode */}
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all bg-white text-black border border-white/20">
              <FileText className="w-3.5 h-3.5" />
              Study Mode
            </button>
            
            {/* Scroll Mode */}
            <button
              onClick={() => setViewMode('scroll')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all bg-[#1a1a1a] text-slate-400 hover:text-white border border-white/10 hover:border-white/20"
            >
              <Eye className="w-3.5 h-3.5" />
              Scroll Mode
            </button>
            
            {/* Explore in VR */}
            <Link
              href={`/library/${resourceId}/vr`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-rose-500/20 to-pink-500/20 hover:from-rose-500/30 hover:to-pink-500/30 border border-rose-500/30 text-rose-400 text-[10px] font-bold uppercase tracking-wide transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Explore in VR 🥽
            </Link>
          </div>
        </div>
      </div>

      {/* ── Tool Tabs ────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-4 border-b border-white/[0.04] overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 min-w-max">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2d2416] border border-[#4a3a1f] text-orange-400 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-all">
            <BookOpen className="w-3.5 h-3.5" />
            Study
          </button>
          <Link href={`/library/${resourceId}/flashcards`} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 border border-white/[0.08] text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-all">
            <Layers className="w-3.5 h-3.5" />
            Flashcards
          </Link>
          <Link href={`/library/${resourceId}/mindmap`} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 border border-white/[0.08] text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-all">
            <Map className="w-3.5 h-3.5" />
            Mind Map
          </Link>
          <Link href={`/library/${resourceId}/practice`} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 border border-white/[0.08] text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-all">
            <Wand2 className="w-3.5 h-3.5" />
            Practice
          </Link>
          <Link href={`/library/${resourceId}/podcast`} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 border border-white/[0.08] text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-all">
            <Radio className="w-3.5 h-3.5" />
            Podcast
          </Link>
          <Link href={`/library/${resourceId}/examprep`} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 border border-white/[0.08] text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-all">
            <Brain className="w-3.5 h-3.5" />
            Exam Prep
          </Link>
          <Link href={`/library/${resourceId}/solver`} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 border border-white/[0.08] text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-all">
            <Calculator className="w-3.5 h-3.5" />
            Math
          </Link>
        </div>
      </div>

      {/* ── Study Mode Layout (Interactive Pages) ────────────── */}
      {viewMode === 'study' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 items-start h-[calc(100vh-280px)]">
          
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
          <div className="hidden lg:block lg:col-span-3 h-full overflow-y-auto scrollbar-hide bg-[#080809] border-r border-white/[0.05] px-4 py-6">
            <h3 className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-600 mb-4">Table of Contents</h3>
            <div className="space-y-0">
              {sections.map((sec: any, idx: number) => {
                const isCompleted = idx < currentPart
                const isActive = idx === currentPart
                const isLocked = idx > unlockedProgress
                
                return (
                  <button
                    key={idx}
                    disabled={isLocked}
                    onClick={() => handleStepClick(idx)}
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-3 py-3 transition-all group border-l-2",
                      isActive 
                        ? "border-orange-400 bg-orange-500/5 text-white" 
                        : isLocked
                          ? "border-transparent text-slate-700 cursor-not-allowed opacity-40"
                          : "border-transparent text-slate-500 hover:bg-white/[0.02] hover:text-slate-300 hover:border-slate-700"
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                      isActive 
                        ? "bg-orange-500 text-black" 
                        : isCompleted
                          ? "bg-emerald-500/20 text-emerald-400"
                          : isLocked
                            ? "bg-slate-800/30 text-slate-700"
                            : "bg-slate-800/50 text-slate-500"
                    )}>
                      {isCompleted ? "✓" : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold leading-snug truncate">
                        {cleanTitle(sec.title)}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Active Canvas Column */}
          <div className="lg:col-span-9 h-full overflow-y-auto scrollbar-hide px-6 py-6" ref={contentRef}>
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
                    className="w-full"
                  >
                    {/* Section Header */}
                    <div className="mb-8">
                      <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">
                        {cleanTitle(section.title)}
                      </h2>
                      <p className="text-sm text-slate-400">
                        Understand how the digestive system breaks down food and absorbs nutrients.
                      </p>
                    </div>

                    {/* Content Section with Right-Floating Image */}
                    <div className="relative">
                      <div className="flex gap-6">
                        {/* Left Content Area */}
                        <div className="flex-1 min-w-0 max-w-3xl">
                          
                          {/* Section Number Badge */}
                          <div className="flex items-center gap-4 mb-6">
                            <div className="flex items-center gap-3">
                              <span className={cn('text-5xl font-black tracking-tighter', accentText)}>
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              <h3 className="text-2xl font-bold text-white">
                                {cleanTitle(section.title)}
                              </h3>
                            </div>
                            {images.length > 0 && (
                              <span className="ml-auto text-[9px] text-slate-600 uppercase tracking-wider">
                                📎 media attached
                              </span>
                            )}
                          </div>

                    {/* Content Section */}
                    <div className="clearfix">
                      {/* Floating Images on Right (Desktop) */}
                      {images.length > 0 && (
                        <div className="hidden lg:block shrink-0 w-[340px]">
                          {images.slice(0, 1).map((img: any, i: number) => {
                            const url = resolveUrl(img.url)
                            if (!url) return null
                            return (
                              <div
                                key={i}
                                className="sticky top-24 group cursor-zoom-in rounded-2xl overflow-hidden border border-white/[0.08] hover:border-white/15 transition-all bg-white/[0.02] shadow-2xl"
                                onClick={() => setZoomedImage(url)}
                              >
                                <img src={url} alt={img.caption} className="w-full h-auto object-contain bg-white/5" />
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Key Question Section */}
                      {section.key_question && (
                        <div className="mb-8">
                          <div className="mb-3">
                            <span className="inline-block text-[10px] font-black uppercase tracking-[0.2em] text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded">
                              Key Question
                            </span>
                          </div>
                          <h4 className="text-lg font-bold text-white mb-4 leading-relaxed">
                            {cleanContent(section.key_question)}
                          </h4>
                        </div>
                      )}

                      {/* Plain English / Answer */}
                      {section.plain_english && (
                        <div className="mb-8">
                          <p className="text-base leading-relaxed text-slate-300">
                            {cleanContent(section.plain_english)}
                          </p>
                        </div>
                      )}

                      {/* Deep Dive Section */}
                      {section.deep_dive && (
                        <div className="mb-8">
                          <div className="mb-4 flex items-center gap-2">
                            <Flame className="w-4 h-4 text-orange-400" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
                              Deep Dive
                            </span>
                          </div>
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkMath, remarkGfm]}
                              rehypePlugins={[rehypeKatex]}
                              components={md}
                            >
                              {normalizeMath(cleanContent(section.deep_dive))}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}

                      {/* Markdown Content (if using unified content field) */}
                      {section.content && (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkMath, remarkGfm]}
                            rehypePlugins={[rehypeKatex]}
                            components={md}
                          >
                            {normalizeMath(cleanContent(section.content))}
                          </ReactMarkdown>
                        </div>
                      )}

                      {/* Memory Trick */}
                      {section.memory_trick && (
                        <div className="mt-8 p-5 rounded-2xl border border-orange-500/20 bg-orange-500/5 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-400 to-amber-500" />
                          <div className="flex gap-3">
                            <span className="text-xl shrink-0">⚡</span>
                            <div>
                              <span className="block text-[10px] font-black uppercase tracking-wider text-orange-400 mb-2">Memory Trick</span>
                              <p className="text-sm text-slate-300 leading-relaxed">{cleanContent(section.memory_trick)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Quick Summary */}
                      {section.quick_summary && (
                        <div className="mt-8 p-5 rounded-2xl border border-purple-500/20 bg-purple-500/5 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-400 to-fuchsia-500" />
                          <div className="flex gap-3">
                            <span className="text-xl shrink-0">🎯</span>
                            <div>
                              <span className="block text-[10px] font-black uppercase tracking-wider text-purple-400 mb-2">Quick Summary</span>
                              <p className="text-sm text-slate-300 leading-relaxed">{cleanContent(section.quick_summary)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Mobile Images */}
                      {images.length > 0 && (
                        <div className="lg:hidden mt-8 space-y-4">
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
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                        </div>
                      </div>
                    </div>

                    {/* Progress navigation at bottom */}
                    <div className="mt-12 pt-6 border-t border-white/[0.06] flex items-center justify-between">
                      <button
                        onClick={handlePrevious}
                        disabled={currentPart === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border border-white/[0.08] text-slate-400 rounded-xl text-xs font-bold uppercase tracking-wide hover:bg-white/[0.06] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </button>

                      <button
                        onClick={handleAdvance}
                        className={cn(
                          "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all",
                          isLastPart 
                            ? "bg-gradient-to-r from-orange-500 to-amber-500 text-black shadow-lg shadow-orange-500/20 hover:brightness-110"
                            : "bg-orange-500 text-black hover:bg-orange-400"
                        )}
                      >
                        {isLastPart ? 'Complete' : 'Next'}
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

      {/* ── Gamified Badge / Rewards Modal ────────────────────── */}
      <AnimatePresence>
        {completedAll && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative max-w-sm w-full bg-[#111115] border border-orange-500/30 rounded-3xl p-6 text-center space-y-6 shadow-[0_0_50px_rgba(249,115,22,0.2)] overflow-hidden"
            >
              {/* Radial gradient backing glow */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-orange-500/[0.08] blur-3xl rounded-full pointer-events-none" />

              <div className="space-y-2">
                <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Mastery Milestone</p>
                <h3 className="text-xl font-black text-white">Understand Phase Complete!</h3>
              </div>

              {/* Badge illustration */}
              <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
                {/* Rotating background ray aura */}
                <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/20 to-amber-500/20 rounded-full blur-xl animate-pulse" />
                <div className="absolute w-28 h-28 border border-orange-500/30 rounded-full border-dashed animate-spin [animation-duration:12s]" />
                <div className="absolute w-24 h-24 border border-orange-500/10 rounded-full" />
                
                {/* Core Badge Shield */}
                <div className="relative w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-600 rounded-3xl flex items-center justify-center shadow-lg shadow-orange-500/20 border border-orange-400/40 rotate-45 transform hover:rotate-90 transition-transform duration-700">
                  <div className="-rotate-45">
                    <Award className="w-10 h-10 text-[#0d0d0e]" strokeWidth={2.5} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <span className="inline-flex px-3 py-1 bg-orange-500/15 border border-orange-500/20 text-orange-400 text-[10px] font-black tracking-widest uppercase rounded-full">
                  UNDERSTAND BADGE UNLOCKED 🏆
                </span>
                <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto">
                  Excellent work! You finished reading and understanding every single part of this study kit. You gained <strong className="text-white">+50 XP</strong>.
                </p>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    setCompletedAll(false)
                    if (resourceId) {
                      router.push(`/library/${resourceId}/flashcards`)
                    }
                  }}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-black font-black text-xs uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-orange-500/15"
                >
                  Continue to Recall (Flashcards) →
                </button>
                <button
                  onClick={() => setCompletedAll(false)}
                  className="w-full py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-bold text-xs transition-all"
                >
                  Stay and Review Notes
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
