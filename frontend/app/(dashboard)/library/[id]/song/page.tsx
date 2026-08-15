'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { studySongApi, libraryApi } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, SkipForward, SkipBack, Music, ArrowLeft, Disc, Volume2, Sparkles, RefreshCw } from 'lucide-react'


interface SongLine {
  section: string
  singer: string
  lyrics: string
  audio_url: string
}

export default function StudySongPage() {
  const params = useParams()
  const router = useRouter()
  const resourceId = Number(params.id)

  const [resource, setResource] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [style, setStyle] = useState('upbeat_rap')
  const [songData, setSongData] = useState<{ title: string; lines: SongLine[] } | null>(null)
  
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    libraryApi.getResource(resourceId).then(r => setResource(r.data)).catch(() => {})
    loadSong('upbeat_rap')
  }, [resourceId])

  const loadSong = async (selectedStyle: string) => {
    setLoading(true)
    setIsGenerating(true)
    try {
      const res = await studySongApi.getSong(resourceId, selectedStyle)
      setSongData(res.data)
      setCurrentIndex(0)
    } catch (e: any) {
      console.error('Failed to generate study song.')
    } finally {
      setLoading(false)
      setIsGenerating(false)
    }
  }

  const currentLine = songData?.lines[currentIndex]

  useEffect(() => {
    if (isPlaying && currentLine?.audio_url) {
      if (audioRef.current) {
        audioRef.current.src = currentLine.audio_url
        audioRef.current.play().catch(() => setIsPlaying(false))
      }
    }
  }, [currentIndex, isPlaying, songData])

  const handleAudioEnded = () => {
    if (songData && currentIndex < songData.lines.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      setIsPlaying(false)
      setCurrentIndex(0)
    }
  }

  const togglePlay = () => {
    if (!songData || songData.lines.length === 0) return
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
    } else {
      if (audioRef.current && audioRef.current.src) {
        audioRef.current.play()
      } else if (currentLine?.audio_url) {
        audioRef.current = new Audio(currentLine.audio_url)
        audioRef.current.onended = handleAudioEnded
        audioRef.current.play()
      }
      setIsPlaying(true)
    }
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-white px-4 md:px-12 py-8 flex flex-col justify-between relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-tertiary/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Bar */}
      <div className="relative z-10 flex items-center justify-between max-w-5xl mx-auto w-full">
        <button
          onClick={() => router.push(`/library/${resourceId}`)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Material
        </button>

        <div className="flex items-center gap-2">
          {['upbeat_rap', 'lo_fi_pop', 'rock_anthem'].map(s => (
            <button
              key={s}
              onClick={() => { setStyle(s); loadSong(s); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                style === s ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Player Area */}
      <div className="relative z-10 max-w-3xl mx-auto w-full my-auto py-12 flex flex-col items-center text-center">
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <Sparkles className="w-8 h-8 text-primary absolute inset-0 m-auto animate-pulse" />
            </div>
            <p className="font-extrabold text-lg text-white">Composing your study song &amp; recording vocals...</p>
            <p className="text-xs text-slate-400 max-w-md">AI is condensing your notes into rhythmic rhymes and synthesizing audio.</p>
          </div>
        ) : (
          <div className="w-full space-y-8">
            {/* Vinyl Record Animation */}
            <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
              <motion.div
                animate={{ rotate: isPlaying ? 360 : 0 }}
                transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                className="w-48 h-48 rounded-full bg-gradient-to-tr from-slate-900 via-slate-800 to-black border-4 border-slate-700 shadow-2xl flex items-center justify-center relative overflow-hidden"
              >
                {/* Vinyl Grooves */}
                <div className="absolute inset-4 rounded-full border border-slate-700/50" />
                <div className="absolute inset-8 rounded-full border border-slate-700/40" />
                <div className="absolute inset-12 rounded-full border border-slate-700/30" />
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-amber-400 flex items-center justify-center shadow-inner">
                  <Music className="w-6 h-6 text-black" />
                </div>
              </motion.div>
            </div>

            {/* Song Title & Meta */}
            <div>
              <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-black uppercase tracking-wider mb-2 inline-block">
                {currentLine?.section || 'Study Song'} • {currentLine?.singer || 'Vocalist'}
              </span>
              <h1 className="text-2xl md:text-3xl font-black text-white">{songData?.title || resource?.title}</h1>
              <p className="text-xs text-slate-400 mt-1">Memorize complex definitions effortlessly through rhythm &amp; rhyme.</p>
            </div>

            {/* Karaoke Lyrics Card */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] shadow-2xl min-h-[160px] flex flex-col items-center justify-center relative overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.p
                  key={currentIndex}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.3 }}
                  className="text-lg md:text-2xl font-black text-white leading-relaxed"
                >
                  &ldquo;{currentLine?.lyrics}&rdquo;
                </motion.p>
              </AnimatePresence>
              <div className="absolute bottom-3 right-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Line {currentIndex + 1} of {songData?.lines.length || 0}
              </div>
            </div>

            {/* Player Controls */}
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 transition-colors"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                <button
                  onClick={togglePlay}
                  className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-amber-400 text-black flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:scale-105 active:scale-95 transition-all"
                >
                  {isPlaying ? <Pause className="w-7 h-7 fill-black" /> : <Play className="w-7 h-7 fill-black ml-1" />}
                </button>

                <button
                  onClick={() => songData && setCurrentIndex(prev => Math.min(songData.lines.length - 1, prev + 1))}
                  disabled={!songData || currentIndex === songData.lines.length - 1}
                  className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 transition-colors"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-md bg-white/10 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${songData ? ((currentIndex + 1) / songData.lines.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        onError={() => {
          console.error('Audio playback error, moving to next line.')
          handleAudioEnded()
        }}
      />

      {/* Footer */}
      <div className="relative z-10 text-center text-xs text-slate-500 max-w-md mx-auto">
        FlowState AI Memory Engine • Powered by Rhythm &amp; Mnemonic Synthesis
      </div>
    </div>
  )
}
