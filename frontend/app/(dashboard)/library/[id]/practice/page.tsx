'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, aiApi } from '@/lib/api'
import {
  ArrowLeft, Wand2, Loader2, Send, Lightbulb,
  CheckCircle2, XCircle, TrendingUp, Award, Target,
  RotateCcw, BookOpen, Sparkles, ChevronRight
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Question {
  question: string
  type: string
  hint?: string
  model_answer: string
}

interface GradeResult {
  score: number
  grade: string
  correct: boolean
  feedback: string
  strengths: string[]
  improvements: string[]
  tip: string
}

const GRADE_COLOR = (g: string) => {
  if (['A', 'A+', 'A-'].includes(g)) return 'text-emerald-400'
  if (['B', 'B+', 'B-'].includes(g)) return 'text-sky-400'
  if (['C', 'C+', 'C-'].includes(g)) return 'text-yellow-400'
  return 'text-red-400'
}

const SCORE_BG = (s: number) => {
  if (s >= 80) return 'bg-emerald-500'
  if (s >= 60) return 'bg-sky-500'
  if (s >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

export default function PracticePage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  const [phase, setPhase] = useState<'loading' | 'test' | 'results'>('loading')
  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [grades, setGrades] = useState<Record<number, GradeResult>>({})
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({})
  const [grading, setGrading] = useState(false)
  const [showHint, setShowHint] = useState(false)

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  useEffect(() => {
    const load = async () => {
      try {
        // Check for pre-generated practice questions in ai_notes_json
        const res = await libraryApi.getResource(resourceId)
        const existing = res.data.ai_notes_json?.practice_questions
        if (existing?.length) {
          setQuestions(existing)
          setPhase('test')
          return
        }
        // Generate fresh
        const gen = await libraryApi.generatePracticeQuestions(resourceId, 'medium', 10)
        const qs = gen.data.questions || gen.data || []
        if (!qs.length) throw new Error('No questions')
        setQuestions(qs)
        setPhase('test')
      } catch {
        toast.error('Failed to load practice questions.')
        setPhase('loading')
      }
    }
    load()
  }, [resourceId])

  const handleSubmit = async () => {
    const answer = answers[current]?.trim()
    if (!answer) return
    setGrading(true)
    try {
      const q = questions[current]
      const res = await aiApi.gradeAnswer(resourceId, q.question, answer, q.model_answer)
      setGrades(g => ({ ...g, [current]: res.data }))
      setSubmitted(s => ({ ...s, [current]: true }))
    } catch {
      setGrades(g => ({ ...g, [current]: { score: 0, grade: 'F', correct: false, feedback: 'Grading failed.', strengths: [], improvements: [], tip: '' } }))
      setSubmitted(s => ({ ...s, [current]: true }))
    } finally {
      setGrading(false)
    }
  }

  const handleNext = () => {
    if (current < questions.length - 1) {
      setCurrent(c => c + 1)
      setShowHint(false)
    } else {
      setPhase('results')
    }
  }

  const handleRestart = () => {
    setCurrent(0)
    setAnswers({})
    setGrades({})
    setSubmitted({})
    setShowHint(false)
    setPhase('test')
  }

  const totalAnswered = Object.keys(submitted).length
  const totalScore = Object.values(grades).reduce((sum, g) => sum + (g.score || 0), 0)
  const avgScore = totalAnswered > 0 ? Math.round(totalScore / totalAnswered) : 0

  // ── Loading ──────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center max-w-sm px-6">
          <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tighter">Preparing Drill</h2>
            <p className="text-slate-400 mt-2 text-sm">Generating AI-graded practice questions from your material...</p>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Results ──────────────────────────────────────────────────────
  if (phase === 'results') {
    const passed = avgScore >= 60
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <div className="px-6 py-5 flex items-center gap-4 border-b border-white/5">
          <Link href={`/library/${resourceId}`} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Session Complete</p>
            <h1 className="text-sm font-black text-white truncate max-w-xs">{resource?.title}</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-6">
          <div className="text-center space-y-4 py-6">
            <div className={cn('w-24 h-24 mx-auto rounded-full flex items-center justify-center shadow-2xl', passed ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-orange-500 shadow-orange-500/30')}>
              {passed ? <Award className="w-12 h-12 text-white" /> : <Target className="w-12 h-12 text-white" />}
            </div>
            <div>
              <h2 className="text-3xl font-black text-white tracking-tighter">{passed ? 'Solid work!' : 'Keep drilling!'}</h2>
              <p className="text-slate-400 mt-1">{totalAnswered} of {questions.length} answered · avg {avgScore}/100</p>
            </div>

            {/* Score ring */}
            <div className="relative w-32 h-32 mx-auto">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="6" className="text-white/5" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - avgScore / 100)}`}
                  className={passed ? 'text-emerald-400' : 'text-orange-400'}
                  style={{ transition: 'stroke-dashoffset 1.2s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-white">{avgScore}</span>
                <span className="text-xs text-slate-500 font-bold">/ 100</span>
              </div>
            </div>
          </div>

          {/* Per-question breakdown */}
          <div className="space-y-2">
            {questions.map((q, i) => {
              const g = grades[i]
              return (
                <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-2xl px-4 py-3">
                  <span className="text-xs text-slate-500 w-5 shrink-0">Q{i + 1}</span>
                  <p className="flex-1 text-xs text-slate-400 truncate">{q.question}</p>
                  {g ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-14 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', SCORE_BG(g.score))} style={{ width: `${g.score}%` }} />
                      </div>
                      <span className={cn('text-xs font-black w-5', GRADE_COLOR(g.grade))}>{g.grade}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-600 shrink-0">Skipped</span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex gap-3 pb-6">
            <button onClick={handleRestart} className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-black hover:bg-white/10 transition-all flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" /> Try Again
            </button>
            <Link href={`/library/${resourceId}`} className="flex-1 py-4 rounded-2xl bg-emerald-500 text-white font-black hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
              <BookOpen className="w-4 h-4" /> Back to Notes
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Test ─────────────────────────────────────────────────────────
  const q = questions[current]
  const grade = grades[current]
  const isSubmitted = submitted[current]

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={handleRestart} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div>
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Question {current + 1} of {questions.length}</p>
            <h1 className="text-sm font-black text-white truncate max-w-xs">{resource?.title}</h1>
          </div>
        </div>
        <span className="text-xs font-black text-slate-500">{totalAnswered} answered · avg {avgScore}/100</span>
      </div>

      {/* Progress */}
      <div className="flex gap-0.5 px-6 pt-4 flex-shrink-0">
        {questions.map((_, i) => (
          <div key={i} className={cn('flex-1 h-1 rounded-full transition-all duration-500', {
            'bg-emerald-500': submitted[i] && grades[i]?.correct,
            'bg-red-500': submitted[i] && !grades[i]?.correct,
            'bg-emerald-400': i === current && !submitted[i],
            'bg-white/10': i !== current && !submitted[i],
          })} />
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 max-w-2xl mx-auto w-full">
        {/* Question */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3 block">
            {q?.type?.replace('_', ' ') || 'Short Answer'}
          </span>
          <p className="text-lg font-bold text-white leading-relaxed">{q?.question}</p>

          {q?.hint && (
            <div className="mt-4">
              {!showHint ? (
                <button onClick={() => setShowHint(true)} className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors">
                  <Lightbulb className="w-3.5 h-3.5" /> Show hint
                </button>
              ) : (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 mt-2">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300">{q.hint}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Answer / Grade */}
        {!isSubmitted ? (
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Your Answer</label>
            <textarea
              value={answers[current] || ''}
              onChange={e => setAnswers(a => ({ ...a, [current]: e.target.value }))}
              placeholder="Write your answer here... Be as detailed as you can."
              rows={6}
              disabled={grading}
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white text-sm leading-relaxed resize-none focus:outline-none focus:border-emerald-500/50 placeholder:text-slate-600 transition-all"
            />
            <button
              onClick={handleSubmit}
              disabled={grading || !answers[current]?.trim()}
              className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black hover:bg-emerald-400 active:scale-95 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {grading ? <><Loader2 className="w-4 h-4 animate-spin" /> Grading...</> : <><Send className="w-4 h-4" /> Submit Answer</>}
            </button>
          </div>
        ) : grade && (
          <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
            {/* Score banner */}
            <div className={cn('rounded-3xl p-5 flex items-center gap-4', grade.correct ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20')}>
              <div className={cn('w-16 h-16 rounded-full flex flex-col items-center justify-center shrink-0 text-white font-black', SCORE_BG(grade.score))}>
                <span className="text-xl leading-none">{grade.score}</span>
                <span className="text-[10px] opacity-70">/100</span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {grade.correct ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                  <span className={cn('text-sm font-black', GRADE_COLOR(grade.grade))}>Grade: {grade.grade}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{grade.feedback}</p>
              </div>
            </div>

            {/* Your answer */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Your answer</p>
              <p className="text-sm text-slate-300 leading-relaxed">{answers[current]}</p>
            </div>

            {/* Strengths */}
            {grade.strengths?.length > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> What you got right
                </p>
                <ul className="space-y-1">
                  {grade.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-emerald-300 flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0">•</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Improvements */}
            {grade.improvements?.length > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
                <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> How to improve
                </p>
                <ul className="space-y-1">
                  {grade.improvements.map((s, i) => (
                    <li key={i} className="text-xs text-orange-300 flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0">•</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Study tip */}
            {grade.tip && (
              <div className="bg-sky-500/10 border border-sky-500/20 rounded-2xl p-4 flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                <p className="text-xs text-sky-300"><span className="font-black">Study tip:</span> {grade.tip}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Next button */}
      {isSubmitted && (
        <div className="px-6 pb-8 pt-4 flex-shrink-0 max-w-2xl mx-auto w-full">
          <button
            onClick={handleNext}
            className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black hover:bg-emerald-400 active:scale-95 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3"
          >
            {current < questions.length - 1
              ? <><span>Next Question</span><ChevronRight className="w-5 h-5" /></>
              : <><span>See Results</span><Award className="w-5 h-5" /></>}
          </button>
        </div>
      )}
    </div>
  )
}
