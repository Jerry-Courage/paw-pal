'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import {
  ArrowLeft, HelpCircle, Loader2, CheckCircle2, XCircle,
  RotateCcw, Award, Target, ChevronRight, Zap, BookOpen, Trophy
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { useStudyTimer } from '@/hooks/useStudyTimer'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { normalizeReadableMath } from '@/lib/mathFormatting'

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

// Normalize question objects from various AI model output formats
function normalizeQuestion(q: any): MCQQuestion | null {
  if (!q || typeof q !== 'object') return null

  // Find question text — try every known field name
  const questionText = (
    q.question || q.text || q.question_text || q.stem || q.prompt ||
    q.Question || q.Text || q.Stem || q.Prompt || ''
  ).toString().trim()

  // Find options — try every known field name, handle object maps too
  const rawOpts = q.options || q.choices || q.answers || q.alternatives ||
    q.Options || q.Choices || q.Answers || []
  const options = Array.isArray(rawOpts)
    ? rawOpts
    : typeof rawOpts === 'object' ? Object.values(rawOpts) : []

  // Find correct answer
  const correctAnswer = (
    q.correct_answer || q.answer || q.correct || q.correctAnswer ||
    q.correct_option || q.CorrectAnswer || q.Correct || ''
  ).toString().trim()

  // Find explanation
  const explanation = (
    q.explanation || q.rationale || q.reason || q.feedback ||
    q.Explanation || q.Rationale || ''
  ).toString().trim()

  // Skip questions with no text or no options
  if (!questionText || options.length < 2) return null

  return { question: questionText, options, correct_answer: correctAnswer, explanation }
}

