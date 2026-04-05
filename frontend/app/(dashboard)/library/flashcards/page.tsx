'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { libraryApi, spacedRepetitionApi } from '@/lib/api'
import { ArrowLeft, RotateCcw, ThumbsUp, ThumbsDown, Sparkles, BookOpen, Trophy, Download, Brain } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useStudyTracker } from '@/hooks/useStudyTracker'

type ReviewMode = 'all' | 'due'

export default function FlashcardReviewPage() {
  useStudyTracker(30) // track time spent reviewing flashcards
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [results, setResults] = useState<Record<number, 'know' | 'skip'>>({})
  const [done, setDone] = useState(false)
  const [filterDifficulty, setFilterDifficulty] = useState<'easy' | 'medium' | 'hard' | 'all'>('all')
  const [mode, setMode] = useState<ReviewMode>('due')

  const { data: allData, isLoading: loadingAll } = useQuery({
    queryKey: ['flashcards'],
    queryFn: () => libraryApi.getFlashcards().then((r) => r.data),
  })

  const { data: dueData, isLoading: loadingDue } = useQuery({
    queryKey: ['due-flashcards'],
    queryFn: () => spacedRepetitionApi.getDueCards().then((r) => r.data),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, quality }: { id: number; quality: number }) =>
      spacedRepetitionApi.reviewCard(id, quality),
  })

  const exportAnki = async () => {
    try {
      const res = await spacedRepetitionApi.exportAnki()
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'flowstate_flashcards.csv'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Exported for Anki!')
    } catch {
      toast.error('Export failed.')
    }
  }

  const isLoading = mode === 'due' ? loadingDue : loadingAll
  const sourceCards = mode === 'due'
    ? (dueData?.flashcards || [])
    : (allData?.results || [])

  const cards = filterDifficulty === 'all'
    ? sourceCards
    : sourceCards.filter((c: any) => c.difficulty === filterDifficulty)

  const card = cards[current]
  const known = Object.values(results).filter((v) => v === 'know').length
  const progress = cards.length > 0 ? ((current) / cards.length) * 100 : 0

  const handleResult = (result: 'know' | 'skip') => {
    setResults((r) => ({ ...r, [card.id]: result }))
    // Submit SM-2 quality score: know=4, skip=1
    reviewMutation.mutate({ id: card.id, quality: result === 'know' ? 4 : 1 })
    setFlipped(false)
    if (current + 1 >= cards.length) {
      setDone(true)
    } else {
      setCurrent((c) => c + 1)
    }
  }

  const restart = () => {
    setCurrent(0)
    setFlipped(false)
    setResults({})
    setDone(false)
  }

  if (isLoading) return (
    <div className="max-w-2xl mx-auto flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (cards.length === 0 && mode === 'due') return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950 rounded-full mx-auto mb-4 flex items-center justify-center">
        <Brain className="w-10 h-10 text-emerald-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">All caught up!</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-6">No cards due for review right now. Come back later or review all cards.</p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => setMode('all')} className="btn-primary">Review All Cards</button>
        <Link href="/library" className="btn-secondary">Back to Library</Link>
      </div>
    </div>
  )

  if (cards.length === 0) return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-200 dark:text-gray-700" />
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No flashcards yet</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-6">Generate flashcards from your library resources to start reviewing.</p>
      <Link href="/library" className="btn-primary">Go to Library</Link>
    </div>
  )

  if (done) return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="w-20 h-20 bg-sky-50 dark:bg-sky-950 rounded-full mx-auto mb-6 flex items-center justify-center">
        <Trophy className="w-10 h-10 text-sky-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Session Complete!</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        You knew <span className="text-emerald-500 font-bold">{known}</span> out of <span className="font-bold">{cards.length}</span> cards.
      </p>

      {/* Score breakdown */}
      <div className="card p-5 mb-6 text-left">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-emerald-500">{known}</div>
            <div className="text-xs text-gray-400 mt-0.5">Knew it</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-400">{cards.length - known}</div>
            <div className="text-xs text-gray-400 mt-0.5">Need review</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-sky-500">{Math.round((known / cards.length) * 100)}%</div>
            <div className="text-xs text-gray-400 mt-0.5">Score</div>
          </div>
        </div>
        <div className="mt-4 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all"
            style={{ width: `${(known / cards.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <button onClick={restart} className="btn-secondary flex items-center gap-2">
          <RotateCcw className="w-4 h-4" /> Review Again
        </button>
        <Link href="/library" className="btn-primary">Back to Library</Link>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/library" className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => { setMode('due'); setCurrent(0); setFlipped(false); setDone(false) }}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors', mode === 'due' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400')}
            >
              <Brain className="w-3 h-3 inline mr-1" />Due ({dueData?.count || 0})
            </button>
            <button
              onClick={() => { setMode('all'); setCurrent(0); setFlipped(false); setDone(false) }}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors', mode === 'all' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400')}
            >
              All
            </button>
          </div>
          {(['all', 'easy', 'medium', 'hard'] as const).map((d) => (
            <button
              key={d}
              onClick={() => { setFilterDifficulty(d); setCurrent(0); setFlipped(false) }}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full font-medium transition-colors capitalize',
                filterDifficulty === d
                  ? 'bg-sky-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              {d}
            </button>
          ))}
          <button onClick={exportAnki} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
            <Download className="w-3.5 h-3.5" /> Anki
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-sky-500" /> Flashcard Review
          </span>
          <span>{current} / {cards.length} cards</span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Card */}
      {card && (
        <div
          className="relative cursor-pointer mb-6"
          style={{ perspective: '1000px' }}
          onClick={() => setFlipped(!flipped)}
        >
          <div
            className="relative transition-transform duration-500"
            style={{
              transformStyle: 'preserve-3d',
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              minHeight: '280px',
            }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 card p-8 flex flex-col items-center justify-center text-center"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <div className="text-xs font-semibold text-sky-500 mb-4 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" /> QUESTION
              </div>
              <p className="text-lg font-medium text-gray-800 dark:text-gray-200 leading-relaxed">{card.question}</p>
              {card.subject && (
                <span className="mt-4 text-xs bg-sky-50 dark:bg-sky-950 text-sky-500 px-2.5 py-1 rounded-full">{card.subject}</span>
              )}
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-6">Click to reveal answer</p>
            </div>

            {/* Back */}
            <div
              className="absolute inset-0 card p-8 flex flex-col items-center justify-center text-center bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/30 dark:to-gray-900"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <div className="text-xs font-semibold text-emerald-500 mb-4 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> ANSWER
              </div>
              <p className="text-lg font-medium text-gray-800 dark:text-gray-200 leading-relaxed">{card.answer}</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions — only show when flipped */}
      <div className={cn('flex gap-4 justify-center transition-opacity duration-200', flipped ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
        <button
          onClick={() => handleResult('skip')}
          className="flex-1 max-w-[180px] flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-orange-200 dark:border-orange-900 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 font-medium transition-colors"
        >
          <ThumbsDown className="w-5 h-5" /> Still Learning
        </button>
        <button
          onClick={() => handleResult('know')}
          className="flex-1 max-w-[180px] flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-emerald-200 dark:border-emerald-900 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium transition-colors"
        >
          <ThumbsUp className="w-5 h-5" /> Got It!
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="text-center text-xs text-gray-300 dark:text-gray-700 mt-4">
        Press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400">Space</kbd> to flip
      </p>
    </div>
  )
}
