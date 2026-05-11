'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi, spacedRepetitionApi } from '@/lib/api'
import {
  ArrowLeft, BookOpen, Loader2, RotateCcw,
  Zap, CheckCircle, XCircle, Sparkles
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Flashcard {
  id: number
  question: string
  answer: string
  difficulty: string
}

export default function FlashcardsPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  const qc = useQueryClient()

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
      // Normalize field names — some models return 'front'/'back' instead of 'question'/'answer'
      const normalized = fetched.map((c: any) => ({
        id: c.id,
        question: (c.question || c.front || c.term || c.prompt || '').toString().trim(),
        answer: (c.answer || c.back || c.definition || c.response || '').toString().trim(),
        difficulty: c.difficulty || 'medium',
      })).filter(c => c.question && c.answer)
      if (normalized.length) { setCards(normalized); setPhase('review'); return }
    }
    handleGenerate()
  }, [flashcardData, isLoading])

  const reviewMutation = useMutation({
    mutationFn: ({ id, quality }: { id: number; quality: number }) =>
      spacedRepetitionApi.reviewCard(id, quality),
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && phase === 'review') { e.preventDefault(); setFlipped(f => !f) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase])

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
    if (current + 1 >= cards.length) setPhase('results')
    else setCurrent(c => c + 1)
  }

  const handleRestart = () => { setCurrent(0); setFlipped(false); setResults({}); setPhase('review') }

  const known = Object.values(results).filter(v => v === 'know').length
  const pct = cards.length ? Math.round((known / cards.length) * 100) : 0

  // ── Loading ──────────────────────────────────────────────────────
  if (phase === 'loading' || isLoading) return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center animate-pulse">
          <BookOpen className="w-6 h-6 text-orange-500" />
        </div>
        <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Loading Flashcards...</p>
      </div>
    </div>
  )

  // ── Generating ───────────────────────────────────────────────────
  if (phase === 'generating') return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex items-center justify-center">
      <div className="flex flex-col items-center gap-5 text-center max-w-xs px-6">
        <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-orange-400 animate-pulse" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">Forging Flashcards</h2>
          <p className="text-slate-500 mt-1.5 text-sm">AI is extracting key concepts...</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )

  // ── Results ──────────────────────────────────────────────────────
  if (phase === 'results') {
    const passed = pct >= 60
    return (
      <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0">
          <Link href={`/library/${resourceId}`} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Session Complete</p>
            <h1 className="text-sm font-black text-white truncate">{resource?.title}</h1>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
          <div className="w-full max-w-sm space-y-6 text-center">

            {/* Score ring */}
            <div className="relative w-32 h-32 mx-auto">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="6" className="text-white/5" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 38}`}
                  strokeDashoffset={`${2 * Math.PI * 38 * (1 - pct / 100)}`}
                  className={passed ? 'text-emerald-400' : 'text-orange-400'}
                  style={{ transition: 'stroke-dashoffset 1.2s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-white">{pct}%</span>
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Known</span>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                {passed ? '🎉 Solid session!' : '💪 Keep reviewing!'}
              </h2>
              <p className="text-slate-500 mt-1 text-sm">{known} / {cards.length} cards known</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-2xl p-4">
                <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
                <p className="text-2xl font-black text-white">{known}</p>
                <p className="text-[10px] text-emerald-400 font-black uppercase tracking-wider mt-0.5">Got It</p>
              </div>
              <div className="bg-red-500/8 border border-red-500/20 rounded-2xl p-4">
                <XCircle className="w-5 h-5 text-red-400 mx-auto mb-1.5" />
                <p className="text-2xl font-black text-white">{cards.length - known}</p>
                <p className="text-[10px] text-red-400 font-black uppercase tracking-wider mt-0.5">Still Learning</p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button onClick={handleRestart}
                className="flex-1 py-3.5 rounded-2xl bg-white/5 border border-white/8 text-white font-black text-sm hover:bg-white/8 transition-all flex items-center justify-center gap-2">
                <RotateCcw className="w-4 h-4" /> Again
              </button>
              <Link href={`/library/${resourceId}`}
                className="flex-1 py-3.5 rounded-2xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
                <BookOpen className="w-4 h-4" /> Notes
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Review ───────────────────────────────────────────────────────
  const card = cards[current]

  return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden select-none">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/library/${resourceId}`} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">
              Flashcards · {cards.length} cards
            </p>
            <h1 className="text-xs font-black text-slate-400 truncate max-w-[180px]">{resource?.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-black text-white">{current + 1}
            <span className="text-slate-600 font-bold text-xs"> / {cards.length}</span>
          </span>
          <button onClick={handleGenerate} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all" title="Regenerate">
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-white/5 shrink-0">
        <div className="h-full bg-orange-500 transition-all duration-500"
          style={{ width: `${(current / cards.length) * 100}%` }} />
      </div>

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 gap-5 overflow-hidden">

        {/* Progress dots */}
        <div className="flex gap-1 flex-wrap justify-center max-w-xs">
          {cards.map((c, i) => (
            <div key={i} className={cn('w-1.5 h-1.5 rounded-full transition-all duration-300',
              i === current ? 'bg-orange-500 scale-125' :
              results[cards[i]?.id] === 'know' ? 'bg-emerald-500' :
              results[cards[i]?.id] === 'skip' ? 'bg-red-500/60' :
              'bg-white/10'
            )} />
          ))}
        </div>

        {/* Flip card */}
        <div className="w-full max-w-lg cursor-pointer" style={{ perspective: '1200px' }}
          onClick={() => setFlipped(f => !f)}>
          <div className="relative w-full transition-transform duration-500"
            style={{
              transformStyle: 'preserve-3d',
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              minHeight: '260px',
            }}>

            {/* Front */}
            <div className="absolute inset-0 bg-[#1a1a1a] border border-white/8 rounded-3xl p-8 flex flex-col items-center justify-center text-center"
              style={{ backfaceVisibility: 'hidden' }}>
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-4 block">Question</span>
              <p className="text-lg font-bold text-white leading-relaxed">{card?.question}</p>
              <p className="text-xs text-slate-600 mt-6 font-medium">Tap to reveal answer</p>
            </div>

            {/* Back */}
            <div className="absolute inset-0 bg-[#1a1a1a] border border-orange-500/20 rounded-3xl p-8 flex flex-col items-center justify-center text-center"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
              <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-4 block">Answer</span>
              <p className="text-lg font-bold text-orange-100 leading-relaxed">{card?.answer}</p>
            </div>
          </div>
        </div>

        {/* Hint */}
        {!flipped && (
          <p className="text-xs text-slate-600 font-medium">Tap card · Space to flip</p>
        )}

        {/* Action buttons */}
        {flipped && (
          <div className="flex gap-3 w-full max-w-lg">
            <button onClick={() => handleResult('skip')}
              className="flex-1 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-sm hover:bg-red-500/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              <XCircle className="w-4 h-4" /> Still Learning
            </button>
            <button onClick={() => handleResult('know')}
              className="flex-1 py-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-sm hover:bg-emerald-500/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Got It
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
