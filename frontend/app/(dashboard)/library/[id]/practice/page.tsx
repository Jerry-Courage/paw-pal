'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { libraryApi, aiApi } from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { normalizeReadableMath } from '@/lib/mathFormatting'
import { useStudyTimer } from '@/hooks/useStudyTimer'

interface Question { question: string; type: string; hint?: string; model_answer: string }
interface GradeResult { score: number; grade: string; correct: boolean; feedback: string; strengths: string[]; improvements: string[]; tip: string }

const GRADE_COLOR = (g: string) => {
  if (['A', 'A+', 'A-'].includes(g)) return 'text-green-400'
  if (['B', 'B+', 'B-'].includes(g)) return 'text-secondary'
  if (['C', 'C+', 'C-'].includes(g)) return 'text-yellow-400'
  return 'text-error'
}

const STUDY_TIPS = [
  '"Explaining things in your own words helps your brain remember them 2× faster!"',
  '"Retrieval practice is the most powerful learning technique known to science."',
  '"Writing your answer before checking trains deeper memory than re-reading."',
  '"Short, focused practice beats long cramming sessions every time."',
  '"Getting something wrong is more useful than getting it right without effort."',
]

export default function PracticePage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  useStudyTimer(true)
  const [phase, setPhase] = useState<'loading' | 'test' | 'results' | 'error'>('loading')
  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [grades, setGrades] = useState<Record<number, GradeResult>>({})
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({})
  const [grading, setGrading] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [tip] = useState(() => STUDY_TIPS[Math.floor(Math.random() * STUDY_TIPS.length)])

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  const qc = useQueryClient()

  // Save XP when practice session ends (results phase)
  const savePracticeXp = useCallback(async (answeredCount: number, avgScore: number) => {
    try {
      await libraryApi.completeStep(resourceId, 'practice', avgScore)
      qc.invalidateQueries({ queryKey: ['progress', resourceId] })
      qc.invalidateQueries({ queryKey: ['profile'] })
    } catch { /* silent — XP will sync next time */ }
  }, [resourceId, qc])

  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (phase !== 'loading') return
    const load = async () => {
      try {
        const res = await libraryApi.getResource(resourceId)
        const existing = res.data.ai_notes_json?.practice_questions
        if (existing?.length) { setQuestions(existing); setPhase('test'); return }
        const gen = await libraryApi.generatePracticeQuestions(resourceId, 'medium', 10)
        const qs = gen.data.questions || gen.data || []
        if (!qs.length) throw new Error('No questions returned')
        setQuestions(qs); setPhase('test')
      } catch (err: any) {
        console.error('[Practice] Load error:', err?.response?.data || err?.message || err)
        toast.error('Failed to load practice questions.')
        setPhase('error')
      }
    }
    load()
  }, [resourceId, retryCount])

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
    } finally { setGrading(false) }
  }

  const handleNext = () => {
    if (current < questions.length - 1) { setCurrent(c => c + 1); setShowHint(false) }
    else {
      // Save XP before showing results
      const answered = Object.keys(submitted).length + 1 // +1 for current
      const allGrades = { ...grades }
      if (grades[current]) {
        const avg = Math.round(Object.values(allGrades).reduce((s, g) => s + (g.score || 0), 0) / Object.values(allGrades).length)
        savePracticeXp(answered, avg)
      }
      setPhase('results')
    }
  }

  const handleRestart = () => {
    setCurrent(0); setAnswers({}); setGrades({}); setSubmitted({})
    setShowHint(false); setPhase('test')
  }

  const totalAnswered = Object.keys(submitted).length
  const avgScore = totalAnswered > 0
    ? Math.round(Object.values(grades).reduce((s, g) => s + (g.score || 0), 0) / totalAnswered)
    : 0

  // ── Loading ──────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center max-w-xs px-6">
        <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-[1.5rem] flex items-center justify-center animate-pulse">
          <span className="material-symbols-outlined text-primary text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>edit_note</span>
        </div>
        <div>
          <h2 className="text-[22px] font-bold text-on-surface tracking-tight">Preparing Practice</h2>
          <p className="text-on-surface-variant mt-2 text-[14px]">Generating AI-graded questions…</p>
        </div>
        <div className="flex gap-2">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )

  // ── Error ────────────────────────────────────────────────────────
  if (phase === 'error') return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0">
        <Link href={`/library/${resourceId}`}
          className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest">Practice</p>
        <div className="w-9" />
      </header>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        <div className="flex flex-col items-center gap-6 text-center max-w-xs mx-auto my-auto px-4 py-4">
          <span className="material-symbols-outlined text-error text-[48px]">error</span>
          <div>
            <h2 className="text-[20px] font-bold text-on-surface">Couldn't load questions</h2>
            <p className="text-on-surface-variant mt-2 text-[14px] leading-relaxed">
              The AI couldn't generate questions right now. This usually means the study kit is still processing.
            </p>
          </div>
          <button onClick={() => { setPhase('loading'); setRetryCount(c => c + 1) }}
            className="w-full py-4 rounded-[1rem] bg-primary-container text-on-primary-container font-bold text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[18px]">refresh</span> Try Again
          </button>
        </div>
      </div>
    </div>
  )

  // ── Results ──────────────────────────────────────────────────────
  if (phase === 'results') {
    const passed = avgScore >= 60
    return (
      <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0">
          <Link href={`/library/${resourceId}`}
            className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest">Results</p>
          <div className="w-9" />
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 max-w-2xl mx-auto w-full scrollbar-hide">
          <div className="space-y-6">
            {/* Score ring */}
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="6" className="text-surface-container-high" />
                  <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 38}`}
                    strokeDashoffset={`${2 * Math.PI * 38 * (1 - avgScore / 100)}`}
                    className={passed ? 'text-green-400' : 'text-primary'}
                    style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[32px] font-bold text-on-surface">{avgScore}</span>
                  <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">Score</span>
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-[24px] font-bold text-on-surface tracking-tight">
                  {passed ? '🎉 Solid work!' : '💪 Keep drilling!'}
                </h2>
                <p className="text-on-surface-variant mt-1 text-[14px]">{totalAnswered} of {questions.length} answered</p>
              </div>
            </div>

            {/* Per-question breakdown */}
            <div className="space-y-2">
              {questions.map((q, i) => {
                const g = grades[i]
                return (
                  <div key={i} className="flex items-center gap-3 bg-surface-container border border-outline-variant/20 rounded-[1.25rem] px-4 py-3">
                    <span className="text-[11px] text-on-surface-variant/60 w-5 shrink-0 font-bold">Q{i+1}</span>
                    <p className="flex-1 text-[13px] text-on-surface-variant truncate">{q.question}</p>
                    {g ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-12 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all',
                            g.score >= 80 ? 'bg-green-400' : g.score >= 60 ? 'bg-secondary' : g.score >= 40 ? 'bg-yellow-400' : 'bg-error'
                          )} style={{ width: `${g.score}%` }} />
                        </div>
                        <span className={cn('text-[12px] font-bold w-5', GRADE_COLOR(g.grade))}>{g.grade}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-on-surface-variant/40 shrink-0">Skipped</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pb-4">
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
  }

  // ── Test ─────────────────────────────────────────────────────────
  const q = questions[current]
  const grade = grades[current]
  const isSubmitted = submitted[current]
  const charCount = (answers[current] || '').length
  const pct = questions.length > 0 ? ((current + 1) / questions.length) * 100 : 0

  const progressLabel = () => {
    const remaining = questions.length - current - 1
    if (current === 0) return 'Just getting started!'
    if (remaining === 0) return 'Last one! 🚀'
    if (remaining === 1) return 'Almost there! 🎯'
    return `${remaining} left — keep going!`
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden select-none">

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4 shrink-0 tool-header-safe">
        <Link href={`/library/${resourceId}`}
          className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors text-[13px] font-bold">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Exit Practice
        </Link>
        <p className="text-[13px] font-bold text-primary uppercase tracking-widest">
          {resource?.subject || resource?.title?.slice(0, 20) || 'Practice'}
        </p>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full">
          <span className="material-symbols-outlined text-primary text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
          <span className="text-[12px] font-black text-primary">
            {totalAnswered > 0 ? `+${Math.round(avgScore / 100 * 100)} XP` : '100 XP'}
          </span>
        </div>
      </header>

      {/* ── Progress bar ────────────────────────────────────────── */}
      <div className="px-6 pb-3 shrink-0 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-black text-on-surface-variant uppercase tracking-widest">
            Question {current + 1} of {questions.length}
          </p>
          <p className="text-[11px] font-bold text-primary">{progressLabel()}</p>
        </div>
        <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="px-6 py-4 max-w-5xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-5">

            {/* LEFT: Question card + answer */}
            <div className="flex-1 space-y-4">

              {/* Question card */}
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-[1.5rem] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>edit_note</span>
                  <span className="text-[11px] font-black text-primary uppercase tracking-widest">
                    {q?.type?.replace('_', ' ') || 'Short Answer'}
                  </span>
                </div>
                <div className="text-[18px] font-bold text-on-surface leading-relaxed prose prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {normalizeReadableMath(q?.question || '')}
                  </ReactMarkdown>
                </div>

                {/* Answer textarea */}
                {!isSubmitted && (
                  <div className="mt-5 space-y-2">
                    <textarea
                      value={answers[current] || ''}
                      onChange={e => setAnswers(a => ({ ...a, [current]: e.target.value }))}
                      placeholder="Type your answer here..."
                      rows={5}
                      disabled={grading}
                      className="w-full bg-surface-container border border-outline-variant/40 rounded-[1rem] px-4 py-3 text-on-surface text-[14px] leading-relaxed resize-none focus:outline-none focus:border-primary/50 placeholder:text-on-surface-variant/40 transition-all"
                    />
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] text-on-surface-variant/50">
                        Characters: {charCount} / 500
                      </span>
                    </div>
                  </div>
                )}

                {/* Grade result */}
                {isSubmitted && grade && (
                  <div className="mt-5 space-y-3">
                    {/* Score + feedback */}
                    <div className={cn('rounded-[1.25rem] p-4 flex items-start gap-4',
                      grade.correct ? 'bg-green-500/8 border border-green-500/20' : 'bg-error/8 border border-error/20')}>
                      <div className={cn('w-14 h-14 rounded-full flex flex-col items-center justify-center shrink-0 text-white font-bold',
                        grade.score >= 80 ? 'bg-green-500' : grade.score >= 60 ? 'bg-secondary-container' : grade.score >= 40 ? 'bg-yellow-500' : 'bg-error-container')}>
                        <span className="text-[18px] leading-none">{grade.score}</span>
                        <span className="text-[9px] opacity-80">/100</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="material-symbols-outlined text-[16px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                            className={grade.correct ? 'text-green-400' : 'text-error'}>
                            {grade.correct ? 'check_circle' : 'cancel'}
                          </span>
                          <span className={cn('text-[13px] font-black', GRADE_COLOR(grade.grade))}>Grade: {grade.grade}</span>
                        </div>
                        <div className="text-[13px] text-on-surface-variant leading-relaxed prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {normalizeReadableMath(grade.feedback || '')}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>

                    {/* Strengths */}
                    {grade.strengths?.length > 0 && (
                      <div className="bg-green-500/8 border border-green-500/20 rounded-[1.25rem] p-4">
                        <p className="text-[10px] font-black text-green-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span> What you got right
                        </p>
                        <ul className="space-y-1">
                          {grade.strengths.map((s, i) => (
                            <li key={i} className="text-[13px] text-green-300 flex items-start gap-1.5">
                              <span className="mt-0.5 shrink-0">•</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Improvements */}
                    {grade.improvements?.length > 0 && (
                      <div className="bg-primary/8 border border-primary/20 rounded-[1.25rem] p-4">
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px]">trending_up</span> How to improve
                        </p>
                        <ul className="space-y-1">
                          {grade.improvements.map((s, i) => (
                            <li key={i} className="text-[13px] text-on-surface-variant flex items-start gap-1.5">
                              <span className="mt-0.5 shrink-0">•</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {!isSubmitted ? (
                <div className="flex gap-3">
                  {/* Hint button */}
                  {q?.hint && (
                    <button onClick={() => setShowHint(h => !h)}
                      className="flex items-center gap-2 px-5 py-4 rounded-[1rem] bg-secondary-container text-on-secondary-container font-bold text-[14px] hover:brightness-110 transition-all">
                      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                      {showHint ? 'Hide Hint' : 'Need a Hint?'}
                    </button>
                  )}
                  {/* Submit */}
                  <button onClick={handleSubmit}
                    disabled={grading || !answers[current]?.trim()}
                    className="flex-1 py-4 rounded-[1rem] bg-primary-container text-on-primary-container font-bold text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2.5">
                    {grading ? (
                      <><span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span> Grading…</>
                    ) : (
                      <><span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span> Check Answer</>
                    )}
                  </button>
                </div>
              ) : (
                <button onClick={handleNext}
                  className="w-full py-4 rounded-[1rem] bg-primary-container text-on-primary-container font-bold text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all flex items-center justify-center gap-2.5">
                  {current < questions.length - 1
                    ? <><span>Next Question</span><span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
                    : <><span>See Results</span><span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span></>
                  }
                </button>
              )}

              {/* Hint card (inline, below buttons) */}
              {showHint && q?.hint && !isSubmitted && (
                <div className="flex items-start gap-3 p-4 rounded-[1.25rem] border border-tertiary/20 bg-tertiary/5">
                  <span className="material-symbols-outlined text-tertiary text-[18px] shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                  <div className="text-[13px] text-on-surface-variant leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {normalizeReadableMath(q.hint)}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: AI assistant + study tip */}
            <div className="w-full lg:w-[280px] shrink-0 space-y-4">

              {/* AI assistant card */}
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-[1.5rem] p-5 text-center">
                {/* Robot avatar */}
                <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center mx-auto mb-4 overflow-hidden">
                  <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                    <rect x="10" y="12" width="36" height="30" rx="6" fill="#ff8a3d" opacity="0.92"/>
                    <circle cx="20" cy="22" r="5" fill="#1a0033"/>
                    <circle cx="36" cy="22" r="5" fill="#1a0033"/>
                    <circle cx="21.5" cy="20.5" r="1.8" fill="white" opacity="0.85"/>
                    <circle cx="37.5" cy="20.5" r="1.8" fill="white" opacity="0.85"/>
                    <path d="M21 33 Q28 37 35 33" stroke="#1a0033" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8"/>
                    <line x1="28" y1="12" x2="28" y2="6" stroke="#ffb68d" strokeWidth="2.5"/>
                    <circle cx="28" cy="4" r="3" fill="#ffb68d"/>
                    <rect x="4" y="20" width="6" height="10" rx="3" fill="#ff8a3d" opacity="0.7"/>
                    <rect x="46" y="20" width="6" height="10" rx="3" fill="#ff8a3d" opacity="0.7"/>
                  </svg>
                </div>
                <h3 className="text-[16px] font-black text-primary mb-2">Hi, I'm FlowAI!</h3>
                <p className="text-[13px] text-on-surface-variant leading-relaxed">
                  {isSubmitted
                    ? grade?.correct
                      ? 'Great answer! Ready for the next one? 🎉'
                      : 'Nice try! Read the feedback and you\'ll nail the next one. 💪'
                    : 'Take your time to think! I\'m here to help you get those stars. Ready when you are!'}
                </p>
              </div>

              {/* Study tip card */}
              {grade?.tip ? (
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-[1.5rem] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-secondary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
                    <p className="text-[10px] font-black text-secondary uppercase tracking-widest">AI Study Tip</p>
                  </div>
                  <p className="text-[13px] text-on-surface-variant leading-relaxed italic">
                    &ldquo;{grade.tip}&rdquo;
                  </p>
                </div>
              ) : (
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-[1.5rem] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-secondary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
                    <p className="text-[10px] font-black text-secondary uppercase tracking-widest">Study Tip</p>
                  </div>
                  <p className="text-[13px] text-on-surface-variant leading-relaxed italic">{tip}</p>
                </div>
              )}

              {/* Dot progress */}
              <div className="flex flex-wrap gap-1.5 justify-center py-1">
                {questions.map((_, i) => (
                  <div key={i} className={cn('rounded-full transition-all duration-300',
                    i === current ? 'w-3 h-3 bg-primary scale-110' :
                    submitted[i] && grades[i]?.correct ? 'w-2.5 h-2.5 bg-green-400' :
                    submitted[i] ? 'w-2.5 h-2.5 bg-error/60' :
                    'w-2.5 h-2.5 bg-surface-container-highest'
                  )} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
