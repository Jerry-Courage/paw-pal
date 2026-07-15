'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, getAuthToken, API_BASE } from '@/lib/api'
import {
  ArrowLeft, Mic, MicOff, Square, Brain, Zap,
  MessageSquare, CheckCircle2, XCircle, AlertCircle,
  ChevronRight, RotateCcw, Loader2, Volume2,
  Clock, FileText, ChevronLeft, Award, Target,
  Phone, Globe, Sliders, ChevronDown, X
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useStudyTimer } from '@/hooks/useStudyTimer'

// ── Types ─────────────────────────────────────────────────────────────────────
type Technique = 'feynman' | 'active_recall'
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

const TECHNIQUES: { id: Technique; label: string; icon: any; desc: string; color: string; ringColor: string }[] = [
  {
    id: 'feynman',
    label: 'Feynman Mode',
    icon: Brain,
    desc: 'Teach the AI like a student. It asks when confused.',
    color: 'border-violet-500/20 bg-violet-500/[0.03] text-violet-400 hover:border-violet-500/40',
    ringColor: 'focus:ring-violet-500/30 active:scale-[0.99] border-violet-500/50 shadow-[0_0_20px_rgba(139,92,246,0.12)] bg-violet-500/[0.06]',
  },
  {
    id: 'active_recall',
    label: 'Active Recall',
    icon: Zap,
    desc: 'AI tests you with rapid-fire questions from memory.',
    color: 'border-orange-500/20 bg-orange-500/[0.03] text-orange-400 hover:border-orange-500/40',
    ringColor: 'focus:ring-orange-500/30 active:scale-[0.99] border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.12)] bg-orange-500/[0.06]',
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
  buffer.copyToChannel(float32 as any, 0)
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
  const [isMicAvailable, setIsMicAvailable] = useState(true)
  const [isSendingText, setIsSendingText] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [report, setReport] = useState<SessionReport | null>(null)
  const [sessionDuration, setSessionDuration] = useState(0)
  const [showChat, setShowChat] = useState(false)

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
  const micAudioCtxRef = useRef<AudioContext | null>(null)
  const playAudioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isMicMutedRef = useRef(false)
  const nextPlayTimeRef = useRef(0)  // scheduled end time of last chunk
  const timerRef = useRef<any>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const isSpeakingTimeoutRef = useRef<any>(null)
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  const stopAudioPlayout = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop()
      } catch (e) {}
    })
    activeSourcesRef.current = []
    if (playAudioCtxRef.current) {
      nextPlayTimeRef.current = playAudioCtxRef.current.currentTime
    }
    setIsAiSpeaking(false)
    clearTimeout(isSpeakingTimeoutRef.current)
  }, [])

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
    const ctx = playAudioCtxRef.current || new AudioContext({ sampleRate: 24000 })
    playAudioCtxRef.current = ctx

    const buffer = ctx.createBuffer(1, pcm.length, 24000)
    buffer.copyToChannel(pcm as any, 0)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    // Schedule chunk to start exactly when the previous one ends — no gaps
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current)
    source.start(startAt)
    nextPlayTimeRef.current = startAt + buffer.duration

    // Track active source nodes
    activeSourcesRef.current.push(source)
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(src => src !== source)
    }

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
    setIsMicAvailable(true)

    // Try to acquire mic, but do not block the session if it fails.
    // The text fallback should still work even when mic permission is unavailable.
    let micStream: MediaStream | null = null
    let micPermissionOk = true
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
      setIsMicAvailable(true)
    } catch (e) {
      streamRef.current = null
      micPermissionOk = false
      setIsMicAvailable(false)
      toast.error('Mic unavailable — text-only mode is now active.', { duration: 4000 })
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
          if (streamRef.current && micPermissionOk) {
            activateMicProcessor(streamRef.current)
          }
          toast(
            isMicAvailable
              ? '🎤 Session started! Press Ctrl+M to toggle mic, or type below if mic isn\'t working.'
              : '💬 Text-only mode is ready. Type your question and press Enter to chat with the AI.',
            {
              duration: 5000,
              icon: '💡',
            }
          )
        } else if (msg.type === 'audio') {
          const pcm = base64ToPcmFloat(msg.data)
          playAudioChunk(pcm)
        } else if (msg.type === 'interrupted') {
          stopAudioPlayout()
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
        } else if (msg.type === 'status') {
          toast.info(msg.message, { duration: 4000 })
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
      const ctx = new AudioContext({ sampleRate: 16000 })
      micAudioCtxRef.current = ctx

      // Resume AudioContext if it gets suspended by browser autoplay policy
      // This is the most common reason mic stops after a few seconds
      const resumeCtx = () => {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {})
        }
      }
      // Poll every 500ms — lightweight, stops when processor is gone
      const resumeInterval = setInterval(() => {
        if (!processorRef.current) { clearInterval(resumeInterval); return }
        resumeCtx()
      }, 500)

      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(2048, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        if (isMicMutedRef.current) return
        if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return }
        const float32 = e.inputBuffer.getChannelData(0).slice()
        // Inline int16 conversion — avoids async resampling which can stall
        const pcm16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
        }
        const bytes = new Uint8Array(pcm16.buffer)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        const b64 = btoa(binary)
        wsRef.current.send(JSON.stringify({ type: 'audio', data: b64 }))
      }

      source.connect(processor)
      // Connect to a silent gain node — required for onaudioprocess to fire
      const silentGain = ctx.createGain()
      silentGain.gain.value = 0
      processor.connect(silentGain)
      silentGain.connect(ctx.destination)

      isMicMutedRef.current = false
      setIsRecording(true)
    } catch (e) {
      toast.error('Failed to start mic processing. Please try again.')
    }
  }

  const stopMic = () => {
    processorRef.current?.disconnect()
    processorRef.current = null
    if (micAudioCtxRef.current) {
      void micAudioCtxRef.current.close().catch(() => {})
      micAudioCtxRef.current = null
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    isMicMutedRef.current = true
    setIsRecording(false)
  }

  // ── Clean up on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      stopMic()
      stopAudioPlayout()
    }
  }, [stopAudioPlayout])

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

  const toggleMic = useCallback(() => {
    if (!streamRef.current || !processorRef.current || !micAudioCtxRef.current) {
      toast.error('Microphone not initialized. Connect mic and try again.')
      return
    }

    if (!isMicMutedRef.current) {
      isMicMutedRef.current = true
      setIsRecording(false)
      toast('🔇 Mic muted', { duration: 1000 })
    } else {
      isMicMutedRef.current = false
      setIsRecording(true)
      toast('🎤 Mic on', { duration: 1000 })
    }
  }, [])

  // ── Ctrl-to-talk: hold Ctrl key to mute/unmute mic ────────────────────────
  useEffect(() => {
    if (phase !== 'session') return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+M (or Cmd+M on Mac) = toggle mic — safer than Ctrl+Space which
      // conflicts with Windows IME and browser shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault()
        toggleMic()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, toggleMic])

  // ── Send text message to AI via WebSocket ─────────────────────────────────
  const sendTextMessage = async () => {
    const text = textInput.trim()
    if (!text) { toast.error('Type something first.'); return }
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Not connected. Please start a session first.')
      return
    }

    setIsSendingText(true)
    try {
      setTranscript(prev => [...prev, { role: 'user', text, ts: Date.now() }])
      wsRef.current.send(JSON.stringify({ type: 'text_message', text }))
      setTextInput('')
    } catch (error) {
      toast.error('Could not send your message. Please try again.')
    } finally {
      setIsSendingText(false)
    }
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

  const setupSteps = {
    feynman: [
      'Explain the idea as if the AI knows nothing',
      'Spot the gaps in your explanation and refine them',
      'End the session for feedback on clarity and depth',
      'Finish with a timed exam that checks real understanding',
    ],
    active_recall: [
      'Answer each prompt from memory before checking yourself',
      'Use the AI to test what you can actually recall',
      'End the session for feedback on recall strength and weak spots',
      'Finish with a timed exam that checks durable understanding',
    ],
  } as const

  const currentSetupSteps = setupSteps[technique]

  // ── RENDER ─────────────────────────────────────────────────────────────────

  // Setup phase
  if (phase === 'setup') return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#080809] flex flex-col overflow-hidden text-white font-sans select-none">
      
      {/* Ambient background glows */}
      <div className="absolute top-[10%] left-[-20%] w-[300px] h-[300px] bg-violet-600/[0.06] blur-[120px] rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-[20%] right-[-20%] w-[300px] h-[300px] bg-orange-600/[0.06] blur-[120px] rounded-full pointer-events-none z-0" />

      {/* Header bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] bg-[#0c0c0e]/80 backdrop-blur-md shrink-0 z-10">
        <Link href={`/library/${resourceId}`} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all active:scale-95">
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </Link>
        <div className="min-w-0">
          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Live Voice Session</p>
          <h1 className="text-xs font-bold text-slate-300 truncate">{resource?.title || '...'}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 z-10 scrollbar-hide">
        <div className="max-w-md mx-auto space-y-5 pb-24">

          {/* Intro Card */}
          <div className="text-center space-y-2 py-2">
            <div className="w-14 h-14 bg-gradient-to-br from-orange-500/10 to-violet-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Brain className="w-7 h-7 text-orange-400" />
            </div>
            <h2 className="text-lg font-black text-white tracking-tight">Active Voice Practice</h2>
            <p className="text-slate-500 text-xs max-w-xs mx-auto leading-relaxed">
              {technique === 'feynman' && 'Teach the concept in your own words, and get questioned where your explanation falls short.'}
              {technique === 'active_recall' && 'Test your retention with rapid-fire questions from memory. Answer out loud.'}
            </p>
          </div>

          {/* Technique grid (Side by side) */}
          <div className="space-y-2">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Choose Technique</p>
            <div className="grid grid-cols-2 gap-3">
              {TECHNIQUES.map(t => {
                const Icon = t.icon
                const isSelected = technique === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTechnique(t.id)}
                    className={cn(
                      'flex flex-col items-center text-center p-3.5 rounded-2.5xl border transition-all active:scale-[0.97]',
                      isSelected ? t.ringColor : 'border-white/[0.04] bg-white/[0.01] hover:border-white/[0.08]'
                    )}
                  >
                    <div className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mb-2',
                      isSelected ? 'bg-orange-500/10 text-orange-400' : 'bg-white/5 text-slate-500'
                    )}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <span className={cn('text-xs font-black', isSelected ? 'text-white' : 'text-slate-400')}>{t.label}</span>
                    <span className="text-[10px] text-slate-500 mt-1 leading-snug font-medium line-clamp-2">{t.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Voice Picker (Horizontal Scroll) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">AI voice companion</p>
              <span className="text-[9px] text-slate-600">Swipe to view</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              <button
                onClick={() => setVoice('')}
                className={cn(
                  'py-2 px-3.5 rounded-full border text-[11px] font-black shrink-0 transition-all active:scale-95',
                  voice === '' ? 'border-orange-500 bg-orange-500/15 text-orange-400' : 'border-white/[0.04] bg-white/[0.01] text-slate-500 hover:border-white/[0.08]'
                )}
              >
                Auto Voice ✨
              </button>
              {GEMINI_VOICES.map(v => (
                <button
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className={cn(
                    'py-2 px-3.5 rounded-full border text-[11px] font-black shrink-0 transition-all active:scale-95 flex items-center gap-1',
                    voice === v.id ? 'border-orange-500 bg-orange-500/15 text-orange-400' : 'border-white/[0.04] bg-white/[0.01] text-slate-500 hover:border-white/[0.08]'
                  )}
                >
                  <span>{v.label}</span>
                  <span className="text-[9px] font-medium opacity-60">({v.desc.slice(-2)})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Dotted Timeline Info */}
          <div className="relative border border-white/[0.04] bg-white/[0.01] backdrop-blur-md rounded-2xl p-4.5 space-y-3.5 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/[0.02] blur-2xl rounded-full" />
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">How it works</p>
            <div className="relative pl-5 space-y-3.5">
              {/* Vertical timeline line */}
              <div className="absolute left-[8px] top-1.5 bottom-1.5 w-[1px] bg-gradient-to-b from-orange-500/40 via-white/10 to-transparent" />
              {currentSetupSteps.map((step, i) => (
                <div key={i} className="relative flex items-start gap-2.5">
                  <span className="absolute -left-[21px] w-4.5 h-4.5 rounded-full bg-[#080809] border border-orange-500/30 text-orange-400 text-[9px] font-black flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(249,115,22,0.05)]">
                    {i + 1}
                  </span>
                  <span className="text-xs text-slate-400 leading-relaxed font-medium">{step}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Sticky Bottom Start Button */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#080809] via-[#080809]/95 to-transparent shrink-0 z-20">
        <div className="max-w-md mx-auto">
          <button
            onClick={startSession}
            disabled={isConnecting}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-600 text-white font-black text-xs uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-orange-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isConnecting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Connecting to Gemini...</>
            ) : (
              <><Mic className="w-4 h-4" /> Start Live Conversation</>
            )}
          </button>
        </div>
      </div>

    </div>
  )

  // Session phase
  if (phase === 'session') return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#07070a] flex flex-col md:flex-row overflow-hidden text-white font-sans select-none">
      
      {/* Wave keyframe animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes waveGrow {
          0% { transform: scaleY(0.2); }
          50% { transform: scaleY(1.4); }
          100% { transform: scaleY(0.2); }
        }
        .wave-bar-anim {
          animation: waveGrow 0.8s ease-in-out infinite;
          transform-origin: bottom;
        }
      `}} />

      {/* LEFT AREA: Main call dashboard screen */}
      <div className={cn(
        "flex-1 flex flex-col overflow-hidden relative",
        showChat ? "md:border-r md:border-white/5" : ""
      )}>
        {/* Top Navbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0 z-20">
          <button 
            onClick={endSession} 
            disabled={isEndingSession}
            className="p-2 rounded-full hover:bg-white/5 text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <div className="flex items-center gap-2">
            {/* Simple audio wave icon */}
            <div className="flex gap-0.5 items-center">
              <div className="w-[2px] h-3 bg-indigo-400 rounded-full animate-pulse" />
              <div className="w-[2px] h-5 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.1s]" />
              <div className="w-[2px] h-4 bg-indigo-400 rounded-full animate-pulse [animation-delay:0.2s]" />
            </div>
            <span className="text-sm font-bold tracking-tight text-slate-300">Live Conversation</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowChat(prev => !prev)}
              className={cn(
                "p-2 rounded-xl transition-all relative border cursor-pointer",
                showChat ? "bg-indigo-600/20 text-indigo-400 border-indigo-500/20" : "bg-transparent border-transparent hover:bg-white/5 text-slate-400 hover:text-white"
              )}
              title="Show Text Chat"
            >
              <MessageSquare className="w-5 h-5" />
              {transcript.length > 0 && !showChat && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              )}
            </button>
            <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-400 uppercase">
              {resource?.subject?.slice(0, 2) || 'ED'}
            </div>
          </div>
        </div>

        {/* Dynamic ambient background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className={cn(
            "absolute -top-40 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-[120px] opacity-20 transition-all duration-1000",
            isAiSpeaking ? "bg-indigo-600" 
            : isRecording ? "bg-cyan-500" 
            : "bg-indigo-900/50"
          )} />
          <div className="absolute bottom-[-150px] left-[-150px] w-[350px] h-[350px] rounded-full blur-[90px] bg-purple-900/10 opacity-30" />
          <div className="absolute top-[20%] right-[-100px] w-[300px] h-[300px] rounded-full blur-[95px] bg-cyan-900/10 opacity-20" />
        </div>

        {/* Center content: Tutor name and glowing ring */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
          
          {/* Tutor Info Header */}
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all cursor-pointer">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-slate-200">
                {resource?.title || 'Biology'} Tutor
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </div>
            
            {/* AI Status / Speaking waves */}
            <div className="flex items-center gap-2 mt-3 h-5">
              {isAiSpeaking ? (
                <>
                  {/* Micro mini speaking bar wave */}
                  <div className="flex items-end gap-[2px] h-3 w-6 pb-0.5">
                    {[1, 2, 3, 4].map(idx => (
                      <div 
                        key={idx} 
                        className="w-[2px] bg-cyan-400 rounded-full wave-bar-anim"
                        style={{ height: '100%', animationDelay: `${idx * 0.1}s`, animationDuration: `${0.5 + idx * 0.1}s` }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400 font-medium">AI Tutor is speaking...</span>
                </>
              ) : isRecording ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                  <span className="text-xs text-slate-400 font-medium">Listening...</span>
                </>
              ) : (
                <span className="text-xs text-slate-500 font-medium">Click mic or type to chat</span>
              )}
            </div>
          </div>

          {/* Glowing Concentric Rings Container */}
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-full flex items-center justify-center">
            
            {/* Outer animated thin circle */}
            <div className="absolute inset-0 rounded-full border border-cyan-500/10 animate-[spin_30s_linear_infinite] p-2">
              <div className="w-full h-full rounded-full border border-dashed border-indigo-500/10" />
            </div>
            
            {/* Main Gradient Ring with drop shadow glow */}
            <div className="absolute inset-4 rounded-full bg-gradient-to-tr from-cyan-400 via-blue-600 to-purple-600 p-[3px] shadow-[0_0_60px_rgba(6,182,212,0.15)]">
              
              {/* Inner dark circular panel */}
              <div className="w-full h-full rounded-full bg-[#0a0a0f] flex flex-col items-center justify-center relative overflow-hidden">
                
                {/* Embedded soundwave in center of circle */}
                <div className="flex items-end gap-1.5 h-16 justify-center w-full px-6">
                  {[...Array(15)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-[3px] rounded-full transition-all duration-300",
                        isAiSpeaking 
                          ? "bg-gradient-to-t from-cyan-400 to-indigo-500 wave-bar-anim" 
                          : isRecording 
                          ? "bg-cyan-500/50" 
                          : "bg-slate-800"
                      )}
                      style={{
                        height: isAiSpeaking 
                          ? `${12 + Math.sin(i * 0.4) * 20 + 16}px` 
                          : isRecording 
                          ? `${6 + Math.sin(i) * 6}px` 
                          : '4px',
                        animationDelay: `${i * 0.05}s`,
                        animationDuration: `${0.4 + (i % 4) * 0.12}s`
                      }}
                    />
                  ))}
                </div>

                {/* Microphone Toggle Button inside ring */}
                <button
                  onClick={toggleMic}
                  className={cn(
                    "absolute bottom-6 w-12 h-12 rounded-full flex items-center justify-center border transition-all duration-300 shadow-lg cursor-pointer",
                    isRecording
                      ? "bg-slate-900/90 border-cyan-500/30 text-cyan-400 hover:bg-slate-800 hover:scale-105"
                      : "bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20 hover:scale-105"
                  )}
                  title={isRecording ? "Mute Microphone" : "Unmute Microphone"}
                >
                  {isRecording ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 animate-pulse" />}
                </button>

              </div>
            </div>
          </div>

          {/* Tap to Interrupt Button */}
          {isAiSpeaking && (
            <button
              onClick={stopAudioPlayout}
              className="mt-8 flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-all font-semibold select-none cursor-pointer"
            >
              <div className="w-2.5 h-2.5 bg-slate-400 rounded-sm" />
              Tap to Interrupt
            </button>
          )}
        </div>

        {/* Bottom dashboard statistics + End Conversation button */}
        <div className="px-6 pb-8 pt-4 border-t border-white/[0.03] bg-[#07070a]/90 backdrop-blur-md z-10 shrink-0">
          <div className="max-w-md mx-auto flex flex-col gap-6">
            
            {/* Stat Cards Row */}
            <div className="grid grid-cols-2 gap-4">
              
              {/* Conversation Time Card */}
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <span className="sm:hidden">Time</span>
                    <span className="hidden sm:inline">Conversation Time</span>
                  </span>
                  <span className="block text-sm sm:text-base font-black text-white mt-0.5 tracking-tight">
                    {formatTime(sessionDuration)}
                  </span>
                </div>
              </div>

              {/* Voice Mode Card */}
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Voice Mode</span>
                  <span className="block text-sm sm:text-base font-black text-white mt-0.5 tracking-tight">
                    {TECHNIQUES.find(t => t.id === technique)?.label?.split(' ')[0] || 'Natural'}
                  </span>
                </div>
              </div>

            </div>

            {/* Red Phone End Conversation Button */}
            <div className="flex flex-col items-center justify-center gap-2">
              <button 
                onClick={endSession} 
                disabled={isEndingSession}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center text-white transition-all shadow-[0_0_30px_rgba(239,68,68,0.3)] hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              >
                {isEndingSession ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Phone className="w-6 h-6 rotate-[135deg]" />
                )}
              </button>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                End Conversation
              </span>
            </div>

          </div>
        </div>

      </div>

      {/* RIGHT SIDEBAR PANEL: Collapsible Transcript & Text Input */}
      {showChat && (
        <div className={cn(
          "w-full md:w-80 lg:w-96 flex flex-col bg-[#0b0b0e] shrink-0 border-l border-white/5 transition-all duration-300 z-30",
          "absolute inset-0 md:relative md:inset-auto" // full screen overlay on mobile
        )}>
          {/* Sidebar Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 font-bold">Conversation Chat</span>
            <button 
              onClick={() => setShowChat(false)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Transcript Feed */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
            {transcript.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-600 gap-2">
                <MessageSquare className="w-8 h-8 opacity-20" />
                <p className="text-xs">No text messages yet. Start speaking or type your first message below.</p>
              </div>
            ) : (
              transcript.map((entry, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "flex flex-col max-w-[85%] animate-in fade-in-30 slide-in-from-bottom-2",
                    entry.role === 'ai' ? "self-start" : "self-end items-end ml-auto"
                  )}
                >
                  <span className={cn(
                    "text-[8px] font-black uppercase tracking-widest mb-0.5",
                    entry.role === 'ai' ? "text-indigo-400" : "text-cyan-400"
                  )}>
                    {entry.role === 'ai' ? 'AI Tutor' : 'You'}
                  </span>
                  <div className={cn(
                    "text-xs leading-relaxed px-3 py-2.5 rounded-2xl",
                    entry.role === 'ai' 
                      ? "bg-white/[0.03] text-slate-100 rounded-tl-none border border-white/[0.05]" 
                      : "bg-indigo-600 text-white rounded-tr-none"
                  )}>
                    {entry.text}
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Form input */}
          <div className="p-4 border-t border-white/5 bg-[#09090c]/90">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                sendTextMessage()
              }}
              className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 focus-within:border-indigo-500/40 transition-colors"
            >
              <input
                type="text"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendTextMessage() } }}
                placeholder="Type a message..."
                className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-600 focus:outline-none"
                disabled={isSendingText}
              />
              <button
                type="submit"
                disabled={!textInput.trim() || isSendingText}
                className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
              >
                {isSendingText ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </form>
            <div className="mt-2 text-center text-[8px] text-slate-600">
              Ctrl+M to toggle microphone.
            </div>
          </div>
        </div>
      )}

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
