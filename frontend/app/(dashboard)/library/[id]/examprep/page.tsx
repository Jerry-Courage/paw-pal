'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, getAuthToken, API_BASE } from '@/lib/api'
import {
  ArrowLeft, Mic, MicOff, Square, Brain, Zap,
  MessageSquare, CheckCircle2, XCircle, AlertCircle,
  ChevronRight, RotateCcw, Loader2, Volume2
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────
type Technique = 'feynman' | 'active_recall' | 'socratic'
type Phase = 'setup' | 'session' | 'report' | 'exam'
type TranscriptEntry = { role: 'user' | 'ai'; text: string; ts: number }

interface SessionReport {
  summary: string
  strengths: string[]
  gaps: string[]
  score: number
  recommendation: string
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
]

// ── Audio helpers ─────────────────────────────────────────────────────────────
// Downsample Float32 audio to 16kHz PCM Int16
function downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate = 16000): Int16Array {
  if (inputRate === outputRate) {
    const out = new Int16Array(buffer.length)
    for (let i = 0; i < buffer.length; i++) {
      out[i] = Math.max(-32768, Math.min(32767, buffer[i] * 32768))
    }
    return out
  }
  const ratio = inputRate / outputRate
  const outLen = Math.round(buffer.length / ratio)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const idx = Math.round(i * ratio)
    out[i] = Math.max(-32768, Math.min(32767, buffer[Math.min(idx, buffer.length - 1)] * 32768))
  }
  return out
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToPcm(b64: string): Float32Array {
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
  const [phase, setPhase] = useState<Phase>('setup')
  const [technique, setTechnique] = useState<Technique>('feynman')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [report, setReport] = useState<SessionReport | null>(null)
  const [sessionDuration, setSessionDuration] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioQueueRef = useRef<Float32Array[]>([])
  const isPlayingRef = useRef(false)
  const timerRef = useRef<any>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

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

  // ── Play AI audio ──────────────────────────────────────────────────────────
  const playAudioChunk = useCallback((pcm: Float32Array) => {
    audioQueueRef.current.push(pcm)
    if (!isPlayingRef.current) processAudioQueue()
  }, [])

  const processAudioQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      setIsAiSpeaking(false)
      return
    }
    isPlayingRef.current = true
    setIsAiSpeaking(true)
    const ctx = audioCtxRef.current || new AudioContext({ sampleRate: 24000 })
    audioCtxRef.current = ctx
    const chunk = audioQueueRef.current.shift()!
    const buffer = ctx.createBuffer(1, chunk.length, 24000)
    buffer.copyToChannel(chunk, 0)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.onended = processAudioQueue
    source.start()
  }, [])

  // ── Connect WebSocket ──────────────────────────────────────────────────────
  const startSession = async () => {
    if (!resource) return
    setIsConnecting(true)

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
        }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        if (msg.type === 'ready') {
          setIsConnecting(false)
          setPhase('session')
          startMic()
        } else if (msg.type === 'audio') {
          const pcm = base64ToPcm(msg.data)
          playAudioChunk(pcm)
        } else if (msg.type === 'transcript_user') {
          setTranscript(prev => [...prev, { role: 'user', text: msg.text, ts: Date.now() }])
        } else if (msg.type === 'transcript_ai') {
          setTranscript(prev => [...prev, { role: 'ai', text: msg.text, ts: Date.now() }])
        } else if (msg.type === 'session_report') {
          setReport(msg.report)
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
  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        const float32 = e.inputBuffer.getChannelData(0)
        const pcm16 = downsampleBuffer(float32, ctx.sampleRate, 16000)
        const b64 = int16ToBase64(pcm16)
        wsRef.current.send(JSON.stringify({ type: 'audio', data: b64 }))
      }

      source.connect(processor)
      processor.connect(ctx.destination)
      setIsRecording(true)
    } catch (e) {
      toast.error('Microphone access denied')
    }
  }

  const stopMic = () => {
    processorRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())
    setIsRecording(false)
  }

  const endSession = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_session' }))
    }
    stopMic()
    clearInterval(timerRef.current)
  }

  const resetSession = () => {
    wsRef.current?.close()
    stopMic()
    setPhase('setup')
    setTranscript([])
    setReport(null)
    setSessionDuration(0)
    audioQueueRef.current = []
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────

  // Setup phase
  if (phase === 'setup') return (
    <div className="fixed inset-0 top-14 bg-[#0d0d0d] flex flex-col overflow-hidden">
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
    <div className="fixed inset-0 top-14 bg-[#0d0d0d] flex flex-col overflow-hidden">
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
        <button onClick={endSession}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black hover:bg-red-500/15 transition-all">
          <Square className="w-3.5 h-3.5 fill-current" /> End Session
        </button>
      </div>

      {/* AI speaking indicator */}
      {isAiSpeaking && (
        <div className="flex items-center gap-2 px-5 py-2 bg-violet-500/8 border-b border-violet-500/15 shrink-0">
          <Volume2 className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
          <span className="text-xs text-violet-400 font-medium">AI is speaking...</span>
          <div className="flex gap-0.5 ml-1">
            {[0,1,2,3].map(i => (
              <div key={i} className="w-0.5 bg-violet-400 rounded-full animate-bounce"
                style={{ height: `${8 + (i % 3) * 4}px`, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-hide">
        {transcript.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center animate-pulse">
              <Mic className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="text-white font-black text-lg">You're live</p>
              <p className="text-slate-500 text-sm mt-1">Start speaking about the material</p>
            </div>
          </div>
        ) : (
          transcript.map((entry, i) => (
            <div key={i} className={cn('flex gap-3', entry.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5',
                entry.role === 'user' ? 'bg-orange-500 text-white' : 'bg-violet-600 text-white'
              )}>
                {entry.role === 'user' ? 'ME' : 'AI'}
              </div>
              <div className={cn(
                'max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                entry.role === 'user'
                  ? 'bg-[#1e1e1e] border border-white/8 text-slate-100 rounded-tr-sm'
                  : 'bg-violet-500/10 border border-violet-500/20 text-violet-100 rounded-tl-sm'
              )}>
                {entry.text}
              </div>
            </div>
          ))
        )}
        <div ref={transcriptEndRef} />
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
    <div className="fixed inset-0 top-14 bg-[#0d0d0d] flex flex-col overflow-hidden">
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

  // Exam phase — coming soon placeholder (will be built next)
  if (phase === 'exam') return (
    <div className="fixed inset-0 top-14 bg-[#0d0d0d] flex flex-col items-center justify-center gap-5 px-6">
      <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] flex items-center justify-center">
        <Zap className="w-8 h-8 text-orange-400" />
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-black text-white">Timed Exam</h2>
        <p className="text-slate-500 mt-2 text-sm">Coming in the next update — mixed MCQ + written questions with a timer.</p>
      </div>
      <button onClick={() => setPhase('report')}
        className="px-6 py-3 rounded-2xl bg-white/5 border border-white/8 text-white font-black text-sm hover:bg-white/8 transition-all">
        ← Back to Report
      </button>
    </div>
  )

  return null
}
