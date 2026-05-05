'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi, spacedRepetitionApi } from '@/lib/api'
import {
  ArrowLeft, BookOpen, Loader2, RotateCcw, Trophy,
  ChevronLeft, ChevronRight, Zap, Layers, CheckCircle, XCircle, Sparkles
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

  // Fetch pre-generated flashcards for this resource
  const { data: flashcardData, isLoading } = useQuery({
    queryKey: ['resource-flashcards', resourceId],
    queryFn: () => libraryApi.getResourceFlashcards(resourceId).then(r => r.data),
  })

  useEffect(() => {
    if (isLoading) return
    const fetched: Flashcard[] = flashcardData?.results || flashcardData || []
    if (fetched.length) {
      setCards(fetched)
      setPhase('review')
    } else {
      // No pre-generated cards — auto-generate
      handleGenerate()
    }
  }, [flashcardData, isLoading])

  const reviewMutation = useMutation({
    mutationFn: ({ id, quality }: { id: number; quality: number }) =>
      spacedRepetitionApi.reviewCard(id, quality),
  })

  // Space to flip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && phase === 'review') {
        e.preventDefault()
        setFlipped(f => !f)
      }
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
      setCards(generated)
      setPhase('review')
      qc.invalidateQueries({ queryKey: ['resource-flashcards', resourceId] })
    } catch {
      toast.error('Failed to generate flashcards.')
      setPhase('loading')
    }
  }

  const handleResult = (result: 'know' | 'skip') => {
    const card = cards[current]
    setResults(r => ({ ...r, [card.id]: result }))
    if (card.id) {
      reviewMutation.mutate({ id: card.id, quality: result === 'know' ? 4 : 1 })
    }
    setFlipped(false)
    if (current + 1 >= cards.length) {
      setPhase('results')
    } else {
      setCurrent(c => c + 1)
    }
  }

  const handleRestart = () => {
    setCurrent(0)
    setFlipped(false)
    setResults({})
    setPhase('review')
  }

  const known = Object.values(results).filter(v => v === 'know').length
  const pct = cards.length ? Math.round((known / cards.length) * 100) : 0

  // ── Loading ──────────────────────────────────────────────────────
  if (phase === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-sky-500/10 rounded-3xl flex items-center justify-center animate-pulse">
            <BookOpen className="w-8 h-8 text-sky-500" />
          </div>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Loading Flashcards...</p>
        </div>
      </div>
    )
  }

  // ── Generating ───────────────────────────────────────────────────
  if (phase === 'generating') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center max-w-sm px-6">
          <div className="w-20 h-20 bg-sky-500/10 border border-sky-500/20 rounded-[2rem] flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-sky-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tighter">Forging Flashcards</h2>
            <p className="text-slate-400 mt-2 text-sm">AI is extracting key concepts from your material...</p>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Results ──────────────────────────────────────────────────────
  if (phase === 'results') {
    const passed = pct >= 60
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <div className="px-6 py-5 flex items-center gap-4 border-b border-white/5">
          <Link href={`/library/${resourceId}`} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest">Session Complete</p>
            <h1 className="text-sm font-black text-white truncate max-w-xs">{resource?.title}</h1>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md space-y-8 text-center">
            <div className={cn(
              'w-28 h-28 mx-auto rounded-full flex items-center justify-center shadow-2xl',
              passed ? 'bg-sky-500 shadow-sky-500/30' : 'bg-violet-500 shadow-violet-500/30'
            )}>
              <Trophy className="w-14 h-14 text-white" />
            </div>

            <div>
              <h2 className="text-4xl font-black text-white tracking-tighter">
                {passed ? 'Solid session!' : 'Keep reviewing!'}
              </h2>
              <p className="text-slate-400 mt-2">{known} / {cards.length} cards known</p>
            </div>

            {/* Score ring */}
            <div className="relative w-36 h-36 mx-auto">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="6" className="text-white/5" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`}
                  className={passed ? 'text-sky-400' : 'text-violet-400'}
                  style={{ transition: 'stroke-dashoffset 1.2s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-white">{pct}%</span>
                <span className="text-xs text-slate-500 font-bold">Known</span>
              </div>
            </div>

            {/* Card breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                <p className="text-2xl font-black text-white">{known}</p>
                <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Got It</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                <XCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
                <p className="text-2xl font-black text-white">{cards.length - known}</p>
                <p className="text-xs text-red-400 font-bold uppercase tracking-wider">Still Learning</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRestart}
                className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-black hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Review Again
              </button>
              <Link
                href={`/library/${resourceId}`}
                className="flex-1 py-4 rounded-2xl bg-sky-500 text-white font-black hover:bg-sky-400 transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"
              >
                <BookOpen className="w-4 h-4" /> Back to Notes
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Review ───────────────────────────────────────────────────────
  const card = cards[current]
  const progress = ((current) / cards.length) * 100

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col select-none">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/library/${resourceId}`} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest">Flashcards · {cards.length} cards</p>
            <h1 className="text-sm font-black text-white truncate max-w-xs">{resource?.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-slate-500">{current + 1} / {cards.length}</span>
          <button onClick={handleGenerate} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all" title="Regenerate">
            <RotateCcw className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="h-1 bg-white/5 flex-shrink-0">
        <div
          className="h-full bg-sky-500 transition-all duration-500 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
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
              minHeight: '280px',
            }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-2xl"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <span className="text-[10px] font-black text-sky-500 uppercase tracking-widest mb-4 block">Question</span>
              <p className="text-xl font-bold text-white leading-relaxed">{card?.question}</p>
              <p className="text-xs text-slate-600 mt-6 font-medium">Tap to reveal answer</p>
            </div>

            {/* Back */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-sky-900/40 to-slate-900 border border-sky-500/20 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-2xl"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest mb-4 block">Answer</span>
              <p className="text-xl font-bold text-sky-100 leading-relaxed">{card?.answer}</p>
            </div>
          </div>
        </div>

        {/* Hint */}
        {!flipped && (
          <p className="text-xs text-slate-600 font-medium animate-pulse">
            Tap card · Space to flip
          </p>
        )}

        {/* Action buttons — only show after flip */}
        {flipped && (
          <div className="flex gap-4 w-full max-w-lg animate-in slide-in-from-bottom-4 duration-300">
            <button
              onClick={() => handleResult('skip')}
              className="flex-1 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-black hover:bg-red-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <XCircle className="w-5 h-5" /> Still Learning
            </button>
            <button
              onClick={() => handleResult('know')}
              className="flex-1 py-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black hover:bg-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" /> Got It
            </button>
          </div>
        )}

        {/* Navigation dots */}
        <div className="flex gap-1.5 flex-wrap justify-center max-w-xs">
          {cards.map((_, i) => (
            <div key={i} className={cn(
              'w-1.5 h-1.5 rounded-full transition-all',
              i === current ? 'bg-sky-500 scale-125' :
              results[cards[i]?.id] === 'know' ? 'bg-emerald-500' :
              results[cards[i]?.id] === 'skip' ? 'bg-red-500/60' :
              'bg-white/10'
            )} />
          ))}
        </div>
      </div>
    </div>
  )
}
