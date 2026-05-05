'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import {
  ArrowLeft, HelpCircle, Loader2, CheckCircle2, XCircle,
  RotateCcw, Award, Target, ChevronRight, Zap, BookOpen, Trophy
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface MCQQuestion {
  question: string
  options: string[] | Record<string, string>
  correct_answer: string
  explanation: string
}

function normalizeOptions(opts: any): string[] {
  if (Array.isArray(opts)) return opts
  if (opts && typeof opts === 'object') return Object.values(opts)
  return []
}

export default function QuizPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  const [phase, setPhase] = useState<'loading' | 'config' | 'quiz' | 'results'>('loading')
  const [questions, setQuestions] = useState<MCQQuestion[]>([])
  const [count, setCount] = useState(10)
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})
  const [generating, setGenerating] = useState(false)

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  // Try to load pre-generated quiz first
  const { data: existingQuizzes, isLoading: loadingQuizzes } = useQuery({
    queryKey: ['resource-quizzes', resourceId],
    queryFn: () => libraryApi.getResourceQuizzes(resourceId).then(r => r.data),
  })

  useEffect(() => {
    if (loadingQuizzes) return
    const quizzes = existingQuizzes?.results || existingQuizzes || []
    const best = quizzes.find((q: any) => q.questions?.length >= 10) || quizzes[0]
    if (best?.questions?.length) {
      setQuestions(best.questions)
      setPhase('config')
    } else {
      setPhase('config')
    }
  }, [existingQuizzes, loadingQuizzes])

  const handleStart = async () => {
    // If we already have questions loaded, just start
    if (questions.length) {
      const sliced = questions.slice(0, count)
      setQuestions(sliced)
      setCurrent(0)
      setSelected({})
      setRevealed({})
      setPhase('quiz')
      return
    }
    setGenerating(true)
    try {
      const res = await libraryApi.generateQuiz(resourceId, 'mcq', 'undergrad', count)
      const qs = res.data.questions || res.data || []
      if (!qs.length) throw new Error('No questions')
      setQuestions(qs)
      setCurrent(0)
      setSelected({})
      setRevealed({})
      setPhase('quiz')
    } catch {
      toast.error('Failed to generate quiz. Try again.')
    } finally {
      setGenerating(false)
    }
  }

  const handleSelect = (opt: string) => {
    if (revealed[current]) return
    setSelected(s => ({ ...s, [current]: opt }))
  }

  const handleReveal = () => {
    if (!selected[current]) return
    setRevealed(r => ({ ...r, [current]: true }))
  }

  const handleNext = () => {
    if (current < questions.length - 1) {
      setCurrent(c => c + 1)
    } else {
      setPhase('results')
    }
  }

  const handleRestart = () => {
    setCurrent(0)
    setSelected({})
    setRevealed({})
    setPhase('config')
  }

  const score = questions.filter((q, i) => selected[i] === q.correct_answer).length
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0
  const passed = pct >= 60

  // ── Loading ──────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-orange-500/10 rounded-3xl flex items-center justify-center animate-pulse">
            <HelpCircle className="w-8 h-8 text-orange-500" />
          </div>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Loading Quiz...</p>
        </div>
      </div>
    )
  }

  // ── Config ───────────────────────────────────────────────────────
  if (phase === 'config') {
    const hasPrebuilt = questions.length > 0
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 flex items-center gap-4 border-b border-white/5">
          <Link href={`/library/${resourceId}`} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Mastery Quiz</p>
            <h1 className="text-sm font-black text-white truncate max-w-xs">{resource?.title || 'Loading...'}</h1>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md space-y-8">
            {/* Icon */}
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-24 h-24 bg-orange-500/10 border border-orange-500/20 rounded-[2rem] flex items-center justify-center">
                <HelpCircle className="w-12 h-12 text-orange-500" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-white tracking-tighter">Mastery Quiz</h2>
                <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                  {hasPrebuilt
                    ? `${questions.length} questions ready from your study kit.`
                    : 'AI-generated multiple choice questions from your material.'}
                </p>
              </div>
              {hasPrebuilt && (
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Pre-generated · Ready instantly</span>
                </div>
              )}
            </div>

            {/* Count picker */}
            <div className="space-y-3">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block text-center">
                Number of Questions
              </label>
              <div className="grid grid-cols-4 gap-3">
                {[5, 10, 15, 20].map(n => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    disabled={hasPrebuilt && n > questions.length}
                    className={cn(
                      'py-4 rounded-2xl text-sm font-black transition-all border',
                      count === n
                        ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/30 scale-105'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:border-orange-500/40 hover:bg-orange-500/5',
                      hasPrebuilt && n > questions.length ? 'opacity-30 cursor-not-allowed' : ''
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Start button */}
            <button
              onClick={handleStart}
              disabled={generating}
              className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-base hover:bg-orange-400 active:scale-95 transition-all shadow-2xl shadow-orange-500/30 flex items-center justify-center gap-3 disabled:opacity-60"
            >
              {generating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</>
              ) : (
                <><Zap className="w-5 h-5" /> Start Quiz</>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Results ──────────────────────────────────────────────────────
  if (phase === 'results') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <div className="px-6 py-5 flex items-center gap-4 border-b border-white/5">
          <Link href={`/library/${resourceId}`} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Results</p>
            <h1 className="text-sm font-black text-white truncate max-w-xs">{resource?.title}</h1>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md space-y-8 text-center">
            <div className={cn(
              'w-28 h-28 mx-auto rounded-full flex items-center justify-center shadow-2xl',
              passed ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-orange-500 shadow-orange-500/30'
            )}>
              {passed ? <Trophy className="w-14 h-14 text-white" /> : <Target className="w-14 h-14 text-white" />}
            </div>

            <div>
              <h2 className="text-4xl font-black text-white tracking-tighter">
                {passed ? 'Crushed it!' : 'Keep grinding!'}
              </h2>
              <p className="text-slate-400 mt-2">{score} / {questions.length} correct</p>
            </div>

            {/* Score ring */}
            <div className="relative w-36 h-36 mx-auto">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="6" className="text-white/5" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`}
                  className={passed ? 'text-emerald-400' : 'text-orange-400'}
                  style={{ transition: 'stroke-dashoffset 1.2s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-white">{pct}%</span>
                <span className="text-xs text-slate-500 font-bold">Score</span>
              </div>
            </div>

            {/* Per-question breakdown */}
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, i) => {
                const correct = selected[i] === q.correct_answer
                return (
                  <div key={i} className={cn(
                    'h-2 rounded-full',
                    correct ? 'bg-emerald-500' : 'bg-red-500/60'
                  )} title={`Q${i + 1}: ${correct ? 'Correct' : 'Wrong'}`} />
                )
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRestart}
                className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-black hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Try Again
              </button>
              <Link
                href={`/library/${resourceId}`}
                className="flex-1 py-4 rounded-2xl bg-orange-500 text-white font-black hover:bg-orange-400 transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
              >
                <BookOpen className="w-4 h-4" /> Back to Notes
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Quiz ─────────────────────────────────────────────────────────
  const q = questions[current]
  const options = normalizeOptions(q?.options)
  const isRevealed = revealed[current]
  const chosenAnswer = selected[current]

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={handleRestart} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Question {current + 1} of {questions.length}</p>
            <h1 className="text-sm font-black text-white truncate max-w-xs">{resource?.title}</h1>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-black text-slate-500">{Object.keys(revealed).length} answered</p>
          <p className="text-xs font-black text-emerald-400">{Object.entries(revealed).filter(([i]) => selected[parseInt(i)] === questions[parseInt(i)]?.correct_answer).length} correct</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-0.5 px-6 pt-4 flex-shrink-0">
        {questions.map((q, i) => (
          <div key={i} className={cn('flex-1 h-1 rounded-full transition-all duration-500', {
            'bg-emerald-500': revealed[i] && selected[i] === q.correct_answer,
            'bg-red-500': revealed[i] && selected[i] !== q.correct_answer,
            'bg-orange-500': i === current && !revealed[i],
            'bg-white/10': i !== current && !revealed[i],
          })} />
        ))}
      </div>

      {/* Question body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 max-w-2xl mx-auto w-full">
        {/* Question card */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-3 block">Multiple Choice</span>
          <p className="text-lg font-bold text-white leading-relaxed">{q?.question}</p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i)
            const isCorrect = opt === q.correct_answer
            const isChosen = chosenAnswer === opt
            return (
              <button
                key={i}
                onClick={() => handleSelect(opt)}
                className={cn(
                  'w-full text-left flex items-center gap-4 p-4 rounded-2xl border text-sm font-bold transition-all',
                  !isRevealed && !isChosen && 'bg-white/5 border-white/10 text-slate-300 hover:border-orange-500/40 hover:bg-orange-500/5',
                  !isRevealed && isChosen && 'bg-orange-500/10 border-orange-500 text-orange-300',
                  isRevealed && isCorrect && 'bg-emerald-500/10 border-emerald-500 text-emerald-300',
                  isRevealed && !isCorrect && isChosen && 'bg-red-500/10 border-red-500 text-red-300',
                  isRevealed && !isCorrect && !isChosen && 'bg-white/5 border-white/5 text-slate-600 opacity-40',
                )}
              >
                <span className={cn(
                  'w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 transition-all',
                  !isRevealed && isChosen ? 'bg-orange-500 text-white' : 'bg-white/10 text-slate-400',
                  isRevealed && isCorrect ? 'bg-emerald-500 text-white' : '',
                  isRevealed && !isCorrect && isChosen ? 'bg-red-500 text-white' : '',
                )}>
                  {isRevealed
                    ? isCorrect ? <CheckCircle2 className="w-4 h-4" />
                    : isChosen ? <XCircle className="w-4 h-4" />
                    : letter
                    : letter}
                </span>
                <span className="flex-1 leading-snug">{opt}</span>
              </button>
            )
          })}
        </div>

        {/* Explanation */}
        {isRevealed && q?.explanation && (
          <div className="bg-sky-500/10 border border-sky-500/20 rounded-2xl p-5 animate-in slide-in-from-bottom-2 duration-300">
            <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest mb-2">Explanation</p>
            <p className="text-sm text-sky-200 leading-relaxed">{q.explanation}</p>
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="px-6 pb-8 pt-4 flex-shrink-0 max-w-2xl mx-auto w-full">
        {!isRevealed ? (
          <button
            onClick={handleReveal}
            disabled={!chosenAnswer}
            className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-base hover:bg-orange-400 active:scale-95 transition-all shadow-2xl shadow-orange-500/20 disabled:opacity-30 disabled:pointer-events-none"
          >
            Check Answer
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-base hover:bg-orange-400 active:scale-95 transition-all shadow-2xl shadow-orange-500/20 flex items-center justify-center gap-3"
          >
            {current < questions.length - 1
              ? <><span>Next Question</span><ChevronRight className="w-5 h-5" /></>
              : <><span>See Results</span><Award className="w-5 h-5" /></>}
          </button>
        )}
      </div>
    </div>
  )
}
