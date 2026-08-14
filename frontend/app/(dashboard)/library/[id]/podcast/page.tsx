'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, podcastApi, getAuthToken, API_BASE } from '@/lib/api'
import { useAudio } from '@/context/AudioContext'
import {
  ArrowLeft, Play, Pause, Loader2,
  Image as ImageIcon, Hand, Radio, XCircle, X,
  SkipBack, SkipForward, Mic, MicOff, ChevronRight, MessageSquare,
  Volume2
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useStudyTimer } from '@/hooks/useStudyTimer'

const VOICES_A = ['Aoede', 'Puck', 'Kore', 'Charon', 'Fenrir', 'Leda', 'Zephyr', 'Autonoe', 'Ava', 'Christopher', 'Brian', 'Guy']
const VOICES_B = ['Andrew', 'Ava', 'Aoede', 'Puck', 'Kore', 'Charon', 'Fenrir', 'Leda', 'Zephyr', 'Autonoe', 'Emma', 'Jenny', 'Aria']

export default function PodcastPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  useStudyTimer(true)

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  const [status, setStatus] = useState<'checking' | 'idle' | 'generating' | 'ready' | 'error'>('checking')
  const [voiceA, setVoiceA] = useState('Ava')
  const [voiceB, setVoiceB] = useState('Andrew')
  const [visuals, setVisuals] = useState<any[]>([])
  const [interjectionUrls, setInterjectionUrls] = useState<Record<string, string>>({})
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isHandRaised, setIsHandRaised] = useState(false)
  const [isAcknowledging, setIsAcknowledging] = useState(false)
  const [isAnswering, setIsAnswering] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const [mobileTab, setMobileTab] = useState<'player' | 'transcript'>('player')
  // Live Q&A state
  const [liveMode, setLiveMode] = useState<'off' | 'connecting' | 'active'>('off')
  const [liveAiSpeaking, setLiveAiSpeaking] = useState(false)
  const [liveMicAvailable, setLiveMicAvailable] = useState(true)
  const [liveTextInput, setLiveTextInput] = useState('')
  const [liveSendingText, setLiveSendingText] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState<{role:'user'|'ai',text:string,ts:number}[]>([])
  const liveWsRef = useRef<WebSocket | null>(null)
  const liveMicProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const liveMicStreamRef = useRef<MediaStream | null>(null)
  const livePlayCtxRef = useRef<AudioContext | null>(null)   // playback only
  const liveAudioCtxRef = livePlayCtxRef                    // alias used by playLiveAudio
  const liveMicCtxRef = useRef<AudioContext | null>(null)    // mic capture only
  const liveNextPlayRef = useRef(0)
  const liveSpeakTimeoutRef = useRef<any>(null)
  const liveMicMutedRef = useRef(false)
  const liveActiveSourcesRef = useRef<AudioBufferSourceNode[]>([])

  const { state: audio, startPodcast, pause: globalPause, resume: globalResume,
    updateScript, setCurrentIndex, setPlaybackRate, stop: globalStop } = useAudio()

  const hasLoadedSession = useRef(false)

  useEffect(() => {
    libraryApi.getResource(resourceId).then(res => {
      setVisuals(res.data.extracted_images || [])
    })
    if (hasLoadedSession.current) return
    hasLoadedSession.current = true
    if (audio.activeResourceId === resourceId && audio.sessionId) {
      setStatus(audio.script?.length ? 'ready' : 'generating')
      podcastApi.getStatus(audio.sessionId).then(res => {
        if (res.data.interjection_urls) setInterjectionUrls(res.data.interjection_urls)
      })
      return
    }
    podcastApi.getExistingSession(resourceId).then(res => {
      const data = res.data
      if (!data.exists) {
        setStatus('idle')  // nothing found — show setup screen
        return
      }
      if (data.script?.length) {
        libraryApi.getResource(resourceId).then(r => {
          startPodcast(resourceId, r.data.title || '', data.session_id, data.script)
        }).catch(() => startPodcast(resourceId, '', data.session_id, data.script))
        setStatus('ready')
        podcastApi.getStatus(data.session_id).then(r => {
          if (r.data.interjection_urls) setInterjectionUrls(r.data.interjection_urls)
        }).catch(() => {})
      } else {
        // Session exists but still generating — attach to it and poll
        libraryApi.getResource(resourceId).then(r => {
          startPodcast(resourceId, r.data.title || '', data.session_id, [])
        }).catch(() => startPodcast(resourceId, '', data.session_id, []))
        setStatus('generating')
      }
    }).catch(() => setStatus('idle'))  // on error drop to setup
  }, [resourceId])

  // Polling — works off local sessionId ref so it doesn't depend on AudioContext timing
  const pollingSessionId = audio.sessionId

  useEffect(() => {
    const shouldPoll = status === 'generating' || (status === 'ready' && pollingSessionId && audio.totalChunks === 0)
    if (!shouldPoll || !pollingSessionId) return
    const interval = setInterval(async () => {
      try {
        const res = await podcastApi.getStatus(pollingSessionId)
        if (res.data.script?.length) {
          updateScript(res.data.script, res.data.chunks_total)
          setStatus('ready')
        }
        if (res.data.status === 'ready' && res.data.script?.length) clearInterval(interval)
        else if (res.data.status === 'error') { setStatus('error'); clearInterval(interval) }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [status, pollingSessionId, updateScript, audio.totalChunks])

  // Timeout — if generating for more than 3 min with no result, show error
  useEffect(() => {
    if (status !== 'generating') return
    const t = setTimeout(() => setStatus('error'), 3 * 60 * 1000)
    return () => clearTimeout(t)
  }, [status])
  useEffect(() => {
    if (transcriptRef.current) {
      const active = transcriptRef.current.querySelector('[data-active="true"]')
      active?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [audio.currentIndex])

  const currentChunk = audio.script?.[audio.currentIndex] ?? null
  const activeVisual = visuals.find(v => v.id && currentChunk?.visual_ref && String(v.id) === String(currentChunk.visual_ref))
  const currentImage = activeVisual?.image || currentChunk?.visual_url || null
  const speakerName = currentChunk?.speaker === 'A' ? voiceA : voiceB

  // Pre-warm AudioContext on mount so first AI audio plays with zero delay
  useEffect(() => {
    const ctx = new AudioContext()
    liveAudioCtxRef.current = ctx
    // Resume immediately — browsers suspend AudioContext until a user gesture,
    // but we're already inside one (the button click that started the session)
    return () => { ctx.close() }
  }, [])

  const playLiveAudio = useCallback((b64: string) => {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const int16 = new Int16Array(bytes.buffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768
    const ctx = liveAudioCtxRef.current!
    if (ctx.state === 'suspended') ctx.resume()
    const buf = ctx.createBuffer(1, float32.length, 24000)
    buf.copyToChannel(float32, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const startAt = Math.max(ctx.currentTime, liveNextPlayRef.current)
    src.start(startAt)
    liveNextPlayRef.current = startAt + buf.duration
    liveActiveSourcesRef.current.push(src)
    src.onended = () => {
      liveActiveSourcesRef.current = liveActiveSourcesRef.current.filter(s => s !== src)
    }
    setLiveAiSpeaking(true)
    clearTimeout(liveSpeakTimeoutRef.current)
    liveSpeakTimeoutRef.current = setTimeout(() => setLiveAiSpeaking(false),
      (liveNextPlayRef.current - ctx.currentTime) * 1000 + 300)
  }, [])

  const startLiveMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 16000 },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      liveMicStreamRef.current = stream

      // Use a fresh AudioContext — don't share with playback
      const micCtx = new AudioContext()
      liveMicCtxRef.current = micCtx
      if (micCtx.state === 'suspended') await micCtx.resume()

      const source = micCtx.createMediaStreamSource(stream)
      const processor = micCtx.createScriptProcessor(1024, 1, 1)
      liveMicProcessorRef.current = processor

      processor.onaudioprocess = async (e) => {
        if (liveMicMutedRef.current) return
        if (!liveWsRef.current || liveWsRef.current.readyState !== WebSocket.OPEN) return
        const float32 = e.inputBuffer.getChannelData(0).slice()
        // Resample to 16kHz
        const ratio = micCtx.sampleRate / 16000
        const outLen = Math.round(float32.length / ratio)
        const out = new Int16Array(outLen)
        for (let i = 0; i < outLen; i++) {
          const idx = Math.min(Math.round(i * ratio), float32.length - 1)
          out[i] = Math.max(-32768, Math.min(32767, float32[idx] * 32768))
        }
        const bytes = new Uint8Array(out.buffer)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        liveWsRef.current.send(JSON.stringify({ type: 'audio', data: btoa(binary) }))
      }

      source.connect(processor)
      processor.connect(micCtx.destination)
      setLiveMicAvailable(true)
      liveMicMutedRef.current = false
      setIsRecording(true)
    } catch {
      setLiveMicAvailable(false)
      toast.error('Mic unavailable — text-only mode is active.', { duration: 4000 })
    }
  }

  const flushAudioPlayout = useCallback(() => {
    // Immediately stop all queued AI audio — used when AI is interrupted
    liveActiveSourcesRef.current.forEach(src => { try { src.stop() } catch {} })
    liveActiveSourcesRef.current = []
    if (liveAudioCtxRef.current) liveNextPlayRef.current = liveAudioCtxRef.current.currentTime
    clearTimeout(liveSpeakTimeoutRef.current)
    setLiveAiSpeaking(false)
  }, [])

  const stopLiveMic = () => {
    liveMicProcessorRef.current?.disconnect()
    liveMicProcessorRef.current = null
    liveMicStreamRef.current?.getTracks().forEach(t => t.stop())
    liveMicStreamRef.current = null
    liveMicCtxRef.current?.close().catch(() => {})
    liveMicCtxRef.current = null
    liveMicMutedRef.current = true
    setIsRecording(false)
  }

  const sendLiveTextMessage = async () => {
    const text = liveTextInput.trim()
    if (!text || !liveWsRef.current || liveWsRef.current.readyState !== WebSocket.OPEN) return
    setLiveSendingText(true)
    try {
      setLiveTranscript(prev => [...prev, { role: 'user', text, ts: Date.now() }])
      liveWsRef.current.send(JSON.stringify({ type: 'text_message', text }))
      setLiveTextInput('')
    } catch { toast.error('Could not send message.') }
    finally { setLiveSendingText(false) }
  }

  const startLiveQA = async () => {
    if (!resource) return
    setLiveMode('connecting')
    globalPause()
    try {
      const token = await getAuthToken()
      const backendHost = (API_BASE || '').replace(/^https?:\/\//, '').replace(/\/api$/, '')
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${backendHost}/ws/examprep/${resourceId}/?token=${token}`
      const ws = new WebSocket(wsUrl)
      liveWsRef.current = ws
      ws.onopen = () => {
        const kit = resource.ai_notes_json || {}
        const context = (kit.sections || []).slice(0, 8)
          .map((s: any) => `${s.title}: ${s.content?.slice(0, 200)}`).join('\n\n')
        ws.send(JSON.stringify({ type: 'start', technique: 'podcast_qa',
          resource_title: resource.title, resource_context: context }))
      }
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'ready') { setLiveMode('active'); void startLiveMic() }
        else if (msg.type === 'status') { toast.info(msg.message, { duration: 4000 }) }
        else if (msg.type === 'audio') { playLiveAudio(msg.data) }
        else if (msg.type === 'interrupted') { flushAudioPlayout() }
        else if (msg.type === 'transcript_user' || msg.type === 'transcript_ai') {
          const role = msg.type === 'transcript_user' ? 'user' : 'ai'
          // Strip any leaked markdown thinking text (e.g. **Initiating Learning Session**)
          const clean = (msg.text || '').replace(/\*\*[^*]+\*\*/g, '').replace(/\n+/g, ' ').trim()
          if (!clean) return
          setLiveTranscript(prev => {
            if (!prev.length) return [{ role, text: clean, ts: Date.now() }]
            const last = prev[prev.length - 1]
            if (last.role === role && Date.now() - last.ts < 2000)
              return [...prev.slice(0, -1), { ...last, text: last.text + ' ' + clean, ts: Date.now() }]
            return [...prev, { role, text: clean, ts: Date.now() }]
          })
        } else if (msg.type === 'error') { toast.error(msg.message); endLiveQA() }
      }
      ws.onerror = () => { toast.error('Live connection failed'); endLiveQA() }
      ws.onclose  = () => { stopLiveMic() }
    } catch { toast.error('Failed to start live Q&A'); setLiveMode('off'); globalResume() }
  }

  const endLiveQA = () => {
    if (liveWsRef.current?.readyState === WebSocket.OPEN)
      liveWsRef.current.send(JSON.stringify({ type: 'end_session' }))
    liveWsRef.current?.close()
    stopLiveMic()
    flushAudioPlayout()
    setLiveMode('off'); setLiveMicAvailable(true); setLiveTranscript([])
    setLiveTextInput(''); liveNextPlayRef.current = 0; liveMicMutedRef.current = false
    clearTimeout(liveSpeakTimeoutRef.current)
    setTimeout(() => globalResume(), 800)
  }

  const handleStart = async () => {
    try {
      setStatus('generating')
      const res = await podcastApi.createSession(resourceId, voiceA, voiceB, 15)
      const resObj = await libraryApi.getResource(resourceId)
      startPodcast(resourceId, resObj.data.title, res.data.session_id, res.data.script)
      setStatus('ready')
      if (res.data.status === 'ready') setTimeout(() => globalResume(), 300)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to start podcast'
      toast.error(msg)
      setStatus('error')
    }
  }

  const togglePlay = () => audio.isPlaying ? globalPause() : globalResume()

  const handleInterrupt = async () => {
    if (!audio.sessionId) return
    if (isRecording) { mediaRecorderRef.current?.stop(); return }
    setIsHandRaised(true)
    setTimeout(() => setIsHandRaised(false), 3000)
    globalPause()
    const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
        mediaRecorderRef.current = mr; audioChunksRef.current = []
        mr.ondataavailable = e => audioChunksRef.current.push(e.data)
        mr.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          stream.getTracks().forEach(t => t.stop())
          setIsRecording(false)
          toast.loading('Hosts are thinking...', { id: 'answering' })
          try {
            setIsAnswering(true)
            const res = await podcastApi.interrupt(audio.sessionId!, blob, audio.currentIndex)
            updateScript(res.data.script, res.data.new_total)
            toast.dismiss('answering'); setIsAnswering(false)
            setCurrentIndex(audio.currentIndex + 1)
          } catch { toast.dismiss('answering'); setIsAnswering(false); globalResume() }
        }
        mr.start(); setIsRecording(true)
      } catch {}
    }
    const introUrl = interjectionUrls[currentChunk?.speaker || 'A']
    if (introUrl) {
      const a = new Audio(introUrl); setIsAcknowledging(true)
      a.onended = () => { setIsAcknowledging(false); startRecording() }
      a.play().catch(() => { setIsAcknowledging(false); startRecording() })
    } else { startRecording() }
  }

  // ── Checking for existing session ───────────────────────────────
  if (status === 'checking') return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 shrink-0">
        <Link href={`/library/${resourceId}`}
          className="p-2 rounded-[1rem] bg-white/5 hover:bg-white/10 border border-white/8 transition-all">
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <Radio className="w-8 h-8 text-orange-500 animate-pulse" />
          <p className="text-slate-500 text-sm">Loading your podcast…</p>
        </div>
      </div>
    </div>
  )

  // ── Setup screen ─────────────────────────────────────────────────
  if (status === 'idle') return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 shrink-0 tool-header-safe">
        <Link href={`/library/${resourceId}`}
          className="p-2 rounded-[1rem] bg-white/5 hover:bg-white/10 border border-white/8 transition-all">
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 bg-orange-500/10 border border-orange-500/20 rounded-[1.75rem] flex items-center justify-center">
              <Radio className="w-9 h-9 text-orange-500" />
            </div>
            <div>
              <p className="text-[11px] font-black text-orange-500 uppercase tracking-widest mb-1">FlowCast AI</p>
              <h2 className="text-2xl font-black text-white tracking-tight">{resource?.title || 'Your Material'}</h2>
              <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                Two AI hosts deep-dive your material in a podcast. Raise your hand to ask questions live.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Host A', value: voiceA, set: setVoiceA, options: VOICES_A, color: 'text-indigo-400' },
              { label: 'Host B', value: voiceB, set: setVoiceB, options: VOICES_B, color: 'text-orange-400' },
            ].map(({ label, value, set, options, color }) => (
              <div key={label}>
                <label className={cn('text-[10px] font-black uppercase tracking-widest mb-2 block', color)}>{label}</label>
                <select value={value} onChange={e => set(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-white/8 text-white p-3 rounded-xl text-sm appearance-none cursor-pointer focus:outline-none focus:border-orange-500/40">
                  {options.map(v => <option key={v} value={v} className="bg-[#1a1a1a]">{v}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button onClick={handleStart}
            className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 active:scale-[0.98] transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2.5">
            <Radio className="w-4 h-4" /> Start Podcast
          </button>
        </div>
      </div>
    </div>
  )

  // ── Generating ───────────────────────────────────────────────────
  if (status === 'generating') return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 shrink-0 tool-header-safe">
        <Link href={`/library/${resourceId}`}
          className="p-2 rounded-[1rem] bg-white/5 hover:bg-white/10 border border-white/8 transition-all">
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center max-w-xs px-6">
          <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Scripting Session</h2>
            <p className="text-slate-500 mt-1.5 text-sm">The AI hosts are writing the script…</p>
          </div>
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  // ── Error ────────────────────────────────────────────────────────
  if (status === 'error') return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 shrink-0 tool-header-safe">
        <Link href={`/library/${resourceId}`}
          className="p-2 rounded-[1rem] bg-white/5 hover:bg-white/10 border border-white/8 transition-all">
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 text-center px-6">
          <XCircle className="w-12 h-12 text-red-500" />
          <h2 className="text-xl font-black text-white">Generation Failed</h2>
          <p className="text-sm text-slate-500 max-w-xs">The podcast script couldn't be generated. This can happen if the material is still being processed or if the AI service is temporarily unavailable.</p>
          <div className="flex gap-3">
            <button onClick={() => setStatus('idle')}
              className="px-6 py-3 bg-white/5 border border-white/10 text-white font-black text-sm rounded-2xl hover:bg-white/10 transition-all">
              Back to Setup
            </button>
            <button onClick={handleStart}
              className="px-6 py-3 bg-orange-500 text-white font-black text-sm rounded-2xl hover:bg-orange-400 transition-all">
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Player ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex flex-col overflow-hidden">

      {/* ── TOP HEADER — back button only ─────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-5 py-4 pointer-events-none tool-header-safe">
        <div className="pointer-events-auto flex items-center gap-3">
          <Link href={`/library/${resourceId}`}
            className="p-2 rounded-[1rem] bg-[#1a1a1a]/90 backdrop-blur-sm border border-white/8 text-slate-400 hover:text-white hover:bg-white/10 transition-all">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="bg-[#1a1a1a]/90 backdrop-blur-sm border border-white/8 rounded-[1rem] px-4 py-2">
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest leading-none mb-0.5">FlowCast AI</p>
            <p className="text-[13px] font-bold text-white leading-tight truncate max-w-[200px] sm:max-w-sm">{resource?.title || '…'}</p>
          </div>
        </div>
        {/* On Air badge + Regenerate button */}
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            onClick={() => {
              globalStop()
              setStatus('idle')
            }}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] flex items-center gap-1.5 backdrop-blur-md transition-all">
            <span>Regenerate</span>
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">On Air</span>
          </div>
        </div>
      </header>

      {/* ── MOBILE TAB BAR ─────────────────────────────────────────── */}
      <div className="flex lg:hidden pt-[68px] border-b border-white/5 shrink-0 bg-[#0d0d0d]">
        {(['player', 'transcript'] as const).map(tab => (
          <button key={tab} onClick={() => setMobileTab(tab)}
            className={cn('flex-1 py-3 text-[12px] font-black uppercase tracking-widest transition-all',
              mobileTab === tab ? 'text-orange-400 border-b-2 border-orange-500' : 'text-slate-600')}>
            {tab === 'player' ? 'Player' : 'Transcript'}
          </button>
        ))}
      </div>

      {/* ── MAIN BODY ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden lg:pt-[68px] pb-[140px]">

        {/* LEFT COLUMN — album art card (always visible on lg, tab-gated on mobile) */}
        <div className={cn('lg:w-[42%] shrink-0 flex flex-col items-center justify-center p-6 lg:p-8 gap-5',
          'lg:flex', mobileTab === 'player' ? 'flex' : 'hidden')}>

          {/* Album art */}
          <div
            className="relative w-full max-w-[320px] aspect-square rounded-[2rem] overflow-hidden bg-[#111] border border-white/8 shadow-2xl cursor-pointer group"
            onClick={() => currentImage && setEnlargedImage(currentImage)}
          >
            {currentImage ? (
              <>
                <img src={currentImage} key={audio.currentIndex}
                  className="w-full h-full object-cover transition-opacity duration-700" alt="Visual" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 opacity-20">
                <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <Radio className="w-8 h-8 text-orange-400" />
                </div>
                <p className="text-xs text-slate-500 font-bold">Visual will appear here</p>
              </div>
            )}
            {/* Now playing badge */}
            <div className="absolute bottom-4 left-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-full border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Now Playing</span>
              </div>
            </div>
            {/* Hand raised overlay */}
            {isHandRaised && (
              <div className="absolute inset-0 flex items-center justify-center bg-orange-500/20 backdrop-blur-sm">
                <Hand className="w-16 h-16 text-white animate-bounce" />
              </div>
            )}
          </div>

          {/* Title + hosts */}
          <div className="text-center max-w-[320px] w-full">
            <h2 className="text-[20px] font-black text-white leading-tight truncate">{resource?.title || 'FlowCast Session'}</h2>
            <p className="text-[13px] text-slate-500 mt-1">
              With Hosts: {voiceA} &amp; {voiceB}
            </p>
          </div>

          {/* Seek bar */}
          <div className="w-full max-w-[320px] space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-slate-600 w-6 text-right">{audio.currentIndex + 1}</span>
              <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${audio.totalChunks > 0 ? ((audio.currentIndex + 1) / audio.totalChunks) * 100 : 0}%` }} />
              </div>
              <span className="text-[11px] font-bold text-slate-600 w-6">{audio.totalChunks || '?'}</span>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-5 max-w-[320px] w-full justify-center">
            <button
              onClick={() => audio.currentIndex > 0 && setCurrentIndex(audio.currentIndex - 1)}
              disabled={audio.currentIndex === 0}
              className="p-2 rounded-full text-slate-500 hover:text-white transition-all disabled:opacity-20">
              <SkipBack className="w-5 h-5" />
            </button>
            <button onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-2xl shadow-orange-500/30 hover:bg-orange-400 hover:scale-105 transition-all">
              {!audio.isChunkLoaded && !audio.isPlaying
                ? <Loader2 className="w-6 h-6 animate-spin" />
                : audio.isPlaying
                ? <Pause className="w-6 h-6 fill-current" />
                : <Play className="w-6 h-6 fill-current ml-0.5" />}
            </button>
            <button
              onClick={() => audio.currentIndex < (audio.totalChunks - 1) && setCurrentIndex(audio.currentIndex + 1)}
              disabled={audio.currentIndex >= audio.totalChunks - 1}
              className="p-2 rounded-full text-slate-500 hover:text-white transition-all disabled:opacity-20">
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Speed controls */}
          <div className="flex items-center gap-1.5 justify-center mt-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">Speed:</span>
            {[0.75, 1, 1.25, 1.5, 2].map(rate => (
              <button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={cn(
                  "px-2 py-0.5 rounded text-[11px] font-bold transition-all",
                  (audio.playbackRate || 1) === rate
                    ? "bg-orange-500 text-white"
                    : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                )}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN — live transcript (always visible on lg, tab-gated on mobile) */}
        <div className={cn('flex-1 flex flex-col min-h-0 lg:border-l border-white/5 overflow-hidden',
          'lg:flex', mobileTab === 'transcript' ? 'flex' : 'hidden')}>
          {/* Transcript header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-orange-500 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>subject</span>
              <span className="text-[14px] font-black text-white">Live Transcript</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">AI Syncing</span>
            </div>
          </div>

          {/* Transcript scroll */}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-hide">
            {(audio.script || []).map((chunk: any, i: number) => {
              const isA = chunk.speaker === 'A'
              const isCurrent = i === audio.currentIndex
              const isPast = i < audio.currentIndex
              return (
                <div key={i} data-active={isCurrent}
                  className={cn('transition-all duration-300', isCurrent ? 'opacity-100' : isPast ? 'opacity-45' : 'opacity-20')}>
                  <p className={cn('text-[11px] font-black uppercase tracking-widest mb-1',
                    isA ? 'text-indigo-400' : 'text-orange-400')}>
                    {isA ? voiceA : voiceB}:
                  </p>
                  <div className={cn('rounded-[1rem] px-4 py-3 text-[14px] leading-relaxed',
                    isCurrent
                      ? isA ? 'bg-indigo-500/10 border border-indigo-500/20 text-white'
                             : 'bg-orange-500/10 border border-orange-500/20 text-white'
                      : 'text-slate-400')}>
                    {chunk.text}
                  </div>
                </div>
              )
            })}
            {!audio.script?.length && (
              <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                Transcript will appear here as the podcast plays…
              </div>
            )}
          </div>

          {/* Ask the Hosts — voice-first live Q&A */}
          <div className="px-5 py-4 border-t border-white/5 shrink-0">
            {liveMode === 'off' ? (
              /* ── Idle: big CTA button ── */
              <button onClick={startLiveQA}
                className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-black text-[14px] hover:bg-indigo-500/25 active:scale-[0.98] transition-all">
                <MessageSquare className="w-4 h-4" />
                Ask the Hosts a Question
              </button>
            ) : liveMode === 'connecting' ? (
              /* ── Connecting ── */
              <div className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-[#1a1a1a] border border-white/8">
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                <span className="text-slate-400 font-bold text-sm">Connecting to hosts…</span>
              </div>
            ) : (
              /* ── Active: voice-first UI ── */
              <div className="space-y-3">
                {/* Recent exchange */}
                {liveTranscript.length > 0 && (
                  <div className="max-h-28 overflow-y-auto space-y-2 scrollbar-hide">
                    {liveTranscript.slice(-3).map((entry, i) => (
                      <div key={i} className={cn('rounded-xl px-3 py-2 text-[13px]',
                        entry.role === 'ai'
                          ? 'bg-indigo-500/8 border border-indigo-500/15 text-slate-300'
                          : 'bg-orange-500/8 border border-orange-500/15 text-slate-300')}>
                        <span className={cn('text-[10px] font-black uppercase tracking-wider mr-2',
                          entry.role === 'ai' ? 'text-indigo-400' : 'text-orange-400')}>
                          {entry.role === 'ai' ? 'Host' : 'You'}
                        </span>
                        {entry.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Voice controls row */}
                <div className="flex items-center gap-3">
                  {/* Big mic button — primary action */}
                  <button
                    onClick={() => {
                      if (liveMicMutedRef.current) {
                        liveMicMutedRef.current = false
                        setIsRecording(true)
                        toast('🎤 Mic on — speak your question', { duration: 2000 })
                      } else {
                        liveMicMutedRef.current = true
                        setIsRecording(false)
                        toast('🔇 Mic muted', { duration: 1500 })
                      }
                    }}
                    className={cn(
                      'relative flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-all',
                      isRecording
                        ? 'bg-orange-500 shadow-lg shadow-orange-500/40 scale-105'
                        : 'bg-white/8 border border-white/15 text-slate-400 hover:text-white hover:bg-white/15'
                    )}>
                    {/* Pulse ring when recording */}
                    {isRecording && (
                      <span className="absolute inset-0 rounded-full bg-orange-500/40 animate-ping" />
                    )}
                    {isRecording
                      ? <Mic className="w-6 h-6 text-white relative z-10" />
                      : <MicOff className="w-5 h-5 relative z-10" />
                    }
                  </button>

                  {/* Status + text fallback */}
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      {liveAiSpeaking ? (
                        <>
                          <div className="flex gap-0.5 items-end h-4">
                            {[3,5,4,6,3,5,4].map((h, i) => (
                              <div key={i} className="w-0.5 bg-indigo-400 rounded-full"
                                style={{ height: h*2, animation: `scaleY ${0.4+i*0.05}s ease-in-out infinite alternate`, animationDelay: `${i*0.07}s` }} />
                            ))}
                          </div>
                          <span className="text-[12px] text-indigo-400 font-bold">Host speaking…</span>
                        </>
                      ) : isRecording ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                          <span className="text-[12px] text-orange-400 font-bold">Listening…</span>
                        </>
                      ) : (
                        <span className="text-[12px] text-slate-500">Mic muted — tap to speak</span>
                      )}
                    </div>
                    {/* Text input as fallback */}
                    <div className="flex gap-1.5">
                      <input type="text" value={liveTextInput} onChange={e => setLiveTextInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendLiveTextMessage() } }}
                        placeholder="Or type a question…"
                        className="flex-1 bg-[#1a1a1a] border border-white/8 text-white text-[13px] px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500/40 placeholder:text-slate-600" />
                      <button onClick={sendLiveTextMessage} disabled={!liveTextInput.trim() || liveSendingText}
                        className="px-3 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-400 transition-all disabled:opacity-30">
                        {liveSendingText ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* End session */}
                  <button onClick={endLiveQA}
                    className="w-9 h-9 flex-shrink-0 rounded-xl bg-white/5 border border-white/8 text-slate-500 hover:text-red-400 hover:border-red-500/30 transition-all flex items-center justify-center"
                    title="End Q&A">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enlarged image lightbox */}
      {enlargedImage && (
        <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-xl flex items-center justify-center p-6"
          onClick={() => setEnlargedImage(null)}>
          <button className="absolute top-5 right-5 p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all">
            <X className="w-5 h-5" />
          </button>
          <img src={enlargedImage} className="max-w-full max-h-full object-contain rounded-2xl" alt="Zoomed" />
        </div>
      )}
    </div>
  )
}
