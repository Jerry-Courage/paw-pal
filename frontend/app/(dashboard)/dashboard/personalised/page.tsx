'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi, libraryApi, paymentsApi, getAuthToken, API_BASE } from '@/lib/api'
import { Headphones, ChevronLeft, Volume2, Mic, MicOff, Play, Send, Loader2, Sparkles, CheckCircle2, Award, ShieldAlert, MessageSquare, X, Wifi, WifiOff } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { NetworkQualityMonitor, type AdaptiveSettings } from '@/lib/networkQuality'

const PaywallModal = dynamic(() => import('@/components/ui/PaywallModal'), { ssr: false })

const GEMINI_VOICES = [
  { id: 'Puck',   label: 'Puck',   desc: 'Playful & expressive' },
  { id: 'Aoede',  label: 'Aoede',  desc: 'Warm & engaging' },
  { id: 'Kore',   label: 'Kore',   desc: 'Upbeat & encouraging' },
  { id: 'Charon', label: 'Charon', desc: 'Thoughtful & measured' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Confident & clear' },
  { id: 'Leda',   label: 'Leda',   desc: 'Calm & focused' },
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
  const [showTranscript, setShowTranscript] = useState(false)
  const [currentAiText, setCurrentAiText] = useState('')
  const [displayedWords, setDisplayedWords] = useState<string[]>([])
  const prevWordCountRef = useRef(0)
  const wordIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const MAX_VISIBLE_WORDS = 30

  const wsRef = useRef<WebSocket | null>(null)
  const micAudioCtxRef = useRef<AudioContext | null>(null)
  const playAudioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isMicMutedRef = useRef(false)
  const nextPlayTimeRef = useRef(0)
  const timerRef = useRef<any>(null)
  const isSpeakingTimeoutRef = useRef<any>(null)
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])
  const endSessionTimeoutRef = useRef<any>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const isAiSpeakingRef = useRef(false)
  const netMonitorRef = useRef<NetworkQualityMonitor | null>(null)
  const adaptiveSettingsRef = useRef<AdaptiveSettings | null>(null)
  const [networkQuality, setNetworkQuality] = useState<string>('good')
  const sendCounterRef = useRef(0)

  useEffect(() => { isMicMutedRef.current = isMicMuted }, [isMicMuted])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  useEffect(() => {
    if (phase === 'session') {
      timerRef.current = setInterval(() => setSessionDuration(d => d + 1), 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [phase])

  // Animate words appearing one-by-one — incremental, doesn't restart on new text
  useEffect(() => {
    if (!currentAiText) {
      setDisplayedWords([])
      prevWordCountRef.current = 0
      if (wordIntervalRef.current) clearInterval(wordIntervalRef.current)
      return
    }
    const words = currentAiText.split(/\s+/).filter(Boolean)
    const prevCount = prevWordCountRef.current

    // If text was reset (e.g. interrupted), restart from 0
    if (words.length < prevCount) {
      prevWordCountRef.current = 0
    }

    const newWords = words.slice(prevWordCountRef.current)
    if (newWords.length === 0) return

    // Show first new word immediately
    const firstNew = newWords[0]
    setDisplayedWords(prev => {
      const safePrev = prev.length <= prevWordCountRef.current ? prev : prev.slice(0, prevWordCountRef.current)
      return [...safePrev, firstNew]
    })
    prevWordCountRef.current += 1

    // Animate remaining new words at 80ms pace
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

    return () => {
      if (wordIntervalRef.current) clearInterval(wordIntervalRef.current)
    }
  }, [currentAiText])

  // Clear subtitle when AI stops speaking
  useEffect(() => {
    if (!isAiSpeaking && currentAiText) {
      // Keep visible for 3s after AI stops, then fade
      const timeout = setTimeout(() => {
        setCurrentAiText('')
        setDisplayedWords([])
      }, 3000)
      return () => clearTimeout(timeout)
    }
  }, [isAiSpeaking, currentAiText])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.me().then(r => r.data),
  })
  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })
  const { data: subStatus, refetch: refetchSub } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => paymentsApi.getStatus().then(r => r.data),
    staleTime: 60000,
  })
  const [showPaywall, setShowPaywall] = useState(false)

  const isPremium = subStatus?.is_premium ?? false
  const resources = resourcesData?.results || []
  const totalXp = profile?.xp ?? 0
  const userLevel = profile?.level || { num: 1, name: 'Freshman' }
  const studyStreak = profile?.study_streak ?? 0
  const firstName = profile?.first_name || profile?.username || 'there'

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

  const playAudioChunk = useCallback((pcm: Float32Array) => {
    const ctx = playAudioCtxRef.current || new AudioContext()
    playAudioCtxRef.current = ctx

    const buffer = ctx.createBuffer(1, pcm.length, 24000)
    buffer.copyToChannel(pcm as any, 0)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current)
    source.start(startAt)
    nextPlayTimeRef.current = startAt + buffer.duration

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
      nextPlayTimeRef.current = 0
    }, (nextPlayTimeRef.current - ctx.currentTime) * 1000 + 500)
  }, [])

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

      // Attach network quality monitor
      const monitor = new NetworkQualityMonitor()
      netMonitorRef.current = monitor
      monitor.attach(ws)
      adaptiveSettingsRef.current = monitor.getSettings()
      setNetworkQuality(monitor.getQuality())

      monitor.onQualityChange((settings) => {
        adaptiveSettingsRef.current = settings
        setNetworkQuality(settings.quality)
        if (settings.quality === 'terrible') {
          toast.warning('Network is very slow. Audio quality reduced.', { duration: 5000 })
        }
      })

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

          // Update current AI subtitle for animated display
          if (role === 'ai') {
            setCurrentAiText(prev => prev + msg.text)
          } else {
            // User spoke — clear AI subtitle
            setCurrentAiText('')
            setDisplayedWords([])
          }

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

  const activateMicProcessor = async (stream: MediaStream) => {
    try {
      const ctx = new AudioContext({ sampleRate: 16000 })
      micAudioCtxRef.current = ctx

      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {})
      }

      // Load the noise gate AudioWorklet processor
      await ctx.audioWorklet.addModule('/noise-gate-processor.js')

      const source = ctx.createMediaStreamSource(stream)
      const workletNode = new AudioWorkletNode(ctx, 'noise-gate', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        processorOptions: {},
      })
      workletNodeRef.current = workletNode

      // Listen for VAD updates from the worklet
      workletNode.port.onmessage = (e) => {
        if (e.data?.type === 'vad') {
          // Could use isSpeech for UI indicators if needed
        }
      }

      workletNode.port.onmessage = (e) => {
        if (e.data?.type === 'audio') {
          // Binary audio output from worklet (if we add passthrough)
        }
      }

      // Connect: mic -> worklet (noise gate) -> silent output (prevent feedback)
      source.connect(workletNode)
      const silentGain = ctx.createGain()
      silentGain.gain.value = 0
      workletNode.connect(silentGain)
      silentGain.connect(ctx.destination)

      // Capture audio from the worklet's output port
      // The worklet passes through gated audio — we read it via a ScriptProcessorNode
      // that listens to the worklet output (smallest buffer for lowest latency)
      const captureNode = ctx.createScriptProcessor(1024, 1, 1)
      processorRef.current = captureNode

      // Connect worklet output to capture node (for encoding)
      workletNode.connect(captureNode)
      // Disconnect worklet from silent gain — captureNode will handle output
      workletNode.disconnect(silentGain)
      captureNode.connect(silentGain)

      captureNode.onaudioprocess = (e) => {
        const ws = wsRef.current
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        if (isMicMutedRef.current) return
        if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return }

        // Backpressure: skip frame if WebSocket buffer is too full
        const monitor = netMonitorRef.current
        if (monitor && monitor.isBackedUp()) return

        const float32 = e.inputBuffer.getChannelData(0).slice()
        const pcm16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
        }

        const bytes = new Uint8Array(pcm16.buffer)
        const settings = adaptiveSettingsRef.current

        // Send binary frame (33% smaller than base64 JSON)
        // Format: first 4 bytes = message type header, rest = PCM data
        // Header: 0x01 = audio, 0x02 = text (future)
        const header = new Uint8Array([0x01, 0x00, 0x00, 0x00])
        const frame = new Uint8Array(header.length + bytes.byteLength)
        frame.set(header, 0)
        frame.set(bytes, header.length)
        ws.send(frame)

        // Track for network quality
        if (monitor) monitor.trackSend(sendCounterRef.current++)
      }

      isMicMutedRef.current = false
      setIsRecording(true)
    } catch (e) {
      console.error('[PersonalTutor] AudioWorklet failed, falling back to ScriptProcessor:', e)
      // Fallback to ScriptProcessorNode if AudioWorklet fails
      activateMicProcessorFallback(stream)
    }
  }

  const activateMicProcessorFallback = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext({ sampleRate: 16000 })
      micAudioCtxRef.current = ctx

      if (ctx.state === 'suspended') ctx.resume().catch(() => {})

      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(1024, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const ws = wsRef.current
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        if (isMicMutedRef.current) return
        if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return }

        const monitor = netMonitorRef.current
        if (monitor && monitor.isBackedUp()) return

        const float32 = e.inputBuffer.getChannelData(0).slice()
        const pcm16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
        }
        const bytes = new Uint8Array(pcm16.buffer)
        const header = new Uint8Array([0x01, 0x00, 0x00, 0x00])
        const frame = new Uint8Array(header.length + bytes.byteLength)
        frame.set(header, 0)
        frame.set(bytes, header.length)
        ws.send(frame)
        if (monitor) monitor.trackSend(sendCounterRef.current++)
      }

      source.connect(processor)
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
    workletNodeRef.current?.disconnect()
    workletNodeRef.current = null
    if (micAudioCtxRef.current) {
      void micAudioCtxRef.current.close().catch(() => {})
      micAudioCtxRef.current = null
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    isMicMutedRef.current = true
    setIsRecording(false)
  }

  useEffect(() => {
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
      netMonitorRef.current?.detach()
      netMonitorRef.current = null
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

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#0a0014] via-[#050508] to-[#0a0014] text-white flex flex-col overflow-hidden select-none" style={{ paddingTop: 'env(safe-area-inset-top, 20px)' }}>

      {/* ── SETUP PHASE ── */}
      {phase === 'setup' && (
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div className="flex-1 flex flex-col px-5 sm:px-8 py-8 max-w-5xl mx-auto w-full">

            {/* Back link */}
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-8">
              <ChevronLeft className="w-4 h-4" /> Dashboard
            </Link>

            {!isPremium ? (
              /* ── Premium Gate ── */
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto">
                <div className="w-20 h-20 rounded-2xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center mx-auto">
                  <Headphones className="w-10 h-10 text-violet-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight mb-2">Personal Tutor</h1>
                  <p className="text-sm text-white/50 leading-relaxed max-w-xs mx-auto">
                    Real-time voice conversations with an AI that knows your study history and teaches you like a real tutor.
                  </p>
                </div>
                <div className="space-y-3 text-left w-full">
                  {['Personalised to your curriculum & materials', 'Full conversation memory across sessions', 'Voice & text — study hands-free'].map((f, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
                      <span className="text-xs text-white/60">{f}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowPaywall(true)}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 hover:brightness-110 text-white font-black text-sm uppercase tracking-wider active:scale-[0.98] transition-all shadow-lg shadow-violet-500/25"
                >
                  Unlock Personal Tutor
                </button>
                <p className="text-[11px] text-white/30">Requires Premium subscription</p>
              </div>
            ) : (
              <>
                {/* Desktop: two-column layout */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  {/* Left — Hero + Stats */}
                  <div className="space-y-6">
                    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-500 p-8 text-white shadow-2xl">
                      <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                      <div className="relative z-10 flex flex-col items-center text-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-black/25 backdrop-blur-md flex items-center justify-center border border-white/10">
                          <Headphones className="w-8 h-8" />
                        </div>
                        <div>
                          <h1 className="text-3xl font-black tracking-tight mb-2">Personal Tutor</h1>
                          <p className="text-white/80 text-sm leading-relaxed">
                            Real-time voice conversations with an AI that knows your study history.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 text-center">
                        <p className="text-[10px] uppercase font-black text-violet-400 tracking-wider mb-1">Streak</p>
                        <p className="text-2xl font-black">{studyStreak}</p>
                        <p className="text-[10px] text-white/30">days</p>
                      </div>
                      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 text-center">
                        <p className="text-[10px] uppercase font-black text-violet-400 tracking-wider mb-1">XP</p>
                        <p className="text-2xl font-black">{totalXp.toLocaleString()}</p>
                        <p className="text-[10px] text-white/30">earned</p>
                      </div>
                      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 text-center">
                        <p className="text-[10px] uppercase font-black text-violet-400 tracking-wider mb-1">Level</p>
                        <p className="text-2xl font-black">{userLevel.num}</p>
                        <p className="text-[10px] text-white/30">{userLevel.name}</p>
                      </div>
                    </div>
                  </div>

                  {/* Right — Voice Selector + Context + Start */}
                  <div className="space-y-6">
                    {/* Voice Selector */}
                    <div>
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">Choose Voice</p>
                      <div className="grid grid-cols-3 gap-2">
                        {GEMINI_VOICES.map(v => (
                          <button
                            key={v.id}
                            onClick={() => setVoice(v.id)}
                            className={cn(
                              "flex flex-col items-center gap-1 p-3 rounded-2xl border transition-all text-center",
                              voice === v.id
                                ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
                                : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                            )}
                          >
                            <span className="text-xs font-bold">{v.label}</span>
                            <span className="text-[9px] text-white/30">{v.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Context Preview */}
                    <div>
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">What I Know About You</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { icon: '📚', text: `${resources.length} materials loaded` },
                          { icon: '⚡', text: `${totalXp.toLocaleString()} XP` },
                          { icon: '🔥', text: `${studyStreak} day streak` },
                          { icon: '💬', text: 'Full memory' },
                        ].map((item, i) => (
                          <div key={i} className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <span className="text-sm">{item.icon}</span>
                            <span className="text-[11px] text-white/60">{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Start Button */}
                    <button
                      onClick={startSession}
                      disabled={isConnecting}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 hover:brightness-110 text-white font-black text-sm uppercase tracking-wider active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25"
                    >
                      {isConnecting ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Connecting...</>
                      ) : (
                        <><Play className="w-5 h-5 fill-white" /> Start Session</>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── SESSION PHASE ── */}
      {phase === 'session' && (
        <div className="flex-1 flex flex-col relative overflow-hidden">

          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 pt-8">
            <button onClick={endSession} className="p-2 rounded-xl bg-white/5 text-white/60 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              {/* Network quality indicator */}
              <div className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider",
                networkQuality === 'excellent' ? 'bg-emerald-500/15 text-emerald-400' :
                networkQuality === 'good' ? 'bg-green-500/15 text-green-400' :
                networkQuality === 'fair' ? 'bg-amber-500/15 text-amber-400' :
                networkQuality === 'poor' ? 'bg-orange-500/15 text-orange-400' :
                'bg-red-500/15 text-red-400'
              )}>
                {networkQuality === 'poor' || networkQuality === 'terrible' ? (
                  <WifiOff className="w-3 h-3" />
                ) : (
                  <Wifi className="w-3 h-3" />
                )}
                <span className="hidden sm:inline">{networkQuality}</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-bold text-white/60">{formatTime(sessionDuration)}</span>
            </div>
            <button onClick={() => setShowTranscript(!showTranscript)} className="p-2 rounded-xl bg-white/5 text-white/60 hover:text-white transition-colors">
              <MessageSquare className="w-5 h-5" />
            </button>
          </div>

          {/* Orb — takes remaining space */}
          <div className="flex-1 flex flex-col items-center justify-center px-5">
            {/* Pulse rings */}
            <div className="relative mb-8">
              <AnimatePresence>
                {isAiSpeaking && (
                  <>
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 2, opacity: 0.15 }}
                      exit={{ opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
                      className="absolute inset-0 w-40 h-40 rounded-full border-2 border-violet-500 -translate-x-[calc(50%-80px)] -translate-y-[calc(50%-80px)]"
                    />
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 2.5, opacity: 0.05 }}
                      exit={{ opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'easeOut', delay: 0.5 }}
                      className="absolute inset-0 w-40 h-40 rounded-full border border-violet-400 -translate-x-[calc(50%-80px)] -translate-y-[calc(50%-80px)]"
                    />
                  </>
                )}
              </AnimatePresence>

              {/* Main orb */}
              <motion.div
                animate={{
                  scale: isAiSpeaking ? [1, 1.1, 1] : isRecording && !isMicMuted ? [1, 1.04, 1] : 1,
                  boxShadow: isAiSpeaking
                    ? '0 0 50px rgba(139,92,246,0.4), 0 0 100px rgba(139,92,246,0.15)'
                    : isRecording && !isMicMuted
                    ? '0 0 30px rgba(139,92,246,0.2)'
                    : '0 0 20px rgba(139,92,246,0.05)',
                }}
                transition={{ repeat: Infinity, duration: isAiSpeaking ? 1.2 : 2.5, ease: 'easeInOut' }}
                className={cn(
                  "w-36 h-36 rounded-full flex items-center justify-center border-2 transition-all duration-500",
                  isAiSpeaking
                    ? "bg-violet-500/15 border-violet-500/50"
                    : isRecording && !isMicMuted
                    ? "bg-violet-500/8 border-violet-500/25"
                    : "bg-white/[0.03] border-white/[0.08]"
                )}
              >
                {isAiSpeaking ? (
                  <Volume2 className="w-14 h-14 text-violet-400 animate-pulse" />
                ) : isMicMuted ? (
                  <MicOff className="w-14 h-14 text-violet-500/40" />
                ) : (
                  <Mic className="w-14 h-14 text-violet-400" />
                )}
              </motion.div>
            </div>

            {/* Status */}
            <p className="text-sm font-black text-white uppercase tracking-widest mb-1">
              {isAiSpeaking ? 'Tutor Speaking' : isMicMuted ? 'Mic Muted' : 'Listening'}
            </p>
            <p className="text-xs text-white/30">
              {isAiSpeaking ? 'Speak to interrupt' : isMicMuted ? 'Tap to unmute' : 'Speak naturally'}
            </p>

            {/* Animated AI Subtitles */}
            <AnimatePresence>
              {displayedWords.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="mt-6 max-w-lg w-full"
                >
                  <div className={cn(
                    "relative px-6 py-4 rounded-2xl backdrop-blur-xl border transition-all duration-500",
                    isAiSpeaking
                      ? "bg-violet-500/10 border-violet-500/20 shadow-[0_0_30px_rgba(139,92,246,0.1)]"
                      : "bg-white/[0.03] border-white/[0.06]"
                  )}>
                    {/* Animated glow border */}
                    {isAiSpeaking && (
                      <motion.div
                        className="absolute inset-0 rounded-2xl border border-violet-400/30"
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                      />
                    )}

                    {/* Subtitle text with word-by-word animation — sliding window */}
                    <div className="relative z-10 text-center">
                      {(() => {
                        const totalWords = displayedWords.length
                        const visibleWords = totalWords > MAX_VISIBLE_WORDS
                          ? displayedWords.slice(totalWords - MAX_VISIBLE_WORDS)
                          : displayedWords
                        const offset = totalWords > MAX_VISIBLE_WORDS ? totalWords - MAX_VISIBLE_WORDS : 0
                        return visibleWords.map((word, i) => {
                          const globalIdx = offset + i
                          return (
                            <motion.span
                              key={`${globalIdx}-${word}`}
                              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                              transition={{ duration: 0.3, ease: 'easeOut' }}
                              className={cn(
                                "inline-block text-[15px] sm:text-[17px] leading-relaxed font-medium mr-[0.4em]",
                                globalIdx === totalWords - 1 && isAiSpeaking
                                  ? "text-violet-300"
                                  : "text-white/80"
                              )}
                            >
                              {word}
                            </motion.span>
                          )
                        })
                      })()}

                      {/* Blinking cursor while speaking */}
                      {isAiSpeaking && (
                        <motion.span
                          animate={{ opacity: [1, 0, 1] }}
                          transition={{ repeat: Infinity, duration: 0.8 }}
                          className="inline-block w-[2px] h-[1em] bg-violet-400 ml-0.5 align-text-bottom"
                        />
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom controls */}
          <div className="px-5 pb-8 pt-4 flex items-center gap-3" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}>
            <button
              onClick={() => setIsMicMuted(v => !v)}
              className={cn(
                "flex-1 py-4 rounded-2xl border-2 font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                isMicMuted
                  ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
                  : "bg-white/5 border-white/[0.08] text-white/70"
              )}
            >
              {isMicMuted ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              {isMicMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              onClick={endSession}
              className="px-8 py-4 rounded-2xl bg-white text-black font-black text-sm uppercase tracking-wider hover:bg-zinc-200 active:scale-95 transition-all"
            >
              End
            </button>
          </div>

          {/* Transcript drawer (mobile slide-up) */}
          <AnimatePresence>
            {showTranscript && (
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-50 bg-[#0c0c10] rounded-t-3xl border-t border-white/[0.06] max-h-[70vh] flex flex-col"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                  <span className="text-xs font-black text-white/50 uppercase tracking-widest">Transcript</span>
                  <button onClick={() => setShowTranscript(false)} className="p-1.5 rounded-lg bg-white/5 text-white/50">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {transcript.length === 0 ? (
                    <div className="text-center py-12">
                      <Sparkles className="w-8 h-8 text-violet-500/20 mx-auto mb-3 animate-pulse" />
                      <p className="text-xs text-white/30">Waiting for conversation...</p>
                    </div>
                  ) : (
                    transcript.map((t, idx) => (
                      <div key={idx} className={cn("flex flex-col", t.role === 'user' ? "items-end" : "items-start")}>
                        <span className="text-[9px] text-white/30 uppercase font-bold tracking-wider mb-1">
                          {t.role === 'user' ? 'You' : 'Tutor'}
                        </span>
                        <div className={cn(
                          "px-4 py-2.5 rounded-2xl text-xs max-w-[85%] leading-relaxed",
                          t.role === 'user'
                            ? "bg-violet-500/15 border border-violet-500/20 text-violet-100"
                            : "bg-white/[0.03] border border-white/[0.06] text-white/70"
                        )}>
                          {t.text}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={transcriptEndRef} />
                </div>
                <div className="p-4 border-t border-white/[0.06] flex items-center gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendTextMessage() }}
                    placeholder="Type a message..."
                    className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/30"
                  />
                  <button
                    onClick={sendTextMessage}
                    disabled={!textInput.trim()}
                    className="p-3 rounded-xl bg-violet-500 text-white disabled:opacity-20 disabled:pointer-events-none"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── REPORT PHASE ── */}
      {phase === 'report' && report && (
        <div className="flex-1 flex flex-col px-5 sm:px-8 pt-10 pb-10 max-w-2xl mx-auto w-full overflow-y-auto">
          <div className="text-center mb-6">
            <Award className="w-16 h-16 text-violet-400 mx-auto mb-3 animate-bounce" />
            <h1 className="text-3xl font-black tracking-tight mb-1">Session Complete</h1>
            <p className="text-[11px] text-white/40 uppercase tracking-widest">Evaluation & Next Steps</p>
          </div>

          {/* Score */}
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-black text-white/50 uppercase tracking-wider">Focus Score</span>
              <span className="text-3xl font-black text-violet-400">{report.score}/100</span>
            </div>
            <div className="w-full h-3 bg-white/[0.05] rounded-full overflow-hidden mb-4">
              <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full" style={{ width: `${report.score}%` }} />
            </div>
            <p className="text-[13px] text-white/50 leading-relaxed">{report.summary}</p>
          </div>

          {/* Strengths & Gaps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Strengths
              </h4>
              <ul className="space-y-2">
                {(report.strengths || []).map((s, i) => (
                  <li key={i} className="text-[13px] text-white/60 leading-relaxed flex gap-2">
                    <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" /> Gaps
              </h4>
              <ul className="space-y-2">
                {(report.gaps || []).map((g, i) => (
                  <li key={i} className="text-[13px] text-white/60 leading-relaxed flex gap-2">
                    <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Advice */}
          <div className="p-5 rounded-2xl bg-violet-500/[0.04] border border-violet-500/10 mb-8">
            <h4 className="text-xs font-black text-violet-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Tutor Advice
            </h4>
            <p className="text-[13px] text-white/60 leading-relaxed">{report.recommendation}</p>
          </div>

          <button
            onClick={() => { setPhase('setup'); setReport(null) }}
            className="w-full py-4 rounded-2xl bg-white text-black font-black text-sm uppercase tracking-wider hover:bg-zinc-200 active:scale-[0.98] transition-all"
          >
            Start New Session
          </button>
        </div>
      )}

      {/* ── ENDING OVERLAY ── */}
      <AnimatePresence>
        {isEndingSession && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <div className="text-center space-y-3">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin mx-auto" />
              <p className="text-xs font-bold text-white uppercase tracking-wider">Generating Report...</p>
            </div>
          </div>
        )}
      </AnimatePresence>

      {showPaywall && subStatus && (
        <PaywallModal
          onClose={() => setShowPaywall(false)}
          notesUsed={subStatus.notes_used}
          notesLimit={subStatus.notes_limit}
          onSuccess={() => { refetchSub(); setShowPaywall(false) }}
        />
      )}
    </div>
  )
}
