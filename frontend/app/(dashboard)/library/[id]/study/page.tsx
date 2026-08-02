'use client'

import { useState, useEffect, useRef } from 'react'
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
type Section = {
  icon?: string
  title: string
  key_question?: string
  plain_english?: string
  deep_dive?: string
  memory_trick?: string
  quick_summary?: string
  content?: string
}

const XP_PER_SECTION = 50
const TIPS = [
  '"Try explaining what you just read in your own words — the Feynman technique!"',
  '"Take a 5-min break every 25 min. Your brain will thank you!"',
  '"Connecting ideas helps you remember much longer."',
  '"Teaching someone else is the fastest way to master a topic."',
]

function getSectionContent(sec: Section): string {
  const parts: string[] = []
  if (sec.key_question) parts.push(`Key Question: ${sec.key_question}`)
  if (sec.plain_english) parts.push(sec.plain_english)
  if (sec.deep_dive) parts.push(sec.deep_dive)
  if (sec.quick_summary) parts.push(`Summary: ${sec.quick_summary}`)
  if (sec.content) parts.push(sec.content)
  return parts.join('\n\n').slice(0, 2000)
}

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
  const [timerSeconds, setTimerSeconds] = useState(25 * 60)
  const [timerRunning, setTimerRunning] = useState(true)
  const [focusMinutes, setFocusMinutes] = useState(0)
  const timerRef = useRef<NodeJS.Timeout>()
  const tickRef = useRef(0)

  useEffect(() => {
    if (!timerRunning) return
    timerRef.current = setInterval(() => {
      setTimerSeconds(s => { if (s <= 0) { clearInterval(timerRef.current); setTimerRunning(false); return 0 } return s - 1 })
      tickRef.current += 1
      if (tickRef.current % 60 === 0) setFocusMinutes(m => m + 1)
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [timerRunning])

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const { data: resource, isLoading } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  const sections: Section[] = resource?.ai_notes_json?.sections || []
  const current = sections[sectionIndex]
  const total = sections.length
  const progress = total > 0 ? Math.round((completed.size / total) * 100) : 0
  const correctCount = submitted ? questions.filter((q, i) => selected[i] === q.correct).length : 0
  const passed = questions.length > 0 && correctCount >= Math.ceil(questions.length * 0.6)

  const readAloud = () => {
    if (isReading) { window.speechSynthesis.cancel(); setIsReading(false); return }
    if (!current) return
    const text = getSectionContent(current).replace(/\*\*/g, '').replace(/#{1,6} /g, '').slice(0, 1500)
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.95; utt.onend = () => setIsReading(false)
    window.speechSynthesis.speak(utt); setIsReading(true)
  }
  useEffect(() => () => window.speechSynthesis.cancel(), [])
  useEffect(() => { window.speechSynthesis.cancel(); setIsReading(false) }, [sectionIndex])

  const handleNext = async () => {
    if (!current) return
    const content = getSectionContent(current)
    if (!content.trim()) { toast.error('No content available to generate a quiz.'); return }
    setLoadingQuiz(true)
    try {
      const res = await libraryApi.getSectionQuiz(resourceId, current.title, content)
      const qs = res.data.questions || []
      if (!qs.length) throw new Error('No questions returned')
      setQuestions(qs); setSelected({}); setSubmitted(false); setPhase('quiz')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not generate quiz. Try again.')
    } finally { setLoadingQuiz(false) }
  }

  const handleSubmit = () => {
    if (Object.keys(selected).length < questions.length) { toast.error('Answer all questions first.'); return }
    setSubmitted(true); setPhase('result')
    if (passed) {
      setTotalXP(p => p + XP_PER_SECTION)
      setCompleted(p => { const n = new Set(p); n.add(sectionIndex); return n })
      toast.success(`+${XP_PER_SECTION} XP! 🎉`, { duration: 2000 })
      libraryApi.completeStep(resourceId, 'notes', Math.round((completed.size + 1) / total * 100)).catch(() => {})
      qc.invalidateQueries({ queryKey: ['progress', resourceId] })
    }
  }

  const goToSection = (i: number) => {
    setSectionIndex(i); setPhase('reading'); setQuestions([]); setSelected({}); setSubmitted(false)
  }

  const handleNextSection = () => {
    if (sectionIndex < total - 1) { goToSection(sectionIndex + 1) }
    else { toast.success('🎓 All sections complete!'); router.push(`/library/${resourceId}`) }
  }

  if (isLoading) return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
        <p className="text-on-surface-variant text-sm">Loading study mode…</p>
      </div>
    </div>
  )

  if (!resource || total === 0) return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="material-symbols-outlined text-[64px] text-on-surface-variant/30">auto_stories</span>
      <div>
        <p className="text-on-surface font-bold text-lg mb-2">No study notes available yet</p>
        <p className="text-on-surface-variant text-sm max-w-sm">Go back to the resource hub and make sure your study kit has been generated.</p>
      </div>
      <Link href={`/library/${resourceId}`} className="flex items-center gap-2 bg-primary-container text-on-primary-container font-bold px-6 py-3 rounded-full shadow-[0_4px_0_0_#763300] hover:brightness-110 transition-all">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to Resource
      </Link>
    </div>
  )

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-on-surface overflow-hidden">

      {/* ── Top bar ── */}
      <header className="h-16 flex items-center gap-4 px-6 border-b border-outline-variant/25 bg-surface-container-low shrink-0 z-20">
        <Link href={`/library/${resourceId}`} className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors shrink-0">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          <span className="text-sm font-semibold hidden sm:block">Exit Study Mode</span>
        </Link>
        <div className="flex-1 hidden md:flex items-center gap-3 mx-4">
          <span className="text-[12px] text-on-surface-variant font-medium whitespace-nowrap">{progress}% Complete</span>
          <div className="flex-1 h-2.5 bg-surface-container-high rounded-full overflow-hidden">
            <div className="h-full bg-primary-container rounded-full transition-all duration-700" style={{ width: `${progress}%`, boxShadow: '0 0 12px rgba(255,138,61,0.4)' }} />
          </div>
          <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>stars</span>
        </div>
        <div className="flex items-center gap-3 ml-auto shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-xl">
            <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            <span className="text-[13px] font-black text-primary">{totalXP} XP</span>
          </div>
        </div>
      </header>

      {/* ── 3-col body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: section nav */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 bg-surface-container-low border-r border-outline-variant/20 overflow-y-auto">
          <div className="px-5 py-5 border-b border-outline-variant/20">
            <p className="text-[11px] font-black text-primary uppercase tracking-widest mb-1">Today's Topic</p>
            <p className="text-[14px] font-semibold text-on-surface line-clamp-2">{resource?.title}</p>
          </div>
          <nav className="flex flex-col gap-1.5 p-4 flex-1">
            {sections.map((sec, i) => {
              const isDone = completed.has(i)
              const isActive = i === sectionIndex
              const isNext = i === sectionIndex + 1 && !isDone
              const isLocked = i > sectionIndex + 1 && !isDone && !completed.has(i)
              const canClick = !isLocked || isDone
              return (
                <button key={i} onClick={() => canClick && goToSection(i)} disabled={!canClick}
                  className={cn('flex items-center gap-3 w-full px-3 py-3 rounded-[1rem] text-left text-[13px] font-semibold transition-all',
                    isDone ? 'bg-primary-container text-on-primary-container shadow-[0_3px_0_0_#763300]' :
                    isActive ? 'bg-surface-container-high border-2 border-primary text-on-surface' :
                    isNext ? 'bg-surface-container border border-outline-variant/40 text-on-surface hover:bg-surface-container-high' :
                    isLocked ? 'text-on-surface-variant/30 cursor-not-allowed' :
                    'text-on-surface-variant hover:bg-surface-container-high'
                  )}>
                  <span className="text-[16px] shrink-0">
                    {isDone ? '✅' : isActive ? '▶️' : sec.icon || (isLocked ? '🔒' : '📖')}
                  </span>
                  <span className="truncate">{sec.title || `Section ${i + 1}`}</span>
                </button>
              )
            })}
          </nav>
          <div className="m-4 p-4 bg-surface-container rounded-[1rem] border border-outline-variant/20 shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              <span className="text-[12px] font-bold text-on-surface">Focus: {focusMinutes}m</span>
            </div>
            <div className="h-1.5 bg-surface-container-low rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (focusMinutes % 25) / 25 * 100)}%` }} />
            </div>
          </div>
        </aside>

        {/* CENTER: content */}
        <main className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">

            {/* READING */}
            {phase === 'reading' && current && (
              <article className="bg-surface-container rounded-[1.5rem] border border-outline-variant/30 overflow-hidden shadow-lg">
                {/* Header */}
                <div className="px-8 pt-8 pb-0">
                  <div className="flex items-center gap-3 mb-3">
                    {current.icon && <span className="text-[28px]">{current.icon}</span>}
                    <span className="text-[11px] font-black text-primary-container uppercase tracking-widest">Section {sectionIndex + 1} of {total}</span>
                  </div>
                  <h2 className="text-[26px] font-bold text-on-surface leading-tight">{current.title}</h2>
                </div>

                {/* Key Question */}
                {current.key_question && (
                  <div className="mx-8 mt-7 p-4 bg-secondary/10 border border-secondary/20 rounded-[1rem]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-secondary text-[16px]">help_outline</span>
                      <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Key Question</span>
                    </div>
                    <p className="text-[16px] font-bold text-on-surface">{current.key_question}</p>
                  </div>
                )}

                {/* Plain English */}
                {current.plain_english && (
                  <div className="mx-8 mt-7">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">Simple Analogy / Plain English</span>
                    </div>
                    <div className="prose prose-invert max-w-none text-[15px] leading-relaxed text-on-surface/90">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{current.plain_english}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Deep Dive */}
                {current.deep_dive && (
                  <div className="mx-8 mt-7">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-tertiary text-[16px]">school</span>
                      <span className="text-[10px] font-black text-tertiary uppercase tracking-widest">Deep Dive</span>
                    </div>
                    <div className="prose prose-invert max-w-none text-[15px] leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{current.deep_dive}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Memory Trick */}
                {current.memory_trick && (
                  <div className="mx-8 mt-7 p-4 bg-tertiary/10 border border-tertiary/20 rounded-[1rem]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-tertiary text-[16px]">psychology</span>
                      <span className="text-[10px] font-black text-tertiary uppercase tracking-widest">Memory Trick</span>
                    </div>
                    <p className="text-[15px] text-on-surface italic">{current.memory_trick}</p>
                  </div>
                )}

                {/* Quick Summary */}
                {current.quick_summary && (
                  <div className="mx-8 mt-7 p-4 bg-primary/5 border border-primary/20 rounded-[1rem]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-primary text-[16px]">summarize</span>
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">Quick Summary</span>
                    </div>
                    <p className="text-[14px] text-on-surface-variant leading-relaxed">{current.quick_summary}</p>
                  </div>
                )}

                {/* Fallback for old content field */}
                {!current.plain_english && !current.deep_dive && current.content && (
                  <div className="mx-8 mt-7 prose prose-invert max-w-none text-[15px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{current.content}</ReactMarkdown>
                  </div>
                )}

                {/* No content fallback */}
                {!current.plain_english && !current.deep_dive && !current.content && (
                  <div className="mx-8 mt-7 p-6 bg-surface-container-high rounded-[1rem] text-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-[40px] mb-2 block opacity-40">description</span>
                    <p className="text-[14px]">Content for this section is being generated. You can still take the quiz.</p>
                  </div>
                )}

                {/* Action bar */}
                <div className="px-8 py-6 mt-4 border-t border-outline-variant/20 flex items-center justify-between gap-4">
                  <button onClick={() => sectionIndex > 0 && goToSection(sectionIndex - 1)} disabled={sectionIndex === 0}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-outline-variant/40 text-on-surface-variant text-[13px] font-bold hover:border-outline-variant hover:text-on-surface disabled:opacity-30 disabled:pointer-events-none transition-all">
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span> Previous
                  </button>
                  <div className="flex items-center gap-3">
                    <button onClick={readAloud}
                      className={cn('flex items-center gap-2 px-4 py-2.5 rounded-full border text-[13px] font-bold transition-all', isReading ? 'bg-primary/10 border-primary/30 text-primary' : 'border-outline-variant/40 text-on-surface-variant hover:border-outline-variant')}>
                      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: isReading ? "'FILL' 1" : "'FILL' 0" }}>volume_up</span>
                      {isReading ? 'Stop' : 'Listen'}
                    </button>
                    <button onClick={handleNext} disabled={loadingQuiz}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary-container text-on-primary-container font-bold text-[14px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all disabled:opacity-60">
                      {loadingQuiz ? <><span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span> Generating…</> : <>Next: Quick Test <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>}
                    </button>
                  </div>
                </div>
              </article>
            )}

            {/* QUIZ / RESULT */}
            {(phase === 'quiz' || phase === 'result') && questions.length > 0 && (
              <article className="bg-surface-container rounded-[1.5rem] border border-outline-variant/30 overflow-hidden shadow-lg">
                <div className="p-8">
                  <div className="flex items-center gap-3 mb-7">
                    <span className="material-symbols-outlined text-primary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>quiz</span>
                    <div>
                      <h4 className="text-[18px] font-bold text-on-surface">Quick Check</h4>
                      <p className="text-[12px] text-on-surface-variant">{current?.title}</p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {questions.map((q, qi) => (
                      <div key={qi}>
                        <p className="text-[15px] text-on-surface font-semibold mb-4">
                          <span className="text-primary mr-2 font-black">{qi + 1}.</span>{q.question}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {q.options.map((opt, oi) => {
                            const isSel = selected[qi] === opt
                            const isCorrect = submitted && opt === q.correct
                            const isWrong = submitted && isSel && !isCorrect
                            return (
                              <button key={oi} onClick={() => !submitted && setSelected(p => ({ ...p, [qi]: opt }))} disabled={submitted}
                                className={cn('p-4 rounded-[1rem] border-2 font-semibold text-left text-[14px] transition-all flex items-center justify-between gap-3',
                                  isCorrect ? 'bg-green-500/15 text-green-300 border-green-500/40' :
                                  isWrong ? 'bg-error-container/20 text-error border-error/40' :
                                  isSel ? 'bg-primary/10 text-primary border-primary/40' :
                                  'bg-surface-container-high border-outline-variant/40 hover:bg-surface-container-highest text-on-surface')}>
                                <span>{opt}</span>
                                <span className="material-symbols-outlined text-[18px] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
                                  {isCorrect ? 'check_circle' : isWrong ? 'cancel' : isSel ? 'radio_button_checked' : 'radio_button_unchecked'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        {submitted && (
                          <p className="text-[13px] text-on-surface-variant italic mt-3 pl-4 border-l-2 border-outline-variant/40">{q.explanation}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {submitted && (
                    <div className={cn('flex items-center gap-4 p-5 rounded-[1rem] border mt-8', passed ? 'bg-green-500/10 border-green-500/30' : 'bg-error-container/20 border-error/30')}>
                      <span className={cn('material-symbols-outlined text-[32px]', passed ? 'text-green-400' : 'text-error')} style={{ fontVariationSettings: "'FILL' 1" }}>
                        {passed ? 'emoji_events' : 'cancel'}
                      </span>
                      <div>
                        <p className="font-bold text-on-surface">
                          {passed ? `${correctCount}/${questions.length} correct — Great job! +${XP_PER_SECTION} XP` : `${correctCount}/${questions.length} correct — Review and try again`}
                        </p>
                        <p className="text-[12px] text-on-surface-variant mt-0.5">
                          {passed ? 'You can move to the next section.' : 'Read through the section again before retrying.'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-6">
                    {!submitted ? (
                      <button onClick={handleSubmit} className="w-full py-3.5 rounded-full bg-primary-container text-on-primary-container font-black text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all">
                        Submit Answers
                      </button>
                    ) : passed ? (
                      <button onClick={handleNextSection} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full bg-primary-container text-on-primary-container font-black text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all">
                        {sectionIndex < total - 1 ? <>Next Section <span className="material-symbols-outlined text-[18px]">arrow_forward</span></> : '🎓 Complete!'}
                      </button>
                    ) : (
                      <div className="flex gap-3">
                        <button onClick={() => { setPhase('reading'); setSelected({}); setSubmitted(false) }} className="flex-1 py-3 rounded-full bg-surface-container-high border border-outline-variant/50 text-on-surface font-bold text-[14px] hover:bg-surface-container-highest transition-all">Re-read</button>
                        <button onClick={() => { setSelected({}); setSubmitted(false); setPhase('quiz') }} className="flex-1 py-3 rounded-full bg-primary/15 border border-primary/30 text-primary font-bold text-[14px] hover:bg-primary/20 transition-all">Retry Quiz</button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )}

            {/* XP Banner */}
            {completed.size > 0 && (
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-[1.5rem] p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-secondary-container rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-secondary-container text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface text-[15px]">Keep going, Explorer!</p>
                    <p className="text-on-surface-variant text-[13px]">{completed.size}/{total} sections done</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[28px] font-bold text-primary leading-none">+{totalXP}</p>
                  <p className="text-on-surface-variant text-[12px]">XP earned</p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* RIGHT: AI tip + timer + progress */}
        <aside className="hidden xl:flex flex-col w-72 shrink-0 bg-surface-container-low border-l border-outline-variant/20 overflow-y-auto">
          <div className="flex flex-col gap-5 p-5">

            {/* AI Tip */}
            <div className="bg-surface-container rounded-[1.5rem] border border-outline-variant/20 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                </div>
                <p className="text-[14px] font-bold text-primary">FlowAI's Tip</p>
              </div>
              <p className="text-on-surface-variant text-[13px] italic leading-relaxed">{TIPS[tipIdx]}</p>
              <button className="mt-4 w-full flex items-center justify-center gap-2 text-secondary text-[13px] font-semibold hover:underline">
                <span className="material-symbols-outlined text-[16px]">lightbulb</span>
                Tell me more!
              </button>
            </div>

            {/* Focus Timer */}
            <div className="bg-surface-container-high rounded-[1.5rem] border border-outline-variant/20 p-5">
              <h4 className="font-bold text-on-surface text-[14px] mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">timer</span>
                Focus Timer
              </h4>
              <div className="text-[40px] font-bold text-center py-3 bg-background rounded-[1rem] text-primary mb-4 font-mono tracking-wider">
                {formatTime(timerSeconds)}
              </div>
              <button onClick={() => setTimerRunning(r => !r)}
                className="w-full py-3 rounded-[1rem] font-bold text-[13px] bg-surface-container hover:bg-primary-container hover:text-on-primary-container transition-all border border-outline-variant/30">
                {timerRunning ? 'Pause Session' : 'Resume Session'}
              </button>
            </div>

            {/* Progress */}
            <div className="bg-surface-container rounded-[1.5rem] border border-outline-variant/20 p-5">
              <h4 className="font-bold text-on-surface text-[14px] mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">menu_book</span>
                Progress
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between text-[13px]">
                  <span className="text-on-surface-variant">Sections done</span>
                  <span className="text-primary font-bold">{completed.size}/{total}</span>
                </div>
                <div className="h-2.5 bg-surface-container-low rounded-full overflow-hidden">
                  <div className="h-full bg-primary-container rounded-full transition-all" style={{ width: `${total > 0 ? (completed.size / total) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-on-surface-variant">XP earned</span>
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
