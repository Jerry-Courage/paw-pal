'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useStudyTimer } from '@/hooks/useStudyTimer'
import { normalizeForRendering } from '@/lib/mathFormatting'

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

function normalizeQuestion(q: any): MCQQuestion | null {
  if (!q || typeof q !== 'object') return null
  const questionText = (
    q.question || q.text || q.question_text || q.stem || q.prompt ||
    q.Question || q.Text || q.Stem || q.Prompt || ''
  ).toString().trim()
  const rawOpts = q.options || q.choices || q.answers || q.alternatives ||
    q.Options || q.Choices || q.Answers || []
  const options = Array.isArray(rawOpts)
    ? rawOpts
    : typeof rawOpts === 'object' ? Object.values(rawOpts) : []
  const correctAnswer = (
    q.correct_answer || q.answer || q.correct || q.correctAnswer ||
    q.correct_option || q.CorrectAnswer || q.Correct || ''
  ).toString().trim()
  const explanation = (
    q.explanation || q.rationale || q.reason || q.feedback ||
    q.Explanation || q.Rationale || ''
  ).toString().trim()
  if (!questionText || options.length < 2) return null
  return { question: questionText, options, correct_answer: correctAnswer, explanation }
}

export default function QuizPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  useStudyTimer(true)
  const qc = useQueryClient()

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
      const normalized = best.questions.map(normalizeQuestion).filter((q): q is MCQQuestion => q !== null)
      setQuestions(normalized)
    }
    setPhase('config')
  }, [existingQuizzes, loadingQuizzes])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== 'quiz') return
      const q = questions[current]
      const options = normalizeOptions(q?.options)
      if (!revealed[current]) {
        // 1-4 or A-D to select option
        const idx = ['1','2','3','4'].indexOf(e.key) !== -1
          ? parseInt(e.key) - 1
          : ['a','b','c','d'].indexOf(e.key.toLowerCase())
        if (idx >= 0 && idx < options.length) {
          setSelected(s => ({ ...s, [current]: options[idx] }))
        }
        if (e.code === 'Enter' && selected[current]) handleReveal()
      } else {
        if (e.code === 'Enter' || e.code === 'ArrowRight') handleNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, current, revealed, selected, questions]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = async () => {
    if (questions.length) {
      setQuestions(questions.slice(0, count))
      setCurrent(0); setSelected({}); setRevealed({})
      setPhase('quiz'); return
    }
    setGenerating(true)
    try {
      const res = await libraryApi.generateQuiz(resourceId, 'mcq', 'undergrad', count)
      const qs = res.data.questions || res.data || []
      if (!qs.length) throw new Error('No questions')
      const normalized = qs.map(normalizeQuestion).filter((q): q is MCQQuestion => q !== null)
      if (!normalized.length) throw new Error('No valid questions')
      setQuestions(normalized); setCurrent(0); setSelected({}); setRevealed({})
      setPhase('quiz')
    } catch { toast.error('Failed to generate quiz. Try again.') }
    finally { setGenerating(false) }
  }

  const handleSelect = (opt: string) => { if (!revealed[current]) setSelected(s => ({ ...s, [current]: opt })) }
  const handleReveal = () => { if (selected[current]) setRevealed(r => ({ ...r, [current]: true })) }
  const handleNext = () => {
    if (current < questions.length - 1) {
      setCurrent(c => c + 1)
    } else {
      setPhase('results')
    }
  }
  const handleRestart = () => { setCurrent(0); setSelected({}); setRevealed({}); setPhase('config') }

  const score = questions.filter((q, i) => selected[i] === q.correct_answer).length
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0
  const passed = pct >= 60
  const correctSoFar = Object.entries(revealed).filter(([i]) => selected[parseInt(i)] === questions[parseInt(i)]?.correct_answer).length

  // ── Loading ───────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-[1.5rem] flex items-center justify-center animate-pulse">
          <span className="material-symbols-outlined text-primary text-[28px]">quiz</span>
        </div>
        <p className="text-on-surface-variant text-[11px] font-black uppercase tracking-widest">Loading Quiz…</p>
      </div>
    </div>
  )

  // ── Config ────────────────────────────────────────────────────────
  if (phase === 'config') {
    const hasPrebuilt = questions.length > 0
    return (
      <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0 tool-header-safe">
          <Link href={`/library/${resourceId}`}
            className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest">Mastery Quiz</p>
          <div className="w-9" />
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col">
          <div className="w-full max-w-sm mx-auto my-auto space-y-6 sm:space-y-8 py-4">

            {/* Icon + title */}
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-20 h-20 bg-primary/10 border border-primary/20 rounded-[1.5rem] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>quiz</span>
              </div>
              <div>
                <h2 className="text-[26px] font-bold text-on-surface tracking-tight">Mastery Quiz</h2>
                <p className="text-on-surface-variant mt-1 text-[14px]">
                  {hasPrebuilt
                    ? `${questions.length} questions ready from your study kit.`
                    : 'AI generates questions from your material.'}
                </p>
              </div>
              {hasPrebuilt && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[11px] font-black text-green-400 uppercase tracking-widest">Pre-generated · Ready instantly</span>
                </div>
              )}
            </div>

            {/* Count picker */}
            <div className="space-y-3">
              <p className="text-[11px] font-black text-on-surface-variant uppercase tracking-widest text-center">
                Number of Questions
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 15, 20].map(n => (
                  <button key={n} onClick={() => setCount(n)}
                    disabled={hasPrebuilt && n > questions.length}
                    className={cn(
                      'py-4 rounded-[1rem] text-[15px] font-bold transition-all border-2',
                      count === n
                        ? 'bg-primary-container text-on-primary-container border-primary-container shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none'
                        : 'bg-surface-container border-outline-variant/40 text-on-surface-variant hover:border-primary/30 hover:text-on-surface',
                      hasPrebuilt && n > questions.length ? 'opacity-25 cursor-not-allowed' : ''
                    )}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Start */}
            <button onClick={handleStart} disabled={generating}
              className="w-full py-4 rounded-full bg-primary-container text-on-primary-container font-bold text-[16px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50">
              {generating ? (
                <><span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span> Generating…</>
              ) : (
                <><span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span> Start Quiz</>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Results ───────────────────────────────────────────────────────
  if (phase === 'results') return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0">
        <Link href={`/library/${resourceId}`}
          className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest">Results</p>
        <div className="w-9" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col">
        <div className="w-full max-w-sm mx-auto my-auto space-y-6 sm:space-y-8 text-center py-4">

          {/* Score ring */}
          <div className="relative w-36 h-36 mx-auto">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="5" className="text-surface-container-high" />
              <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 38}`}
                strokeDashoffset={`${2 * Math.PI * 38 * (1 - pct / 100)}`}
                className={passed ? 'text-green-400' : 'text-primary'}
                style={{ transition: 'stroke-dashoffset 1.2s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[36px] font-bold text-on-surface">{pct}%</span>
              <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Score</span>
            </div>
          </div>

          <div>
            <h2 className="text-[28px] font-bold text-on-surface tracking-tight">
              {passed ? '🎉 Crushed it!' : '💪 Keep grinding!'}
            </h2>
            <p className="text-on-surface-variant mt-1 text-[15px]">{score} / {questions.length} correct</p>
          </div>

          {/* Per-question bar */}
          <div className="flex gap-1.5 flex-wrap justify-center">
            {questions.map((q, i) => (
              <div key={i} className={cn('h-2 rounded-full transition-all',
                selected[i] === q.correct_answer ? 'bg-green-400 flex-[2]' : 'bg-error/50 flex-1'
              )} title={`Q${i + 1}: ${selected[i] === q.correct_answer ? 'Correct' : 'Wrong'}`} />
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Correct', value: score, color: 'text-green-400' },
              { label: 'Wrong', value: questions.length - score, color: 'text-error' },
              { label: 'Score', value: `${pct}%`, color: passed ? 'text-green-400' : 'text-primary' },
            ].map(s => (
              <div key={s.label} className="bg-surface-container rounded-[1.5rem] p-4 border border-outline-variant/20">
                <p className={cn('text-[26px] font-bold', s.color)}>{s.value}</p>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={handleRestart}
              className="flex-1 py-4 rounded-[1rem] bg-surface-container-high border border-outline-variant text-on-surface font-bold text-[15px] hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">refresh</span> Retry
            </button>
            <Link href={`/library/${resourceId}`}
              className="flex-1 py-4 rounded-[1rem] bg-primary-container text-on-primary-container font-bold text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">menu_book</span> Done
            </Link>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Quiz ──────────────────────────────────────────────────────────
  const q = questions[current]
  const options = normalizeOptions(q?.options)
  const isRevealed = revealed[current]
  const chosenAnswer = selected[current]

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden select-none">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4 shrink-0 tool-header-safe">
        {/* Left: back + subject/title */}
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={handleRestart}
            className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all shrink-0">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-black text-primary uppercase tracking-widest truncate">
              QUIZ · {questions.length} QUESTIONS
            </p>
            <p className="text-[13px] font-semibold text-on-surface-variant truncate max-w-[200px] sm:max-w-xs">
              {resource?.title || '…'}
            </p>
          </div>
        </div>

        {/* Right: counter + correct count */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[13px] font-bold text-green-400">{correctSoFar} correct</span>
          <span className="text-[15px] font-bold text-on-surface">
            {current + 1}
            <span className="text-on-surface-variant/50 font-medium text-[13px]"> / {questions.length}</span>
          </span>
        </div>
      </header>

      {/* ── Dot progress ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-1.5 py-3 shrink-0 flex-wrap px-8">
        {questions.map((q, i) => (
          <div key={i} className={cn(
            'rounded-full transition-all duration-300',
            i === current
              ? 'w-3 h-3 bg-primary scale-110'
              : revealed[i] && selected[i] === q.correct_answer
              ? 'w-2 h-2 bg-green-400'
              : revealed[i] && selected[i] !== q.correct_answer
              ? 'w-2 h-2 bg-error/60'
              : 'w-2 h-2 bg-surface-container-highest'
          )} />
        ))}
      </div>

      {/* ── Question card + options ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Question card */}
          <div className="bg-surface-container-low rounded-[1.5rem] p-7 border border-outline-variant/30">
            {/* Label */}
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-primary text-[18px]">quiz</span>
              <span className="text-[11px] font-black text-primary uppercase tracking-widest">Question {current + 1}</span>
            </div>
            {/* Question text */}
            <div className="text-[18px] md:text-[20px] font-bold text-on-surface leading-relaxed prose prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {normalizeForRendering(q?.question || '')}
              </ReactMarkdown>
            </div>
            {/* Rocket watermark */}
            <div className="flex justify-end mt-4">
              <span className="material-symbols-outlined text-on-surface-variant/8 text-[56px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                rocket_launch
              </span>
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i)
              const isCorrect = opt === q.correct_answer
              const isChosen = chosenAnswer === opt
              const isWrong = isRevealed && isChosen && !isCorrect
              return (
                <button key={i} onClick={() => handleSelect(opt)}
                  className={cn(
                    'w-full text-left flex items-start gap-3.5 p-5 rounded-[1.5rem] border-2 text-[15px] font-semibold transition-all',
                    !isRevealed && !isChosen
                      ? 'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/30 hover:bg-surface-container-high'
                      : !isRevealed && isChosen
                      ? 'bg-primary/10 border-primary/50 text-primary'
                      : isCorrect
                      ? 'bg-green-500/10 border-green-500/40 text-green-300'
                      : isWrong
                      ? 'bg-error/10 border-error/40 text-error'
                      : 'bg-surface-container border-outline-variant/20 text-on-surface-variant/40'
                  )}>
                  {/* Letter badge */}
                  <span className={cn(
                    'w-8 h-8 rounded-[0.75rem] flex items-center justify-center text-[13px] font-black shrink-0 transition-all',
                    !isRevealed && isChosen ? 'bg-primary text-on-primary' :
                    isCorrect ? 'bg-green-500 text-white' :
                    isWrong ? 'bg-error text-on-error' :
                    'bg-surface-container-high text-on-surface-variant'
                  )}>
                    {isRevealed && isCorrect
                      ? <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                      : isWrong
                      ? <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>close</span>
                      : letter}
                  </span>
                  {/* Option text */}
                  <div className="flex-1 leading-snug prose prose-invert prose-sm max-w-none mt-0.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {normalizeForRendering(opt || '')}
                    </ReactMarkdown>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Explanation */}
          {isRevealed && q?.explanation && (
            <div className="bg-secondary/10 border border-secondary/20 rounded-[1.5rem] p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-secondary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                <p className="text-[11px] font-black text-secondary uppercase tracking-widest">Explanation</p>
              </div>
              <div className="text-[14px] text-on-surface-variant leading-relaxed prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {normalizeForRendering(q.explanation || '')}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Spacer so content doesn't hide behind footer */}
          <div className="h-28" />
        </div>
      </div>

      {/* ── Footer action with mobile safe-area bottom ────────────────── */}
      <div className="px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shrink-0 max-w-2xl mx-auto w-full bg-background/95 backdrop-blur border-t border-outline-variant/10">
        {!isRevealed ? (
          <button onClick={handleReveal} disabled={!chosenAnswer}
            className="w-full py-4 rounded-full bg-primary-container text-on-primary-container font-bold text-[16px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all disabled:opacity-30 disabled:pointer-events-none">
            Check Answer
          </button>
        ) : (
          <button onClick={handleNext}
            className="w-full py-4 rounded-full bg-primary-container text-on-primary-container font-bold text-[16px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all flex items-center justify-center gap-2.5">
            {current < questions.length - 1 ? (
              <>Next Question <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
            ) : (
              <>See Results <span className="material-symbols-outlined text-[18px]">emoji_events</span></>
            )}
          </button>
        )}
        {/* Keyboard hint */}
        <p className="text-center text-[11px] text-on-surface-variant/30 mt-3 font-medium hidden sm:block">
          {!isRevealed
            ? <><kbd className="px-1.5 py-0.5 bg-surface-container-high rounded text-[10px]">1–4</kbd> to select · <kbd className="px-1.5 py-0.5 bg-surface-container-high rounded text-[10px]">Enter</kbd> to confirm</>
            : <><kbd className="px-1.5 py-0.5 bg-surface-container-high rounded text-[10px]">Enter</kbd> or <kbd className="px-1.5 py-0.5 bg-surface-container-high rounded text-[10px]">→</kbd> for next</>
          }
        </p>
      </div>
    </div>
  )
}
