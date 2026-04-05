'use client'

import React, { useState, useEffect, useRef } from 'react'
import { 
  X, Play, Pause, Volume2, 
  Headphones, Wind, Waves, Coffee, 
  Zap, Brain, Music, CheckCircle2
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Soundscape {
  id: string
  name: string
  desc: string
  icon: any
  color: string
  url: string // We'll use high-quality atmospheric streaming URLs
  benefit: string
}

const SOUNDSCAPES: Soundscape[] = [
  {
    id: 'alpha',
    name: 'Alpha Waves',
    desc: 'Binaural Focus',
    icon: Brain,
    color: 'from-indigo-500 to-purple-600',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Placeholder for stable focus loop
    benefit: 'Psychologically proven to improve deep concentration.'
  },
  {
    id: 'brown',
    name: 'Brown Noise',
    desc: 'Deep Isolation',
    icon: Wind,
    color: 'from-amber-600 to-orange-700',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    benefit: 'Masks external distractions and calms the nervous system.'
  },
  {
    id: 'lofi',
    name: 'Study Lofi',
    desc: 'Cozy Beats',
    icon: Coffee,
    color: 'from-pink-500 to-rose-500',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    benefit: 'Maintains a steady cognitive rhythm for long sessions.'
  },
  {
    id: 'zen',
    name: 'Flow State',
    desc: 'Zen Ambient',
    icon: Waves,
    color: 'from-emerald-500 to-teal-600',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
    benefit: 'Reduces stress and cortisol while reading complex docs.'
  }
]

interface MusicGeneratorModalProps {
  resourceId: number
  onClose: () => void
}

export default function MusicGeneratorModal({ resourceId, onClose }: MusicGeneratorModalProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.5)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const activeSound = SOUNDSCAPES.find(s => s.id === activeId)

  useEffect(() => {
    if (activeId && isPlaying) {
      if (!audioRef.current) {
        audioRef.current = new Audio(SOUNDSCAPES.find(s => s.id === activeId)?.url)
        audioRef.current.loop = true
      } else {
        audioRef.current.src = SOUNDSCAPES.find(s => s.id === activeId)?.url || ''
      }
      audioRef.current.play()
    } else {
      audioRef.current?.pause()
    }
  }, [activeId, isPlaying])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const handleToggle = (id: string) => {
    if (activeId === id) {
      setIsPlaying(!isPlaying)
    } else {
      setActiveId(id)
      setIsPlaying(true)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300">
      <div 
        className="absolute inset-0 z-0" 
        onClick={onClose}
      />
      
      <div className="bg-white dark:bg-slate-950 w-full sm:max-w-xl h-auto max-h-[90vh] rounded-t-[2.5rem] sm:rounded-[3rem] shadow-2xl border-t sm:border border-white/10 flex flex-col overflow-hidden relative z-10 transition-all">
        
        {/* Header */}
        <div className="p-8 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <Headphones className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Study Flow Engine</h2>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Psychological Focus Audio</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Grid */}
        <div className="p-8 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SOUNDSCAPES.map((sound) => (
            <button
              key={sound.id}
              onClick={() => handleToggle(sound.id)}
              className={cn(
                "group relative p-5 rounded-[2rem] border-2 transition-all text-left overflow-hidden",
                activeId === sound.id 
                  ? "border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500/20" 
                  : "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-slate-200 dark:hover:border-slate-700"
              )}
            >
              <div className="flex items-start justify-between mb-3 relative z-10">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110",
                  sound.color
                )}>
                  <sound.icon className="w-5 h-5" />
                </div>
                {activeId === sound.id && isPlaying && (
                  <div className="flex gap-0.5 items-end h-4">
                    <div className="w-1 bg-indigo-500 animate-[bounce_1s_infinite]" />
                    <div className="w-1 bg-indigo-500 animate-[bounce_1.2s_infinite]" />
                    <div className="w-1 bg-indigo-500 animate-[bounce_0.8s_infinite]" />
                  </div>
                )}
              </div>
              
              <div className="relative z-10">
                <div className="font-black text-sm text-slate-900 dark:text-white">{sound.name}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{sound.desc}</div>
              </div>

              {/* Interaction Overlay */}
              <div className={cn(
                "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none",
                sound.color
              )} />
            </button>
          ))}
        </div>

        {/* Active Player Status */}
        {activeSound && (
          <div className="mx-8 mb-8 p-6 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/10 animate-in slide-in-from-bottom-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">Active Focus Layer</span>
                </div>
                <p className="text-[11px] text-slate-500 italic leading-relaxed">
                  "{activeSound.benefit}"
                </p>
              </div>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-14 h-14 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-xl shadow-indigo-500/20 active:scale-90 transition-all"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
              </button>
            </div>

            {/* Volume Slider */}
            <div className="flex items-center gap-4 pt-4 border-t border-indigo-500/10">
              <Volume2 className="w-4 h-4 text-slate-400" />
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="flex-1 h-1 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          </div>
        )}

        <div className="px-8 pb-10 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] opacity-40">
            Powered by FlowState Alpha Neuro-Audio
          </p>
        </div>
      </div>
    </div>
  )
}
