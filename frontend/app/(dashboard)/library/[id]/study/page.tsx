'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { libraryApi, aiApi, authApi, getAuthToken, API_BASE } from '@/lib/api'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

type QuizQuestion = { question: string; options: string[]; correct: string; explanation: string }
type WrittenQuestion = { question: string; hint?: string; model_answer: string }
type Phase = 'reading' | 'quiz' | 'written' | 'result' | 'mastery' | 'mastery_complete'
type Section = {
  icon?: string; title: string; key_question?: string; plain_english?: string
  deep_dive?: string; memory_trick?: string; quick_summary?: string; content?: string
}
type TranscriptEntry = { role: 'user' | 'ai'; text: string; ts: number }

const XP_PER_SECTION = 50
const XP_MASTERY = 200
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

  const [sectionIndex, setSectionIndex] = useState(() => {
    if (typeof window === 'undefined') return 0
    try { return parseInt(localStorage.getItem(`study_${resourceId}_section`) || '0') || 0 } catch { return 0 }
  })
  const [phase, setPhase] = useState<Phase>('reading')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [writtenQ, setWrittenQ] = useState<WrittenQuestion | null>(null)
  const [writtenAnswer, setWrittenAnswer] = useState('')
  const [writtenGrade, setWrittenGrade] = useState<'got_it' | 'needs_work' | null>(null)
  const [writtenFeedback, setWrittenFeedback] = useState('')
  const [gradingWritten, setGradingWritten] = useState(false)
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loadingQuiz, setLoadingQuiz] = useState(false)
  const [totalXP, setTotalXP] = useState(() => {
    if (typeof window === 'undefined') return 0
    try { return parseInt(localStorage.getItem(`study_${resourceId}_xp`) || '0') || 0 } catch { return 0 }
  })
  const [completed, setCompleted] = useState<Set<number>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(`study_${resourceId}_completed`)
      if (raw) return new Set(JSON.parse(raw) as number[])
    } catch {}
    return new Set()
  })
  const [isReading, setIsReading] = useState(false)
  const [tipIdx] = useState(() => Math.floor(Math.random() * TIPS.length))
  const [timerSeconds, setTimerSeconds] = useState(25 * 60)
  const [timerRunning, setTimerRunning] = useState(true)
  const [focusMinutes, setFocusMinutes] = useState(0)
  const timerRef = useRef<NodeJS.Timeout>()
  const tickRef = useRef(0)

  // Mastery / voice session state
  const [masteryTranscript, setMasteryTranscript] = useState<TranscriptEntry[]>([])
  const [masteryConnecting, setMasteryConnecting] = useState(false)
  const [masteryActive, setMasteryActive] = useState(false)
  const [masteryMuted, setMasteryMuted] = useState(false)
  const [masteryScore, setMasteryScore] = useState(0)
  const [masteryFeedback, setMasteryFeedback] = useState('')
  const masteryWsRef = useRef<WebSocket | null>(null)
  const masteryAudioCtxRef = useRef<AudioContext | null>(null)
  const masteryPcRef = useRef<RTCPeerConnection | null>(null)
  const masteryStreamRef = useRef<MediaStream | null>(null)
  const masteryScrollRef = useRef<HTMLDivElement>(null)
  const [sectionDrawerOpen, setSectionDrawerOpen] = useState(false)

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

  // ── Persist progress to localStorage ────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(`study_${resourceId}_section`, String(sectionIndex))
      localStorage.setItem(`study_${resourceId}_xp`, String(totalXP))
      localStorage.setItem(`study_${resourceId}_completed`, JSON.stringify([...completed]))
    } catch {}
  }, [sectionIndex, totalXP, completed, resourceId])

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
    const correct = questions.filter((q, i) => selected[i] === q.correct).length
    const didPass = questions.length > 0 && correct >= Math.ceil(questions.length * 0.6)
    setSubmitted(true); setPhase('result')
    if (didPass && !completed.has(sectionIndex)) {
      const newXP = totalXP + XP_PER_SECTION
      const newCompleted = new Set(completed)
      newCompleted.add(sectionIndex)
      setTotalXP(newXP)
      setCompleted(newCompleted)
      toast.success(`+${XP_PER_SECTION} XP! 🎉`, { duration: 2000 })
      // Award XP on backend so it aggregates to dashboard total
      authApi.awardXp(XP_PER_SECTION, `Study Mode: Section ${sectionIndex + 1} of ${resource?.title}`, resourceId).catch(() => {})
      libraryApi.completeStep(resourceId, 'notes', Math.round(newCompleted.size / total * 100)).catch(() => {})
      qc.invalidateQueries({ queryKey: ['progress', resourceId] })
      qc.invalidateQueries({ queryKey: ['profile'] })
    }
  }

  const goToSection = (i: number) => {
    setSectionIndex(i); setPhase('reading'); setQuestions([]); setSelected({}); setSubmitted(false)
    setWrittenQ(null); setWrittenAnswer(''); setWrittenGrade(null); setWrittenFeedback('')
  }

  const resetProgress = () => {
    try {
      localStorage.removeItem(`study_${resourceId}_section`)
      localStorage.removeItem(`study_${resourceId}_xp`)
      localStorage.removeItem(`study_${resourceId}_completed`)
    } catch {}
    setSectionIndex(0); setPhase('reading'); setQuestions([]); setSelected({}); setSubmitted(false)
    setWrittenQ(null); setWrittenAnswer(''); setWrittenGrade(null); setWrittenFeedback('')
    setTotalXP(0); setCompleted(new Set())
    toast.success('Progress reset. Starting fresh!')
  }

  // Show resume toast on first load if there is saved progress
  const didShowResumeRef = useRef(false)
  useEffect(() => {
    if (didShowResumeRef.current) return
    didShowResumeRef.current = true
    if (sectionIndex > 0 || completed.size > 0) {
      toast.info(`Resuming from section ${sectionIndex + 1} — ${completed.size} done, ${totalXP} XP`, { duration: 3000 })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNextSection = () => {
    // Only advance if current section is completed
    if (!completed.has(sectionIndex)) {
      toast.error('Complete this section first before moving on.')
      return
    }
    if (sectionIndex < total - 1) { goToSection(sectionIndex + 1) }
    else {
      // All sections done — trigger Mastery
      setPhase('mastery')
      toast.success('🎓 All sections complete! Time for your Mastery session!', { duration: 3000 })
    }
  }

  // Written test: load a written question after MCQ passed
  const handleLoadWritten = async () => {
    if (!current) return
    const content = getSectionContent(current)
    setGradingWritten(true)
    try {
      const res = await aiApi.quickAsk(
        `Generate ONE short-answer question to test deep understanding of this content. Return JSON only: {"question": "...", "hint": "brief hint...", "model_answer": "..."}\n\nContent: ${content.slice(0, 1000)}`,
        resourceId
      )
      const text = res.data?.answer || res.data?.reply || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        setWrittenQ(parsed); setWrittenAnswer(''); setWrittenGrade(null); setWrittenFeedback('')
        setPhase('written')
      } else { throw new Error('No question') }
    } catch { toast.error('Could not generate written question.'); handleNextSection() }
    finally { setGradingWritten(false) }
  }

  // Grade written answer with AI
  const handleGradeWritten = async () => {
    if (!writtenAnswer.trim() || !writtenQ) return
    setGradingWritten(true)
    try {
      const res = await aiApi.gradeAnswer(resourceId, writtenQ.question, writtenAnswer, writtenQ.model_answer)
      const data = res.data
      setWrittenFeedback(data.feedback || '')
      setWrittenGrade(data.correct ? 'got_it' : 'needs_work')
      if (data.correct && !completed.has(sectionIndex)) {
        const bonus = Math.round(XP_PER_SECTION * 0.5)
        const newXP = totalXP + bonus
        setTotalXP(newXP)
        toast.success(`+${bonus} XP for written test! 📝`, { duration: 2000 })
        authApi.awardXp(bonus, `Study Mode: Written test Section ${sectionIndex + 1}`, resourceId).catch(() => {})
        qc.invalidateQueries({ queryKey: ['profile'] })
      }
    } catch { setWrittenGrade('got_it'); setWrittenFeedback('Great effort! Move on to the next section.') }
    finally { setGradingWritten(false) }
  }

  // ─── MASTERY VOICE SESSION ────────────────────────────────────────────────
  const startMasterySession = async () => {
    setMasteryConnecting(true)
    setMasteryTranscript([])
    try {
      const token = await getAuthToken()
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const backendHost = (API_BASE || '').replace(/^https?:\/\//, '').replace(/\/api$/, '')
      const host = backendHost || 'localhost:8000'
      // Build topic summary from all sections
      const topicSummary = sections.slice(0, 10).map((s, i) => `${i + 1}. ${s.title}: ${s.quick_summary || s.plain_english || ''}`.slice(0, 120)).join('\n')
      const context = `resource_id:${resourceId}|technique:feynman|topic:${resource?.title}|sections:${topicSummary}`
      const wsUrl = `${protocol}//${host}/ws/ai/examprep/?token=${token}&context=${encodeURIComponent(context)}`
      const ws = new WebSocket(wsUrl)
      masteryWsRef.current = ws
      const audioCtx = new AudioContext({ sampleRate: 24000 })
      masteryAudioCtxRef.current = audioCtx
      let playbackQueue: AudioBuffer[] = []
      let isPlaying = false

      const playNext = async () => {
        if (isPlaying || playbackQueue.length === 0) return
        isPlaying = true
        const buf = playbackQueue.shift()!
        const src = audioCtx.createBufferSource()
        src.buffer = buf
        src.connect(audioCtx.destination)
        src.onended = () => { isPlaying = false; playNext() }
        src.start()
      }

      ws.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'ai_text') {
              setMasteryTranscript(p => [...p, { role: 'ai', text: msg.text, ts: Date.now() }])
              setTimeout(() => { masteryScrollRef.current?.scrollTo({ top: 9999, behavior: 'smooth' }) }, 50)
            } else if (msg.type === 'user_text') {
              setMasteryTranscript(p => [...p, { role: 'user', text: msg.text, ts: Date.now() }])
            } else if (msg.type === 'session_report') {
              setMasteryScore(msg.score || 75)
              setMasteryFeedback(msg.summary || 'Great session! You demonstrated solid understanding.')
              setMasteryActive(false)
              setPhase('mastery_complete')
              const masteryXP = totalXP + XP_MASTERY
              setTotalXP(masteryXP)
              toast.success(`🏆 Mastery complete! +${XP_MASTERY} XP!`, { duration: 3000 })
              authApi.awardXp(XP_MASTERY, `Study Mode: Mastery Challenge — ${resource?.title}`, resourceId).catch(() => {})
              libraryApi.completeStep(resourceId, 'examprep', msg.score || 75).catch(() => {})
              qc.invalidateQueries({ queryKey: ['progress', resourceId] })
              qc.invalidateQueries({ queryKey: ['profile'] })
              // Clear localStorage so next visit starts fresh after mastery
              try { localStorage.removeItem(`study_${resourceId}_section`); localStorage.removeItem(`study_${resourceId}_xp`); localStorage.removeItem(`study_${resourceId}_completed`) } catch {}
            }
          } catch {}
        } else if (event.data instanceof Blob) {
          const arrBuf = await event.data.arrayBuffer()
          const pcmData = new Int16Array(arrBuf)
          const floatData = new Float32Array(pcmData.length)
          for (let i = 0; i < pcmData.length; i++) floatData[i] = pcmData[i] / 32768
          const audioBuf = audioCtx.createBuffer(1, floatData.length, 24000)
          audioBuf.getChannelData(0).set(floatData)
          playbackQueue.push(audioBuf)
          playNext()
        }
      }

      ws.onopen = async () => {
        setMasteryConnecting(false)
        setMasteryActive(true)
        // Start mic
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 24000, channelCount: 1 } })
        masteryStreamRef.current = stream
        const micCtx = new AudioContext({ sampleRate: 24000 })
        const source = micCtx.createMediaStreamSource(stream)
        const processor = micCtx.createScriptProcessor(4096, 1, 1)
        processor.onaudioprocess = (e) => {
          if (masteryMuted || !masteryWsRef.current || masteryWsRef.current.readyState !== WebSocket.OPEN) return
          const float32 = e.inputBuffer.getChannelData(0)
          const int16 = new Int16Array(float32.length)
          for (let i = 0; i < float32.length; i++) int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
          masteryWsRef.current.send(int16.buffer)
        }
        source.connect(processor)
        processor.connect(micCtx.destination)
      }

      ws.onerror = () => { setMasteryConnecting(false); setMasteryActive(false); toast.error('Could not connect to voice session.') }
      ws.onclose = () => { setMasteryConnecting(false); setMasteryActive(false) }
    } catch (err: any) {
      setMasteryConnecting(false)
      toast.error(err.message || 'Could not start voice session. Check microphone permissions.')
    }
  }

  const endMasterySession = () => {
    masteryWsRef.current?.close()
    masteryStreamRef.current?.getTracks().forEach(t => t.stop())
    masteryAudioCtxRef.current?.close()
    setMasteryActive(false)
    if (phase === 'mastery') {
      setMasteryScore(65)
      setMasteryFeedback('Session ended early. Try completing the full mastery session for best results.')
      setPhase('mastery_complete')
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

      {/* ── Mobile Section Drawer (Sheet) ── */}
      {sectionDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSectionDrawerOpen(false)} />
          {/* Sheet */}
          <div className="relative bg-surface-container-low rounded-t-3xl border-t border-outline-variant/30 max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface-container-low px-5 pt-5 pb-3 border-b border-outline-variant/20 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black text-primary uppercase tracking-widest">Sections</p>
                <p className="text-[14px] font-bold text-on-surface line-clamp-1 mt-0.5">{resource?.title}</p>
              </div>
              <button onClick={() => setSectionDrawerOpen(false)} className="p-2 rounded-xl bg-surface-container-high text-on-surface-variant">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            {/* Progress bar */}
            <div className="px-5 py-3 flex items-center gap-3">
              <span className="text-[12px] text-on-surface-variant font-medium whitespace-nowrap">{progress}% Complete</span>
              <div className="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden">
                <div className="h-full bg-primary-container rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <nav className="flex flex-col gap-1.5 px-4 pb-4">
              {sections.map((sec, i) => {
                const isDone = completed.has(i)
                const isActive = i === sectionIndex && phase !== 'mastery' && phase !== 'mastery_complete'
                const isLocked = !isDone && i !== sectionIndex
                const canClick = isDone || i === sectionIndex
                return (
                  <button key={i} onClick={() => { if (canClick) { goToSection(i); setSectionDrawerOpen(false) } }} disabled={!canClick}
                    className={cn('flex items-center gap-3 w-full px-3 py-3 rounded-[1rem] text-left text-[13px] font-semibold transition-all',
                      isDone ? 'bg-primary-container text-on-primary-container' :
                      isActive ? 'bg-surface-container-high border-2 border-primary text-on-surface' :
                      isLocked ? 'text-on-surface-variant/30 cursor-not-allowed' :
                      'text-on-surface-variant hover:bg-surface-container-high'
                    )}>
                    <span className="text-[16px] shrink-0">{isDone ? '✅' : isActive ? '▶️' : sec.icon || '🔒'}</span>
                    <span className="truncate">{sec.title || `Section ${i + 1}`}</span>
                  </button>
                )
              })}
              <div className={cn('flex items-center gap-3 w-full px-3 py-3 rounded-[1rem] text-left text-[13px] font-semibold mt-2 border-t border-outline-variant/20 pt-4',
                phase === 'mastery' || phase === 'mastery_complete' ? 'bg-tertiary-container/20 border border-tertiary/30 text-tertiary' :
                completed.size === total && total > 0 ? 'text-tertiary hover:bg-tertiary/10 cursor-pointer' :
                'text-on-surface-variant/30'
              )} onClick={() => { if (completed.size === total && total > 0) { setPhase('mastery'); setSectionDrawerOpen(false) } }}>
                <span className="text-[16px]">{phase === 'mastery_complete' ? '🏆' : '🎓'}</span>
                <div className="min-w-0">
                  <p className="truncate">Mastery Challenge</p>
                  <p className="text-[10px] opacity-70 truncate">{completed.size === total && total > 0 ? 'Unlocked — Feynman voice' : `${total - completed.size} sections left`}</p>
                </div>
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <header className="flex items-center gap-3 px-4 sm:px-6 border-b border-outline-variant/25 bg-surface-container-low shrink-0 z-20 tool-header-safe">
        <Link href={`/library/${resourceId}`} className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors shrink-0">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          <span className="text-sm font-semibold hidden sm:block">Exit</span>
        </Link>
        {/* Mobile: section picker button */}
        <button onClick={() => setSectionDrawerOpen(true)}
          className="flex lg:hidden items-center gap-1.5 px-3 py-1.5 bg-surface-container rounded-xl border border-outline-variant/30 text-on-surface text-[12px] font-bold shrink-0">
          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>menu_book</span>
          <span className="max-w-[100px] truncate">{phase === 'mastery' || phase === 'mastery_complete' ? 'Mastery' : (sections[sectionIndex]?.title || `§${sectionIndex + 1}`)}</span>
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant">expand_more</span>
        </button>
        <div className="flex-1 hidden lg:flex items-center gap-3 mx-4">
          <span className="text-[12px] text-on-surface-variant font-medium whitespace-nowrap">{progress}% Complete</span>
          <div className="flex-1 h-2.5 bg-surface-container-high rounded-full overflow-hidden">
            <div className="h-full bg-primary-container rounded-full transition-all duration-700" style={{ width: `${progress}%`, boxShadow: '0 0 12px rgba(255,138,61,0.4)' }} />
          </div>
          <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>stars</span>
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 border border-primary/20 rounded-xl">
            <span className="material-symbols-outlined text-primary text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            <span className="text-[12px] sm:text-[13px] font-black text-primary">{totalXP} XP</span>
          </div>
          {(sectionIndex > 0 || completed.size > 0) && (
            <button
              onClick={() => { if (window.confirm('Reset all study progress for this resource?')) resetProgress() }}
              className="p-2 rounded-xl text-on-surface-variant/50 hover:text-error hover:bg-error-container/10 transition-all"
              title="Reset progress"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
            </button>
          )}
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
              const isActive = i === sectionIndex && phase !== 'mastery' && phase !== 'mastery_complete'
              // Can only click if already completed OR it is the current section
              // Next sections are locked until current is done
              const isLocked = !isDone && i !== sectionIndex
              const canClick = isDone || i === sectionIndex
              return (
                <button key={i} onClick={() => canClick && goToSection(i)} disabled={!canClick}
                  title={isLocked ? 'Complete this section first' : undefined}
                  className={cn('flex items-center gap-3 w-full px-3 py-3 rounded-[1rem] text-left text-[13px] font-semibold transition-all',
                    isDone ? 'bg-primary-container text-on-primary-container shadow-[0_3px_0_0_#763300] hover:brightness-110' :
                    isActive ? 'bg-surface-container-high border-2 border-primary text-on-surface' :
                    isLocked ? 'text-on-surface-variant/30 cursor-not-allowed' :
                    'text-on-surface-variant hover:bg-surface-container-high'
                  )}>
                  <span className="text-[16px] shrink-0">
                    {isDone ? '✅' : isActive ? '▶️' : sec.icon || '🔒'}
                  </span>
                  <span className="truncate">{sec.title || `Section ${i + 1}`}</span>
                </button>
              )
            })}
            {/* Mastery item — unlocks when all sections done */}
            <div className={cn('flex items-center gap-3 w-full px-3 py-3 rounded-[1rem] text-left text-[13px] font-semibold mt-2 border-t border-outline-variant/20 pt-4',
              phase === 'mastery' || phase === 'mastery_complete' ? 'bg-tertiary-container/20 border border-tertiary/30 text-tertiary' :
              completed.size === total && total > 0 ? 'text-tertiary hover:bg-tertiary/10 cursor-pointer' :
              'text-on-surface-variant/30'
            )} onClick={() => completed.size === total && total > 0 && setPhase('mastery')}>
              <span className="text-[16px]">{phase === 'mastery_complete' ? '🏆' : '🎓'}</span>
              <div className="min-w-0">
                <p className="truncate">Mastery Challenge</p>
                <p className="text-[10px] opacity-70 truncate">{completed.size === total && total > 0 ? 'Unlocked — Feynman voice' : `${total - completed.size} sections left`}</p>
              </div>
            </div>
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
          <div className="max-w-3xl mx-auto px-3 sm:px-6 py-5 sm:py-10 space-y-6 sm:space-y-8">

            {/* READING */}
            {phase === 'reading' && current && (
              <article className="bg-surface-container rounded-[1.5rem] border border-outline-variant/30 overflow-hidden shadow-lg">
                {/* Header */}
                <div className="px-4 sm:px-8 pt-5 sm:pt-8 pb-0">
                  <div className="flex items-center gap-3 mb-3">
                    {current.icon && <span className="text-[24px] sm:text-[28px]">{current.icon}</span>}
                    <span className="text-[11px] font-black text-primary-container uppercase tracking-widest">Section {sectionIndex + 1} of {total}</span>
                  </div>
                  <h2 className="text-[20px] sm:text-[26px] font-bold text-on-surface leading-tight">{current.title}</h2>
                </div>

                {/* Key Question */}
                {current.key_question && (
                  <div className="mx-3 sm:mx-8 mt-5 sm:mt-7 p-3 sm:p-4 bg-secondary/10 border border-secondary/20 rounded-[1rem]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-secondary text-[16px]">help_outline</span>
                      <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Key Question</span>
                    </div>
                    <p className="text-[14px] sm:text-[16px] font-bold text-on-surface">{current.key_question}</p>
                  </div>
                )}

                {/* Plain English */}
                {current.plain_english && (
                  <div className="mx-3 sm:mx-8 mt-5 sm:mt-7">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">Simple Analogy / Plain English</span>
                    </div>
                    <div className="prose prose-invert max-w-none text-[14px] sm:text-[15px] leading-relaxed text-on-surface/90">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{current.plain_english}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Deep Dive */}
                {current.deep_dive && (
                  <div className="mx-3 sm:mx-8 mt-5 sm:mt-7">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-tertiary text-[16px]">school</span>
                      <span className="text-[10px] font-black text-tertiary uppercase tracking-widest">Deep Dive</span>
                    </div>
                    <div className="prose prose-invert max-w-none text-[14px] sm:text-[15px] leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{current.deep_dive}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Memory Trick */}
                {current.memory_trick && (
                  <div className="mx-3 sm:mx-8 mt-5 sm:mt-7 p-3 sm:p-4 bg-tertiary/10 border border-tertiary/20 rounded-[1rem]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-tertiary text-[16px]">psychology</span>
                      <span className="text-[10px] font-black text-tertiary uppercase tracking-widest">Memory Trick</span>
                    </div>
                    <p className="text-[14px] sm:text-[15px] text-on-surface italic">{current.memory_trick}</p>
                  </div>
                )}

                {/* Quick Summary */}
                {current.quick_summary && (
                  <div className="mx-3 sm:mx-8 mt-5 sm:mt-7 p-3 sm:p-4 bg-primary/5 border border-primary/20 rounded-[1rem]">
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
                <div className="px-3 sm:px-8 py-4 sm:py-6 mt-4 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-3">
                  <button onClick={() => sectionIndex > 0 && goToSection(sectionIndex - 1)} disabled={sectionIndex === 0}
                    className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full border border-outline-variant/40 text-on-surface-variant text-[12px] sm:text-[13px] font-bold hover:border-outline-variant hover:text-on-surface disabled:opacity-30 disabled:pointer-events-none transition-all">
                    <span className="material-symbols-outlined text-[16px] sm:text-[18px]">arrow_back</span> Prev
                  </button>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button onClick={readAloud}
                      className={cn('flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full border text-[12px] sm:text-[13px] font-bold transition-all', isReading ? 'bg-primary/10 border-primary/30 text-primary' : 'border-outline-variant/40 text-on-surface-variant hover:border-outline-variant')}>
                      <span className="material-symbols-outlined text-[16px] sm:text-[18px]" style={{ fontVariationSettings: isReading ? "'FILL' 1" : "'FILL' 0" }}>volume_up</span>
                      {isReading ? 'Stop' : 'Listen'}
                    </button>
                    <button onClick={handleNext} disabled={loadingQuiz}
                      className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-full bg-primary-container text-on-primary-container font-bold text-[12px] sm:text-[14px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all disabled:opacity-60">
                      {loadingQuiz ? <><span className="material-symbols-outlined text-[14px] sm:text-[16px] animate-spin">autorenew</span> <span className="hidden sm:inline">Generating…</span><span className="sm:hidden">Loading</span></> : <>Next <span className="hidden sm:inline">: Quick Test</span><span className="material-symbols-outlined text-[16px] sm:text-[18px]">arrow_forward</span></>}
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
                      <button onClick={handleLoadWritten} disabled={gradingWritten}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full bg-primary-container text-on-primary-container font-black text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all disabled:opacity-60">
                        {gradingWritten ? <><span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span> Loading…</> : <>Written Test <span className="material-symbols-outlined text-[18px]">edit_note</span></>}
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
            {completed.size > 0 && phase !== 'mastery' && phase !== 'mastery_complete' && (
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
            {/* WRITTEN TEST phase */}
            {phase === 'written' && writtenQ && (
              <article className="bg-surface-container rounded-[1.5rem] border border-outline-variant/30 overflow-hidden shadow-lg">
                <div className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="material-symbols-outlined text-secondary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>edit_note</span>
                    <div>
                      <h4 className="text-[18px] font-bold text-on-surface">Written Test</h4>
                      <p className="text-[12px] text-on-surface-variant">Demonstrate your understanding in your own words</p>
                    </div>
                  </div>

                  <div className="p-5 bg-secondary/10 border border-secondary/20 rounded-[1rem] mb-6">
                    <p className="text-[16px] font-semibold text-on-surface">{writtenQ.question}</p>
                    {writtenQ.hint && <p className="text-[13px] text-on-surface-variant mt-2 italic">Hint: {writtenQ.hint}</p>}
                  </div>

                  <textarea
                    className="w-full h-36 bg-surface-container-high border-2 border-outline-variant/40 focus:border-secondary rounded-[1rem] px-5 py-4 text-[15px] text-on-surface resize-none focus:outline-none transition-all placeholder:text-on-surface-variant/40"
                    placeholder="Write your answer here in your own words…"
                    value={writtenAnswer}
                    onChange={e => setWrittenAnswer(e.target.value)}
                    disabled={!!writtenGrade}
                  />

                  {writtenGrade && (
                    <div className={cn('p-5 rounded-[1rem] border mt-4', writtenGrade === 'got_it' ? 'bg-green-500/10 border-green-500/30' : 'bg-primary/10 border-primary/20')}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {writtenGrade === 'got_it' ? 'check_circle' : 'lightbulb'}
                        </span>
                        <p className="font-bold text-on-surface">{writtenGrade === 'got_it' ? 'Great explanation!' : 'Good effort — keep studying!'}</p>
                      </div>
                      {writtenFeedback && <p className="text-[13px] text-on-surface-variant leading-relaxed">{writtenFeedback}</p>}
                      <details className="mt-3">
                        <summary className="text-[12px] text-on-surface-variant cursor-pointer hover:text-on-surface">View model answer</summary>
                        <p className="text-[13px] text-on-surface-variant mt-2 pl-3 border-l-2 border-outline-variant/40 italic">{writtenQ.model_answer}</p>
                      </details>
                    </div>
                  )}

                  <div className="mt-6 flex gap-3">
                    {!writtenGrade ? (
                      <>
                        <button onClick={handleNextSection} className="flex-1 py-3 rounded-full bg-surface-container-high border border-outline-variant/50 text-on-surface-variant font-bold text-[14px] hover:bg-surface-container-highest transition-all">
                          Skip
                        </button>
                        <button onClick={handleGradeWritten} disabled={!writtenAnswer.trim() || gradingWritten}
                          className="flex-1 py-3 rounded-full bg-secondary text-on-secondary font-bold text-[14px] shadow-[0_4px_0_0_#12139b] active:translate-y-1 active:shadow-none hover:brightness-110 disabled:opacity-50 transition-all">
                          {gradingWritten ? 'Grading…' : 'Submit Answer'}
                        </button>
                      </>
                    ) : (
                      <button onClick={handleNextSection}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full bg-primary-container text-on-primary-container font-black text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all">
                        {sectionIndex < total - 1 ? <>Next Section <span className="material-symbols-outlined text-[18px]">arrow_forward</span></> : <>Start Mastery 🎓</>}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )}

            {/* MASTERY CHALLENGE phase */}
            {phase === 'mastery' && (
              <article className="bg-surface-container rounded-[1.5rem] border border-tertiary/30 overflow-hidden shadow-lg">
                <div className="p-8">
                  {/* Header */}
                  <div className="text-center mb-8">
                    <div className="w-20 h-20 rounded-full bg-tertiary/15 border-2 border-tertiary/30 flex items-center justify-center mx-auto mb-4">
                      <span className="material-symbols-outlined text-tertiary text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
                    </div>
                    <h2 className="text-[24px] font-bold text-on-surface mb-2">Mastery Challenge</h2>
                    <p className="text-[14px] text-on-surface-variant max-w-md mx-auto">
                      Prove you've truly mastered <strong className="text-on-surface">{resource?.title}</strong> using the Feynman technique. Explain concepts aloud to FlowAI — it'll challenge you with follow-up questions.
                    </p>
                  </div>

                  {/* How it works */}
                  {!masteryActive && !masteryConnecting && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                      {[
                        { icon: 'mic', color: 'text-tertiary', title: 'Speak Freely', desc: 'Explain concepts in your own words like you\'re teaching a friend' },
                        { icon: 'smart_toy', color: 'text-primary', title: 'AI Challenges', desc: 'FlowAI asks follow-up questions when it needs clarification' },
                        { icon: 'emoji_events', color: 'text-secondary', title: 'Get Scored', desc: `Earn up to ${XP_MASTERY} XP based on your depth of understanding` },
                      ].map(s => (
                        <div key={s.title} className="p-4 bg-surface-container-high rounded-[1rem] text-center">
                          <span className={cn('material-symbols-outlined text-[28px] mb-2 block', s.color)} style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
                          <p className="font-bold text-on-surface text-[14px] mb-1">{s.title}</p>
                          <p className="text-[12px] text-on-surface-variant">{s.desc}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Active session UI */}
                  {(masteryActive || masteryConnecting) && (
                    <div className="mb-6">
                      {/* Waveform indicator */}
                      <div className="flex items-center justify-center gap-1 h-16 mb-4">
                        {masteryConnecting ? (
                          <span className="material-symbols-outlined text-tertiary text-[36px] animate-spin">autorenew</span>
                        ) : (
                          [...Array(12)].map((_, i) => (
                            <div key={i} className="w-1.5 bg-tertiary rounded-full animate-pulse"
                              style={{ height: `${20 + Math.random() * 40}px`, animationDelay: `${i * 0.1}s`, animationDuration: `${0.6 + Math.random() * 0.4}s` }} />
                          ))
                        )}
                      </div>
                      <p className="text-center text-[13px] text-on-surface-variant mb-4">
                        {masteryConnecting ? 'Connecting to FlowAI…' : masteryMuted ? '🔇 Microphone muted' : '🎙️ Listening — speak freely'}
                      </p>

                      {/* Transcript */}
                      <div ref={masteryScrollRef} className="h-48 overflow-y-auto bg-surface-container-low rounded-[1rem] p-4 space-y-3 scrollbar-hide border border-outline-variant/20">
                        {masteryTranscript.length === 0 && (
                          <p className="text-center text-on-surface-variant/40 text-[13px] italic mt-8">Conversation will appear here…</p>
                        )}
                        {masteryTranscript.map((entry, i) => (
                          <div key={i} className={cn('flex gap-2.5', entry.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                            <div className={cn('max-w-[80%] rounded-[1rem] px-3 py-2 text-[13px]', entry.role === 'user' ? 'bg-primary-container text-on-primary-container rounded-tr-sm' : 'bg-tertiary/10 border border-tertiary/20 text-on-surface rounded-tl-sm')}>
                              {entry.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Controls */}
                  {masteryActive ? (
                    <div className="flex gap-3">
                      <button onClick={() => setMasteryMuted(m => !m)}
                        className={cn('flex-1 flex items-center justify-center gap-2 py-3 rounded-full font-bold text-[14px] transition-all border', masteryMuted ? 'bg-error-container/20 border-error/30 text-error' : 'bg-surface-container-high border-outline-variant/40 text-on-surface hover:bg-surface-container-highest')}>
                        <span className="material-symbols-outlined text-[18px]">{masteryMuted ? 'mic_off' : 'mic'}</span>
                        {masteryMuted ? 'Unmute' : 'Mute'}
                      </button>
                      <button onClick={endMasterySession}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full bg-error text-on-error font-bold text-[14px] transition-all">
                        <span className="material-symbols-outlined text-[18px]">stop_circle</span>
                        End Session
                      </button>
                    </div>
                  ) : masteryConnecting ? (
                    <button disabled className="w-full py-3.5 rounded-full bg-tertiary/30 text-tertiary font-bold text-[15px] opacity-70 flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span> Connecting…
                    </button>
                  ) : (
                    <button onClick={startMasterySession}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full bg-tertiary text-on-tertiary-container font-black text-[15px] shadow-[0_4px_0_0_#400688] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all">
                      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
                      Start Mastery Session
                    </button>
                  )}
                </div>
              </article>
            )}

            {/* MASTERY COMPLETE */}
            {phase === 'mastery_complete' && (
              <article className="bg-surface-container rounded-[1.5rem] border border-outline-variant/30 overflow-hidden shadow-lg">
                <div className="p-8 text-center">
                  <div className="w-24 h-24 rounded-full bg-tertiary/15 border-4 border-tertiary flex items-center justify-center mx-auto mb-6 relative">
                    <span className="material-symbols-outlined text-tertiary text-[48px]" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
                    <div className="absolute -bottom-1 -right-1 bg-primary-container text-on-primary-container text-[13px] font-black px-2 py-0.5 rounded-full shadow-lg">
                      +{XP_MASTERY} XP
                    </div>
                  </div>
                  <h2 className="text-[26px] font-bold text-on-surface mb-2">Mastery Achieved! 🎓</h2>
                  <p className="text-[14px] text-on-surface-variant mb-6 max-w-md mx-auto">{masteryFeedback}</p>

                  {/* Score circle */}
                  <div className="flex items-center justify-center gap-8 mb-8">
                    <div className="text-center">
                      <p className="text-[48px] font-bold text-tertiary leading-none">{masteryScore}</p>
                      <p className="text-[12px] text-on-surface-variant uppercase tracking-widest mt-1">Score</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[48px] font-bold text-primary leading-none">{totalXP}</p>
                      <p className="text-[12px] text-on-surface-variant uppercase tracking-widest mt-1">Total XP</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[48px] font-bold text-secondary leading-none">{completed.size}</p>
                      <p className="text-[12px] text-on-surface-variant uppercase tracking-widest mt-1">Sections</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => { setPhase('mastery'); setMasteryTranscript([]) }}
                      className="flex-1 py-3 rounded-full bg-surface-container-high border border-outline-variant/50 text-on-surface font-bold text-[14px] hover:bg-surface-container-highest transition-all">
                      Retry Mastery
                    </button>
                    <button onClick={() => router.push(`/library/${resourceId}`)}
                      className="flex-1 py-3.5 rounded-full bg-primary-container text-on-primary-container font-black text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all">
                      Back to Resource
                    </button>
                  </div>
                </div>
              </article>
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
