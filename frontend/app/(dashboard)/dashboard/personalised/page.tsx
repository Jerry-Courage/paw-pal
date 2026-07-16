'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, libraryApi, getAuthToken, API_BASE } from '@/lib/api'
import { 
  Headphones, ChevronLeft, Volume2, Mic, MicOff, Play, X, 
  Send, Loader2, Sparkles, Check, CheckCircle2, Clock, Flame, 
  Award, ShieldAlert, BookOpen
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

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

// Convert base64 audio chunks (24kHz PCM) to Float32 Array for Web Audio API
function base64ToPcmFloat(b64: string): Float32Array {
  try {
    const binary = atob(b64)
    const buffer = new ArrayBuffer(binary.length)
    const view = new DataView(buffer)
    for (let i = 0; i < binary.length; i++) {
      view.setUint8(i, binary.charCodeAt(i))
    }
    const int16Samples = Math.floor(binary.length / 2)
    const float32 = new Float32Array(int16Samples)
    for (let i = 0; i < int16Samples; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768 // little-endian
    }
    return float32
  } catch (e) {
    console.error('Audio decoding error:', e)
    return new Float32Array(0)
  }
}

export default function PersonalisedLearningPage() {
  const router = useRouter()
  const qc = useQueryClient()

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

  // ── Session stats ──
  const [secondsElapsed, setSecondsElapsed] = useState(0)
  const timerRef = useRef<any>(null)

  // ── Audio playback queue refs (prevent latency / overlap) ──
  const playAudioCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef<number>(0)
  const scheduledBuffersRef = useRef<AudioBufferSourceNode[]>([])
  const isSpeakingTimeoutRef = useRef<any>(null)

  // ── Recording refs ──
  const micAudioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const isMicMutedRef = useRef(false)
  useEffect(() => {
    isMicMutedRef.current = isMicMuted
  }, [isMicMuted])

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

  // ── Stop Audio Playout ──
  const stopAudioPlayout = useCallback(() => {
    scheduledBuffersRef.current.forEach(source => {
      try {
        source.stop()
        source.disconnect()
      } catch (e) {}
    })
    scheduledBuffersRef.current = []
    nextPlayTimeRef.current = 0
    setIsAiSpeaking(false)
  }, [])

  // ── Play Audio Chunk ──
  const playAudioChunk = useCallback((base64Data: string) => {
    if (phase !== 'session') return

    const ctx = playAudioCtxRef.current || new AudioContext({ sampleRate: 24000 })
    if (!playAudioCtxRef.current) playAudioCtxRef.current = ctx

    if (ctx.state === 'suspended') {
      void ctx.resume()
    }

    const float32 = base64ToPcmFloat(base64Data)
    if (float32.length === 0) return

    const audioBuffer = ctx.createBuffer(1, float32.length, 24000)
    audioBuffer.copyToChannel(float32 as any, 0)

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)

    const currentTime = ctx.currentTime
    let playTime = nextPlayTimeRef.current

    if (playTime < currentTime) {
      playTime = currentTime + 0.05
    }

    source.start(playTime)
    nextPlayTimeRef.current = playTime + audioBuffer.duration
    scheduledBuffersRef.current.push(source)

    source.onended = () => {
      scheduledBuffersRef.current = scheduledBuffersRef.current.filter(x => x !== source)
    }

    setIsAiSpeaking(true)
    clearTimeout(isSpeakingTimeoutRef.current)
    isSpeakingTimeoutRef.current = setTimeout(() => {
      setIsAiSpeaking(false)
    }, (nextPlayTimeRef.current - ctx.currentTime) * 1000 + 300)
  }, [phase])

  // ── Connect WebSocket & Start Session ──
  const startSession = async () => {
    setIsConnecting(true)
    setIsMicAvailable(true)
    setTranscript([])
    setSecondsElapsed(0)

    // Pre-initialize Play AudioContext during user gesture to avoid autoplay issues
    try {
      const playCtx = new AudioContext({ sampleRate: 24000 })
      playAudioCtxRef.current = playCtx
      if (playCtx.state === 'suspended') {
        await playCtx.resume()
      }
    } catch (e) {
      console.warn('AudioContext pre-init failed:', e)
    }

    // Acquire mic stream
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
      setIsMicAvailable(true)
    } catch (e) {
      streamRef.current = null
      setIsMicAvailable(false)
      toast.error('Mic unavailable — text-only coaching session is active.')
    }

    try {
      const token = await getAuthToken()
      const backendHost = (API_BASE || '').replace(/^https?:\/\//, '').replace(/\/api$/, '')
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${backendHost}/ws/personalised/?token=${token}`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'start',
          voice: voice,
        }))
      }

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)

        if (msg.type === 'ready') {
          setIsConnecting(false)
          setPhase('session')
          // Start elapsed timer
          timerRef.current = setInterval(() => {
            setSecondsElapsed(sec => sec + 1)
          }, 1000)

          if (streamRef.current) {
            activateMicProcessor(streamRef.current)
          }
        } else if (msg.type === 'interrupted') {
          stopAudioPlayout()
        } else if (msg.type === 'audio') {
          playAudioChunk(msg.data)
        } else if (msg.type === 'transcript_user') {
          setTranscript(prev => {
            if (prev.length === 0) return [{ role: 'user', text: msg.text, ts: Date.now() }]
            const last = prev[prev.length - 1]
            if (last.role === 'user' && (Date.now() - last.ts < 2000)) {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + ' ' + msg.text, ts: Date.now() }
              ]
            }
            return [...prev, { role: 'user', text: msg.text, ts: Date.now() }]
          })
        } else if (msg.type === 'transcript_ai') {
          setTranscript(prev => {
            if (prev.length === 0) return [{ role: 'ai', text: msg.text, ts: Date.now() }]
            const last = prev[prev.length - 1]
            if (last.role === 'ai' && (Date.now() - last.ts < 2000)) {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + msg.text, ts: Date.now() }
              ]
            }
            return [...prev, { role: 'ai', text: msg.text, ts: Date.now() }]
          })
        } else if (msg.type === 'status') {
          toast.info(msg.message)
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
        toast.error('Personal Tutor server connection failed.')
        setIsConnecting(false)
      }

      ws.onclose = () => {
        setIsRecording(false)
        stopMic()
      }
    } catch (e) {
      toast.error('Failed to establish voice session.')
      setIsConnecting(false)
    }
  }

  // ── Mic Capture Processor ──
  const activateMicProcessor = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext({ sampleRate: 16000 })
      micAudioCtxRef.current = ctx

      const resumeCtx = () => {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {})
        }
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
        if (isMicMutedRef.current) return
        if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return }
        
        const float32 = e.inputBuffer.getChannelData(0).slice()
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
      const silentGain = ctx.createGain()
      silentGain.gain.value = 0
      processor.connect(silentGain)
      silentGain.connect(ctx.destination)

      isMicMutedRef.current = false
      setIsRecording(true)
    } catch (e) {
      toast.error('Failed to start microphone streaming.')
    }
  }

  const stopMic = () => {
    processorRef.current?.disconnect()
    processorRef.current = null
    micAudioCtxRef.current?.close()
    micAudioCtxRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    isMicMutedRef.current = true
    setIsRecording(false)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      stopMic()
      stopAudioPlayout()
      clearInterval(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopAudioPlayout])

  const endSessionTimeoutRef = useRef<any>(null)
  const endSession = () => {
    stopMic()
    clearInterval(timerRef.current)

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_session' }))
      setIsEndingSession(true)

      // Fallback in case backend doesn't send report
      endSessionTimeoutRef.current = setTimeout(() => {
        setIsEndingSession(false)
        setPhase('report')
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
      wsRef.current.send(JSON.stringify({
        type: 'text_message',
        text: text,
      }))
    }
  }

  // Format Elapsed Time
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 min-h-[85vh] flex flex-col justify-center bg-gradient-to-tr from-[#120a18] via-[#050508] to-[#0d0710] text-slate-100 rounded-3xl border border-white/[0.02]">
      
      {/* ── PHASE 1: SETUP ────────────────────────────────────────────────── */}
      {phase === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch w-full">
          
          {/* Left panel: Context Checklist */}
          <div className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-8 rounded-3xl bg-[#0f0f12]/80 backdrop-blur-xl border border-white/[0.04] relative overflow-hidden shadow-2xl">
            <div className="absolute -top-24 -left-24 w-72 h-72 bg-rose-500/[0.02] rounded-full blur-3xl pointer-events-none" />
            
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shadow-lg shadow-rose-500/5">
                  <Headphones className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Personal Tutor</h1>
                  <p className="text-xs text-rose-400/80 font-semibold tracking-wider uppercase mt-0.5">Gemini Live Adaptive Study Space</p>
                </div>
              </div>

              <p className="text-sm text-slate-400 leading-relaxed">
                Connect to a personalized live voice session. The tutor automatically references your past conversation history, study materials, and knowledge level to help you master concepts faster.
              </p>

              {/* Status Checklist */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-rose-400" /> Active Contexts
                </h3>
                
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.01] border border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white leading-none">Global Chat Logs</p>
                      <p className="text-[10px] text-slate-500 mt-1">Dialogue continuity initialized with last 20 messages</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.01] border border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white leading-none">Materials Library ({resources.length} items)</p>
                      <p className="text-[10px] text-slate-500 mt-1">Knowledge preloaded from your documents and slides</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.01] border border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white leading-none">User Level & Stats (Lvl {userLevel.num})</p>
                      <p className="text-[10px] text-slate-500 mt-1">Auto-adapts vocabulary ({totalXp} XP, {studyStreak} day streak)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 flex items-center justify-between border-t border-white/[0.04] mt-8">
              <Link href="/dashboard" className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> Back to Dashboard
              </Link>
            </div>
          </div>

          {/* Right panel: Voice Selector & Action */}
          <div className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-8 rounded-3xl bg-[#0a0a0c]/90 backdrop-blur-xl border border-white/[0.04] relative overflow-hidden shadow-2xl">
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-widest">1. Select Voice Profile</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Pick the vocal character for this session</p>
              </div>

              {/* Grid Voice Selector */}
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
                    {voice === v.id && (
                      <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
                    )}
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
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Initializing Connection...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    Start Session
                  </>
                )}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ── PHASE 2: ACTIVE SESSION ───────────────────────────────────────── */}
      {phase === 'session' && (
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 items-stretch min-h-[80vh] lg:h-[75vh] w-full">
          
          {/* Left Side: Pulse Area & Mute Toggle */}
          <div className="lg:col-span-5 flex flex-col justify-between items-center p-6 sm:p-8 rounded-3xl bg-[#0a0a0d]/80 backdrop-blur-xl border border-white/[0.04] relative overflow-hidden min-h-[300px]">
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span className="text-xs text-rose-400 font-bold tracking-wide uppercase">Tutor Active</span>
            </div>

            <div className="absolute top-4 right-4 text-xs font-mono text-slate-400 tabular-nums bg-white/5 px-2.5 py-1 rounded-lg border border-white/[0.02]">
              {formatTime(secondsElapsed)}
            </div>

            {/* Pulsing Visual Waveform Area */}
            <div className="flex-1 flex flex-col items-center justify-center relative w-full my-6">
              
              {/* Outer speaking rings */}
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

              {/* Core sphere */}
              <motion.div
                animate={{
                  scale: isAiSpeaking ? [1, 1.08, 1] : isRecording && !isMicMuted ? [1, 1.03, 1] : 1,
                  boxShadow: isAiSpeaking
                    ? '0 0 35px rgba(244,63,94,0.4)'
                    : isRecording && !isMicMuted
                    ? '0 0 20px rgba(244,63,94,0.15)'
                    : 'none',
                }}
                transition={{
                  repeat: Infinity,
                  duration: isAiSpeaking ? 1.2 : 2.0,
                  ease: 'easeInOut',
                }}
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
                <p className="text-[10px] text-slate-500 mt-1 leading-normal max-w-[180px] mx-auto">
                  {isMicMuted ? 'Unmute microphone below to talk' : 'Speak naturally at any time'}
                </p>
              </div>
            </div>

            {/* Quick Actions (Mute & End) */}
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

          {/* Right Side: Scrollable Transcript Logs & Chat Input */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-3xl bg-[#09090b]/80 backdrop-blur-xl border border-white/[0.04] overflow-hidden shadow-2xl h-[45vh] lg:h-full">
            
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-white/[0.04] bg-white/[0.01] flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tutor Dialogue Log</span>
              <span className="text-[9px] text-rose-400 font-bold bg-rose-500/5 border border-rose-500/10 px-2 py-0.5 rounded font-mono">Gemini 2.5 Live</span>
            </div>

            {/* Transcript scrollbox */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
              {transcript.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2">
                  <Sparkles className="w-8 h-8 text-rose-500/20 animate-pulse" />
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Awaiting dialogue...</p>
                  <p className="text-[10px] text-slate-600 max-w-[200px] leading-normal">Say hello or speak into your microphone to start the discussion.</p>
                </div>
              ) : (
                transcript.map((t, idx) => (
                  <div key={idx} className={cn("flex flex-col", t.role === 'user' ? "items-end" : "items-start")}>
                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-1">
                      {t.role === 'user' ? 'Student' : 'Personal Tutor'}
                    </span>
                    <div className={cn(
                      "px-4 py-2.5 rounded-2xl text-xs max-w-[85%] leading-relaxed shadow-sm",
                      t.role === 'user'
                        ? "bg-rose-500/10 border border-rose-500/20 text-rose-100"
                        : "bg-white/[0.02] border border-white/[0.04] text-zinc-300"
                    )}>
                      {t.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Message input */}
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

      {/* ── PHASE 3: REPORT ───────────────────────────────────────────────── */}
      {phase === 'report' && report && (
        <div className="max-w-xl mx-auto w-full p-6 sm:p-8 rounded-3xl bg-[#0a0a0d]/90 backdrop-blur-xl border border-white/[0.04] relative overflow-hidden shadow-2xl space-y-6">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-rose-500/[0.02] rounded-full blur-3xl pointer-events-none" />

          {/* Heading */}
          <div className="text-center space-y-2">
            <Award className="w-12 h-12 text-rose-400 mx-auto animate-bounce" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Session Complete</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Evaluation & Next Steps</p>
          </div>

          {/* Score & Summary */}
          <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/[0.03] space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Focus Score</span>
              <span className="text-xl font-black text-rose-400">{report.score}/100</span>
            </div>
            <div className="w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full" 
                style={{ width: `${report.score}%` }} 
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed pt-1">{report.summary}</p>
          </div>

          {/* Strengths & Gaps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Strengths */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Strengths
              </h4>
              <ul className="space-y-1.5">
                {report.strengths.length === 0 ? (
                  <li className="text-[11px] text-slate-600 italic">None logged.</li>
                ) : (
                  report.strengths.map((s, i) => (
                    <li key={i} className="text-[11px] text-slate-400 leading-normal flex items-start gap-1">
                      <span className="text-emerald-500 mt-0.5">•</span> {s}
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* Gaps */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" /> Gaps
              </h4>
              <ul className="space-y-1.5">
                {report.gaps.length === 0 ? (
                  <li className="text-[11px] text-slate-600 italic">None logged.</li>
                ) : (
                  report.gaps.map((g, i) => (
                    <li key={i} className="text-[11px] text-slate-400 leading-normal flex items-start gap-1">
                      <span className="text-amber-500 mt-0.5">•</span> {g}
                    </li>
                  ))
                )}
              </ul>
            </div>

          </div>

          {/* Recommendation */}
          <div className="p-4 rounded-2xl bg-rose-500/[0.02] border border-rose-500/10">
            <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Tutor Advice
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">{report.recommendation}</p>
          </div>

          {/* Action */}
          <div className="pt-2">
            <button
              onClick={() => setPhase('setup')}
              className="w-full py-3.5 rounded-2xl bg-white text-black hover:bg-zinc-200 text-xs font-black uppercase tracking-wider transition-all"
            >
              Finish Session
            </button>
          </div>

        </div>
      )}

      {/* ── ENDING SESSION SPINNER OVERLAY ────────────────────────────────── */}
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
