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
      <div className="relative">
        <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-amber-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-orange-500/30">
          <HelpCircle className="w-11 h-11 text-white" />
        </div>
        <div className="absolute inset-0 bg-orange-500/20 blur-2xl rounded-full -z-10 animate-pulse" />
      </div>

      <div className="space-y-2">
        <h2 className="text-3xl font-black text-white tracking-tight">Mastery Quiz</h2>
        <p className="text-slate-400 text-sm max-w-xs mx-auto font-medium leading-relaxed">
          Multiple choice questions generated from your material. Choose how many below.
        </p>
      </div>

      {/* Count picker */}
      <div className="w-full max-w-xs space-y-3">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Number of Questions</label>
        <div className="grid grid-cols-4 gap-2">
          {[5, 10, 15, 20].map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={cn(
                'py-3.5 rounded-2xl text-sm font-black transition-all border',
                count === n
                  ? 'bg-orange-500 text-white border-transparent shadow-lg shadow-orange-500/30 scale-[1.03]'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:border-orange-500/40 hover:bg-white/8'
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-xs">
        <button
          onClick={onClose}
          className="flex-1 py-3.5 rounded-2xl bg-white/5 border border-white/8 text-sm font-black text-slate-400 hover:bg-white/8 hover:text-slate-200 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={() => onStart(count)}
          disabled={isGenerating}
          className="flex-1 py-3.5 rounded-2xl bg-orange-500 text-white text-sm font-black hover:bg-orange-400 active:scale-95 transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 disabled:opacity-60"
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

  const normalizeOptions = (opts: any): string[] => {
    if (Array.isArray(opts)) return opts
    if (opts && typeof opts === 'object') return Object.values(opts)
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
        <div className="relative">
          <div className={cn(
            'w-24 h-24 rounded-[2.5rem] flex items-center justify-center shadow-2xl',
            passed
              ? 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-500/30'
              : 'bg-gradient-to-br from-orange-400 to-amber-500 shadow-orange-500/30'
          )}>
            {passed ? <Award className="w-11 h-11 text-white" /> : <Target className="w-11 h-11 text-white" />}
          </div>
          <div className={cn('absolute inset-0 blur-2xl rounded-full -z-10 animate-pulse', passed ? 'bg-emerald-500/20' : 'bg-orange-500/20')} />
        </div>

        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">
            {passed ? 'Great work!' : 'Keep practicing!'}
          </h2>
          <p className="text-slate-400 text-sm mt-1 font-medium">{correct} / {questions.length} correct</p>
        </div>

        {/* Score ring */}
        <div className="relative w-28 h-28">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/5" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`}
              className={passed ? 'text-emerald-500' : 'text-orange-400'}
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-white">{pct}%</span>
            <span className="text-xs text-slate-500 font-bold">Score</span>
          </div>
        </div>

        <div className="flex gap-3 w-full max-w-xs">
          <button
            onClick={onRestart}
            className="flex-1 py-3.5 rounded-2xl bg-white/5 border border-white/8 text-sm font-black text-slate-300 hover:bg-white/8 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> New Quiz
          </button>
          <button
            onClick={onFinish}
            className="flex-1 py-3.5 rounded-2xl bg-orange-500 text-white text-sm font-black hover:bg-orange-400 active:scale-95 transition-all shadow-lg shadow-orange-500/25"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress */}
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-3 font-bold">
          <span className="text-slate-400">Question <span className="text-white font-black">{current + 1}</span> of {questions.length}</span>
          <span>{Object.keys(revealed).length} answered</span>
        </div>
        <div className="flex gap-1">
          {questions.map((q, i) => (
            <div key={i} className={cn('flex-1 h-2 rounded-full transition-all duration-500', {
              'bg-emerald-500 shadow-sm shadow-emerald-500/40': revealed[i] && selected[i] === q.correct_answer,
              'bg-rose-500 shadow-sm shadow-rose-500/40': revealed[i] && selected[i] !== q.correct_answer,
              'bg-orange-500 shadow-sm shadow-orange-500/40': i === current && !revealed[i],
              'bg-white/10': i !== current && !revealed[i],
            })} />
          ))}
        </div>
      </div>

      {/* Question + options */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
        {/* Question card */}
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500 mb-2 block">Multiple Choice</span>
          <p className="text-[15px] font-semibold text-white leading-relaxed">{q.question}</p>
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
                  'w-full text-left flex items-center gap-3 p-4 rounded-2xl border text-sm font-semibold transition-all active:scale-[0.99]',
                  !isRevealed && !isChosen && 'bg-white/[0.02] border-white/8 text-slate-300 hover:bg-white/5 hover:border-orange-500/30',
                  !isRevealed && isChosen && 'bg-orange-500/10 border-orange-500/40 text-orange-300',
                  isRevealed && isCorrect && 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300',
                  isRevealed && !isCorrect && isChosen && 'bg-rose-500/10 border-rose-500/40 text-rose-300',
                  isRevealed && !isCorrect && !isChosen && 'bg-white/[0.01] border-white/5 text-slate-600 opacity-60',
                )}
              >
                <span className={cn(
                  'w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 transition-all',
                  !isRevealed && !isChosen && 'bg-white/5 text-slate-500',
                  !isRevealed && isChosen && 'bg-orange-500 text-white',
                  isRevealed && isCorrect && 'bg-emerald-500 text-white',
                  isRevealed && !isCorrect && isChosen && 'bg-rose-500 text-white',
                  isRevealed && !isCorrect && !isChosen && 'bg-white/5 text-slate-600',
                )}>
                  {isRevealed
                    ? (isCorrect ? <CheckCircle2 className="w-4 h-4" /> : isChosen ? <XCircle className="w-4 h-4" /> : letter)
                    : letter}
                </span>
                <span className="flex-1 leading-snug">{opt}</span>
              </button>
            )
          })}
        </div>

        {/* Explanation */}
        {isRevealed && q.explanation && (
          <div className="bg-sky-500/[0.06] rounded-2xl p-4 border border-sky-500/20 animate-in slide-in-from-bottom-2 duration-300">
            <p className="text-[10px] font-black text-sky-400 uppercase tracking-[0.2em] mb-2">Explanation</p>
            <p className="text-sm text-sky-300/80 leading-relaxed font-medium">{q.explanation}</p>
          </div>
        )}
      </div>

      {/* Action button */}
      <div className="px-5 pb-5 flex-shrink-0">
        {!isRevealed ? (
          <button
            onClick={handleReveal}
            disabled={!chosenAnswer}
            className="w-full py-3.5 rounded-2xl bg-orange-500 text-white text-sm font-black hover:bg-orange-400 active:scale-[0.98] transition-all shadow-lg shadow-orange-500/25 disabled:opacity-40 disabled:pointer-events-none"
          >
            Check Answer
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="w-full py-3.5 rounded-2xl bg-orange-500 text-white text-sm font-black hover:bg-orange-400 active:scale-[0.98] transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
          >
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
