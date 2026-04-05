'use client'

import { useState } from 'react'
import { libraryApi } from '@/lib/api'
import { HelpCircle, Loader2, CheckCircle2, XCircle, RotateCcw, Award, Target, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MCQQuestion {
  question: string
  options: string[]
  correct_answer: string
  explanation: string
}

interface QuizConfigProps {
  onStart: (count: number) => void
  onClose: () => void
  isGenerating: boolean
}

function QuizConfig({ onStart, onClose, isGenerating }: QuizConfigProps) {
  const [count, setCount] = useState(10)
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 sm:p-10 text-center space-y-8">
      <div className="w-20 h-20 bg-orange-500/10 rounded-3xl flex items-center justify-center">
        <HelpCircle className="w-10 h-10 text-orange-500" />
      </div>
      <div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">Mastery Quiz</h2>
        <p className="text-slate-500 mt-2 text-sm max-w-sm">Multiple choice questions generated from your material. Choose your number below.</p>
      </div>

      {/* Count picker */}
      <div className="w-full max-w-xs space-y-3">
        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Number of Questions</label>
        <div className="grid grid-cols-4 gap-2">
          {[5, 10, 15, 20].map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={cn(
                'py-3 rounded-2xl text-sm font-black transition-all border',
                count === n
                  ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/30'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300'
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-xs">
        <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-black text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
          Cancel
        </button>
        <button
          onClick={() => onStart(count)}
          disabled={isGenerating}
          className="flex-1 py-3 rounded-2xl bg-orange-500 text-white text-sm font-black hover:bg-orange-600 active:scale-95 transition-all shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <>Start Quiz <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  )
}

interface MCQQuizProps {
  questions: MCQQuestion[]
  onFinish: () => void
  onRestart: () => void
}

function MCQQuiz({ questions, onFinish, onRestart }: MCQQuizProps) {
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})
  const [done, setDone] = useState(false)

  const q = questions[current] || { question: 'No question data available', options: [], correct_answer: '', explanation: '' }
  const isRevealed = revealed[current]
  const chosenAnswer = selected[current]

  // Normalization helper: AI sometimes returns an object for options instead of an array
  const normalizeOptions = (opts: any): string[] => {
    if (Array.isArray(opts)) return opts
    if (opts && typeof opts === 'object') {
      return Object.values(opts)
    }
    return []
  }

  const options = normalizeOptions(q.options)

  const handleSelect = (opt: string) => {
    if (isRevealed) return
    setSelected(s => ({ ...s, [current]: opt }))
  }

  const handleReveal = () => {
    if (!chosenAnswer) return
    setRevealed(r => ({ ...r, [current]: true }))
  }

  const handleNext = () => {
    if (current < questions.length - 1) {
      setCurrent(c => c + 1)
    } else {
      setDone(true)
    }
  }

  // Results screen
  if (done) {
    const correct = questions.filter((q, i) => selected[i] === q.correct_answer).length
    const pct = Math.round((correct / questions.length) * 100)
    const passed = pct >= 60
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center h-full space-y-6">
        <div className={cn('w-20 h-20 rounded-full flex items-center justify-center shadow-lg', passed ? 'bg-emerald-500' : 'bg-orange-400')}>
          {passed ? <Award className="w-10 h-10 text-white" /> : <Target className="w-10 h-10 text-white" />}
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">{passed ? 'Great work!' : 'Keep practicing!'}</h2>
          <p className="text-slate-500 text-sm mt-1">{correct} / {questions.length} correct</p>
        </div>
        {/* Score ring */}
        <div className="relative w-28 h-28">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100 dark:text-slate-800" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`}
              className={passed ? 'text-emerald-500' : 'text-orange-400'}
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{pct}%</span>
            <span className="text-xs text-slate-400">Score</span>
          </div>
        </div>
        <div className="flex gap-3 w-full max-w-xs">
          <button onClick={onRestart} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm font-black text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2">
            <RotateCcw className="w-4 h-4" /> New Quiz
          </button>
          <button onClick={onFinish} className="flex-1 py-3 rounded-2xl bg-orange-500 text-white text-sm font-black hover:bg-orange-600 active:scale-95 transition-all shadow-lg shadow-orange-500/30">
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span>Question {current + 1} of {questions.length}</span>
          <span>{Object.keys(revealed).length} answered</span>
        </div>
        <div className="flex gap-1">
          {questions.map((q, i) => (
            <div key={i} className={cn('flex-1 h-1.5 rounded-full transition-all', {
              'bg-emerald-400': revealed[i] && selected[i] === q.correct_answer,
              'bg-red-400': revealed[i] && selected[i] !== q.correct_answer,
              'bg-orange-400': i === current && !revealed[i],
              'bg-slate-200 dark:bg-slate-700': i !== current && !revealed[i],
            })} />
          ))}
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-2 block">Multiple Choice</span>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-relaxed">{q.question}</p>
        </div>

        {/* Options */}
        <div className="space-y-2">
          {options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i)
            const isCorrect = opt === q.correct_answer
            const isChosen = chosenAnswer === opt
            return (
              <button
                key={i}
                onClick={() => handleSelect(opt)}
                className={cn(
                  'w-full text-left flex items-center gap-3 p-3.5 rounded-2xl border text-sm font-bold transition-all',
                  !isRevealed && !isChosen && 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/10',
                  !isRevealed && isChosen && 'bg-orange-50 dark:bg-orange-900/20 border-orange-400 text-orange-700 dark:text-orange-300',
                  isRevealed && isCorrect && 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 text-emerald-700 dark:text-emerald-300',
                  isRevealed && !isCorrect && isChosen && 'bg-red-50 dark:bg-red-900/20 border-red-400 text-red-700 dark:text-red-300',
                  isRevealed && !isCorrect && !isChosen && 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-50',
                )}
              >
                <span className={cn('w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0',
                  !isRevealed && isChosen ? 'bg-orange-400 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500',
                  isRevealed && isCorrect ? 'bg-emerald-500 text-white' : '',
                  isRevealed && !isCorrect && isChosen ? 'bg-red-400 text-white' : '',
                )}>
                  {isRevealed ? (isCorrect ? <CheckCircle2 className="w-4 h-4" /> : isChosen ? <XCircle className="w-4 h-4" /> : letter) : letter}
                </span>
                <span className="flex-1 leading-snug">{opt}</span>
              </button>
            )
          })}
        </div>

        {/* Explanation */}
        {isRevealed && q.explanation && (
          <div className="bg-sky-50 dark:bg-sky-900/20 rounded-2xl p-4 border border-sky-200 dark:border-sky-800 animate-in slide-in-from-bottom-2">
            <p className="text-xs font-black text-sky-600 dark:text-sky-400 uppercase tracking-widest mb-1">Explanation</p>
            <p className="text-sm text-sky-800 dark:text-sky-300 leading-relaxed">{q.explanation}</p>
          </div>
        )}
      </div>

      {/* Action button */}
      <div className="px-4 pb-4 flex-shrink-0">
        {!isRevealed ? (
          <button
            onClick={handleReveal}
            disabled={!chosenAnswer}
            className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-black hover:bg-orange-600 active:scale-95 transition-all shadow-lg shadow-orange-500/30 disabled:opacity-40 disabled:pointer-events-none"
          >
            Check Answer
          </button>
        ) : (
          <button onClick={handleNext} className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-black hover:bg-orange-600 active:scale-95 transition-all shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2">
            {current < questions.length - 1 ? <>Next <ChevronRight className="w-4 h-4" /></> : <>See Results <Award className="w-4 h-4" /></>}
          </button>
        )}
      </div>
    </div>
  )
}

// Main exported container — handles config → quiz → results
interface MCQQuizContainerProps {
  resourceId: number
  onClose: () => void
}

export default function MCQQuizContainer({ resourceId, onClose }: MCQQuizContainerProps) {
  const [phase, setPhase] = useState<'config' | 'quiz'>('config')
  const [questions, setQuestions] = useState<MCQQuestion[]>([])
  const [loading, setLoading] = useState(false)

  const handleStart = async (count: number) => {
    setLoading(true)
    try {
      const res = await libraryApi.generateQuiz(resourceId, 'mcq', 'undergrad', count)
      // The API returns { questions: [...] } — normalize
      const qs = res.data.questions || res.data || []
      if (!qs.length) throw new Error('No questions returned')
      setQuestions(qs)
      setPhase('quiz')
    } catch {
      alert('Failed to generate quiz. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {phase === 'config' ? (
        <QuizConfig onStart={handleStart} onClose={onClose} isGenerating={loading} />
      ) : (
        <MCQQuiz
          questions={questions}
          onFinish={onClose}
          onRestart={() => setPhase('config')}
        />
      )}
    </div>
  )
}
