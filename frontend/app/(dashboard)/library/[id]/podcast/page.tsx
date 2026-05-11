'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, podcastApi } from '@/lib/api'
import { useAudio } from '@/context/AudioContext'
import {
  ArrowLeft, Play, Pause, Loader2,
  Image as ImageIcon, Hand, Quote, Radio, XCircle, X,
  SkipBack, SkipForward, Volume2
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const VOICES_A = ['Ava', 'Christopher', 'Brian', 'Guy']
const VOICES_B = ['Andrew', 'Emma', 'Jenny', 'Aria']

// Speaker avatar colors
const SPEAKER_COLORS: Record<string, string> = {
  A: 'bg-indigo-500',
  B: 'bg-orange-500',
}

export default function PodcastPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  const [status, setStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle')
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

  const {
    state: audio,
    startPodcast,
    pause: globalPause,
    resume: globalResume,
    updateScript,
    setCurrentIndex,
    stop: globalStop,
  } = useAudio()

  const hasLoadedSession = useRef(false)

  useEffect(() => {
    libraryApi.getResource(resourceId).then(res => {
      setVisuals(res.data.extracted_images || [])
    })

    // Only run session detection once
    if (hasLoadedSession.current) return
    hasLoadedSession.current = true

    // If already active in AudioContext, restore that session
    if (audio.activeResourceId === resourceId && audio.sessionId) {
      setStatus(audio.script?.length ? 'ready' : 'generating')
      podcastApi.getStatus(audio.sessionId).then(res => {
        if (res.data.interjection_urls) setInterjectionUrls(res.data.interjection_urls)
      })
      return
    }

    // Check backend for a pre-generated session (auto-generated during upload)
    podcastApi.getExistingSession(resourceId).then(res => {
      const data = res.data
      if (data.exists && data.script?.length) {
        // Get resource title for the mini player
        libraryApi.getResource(resourceId).then(r => {
          startPodcast(resourceId, r.data.title || '', data.session_id, data.script)
        }).catch(() => {
          startPodcast(resourceId, '', data.session_id, data.script)
        })
        setStatus('ready')
        podcastApi.getStatus(data.session_id).then(r => {
          if (r.data.interjection_urls) setInterjectionUrls(r.data.interjection_urls)
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [resourceId])

  // Polling
  useEffect(() => {
    const shouldPoll = status === 'generating' || (status === 'ready' && audio.sessionId && audio.totalChunks === 0)
    if (!shouldPoll || !audio.sessionId) return
    const interval = setInterval(async () => {
      try {
        const res = await podcastApi.getStatus(audio.sessionId!)
        if (res.data.script?.length) {
          updateScript(res.data.script, res.data.chunks_total)
          if (status !== 'ready') setStatus('ready')
        }
        if (res.data.status === 'ready' && res.data.script?.length) clearInterval(interval)
        else if (res.data.status === 'error') { setStatus('error'); clearInterval(interval) }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [status, audio.sessionId, updateScript, audio.totalChunks])

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      const active = transcriptRef.current.querySelector('[data-active="true"]')
      active?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [audio.currentIndex])

  const currentChunk = audio.script?.[audio.currentIndex] ?? null
  const activeVisual = visuals.find(v => v.id && currentChunk?.visual_ref && String(v.id) === String(currentChunk.visual_ref))
  const currentImage = activeVisual?.image || currentChunk?.visual_url || null

  const handleStart = async () => {
    try {
      setStatus('generating')
      const res = await podcastApi.createSession(resourceId, voiceA, voiceB, 15)
      const resObj = await libraryApi.getResource(resourceId)
      startPodcast(resourceId, resObj.data.title, res.data.session_id, res.data.script)
      if (res.data.status === 'ready') {
        setStatus('ready')
        // Trigger play immediately within the user gesture context
        setTimeout(() => globalResume(), 300)
      } else {
        setStatus('ready')
      }
    } catch {
      toast.error('Failed to start podcast')
      setStatus('error')
    }
  }

  const togglePlay = () => {
    if (audio.isPlaying) {
      globalPause()
    } else {
      globalResume()
    }
  }

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
        mediaRecorderRef.current = mr
        audioChunksRef.current = []
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
            toast.dismiss('answering')
            setIsAnswering(false)
            setCurrentIndex(audio.currentIndex + 1)
          } catch {
            toast.dismiss('answering')
            setIsAnswering(false)
            globalResume()
          }
        }
        mr.start()
        setIsRecording(true)
      } catch {}
    }

    const introUrl = interjectionUrls[currentChunk?.speaker || 'A']
    if (introUrl) {
      const a = new Audio(introUrl)
      setIsAcknowledging(true)
      a.onended = () => { setIsAcknowledging(false); startRecording() }
      a.play().catch(() => { setIsAcknowledging(false); startRecording() })
    } else {
      startRecording()
    }
  }

  // ── Setup ────────────────────────────────────────────────────────
  if (status === 'idle') return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0">
        <Link href={`/library/${resourceId}`} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </Link>
        <div>
          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">FlowCast AI</p>
          <h1 className="text-sm font-black text-white truncate">{resource?.title}</h1>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] flex items-center justify-center">
              <Radio className="w-8 h-8 text-orange-500" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">FlowCast AI</h2>
              <p className="text-slate-500 mt-1.5 text-sm leading-relaxed">
                Two AI hosts deep-dive your material in a podcast format. Raise your hand to ask questions live.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Host A', value: voiceA, set: setVoiceA, options: VOICES_A },
              { label: 'Host B', value: voiceB, set: setVoiceB, options: VOICES_B },
            ].map(({ label, value, set, options }) => (
              <div key={label}>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{label}</label>
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
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex items-center justify-center">
      <div className="flex flex-col items-center gap-5 text-center max-w-xs px-6">
        <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">Scripting Session</h2>
          <p className="text-slate-500 mt-1.5 text-sm">The AI hosts are writing the script...</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )

  // ── Error ────────────────────────────────────────────────────────
  if (status === 'error') return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex items-center justify-center">
      <div className="flex flex-col items-center gap-5 text-center">
        <XCircle className="w-12 h-12 text-red-500" />
        <h2 className="text-xl font-black text-white">Connection Failed</h2>
        <button onClick={handleStart}
          className="px-6 py-3 bg-orange-500 text-white font-black text-sm rounded-2xl hover:bg-orange-400 transition-all">
          Retry
        </button>
      </div>
    </div>
  )

  // ── Player ───────────────────────────────────────────────────────
  const speakerName = currentChunk?.speaker === 'A' ? voiceA : voiceB

  return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Link href={`/library/${resourceId}`} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">FlowCast AI · Live</p>
            <h1 className="text-xs font-black text-slate-400 truncate max-w-[180px] sm:max-w-xs">{resource?.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
          <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">On Air</span>
        </div>
      </div>

      {/* Main content — split layout on desktop, stacked on mobile */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">

        {/* ── LEFT: Image + speaker avatars ── */}
        <div className="w-full lg:w-[48%] shrink-0 flex flex-col p-4 lg:p-6 gap-3 lg:border-r lg:border-white/5">

          {/* Image panel */}
          <div
            className="relative flex-1 min-h-[180px] lg:min-h-0 rounded-2xl overflow-hidden bg-[#111] border border-white/6 cursor-pointer group"
            onClick={() => currentImage && setEnlargedImage(currentImage)}
          >
            {currentImage ? (
              <>
                <img
                  src={currentImage}
                  key={audio.currentIndex}
                  className="w-full h-full object-cover transition-opacity duration-700"
                  alt="Visual"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d]/80 via-transparent to-transparent" />
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded-lg text-[10px] font-black text-white uppercase tracking-wider">
                    Tap to expand
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 opacity-20">
                <ImageIcon className="w-10 h-10 text-slate-500" />
                <p className="text-xs text-slate-500 font-bold">Visual will appear here</p>
              </div>
            )}

            {/* Hand raised overlay */}
            {isHandRaised && (
              <div className="absolute inset-0 flex items-center justify-center bg-orange-500/20 backdrop-blur-sm">
                <Hand className="w-16 h-16 text-white animate-bounce" />
              </div>
            )}
          </div>

          {/* Speaker avatars */}
          <div className="flex items-center gap-3 shrink-0">
            {[
              { key: 'A', name: voiceA, color: 'bg-indigo-500', active: currentChunk?.speaker === 'A' },
              { key: 'B', name: voiceB, color: 'bg-orange-500', active: currentChunk?.speaker === 'B' },
            ].map(s => (
              <div key={s.key} className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all duration-300',
                s.active
                  ? 'bg-white/8 border-white/10 scale-105'
                  : 'bg-white/3 border-white/5 opacity-50'
              )}>
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white shrink-0', s.color)}>
                  {s.name[0]}
                </div>
                <div>
                  <p className="text-xs font-black text-white">{s.name}</p>
                  {s.active && (
                    <div className="flex gap-0.5 mt-0.5">
                      {[0,1,2].map(i => (
                        <div key={i} className="w-1 h-1 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="flex-1" />
            <span className="text-xs font-black text-slate-600">
              {audio.currentIndex + 1} / {audio.totalChunks || '...'}
            </span>
          </div>
        </div>

        {/* ── RIGHT: Current line + transcript ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Current spoken line — hero text */}
          <div className="px-5 lg:px-8 py-4 lg:py-6 border-b border-white/5 shrink-0">
            <div className="flex gap-3">
              <Quote className="w-6 h-6 text-orange-500/30 shrink-0 mt-1" />
              <p className="text-base lg:text-xl font-bold text-white leading-relaxed line-clamp-4" key={audio.currentIndex}>
                {currentChunk?.text || 'Initializing...'}
              </p>
            </div>
          </div>

          {/* Transcript scroll */}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 space-y-3 scrollbar-hide">
            {(audio.script || []).map((chunk: any, i: number) => {
              const isA = chunk.speaker === 'A'
              const isCurrent = i === audio.currentIndex
              const isPast = i < audio.currentIndex
              return (
                <div
                  key={i}
                  data-active={isCurrent}
                  className={cn(
                    'flex gap-2.5 transition-all duration-300',
                    isA ? 'flex-row' : 'flex-row-reverse',
                    isCurrent ? 'opacity-100' : isPast ? 'opacity-40' : 'opacity-20'
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs text-white shrink-0 mt-0.5',
                    isA ? 'bg-indigo-500' : 'bg-orange-500'
                  )}>
                    {isA ? voiceA[0] : voiceB[0]}
                  </div>

                  {/* Bubble */}
                  <div className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    isA
                      ? 'bg-[#1a1a1a] border border-white/6 text-slate-300 rounded-tl-none'
                      : 'bg-[#1a1a1a] border border-white/6 text-slate-300 rounded-tr-none',
                    isCurrent && 'border-orange-500/20 bg-orange-500/5 text-white'
                  )}>
                    <p className="text-[10px] font-black uppercase tracking-wider mb-1 opacity-50">
                      {isA ? voiceA : voiceB}
                    </p>
                    {chunk.text}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Player bar ── */}
      <div className="border-t border-white/5 bg-[#111] px-4 lg:px-8 py-4 shrink-0 z-10">
        <div className="max-w-4xl mx-auto space-y-3">

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-600 w-8 text-right">
              {audio.currentIndex + 1}
            </span>
            <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden cursor-pointer">
              <div className="h-full bg-orange-500 transition-all duration-500 rounded-full"
                style={{ width: `${audio.playbackProgress || 0}%` }} />
            </div>
            <span className="text-[10px] font-black text-slate-600 w-8">
              {audio.totalChunks || '?'}
            </span>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between gap-4">

            {/* Left: title */}
            <div className="hidden sm:block min-w-0">
              <p className="text-xs font-black text-white truncate max-w-[160px] lg:max-w-xs">
                {resource?.title || 'FlowCast Session'}
              </p>
              <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                {audio.isPlaying
                  ? `Segment ${audio.currentIndex + 1} of ${audio.totalChunks}`
                  : audio.isChunkLoaded ? 'Paused' : 'Connecting...'}
              </p>
            </div>

            {/* Center: play controls */}
            <div className="flex items-center gap-3 mx-auto sm:mx-0">
              <button
                onClick={() => audio.currentIndex > 0 && setCurrentIndex(audio.currentIndex - 1)}
                className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-all disabled:opacity-20"
                disabled={audio.currentIndex === 0}
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button onClick={togglePlay}
                className="w-12 h-12 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 hover:bg-orange-400 hover:scale-105 transition-all">
                {!audio.isChunkLoaded && !audio.isPlaying ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : audio.isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              <button
                onClick={() => audio.currentIndex < (audio.totalChunks - 1) && setCurrentIndex(audio.currentIndex + 1)}
                className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-all disabled:opacity-20"
                disabled={audio.currentIndex >= audio.totalChunks - 1}
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Right: raise hand */}
            <button onClick={handleInterrupt}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all',
                isRecording
                  ? 'bg-red-500/20 border border-red-500/40 text-red-400 animate-pulse'
                  : 'bg-white/5 border border-white/8 text-slate-400 hover:text-white hover:bg-white/8'
              )}>
              <Hand className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isRecording ? 'Listening...' : 'Raise Hand'}</span>
            </button>
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
