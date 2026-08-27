'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export type FlowSoundEvent = 'node_unlocked' | 'correct' | 'incorrect' | 'flowcoin' | 'xp' | 'level_up' | 'journey_complete' | 'battle_countdown' | 'battle_win' | 'battle_loss' | 'flashcard_flip' | 'flashcard_save' | 'flow_reaction'

type FlowSoundContextValue = {
  muted: boolean
  volume: number
  setMuted: (muted: boolean) => void
  setVolume: (volume: number) => void
  play: (event: FlowSoundEvent, occurrenceId?: string) => void
}

const FlowSoundContext = createContext<FlowSoundContextValue | null>(null)
const STORAGE_KEY = 'flowstate-sound-preferences-v1'

const tones: Record<FlowSoundEvent, [number, number, number]> = {
  node_unlocked: [392, 587, .16], correct: [440, 660, .11], incorrect: [220, 174, .1],
  flowcoin: [660, 880, .1], xp: [523, 784, .11], level_up: [392, 784, .2],
  journey_complete: [440, 880, .24], battle_countdown: [330, 330, .08],
  battle_win: [523, 988, .2], battle_loss: [247, 196, .14], flashcard_flip: [520, 620, .055],
  flashcard_save: [587, 784, .09], flow_reaction: [420, 560, .07],
}

export function FlowSoundProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMutedState] = useState(true)
  const [volume, setVolumeState] = useState(.35)
  const audioContext = useRef<AudioContext | null>(null)
  const played = useRef(new Set<string>())

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      if (typeof saved.muted === 'boolean') setMutedState(saved.muted)
      if (typeof saved.volume === 'number') setVolumeState(Math.max(0, Math.min(1, saved.volume)))
    } catch { /* retain safe muted defaults */ }
  }, [])

  const persist = (nextMuted: boolean, nextVolume: number) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted: nextMuted, volume: nextVolume }))
  }
  const setMuted = (next: boolean) => { setMutedState(next); persist(next, volume) }
  const setVolume = (next: number) => { const safe = Math.max(0, Math.min(1, next)); setVolumeState(safe); persist(muted, safe) }

  const play = useCallback((event: FlowSoundEvent, occurrenceId?: string) => {
    if (muted || volume <= 0 || typeof window === 'undefined') return
    const key = occurrenceId ? `${event}:${occurrenceId}` : ''
    if (key && played.current.has(key)) return
    try {
      const context = audioContext.current || new AudioContext()
      audioContext.current = context
      if (context.state !== 'running') return
      const [start, end, duration] = tones[event]
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = event === 'incorrect' || event === 'battle_loss' ? 'triangle' : 'sine'
      oscillator.frequency.setValueAtTime(start, context.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(end, context.currentTime + duration)
      gain.gain.setValueAtTime(0.0001, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(Math.max(.0001, volume * .12), context.currentTime + .012)
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(); oscillator.stop(context.currentTime + duration)
      if (key) played.current.add(key)
    } catch { /* sound is enhancement-only */ }
  }, [muted, volume])

  return <FlowSoundContext.Provider value={{ muted, volume, setMuted, setVolume, play }}>{children}</FlowSoundContext.Provider>
}

export function useFlowSound() {
  const value = useContext(FlowSoundContext)
  if (!value) throw new Error('useFlowSound must be used within FlowSoundProvider')
  return value
}
