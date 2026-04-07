'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import { 
  X, Sparkles, BookOpen, ChevronRight, Loader2, Layers, 
  ThumbsUp, ThumbsDown, Trophy, ArrowRight, BrainCircuit
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  resourceId?: number
  onClose: () => void
  onGenerated?: () => void
}

const LEVELS = ['High School', 'Undergrad', 'Graduate', 'Professional']

export default function FlashcardGeneratorModal({ resourceId, onClose, onGenerated }: Props) {
  const [selectedResource, setSelectedResource] = useState<number | null>(resourceId || null)
  const [level, setLevel] = useState('Undergrad')
  const [count, setCount] = useState(10)
  
  const [stage, setStage] = useState<'setup' | 'loading' | 'preview'>('setup')
  const [generatedCards, setGeneratedCards] = useState<any[]>([])

  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then((r) => r.data),
    enabled: !resourceId,
  })
  const resources = resourcesData?.results || []

  const mutation = useMutation({
    mutationFn: () => libraryApi.generateFlashcards(selectedResource!, count, level.toLowerCase()),
    onSuccess: (res) => {
      setGeneratedCards(res.data.preview_cards || [])
      setStage('preview')
      toast.success('Matrix analyzed. Flashcards generated.')
    },
    onError: () => {
      toast.error('AI Processing Failed. Check connection.')
      setStage('setup')
    },
  })

  const handleGenerate = () => {
    setStage('loading')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 lg:p-0">
      <div 
        className={cn(
          "bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden relative transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
          stage === 'preview' 
            ? "w-full max-w-5xl h-[95vh] lg:h-[85vh] rounded-[2rem]" 
            : "w-full max-w-2xl rounded-3xl min-h-[400px]"
        )}
      >
        
        {/* === HEADER === */}
        {stage !== 'preview' && (
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl absolute top-0 left-0 right-0 z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/40 rounded-2xl flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white leading-tight">AI Flashcard Forge</h2>
                <p className="text-xs text-gray-500 font-medium">Kinetic Spaced Repetition</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* === MAIN CONTENT SCROLL === */}
        <div className={cn(
          "flex-1 overflow-y-auto scrollbar-hide relative",
          stage !== 'preview' ? "pt-[88px] pb-24" : ""
        )}>

          {/* STEP 1: SETUP */}
          {stage === 'setup' && (
            <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Material Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black tracking-widest text-gray-400 uppercase">1. Source Matrix</span>
                </div>
                {resourceId ? (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-50 to-white dark:from-violet-950/20 dark:to-gray-900 border-2 border-violet-200 dark:border-violet-900/50 flex flex-col gap-1">
                    <span className="text-xs text-violet-500 font-bold uppercase tracking-widest">Locked</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">
                      {resources.find((r: any) => r.id === resourceId)?.title || 'Current Document'}
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {resources.slice(0, 4).map((r: any) => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedResource(r.id)}
                        className={cn(
                          'p-4 rounded-xl border-2 text-left transition-all duration-300 group relative overflow-hidden',
                          selectedResource === r.id
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 shadow-md shadow-violet-500/10'
                            : 'border-gray-100 dark:border-gray-800 hover:border-violet-200 dark:hover:border-violet-800/50 bg-white dark:bg-gray-900'
                        )}
                      >
                        {selectedResource === r.id && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-violet-500 rounded-full shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
                        )}
                        <span className={cn(
                          "text-sm font-semibold block truncate pr-6",
                          selectedResource === r.id ? "text-violet-700 dark:text-violet-300" : "text-gray-700 dark:text-gray-300"
                        )}>
                          {r.title}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tuning Parameters */}
              <div className="space-y-6 bg-gray-50 dark:bg-gray-900/50 rounded-3xl p-6 border border-gray-100 dark:border-gray-800">
                <span className="text-xs font-black tracking-widest text-gray-400 uppercase">2. Tuning Parameters</span>
                
                <div>
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3">Academic Depth</div>
                  <div className="flex gap-2 flex-wrap">
                    {LEVELS.map((l) => (
                      <button
                        key={l}
                        onClick={() => setLevel(l)}
                        className={cn(
                          'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300',
                          level === l
                            ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-lg'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Card Yield</span>
                    <span className="px-3 py-1 bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 rounded-lg text-sm font-bold">
                      {count} Cards
                    </span>
                  </div>
                  <input
                    type="range" min={1} max={20} step={1}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-full accent-violet-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs font-medium text-gray-400 mt-2 px-1">
                    <span>1</span>
                    <span>20</span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* STEP 2: LOADING */}
          {stage === 'loading' && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] p-6 text-center animate-in fade-in duration-500">
              <div className="w-24 h-24 relative mb-8">
                {/* Ping rings */}
                <div className="absolute inset-0 bg-violet-500 rounded-full animate-ping opacity-20" />
                <div className="absolute inset-2 bg-violet-500 rounded-full animate-ping opacity-40" style={{ animationDelay: '0.2s' }} />
                {/* Core */}
                <div className="absolute inset-4 bg-gradient-to-tr from-violet-600 to-fuchsia-500 rounded-full shadow-[0_0_40px_rgba(139,92,246,0.6)] flex items-center justify-center animate-pulse">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
              </div>
              
              <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">Forging Flashcards...</h3>
              <p className="text-sm text-gray-500 max-w-[250px] mx-auto opacity-80 animate-pulse">
                Extracting high-yield concepts and bridging them to SuperMemo math arrays.
              </p>
            </div>
          )}

          {/* STEP 3: PREVIEW & SAVE (Delegated to sub-component for cleanly managing card state) */}
          {stage === 'preview' && (
            <PreviewSaveCarousel 
              cards={generatedCards} 
              resourceId={selectedResource} 
              onClose={onClose} 
              onRegenerate={() => { setGeneratedCards([]); handleGenerate(); }}
              onSaved={() => {
                onGenerated?.()
                onClose()
              }}
            />
          )}

        </div>

        {/* === FOOTER ACTION === */}
        {stage === 'setup' && (
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent dark:from-gray-900 dark:via-gray-900">
            <button
              onClick={handleGenerate}
              disabled={!selectedResource}
              className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl text-base font-black hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 disabled:hover:scale-100"
            >
              Ignite Generator <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

function PreviewSaveCarousel({ cards, resourceId, onClose, onRegenerate, onSaved }: { cards: any[], resourceId: number | null, onClose: () => void, onRegenerate: () => void, onSaved: () => void }) {
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [selectedDeck, setSelectedDeck] = useState<string>('')
  const [newDeckName, setNewDeckName] = useState('')
  const [newDeckTopic, setNewDeckTopic] = useState('')

  const { data: decksData } = useQuery({
    queryKey: ['decks'],
    queryFn: () => libraryApi.getDecks().then(r => r.data.results || r.data)
  })
  const decks = decksData || []

  const saveMutation = useMutation({
    mutationFn: async () => {
      let deckId = selectedDeck
      if (selectedDeck === 'new') {
        const res = await libraryApi.createDeck(newDeckName, newDeckTopic)
        deckId = res.data.id
      }
      if (!deckId) throw new Error("No deck selected")
      
      await libraryApi.saveFlashcardsToDeck(Number(deckId), resourceId, cards)
    },
    onSuccess: () => {
      toast.success('Successfully deployed to Deck!')
      onSaved()
    },
    onError: () => toast.error('Failed to save flashcards.')
  })

  const q = cards[current]

  return (
    <div className="flex flex-col lg:flex-row h-full w-full animate-in fade-in duration-500">
      
      {/* LEFT COMPARTMENT - TACTILE PREVIEWER */}
      <div className="flex-1 p-6 lg:p-10 flex flex-col bg-gray-50/50 dark:bg-gray-950/50 relative overflow-hidden">
        {/* Background ambient lighting */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-violet-500/10 dark:bg-violet-500/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="flex items-center justify-between mb-8 relative z-10">
          <div>
             <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500" /> Matrix Preview
             </h2>
             <p className="text-sm font-medium text-gray-500 mt-1">{cards.length} cards extracted</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onRegenerate} className="px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 shadow-sm hover:shadow transition-shadow">
               Regenerate
            </button>
            <button onClick={onClose} className="p-1.5 lg:hidden bg-white dark:bg-gray-800 rounded-lg shadow-sm">
               <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center relative z-10 min-h-[300px]">
          {q && (
            <div
              className="relative cursor-pointer w-full max-w-sm aspect-[4/3] group"
              style={{ perspective: '1200px' }}
              onClick={() => setFlipped(!flipped)}
            >
              <div
                className="relative w-full h-full transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* FRONT FACET */}
                <div
                  className="absolute inset-0 bg-white dark:bg-gray-800 rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] border border-gray-100 dark:border-gray-700 p-8 flex flex-col items-center justify-center text-center overflow-hidden"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-violet-500 to-fuchsia-500" />
                  
                  <div className={`absolute top-5 right-5 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                    q.difficulty === 'hard' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' :
                    q.difficulty === 'medium' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                    'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  }`}>
                    {q.difficulty || 'MEDIUM'}
                  </div>

                  <div className="text-xs font-bold text-violet-500 mb-4 tracking-[0.2em] uppercase">Question</div>
                  <p className="text-xl font-medium text-gray-900 dark:text-gray-100 leading-snug">{q.question || q.front}</p>
                  
                  <div className="absolute bottom-5 text-[10px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-widest flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                     <span>Tap to Flip</span>
                  </div>
                </div>

                {/* BACK FACET */}
                <div
                  className="absolute inset-0 bg-gradient-to-br from-violet-50 to-white dark:from-violet-900/20 dark:to-gray-800 rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] border border-gray-100 dark:border-gray-700 p-8 flex flex-col items-center justify-center text-center"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  <div className="text-xs font-bold text-emerald-500 mb-4 tracking-[0.2em] uppercase">Answer</div>
                  <p className="text-lg text-gray-700 dark:text-gray-300 leading-snug">{q.answer || q.back}</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between w-full max-w-sm mt-10">
            <button
              onClick={() => { setCurrent((c) => Math.max(0, c - 1)); setFlipped(false) }}
              disabled={current === 0}
              className="px-5 py-2.5 bg-white dark:bg-gray-800 shadow-sm rounded-xl text-sm font-bold disabled:opacity-30 hover:scale-105 active:scale-95 transition-all text-gray-700 dark:text-gray-300"
            >
              ← Prev
            </button>
            <div className="flex gap-1.5">
               {cards.map((_, idx) => (
                  <div key={idx} className={cn("w-2 h-2 rounded-full transition-all duration-300", current === idx ? "w-6 bg-violet-600" : "bg-gray-300 dark:bg-gray-700")} />
               ))}
            </div>
            <button
              onClick={() => { setCurrent((c) => Math.min(cards.length - 1, c + 1)); setFlipped(false) }}
              disabled={current === cards.length - 1}
              className="px-5 py-2.5 bg-white dark:bg-gray-800 shadow-sm rounded-xl text-sm font-bold disabled:opacity-30 hover:scale-105 active:scale-95 transition-all text-gray-700 dark:text-gray-300"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COMPARTMENT - BOTTOM SHEET / SIDEBAR */}
      <div className="w-full lg:w-[380px] bg-white dark:bg-gray-900 border-t lg:border-t-0 lg:border-l border-gray-100 dark:border-gray-800 p-6 lg:p-8 flex flex-col justify-between shrink-0 z-20">
        <div>
          <div className="flex items-center justify-between mb-8 hidden lg:flex">
            <h3 className="text-xl font-black text-gray-900 dark:text-white">Save Sequence</h3>
            <button onClick={onClose} className="p-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="text-xs font-black text-gray-400 mb-2 block uppercase tracking-widest">Destination Deck</label>
              <div className="relative">
                <Layers className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-violet-500 rounded-2xl pl-12 pr-4 py-4 text-sm font-semibold text-gray-900 dark:text-white outline-none appearance-none cursor-pointer transition-colors"
                  value={selectedDeck}
                  onChange={(e) => setSelectedDeck(e.target.value)}
                >
                  <option value="" disabled>Choose a tactical deck...</option>
                  <option value="new" className="font-bold text-violet-600">+ Forge New Deck</option>
                  {decks.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.title} {d.subject ? `(${d.subject})` : ''}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
              </div>
            </div>

            {selectedDeck === 'new' && (
              <div className="space-y-4 p-5 bg-violet-50 dark:bg-violet-900/10 border-2 border-violet-100 dark:border-violet-900/50 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                <div>
                  <label className="text-[10px] font-black text-violet-500/80 uppercase tracking-widest mb-1.5 block">Deck Title</label>
                  <input
                    type="text"
                    className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-violet-500 shadow-sm transition-colors"
                    placeholder="e.g. Finals Mastery"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-violet-500/80 uppercase tracking-widest mb-1.5 block">Topic (Optional)</label>
                  <input
                    type="text"
                    className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-violet-500 shadow-sm transition-colors"
                    placeholder="e.g. Applied Physics"
                    value={newDeckTopic}
                    onChange={(e) => setNewDeckTopic(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => saveMutation.mutate()}
          disabled={(!selectedDeck || (selectedDeck === 'new' && !newDeckName)) || saveMutation.isPending}
          className="w-full py-4 mt-8 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl text-base font-black hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 disabled:hover:scale-100"
        >
          {saveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <BookOpen className="w-5 h-5 fill-current opacity-20" />}
          Deploy to Deck
        </button>
      </div>

    </div>
  )
}
