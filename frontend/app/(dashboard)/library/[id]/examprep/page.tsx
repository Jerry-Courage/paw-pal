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
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ─────────────────────────────────────────────────────────────────────
type Technique = 'feynman' | 'active_recall'
type Phase = 'setup' | 'session' | 'report'
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
  const [voice, setVoice] = useState<string>('Leda') // default to Leda (calm & focused)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [isMicAvailable, setIsMicAvailable] = useState(true)
  const [isSendingText, setIsSendingText] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [report, setReport] = useState<SessionReport | null>(null)
  const [sessionDuration, setSessionDuration] = useState(0)
  const [showChat, setShowChat] = useState(false)

  // Animated AI subtitles
  const [currentAiText, setCurrentAiText] = useState('')
  const [displayedWords, setDisplayedWords] = useState<string[]>([])
  const prevWordCountRef = useRef(0)
  const wordIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const MAX_VISIBLE_WORDS = 30

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
  const isAiSpeakingRef = useRef(false)

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
    isAiSpeakingRef.current = false
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

  // Incremental word-by-word animation for AI subtitles
  useEffect(() => {
    if (!currentAiText) {
      setDisplayedWords([])
      prevWordCountRef.current = 0
      if (wordIntervalRef.current) clearInterval(wordIntervalRef.current)
      return
    }
    const words = currentAiText.split(/\s+/).filter(Boolean)
    const prevCount = prevWordCountRef.current
    if (words.length < prevCount) prevWordCountRef.current = 0

    const newWords = words.slice(prevWordCountRef.current)
    if (newWords.length === 0) return

    setDisplayedWords(prev => {
      const safePrev = prev.length <= prevWordCountRef.current ? prev : prev.slice(0, prevWordCountRef.current)
      return [...safePrev, newWords[0]]
    })
    prevWordCountRef.current += 1

    if (wordIntervalRef.current) clearInterval(wordIntervalRef.current)
    let idx = 1
    wordIntervalRef.current = setInterval(() => {
      if (idx >= newWords.length) {
        clearInterval(wordIntervalRef.current!)
        wordIntervalRef.current = null
        return
      }
      setDisplayedWords(prev => {
        const safePrev = prev.length <= prevWordCountRef.current ? prev : prev.slice(0, prevWordCountRef.current)
        return [...safePrev, newWords[idx]]
      })
      prevWordCountRef.current += 1
      idx++
    }, 80)

    return () => { if (wordIntervalRef.current) clearInterval(wordIntervalRef.current) }
  }, [currentAiText])

  // Clear subtitle when AI stops speaking
  useEffect(() => {
    if (!isAiSpeaking && currentAiText) {
      const timeout = setTimeout(() => {
        setCurrentAiText('')
        setDisplayedWords([])
        prevWordCountRef.current = 0
      }, 3000)
      return () => clearTimeout(timeout)
    }
  }, [isAiSpeaking, currentAiText])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ── Play AI audio — scheduled for gapless playback ───────────────────────
  const playAudioChunk = useCallback((pcm: Float32Array) => {
    const ctx = playAudioCtxRef.current || new AudioContext()
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
    isAiSpeakingRef.current = true
    // Clear speaking indicator 500ms after last chunk ends
    clearTimeout(isSpeakingTimeoutRef.current)
    isSpeakingTimeoutRef.current = setTimeout(() => {
      setIsAiSpeaking(false)
      isAiSpeakingRef.current = false
      // Reset so onaudioprocess isSpeaking check doesn't get stuck
      // when AudioContext suspends (iOS Safari freezes currentTime when idle)
      nextPlayTimeRef.current = 0
    }, (nextPlayTimeRef.current - ctx.currentTime) * 1000 + 500)
  }, [])

  // ── Connect WebSocket ──────────────────────────────────────────────────────
  const startSession = async (overrideTechnique?: Technique) => {
    if (!resource) return
    const activeTechnique = overrideTechnique ?? technique
    if (overrideTechnique) setTechnique(overrideTechnique)
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
          technique: activeTechnique,
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
          setCurrentAiText('')
          setDisplayedWords([])
          prevWordCountRef.current = 0
          if (wordIntervalRef.current) clearInterval(wordIntervalRef.current)
        } else if (msg.type === 'transcript_user' || msg.type === 'transcript_ai') {
          const role = msg.type === 'transcript_user' ? 'user' : 'ai'

          // Update animated subtitle for AI speech
          if (role === 'ai') {
            setCurrentAiText(prev => prev + msg.text)
          } else {
            setCurrentAiText('')
            setDisplayedWords([])
            prevWordCountRef.current = 0
          }

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
        
        // Block mic while AI is speaking (use ref flag — time comparison
        // breaks on iOS because AudioContext.currentTime freezes when suspended)
        if (isAiSpeakingRef.current) return
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
    setCurrentAiText('')
    setDisplayedWords([])
    prevWordCountRef.current = 0
    if (wordIntervalRef.current) clearInterval(wordIntervalRef.current)
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
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden select-none">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0 tool-header-safe">
        <Link href={`/library/${resourceId}`}
          className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest">Learning Techniques</p>
        <div className="w-9" />
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-8 scrollbar-hide">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* Hero heading */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              <span className="material-symbols-outlined text-primary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            </div>
            <h2 className="text-[28px] md:text-[30px] font-bold text-on-surface tracking-tight">
              Choose Your Study Power!
            </h2>
            <p className="text-on-surface-variant text-[14px] max-w-md mx-auto leading-relaxed">
              Pick a technique to help your brain store information like a supercomputer before we start our voice session.
            </p>
          </div>

          {/* Two technique cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Feynman */}
            <button
              onClick={() => startSession('feynman')}
              disabled={isConnecting}
              className={cn(
                'relative flex flex-col items-center text-center p-6 rounded-[1.5rem] border-2 transition-all active:scale-[0.98] disabled:opacity-50',
                technique === 'feynman'
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant/40 bg-surface-container-low hover:border-primary/40 hover:bg-surface-container'
              )}
              onMouseEnter={() => setTechnique('feynman')}
            >
              {/* Avatar circle */}
              <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>record_voice_over</span>
              </div>
              {/* Title */}
              <h3 className="text-[17px] font-bold text-primary mb-2">The Feynman Method</h3>
              {/* Badge */}
              <span className="px-3 py-1 rounded-full bg-surface-container-high border border-outline-variant/40 text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-4">
                Teach to Learn
              </span>
              {/* Description */}
              <p className="text-[13px] text-on-surface-variant leading-relaxed mb-6">
                Try explaining the topic in very simple words, like you&apos;re teaching a younger sibling!
              </p>
              {/* CTA */}
              <div className="w-full py-3.5 rounded-[1rem] bg-primary-container text-on-primary-container font-bold text-[14px] shadow-[0_4px_0_0_#763300] flex items-center justify-center gap-2">
                {isConnecting && technique === 'feynman'
                  ? <><span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span> Connecting…</>
                  : <><span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span> Choose This</>
                }
              </div>
            </button>

            {/* Active Recall */}
            <button
              onClick={() => startSession('active_recall')}
              disabled={isConnecting}
              className={cn(
                'relative flex flex-col items-center text-center p-6 rounded-[1.5rem] border-2 transition-all active:scale-[0.98] disabled:opacity-50',
                technique === 'active_recall'
                  ? 'border-secondary bg-secondary/5'
                  : 'border-outline-variant/40 bg-surface-container-low hover:border-secondary/40 hover:bg-surface-container'
              )}
              onMouseEnter={() => setTechnique('active_recall')}
            >
              {/* Avatar circle */}
              <div className="w-20 h-20 rounded-full bg-secondary/10 border-2 border-secondary/30 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-secondary text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              </div>
              {/* Title */}
              <h3 className="text-[17px] font-bold text-secondary mb-2">Active Recall</h3>
              {/* Badge */}
              <span className="px-3 py-1 rounded-full bg-surface-container-high border border-outline-variant/40 text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-4">
                Test Knowledge
              </span>
              {/* Description */}
              <p className="text-[13px] text-on-surface-variant leading-relaxed mb-6">
                Close your eyes and try to remember the main facts without looking at your notes.
              </p>
              {/* CTA */}
              <div className="w-full py-3.5 rounded-[1rem] bg-secondary-container text-on-secondary-container font-bold text-[14px] flex items-center justify-center gap-2">
                {isConnecting && technique === 'active_recall'
                  ? <><span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span> Connecting…</>
                  : <><span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span> Choose This</>
                }
              </div>
            </button>

          </div>

          {/* Voice picker */}
          <div className="space-y-3">
            <p className="text-[11px] font-black text-on-surface-variant uppercase tracking-widest text-center">
              AI Voice Companion
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => setVoice('')}
                className={cn('py-1.5 px-4 rounded-full border text-[12px] font-bold transition-all',
                  voice === '' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-on-surface-variant hover:border-primary/30')}>
                Auto ✨
              </button>
              {GEMINI_VOICES.map(v => (
                <button key={v.id} onClick={() => setVoice(v.id)}
                  className={cn('py-1.5 px-4 rounded-full border text-[12px] font-bold transition-all',
                    voice === v.id ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-on-surface-variant hover:border-primary/30')}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* What's This? info strip */}
          <div className="flex items-start gap-3 p-4 rounded-[1.25rem] border border-primary/20 bg-primary/5">
            <div className="w-7 h-7 rounded-full border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-primary text-[13px] font-black">?</span>
            </div>
            <div>
              <p className="text-[11px] font-black text-primary uppercase tracking-widest mb-1">What&apos;s This?</p>
              <p className="text-[13px] text-on-surface-variant leading-relaxed">
                Both methods are proven to make memories &quot;stick&quot; in your brain much longer than just reading. FlowState will guide you through either choice step-by-step!
              </p>
            </div>
          </div>

          <div className="h-4" />
        </div>
      </div>
    </div>
  )

  // Session phase
  if (phase === 'session') return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden select-none">
      <style dangerouslySetInnerHTML={{__html:`
        @keyframes waveGrow{0%,100%{transform:scaleY(0.3)}50%{transform:scaleY(1.4)}}
        .wave-bar{animation:waveGrow 0.8s ease-in-out infinite;transform-origin:bottom;}
      `}} />

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0 tool-header-safe">
        <button onClick={endSession} disabled={isEndingSession}
          className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 items-end h-4">
            {[3,5,4,6,3].map((h,i) => (
              <div key={i} className={cn('w-[2px] rounded-full bg-primary',isAiSpeaking?'wave-bar':'opacity-30')}
                style={{height:h*3,animationDelay:`${i*0.1}s`}} />
            ))}
          </div>
          <span className="text-[13px] font-bold text-on-surface">
            {TECHNIQUES.find(t=>t.id===technique)?.label||'Live Session'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowChat(p=>!p)}
            className={cn('p-2 rounded-[1rem] transition-all relative',
              showChat?'bg-secondary/10 text-secondary':'text-on-surface-variant hover:bg-surface-container-high')}>
            <span className="material-symbols-outlined text-[20px]">chat</span>
            {transcript.length>0&&!showChat&&(
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full animate-pulse"/>
            )}
          </button>
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-black text-primary uppercase">
            {resource?.subject?.slice(0,2)||'AI'}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* ── Left: Voice ── */}
        <div className={cn('flex-1 flex flex-col items-center justify-between px-6 py-6 overflow-hidden',
          showChat?'md:border-r md:border-outline-variant/20':'')}>

          {/* Status */}
          <div className="text-center space-y-1.5">
            <p className="text-[13px] font-bold text-on-surface-variant truncate max-w-xs">{resource?.title||'…'}</p>
            <div className="flex items-center justify-center gap-2 h-5">
              {isAiSpeaking?(
                <><div className="flex items-end gap-[2px] h-4">
                  {[1,2,3,4].map(i=>(
                    <div key={i} className="w-[2px] bg-primary rounded-full wave-bar"
                      style={{height:'100%',animationDelay:`${i*0.1}s`,animationDuration:`${0.5+i*0.1}s`}}/>
                  ))}
                </div><span className="text-[12px] text-primary font-bold">AI is speaking…</span></>
              ):isRecording?(
                <><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
                <span className="text-[12px] text-on-surface-variant font-medium">Listening…</span></>
              ):(
                <span className="text-[12px] text-on-surface-variant/50">Tap mic to speak</span>
              )}
            </div>
          </div>

          {/* Orb */}
          <div className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-primary/10 animate-[spin_30s_linear_infinite]">
              <div className="w-full h-full rounded-full border border-dashed border-primary/10"/>
            </div>
            <div className={cn('absolute inset-4 rounded-full p-[3px] transition-all duration-700',
              isAiSpeaking?'bg-gradient-to-tr from-primary via-primary-container to-tertiary shadow-[0_0_50px_rgba(255,182,141,0.25)]'
              :isRecording?'bg-gradient-to-tr from-green-400 via-primary-fixed to-primary-container shadow-[0_0_35px_rgba(255,182,141,0.12)]'
              :'bg-gradient-to-tr from-surface-container-high via-outline-variant to-surface-container')}>
              <div className="w-full h-full rounded-full bg-surface-container-low flex flex-col items-center justify-center relative overflow-hidden">
                <div className="flex items-end gap-1 h-14 justify-center w-full px-6">
                  {[...Array(13)].map((_,i)=>(
                    <div key={i} className={cn('w-[3px] rounded-full transition-all duration-300',
                      isAiSpeaking?'bg-primary wave-bar':isRecording?'bg-primary/40':'bg-surface-container-highest')}
                      style={{height:isAiSpeaking?`${10+Math.sin(i*0.5)*16+12}px`:isRecording?`${5+Math.sin(i)*4}px`:'4px',
                        animationDelay:`${i*0.06}s`,animationDuration:`${0.45+(i%4)*0.1}s`}}/>
                  ))}
                </div>
                <button onClick={toggleMic}
                  className={cn('absolute bottom-5 w-11 h-11 rounded-full flex items-center justify-center border transition-all hover:scale-105',
                    isRecording?'bg-surface-container border-primary/30 text-primary'
                    :'bg-error-container/30 border-error/30 text-error')}>
                  <span className="material-symbols-outlined text-[20px]" style={{fontVariationSettings:"'FILL' 1"}}>
                    {isRecording?'mic':'mic_off'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Interrupt */}
          {isAiSpeaking&&(
            <button onClick={stopAudioPlayout}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[1rem] bg-surface-container border border-outline-variant/40 text-on-surface-variant text-[13px] font-bold hover:bg-surface-container-high transition-all">
              <span className="material-symbols-outlined text-[16px]">stop</span>Tap to Interrupt
            </button>
          )}

          {/* Animated AI Subtitles */}
          <AnimatePresence>
            {displayedWords.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="w-full max-w-md mt-4"
              >
                <div className={cn(
                  "relative px-5 py-3.5 rounded-[1.25rem] border transition-all duration-500",
                  isAiSpeaking
                    ? "bg-primary/5 border-primary/20 shadow-[0_0_24px_rgba(255,182,141,0.08)]"
                    : "bg-surface-container-low border-outline-variant/20"
                )}>
                  {isAiSpeaking && (
                    <motion.div
                      className="absolute inset-0 rounded-[1.25rem] border border-primary/15"
                      animate={{ opacity: [0.3, 0.5, 0.3] }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                    />
                  )}
                  <div className="relative z-10 text-center">
                    {(() => {
                      const total = displayedWords.length
                      const visible = total > MAX_VISIBLE_WORDS
                        ? displayedWords.slice(total - MAX_VISIBLE_WORDS)
                        : displayedWords
                      const offset = total > MAX_VISIBLE_WORDS ? total - MAX_VISIBLE_WORDS : 0
                      return visible.map((word, i) => {
                        const gIdx = offset + i
                        return (
                          <motion.span
                            key={`${gIdx}-${word}`}
                            initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className={cn(
                              "inline-block text-[14px] leading-relaxed font-medium mr-[0.35em]",
                              gIdx === total - 1 && isAiSpeaking
                                ? "text-primary font-bold"
                                : "text-on-surface"
                            )}
                          >
                            {word}
                          </motion.span>
                        )
                      })
                    })()}
                    {isAiSpeaking && (
                      <motion.span
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        className="inline-block w-[2px] h-[1em] bg-primary ml-0.5 align-text-bottom"
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stats */}
          <div className="w-full max-w-sm space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-[1.25rem] p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-[0.75rem] bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[18px]" style={{fontVariationSettings:"'FILL' 1"}}>schedule</span>
                </div>
                <div>
                  <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Time</p>
                  <p className="text-[15px] font-black text-on-surface">{formatTime(sessionDuration)}</p>
                </div>
              </div>
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-[1.25rem] p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-[0.75rem] bg-secondary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-secondary text-[18px]" style={{fontVariationSettings:"'FILL' 1"}}>psychology</span>
                </div>
                <div>
                  <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Mode</p>
                  <p className="text-[13px] font-black text-on-surface">{technique==='feynman'?'Feynman':'Recall'}</p>
                </div>
              </div>
            </div>

            {/* End button */}
            <div className="flex flex-col items-center gap-1.5">
              <button onClick={endSession} disabled={isEndingSession}
                className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center text-on-error-container transition-all hover:brightness-110 hover:scale-105 active:scale-95 disabled:opacity-50 shadow-lg">
                {isEndingSession
                  ?<span className="material-symbols-outlined text-[24px] animate-spin">autorenew</span>
                  :<span className="material-symbols-outlined text-[24px]" style={{fontVariationSettings:"'FILL' 1"}}>call_end</span>}
              </button>
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">End Session</span>
            </div>
          </div>
        </div>

        {/* ── Chat panel ── */}
        {showChat&&(
          <div className="w-full md:w-80 lg:w-96 flex flex-col bg-surface-container-lowest shrink-0 border-t md:border-t-0 border-outline-variant/20 absolute inset-0 md:relative md:inset-auto z-30">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 shrink-0">
              <span className="text-[11px] font-black text-on-surface-variant uppercase tracking-widest">Transcript</span>
              <button onClick={()=>setShowChat(false)}
                className="p-1.5 rounded-[0.75rem] hover:bg-surface-container-high text-on-surface-variant transition-all">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
              {transcript.length===0?(
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 opacity-40">
                  <span className="material-symbols-outlined text-on-surface-variant text-[40px]">chat</span>
                  <p className="text-[12px] text-on-surface-variant">No messages yet. Start speaking!</p>
                </div>
              ):(
                transcript.map((entry,idx)=>(
                  <div key={idx} className={cn('flex flex-col max-w-[85%]',
                    entry.role==='ai'?'self-start':'self-end items-end ml-auto')}>
                    <span className={cn('text-[9px] font-black uppercase tracking-widest mb-1',
                      entry.role==='ai'?'text-primary':'text-secondary')}>
                      {entry.role==='ai'?'AI Tutor':'You'}
                    </span>
                    <div className={cn('text-[13px] leading-relaxed px-3.5 py-2.5 rounded-[1rem]',
                      entry.role==='ai'
                        ?'bg-surface-container border border-outline-variant/30 text-on-surface rounded-tl-none'
                        :'bg-secondary-container text-on-secondary-container rounded-tr-none')}>
                      {entry.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef}/>
            </div>
            <div className="p-4 border-t border-outline-variant/20 bg-surface-container-lowest shrink-0">
              <form onSubmit={e=>{e.preventDefault();void sendTextMessage()}}
                className="flex items-center gap-2 bg-surface-container border border-outline-variant/40 rounded-[1rem] px-3 py-2 focus-within:border-primary/40 transition-colors">
                <input type="text" value={textInput} onChange={e=>setTextInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void sendTextMessage()}}}
                  placeholder="Type a message…"
                  className="flex-1 bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
                  disabled={isSendingText}/>
                <button type="submit" disabled={!textInput.trim()||isSendingText}
                  className="p-1.5 rounded-[0.75rem] bg-primary-container text-on-primary-container hover:brightness-110 disabled:opacity-30 transition-all">
                  {isSendingText
                    ?<span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span>
                    :<span className="material-symbols-outlined text-[16px]">send</span>}
                </button>
              </form>
              <p className="mt-1.5 text-center text-[10px] text-on-surface-variant/40">Ctrl+M to toggle mic</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // Report phase
  if (phase === 'report' && report) return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0">
        <div className="w-9" />
        <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest">Session Report</p>
        <div className="w-9" />
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        <div className="max-w-lg mx-auto space-y-5">

          {/* Score */}
          <div className="flex items-center gap-5 p-5 bg-surface-container-low border border-outline-variant/30 rounded-[1.5rem]">
            <div className="relative w-20 h-20 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="8" className="text-surface-container-high" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${2*Math.PI*38}`}
                  strokeDashoffset={`${2*Math.PI*38*(1-report.score/100)}`}
                  className={report.score>=70?'text-green-400':report.score>=40?'text-primary':'text-error'}
                  style={{transition:'stroke-dashoffset 1s ease'}}/>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-on-surface">{report.score}</span>
                <span className="text-[9px] text-on-surface-variant font-black uppercase">Score</span>
              </div>
            </div>
            <div>
              <p className="text-[15px] font-black text-on-surface mb-1">
                {report.score>=70?'🎉 Strong understanding!':report.score>=40?'💪 Getting there!':'📚 Needs more review'}
              </p>
              <p className="text-[13px] text-on-surface-variant leading-relaxed">{report.summary}</p>
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
              className="py-3.5 rounded-[1rem] bg-surface-container-high border border-outline-variant text-on-surface font-bold text-[15px] hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">refresh</span> Try Again
            </button>
            <Link href={`/library/${resourceId}`}
              className="py-3.5 rounded-[1rem] bg-primary-container text-on-primary-container font-bold text-[15px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">menu_book</span> Done
            </Link>
          </div>
        </div>
      </div>
    </div>
  )

  return null
}
