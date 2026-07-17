'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import {
  ArrowLeft, ArrowRight, CheckCircle2, XCircle,
  Zap, Trophy, Volume2, Loader2, BookOpen,
  ChevronRight, Star
} from 'lucide-react'

type QuizQuestion = {
  question: string
  options: string[]
  correct: string
  explanation: string
}

type PhaseType = 'reading' | 'quiz' | 'result'

const XP_PER_SECTION = 15
const PASS_THRESHOLD = 2 // correct out of 3

export default function StudyModePage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  const router = useRouter()
  const qc = useQueryClient()

  const [sectionIndex, setSectionIndex] = useState(0)
  const [phase, setPhase] = useState<PhaseType>('reading')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loadingQuiz, setLoadingQuiz] = useState(false)
  const [totalXP, setTotalXP] = useState(0)
  const [sectionsCompleted, setSectionsCompleted] = useState<Set<number>>(new Set())
  const [isReading, setIsReading] = useState(false)
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null)

  const { data: resource, isLoading } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  const sections = resource?.ai_notes_json?.sections || []
  const currentSection = sections[sectionIndex]
  const totalSections = sections.length

  const correctCount = submitted
    ? questions.filter((q, i) => answers[i] === q.correct).length
    : 0
  const passed = correctCount >= PASS_THRESHOLD

  // Text-to-speech for optional AI reading
  const readAloud = () => {
    if (isReading) {
      window.speechSynthesis.cancel()
      setIsReading(false)
      return
    }
    if (!currentSection?.content) return
    const text = currentSection.content
      .replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6} /g, '').replace(/\n/g, ' ')
      .slice(0, 1000)
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.95
    utt.onend = () => setIsReading(false)
    synthRef.current = utt
    window.speechSynthesis.speak(utt)
    setIsReading(true)
  }

  useEffect(() => {
    return () => { window.speechSynthesis.cancel() }
  }, [])

  useEffect(() => {
    // Stop reading when section changes
    window.speechSynthesis.cancel()
    setIsReading(false)
  }, [sectionIndex])

  const handleNext = async () => {
    if (phase === 'reading') {
      // Fetch quiz for this section
      setLoadingQuiz(true)
      try {
        const res = await libraryApi.getSectionQuiz(
          resourceId,
          currentSection.title,
          currentSection.content?.slice(0, 1500) || ''
        )
        setQuestions(res.data.questions || [])
        setAnswers({})
        setSubmitted(false)
        setPhase('quiz')
      } catch {
        toast.error('Could not generate quiz. Try again.')
      } finally {
        setLoadingQuiz(false)
      }
    }
  }

  const handleSubmitQuiz = () => {
    if (Object.keys(answers).length < questions.length) {
      toast.error('Answer all questions before submitting.')
      return
    }
    setSubmitted(true)
    setPhase('result')
    if (passed) {
      const xp = XP_PER_SECTION
      setTotalXP(prev => prev + xp)
      setSectionsCompleted(prev => new Set([...prev, sectionIndex]))
      toast.success(`+${xp} XP! Well done 🎉`, { duration: 2000 })
      // Award XP to progress
      libraryApi.completeStep(resourceId, 'notes', Math.round((sectionsCompleted.size + 1) / totalSections * 100))
        .catch(() => {})
      qc.invalidateQueries({ queryKey: ['progress', resourceId] })
    }
  }

  const handleNextSection = () => {
    if (sectionIndex < totalSections - 1) {
      setSectionIndex(i => i + 1)
      setPhase('reading')
      setQuestions([])
      setAnswers({})
      setSubmitted(false)
    } else {
      // All sections done
      toast.success('🎓 You\'ve completed all sections! Understand step done.')
      router.push(`/library/${resourceId}`)
    }
  }

  const handleRetry = () => {
    setAnswers({})
    setSubmitted(false)
    setPhase('quiz')
  }

  if (isLoading) return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
    </div>
  )

  const progress = totalSections > 0 ? Math.round((sectionIndex / totalSections) * 100) : 0

  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex flex-col overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0 bg-[#0d0d0d]">
        <Link href={`/library/${resourceId}`} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" /> Exit Study Mode
        </Link>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-medium">
            Section {sectionIndex + 1} of {totalSections}
          </span>
          <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* XP counter */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl">
          <Zap className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-xs font-black text-orange-400">{totalXP} XP</span>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* READING phase */}
        {phase === 'reading' && currentSection && (
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

            {/* Section header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">
                    Part {sectionIndex + 1}
                  </span>
                  {sectionsCompleted.has(sectionIndex) && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                      <CheckCircle2 className="w-3 h-3" /> Done
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight">{currentSection.title}</h1>
              </div>
              <button
                onClick={readAloud}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all shrink-0',
                  isReading
                    ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                )}
              >
                <Volume2 className="w-3.5 h-3.5" />
                {isReading ? 'Stop' : 'Listen'}
              </button>
            </div>

            {/* Section content */}
            <div className="prose prose-invert prose-sm max-w-none bg-[#111] border border-white/5 rounded-2xl p-6">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {currentSection.content || ''}
              </ReactMarkdown>
            </div>

            {/* Next button */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => sectionIndex > 0 && (setSectionIndex(i => i - 1), setPhase('reading'))}
                disabled={sectionIndex === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/8 text-slate-400 text-sm font-bold hover:text-white hover:border-white/20 disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Previous
              </button>

              <button
                onClick={handleNext}
                disabled={loadingQuiz}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-black hover:bg-orange-400 active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-orange-500/20"
              >
                {loadingQuiz
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating quiz…</>
                  : <>Next: Quick Test <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          </div>
        )}

        {/* QUIZ phase */}
        {(phase === 'quiz' || phase === 'result') && questions.length > 0 && (
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

            {/* Quiz header */}
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center mx-auto">
                <BookOpen className="w-6 h-6 text-orange-400" />
              </div>
              <h2 className="text-xl font-black text-white">Quick Check</h2>
              <p className="text-slate-500 text-sm">
                {currentSection?.title} — Answer all 3 to continue
              </p>
            </div>

            {/* Questions */}
            <div className="space-y-5">
              {questions.map((q, qi) => (
                <div key={qi} className="bg-[#111] border border-white/5 rounded-2xl p-5 space-y-3">
                  <p className="text-sm font-bold text-white leading-relaxed">
                    <span className="text-orange-400 mr-2">{qi + 1}.</span>{q.question}
                  </p>
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => {
                      const isSelected = answers[qi] === opt
                      const isCorrect = submitted && opt === q.correct
                      const isWrong = submitted && isSelected && opt !== q.correct
                      return (
                        <button
                          key={oi}
                          onClick={() => !submitted && setAnswers(prev => ({ ...prev, [qi]: opt }))}
                          disabled={submitted}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left text-sm transition-all',
                            isCorrect ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' :
                            isWrong ? 'border-red-500/40 bg-red-500/10 text-red-200' :
                            isSelected ? 'border-orange-500/40 bg-orange-500/10 text-orange-200' :
                            'border-white/8 bg-white/[0.02] text-slate-300 hover:border-white/20 hover:bg-white/5'
                          )}
                        >
                          {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                          {isWrong && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                          {!isCorrect && !isWrong && (
                            <span className={cn('w-5 h-5 rounded-full border text-[10px] font-black flex items-center justify-center shrink-0',
                              isSelected ? 'border-orange-400 text-orange-400' : 'border-white/20 text-slate-500'
                            )}>
                              {String.fromCharCode(65 + oi)}
                            </span>
                          )}
                          <span>{opt}</span>
                        </button>
                      )
                    })}
                  </div>
                  {submitted && (
                    <p className="text-xs text-slate-400 italic pl-2 border-l-2 border-white/10">
                      {q.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Result banner */}
            {submitted && (
              <div className={cn(
                'flex items-center gap-4 p-4 rounded-2xl border',
                passed
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              )}>
                {passed
                  ? <Trophy className="w-8 h-8 text-emerald-400 shrink-0" />
                  : <XCircle className="w-8 h-8 text-red-400 shrink-0" />}
                <div>
                  <p className="font-black text-white">
                    {passed ? `${correctCount}/3 correct — Well done! +${XP_PER_SECTION} XP` : `${correctCount}/3 correct — Review and try again`}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {passed ? 'You can move to the next section.' : 'Read through the section again then retry.'}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between">
              {!submitted ? (
                <button
                  onClick={handleSubmitQuiz}
                  className="w-full py-3 rounded-xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 active:scale-95 transition-all shadow-lg shadow-orange-500/20"
                >
                  Submit Answers
                </button>
              ) : passed ? (
                <button
                  onClick={handleNextSection}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white font-black text-sm hover:bg-emerald-400 active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
                >
                  {sectionIndex < totalSections - 1
                    ? <><ChevronRight className="w-4 h-4" /> Next Section</>
                    : <><Trophy className="w-4 h-4" /> Complete!</>}
                </button>
              ) : (
                <div className="flex gap-3 w-full">
                  <button onClick={() => { setPhase('reading'); setAnswers({}); setSubmitted(false) }}
                    className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-sm hover:bg-white/10 transition-all">
                    Re-read Section
                  </button>
                  <button onClick={handleRetry}
                    className="flex-1 py-3 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400 font-bold text-sm hover:bg-orange-500/30 transition-all">
                    Retry Quiz
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
