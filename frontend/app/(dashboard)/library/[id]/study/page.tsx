'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

type QuizQuestion = { question: string; options: string[]; correct: string; explanation: string }
type Phase = 'reading' | 'quiz' | 'result'

const XP_PER_SECTION = 50
const TIPS = [
  '"Gravity is what keeps your feet on the ground. It\'s like the universe\'s glue!"',
  '"Try to explain what you just read in your own words — that\'s the Feynman technique!"',
  '"Take a 5 min break after every 25 min of studying. Your brain will thank you!"',
  '"Making connections between ideas helps you remember them much longer."',
]

export default function StudyModePage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  const router = useRouter()
  const qc = useQueryClient()

  const [sectionIndex, setSectionIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('reading')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loadingQuiz, setLoadingQuiz] = useState(false)
  const [totalXP, setTotalXP] = useState(0)
  const [completed, setCompleted] = useState<Set<number>>(new Set())
  const [isReading, setIsReading] = useState(false)
  const [tipIdx] = useState(() => Math.floor(Math.random() * TIPS.length))

  // Focus timer
  const [timerSeconds, setTimerSeconds] = useState(25 * 60)
  const [timerRunning, setTimerRunning] = useState(true)
  const [focusStreak, setFocusStreak] = useState(0)
  const timerRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (!timerRunning) return
    timerRef.current = setInterval(() => {
      setTimerSeconds(s => {
        if (s <= 0) { clearInterval(timerRef.current); setTimerRunning(false); return 0 }
        return s - 1
      })
      setFocusStreak(s => s + 1)
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [timerRunning])

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const { data: resource, isLoading } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  const sections = resource?.ai_notes_json?.sections || []
  const current = sections[sectionIndex]
  const total = sections.length
  const progress = total > 0 ? Math.round(((sectionIndex) / total) * 100) : 0

  const correctCount = submitted ? questions.filter((q, i) => selected[i] === q.correct).length : 0
  const passed = correctCount >= Math.ceil(questions.length * 0.6)

  const readAloud = () => {
    if (isReading) { window.speechSynthesis.cancel(); setIsReading(false); return }
    if (!current?.content) return
    const text = current.content.replace(/\*\*/g, '').replace(/#{1,6} /g, '').slice(0, 1500)
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.95
    utt.onend = () => setIsReading(false)
    window.speechSynthesis.speak(utt)
    setIsReading(true)
  }
  useEffect(() => { return () => window.speechSynthesis.cancel() }, [])
  useEffect(() => { window.speechSynthesis.cancel(); setIsReading(false) }, [sectionIndex])

  const handleNext = async () => {
    setLoadingQuiz(true)
    try {
      const res = await libraryApi.getSectionQuiz(resourceId, current.title, current.content?.slice(0, 1500) || '')
      setQuestions(res.data.questions || [])
      setSelected({}); setSubmitted(false); setPhase('quiz')
    } catch { toast.error('Could not generate quiz. Try again.') }
    finally { setLoadingQuiz(false) }
  }

  const handleSubmit = () => {
    if (Object.keys(selected).length < questions.length) { toast.error('Answer all questions first.'); return }
    setSubmitted(true); setPhase('result')
    if (passed) {
      setTotalXP(p => p + XP_PER_SECTION)
      setCompleted(p => { const n = new Set(p); n.add(sectionIndex); return n })
      toast.success(`+${XP_PER_SECTION} XP! Keep going! 🎉`, { duration: 2000 })
      libraryApi.completeStep(resourceId, 'notes', Math.round((completed.size + 1) / total * 100)).catch(() => {})
      qc.invalidateQueries({ queryKey: ['progress', resourceId] })
    }
  }

  const handleNextSection = () => {
    if (sectionIndex < total - 1) {
      setSectionIndex(i => i + 1); setPhase('reading'); setQuestions([]); setSelected({}); setSubmitted(false)
    } else {
      toast.success('🎓 All sections complete!'); router.push(`/library/${resourceId}`)
    }
  }

  if (isLoading) return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
        <p className="text-on-surface-variant text-sm">Loading study mode…</p>
      </div>
    </div>
  )

  if (!current && total === 0) return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-6">
      <span className="material-symbols-outlined text-[64px] text-on-surface-variant/30">auto_stories</span>
      <p className="text-on-surface font-bold text-lg">No study notes generated yet.</p>
      <p className="text-on-surface-variant text-sm">Go back to the resource hub and generate a study kit first.</p>
      <Link href={`/library/${resourceId}`} className="flex items-center gap-2 bg-primary-container text-on-primary-container font-bold px-6 py-3 rounded-full">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to Resource
      </Link>
    </div>
  )

  return (
    <div className="fixed inset-0 md:left-64 bg-background flex flex-col overflow-hidden text-on-surface">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="h-14 flex items-center gap-6 px-6 border-b border-outline-variant/25 bg-surface-container-low shrink-0 z-20">
        <Link href={`/library/${resourceId}`} className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          <span className="text-sm font-medium hidden sm:block">Exit Study Mode</span>
        </Link>

        {/* Progress bar */}
        <div className="flex-1 hidden md:flex items-center gap-3">
          <span className="text-xs text-on-surface-variant font-medium whitespace-nowrap">{progress}% Complete</span>
          <div className="flex-1 h-3 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-container rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, boxShadow: '0 0 15px rgba(255,138,61,0.4)' }}
            />
          </div>
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>stars</span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-xl">
            <span className="material-symbols-outlined text-primary text-[16px]">bolt</span>
            <span className="text-xs font-black text-primary">{totalXP} XP</span>
          </div>
        </div>
      </header>

      {/* ── 3-column body ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Section nav */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-surface-container-low border-r border-outline-variant/20 overflow-y-auto">
          <div className="p-5 border-b border-outline-variant/20">
            <h3 className="font-bold text-primary text-[16px]">Today's Topic</h3>
            <p className="text-on-surface-variant text-[13px] mt-0.5">{resource?.title || 'Study Session'}</p>
          </div>

          <nav className="flex flex-col gap-2 p-4 flex-1">
            {sections.map((sec: any, i: number) => {
              const isDone = completed.has(i)
              const isActive = i === sectionIndex
              const isLocked = i > sectionIndex && !completed.has(i)
              return (
                <button
                  key={i}
                  onClick={() => { if (!isLocked) { setSectionIndex(i); setPhase('reading'); setQuestions([]); setSelected({}); setSubmitted(false) } }}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-3 rounded-[1rem] text-left text-[14px] font-semibold transition-all',
                    isDone ? 'bg-primary-container text-on-primary-container shadow-[0_4px_0_0_#763300]' :
                    isActive ? 'border-2 border-primary text-on-surface bg-surface-container-high' :
                    isLocked ? 'text-on-surface-variant/40 cursor-not-allowed' :
                    'text-on-surface-variant hover:bg-surface-container-high'
                  )}
                >
                  <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: isDone ? "'FILL' 1" : "'FILL' 0" }}>
                    {isDone ? 'check_circle' : isActive ? 'radio_button_checked' : 'lock'}
                  </span>
                  <span className="truncate">{sec.title || `Section ${i + 1}`}</span>
                </button>
              )
            })}
          </nav>

          {/* Focus streak */}
          <div className="m-4 p-4 bg-surface-container-highest rounded-[1rem] border border-outline-variant/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-on-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              </div>
              <span className="text-[13px] font-bold text-on-surface">Focus Streak: {Math.floor(focusStreak / 60)}m</span>
            </div>
            <div className="h-1.5 bg-surface-container-low rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (focusStreak % 1500) / 15)}%` }} />
            </div>
          </div>
        </aside>

        {/* CENTER: Content + Quiz */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 pb-24 space-y-6">

            {/* Section content card */}
            {phase === 'reading' && current && (
              <article className="bg-surface-container rounded-[1.5rem] border border-outline-variant/25 shadow-lg overflow-hidden">
                <div className="p-8">
                  <div className="mb-6">
                    <span className="text-xs font-black text-primary-container uppercase tracking-widest mb-2 block">
                      Section {sectionIndex + 1} of {total}
                    </span>
                    <h2 className="text-[28px] font-bold text-primary leading-tight">{current.title}</h2>
                  </div>

                  <div className="prose prose-invert max-w-none mb-6">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {current.content || ''}
                    </ReactMarkdown>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-outline-variant/20">
                    <button
                      onClick={() => sectionIndex > 0 && (setSectionIndex(i => i - 1), setPhase('reading'))}
                      disabled={sectionIndex === 0}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-[1rem] border border-outline-variant/40 text-on-surface-variant text-sm font-bold hover:border-outline-variant/70 hover:text-on-surface disabled:opacity-30 disabled:pointer-events-none transition-all"
                    >
                      <span className="material-symbols-outlined text-[18px]">arrow_back</span> Previous
                    </button>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={readAloud}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-[1rem] border text-sm font-bold transition-all',
                          isReading ? 'bg-primary/20 border-primary/40 text-primary' : 'border-outline-variant/40 text-on-surface-variant hover:border-outline-variant/70'
                        )}
                      >
                        <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: isReading ? "'FILL' 1" : "'FILL' 0" }}>volume_up</span>
                        {isReading ? 'Stop' : 'Listen'}
                      </button>

                      <button
                        onClick={handleNext}
                        disabled={loadingQuiz}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-on-primary font-bold text-sm shadow-[0_4px_0_0_#9a4600] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all disabled:opacity-50"
                      >
                        {loadingQuiz
                          ? <><span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span> Generating…</>
                          : <>Next: Quick Test <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {/* Quiz + Result */}
            {(phase === 'quiz' || phase === 'result') && questions.length > 0 && (
              <article className="bg-surface-container rounded-[1.5rem] border border-outline-variant/25 shadow-lg overflow-hidden">
                <div className="p-8">
                  {/* Quiz header */}
                  <div className="flex items-center gap-3 mb-6">
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>quiz</span>
                    <h4 className="text-[20px] font-bold text-on-surface">Quick Check: {current?.title}</h4>
                  </div>

                  {/* Questions */}
                  <div className="space-y-6">
                    {questions.map((q, qi) => (
                      <div key={qi}>
                        <p className="text-[15px] text-on-surface font-semibold mb-3">
                          <span className="text-primary mr-2">{qi + 1}.</span>{q.question}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {q.options.map((opt, oi) => {
                            const isSelected = selected[qi] === opt
                            const isCorrect = submitted && opt === q.correct
                            const isWrong = submitted && isSelected && !isCorrect
                            return (
                              <button
                                key={oi}
                                onClick={() => !submitted && setSelected(p => ({ ...p, [qi]: opt }))}
                                disabled={submitted}
                                className={cn(
                                  'p-4 rounded-[1rem] border-2 border-b-4 font-bold text-left text-[14px] transition-all flex items-center justify-between',
                                  isCorrect ? 'bg-primary-container text-on-primary-container border-primary-container border-b-[#763300]' :
                                  isWrong ? 'bg-error-container/20 text-error border-error border-b-error/60' :
                                  isSelected ? 'bg-primary/10 text-primary border-primary border-b-[#9a4600] translate-y-1 border-b-0' :
                                  'bg-surface-container-high border-outline-variant hover:bg-surface-container-highest'
                                )}
                              >
                                <span>{opt}</span>
                                <span className="material-symbols-outlined text-[18px]">
                                  {isCorrect ? 'check_circle' : isWrong ? 'cancel' : 'circle'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        {submitted && (
                          <p className="text-[13px] text-on-surface-variant italic mt-3 pl-3 border-l-2 border-outline-variant/40">
                            {q.explanation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Result banner */}
                  {submitted && (
                    <div className={cn(
                      'flex items-center gap-4 p-4 rounded-[1rem] border mt-6',
                      passed ? 'bg-green-500/10 border-green-500/30' : 'bg-error-container/20 border-error/30'
                    )}>
                      <span className={cn('material-symbols-outlined text-[32px]', passed ? 'text-green-400' : 'text-error')} style={{ fontVariationSettings: "'FILL' 1" }}>
                        {passed ? 'emoji_events' : 'cancel'}
                      </span>
                      <div>
                        <p className="font-bold text-on-surface">
                          {passed ? `${correctCount}/${questions.length} correct — Well done! +${XP_PER_SECTION} XP` : `${correctCount}/${questions.length} correct — Review and try again`}
                        </p>
                        <p className="text-[12px] text-on-surface-variant mt-0.5">
                          {passed ? 'Ready for the next section.' : 'Read through again then retry.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* CTA */}
                  <div className="mt-6">
                    {!submitted ? (
                      <button onClick={handleSubmit} className="w-full py-3 rounded-full bg-primary text-on-primary font-black text-[15px] shadow-[0_4px_0_0_#9a4600] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all">
                        Submit Answers
                      </button>
                    ) : passed ? (
                      <button onClick={handleNextSection} className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-primary-container text-on-primary-container font-black text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all">
                        <span>{sectionIndex < total - 1 ? 'Next Section' : '🎓 Complete!'}</span>
                        {sectionIndex < total - 1 && <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
                      </button>
                    ) : (
                      <div className="flex gap-3">
                        <button onClick={() => { setPhase('reading'); setSelected({}); setSubmitted(false) }} className="flex-1 py-3 rounded-full bg-surface-container-high border border-outline-variant/50 text-on-surface font-bold text-[14px] hover:bg-surface-container-highest transition-all">
                          Re-read Section
                        </button>
                        <button onClick={() => { setSelected({}); setSubmitted(false); setPhase('quiz') }} className="flex-1 py-3 rounded-full bg-primary/20 border border-primary/30 text-primary font-bold text-[14px] hover:bg-primary/30 transition-all">
                          Retry Quiz
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )}

            {/* XP encouragement banner */}
            {completed.size > 0 && (
              <div className="bg-secondary-container/10 border-2 border-dashed border-secondary-container rounded-[1.5rem] p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-secondary-container rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-secondary-container text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface text-[16px]">Keep it up, Explorer!</p>
                    <p className="text-on-surface-variant text-[13px]">{completed.size} section{completed.size > 1 ? 's' : ''} completed</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[32px] font-bold text-primary leading-none">+{totalXP}</p>
                  <p className="text-on-surface-variant text-[13px]">EXP</p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* RIGHT: AI Tutor + Focus Timer */}
        <aside className="hidden xl:flex flex-col w-64 shrink-0 bg-surface-container-low border-l border-outline-variant/20 overflow-y-auto">
          <div className="flex flex-col gap-5 p-5">

            {/* AI Tutor card */}
            <div className="relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full border-4 border-primary overflow-hidden shadow-xl bg-surface-container z-10">
                <div className="w-full h-full bg-gradient-to-br from-primary-container/30 to-tertiary-container/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                </div>
              </div>
              <div className="mt-10 bg-surface-container rounded-[1.5rem] border border-outline-variant/20 pt-12 p-5">
                <h4 className="text-center font-bold text-primary mb-3 text-[15px]">FlowAI's Tip</h4>
                <p className="text-on-surface-variant text-[13px] italic leading-relaxed text-center">
                  {TIPS[tipIdx]}
                </p>
                <button className="mt-4 w-full flex items-center justify-center gap-2 text-primary text-[13px] font-semibold hover:underline">
                  <span className="material-symbols-outlined text-[16px]">lightbulb</span>
                  Tell me more!
                </button>
              </div>
            </div>

            {/* Focus Timer */}
            <div className="bg-surface-container-high rounded-[1.5rem] border border-outline-variant/20 p-5">
              <h4 className="font-bold text-on-surface text-[14px] mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">timer</span>
                Focus Timer
              </h4>
              <div className="text-[36px] font-bold text-center py-3 bg-surface-container-lowest rounded-[1rem] text-primary mb-4 font-mono">
                {formatTime(timerSeconds)}
              </div>
              <button
                onClick={() => setTimerRunning(r => !r)}
                className="w-full py-3 rounded-[1rem] font-bold text-[14px] bg-surface-container-highest hover:bg-primary hover:text-on-primary transition-all"
              >
                {timerRunning ? 'Pause Session' : 'Resume Session'}
              </button>
            </div>

            {/* Section progress */}
            <div className="bg-surface-container rounded-[1.5rem] border border-outline-variant/20 p-5">
              <h4 className="font-bold text-on-surface text-[14px] mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">menu_book</span>
                Progress
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-[13px]">
                  <span className="text-on-surface-variant">Sections done</span>
                  <span className="text-primary font-bold">{completed.size}/{total}</span>
                </div>
                <div className="h-2 bg-surface-container-low rounded-full overflow-hidden">
                  <div className="h-full bg-primary-container rounded-full transition-all" style={{ width: `${total > 0 ? (completed.size / total) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-on-surface-variant">Total XP</span>
                  <span className="text-primary font-bold">{totalXP}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
