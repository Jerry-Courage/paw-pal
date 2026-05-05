'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, podcastApi } from '@/lib/api'
import { useAudio } from '@/context/AudioContext'
import {
  ArrowLeft, Play, Pause, Loader2, Settings2,
  Image as ImageIcon, Hand, Quote, Radio, XCircle, X
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const VOICES_A = ['Ava', 'Christopher', 'Brian', 'Guy']
const VOICES_B = ['Andrew', 'Emma', 'Jenny', 'Aria']

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

  useEffect(() => {
    libraryApi.getResource(resourceId).then(res => {
      setVisuals(res.data.extracted_images || [])
    })
    if (audio.activeResourceId === resourceId && audio.sessionId) {
      setStatus(audio.script?.length ? 'ready' : 'generating')
      podcastApi.getStatus(audio.sessionId).then(res => {
        if (res.data.interjection_urls) setInterjectionUrls(res.data.interjection_urls)
      })
    }
  }, [resourceId, audio.activeResourceId, audio.sessionId, audio.script?.length])

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

  const currentChunk = audio.script?.[audio.currentIndex] ?? null
  const activeVisual = visuals.find(v => v.id && currentChunk?.visual_ref && String(v.id) === String(currentChunk.visual_ref))

  const handleStart = async () => {
    try {
      setStatus('generating')
      const res = await podcastApi.createSession(resourceId, voiceA, voiceB, 15)
      const resObj = await libraryApi.getResource(resourceId)
      startPodcast(resourceId, resObj.data.title, res.data.session_id, res.data.script)
      if (res.data.status === 'ready') setStatus('ready')
    } catch {
      toast.error('Failed to start podcast')
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
  if (status === 'idle') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <div className="px-6 py-5 flex items-center gap-4 border-b border-white/5">
          <Link href={`/library/${resourceId}`} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-pink-500 uppercase tracking-widest">FlowCast AI</p>
            <h1 className="text-sm font-black text-white truncate max-w-xs">{resource?.title}</h1>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md space-y-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-24 h-24 bg-pink-500/10 border border-pink-500/20 rounded-[2rem] flex items-center justify-center">
                <Radio className="w-12 h-12 text-pink-500" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-white tracking-tighter">FlowCast AI</h2>
                <p className="text-slate-400 mt-2 text-sm">Two AI hosts deep-dive your material in a podcast format. You can raise your hand and ask questions live.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Host A</label>
                <select
                  value={voiceA}
                  onChange={e => setVoiceA(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white p-3 rounded-2xl text-sm appearance-none cursor-pointer focus:outline-none focus:border-pink-500/50"
                >
                  {VOICES_A.map(v => <option key={v} value={v} className="bg-slate-900">{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Host B</label>
                <select
                  value={voiceB}
                  onChange={e => setVoiceB(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white p-3 rounded-2xl text-sm appearance-none cursor-pointer focus:outline-none focus:border-pink-500/50"
                >
                  {VOICES_B.map(v => <option key={v} value={v} className="bg-slate-900">{v}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={handleStart}
              className="w-full py-4 rounded-2xl bg-pink-500 text-white font-black text-base hover:bg-pink-400 active:scale-95 transition-all shadow-2xl shadow-pink-500/30 flex items-center justify-center gap-3"
            >
              <Radio className="w-5 h-5" /> Start Podcast
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Generating ───────────────────────────────────────────────────
  if (status === 'generating') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center max-w-sm px-6">
          <div className="w-20 h-20 bg-pink-500/10 border border-pink-500/20 rounded-[2rem] flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-pink-400 animate-spin" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tighter">Scripting Session</h2>
            <p className="text-slate-400 mt-2 text-sm">The AI hosts are analyzing your notes and writing the script...</p>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center">
          <XCircle className="w-16 h-16 text-red-500" />
          <h2 className="text-2xl font-black text-white">Synapse Disconnected</h2>
          <button onClick={handleStart} className="px-8 py-3 bg-pink-500 text-white font-black rounded-2xl hover:bg-pink-400 transition-all">
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Player ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-white/5 flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Link href={`/library/${resourceId}`} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-pink-500 uppercase tracking-widest">FlowCast AI · Live</p>
            <h1 className="text-sm font-black text-white truncate max-w-xs">{resource?.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-pink-500/10 border border-pink-500/20 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
          <span className="text-[10px] font-black text-pink-400 uppercase tracking-widest">On Air</span>
        </div>
      </div>

      {/* Ambient background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className={cn('absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 transition-all duration-1000', currentChunk?.speaker === 'A' ? 'bg-indigo-600' : 'bg-pink-600/30')} />
        <div className={cn('absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 transition-all duration-1000', currentChunk?.speaker === 'B' ? 'bg-pink-600' : 'bg-indigo-600/30')} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative z-10">
        {/* Visual panel */}
        <div className="w-full lg:w-[55%] h-[280px] lg:h-full p-6 lg:p-12 flex items-center justify-center">
          <div
            className="w-full h-full rounded-[3rem] overflow-hidden border border-white/10 bg-slate-900/50 relative cursor-pointer shadow-2xl"
            onClick={() => (activeVisual || currentChunk?.visual_url) && setEnlargedImage(activeVisual?.image || currentChunk?.visual_url)}
          >
            {(activeVisual || currentChunk?.visual_url) ? (
              <>
                <img src={activeVisual?.image || currentChunk?.visual_url} key={audio.currentIndex} className="w-full h-full object-cover animate-in fade-in duration-1000" alt="Visual" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-70" />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center opacity-20">
                <ImageIcon className="w-16 h-16 text-pink-500" />
              </div>
            )}
            {isHandRaised && (
              <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/20 backdrop-blur-sm">
                <Hand className="w-24 h-24 text-white animate-bounce" />
              </div>
            )}
          </div>
        </div>

        {/* Script panel */}
        <div className="w-full lg:w-[45%] flex flex-col p-6 lg:p-12 lg:pl-0 gap-8">
          {/* Speaker indicators */}
          <div className="flex items-center gap-6">
            <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg transition-all', currentChunk?.speaker === 'A' ? 'bg-indigo-500 text-white scale-110 shadow-xl shadow-indigo-500/30' : 'bg-white/5 text-white/20')}>
              {voiceA[0]}
            </div>
            <div className="h-px flex-1 bg-white/5" />
            <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg transition-all', currentChunk?.speaker === 'B' ? 'bg-pink-500 text-white scale-110 shadow-xl shadow-pink-500/30' : 'bg-white/5 text-white/20')}>
              {voiceB[0]}
            </div>
          </div>

          {/* Current line */}
          <div className="flex-1 flex items-center">
            <div className="flex gap-4">
              <Quote className="w-8 h-8 text-indigo-500/20 shrink-0 mt-1" />
              <p className="text-2xl lg:text-3xl font-medium text-white/90 leading-relaxed" key={audio.currentIndex}>
                {currentChunk?.text || 'Initializing...'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="border-t border-white/5 bg-slate-900/80 backdrop-blur-xl px-6 lg:px-12 py-6 flex-shrink-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <button
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-white text-slate-950 flex items-center justify-center shadow-xl hover:scale-110 transition-all"
            >
              {!audio.isChunkLoaded && !audio.isPlaying ? (
                <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
              ) : audio.isPlaying ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-1" />
              )}
            </button>
            <div className="hidden sm:block">
              <p className="text-white font-black">FlowCast Session</p>
              <p className="text-slate-500 text-sm">
                {audio.isPlaying
                  ? `Segment ${audio.currentIndex + 1} of ${audio.totalChunks}`
                  : audio.isChunkLoaded ? 'Ready' : 'Connecting...'}
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex-1 max-w-md hidden lg:block">
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-pink-500 transition-all duration-500" style={{ width: `${audio.playbackProgress}%` }} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleInterrupt}
              className={cn(
                'h-12 px-6 rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all',
                isRecording ? 'bg-rose-600 text-white animate-pulse' : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
              )}
            >
              <Hand className="w-4 h-4" />
              {isRecording ? 'Listening...' : 'Raise Hand'}
            </button>
          </div>
        </div>
      </div>

      {/* Enlarged image */}
      {enlargedImage && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-12" onClick={() => setEnlargedImage(null)}>
          <img src={enlargedImage} className="max-w-full max-h-full object-contain rounded-3xl" alt="Zoomed" />
        </div>
      )}
    </div>
  )
}
