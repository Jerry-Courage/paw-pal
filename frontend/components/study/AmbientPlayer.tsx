'use client'

import { useState, useEffect, useRef } from 'react'
import { Volume2, VolumeX, Brain, Wind, Waves, Coffee, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const SOUNDS = [
  { id: 'alpha', name: 'Alpha Waves', icon: Brain, color: 'bg-indigo-500', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'brown', name: 'Brown Noise', icon: Wind, color: 'bg-amber-600', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'lofi', name: 'Study Lofi', icon: Coffee, color: 'bg-pink-500', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
  { id: 'zen', name: 'Flow State', icon: Waves, color: 'bg-emerald-500', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
]

interface AmbientPlayerProps {
  compact?: boolean
}

export default function AmbientPlayer({ compact = true }: AmbientPlayerProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.4)
  const [expanded, setExpanded] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (activeId && isPlaying) {
      if (!audioRef.current) {
        audioRef.current = new Audio(SOUNDS.find(s => s.id === activeId)?.url)
        audioRef.current.loop = true
      } else {
        audioRef.current.src = SOUNDS.find(s => s.id === activeId)?.url || ''
      }
      audioRef.current.play().catch(() => {})
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

  if (compact) {
    return (
      <div className="bg-surface-container rounded-[1.5rem] border border-outline-variant/20 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-bold text-on-surface text-[13px] flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-primary" />
            Ambient Sound
          </h4>
          {activeId && (
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {SOUNDS.find(s => s.id === activeId)?.name}
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {SOUNDS.map(sound => (
            <button
              key={sound.id}
              onClick={() => handleToggle(sound.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all",
                activeId === sound.id && isPlaying
                  ? "bg-primary/10 border border-primary/30"
                  : "bg-surface-container-high border border-transparent hover:border-outline-variant/30"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all",
                sound.color,
                activeId === sound.id && isPlaying && "ring-2 ring-primary ring-offset-1 ring-offset-surface-container"
              )}>
                <sound.icon className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold text-on-surface-variant truncate w-full text-center">
                {sound.name.split(' ')[0]}
              </span>
            </button>
          ))}
        </div>

        {/* Volume when active */}
        {activeId && (
          <div className="mt-3 flex items-center gap-2">
            <VolumeX className="w-3 h-3 text-on-surface-variant" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="flex-1 h-1 bg-surface-container-low rounded-full appearance-none cursor-pointer accent-primary"
            />
            <Volume2 className="w-3 h-3 text-on-surface-variant" />
          </div>
        )}
      </div>
    )
  }

  // Expanded modal version
  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="absolute inset-0" onClick={() => setExpanded(false)} />
      <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 relative z-10">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-black text-on-surface">Ambient Sounds</h3>
          <button onClick={() => setExpanded(false)} className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center">
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        <div className="space-y-3">
          {SOUNDS.map(sound => (
            <button
              key={sound.id}
              onClick={() => handleToggle(sound.id)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                activeId === sound.id
                  ? "border-primary bg-primary/5"
                  : "border-outline-variant/20 hover:border-outline-variant/40"
              )}
            >
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white", sound.color)}>
                <sound.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-on-surface text-sm">{sound.name}</p>
                {activeId === sound.id && isPlaying && (
                  <div className="flex gap-0.5 items-center mt-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="w-1 bg-primary rounded-full animate-pulse" style={{ height: `${8 + Math.random() * 12}px`, animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                )}
              </div>
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                activeId === sound.id && isPlaying ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"
              )}>
                {activeId === sound.id && isPlaying ? (
                  <Volume2 className="w-5 h-5" />
                ) : (
                  <VolumeX className="w-5 h-5" />
                )}
              </div>
            </button>
          ))}
        </div>

        {activeId && (
          <div className="mt-5 flex items-center gap-3 px-2">
            <VolumeX className="w-4 h-4 text-on-surface-variant" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-surface-container-low rounded-full appearance-none cursor-pointer accent-primary"
            />
            <Volume2 className="w-4 h-4 text-on-surface-variant" />
          </div>
        )}
      </div>
    </div>
  )
}
