'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi, libraryApi, getAuthToken, API_BASE } from '@/lib/api'
import { 
  Headphones, ChevronLeft, Volume2, Mic, MicOff, Play, 
  Send, Loader2, Sparkles, CheckCircle2, 
  Award, ShieldAlert
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// Available Gemini Live voices
const GEMINI_VOICES = [
  { id: 'Puck',   label: 'Puck',   desc: 'Playful & expressive 😄' },
  { id: 'Aoede',  label: 'Aoede',  desc: 'Warm & engaging 🌟' },
  { id: 'Kore',   label: 'Kore',   desc: 'Upbeat & encouraging ⚡' },
  { id: 'Charon', label: 'Charon', desc: 'Thoughtful & measured 🎓' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Confident & clear 💪' },
  { id: 'Leda',   label: 'Leda',   desc: 'Calm & focused 🧘' },
]

type Phase = 'setup' | 'session' | 'report'
type TranscriptEntry = { role: 'user' | 'ai'; text: string; ts: number }

interface SessionReport {
  summary: string
  strengths: string[]
  gaps: string[]
  score: number
  recommendation: string
}

// ── Audio helpers — IDENTICAL to examprep/page.tsx ────────────────────────────

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
export default function PersonalisedLearningPage() {
  // ── State variables ──
  const [phase, setPhase] = useState<Phase>('setup')
  const [voice, setVoice] = useState<string>('Aoede')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [isMicAvailable, setIsMicAvailable] = useState(true)
  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [textInput, setTextInput] = useState('')
  const [report, setReport] = useState<SessionReport | null>(null)
  const [isEndingSession, setIsEndingSession] = useState(false)
  const [sessionDuration, setSessionDuration] = useState(0)

  // ── Refs — IDENTICAL pattern to examprep ──
  const wsRef = useRef<WebSocket | null>(null)
  const micAudioCtxRef = useRef<AudioContext | null>(null)
  const playAudioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isMicMutedRef = useRef(false)
  const nextPlayTimeRef = useRef(0)
  const timerRef = useRef<any>(null)
  const isSpeakingTimeoutRef = useRef<any>(null)
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])
  const endSessionTimeoutRef = useRef<any>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const isAiSpeakingRef = useRef(false)

  // Keep isMicMutedRef in sync with state
  useEffect(() => { isMicMutedRef.current = isMicMuted }, [isMicMuted])

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

  // ── Fetch Profile & Resources ──
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.me().then(r => r.data),
  })
  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })

  const resources = resourcesData?.results || []
  const totalXp = profile?.xp ?? 0
  const userLevel = profile?.level || { num: 1, name: 'Freshman' }
  const studyStreak = profile?.study_streak ?? 0

  // ── Stop audio — IDENTICAL to examprep ────────────────────────────────────
  const stopAudioPlayout = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop() } catch (e) {}
    })
    activeSourcesRef.current = []
    if (playAudioCtxRef.current) {
      nextPlayTimeRef.current = playAudioCtxRef.current.currentTime
    }
    setIsAiSpeaking(false)
    isAiSpeakingRef.current = false
    clearTimeout(isSpeakingTimeoutRef.current)
  }, [])

  // ── Play AI audio — IDENTICAL to examprep ─────────────────────────────────
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
    isAiSpeakingRef.current = true
    clearTimeout(isSpeakingTimeoutRef.current)
    isSpeakingTimeoutRef.current = setTimeout(() => {
      setIsAiSpeaking(false)
      isAiSpeakingRef.current = false
    }, (nextPlayTimeRef.current - ctx.currentTime) * 1000 + 500)
  }, [])

  // ── Connect WebSocket — same pattern as examprep ───────────────────────────
  const startSession = async () => {
    setIsConnecting(true)
    setIsMicAvailable(true)
    setTranscript([])
    setSessionDuration(0)

    let micPermissionOk = true
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
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
      streamRef.current = null
      micPermissionOk = false
      setIsMicAvailable(false)
      toast.error('Mic unavailable — text-only mode is active.')
    }

    try {
      const token = await getAuthToken()
      const backendHost = (API_BASE || '').replace(/^https?:\/\//, '').replace(/\/api$/, '')
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${backendHost}/ws/personalised/?token=${token}`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'start', voice }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        if (msg.type === 'ready') {
          setIsConnecting(false)
          setPhase('session')
          if (streamRef.current && micPermissionOk) {
            activateMicProcessor(streamRef.current)
          }
          toast('🎤 Personal Tutor is ready! Speak naturally at any time.', { duration: 4000, icon: '💡' })
        } else if (msg.type === 'audio') {
          // IDENTICAL to examprep: decode then play
          const pcm = base64ToPcmFloat(msg.data)
          playAudioChunk(pcm)
        } else if (msg.type === 'interrupted') {
          stopAudioPlayout()
        } else if (msg.type === 'transcript_user' || msg.type === 'transcript_ai') {
          const role = msg.type === 'transcript_user' ? 'user' : 'ai'
          setTranscript(prev => {
            if (prev.length === 0) return [{ role, text: msg.text, ts: Date.now() }]
            const last = prev[prev.length - 1]
            if (last.role === role && (Date.now() - last.ts < 2000)) {
              return [...prev.slice(0, -1), { ...last, text: last.text + msg.text, ts: Date.now() }]
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
        toast.error('Personal Tutor connection failed.')
        setIsConnecting(false)
      }

      ws.onclose = () => {
        setIsRecording(false)
        stopMic()
      }
    } catch (e) {
      toast.error('Failed to start session.')
      setIsConnecting(false)
    }
  }

  // ── Mic capture — IDENTICAL to examprep ───────────────────────────────────
  const activateMicProcessor = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext({ sampleRate: 16000 })
      micAudioCtxRef.current = ctx

      // Resume AudioContext if it gets suspended by browser autoplay policy
      const resumeCtx = () => {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      }
      const resumeInterval = setInterval(() => {
        if (!processorRef.current) { clearInterval(resumeInterval); return }
        resumeCtx()
      }, 500)

      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(2048, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        if (isMicMutedRef.current || isAiSpeakingRef.current) return
        if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return }
        const float32 = e.inputBuffer.getChannelData(0).slice()
        // Inline int16 conversion — identical to examprep
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
      toast.error('Failed to start mic processing.')
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

  // ── Clean up on unmount — IDENTICAL to examprep ───────────────────────────
  useEffect(() => {
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
      stopMic()
      stopAudioPlayout()
    }
  }, [stopAudioPlayout])

  const endSession = () => {
    stopMic()
    clearInterval(timerRef.current)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_session' }))
      setIsEndingSession(true)
      endSessionTimeoutRef.current = setTimeout(() => {
        setIsEndingSession(false)
        setPhase('setup')
      }, 5000)
    } else {
      setPhase('setup')
    }
  }

  const sendTextMessage = () => {
    const text = textInput.trim()
    if (!text) return
    setTextInput('')
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text_message', text }))
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 min-h-[85vh] flex flex-col justify-center bg-gradient-to-tr from-[#120a18] via-[#050508] to-[#0d0710] text-slate-100 rounded-3xl border border-white/[0.02]">

      {/* ── PHASE 1: SETUP ─────────────────────────────────────────────────── */}
      {phase === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch w-full">

          {/* Left: Context Checklist */}
          <div className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-8 rounded-3xl bg-[#0f0f12]/80 backdrop-blur-xl border border-white/[0.04] relative overflow-hidden shadow-2xl">
            <div className="absolute -top-24 -left-24 w-72 h-72 bg-rose-500/[0.02] rounded-full blur-3xl pointer-events-none" />

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shadow-lg shadow-rose-500/5">
                  <Headphones className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Personal Tutor</h1>
                  <p className="text-xs text-rose-400/80 font-semibold tracking-wider uppercase mt-0.5">Gemini Live Adaptive Study Space</p>
                </div>
              </div>

              <p className="text-sm text-slate-400 leading-relaxed">
                Connect to a personalized live voice session. The tutor automatically references your past conversation history, study materials, and knowledge level to help you master concepts faster.
              </p>

              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-rose-400" /> Active Contexts
                </h3>
                <div className="space-y-2.5">
                  {[
                    { label: 'Global Chat Logs', sub: 'Dialogue continuity from your last session' },
                    { label: `Materials Library (${resources.length} items)`, sub: 'Knowledge loaded from your documents' },
                    { label: `User Level & Stats (Lvl ${userLevel.num})`, sub: `Auto-adapts to you (${totalXp} XP, ${studyStreak} day streak)` },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.01] border border-white/[0.03]">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white leading-none">{item.label}</p>
                        <p className="text-[10px] text-slate-500 mt-1">{item.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-6 flex items-center border-t border-white/[0.04] mt-8">
              <Link href="/dashboard" className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> Back to Dashboard
              </Link>
            </div>
          </div>

          {/* Right: Voice Selector & Launch */}
          <div className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-8 rounded-3xl bg-[#0a0a0c]/90 backdrop-blur-xl border border-white/[0.04] relative overflow-hidden shadow-2xl">
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-widest">1. Select Voice Profile</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Pick the vocal character for this session</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {GEMINI_VOICES.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setVoice(v.id)}
                    className={cn(
                      "flex flex-col items-start gap-1.5 p-3 rounded-2xl border transition-all text-left relative overflow-hidden",
                      voice === v.id
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-300 shadow-md shadow-rose-500/5"
                        : "bg-white/[0.01] border-white/[0.03] hover:bg-white/[0.03] text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {voice === v.id && <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-rose-500" />}
                    <span className="text-xs font-bold leading-none">{v.label}</span>
                    <span className="text-[9px] leading-tight text-slate-500 mt-0.5">{v.desc}</span>
                  </button>
                ))}
              </div>

              <div className="p-4 bg-white/[0.01] border border-white/[0.03] rounded-2xl flex items-center gap-3">
                <Volume2 className="w-5 h-5 text-rose-400 shrink-0" />
                <p className="text-[10px] text-slate-500 leading-normal">
                  Low-latency voice streaming. Active voice detection allows you to interrupt and talk naturally at any time.
                </p>
              </div>
            </div>

            <div className="pt-6">
              <button
                onClick={startSession}
                disabled={isConnecting}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 hover:brightness-110 text-white font-black text-xs uppercase tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20"
              >
                {isConnecting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                ) : (
                  <><Play className="w-4 h-4 fill-white" /> Start Session</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PHASE 2: ACTIVE SESSION ─────────────────────────────────────────── */}
      {phase === 'session' && (
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 items-stretch min-h-[80vh] lg:h-[75vh] w-full">

          {/* Left: Visualizer */}
          <div className="lg:col-span-5 flex flex-col justify-between items-center p-6 sm:p-8 rounded-3xl bg-[#0a0a0d]/80 backdrop-blur-xl border border-white/[0.04] relative overflow-hidden min-h-[300px]">
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span className="text-xs text-rose-400 font-bold tracking-wide uppercase">Tutor Active</span>
            </div>
            <div className="absolute top-4 right-4 text-xs font-mono text-slate-400 tabular-nums bg-white/5 px-2.5 py-1 rounded-lg border border-white/[0.02]">
              {formatTime(sessionDuration)}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center relative w-full my-6">
              <AnimatePresence>
                {isAiSpeaking && (
                  <>
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1.4, opacity: 0.2 }}
                      exit={{ opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 1.8, ease: 'easeOut' }}
                      className="absolute w-48 h-48 rounded-full border-2 border-rose-500 pointer-events-none"
                    />
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1.8, opacity: 0.08 }}
                      exit={{ opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 1.8, ease: 'easeOut', delay: 0.6 }}
                      className="absolute w-48 h-48 rounded-full border border-rose-400 pointer-events-none"
                    />
                  </>
                )}
              </AnimatePresence>

              <motion.div
                animate={{
                  scale: isAiSpeaking ? [1, 1.08, 1] : isRecording && !isMicMuted ? [1, 1.03, 1] : 1,
                  boxShadow: isAiSpeaking
                    ? '0 0 35px rgba(244,63,94,0.4)'
                    : isRecording && !isMicMuted
                    ? '0 0 20px rgba(244,63,94,0.15)'
                    : 'none',
                }}
                transition={{ repeat: Infinity, duration: isAiSpeaking ? 1.2 : 2.0, ease: 'easeInOut' }}
                className={cn(
                  "w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center border transition-all duration-300 relative z-10",
                  isAiSpeaking
                    ? "bg-rose-500/10 border-rose-500/40 text-rose-300"
                    : isRecording && !isMicMuted
                    ? "bg-rose-500/5 border-rose-500/20 text-rose-400"
                    : "bg-white/[0.01] border-white/[0.05] text-slate-500"
                )}
              >
                {isAiSpeaking ? (
                  <Volume2 className="w-10 h-10 animate-pulse" />
                ) : isMicMuted ? (
                  <MicOff className="w-10 h-10 text-rose-500/50" />
                ) : (
                  <Mic className="w-10 h-10 text-rose-400 animate-pulse" />
                )}
              </motion.div>

              <div className="mt-6 text-center">
                <p className="text-xs font-black text-white uppercase tracking-widest">
                  {isAiSpeaking ? 'Tutor Speaking' : isMicMuted ? 'Microphone Muted' : 'Tutor Listening'}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {isMicMuted ? 'Unmute to talk' : 'Speak naturally at any time'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full max-w-[260px] relative z-20">
              <button
                onClick={() => setIsMicMuted(v => !v)}
                className={cn(
                  "flex-1 py-3 rounded-2xl border font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                  isMicMuted
                    ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                    : "bg-white/5 border-white/[0.04] text-slate-300 hover:bg-white/10"
                )}
              >
                {isMicMuted ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                {isMicMuted ? 'Unmute' : 'Mute'}
              </button>
              <button
                onClick={endSession}
                className="px-6 py-3 rounded-2xl bg-white text-black hover:bg-zinc-200 transition-all text-xs font-black uppercase tracking-wider"
              >
                End
              </button>
            </div>
          </div>

          {/* Right: Transcript */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-3xl bg-[#09090b]/80 backdrop-blur-xl border border-white/[0.04] overflow-hidden shadow-2xl h-[45vh] lg:h-full">
            <div className="px-4 py-3.5 border-b border-white/[0.04] bg-white/[0.01] flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tutor Dialogue Log</span>
              <span className="text-[9px] text-rose-400 font-bold bg-rose-500/5 border border-rose-500/10 px-2 py-0.5 rounded font-mono">Gemini 2.5 Live</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {transcript.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2">
                  <Sparkles className="w-8 h-8 text-rose-500/20 animate-pulse" />
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Awaiting dialogue...</p>
                  <p className="text-[10px] text-slate-600 max-w-[200px] leading-normal">Your tutor is ready. Speak to start the session.</p>
                </div>
              ) : (
                transcript.map((t, idx) => (
                  <div key={idx} className={cn("flex flex-col", t.role === 'user' ? "items-end" : "items-start")}>
                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-1">
                      {t.role === 'user' ? 'Student' : 'Personal Tutor'}
                    </span>
                    <div className={cn(
                      "px-4 py-2.5 rounded-2xl text-xs max-w-[85%] leading-relaxed",
                      t.role === 'user'
                        ? "bg-rose-500/10 border border-rose-500/20 text-rose-100"
                        : "bg-white/[0.02] border border-white/[0.04] text-zinc-300"
                    )}>
                      {t.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>

            <div className="p-3 border-t border-white/[0.04] bg-[#070709]/60 flex items-center gap-2">
              <input
                type="text"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendTextMessage() }}
                placeholder="Type a message to your tutor..."
                className="flex-1 bg-white/[0.01] border border-white/[0.05] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/30 transition-all"
              />
              <button
                onClick={sendTextMessage}
                disabled={!textInput.trim()}
                className="p-2.5 rounded-xl bg-rose-500 text-white hover:bg-rose-400 disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PHASE 3: REPORT ────────────────────────────────────────────────── */}
      {phase === 'report' && report && (
        <div className="max-w-xl mx-auto w-full p-6 sm:p-8 rounded-3xl bg-[#0a0a0d]/90 backdrop-blur-xl border border-white/[0.04] relative overflow-hidden shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <Award className="w-12 h-12 text-rose-400 mx-auto animate-bounce" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Session Complete</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Evaluation & Next Steps</p>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/[0.03] space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Focus Score</span>
              <span className="text-xl font-black text-rose-400">{report.score}/100</span>
            </div>
            <div className="w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full" style={{ width: `${report.score}%` }} />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed pt-1">{report.summary}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Strengths
              </h4>
              <ul className="space-y-1.5">
                {(report.strengths || []).map((s, i) => (
                  <li key={i} className="text-[11px] text-slate-400 leading-normal flex items-start gap-1">
                    <span className="text-emerald-500 mt-0.5">•</span> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> Gaps
              </h4>
              <ul className="space-y-1.5">
                {(report.gaps || []).map((g, i) => (
                  <li key={i} className="text-[11px] text-slate-400 leading-normal flex items-start gap-1">
                    <span className="text-amber-500 mt-0.5">•</span> {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-rose-500/[0.02] border border-rose-500/10">
            <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Tutor Advice
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">{report.recommendation}</p>
          </div>

          <button
            onClick={() => { setPhase('setup'); setReport(null) }}
            className="w-full py-3.5 rounded-2xl bg-white text-black hover:bg-zinc-200 text-xs font-black uppercase tracking-wider transition-all"
          >
            Start New Session
          </button>
        </div>
      )}

      {/* ── ENDING SESSION OVERLAY ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isEndingSession && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <div className="text-center space-y-3">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin mx-auto" />
              <p className="text-xs font-bold text-white uppercase tracking-wider">Generating Evaluation Report...</p>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
