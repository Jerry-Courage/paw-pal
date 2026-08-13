'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi, spacedRepetitionApi } from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useStudyTimer } from '@/hooks/useStudyTimer'
import { normalizeReadableMath, normalizeForRendering } from '@/lib/mathFormatting'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface Flashcard {
  id: number
  question: string
  answer: string
  difficulty: string
}

export default function FlashcardsPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  const qc = useQueryClient()
  useStudyTimer(true)

  const [phase, setPhase] = useState<'loading' | 'review' | 'results' | 'generating'>('loading')
  const [cards, setCards] = useState<Flashcard[]>([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [results, setResults] = useState<Record<number, 'know' | 'skip'>>({})

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  const { data: flashcardData, isLoading } = useQuery({
    queryKey: ['resource-flashcards', resourceId],
    queryFn: () => libraryApi.getResourceFlashcards(resourceId).then(r => r.data),
  })

  useEffect(() => {
    if (isLoading) return
    const fetched: Flashcard[] = flashcardData?.results || flashcardData || []
    if (fetched.length) {
      const normalized = fetched.map((c: any) => ({
        id: c.id,
        question: (c.question || c.front || c.term || c.prompt || '').toString().trim(),
        answer: (c.answer || c.back || c.definition || c.response || '').toString().trim(),
        difficulty: c.difficulty || 'medium',
      })).filter(c => c.question && c.answer)
      if (normalized.length) { setCards(normalized); setPhase('review'); return }
    }
    handleGenerate()
  }, [flashcardData, isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  const reviewMutation = useMutation({
    mutationFn: ({ id, quality }: { id: number; quality: number }) =>
      spacedRepetitionApi.reviewCard(id, quality),
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== 'review') return
      if (e.code === 'Space') { e.preventDefault(); setFlipped(f => !f) }
      if (e.code === 'ArrowRight' && flipped) handleResult('know')
      if (e.code === 'ArrowLeft' && flipped) handleResult('skip')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, flipped, current]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    setPhase('generating')
    try {
      const res = await libraryApi.generateFlashcards(resourceId, 20, 'undergrad')
      const generated: Flashcard[] = res.data.preview_cards || []
      if (!generated.length) throw new Error('No cards')
      setCards(generated); setPhase('review')
      qc.invalidateQueries({ queryKey: ['resource-flashcards', resourceId] })
    } catch { toast.error('Failed to generate flashcards.'); setPhase('loading') }
  }

  const handleResult = (result: 'know' | 'skip') => {
    const card = cards[current]
    setResults(r => ({ ...r, [card.id]: result }))
    if (card.id) reviewMutation.mutate({ id: card.id, quality: result === 'know' ? 4 : 1 })
    setFlipped(false)
    setTimeout(() => {
      if (current + 1 >= cards.length) {
        setPhase('results')
      } else {
        setCurrent(c => c + 1)
      }
    }, 150)
  }

  const handleRestart = () => { setCurrent(0); setFlipped(false); setResults({}); setPhase('review') }

  const known = Object.values(results).filter(v => v === 'know').length
  const pct = cards.length ? Math.round((known / cards.length) * 100) : 0

  // ── Loading ───────────────────────────────────────────────────────────
  if (phase === 'loading' || isLoading) return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-[1.5rem] flex items-center justify-center animate-pulse">
          <span className="material-symbols-outlined text-primary text-[28px]">style</span>
        </div>
        <p className="text-on-surface-variant text-[11px] font-black uppercase tracking-widest">Loading Flashcards…</p>
      </div>
    </div>
  )

  // ── Generating ────────────────────────────────────────────────────────
  if (phase === 'generating') return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center max-w-xs px-6">
        <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-[1.5rem] flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-[32px] animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
        </div>
        <div>
          <h2 className="text-[22px] font-bold text-on-surface tracking-tight">Generating Flashcards</h2>
          <p className="text-on-surface-variant mt-2 text-[14px]">AI is extracting key concepts…</p>
        </div>
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )

  // ── Results ───────────────────────────────────────────────────────────
  if (phase === 'results') {
    const passed = pct >= 60
    return (
      <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0">
          <Link href={`/library/${resourceId}`} className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest">Session Complete</p>
          <div className="w-9" />
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col">
          <div className="w-full max-w-sm mx-auto my-auto space-y-6 sm:space-y-8 text-center py-4">
            {/* Score ring */}
            <div className="relative w-36 h-36 mx-auto">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="5" className="text-surface-container-high" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 38}`}
                  strokeDashoffset={`${2 * Math.PI * 38 * (1 - pct / 100)}`}
                  className={passed ? 'text-green-400' : 'text-primary'}
                  style={{ transition: 'stroke-dashoffset 1.2s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[36px] font-bold text-on-surface">{pct}%</span>
                <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Known</span>
              </div>
            </div>

            <div>
              <h2 className="text-[28px] font-bold text-on-surface tracking-tight">
                {passed ? '🎉 Solid session!' : '💪 Keep reviewing!'}
              </h2>
              <p className="text-on-surface-variant mt-1 text-[15px]">{known} / {cards.length} cards known</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-500/10 border border-green-500/20 rounded-[1.5rem] p-5">
                <span className="material-symbols-outlined text-green-400 text-[28px] mb-2 block mx-auto" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <p className="text-[28px] font-bold text-on-surface">{known}</p>
                <p className="text-[11px] text-green-400 font-bold uppercase tracking-wider mt-1">Got It</p>
              </div>
              <div className="bg-error-container/20 border border-error/20 rounded-[1.5rem] p-5">
                <span className="material-symbols-outlined text-error text-[28px] mb-2 block mx-auto" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                <p className="text-[28px] font-bold text-on-surface">{cards.length - known}</p>
                <p className="text-[11px] text-error font-bold uppercase tracking-wider mt-1">Still Learning</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleRestart}
                className="flex-1 py-4 rounded-[1rem] bg-surface-container-high border border-outline-variant text-on-surface font-bold text-[15px] hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">refresh</span> Again
              </button>
              <Link href={`/library/${resourceId}`}
                className="flex-1 py-4 rounded-[1rem] bg-primary-container text-on-primary-container font-bold text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">menu_book</span> Done
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Review ────────────────────────────────────────────────────────────
  const card = cards[current]

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden select-none">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4 shrink-0 tool-header-safe">
        {/* Left: back + subject/title */}
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/library/${resourceId}`}
            className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all shrink-0">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] font-black text-primary uppercase tracking-widest truncate">
              FLASHCARDS · {cards.length} CARDS
            </p>
            <p className="text-[13px] font-semibold text-on-surface-variant truncate max-w-[200px] sm:max-w-xs">
              {resource?.title || '…'}
            </p>
          </div>
        </div>

        {/* Right: counter + regenerate */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[15px] font-bold text-on-surface">
            {current + 1}
            <span className="text-on-surface-variant/50 font-medium text-[13px]"> / {cards.length}</span>
          </span>
          <button onClick={handleGenerate}
            className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all"
            title="Regenerate cards">
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </header>

      {/* ── Dot progress ────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-1.5 py-3 shrink-0 flex-wrap px-8">
        {cards.map((c, i) => (
          <div key={i} className={cn(
            'rounded-full transition-all duration-300',
            i === current
              ? 'w-3 h-3 bg-primary scale-110'
              : results[cards[i]?.id] === 'know'
              ? 'w-2 h-2 bg-green-400'
              : results[cards[i]?.id] === 'skip'
              ? 'w-2 h-2 bg-error/60'
              : 'w-2 h-2 bg-surface-container-highest'
          )} />
        ))}
      </div>

      {/* ── Card area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-5 py-3 sm:py-4 gap-4 sm:gap-6 overflow-hidden">

        {/* Flip card */}
        <div
          className="w-full max-w-lg cursor-pointer"
          style={{ perspective: '1200px' }}
          onClick={() => setFlipped(f => !f)}
        >
          <div
            className="relative w-full transition-transform duration-500"
            style={{
              transformStyle: 'preserve-3d',
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              minHeight: 'clamp(220px, 40vh, 300px)',
            }}
          >
            {/* ── Front face ── */}
            <div
              className="absolute inset-0 bg-surface-container-low rounded-[1.5rem] p-6 sm:p-8 flex flex-col overflow-hidden"
              style={{ backfaceVisibility: 'hidden' }}
            >
              {/* Label row */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="material-symbols-outlined text-primary text-[16px]">quiz</span>
                <span className="text-[10px] font-black text-primary uppercase tracking-widest">Question</span>
              </div>

              {/* Question text — centered, scrollable if too long */}
              <div className="flex-1 flex items-center justify-center text-center py-3 overflow-y-auto min-h-0">
                <div className="text-[18px] sm:text-[20px] md:text-[22px] font-bold text-on-surface leading-snug prose prose-invert max-w-none [&>*]:text-[18px] sm:[&>*]:text-[20px] md:[&>*]:text-[22px] [&>*]:font-bold [&>*]:text-center">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {normalizeForRendering(card?.question || '')}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Hint */}
              <div className="flex items-center justify-center shrink-0 pt-2">
                <p className="text-[11px] text-on-surface-variant/40 font-medium flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">touch_app</span>
                  Tap to reveal answer
                </p>
              </div>
            </div>

            {/* ── Back face ── */}
            <div
              className="absolute inset-0 bg-surface-container-low border-2 border-primary/30 rounded-[1.5rem] p-6 sm:p-8 flex flex-col overflow-hidden"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              {/* Label row */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                <span className="text-[10px] font-black text-primary uppercase tracking-widest">Answer</span>
              </div>

              {/* Answer text — centered, scrollable if too long */}
              <div className="flex-1 flex items-center justify-center text-center py-3 overflow-y-auto min-h-0">
                <div className="text-[17px] sm:text-[19px] md:text-[21px] font-bold text-on-surface leading-relaxed prose prose-invert max-w-none [&>*]:text-[17px] sm:[&>*]:text-[19px] md:[&>*]:text-[21px] [&>*]:font-bold [&>*]:text-center">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {normalizeForRendering(card?.answer || '')}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Difficulty badge — bottom right, small */}
              <div className="flex items-center justify-end shrink-0 pt-2">
                <span className={cn(
                  'text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full',
                  card?.difficulty === 'easy' ? 'text-green-400 bg-green-400/10' :
                  card?.difficulty === 'hard' ? 'text-error bg-error/10' :
                  'text-primary bg-primary/10'
                )}>
                  {card?.difficulty || 'medium'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Keyboard hint ──────────────────────────────────────────── */}
        {!flipped && (
          <p className="text-[12px] text-on-surface-variant/40 font-medium">
            Tap card · <kbd className="px-1.5 py-0.5 bg-surface-container-high rounded text-[11px]">Space</kbd> to flip
          </p>
        )}

        {/* ── Action buttons (after flip) ───────────────────────────── */}
        {flipped && (
          <div className="flex gap-3 w-full max-w-lg">
            <button
              onClick={() => handleResult('skip')}
              className="flex-1 py-3 rounded-xl bg-error/10 border border-error/20 text-error font-bold text-[14px] hover:bg-error/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>close</span>
              Still Learning
            </button>
            <button
              onClick={() => handleResult('know')}
              className="flex-1 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-bold text-[14px] hover:bg-green-500/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
              Got It
            </button>
          </div>
        )}

        {/* Arrow key hint */}
        {flipped && (
          <p className="text-[11px] text-on-surface-variant/30 font-medium">
            <kbd className="px-1.5 py-0.5 bg-surface-container-high rounded text-[10px]">←</kbd> Still Learning ·{' '}
            <kbd className="px-1.5 py-0.5 bg-surface-container-high rounded text-[10px]">→</kbd> Got It
          </p>
        )}
      </div>
    </div>
  )
}