export default function QuizPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  useStudyTimer(true)
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

  const { data: existingQuizzes, isLoading: loadingQuizzes } = useQuery({
    queryKey: ['resource-quizzes', resourceId],
    queryFn: () => libraryApi.getResourceQuizzes(resourceId).then(r => r.data),
  })

  useEffect(() => {
    if (loadingQuizzes) return
    const quizzes = existingQuizzes?.results || existingQuizzes || []
    const best = quizzes.find((q: any) => q.questions?.length >= 10) || quizzes[0]
    if (best?.questions?.length) {
      const normalized = best.questions
        .map(normalizeQuestion)
        .filter((q): q is MCQQuestion => q !== null)
      setQuestions(normalized)
    }
    setPhase('config')
  }, [existingQuizzes, loadingQuizzes])

  const handleStart = async () => {
    if (questions.length) {
      setQuestions(questions.slice(0, count))
      setCurrent(0); setSelected({}); setRevealed({})
      setPhase('quiz'); return
    }    setGenerating(true)
    try {
      const res = await libraryApi.generateQuiz(resourceId, 'mcq', 'undergrad', count)
      const qs = res.data.questions || res.data || []
      if (!qs.length) throw new Error('No questions')
      const normalized = qs.map(normalizeQuestion).filter((q): q is MCQQuestion => q !== null)
      if (!normalized.length) throw new Error('No valid questions after normalization')
      setQuestions(normalized); setCurrent(0); setSelected({}); setRevealed({})
      setPhase('quiz')
    } catch { toast.error('Failed to generate quiz. Try again.') }
    finally { setGenerating(false) }
  }

  const handleSelect = (opt: string) => { if (!revealed[current]) setSelected(s => ({ ...s, [current]: opt })) }
  const handleReveal = () => { if (selected[current]) setRevealed(r => ({ ...r, [current]: true })) }
  const handleNext = () => { current < questions.length - 1 ? setCurrent(c => c + 1) : setPhase('results') }
  const handleRestart = () => { setCurrent(0); setSelected({}); setRevealed({}); setPhase('config') }

  const score = questions.filter((q, i) => selected[i] === q.correct_answer).length
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0
  const passed = pct >= 60

  // ── Loading ──────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center animate-pulse">
          <HelpCircle className="w-6 h-6 text-orange-500" />
        </div>
        <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Loading Quiz...</p>
      </div>
    </div>
  )

  // ── Config ───────────────────────────────────────────────────────
  if (phase === 'config') {
    const hasPrebuilt = questions.length > 0
    return (
      <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0">
          <Link href={`/library/${resourceId}`} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-400" />
          </Link>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Mastery Quiz</p>
            <h1 className="text-sm font-black text-white truncate">{resource?.title || '...'}</h1>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
          <div className="w-full max-w-sm space-y-6">

            {/* Icon + title */}
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] flex items-center justify-center">
                <HelpCircle className="w-8 h-8 text-orange-500" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Mastery Quiz</h2>
                <p className="text-slate-500 mt-1 text-sm">
                  {hasPrebuilt ? `${questions.length} questions ready from your study kit.` : 'AI-generated questions from your material.'}
                </p>
              </div>
              {hasPrebuilt && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Pre-generated · Ready instantly</span>
                </div>
              )}
            </div>

            {/* Count picker */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Number of Questions</p>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 15, 20].map(n => (
                  <button key={n} onClick={() => setCount(n)}
                    disabled={hasPrebuilt && n > questions.length}
                    className={cn(
                      'py-3.5 rounded-xl text-sm font-black transition-all border',
                      count === n
                        ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/20'
                        : 'bg-white/5 text-slate-400 border-white/8 hover:border-orange-500/30 hover:text-white',
                      hasPrebuilt && n > questions.length ? 'opacity-25 cursor-not-allowed' : ''
                    )}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Start */}
            <button onClick={handleStart} disabled={generating}
              className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 active:scale-[0.98] transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2.5 disabled:opacity-50">
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                : <><Zap className="w-4 h-4" /> Start Quiz</>}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Results ──────────────────────────────────────────────────────
  if (phase === 'results') return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0">
        <Link href={`/library/${resourceId}`} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </Link>
        <div>
          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Results</p>
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
              <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Score</span>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              {passed ? '🎉 Crushed it!' : '💪 Keep grinding!'}
            </h2>
            <p className="text-slate-500 mt-1 text-sm">{score} / {questions.length} correct</p>
          </div>

          {/* Per-question breakdown */}
          <div className="grid grid-cols-5 gap-1.5">
            {questions.map((q, i) => (
              <div key={i} className={cn('h-1.5 rounded-full',
                selected[i] === q.correct_answer ? 'bg-emerald-500' : 'bg-red-500/60'
              )} title={`Q${i + 1}: ${selected[i] === q.correct_answer ? 'Correct' : 'Wrong'}`} />
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Correct', value: score, color: 'text-emerald-400' },
              { label: 'Wrong', value: questions.length - score, color: 'text-red-400' },
              { label: 'Score', value: `${pct}%`, color: passed ? 'text-emerald-400' : 'text-orange-400' },
            ].map(s => (
              <div key={s.label} className="bg-white/5 rounded-2xl p-3 border border-white/5">
                <p className={cn('text-xl font-black', s.color)}>{s.value}</p>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2.5">
            <button onClick={handleRestart}
              className="flex-1 py-3.5 rounded-2xl bg-white/5 border border-white/8 text-white font-black text-sm hover:bg-white/8 transition-all flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" /> Retry
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

  // ── Quiz ─────────────────────────────────────────────────────────
  const q = questions[current]
  const options = normalizeOptions(q?.options)
  const isRevealed = revealed[current]
  const chosenAnswer = selected[current]
  const correctCount = Object.entries(revealed).filter(([i]) => selected[parseInt(i)] === questions[parseInt(i)]?.correct_answer).length

  return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={handleRestart} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-400" />
          </button>
          <div>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">
              Question {current + 1} / {questions.length}
            </p>
            <h1 className="text-xs font-black text-slate-400 truncate max-w-[180px]">{resource?.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-black text-emerald-400">{correctCount} <span className="text-slate-600 text-xs">correct</span></p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-0.5 px-5 pt-3 shrink-0">
        {questions.map((q, i) => (
          <div key={i} className={cn('flex-1 h-1 rounded-full transition-all duration-500',
            revealed[i] && selected[i] === q.correct_answer ? 'bg-emerald-500' :
            revealed[i] && selected[i] !== q.correct_answer ? 'bg-red-500' :
            i === current ? 'bg-orange-500' : 'bg-white/8'
          )} />
        ))}
      </div>

      {/* Question + options */}
      <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-hide">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Question card */}
          <div className="bg-[#1a1a1a] border border-white/6 rounded-2xl p-5">
            <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-2 block">Multiple Choice</span>
            <ReactMarkdown 
              remarkPlugins={[remarkGfm, remarkMath]} 
              rehypePlugins={[rehypeKatex]}
              className="text-base font-bold text-white leading-relaxed prose prose-invert max-w-none"
            >
              {normalizeReadableMath(q?.question || '')}
            </ReactMarkdown>
          </div>

          {/* Options */}
          <div className="space-y-2.5">
            {options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i)
              const isCorrect = opt === q.correct_answer
              const isChosen = chosenAnswer === opt
              return (
                <button key={i} onClick={() => handleSelect(opt)}
                  className={cn(
                    'w-full text-left flex items-center gap-3.5 p-4 rounded-2xl border text-sm font-bold transition-all',
                    !isRevealed && !isChosen && 'bg-[#1a1a1a] border-white/6 text-slate-300 hover:border-orange-500/30 hover:bg-orange-500/5',
                    !isRevealed && isChosen && 'bg-orange-500/10 border-orange-500/60 text-orange-300',
                    isRevealed && isCorrect && 'bg-emerald-500/10 border-emerald-500/60 text-emerald-300',
                    isRevealed && !isCorrect && isChosen && 'bg-red-500/10 border-red-500/60 text-red-300',
                    isRevealed && !isCorrect && !isChosen && 'bg-[#1a1a1a] border-white/4 text-slate-600 opacity-40',
                  )}>
                  <span className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 transition-all',
                    !isRevealed && isChosen ? 'bg-orange-500 text-white' : 'bg-white/8 text-slate-400',
                    isRevealed && isCorrect ? 'bg-emerald-500 text-white' : '',
                    isRevealed && !isCorrect && isChosen ? 'bg-red-500 text-white' : '',
                  )}>
                    {isRevealed
                      ? isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : isChosen ? <XCircle className="w-3.5 h-3.5" />
                      : letter : letter}
                  </span>
                  <div className="flex-1 leading-snug">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath]} 
                      rehypePlugins={[rehypeKatex]}
                      className="prose prose-invert prose-sm max-w-none"
                    >
                      {normalizeReadableMath(opt || '')}
                    </ReactMarkdown>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Explanation */}
          {isRevealed && q?.explanation && (
            <div className="bg-sky-500/8 border border-sky-500/20 rounded-2xl p-4">
              <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest mb-1.5">Explanation</p>
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]} 
                rehypePlugins={[rehypeKatex]}
                className="text-sm text-sky-200/80 leading-relaxed prose prose-invert prose-sm max-w-none"
              >
                {normalizeReadableMath(q.explanation || '')}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {/* Footer action */}
      <div className="px-5 pb-6 pt-3 shrink-0 max-w-2xl mx-auto w-full">
        {!isRevealed ? (
          <button onClick={handleReveal} disabled={!chosenAnswer}
            className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 active:scale-[0.98] transition-all shadow-xl shadow-orange-500/20 disabled:opacity-30 disabled:pointer-events-none">
            Check Answer
          </button>
        ) : (
          <button onClick={handleNext}
            className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 active:scale-[0.98] transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2.5">
            {current < questions.length - 1
              ? <><span>Next Question</span><ChevronRight className="w-4 h-4" /></>
              : <><span>See Results</span><Award className="w-4 h-4" /></>}
          </button>
        )}
      </div>
    </div>
  )
}
