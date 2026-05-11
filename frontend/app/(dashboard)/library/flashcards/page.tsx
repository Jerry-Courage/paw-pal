'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { libraryApi, spacedRepetitionApi } from '@/lib/api'
import { ArrowLeft, ArrowRight, RotateCcw, ThumbsUp, ThumbsDown, Sparkles, BookOpen, Trophy, Download, Brain, Layers } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useStudyTracker } from '@/hooks/useStudyTracker'

type ReviewMode = 'all' | 'due' | 'decks' | 'deck-review'

export default function FlashcardReviewPage() {
  useStudyTracker(30) // track time spent reviewing flashcards
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [results, setResults] = useState<Record<number, 'know' | 'skip'>>({})
  const [done, setDone] = useState(false)
  const [filterDifficulty, setFilterDifficulty] = useState<'easy' | 'medium' | 'hard' | 'all'>('all')
  const [mode, setMode] = useState<ReviewMode>('due')
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null)

  const { data: allData, isLoading: loadingAll } = useQuery({
    queryKey: ['flashcards'],
    queryFn: () => libraryApi.getFlashcards().then((r) => r.data),
  })

  const { data: dueData, isLoading: loadingDue } = useQuery({
    queryKey: ['due-flashcards'],
    queryFn: () => spacedRepetitionApi.getDueCards().then((r) => r.data),
  })

  const { data: decksData, isLoading: loadingDecks } = useQuery({
    queryKey: ['decks'],
    queryFn: () => libraryApi.getDecks().then(r => r.data.results || r.data)
  })
  const decks = decksData || []

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

  const isLoading = mode === 'due' ? loadingDue : mode === 'decks' ? loadingDecks : loadingAll
  
  let sourceCards = mode === 'due'
    ? (dueData?.flashcards || [])
    : (allData?.results || [])

  let cards = filterDifficulty === 'all'
    ? sourceCards
    : sourceCards.filter((c: any) => c.difficulty === filterDifficulty)

  if (mode === 'deck-review' && selectedDeckId) {
    cards = cards.filter((c: any) => c.deck === selectedDeckId)
  }

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

  const HeaderTabs = () => (
    <div className="flex items-center gap-2">
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => { setMode('decks'); setCurrent(0); setFlipped(false); setDone(false); setSelectedDeckId(null) }}
          className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors', mode === 'decks' || mode === 'deck-review' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400')}
        >
          <Layers className="w-3 h-3 inline mr-1" />Decks
        </button>
        <button
          onClick={() => { setMode('due'); setCurrent(0); setFlipped(false); setDone(false); setSelectedDeckId(null) }}
          className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors', mode === 'due' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400')}
        >
          <Brain className="w-3 h-3 inline mr-1" />Due ({dueData?.count || 0})
        </button>
        <button
          onClick={() => { setMode('all'); setCurrent(0); setFlipped(false); setDone(false); setSelectedDeckId(null) }}
          className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors', mode === 'all' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400')}
        >
          All
        </button>
      </div>
      {mode !== 'decks' && (
        <div className="flex gap-1">
          {(['all', 'easy', 'medium', 'hard'] as const).map((d) => (
            <button
              key={d}
              onClick={() => { setFilterDifficulty(d); setCurrent(0); setFlipped(false) }}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full font-medium transition-colors capitalize hidden sm:block',
                filterDifficulty === d
                  ? 'bg-sky-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              {d}
            </button>
          ))}
        </div>
      )}
      <button onClick={exportAnki} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
        <Download className="w-3.5 h-3.5" /> Anki
      </button>
    </div>
  )

  if (isLoading) return (
    <div className="max-w-2xl mx-auto flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (mode === 'decks') return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/library" className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </Link>
        <HeaderTabs />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/50 rounded-xl flex items-center justify-center">
          <Layers className="w-5 h-5 text-violet-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your Flashcard Decks</h2>
          <p className="text-xs text-gray-500">Organized subject groups actively tracked via SM-2 algorithms.</p>
        </div>
      </div>

      {decks.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-3xl bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl">
           <Layers className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-700 mb-5" />
           <p className="font-black text-xl text-gray-900 dark:text-white">No Decks created yet.</p>
           <p className="text-sm font-medium text-gray-500 mt-2">Generate flashcards from your documents to assemble your first deck.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {decks.map((deck: any) => (
            <div 
              key={deck.id} 
              onClick={() => { setSelectedDeckId(deck.id); setMode('deck-review'); setCurrent(0); setDone(false) }} 
              className="relative overflow-hidden bg-white/80 dark:bg-gray-900/60 backdrop-blur-xl border border-white/40 dark:border-gray-800/60 rounded-3xl p-6 cursor-pointer shadow-sm hover:shadow-[0_20px_40px_-15px_rgba(139,92,246,0.3)] hover:-translate-y-1 transition-all duration-500 group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-[40px] group-hover:bg-violet-500/20 transition-colors pointer-events-none" />
              
              <div className="flex justify-between items-start mb-5 relative z-10">
                <div className="text-[10px] font-black tracking-widest bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 px-3 py-1.5 rounded-full uppercase truncate max-w-[150px]">
                  {deck.subject || 'General'}
                </div>
                {deck.due_count > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/20 px-2.5 py-1.5 rounded-full animate-pulse shadow-sm">
                     <Brain className="w-3 h-3" /> {deck.due_count} Due
                  </div>
                )}
              </div>
              
              <h3 className="font-black text-xl text-gray-900 dark:text-white mb-2 relative z-10 line-clamp-2">{deck.title}</h3>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 line-clamp-2 relative z-10 h-8">{deck.description || 'Review terminology and concepts.'}</p>
              
              <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-100 dark:border-gray-800/60 relative z-10">
                <span className="text-xs font-bold text-gray-400 flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full"><Layers className="w-3.5 h-3.5"/> {deck.total_cards || 0} Cards</span>
                <div className="w-8 h-8 rounded-full bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center group-hover:bg-violet-500 group-hover:text-white text-violet-500 transition-colors">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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
        <button onClick={() => setMode('decks')} className="btn-primary">Browse Decks</button>
        <Link href="/library" className="btn-secondary">Back to Library</Link>
      </div>
    </div>
  )

  if (cards.length === 0 && mode === 'deck-review') return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <button onClick={() => setMode('decks')} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <ArrowLeft className="w-4 h-4" /> Back to Decks
        </button>
      </div>
      <div className="text-center py-20">
        <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-200 dark:text-gray-700" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Empty Deck</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">There are no flashcards in this deck yet.</p>
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
        {mode === 'deck-review' ? (
           <button onClick={() => setMode('decks')} className="btn-primary">Back to Decks</button>
        ) : (
           <Link href="/library" className="btn-primary">Back to Library</Link>
        )}
      </div>
    </div>
  )

  const isDeckReview = mode === 'deck-review'
  const activeDeck = isDeckReview ? decks.find((d: any) => d.id === selectedDeckId) : null

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => isDeckReview ? setMode('decks') : window.location.href='/library'} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <ArrowLeft className="w-4 h-4" /> Back to {isDeckReview ? 'Decks' : 'Library'}
        </button>
        <HeaderTabs />
      </div>

      {isDeckReview && activeDeck && (
         <div className="mb-6 pb-6 border-b border-gray-100 dark:border-gray-800">
            <div className="text-xs font-bold text-violet-500 uppercase tracking-widest">{activeDeck.subject || 'Deck'}</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{activeDeck.title}</h2>
         </div>
      )}

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
          className="relative cursor-pointer mb-8 group"
          style={{ perspective: '1200px' }}
          onClick={() => setFlipped(!flipped)}
        >
          {/* Ambient Lighting Behind Card */}
          <div className="absolute inset-0 bg-violet-500/5 dark:bg-violet-500/10 blur-[50px] group-hover:bg-violet-500/15 group-hover:dark:bg-violet-500/30 transition-colors pointer-events-none rounded-full" />
          
          <div
            className="relative transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{
              transformStyle: 'preserve-3d',
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              minHeight: '320px',
            }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] border border-white/50 dark:border-gray-700/50 p-10 flex flex-col items-center justify-center text-center overflow-hidden hover:shadow-[0_20px_40px_-15px_rgba(139,92,246,0.2)] transition-shadow"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-violet-500 to-sky-500" />
              <div className="text-xs font-black tracking-widest text-violet-500 mb-6 uppercase flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> QUESTION
              </div>
              <p className="text-xl font-medium text-gray-900 dark:text-gray-100 leading-relaxed max-w-lg">{card.question}</p>
              {card.subject && (
                <span className="mt-6 text-[10px] font-bold tracking-widest bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-3 py-1.5 rounded-full uppercase border border-violet-100 dark:border-violet-800">{card.subject}</span>
              )}
              <p className="absolute bottom-6 text-[10px] font-bold text-gray-300 dark:text-gray-600 uppercase tracking-widest flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">Tap to Flip</p>
            </div>

            {/* Back */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-violet-50 to-white dark:from-violet-900/10 dark:to-gray-800/90 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] border border-violet-100 dark:border-violet-900/30 p-10 flex flex-col items-center justify-center text-center"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <div className="text-xs font-black tracking-widest text-emerald-500 mb-6 uppercase flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> ANSWER
              </div>
              <p className="text-xl font-medium text-gray-800 dark:text-gray-200 leading-relaxed max-w-lg">{card.answer}</p>
              {/* SM-2 stats on the back for transparency */}
              <div className="absolute bottom-6 flex gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                 <span>Ease: {card.ease_factor || '2.5'}</span>
                 <span>Reps: {card.repetitions || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
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
