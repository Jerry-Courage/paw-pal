'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import {
  X, Sparkles, BookOpen, CheckSquare, AlignLeft,
  Shuffle, ChevronRight, Loader2, Zap
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  resourceId?: number
  onClose: () => void
  onGenerated?: (quiz: any) => void
}

const LEVELS = ['HS', 'Undergrad', 'Graduate', 'Professional']
const FORMATS = [
  { id: 'flashcard', label: 'Flashcards', sub: 'Spaced repetition cards with Q&A', icon: BookOpen, color: 'text-sky-500 bg-sky-50 dark:bg-sky-950' },
  { id: 'mcq', label: 'Multiple Choice', sub: 'Traditional 4-option quiz questions', icon: CheckSquare, color: 'text-violet-500 bg-violet-50 dark:bg-violet-950' },
  { id: 'short', label: 'Short Answer', sub: 'Conceptual text-based responses', icon: AlignLeft, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950' },
  { id: 'mixed', label: 'Mixed Mode', sub: 'A balanced variety of all types', icon: Shuffle, color: 'text-orange-500 bg-orange-50 dark:bg-orange-950' },
]

export default function QuizGeneratorModal({ resourceId, onClose, onGenerated }: Props) {
  const [selectedResource, setSelectedResource] = useState<number | null>(resourceId || null)
  const [format, setFormat] = useState('flashcard')
  const [level, setLevel] = useState('Undergrad')
  const [depth, setDepth] = useState(40)
  const [count, setCount] = useState(10)
  const [generated, setGenerated] = useState<any>(null)

  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then((r) => r.data),
    enabled: !resourceId,
  })
  const resources = resourcesData?.results || []

  const mutation = useMutation({
    mutationFn: () => libraryApi.generateQuiz(selectedResource!, format, level.toLowerCase(), count),
    onSuccess: (res) => {
      setGenerated(res.data)
      onGenerated?.(res.data)
      toast.success('Study pack generated!')
    },
    onError: () => toast.error('Generation failed. Check your OpenRouter API key.'),
  })

  const selectedFmt = FORMATS.find((f) => f.id === format)!
  const estimatedCards = Math.round(count * (depth / 100) + count * 0.5)

  if (generated) {
    return <QuizPreview quiz={generated} onClose={onClose} onRegenerate={() => setGenerated(null)} />
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-3xl shadow-2xl flex overflow-hidden max-h-[90vh]">

        {/* Left — config */}
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-sky-50 dark:bg-sky-950 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-sky-500" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Quiz & Flashcard Generator</h2>
                <p className="text-xs text-gray-400">Transform your static resources into active learning tools.</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Step 1 — Source */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center text-white text-xs font-bold">1</div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">PRIMARY CONTEXT SOURCE</span>
                <button className="ml-auto text-xs text-sky-500 hover:underline">Manage Files</button>
              </div>
              {resourceId ? (
                <div className="border-2 border-sky-500 bg-sky-50 dark:bg-sky-950/50 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-sky-100 dark:bg-sky-900 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-sky-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                      {resources.find((r: any) => r.id === resourceId)?.title || 'Selected Resource'}
                    </div>
                    <div className="text-xs text-gray-400">DOCUMENT</div>
                  </div>
                  <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {resources.slice(0, 4).map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedResource(r.id)}
                      className={cn(
                        'p-3 rounded-xl border-2 text-left flex items-center gap-2 transition-all',
                        selectedResource === r.id
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/50'
                          : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                      )}
                    >
                      <div className="w-7 h-7 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center text-sm flex-shrink-0">
                        {r.resource_type === 'pdf' ? '📄' : r.resource_type === 'video' ? '🎥' : '💻'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate text-gray-700 dark:text-gray-300">{r.title}</div>
                        <div className="text-xs text-gray-400 uppercase">{r.resource_type}</div>
                      </div>
                    </button>
                  ))}
                  {resources.length === 0 && (
                    <div className="col-span-2 text-center py-6 text-gray-400 text-sm border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                      No resources yet. Upload a file first.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2 — Difficulty */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center text-white text-xs font-bold">2</div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">DIFFICULTY & AI DEPTH</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-2">Academic Level
                    <span className="ml-2 text-sky-500">Suggested for {level}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {LEVELS.map((l) => (
                      <button
                        key={l}
                        onClick={() => setLevel(l)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                          level === l
                            ? 'bg-sky-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                    <span>Concept Depth</span>
                    <span className="text-sky-500 font-medium">{depth}% Depth</span>
                  </div>
                  <input
                    type="range" min={10} max={100} step={10}
                    value={depth}
                    onChange={(e) => setDepth(Number(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                  <div className="flex justify-between text-xs text-gray-300 dark:text-gray-600 mt-1">
                    <span>Surface Facts</span>
                    <span>Deep Logic</span>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xs text-gray-400 mb-2">Number of questions</div>
                <div className="flex gap-2">
                  {[5, 10, 15, 20, 25].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        count === n
                          ? 'bg-sky-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 3 — Format */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center text-white text-xs font-bold">3</div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">QUESTION FORMAT</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={cn(
                      'p-3 rounded-xl border-2 text-left transition-all',
                      format === f.id
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/50'
                        : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                    )}
                  >
                    <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-2', f.color)}>
                      <f.icon className="w-4 h-4" />
                    </div>
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">{f.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{f.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800">
            <div className="text-xs text-gray-400">
              Est. <span className="text-sky-500 font-medium">~{estimatedCards} unique {format === 'flashcard' ? 'flashcards' : 'questions'}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !selectedResource}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {mutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                ) : (
                  <>Generate Study Pack <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right — live preview */}
        <div className="w-72 bg-gray-50 dark:bg-gray-950 border-l border-gray-100 dark:border-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 tracking-wider">LIVE INSIGHTS</span>
              <span className="text-xs bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded-full">AI V4.5 Model</span>
            </div>
          </div>
          <div className="flex-1 p-4 space-y-4">
            {/* Sample preview card */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-3">
              <div className="text-xs text-gray-400 mb-2">AI Draft Sample</div>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded w-3/4 mb-1.5" />
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded w-1/2 mb-3" />
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs text-gray-500 dark:text-gray-400 italic text-center">
                "{selectedFmt.label === 'Flashcards'
                  ? 'What is the primary mechanism that triggers...'
                  : selectedFmt.label === 'Multiple Choice'
                  ? 'Which of the following best describes...'
                  : 'Explain in your own words...'}"
              </div>
              <div className="flex gap-2 mt-3">
                <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded" />
                <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded" />
              </div>
            </div>

            <div className="bg-sky-50 dark:bg-sky-950/50 rounded-xl p-3 text-xs text-sky-600 dark:text-sky-400 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 flex-shrink-0" />
              AUTO-OPTIMIZING FOR SPACED REPETITION
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="w-6 h-6 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">⏱</div>
                <div>
                  <div className="font-medium text-gray-700 dark:text-gray-300">Estimated Content</div>
                  <div>~{estimatedCards} unique {format === 'flashcard' ? 'flashcards' : 'questions'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="w-6 h-6 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">⚡</div>
                <div>
                  <div className="font-medium text-gray-700 dark:text-gray-300">Processing Time</div>
                  <div>Under 15 seconds</div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
              <div className="text-xs font-semibold text-gray-400 tracking-wider">SETTINGS</div>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input type="checkbox" defaultChecked className="accent-sky-500" />
                Export for Anki
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input type="checkbox" className="accent-sky-500" />
                Include Summary
              </label>
            </div>

            <div className="bg-sky-50 dark:bg-sky-950/50 rounded-xl p-3 text-xs text-sky-600 dark:text-sky-400">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3 h-3" />
                <span className="font-semibold">AI POWERED</span>
              </div>
              Our "Third Member" AI will refine these questions based on your past performance.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function QuizPreview({ quiz, onClose, onRegenerate }: { quiz: any; onClose: () => void; onRegenerate: () => void }) {
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const questions = quiz.questions || []
  const q = questions[current]

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">{quiz.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{questions.length} questions generated</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {q && (
          <div
            className="card p-6 min-h-[180px] flex flex-col items-center justify-center text-center cursor-pointer mb-4 hover:shadow-md transition-shadow"
            onClick={() => setFlipped(!flipped)}
          >
            {!flipped ? (
              <>
                <div className="text-xs text-sky-500 font-semibold mb-3">
                  {quiz.format === 'flashcard' ? 'QUESTION' : `Q${current + 1}`}
                </div>
                <p className="text-gray-700 dark:text-gray-300 font-medium">{q.question || q.front}</p>
                {quiz.format === 'flashcard' && (
                  <p className="text-xs text-gray-400 mt-4">Click to reveal answer</p>
                )}
                {quiz.format === 'mcq' && q.options && (
                  <div className="grid grid-cols-2 gap-2 mt-4 w-full">
                    {Object.entries(q.options || {}).map(([k, v]: any) => (
                      <button key={k} className="btn-secondary text-xs py-2 text-left px-3">
                        <span className="font-bold mr-1">{k.toUpperCase()}.</span> {v}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-xs text-emerald-500 font-semibold mb-3">ANSWER</div>
                <p className="text-gray-700 dark:text-gray-300">{q.answer || q.back || q.correct_answer}</p>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => { setCurrent((c) => Math.max(0, c - 1)); setFlipped(false) }}
            disabled={current === 0}
            className="btn-secondary text-sm disabled:opacity-30"
          >
            ← Previous
          </button>
          <span className="text-sm text-gray-400">{current + 1} / {questions.length}</span>
          <button
            onClick={() => { setCurrent((c) => Math.min(questions.length - 1, c + 1)); setFlipped(false) }}
            disabled={current === questions.length - 1}
            className="btn-secondary text-sm disabled:opacity-30"
          >
            Next →
          </button>
        </div>

        <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          <button onClick={onRegenerate} className="btn-secondary flex-1 text-sm">Regenerate</button>
          <button onClick={onClose} className="btn-primary flex-1 text-sm">Save & Close</button>
        </div>
      </div>
    </div>
  )
}
