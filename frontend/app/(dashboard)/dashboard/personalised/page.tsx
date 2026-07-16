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
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const int16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768
  return float32
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
        toast.error('Voice Coach server connection failed.')
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
    if (micAudioCtxRef.current) {
      void micAudioCtxRef.current.close().catch(() => {})
      micAudioCtxRef.current = null
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
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
    <div className="max-w-5xl mx-auto px-0 min-h-[85vh] flex flex-col justify-center">
      
      {/* ── PHASE 1: SETUP ────────────────────────────────────────────────── */}
      {phase === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Left panel: Context Checklist */}
          <div className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-8 rounded-3xl bg-[#0f0f12] border border-white/[0.04] relative overflow-hidden">
            <div className="absolute -top-24 -left-24 w-72 h-72 bg-rose-500/[0.03] rounded-full blur-3xl pointer-events-none" />
            
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                  <Headphones className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Personalized Voice Coach</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Gemini Live Bidirectional Learning Session</p>
                </div>
              </div>

              <p className="text-sm text-slate-400 leading-relaxed">
                Start an open-ended conversation with your AI study coach. It knows your past chats, uploaded library materials, and level, making your learning fully personalized.
              </p>

              {/* Status Checklist */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Context checklist</h3>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white leading-none">Global Chat Logs</p>
                      <p className="text-[10px] text-slate-600 mt-1">Last 20 messages loaded for dialogue continuity</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white leading-none">Materials Library ({resources.length} items)</p>
                      <p className="text-[10px] text-slate-600 mt-1">Context from uploaded slides, PDFs, and audios active</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white leading-none">User Level & Stats (Lvl {userLevel.num})</p>
                      <p className="text-[10px] text-slate-600 mt-1">Adapts explanations to level ({totalXp} XP, {studyStreak} day streak)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-8 flex items-center justify-between border-t border-white/[0.04] mt-8 lg:mt-0">
              <Link href="/dashboard" className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> Back to Dashboard
              </Link>
            </div>
          </div>

          {/* Right panel: Voice Selector & Action */}
          <div className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-8 rounded-3xl bg-[#111] border border-white/[0.05] relative overflow-hidden shadow-2xl">
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-widest">1. Select Voice Companion</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Choose your companion's voice style</p>
              </div>

              {/* Grid Voice Selector */}
              <div className="grid grid-cols-2 gap-2">
                {GEMINI_VOICES.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setVoice(v.id)}
                    className={cn(
                      "flex flex-col items-start gap-1.5 p-3 rounded-2xl border transition-all text-left relative overflow-hidden",
                      voice === v.id
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-lg"
                        : "bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04] text-slate-500"
                    )}
                  >
                    {voice === v.id && (
                      <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
                    )}
                    <span className="text-xs font-black leading-none">{v.label}</span>
                    <span className="text-[9px] leading-tight text-slate-500 mt-0.5">{v.desc}</span>
                  </button>
                ))}
              </div>

              <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl flex items-center gap-3">
                <Volume2 className="w-5 h-5 text-rose-400 shrink-0" />
                <p className="text-[10px] text-slate-500 leading-normal">
                  Personalized session runs at ultra-low latency with active interruption detection. Simply speak whenever you want.
                </p>
              </div>
            </div>

            <div className="pt-6 mt-6 lg:mt-0">
              <button
                onClick={startSession}
                disabled={isConnecting}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 hover:brightness-110 text-white font-black text-xs uppercase tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-500/10"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Tutor is warming up...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    Start Personalized Session
                  </>
                )}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ── PHASE 2: ACTIVE SESSION ───────────────────────────────────────── */}
      {phase === 'session' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch h-[80vh]">
          
          {/* Left Side: Pulse Area & Mute Toggle */}
          <div className="lg:col-span-5 flex flex-col justify-between items-center p-8 rounded-3xl bg-[#0f0f12] border border-white/[0.04] relative overflow-hidden">
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-xs text-slate-500 font-medium tracking-wide uppercase">Coached Study</span>
            </div>

            <div className="absolute top-4 right-4 text-xs font-mono text-slate-500 tabular-nums bg-white/5 px-2.5 py-1 rounded-lg">
              {formatTime(secondsElapsed)}
            </div>

            {/* Pulsing Visual Waveform Area */}
            <div className="flex-1 flex flex-col items-center justify-center relative w-full">
              
              {/* Outer speaking rings */}
              <AnimatePresence>
                {isAiSpeaking && (
                  <>
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1.4, opacity: 0.15 }}
                      exit={{ opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
                      className="absolute w-56 h-56 rounded-full border-2 border-rose-500 pointer-events-none"
                    />
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1.8, opacity: 0.05 }}
                      exit={{ opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'easeOut', delay: 0.6 }}
                      className="absolute w-56 h-56 rounded-full border border-rose-400 pointer-events-none"
                    />
                  </>
                )}
              </AnimatePresence>

              {/* Core sphere */}
              <motion.div
                animate={{
                  scale: isAiSpeaking ? [1, 1.08, 1] : isRecording && !isMicMuted ? [1, 1.03, 1] : 1,
                  boxShadow: isAiSpeaking
                    ? '0 0 40px rgba(244,63,94,0.3)'
                    : isRecording && !isMicMuted
                    ? '0 0 25px rgba(244,63,94,0.1)'
                    : 'none',
                }}
                transition={{
                  repeat: Infinity,
                  duration: isAiSpeaking ? 1.5 : 2,
                  ease: 'easeInOut',
                }}
                className={cn(
                  "w-36 h-36 rounded-full flex items-center justify-center border transition-all duration-300 relative z-10",
                  isAiSpeaking 
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                    : isRecording && !isMicMuted
                    ? "bg-rose-500/5 border-rose-500/20 text-rose-500/80"
                    : "bg-white/[0.02] border-white/[0.06] text-slate-600"
                )}
              >
                {isAiSpeaking ? (
                  <Volume2 className="w-12 h-12 animate-bounce" />
                ) : isMicMuted ? (
                  <MicOff className="w-12 h-12 text-rose-500/60" />
                ) : (
                  <Mic className="w-12 h-12 text-rose-400 animate-pulse" />
                )}
              </motion.div>

              <div className="mt-8 text-center">
                <p className="text-xs font-black text-white uppercase tracking-widest">
                  {isAiSpeaking ? 'AI Speaking' : isMicMuted ? 'Muted' : 'Listening...'}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 leading-normal max-w-[200px] mx-auto">
                  {isMicMuted ? 'Tap microphone below to unmute' : 'Speak at any time; the AI will auto-respond'}
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
                    ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                    : "bg-white/5 border-white/5 text-slate-300 hover:bg-white/10"
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
          <div className="lg:col-span-7 flex flex-col justify-between rounded-3xl bg-[#111] border border-white/[0.05] overflow-hidden shadow-2xl">
            
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-white/[0.05] bg-white/[0.01] flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Transcript</span>
              <span className="text-[9px] text-slate-600 bg-white/5 px-2 py-0.5 rounded font-mono">Gemini 2.5 Live</span>
            </div>

            {/* Transcript scrollbox */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {transcript.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2">
                  <Sparkles className="w-8 h-8 text-rose-500/30 animate-pulse" />
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Starting dialogue...</p>
                  <p className="text-[10px] text-slate-600 max-w-[240px]">Speak into your mic. The transcript will render here in real-time.</p>
                </div>
              ) : (
                transcript.map((t, idx) => (
                  <div key={idx} className={cn("flex flex-col", t.role === 'user' ? "items-end" : "items-start")}>
                    <span className="text-[9px] text-slate-600 uppercase font-black tracking-widest mb-1.5">
                      {t.role === 'user' ? 'Student' : 'Voice Coach'}
                    </span>
                    <div className={cn(
                      "px-4 py-2.5 rounded-2xl text-xs max-w-[85%] leading-relaxed",
                      t.role === 'user'
                        ? "bg-rose-500/10 border border-rose-500/10 text-rose-200"
                        : "bg-white/[0.03] border border-white/[0.04] text-zinc-300"
                    )}>
                      {t.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Message input */}
            <div className="p-3 border-t border-white/[0.05] bg-[#0c0c0e]/30 flex items-center gap-2">
              <input
                type="text"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendTextMessage() }}
                placeholder="Type a message to your coach..."
                className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/30 transition-all"
              />
              <button
                onClick={sendTextMessage}
                disabled={!textInput.trim()}
                className="p-2 rounded-xl bg-rose-500 text-white hover:bg-rose-400 disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

        </div>
      )}

      {/* ── PHASE 3: REPORT ───────────────────────────────────────────────── */}
      {phase === 'report' && report && (
        <div className="max-w-xl mx-auto w-full p-6 sm:p-8 rounded-3xl bg-[#0f0f12] border border-white/[0.04] relative overflow-hidden shadow-2xl space-y-6">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-rose-500/[0.03] rounded-full blur-3xl pointer-events-none" />

          {/* Heading */}
          <div className="text-center space-y-1.5">
            <Award className="w-12 h-12 text-rose-400 mx-auto animate-bounce" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Coaching Session Complete</h1>
            <p className="text-xs text-slate-500">Evaluation & Next Steps</p>
          </div>

          {/* Score & Summary */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Session Focus Score</span>
              <span className="text-lg font-black text-rose-400">{report.score}/100</span>
            </div>
            <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full bg-rose-500 rounded-full" style={{ width: `${report.score}%` }} />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed pt-1">{report.summary}</p>
          </div>

          {/* Strengths & Gaps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Strengths */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Areas of Strength
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
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Focus Gaps
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
          <div className="p-4 rounded-2xl bg-rose-500/[0.04] border border-rose-500/15">
            <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Tutor Recommendation
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">{report.recommendation}</p>
          </div>

          {/* Action */}
          <div className="pt-2">
            <button
              onClick={() => setPhase('setup')}
              className="w-full py-3.5 rounded-2xl bg-white text-black hover:bg-zinc-200 text-xs font-black uppercase tracking-wider transition-all"
            >
              Done & Return
            </button>
          </div>

        </div>
      )}

      {/* ── ENDING SESSION SPINNER OVERLAY ────────────────────────────────── */}
      <AnimatePresence>
        {isEndingSession && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="text-center space-y-3">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin mx-auto" />
              <p className="text-xs font-bold text-white uppercase tracking-wider">Generating Coaching Report...</p>
              <p className="text-[10px] text-slate-500">Summarizing your learning metrics and progress advice.</p>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  )
}
