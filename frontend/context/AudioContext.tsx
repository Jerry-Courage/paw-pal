'use client'

import React, { createContext, useContext, useState, useRef, useEffect } from 'react'

interface AudioState {
  isPlaying: boolean
  activeResourceId: number | null
  activeResourceTitle: string
  currentIndex: number
  totalChunks: number
  isMiniPlayerVisible: boolean
  playbackProgress: number // 0 to 100
}

interface AudioContextType {
  state: AudioState
  play: (resourceId: number, title: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  updateProgress: (index: number, total: number) => void
  setMiniPlayerVisible: (visible: boolean) => void
  audioRef: React.RefObject<HTMLAudioElement | null>
}

const AudioContext = createContext<AudioContextType | undefined>(undefined)

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AudioState>({
    isPlaying: false,
    activeResourceId: null,
    activeResourceTitle: '',
    currentIndex: 0,
    totalChunks: 0,
    isMiniPlayerVisible: false,
    playbackProgress: 0,
  })

  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    audioRef.current = new Audio()
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const play = (resourceId: number, title: string, src?: string, index?: number, total?: number) => {
    if (src && audioRef.current) {
      audioRef.current.src = src
      audioRef.current.play().catch(console.error)
    }
    setState(prev => ({
      ...prev,
      activeResourceId: resourceId,
      activeResourceTitle: title,
      isPlaying: true,
      isMiniPlayerVisible: true,
      currentIndex: index !== undefined ? index : prev.currentIndex,
      totalChunks: total !== undefined ? total : prev.totalChunks,
      playbackProgress: total ? ((index || 0) + 1) / total * 100 : prev.playbackProgress
    }))
  }

  const pause = () => {
    audioRef.current?.pause()
    setState(prev => ({ ...prev, isPlaying: false }))
  }

  const resume = () => {
    audioRef.current?.play().catch(console.error)
    setState(prev => ({ ...prev, isPlaying: true }))
  }

  const stop = () => {
    audioRef.current?.pause()
    if (audioRef.current) audioRef.current.src = ''
    setState(prev => ({
      ...prev,
      isPlaying: false,
      activeResourceId: null,
      isMiniPlayerVisible: false,
      playbackProgress: 0
    }))
  }

  const updateProgress = (index: number, total: number) => {
    setState(prev => ({
      ...prev,
      currentIndex: index,
      totalChunks: total,
      playbackProgress: total > 0 ? ((index + 1) / total) * 100 : 0
    }))
  }

  const setMiniPlayerVisible = (visible: boolean) => {
    setState(prev => ({ ...prev, isMiniPlayerVisible: visible }))
  }

  // Effect to sync audioRef state with global state (optional but helpful)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleEnded = () => {
      // We don't play next here because we don't have the next blob yet.
      // But we can update the playing state.
      setState(prev => {
        if (prev.currentIndex >= prev.totalChunks - 1) {
          return { ...prev, isPlaying: false }
        }
        return prev
      })
    }

    audio.addEventListener('ended', handleEnded)
    return () => audio.removeEventListener('ended', handleEnded)
  }, [])

  return (
    <AudioContext.Provider value={{ state, play, pause, resume, stop, updateProgress, setMiniPlayerVisible, audioRef }}>
      {children}
    </AudioContext.Provider>
  )
}

export function useAudio() {
  const context = useContext(AudioContext)
  if (!context) throw new Error('useAudio must be used within an AudioProvider')
  return context
}
