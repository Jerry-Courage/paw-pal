'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, getAuthToken, API_BASE } from '@/lib/api'
import {
  ArrowLeft, Mic, MicOff, Square, Brain, Zap,
  MessageSquare, CheckCircle2, XCircle, AlertCircle,
  ChevronRight, RotateCcw, Loader2, Volume2,
  Clock, FileText, ChevronLeft, Award, Target
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useStudyTimer } from '@/hooks/useStudyTimer'

// ── Types ─────────────────────────────────────────────────────────────────────
type Technique = 'feynman' | 'active_recall' | 'socratic' | 'free_chat'
type Phase = 'setup' | 'session' | 'report' | 'exam'
type TranscriptEntry = { role: 'user' | 'ai'; text: string; ts: number }

// Available Gemini Live voices
const GEMINI_VOICES = [
  { id: 'Puck',   label: 'Puck',   desc: 'Playful & expressive 😄' },
  { id: 'Aoede',  label: 'Aoede',  desc: 'Warm & engaging 🌟' },
  { id: 'Kore',   label: 'Kore',   desc: 'Upbeat & encouraging ⚡' },
  { id: 'Charon', label: 'Charon', desc: 'Thoughtful & measured 🎓' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Confident & clear 💪' },
  { id: 'Leda',   label: 'Leda',   desc: 'Calm & focused 🧘' },
]

interface SessionReport {
  summary: string
  strengths: string[]
  gaps: string[]
  score: number
  recommendation: string
}

// Exam types
type ExamQuestionType = 'mcq' | 'written'

interface MCQQuestion {
  type: 'mcq'
  question: string
  options: string[]
  correct_answer: string
  explanation: string
}

interface WrittenQuestion {
  type: 'written'
  question: string
  hint?: string
  model_answer: string
}

type ExamQuestion = MCQQuestion | WrittenQuestion

interface ExamResult {
  index: number
  question: ExamQuestion
  answer: string
  correct: boolean | null   // null = written (self-graded)
  selfGrade?: 'got_it' | 'needs_work'
}

const TECHNIQUES: { id: Technique; label: string; icon: any; desc: string; color: string }[] = [
  {
    id: 'feynman',
    label: 'Feynman Technique',
    icon: Brain,
    desc: 'Teach the AI like it knows nothing. It will ask questions when confused.',
    color: 'border-violet-500/40 bg-violet-500/8 text-violet-400',
  },
  {
    id: 'active_recall',
    label: 'Active Recall',
    icon: Zap,
    desc: 'AI fires questions at you one by one. Answer out loud.',
    color: 'border-orange-500/40 bg-orange-500/8 text-orange-400',
  },
  {
    id: 'socratic',
    label: 'Socratic Method',
    icon: MessageSquare,
    desc: 'AI guides you with probing questions. No direct answers.',
    color: 'border-sky-500/40 bg-sky-500/8 text-sky-400',
  },
  {
    id: 'free_chat',
    label: 'Open Session',
    icon: Zap,
    desc: 'Tell the AI what you want — quiz battle, debate, roleplay, anything educational.',
    color: 'border-emerald-500/40 bg-emerald-500/8 text-emerald-400',
  },
]

// ── Audio helpers ─────────────────────────────────────────────────────────────

// Proper resampling using OfflineAudioContext (much better quality than linear interpolation)
async function resampleTo16k(float32: Float32Array, inputRate: number): Promise<Int16Array> {
  if (inputRate === 16000) {
    const out = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      out[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
    }
    return out
  }
  const outputLen = Math.round(float32.length * 16000 / inputRate)
  const offlineCtx = new OfflineAudioContext(1, outputLen, 16000)
  const buffer = offlineCtx.createBuffer(1, float32.length, inputRate)
  buffer.copyToChannel(float32, 0)
  const source = offlineCtx.createBufferSource()
  source.buffer = buffer
  source.connect(offlineCtx.destination)
  source.start()
  const rendered = await offlineCtx.startRendering()
  const resampled = rendered.getChannelData(0)
  const out = new Int16Array(resampled.length)
  for (let i = 0; i < resampled.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, resampled[i] * 32768))
  }
  return out
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// Gemini Native Audio outputs PCM16 at 24kHz
function base64ToPcmFloat(b64: string): Float32Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const int16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768
  return float32
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExamPrepPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  useStudyTimer(true)
  const [phase, setPhase] = useState<Phase>('setup')
  const [technique, setTechnique] = useState<Technique>('feynman')
  const [voice, setVoice] = useState<string>('') // empty = auto-select by technique
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [report, setReport] = useState<SessionReport | null>(null)
  const [sessionDuration, setSessionDuration] = useState(0)

  // Exam state
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([])
  const [examAnswers, setExamAnswers] = useState<Record<number, string>>({})
  const [examRevealed, setExamRevealed] = useState<Record<number, boolean>>({})
  const [examTimeLeft, setExamTimeLeft] = useState(0)
  const [examDuration, setExamDuration] = useState(30 * 60) // default 30 min
  const [examStarted, setExamStarted] = useState(false)
  const [examFinished, setExamFinished] = useState(false)
  const [examResults, setExamResults] = useState<ExamResult[]>([])
  const [examCurrentQ, setExamCurrentQ] = useState(0)
  const [examLoading, setExamLoading] = useState(false)
  const examTimerRef = useRef<any>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const nextPlayTimeRef = useRef(0)  // scheduled end time of last chunk
  const timerRef = useRef<any>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const isSpeakingTimeoutRef = useRef<any>(null)

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // Session timer
  useEffect(() => {
    if (phase === 'session') {
      timerRef.current = setInterval(() => setSessionDuration(d => d + 1), 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [phase])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ── Play AI audio — scheduled for gapless playback ───────────────────────
  const playAudioChunk = useCallback((pcm: Float32Array) => {
    const ctx = audioCtxRef.current || new AudioContext({ sampleRate: 24000 })
    audioCtxRef.current = ctx

    const buffer = ctx.createBuffer(1, pcm.length, 24000)
    buffer.copyToChannel(pcm, 0)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    // Schedule chunk to start exactly when the previous one ends — no gaps
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current)
    source.start(startAt)
    nextPlayTimeRef.current = startAt + buffer.duration

    setIsAiSpeaking(true)
    // Clear speaking indicator 500ms after last chunk ends
    clearTimeout(isSpeakingTimeoutRef.current)
    isSpeakingTimeoutRef.current = setTimeout(() => {
      setIsAiSpeaking(false)
    }, (nextPlayTimeRef.current - ctx.currentTime) * 1000 + 500)
  }, [])

  // ── Connect WebSocket ──────────────────────────────────────────────────────
  const startSession = async () => {
    if (!resource) return
    setIsConnecting(true)

    // ── Request mic access FIRST, inside the user gesture ──────────────────
    // Browsers require a user gesture to grant getUserMedia.
    // If we wait until the WS 'ready' message, the gesture is gone and it fails silently.
    let micStream: MediaStream | null = null
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 16000 },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      streamRef.current = micStream
    } catch (e) {
      toast.error('Microphone access denied. Please allow mic permission and try again.')
      setIsConnecting(false)
      return
    }

    try {
      const token = await getAuthToken()
      const backendHost = (API_BASE || '').replace(/^https?:\/\//, '').replace(/\/api$/, '')
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${backendHost}/ws/examprep/${resourceId}/?token=${token}`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        // Build resource context from study kit
        const kit = resource.ai_notes_json || {}
        const sections = (kit.sections || []).slice(0, 10)
        const context = sections.map((s: any) => `${s.title}: ${s.content?.slice(0, 300)}`).join('\n\n')

        ws.send(JSON.stringify({
          type: 'start',
          technique,
          resource_title: resource.title,
          resource_context: context,
          ...(voice ? { voice } : {}),
        }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        if (msg.type === 'ready') {
          setIsConnecting(false)
          setPhase('session')
          // Mic stream already acquired — just wire up the processor
          activateMicProcessor(streamRef.current!)
        } else if (msg.type === 'audio') {
          const pcm = base64ToPcmFloat(msg.data)
          playAudioChunk(pcm)
        } else if (msg.type === 'transcript_user' || msg.type === 'transcript_ai') {
          const role = msg.type === 'transcript_user' ? 'user' : 'ai'
          setTranscript(prev => {
            if (prev.length === 0) return [{ role, text: msg.text, ts: Date.now() }]
            const last = prev[prev.length - 1]
            // Coalesce chunks if same role and within a short timeframe (e.g. active stream)
            if (last.role === role && (Date.now() - last.ts < 2000)) {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + msg.text, ts: Date.now() }
              ]
            }
            return [...prev, { role, text: msg.text, ts: Date.now() }]
          })
        } else if (msg.type === 'session_report') {
          clearTimeout(endSessionTimeoutRef.current)
          setReport(msg.report)
          setIsEndingSession(false)
          setPhase('report')
          stopMic()
        } else if (msg.type === 'error') {
          toast.error(msg.message)
          setIsConnecting(false)
        }
      }

      ws.onerror = () => {
        toast.error('Connection failed. Check your internet.')
        setIsConnecting(false)
      }

      ws.onclose = () => {
        setIsRecording(false)
        stopMic()
      }
    } catch (e) {
      toast.error('Failed to start session')
      setIsConnecting(false)
    }
  }

  // ── Mic capture ────────────────────────────────────────────────────────────
  // Called AFTER mic stream is already acquired (inside the button click gesture)
  const activateMicProcessor = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = async (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        const float32 = e.inputBuffer.getChannelData(0).slice()
        try {
          const pcm16 = await resampleTo16k(float32, ctx.sampleRate)
          const b64 = int16ToBase64(pcm16)
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'audio', data: b64 }))
          }
        } catch (err) {
          // Resampling failed, skip chunk
        }
      }

      source.connect(processor)
      // Connect to a silent gain node — required for onaudioprocess to fire,
      // but volume 0 so mic audio doesn't play back through speakers
      const silentGain = ctx.createGain()
      silentGain.gain.value = 0
      processor.connect(silentGain)
      silentGain.connect(ctx.destination)

      setIsRecording(true)
    } catch (e) {
      toast.error('Failed to start mic processing. Please try again.')
    }
  }

  const stopMic = () => {
    processorRef.current?.disconnect()
    processorRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setIsRecording(false)
  }

  const [isEndingSession, setIsEndingSession] = useState(false)
  const [textInput, setTextInput] = useState('')
  const endSessionTimeoutRef = useRef<any>(null)

  const endSession = () => {
    stopMic()
    clearInterval(timerRef.current)

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_session' }))
      setIsEndingSession(true)

      // Safety timeout — if backend doesn't send session_report within 20s,
      // show a fallback report so the user isn't stuck forever
      endSessionTimeoutRef.current = setTimeout(() => {
        setIsEndingSession(false)
        if (!report) {
          setReport({
            summary: `You completed a ${formatTime(sessionDuration)} session on "${resource?.title || 'this material'}".`,
            strengths: transcript.filter(e => e.role === 'user').length > 0
              ? ['You engaged with the material and practiced explaining concepts out loud.']
              : [],
            gaps: ['Session report could not be generated — the AI connection timed out.'],
            score: 50,
            recommendation: 'Try again with a stable internet connection. Review your notes before the next session.',
          })
        }
        setPhase('report')
      }, 20000)
    } else {
      // WebSocket already closed — build a basic report from transcript
      const userTurns = transcript.filter(e => e.role === 'user')
      setReport({
        summary: `Session of ${formatTime(sessionDuration)} completed. ${userTurns.length} responses recorded.`,
        strengths: userTurns.length > 2 ? ['You actively participated in the session.'] : [],
        gaps: userTurns.length < 2 ? ['Very few responses — try speaking more in the next session.'] : [],
        score: Math.min(80, 30 + userTurns.length * 10),
        recommendation: 'Review the material and try another session to deepen your understanding.',
      })
      setPhase('report')
    }
  }

  // Clear the safety timeout once the real report arrives
  // (handled in ws.onmessage where setPhase('report') is called)

  // ── Ctrl-to-talk: hold Ctrl key to mute/unmute mic ────────────────────────
  useEffect(() => {
    if (phase !== 'session') return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl (Windows/Linux) or Cmd (Mac) + Space = push-to-talk
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault()
        // Toggle mute: pause/resume audio processing by disconnecting the processor
        if (processorRef.current && audioCtxRef.current) {
          if (isRecording) {
            processorRef.current.disconnect()
            setIsRecording(false)
          } else {
            if (streamRef.current) {
              // Reconnect processor
              const source = audioCtxRef.current.createMediaStreamSource(streamRef.current)
              source.connect(processorRef.current)
              const silentGain = audioCtxRef.current.createGain()
              silentGain.gain.value = 0
              processorRef.current.connect(silentGain)
              silentGain.connect(audioCtxRef.current.destination)
              setIsRecording(true)
            }
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, isRecording])

  // ── Send text message to AI via WebSocket ─────────────────────────────────
  const sendTextMessage = () => {
    const text = textInput.trim()
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'text_message', text }))
    setTranscript(prev => [...prev, { role: 'user', text, ts: Date.now() }])
    setTextInput('')
  }

  const resetSession = () => {
    wsRef.current?.close()
    stopMic()
    setPhase('setup')
    setTranscript([])
    setReport(null)
    setSessionDuration(0)
    nextPlayTimeRef.current = 0
    clearTimeout(isSpeakingTimeoutRef.current)
  }

  // ── Exam logic ─────────────────────────────────────────────────────────────

  const loadExamQuestions = async () => {
    setExamLoading(true)
    try {
      const quizRes = await libraryApi.generateQuiz(resourceId, 'mcq', 'undergrad', 10)
      const practiceRes = await libraryApi.generatePracticeQuestions(resourceId, 'medium', 5)

      const mcqRaw: any[] = quizRes.data?.questions || []
      const writtenRaw: any[] = Array.isArray(practiceRes.data) ? practiceRes.data : []

      const mcqs: MCQQuestion[] = mcqRaw.map((q: any) => ({
        type: 'mcq',
        question: q.question,
        options: q.options || [],
        correct_answer: q.correct_answer,
        explanation: q.explanation || '',
      }))

      const written: WrittenQuestion[] = writtenRaw.map((q: any) => ({
        type: 'written',
        question: q.question,
        hint: q.hint,
        model_answer: q.model_answer || '',
      }))

      // Interleave: spread written questions evenly among MCQs
      const combined: ExamQuestion[] = []
      const writtenStep = mcqs.length > 0 ? Math.floor(mcqs.length / (written.length + 1)) : 1
      let wi = 0
      for (let i = 0; i < mcqs.length; i++) {
        if (wi < written.length && i > 0 && i % writtenStep === 0) {
          combined.push(written[wi++])
        }
        combined.push(mcqs[i])
      }
      while (wi < written.length) combined.push(written[wi++])

      setExamQuestions(combined)
      if (combined.length === 0) {
        toast.error('Generated zero questions. Please try again.')
        return false
      }
      return true
    } catch (e) {
      toast.error('Failed to load exam questions')
      return false
    } finally {
      setExamLoading(false)
    }
  }

  const startExam = () => {
    setExamStarted(true)
    setExamTimeLeft(examDuration)
    setExamCurrentQ(0)
    setExamAnswers({})
    setExamRevealed({})
    setExamFinished(false)
    setExamResults([])
  }

  // Countdown timer
  useEffect(() => {
    if (examStarted && !examFinished && examTimeLeft > 0) {
      examTimerRef.current = setInterval(() => {
        setExamTimeLeft(t => {
          if (t <= 1) {
            clearInterval(examTimerRef.current)
            finishExam()
            return 0
          }
          return t - 1
        })
      }, 1000)
    }
    return () => clearInterval(examTimerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examStarted, examFinished])

  const finishExam = useCallback(() => {
    clearInterval(examTimerRef.current)
    setExamFinished(true)
    // Reveal all written questions
    const allRevealed: Record<number, boolean> = {}
    examQuestions.forEach((_, i) => { allRevealed[i] = true })
    setExamRevealed(allRevealed)
  }, [examQuestions])

  const gradeExam = useCallback((answers: Record<number, string>, selfGrades: Record<number, 'got_it' | 'needs_work'>) => {
    const results: ExamResult[] = examQuestions.map((q, i) => {
      const answer = answers[i] || ''
      if (q.type === 'mcq') {
        return {
          index: i,
          question: q,
          answer,
          correct: answer === q.correct_answer,
        }
      } else {
        return {
          index: i,
          question: q,
          answer,
          correct: null,
          selfGrade: selfGrades[i],
        }
      }
    })
    setExamResults(results)
  }, [examQuestions])

  const submitExam = () => {
    clearInterval(examTimerRef.current)
    setExamFinished(true)
    const allRevealed: Record<number, boolean> = {}
    examQuestions.forEach((_, i) => { allRevealed[i] = true })
    setExamRevealed(allRevealed)
  }

  const formatExamTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────

  // Setup phase
  if (phase === 'setup') return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0">
        <Link href={`/library/${resourceId}`} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </Link>
        <div>
          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Exam Prep</p>
          <h1 className="text-sm font-black text-white truncate">{resource?.title || '...'}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="max-w-lg mx-auto space-y-8">

          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] flex items-center justify-center mx-auto">
              <Brain className="w-8 h-8 text-orange-400" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Exam Prep</h2>
            <p className="text-slate-500 text-sm">
              Phase 1: Test your understanding with a live AI session.<br />
              Phase 2: Timed exam with mixed questions.
            </p>
          </div>

          {/* Technique picker */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Choose your technique</p>
            {TECHNIQUES.map(t => {
              const Icon = t.icon
              const isSelected = technique === t.id
              return (
                <button key={t.id} onClick={() => setTechnique(t.id)}
                  className={cn(
                    'w-full flex items-start gap-4 p-4 rounded-2xl border text-left transition-all',
                    isSelected ? t.color : 'border-white/8 bg-white/3 hover:border-white/15'
                  )}>
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                    isSelected ? 'bg-white/10' : 'bg-white/5')}>
                    <Icon className={cn('w-5 h-5', isSelected ? '' : 'text-slate-500')} />
                  </div>
                  <div>
                    <p className={cn('text-sm font-black', isSelected ? '' : 'text-slate-300')}>{t.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t.desc}</p>
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 ml-auto shrink-0 mt-1" />}
                </button>
              )
            })}
          </div>

          {/* Voice picker */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">AI Voice</p>
              <span className="text-[10px] text-slate-600">Auto = best for technique</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setVoice('')}
                className={cn(
                  'py-2.5 px-3 rounded-xl border text-xs font-black transition-all',
                  voice === '' ? 'border-orange-500/40 bg-orange-500/10 text-orange-400' : 'border-white/8 bg-white/3 text-slate-500 hover:border-white/15'
                )}>
                Auto ✨
              </button>
              {GEMINI_VOICES.map(v => (
                <button key={v.id} onClick={() => setVoice(v.id)}
                  className={cn(
                    'py-2.5 px-3 rounded-xl border text-xs font-black transition-all text-left',
                    voice === v.id ? 'border-orange-500/40 bg-orange-500/10 text-orange-400' : 'border-white/8 bg-white/3 text-slate-500 hover:border-white/15'
                  )}>
                  <span className="block">{v.label}</span>
                  <span className="text-[9px] font-medium opacity-60 block mt-0.5">{v.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="bg-[#111] border border-white/5 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">How it works</p>
            {[
              'Your mic is live — speak naturally',
              'AI responds in real-time with voice',
              'After you end the session, get a report',
              'Then take the timed exam',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-orange-500/10 text-orange-400 text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-xs text-slate-400">{step}</span>
              </div>
            ))}
          </div>

          {/* Start button */}
          <button onClick={startSession} disabled={isConnecting}
            className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 active:scale-[0.98] transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2.5 disabled:opacity-50">
            {isConnecting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
              : <><Mic className="w-4 h-4" /> Start Session</>}
          </button>
        </div>
      </div>
    </div>
  )

  // Session phase
  if (phase === 'session') return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn('w-2 h-2 rounded-full', isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-600')} />
          <div>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">
              {TECHNIQUES.find(t => t.id === technique)?.label}
            </p>
            <p className="text-xs text-slate-500 font-medium">{formatTime(sessionDuration)}</p>
          </div>
        </div>
        <button onClick={endSession} disabled={isEndingSession}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black hover:bg-red-500/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
          {isEndingSession
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating report...</>
            : <><Square className="w-3.5 h-3.5 fill-current" /> End Session</>}
        </button>
      </div>
      
      {/* Dynamic Orb Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes orbPulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
        @keyframes orbWave {
          0% { transform: scale(1); opacity: 0.5; border-width: 2px; }
          100% { transform: scale(2.2); opacity: 0; border-width: 0px; }
        }
        @keyframes orbRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .orb-ai {
          background: radial-gradient(circle at 30% 30%, #c084fc, #8b5cf6, #4338ca, #1e1b4b);
          box-shadow: 0 0 80px 20px rgba(139, 92, 246, 0.5), inset 0 0 50px rgba(255, 255, 255, 0.6);
          animation: orbPulse 1.5s ease-in-out infinite, orbRotate 8s linear infinite;
        }
        .orb-user {
          background: radial-gradient(circle at 30% 30%, #fb923c, #ea580c, #991b1b, #450a0a);
          box-shadow: 0 0 50px 10px rgba(234, 88, 12, 0.3), inset 0 0 30px rgba(255, 255, 255, 0.3);
          animation: orbPulse 3s ease-in-out infinite, orbRotate 15s linear infinite reverse;
        }
        .orb-idle {
          background: radial-gradient(circle at 30% 30%, #475569, #1e293b, #0f172a);
          box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.1);
          animation: orbRotate 20s linear infinite;
        }
        .orb-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          animation: orbWave 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
        }
        .orb-ring.ai { border: 2px solid rgba(167, 139, 250, 0.8); }
        .orb-ring.user { border: 2px solid rgba(251, 146, 60, 0.4); animation-duration: 2.5s; }
        .orb-ring:nth-child(2) { animation-delay: 0.6s; }
        .orb-ring:nth-child(3) { animation-delay: 1.2s; }
      `}} />

      {/* Main Orb Canvas */}
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        {/* Background glow */}
        <div className={cn(
          "absolute inset-0 opacity-20 transition-all duration-1000",
          isAiSpeaking ? "bg-[radial-gradient(circle_at_center,#6d28d9,transparent_60%)]" 
          : isRecording ? "bg-[radial-gradient(circle_at_center,#9a3412,transparent_50%)]"
          : "bg-transparent"
        )} />

        {/* The Orb */}
        <div className="relative w-40 h-40 md:w-56 md:h-56 flex items-center justify-center z-10 mb-20">
          {/* Concentric rings when speaking */}
          {(isAiSpeaking || isRecording) && (
            <div className="absolute inset-0">
              <div className={cn("orb-ring", isAiSpeaking ? "ai" : "user")} />
              <div className={cn("orb-ring", isAiSpeaking ? "ai" : "user")} />
              <div className={cn("orb-ring", isAiSpeaking ? "ai" : "user")} />
            </div>
          )}
          
          {/* Core Orb */}
          <div className={cn(
            "w-full h-full rounded-full transition-all duration-700 ease-in-out relative z-10",
            isAiSpeaking ? "orb-ai scale-110" 
            : isRecording ? "orb-user scale-100" 
            : "orb-idle scale-95 opacity-50"
          )}>
            {/* Inner dynamic texture/sheen */}
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_60%_20%,rgba(255,255,255,0.4)_0%,transparent_50%)]" />
          </div>
        </div>

        {/* Floating Transcript (Bottom area) */}
        <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/90 to-transparent z-20 flex flex-col justify-end pb-4">
          <div className="max-w-2xl mx-auto w-full px-6 flex flex-col gap-3 max-h-[140px] overflow-y-auto scrollbar-hide">
            {transcript.filter(e => e.role === 'ai').length === 0 ? (
              <div className="text-center opacity-50 text-sm">
                {isRecording ? "Listening..." : "Microphone off"}
              </div>
            ) : (
              transcript.filter(e => e.role === 'ai').slice(-3).map((entry, i) => (
                <div key={i} className={cn(
                  "flex flex-col animate-in fade-in slide-in-from-bottom-2",
                  entry.role === 'ai' ? "items-start" : "items-end"
                )}>
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-widest mb-0.5",
                    entry.role === 'ai' ? "text-violet-400" : "text-orange-400"
                  )}>
                    {entry.role === 'ai' ? 'Albert Bot' : 'You'}
                  </span>
                  <div className={cn(
                    "text-sm md:text-base font-medium leading-relaxed max-w-[85%]",
                    entry.role === 'ai' ? "text-white" : "text-slate-300 text-right"
                  )}>
                    {entry.text}
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>

      {/* Text input fallback + Ctrl hint */}
      <div className="px-5 pt-3 pb-1 shrink-0 border-t border-white/5">
        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/8 rounded-2xl px-3 py-2 focus-within:border-orange-500/30 transition-colors">
          <input
            type="text"
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage() } }}
            placeholder="Type a message or hold Ctrl+Space to talk…"
            className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-600 focus:outline-none"
          />
          <button
            onClick={sendTextMessage}
            disabled={!textInput.trim()}
            className="p-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-30 disabled:pointer-events-none transition-all"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-center text-[9px] text-slate-700 mt-1.5">
          Hold <kbd className="px-1 py-0.5 rounded bg-white/5 text-slate-500 font-mono text-[9px]">Ctrl+Space</kbd> to toggle mic
        </p>
      </div>

      {/* Mic status bar */}
      <div className="px-5 py-4 border-t border-white/5 shrink-0">
        <div className={cn(
          'flex items-center justify-center gap-3 py-3 rounded-2xl border transition-all',
          isRecording
            ? 'bg-red-500/8 border-red-500/20'
            : 'bg-white/3 border-white/8'
        )}>
          {isRecording ? (
            <>
              <div className="flex gap-0.5">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="w-1 bg-red-400 rounded-full animate-bounce"
                    style={{ height: `${6 + (i % 3) * 6}px`, animationDelay: `${i * 0.08}s` }} />
                ))}
              </div>
              <span className="text-xs text-red-400 font-black uppercase tracking-widest">Listening</span>
            </>
          ) : (
            <>
              <MicOff className="w-4 h-4 text-slate-600" />
              <span className="text-xs text-slate-600 font-medium">Mic off</span>
            </>
          )}
        </div>
      </div>
    </div>
  )

  // Report phase
  if (phase === 'report' && report) return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0">
        <div>
          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Session Report</p>
          <h1 className="text-sm font-black text-white">{resource?.title}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        <div className="max-w-lg mx-auto space-y-5">

          {/* Score */}
          <div className="flex items-center gap-5 p-5 bg-[#111] border border-white/5 rounded-2xl">
            <div className="relative w-20 h-20 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/5" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 38}`}
                  strokeDashoffset={`${2 * Math.PI * 38 * (1 - report.score / 100)}`}
                  className={report.score >= 70 ? 'text-emerald-400' : report.score >= 40 ? 'text-orange-400' : 'text-red-400'}
                  style={{ transition: 'stroke-dashoffset 1s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-white">{report.score}</span>
                <span className="text-[9px] text-slate-500 font-black uppercase">Score</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-black text-white mb-1">
                {report.score >= 70 ? '🎉 Strong understanding!' : report.score >= 40 ? '💪 Getting there!' : '📚 Needs more review'}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">{report.summary}</p>
            </div>
          </div>

          {/* Strengths */}
          {report.strengths.length > 0 && (
            <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> What you nailed
              </p>
              {report.strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span className="text-xs text-emerald-200">{s}</span>
                </div>
              ))}
            </div>
          )}

          {/* Gaps */}
          {report.gaps.length > 0 && (
            <div className="bg-red-500/8 border border-red-500/20 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Gaps to fill
              </p>
              {report.gaps.map((g, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                  <span className="text-xs text-red-200">{g}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recommendation */}
          <div className="bg-[#111] border border-white/5 rounded-2xl p-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Recommendation</p>
            <p className="text-xs text-slate-300 leading-relaxed">{report.recommendation}</p>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={resetSession}
              className="py-3.5 rounded-2xl bg-white/5 border border-white/8 text-white font-black text-sm hover:bg-white/8 transition-all flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" /> Try Again
            </button>
            <button onClick={() => setPhase('exam')}
              className="py-3.5 rounded-2xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
              Exam <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <Link href={`/library/${resourceId}`}
            className="block text-center text-xs text-slate-600 hover:text-slate-400 transition-colors">
            ← Back to notes
          </Link>
        </div>
      </div>
    </div>
  )

  // ── Exam phase ─────────────────────────────────────────────────────────────
  if (phase === 'exam') {
    // Loading questions
    if (examLoading) return (
      <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
        <p className="text-slate-400 text-sm font-medium">Generating exam questions...</p>
      </div>
    )

    // Setup screen
    if (!examStarted) return (
      <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0">
          <button onClick={() => setPhase('report')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-400" />
          </button>
          <div>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Timed Exam</p>
            <h1 className="text-sm font-black text-white truncate">{resource?.title || '...'}</h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-8">
          <div className="max-w-lg mx-auto space-y-8">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] flex items-center justify-center mx-auto">
                <FileText className="w-8 h-8 text-orange-400" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">Timed Exam</h2>
              <p className="text-slate-500 text-sm">
                {examQuestions.length > 0
                  ? `${examQuestions.length} questions — ${examQuestions.filter(q => q.type === 'mcq').length} MCQ + ${examQuestions.filter(q => q.type === 'written').length} written`
                  : 'Mixed MCQ + written questions'}
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Choose duration</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '15 min', value: 15 * 60 },
                  { label: '30 min', value: 30 * 60 },
                  { label: '45 min', value: 45 * 60 },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setExamDuration(opt.value)}
                    className={cn(
                      'py-4 rounded-2xl border font-black text-sm transition-all flex flex-col items-center gap-1',
                      examDuration === opt.value
                        ? 'border-orange-500/40 bg-orange-500/10 text-orange-400'
                        : 'border-white/8 bg-white/3 text-slate-400 hover:border-white/15'
                    )}>
                    <Clock className={cn('w-5 h-5', examDuration === opt.value ? 'text-orange-400' : 'text-slate-500')} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-[#111] border border-white/5 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">What to expect</p>
              {[
                'MCQ questions are auto-graded',
                'Written questions: review model answer, self-grade',
                'Timer counts down — submit before it hits zero',
                'Results show score + improvement plan',
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-orange-500/10 text-orange-400 text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="text-xs text-slate-400">{step}</span>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                let success = true
                if (examQuestions.length === 0) {
                  success = await loadExamQuestions()
                }
                if (success) {
                  startExam()
                }
              }}
              disabled={examLoading}
              className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 active:scale-[0.98] transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2.5 disabled:opacity-50">
              {examLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading questions...</>
                : <><Zap className="w-4 h-4" /> Start Exam</>}
            </button>
          </div>
        </div>
      </div>
    )

    // Results screen
    if (examFinished && examResults.length > 0) {
      const mcqResults = examResults.filter(r => r.question.type === 'mcq')
      const writtenResults = examResults.filter(r => r.question.type === 'written')
      const mcqCorrect = mcqResults.filter(r => r.correct === true).length
      const writtenGotIt = writtenResults.filter(r => r.selfGrade === 'got_it').length
      const totalScore = examResults.length > 0
        ? Math.round(((mcqCorrect + writtenGotIt) / examResults.length) * 100)
        : 0
      const gaps = examResults.filter(r => r.correct === false || r.selfGrade === 'needs_work')

      return (
        <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0">
            <div>
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Exam Results</p>
              <h1 className="text-sm font-black text-white truncate">{resource?.title || '...'}</h1>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-6">
            <div className="max-w-lg mx-auto space-y-5">
              <div className="flex items-center gap-5 p-5 bg-[#111] border border-white/5 rounded-2xl">
                <div className="relative w-20 h-20 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/5" />
                    <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 38}`}
                      strokeDashoffset={`${2 * Math.PI * 38 * (1 - totalScore / 100)}`}
                      className={totalScore >= 70 ? 'text-emerald-400' : totalScore >= 40 ? 'text-orange-400' : 'text-red-400'}
                      style={{ transition: 'stroke-dashoffset 1s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-white">{totalScore}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-black text-white mb-1">
                    {totalScore >= 70 ? '🎉 Excellent work!' : totalScore >= 40 ? '💪 Good effort!' : '📚 Keep studying!'}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    MCQ: {mcqCorrect}/{mcqResults.length} correct
                    {writtenResults.length > 0 && ` · Written: ${writtenGotIt}/${writtenResults.length} got it`}
                  </p>
                </div>
              </div>
              {gaps.length > 0 && (
                <div className="bg-red-500/8 border border-red-500/20 rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" /> Improvement Plan
                  </p>
                  <p className="text-xs text-slate-400">
                    {report?.gaps?.length
                      ? `Based on your session gaps and exam results, focus on: ${report.gaps.slice(0, 2).join(', ')}.`
                      : 'Review the questions you missed and revisit those topics in your notes.'}
                  </p>
                  <div className="space-y-2">
                    {gaps.slice(0, 5).map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                        <span className="text-xs text-red-200 leading-relaxed">{r.question.question}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Question Breakdown</p>
                {examResults.map((r, i) => {
                  const isCorrect = r.question.type === 'mcq' ? r.correct : r.selfGrade === 'got_it'
                  const isPending = r.question.type === 'written' && !r.selfGrade
                  return (
                    <div key={i} className={cn(
                      'p-4 rounded-2xl border space-y-2',
                      isCorrect ? 'bg-emerald-500/5 border-emerald-500/20'
                        : isPending ? 'bg-white/3 border-white/8'
                        : 'bg-red-500/5 border-red-500/20'
                    )}>
                      <div className="flex items-start gap-2">
                        <span className={cn(
                          'w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5',
                          isCorrect ? 'bg-emerald-500/20 text-emerald-400'
                            : isPending ? 'bg-white/10 text-slate-400'
                            : 'bg-red-500/20 text-red-400'
                        )}>{i + 1}</span>
                        <p className="text-xs text-slate-300 leading-relaxed flex-1">{r.question.question}</p>
                        {!isPending && (
                          isCorrect
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                      </div>
                      {r.question.type === 'mcq' && !r.correct && (
                        <div className="ml-7 space-y-1">
                          <p className="text-[10px] text-red-400">Your answer: <span className="font-medium">{r.answer || '(none)'}</span></p>
                          <p className="text-[10px] text-emerald-400">Correct: <span className="font-medium">{(r.question as MCQQuestion).correct_answer}</span></p>
                          {(r.question as MCQQuestion).explanation && (
                            <p className="text-[10px] text-slate-500 leading-relaxed">{(r.question as MCQQuestion).explanation}</p>
                          )}
                        </div>
                      )}
                      {r.question.type === 'written' && r.selfGrade === 'needs_work' && (
                        <div className="ml-7">
                          <p className="text-[10px] text-slate-500 leading-relaxed">Model: {(r.question as WrittenQuestion).model_answer}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-3 pb-6">
                <button onClick={() => {
                  setExamStarted(false)
                  setExamFinished(false)
                  setExamResults([])
                  setExamAnswers({})
                  setExamRevealed({})
                  setExamCurrentQ(0)
                  setExamQuestions([])
                }}
                  className="py-3.5 rounded-2xl bg-white/5 border border-white/8 text-white font-black text-sm hover:bg-white/8 transition-all flex items-center justify-center gap-2">
                  <RotateCcw className="w-4 h-4" /> Retake
                </button>
                <Link href={`/library/${resourceId}`}
                  className="py-3.5 rounded-2xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
                  <Award className="w-4 h-4" /> Done
                </Link>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Active exam — questions one at a time
    return <ExamActiveView
      examQuestions={examQuestions}
      examCurrentQ={examCurrentQ}
      setExamCurrentQ={setExamCurrentQ}
      examAnswers={examAnswers}
      setExamAnswers={setExamAnswers}
      examRevealed={examRevealed}
      setExamRevealed={setExamRevealed}
      examTimeLeft={examTimeLeft}
      examFinished={examFinished}
      submitExam={submitExam}
      gradeExam={gradeExam}
      formatExamTime={formatExamTime}
    />
  }

  return null
}

// ── Active exam sub-component (avoids hooks-in-conditional issue) ─────────────
type SetState<T> = (fn: (prev: T) => T) => void

interface ExamActiveViewProps {
  examQuestions: ExamQuestion[]
  examCurrentQ: number
  setExamCurrentQ: (fn: (q: number) => number) => void
  examAnswers: Record<number, string>
  setExamAnswers: SetState<Record<number, string>>
  examRevealed: Record<number, boolean>
  setExamRevealed: SetState<Record<number, boolean>>
  examTimeLeft: number
  examFinished: boolean
  submitExam: () => void
  gradeExam: (answers: Record<number, string>, selfGrades: Record<number, 'got_it' | 'needs_work'>) => void
  formatExamTime: (s: number) => string
}

function ExamActiveView({
  examQuestions, examCurrentQ, setExamCurrentQ,
  examAnswers, setExamAnswers,
  examRevealed, setExamRevealed,
  examTimeLeft, examFinished,
  submitExam, gradeExam, formatExamTime,
}: ExamActiveViewProps) {
  const [selfGrades, setSelfGrades] = useState<Record<number, 'got_it' | 'needs_work'>>({})

  const currentQ = examQuestions[examCurrentQ]
  const isLast = examCurrentQ === examQuestions.length - 1
  const isTimeLow = examTimeLeft < 5 * 60 && examTimeLeft > 0
  const currentAnswer = examAnswers[examCurrentQ] || ''
  const isRevealed = examRevealed[examCurrentQ]

  if (!currentQ) return null

  return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">
      {/* Timer bar */}
      <div className={cn(
        'flex items-center justify-between px-5 py-3 border-b shrink-0 transition-colors',
        isTimeLow ? 'border-red-500/30 bg-red-500/5' : 'border-white/5'
      )}>
        <div className="flex items-center gap-2">
          <Clock className={cn('w-4 h-4', isTimeLow ? 'text-red-400 animate-pulse' : 'text-slate-500')} />
          <span className={cn('text-sm font-black tabular-nums', isTimeLow ? 'text-red-400' : 'text-slate-300')}>
            {formatExamTime(examTimeLeft)}
          </span>
          {isTimeLow && (
            <span className="text-[10px] text-red-400 font-black uppercase tracking-widest animate-pulse">Low time!</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-medium">
            {examCurrentQ + 1} / {examQuestions.length}
          </span>
          <button
            onClick={() => {
              submitExam()
              gradeExam(examAnswers, selfGrades)
            }}
            className="px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-black hover:bg-orange-500/15 transition-all">
            Submit
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-white/5 shrink-0">
        <div
          className="h-full bg-orange-500 transition-all duration-300"
          style={{ width: `${((examCurrentQ + 1) / examQuestions.length) * 100}%` }}
        />
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="max-w-lg mx-auto space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={cn(
                'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest',
                currentQ.type === 'mcq'
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                  : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
              )}>
                {currentQ.type === 'mcq' ? 'Multiple Choice' : 'Written'}
              </span>
              <span className="text-[10px] text-slate-600 font-medium">Q{examCurrentQ + 1}</span>
            </div>
            <p className="text-base font-bold text-white leading-relaxed">{currentQ.question}</p>
            {currentQ.type === 'written' && currentQ.hint && (
              <p className="text-xs text-slate-500 italic">Hint: {currentQ.hint}</p>
            )}
          </div>

          {/* MCQ options */}
          {currentQ.type === 'mcq' && (
            <div className="space-y-2.5">
              {currentQ.options.map((opt, oi) => {
                const isSelected = currentAnswer === opt
                const isCorrectOpt = isRevealed && opt === currentQ.correct_answer
                const isWrongSelected = isRevealed && isSelected && opt !== currentQ.correct_answer
                return (
                  <button key={oi}
                    onClick={() => {
                      if (isRevealed) return
                      setExamAnswers(prev => ({ ...prev, [examCurrentQ]: opt }))
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left text-sm transition-all',
                      isCorrectOpt
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                        : isWrongSelected
                        ? 'border-red-500/40 bg-red-500/10 text-red-200'
                        : isSelected
                        ? 'border-orange-500/40 bg-orange-500/10 text-orange-200'
                        : 'border-white/8 bg-white/3 text-slate-300 hover:border-white/15 hover:bg-white/5'
                    )}>
                    <span className={cn(
                      'w-6 h-6 rounded-full border text-[10px] font-black flex items-center justify-center shrink-0',
                      isCorrectOpt ? 'border-emerald-400 text-emerald-400'
                        : isWrongSelected ? 'border-red-400 text-red-400'
                        : isSelected ? 'border-orange-400 text-orange-400'
                        : 'border-white/20 text-slate-500'
                    )}>
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span className="flex-1 leading-relaxed">{opt}</span>
                    {isCorrectOpt && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {isWrongSelected && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  </button>
                )
              })}
              {isRevealed && currentQ.explanation && (
                <div className="p-3 rounded-xl bg-white/3 border border-white/8">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Explanation</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{currentQ.explanation}</p>
                </div>
              )}
            </div>
          )}

          {/* Written answer */}
          {currentQ.type === 'written' && (
            <div className="space-y-3">
              <textarea
                value={currentAnswer}
                onChange={e => {
                  if (isRevealed) return
                  setExamAnswers(prev => ({ ...prev, [examCurrentQ]: e.target.value }))
                }}
                readOnly={isRevealed}
                placeholder="Write your answer here..."
                rows={5}
                className="w-full bg-[#111] border border-white/8 rounded-2xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-orange-500/40 transition-colors"
              />
              {!isRevealed && (
                <button
                  onClick={() => setExamRevealed(prev => ({ ...prev, [examCurrentQ]: true }))}
                  className="w-full py-3 rounded-2xl bg-white/5 border border-white/8 text-slate-300 font-black text-sm hover:bg-white/8 transition-all">
                  Reveal Model Answer
                </button>
              )}
              {isRevealed && (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-violet-500/8 border border-violet-500/20">
                    <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-2">Model Answer</p>
                    <p className="text-xs text-violet-200 leading-relaxed">{(currentQ as WrittenQuestion).model_answer}</p>
                  </div>
                  {!selfGrades[examCurrentQ] ? (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">How did you do?</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setSelfGrades(prev => ({ ...prev, [examCurrentQ]: 'got_it' }))}
                          className="py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-sm hover:bg-emerald-500/15 transition-all flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4" /> Got it
                        </button>
                        <button
                          onClick={() => setSelfGrades(prev => ({ ...prev, [examCurrentQ]: 'needs_work' }))}
                          className="py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-sm hover:bg-red-500/15 transition-all flex items-center justify-center gap-2">
                          <XCircle className="w-4 h-4" /> Needs work
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={cn(
                      'py-2.5 rounded-xl text-center text-xs font-black uppercase tracking-widest',
                      selfGrades[examCurrentQ] === 'got_it'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-red-500/10 text-red-400'
                    )}>
                      {selfGrades[examCurrentQ] === 'got_it' ? '✓ Marked as got it' : '✗ Marked as needs work'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="px-5 py-4 border-t border-white/5 shrink-0">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => setExamCurrentQ(q => Math.max(0, q - 1))}
            disabled={examCurrentQ === 0}
            className="p-3 rounded-2xl bg-white/5 border border-white/8 text-slate-400 hover:bg-white/8 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 flex gap-1.5 justify-center flex-wrap">
            {examQuestions.map((_, qi) => (
              <button key={qi} onClick={() => setExamCurrentQ(() => qi)}
                className={cn(
                  'w-6 h-6 rounded-full text-[10px] font-black transition-all',
                  qi === examCurrentQ
                    ? 'bg-orange-500 text-white'
                    : examAnswers[qi]
                    ? 'bg-white/15 text-slate-300'
                    : 'bg-white/5 text-slate-600 hover:bg-white/10'
                )}>
                {qi + 1}
              </button>
            ))}
          </div>
          {isLast ? (
            <button
              onClick={() => {
                submitExam()
                gradeExam(examAnswers, selfGrades)
              }}
              className="px-4 py-3 rounded-2xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 transition-all shadow-lg shadow-orange-500/20">
              Submit
            </button>
          ) : (
            <button
              onClick={() => setExamCurrentQ(q => Math.min(examQuestions.length - 1, q + 1))}
              className="p-3 rounded-2xl bg-white/5 border border-white/8 text-slate-400 hover:bg-white/8 transition-all">
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
