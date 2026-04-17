'use client'

import React, { createContext, useContext, useState, useRef, useEffect } from 'react'
import { podcastApi } from '@/lib/api'

interface AudioState {
  isPlaying: boolean
  activeResourceId: number | null
  activeResourceTitle: string
  currentIndex: number
  totalChunks: number
  isMiniPlayerVisible: boolean
  playbackProgress: number // 0 to 100
  // NEW: Global Podcast Engine support
  sessionId: number | null
  script: any[]
}

interface AudioContextType {
  state: AudioState
  play: (resourceId: number, title: string, src?: string, index?: number, total?: number) => void
  startPodcast: (resourceId: number, title: string, sessionId: number, script: any[]) => void
  pause: () => void
  resume: () => void
  stop: () => void
  setMiniPlayerVisible: (visible: boolean) => void
  updateScript: (newScript: any[], newTotal: number) => void
  setCurrentIndex: (index: number) => void
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
    sessionId: null,
    script: [],
  })

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const preloadedBlobs = useRef<Record<number, string>>({})

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

  const startPodcast = (resourceId: number, title: string, sessionId: number, script: any[]) => {
    // Clear old preloads
    Object.values(preloadedBlobs.current).forEach(url => URL.revokeObjectURL(url))
    preloadedBlobs.current = {}
    
    const safeScript = script || []
    setState(prev => ({
      ...prev,
      activeResourceId: resourceId,
      activeResourceTitle: title,
      sessionId: sessionId,
      script: safeScript,
      totalChunks: safeScript.length,
      currentIndex: 0,
      isPlaying: true,
      isMiniPlayerVisible: true,
      playbackProgress: safeScript.length > 0 ? (1 / safeScript.length) * 100 : 0
    }))
  }

  const updateScript = (newScript: any[], newTotal: number) => {
    setState(prev => ({
      ...prev,
      script: newScript,
      totalChunks: newTotal
    }))
  }

  const setCurrentIndex = (index: number) => {
    setState(prev => ({
      ...prev,
      currentIndex: index,
      playbackProgress: prev.totalChunks > 0 ? ((index + 1) / prev.totalChunks) * 100 : 0
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
    if (audioRef.current) {
      audioRef.current.src = ''
      audioRef.current.onended = null
    }
    // Clean up blobs
    Object.values(preloadedBlobs.current).forEach(url => URL.revokeObjectURL(url))
    preloadedBlobs.current = {}

    setState(prev => ({
      ...prev,
      isPlaying: false,
      activeResourceId: null,
      sessionId: null,
      script: [],
      isMiniPlayerVisible: false,
      playbackProgress: 0,
      currentIndex: 0,
      totalChunks: 0
    }))
  }

  const setMiniPlayerVisible = (visible: boolean) => {
    setState(prev => ({ ...prev, isMiniPlayerVisible: visible }))
  }

  // --- PERSISTENT SEQUENTIAL DRIVER ---
  useEffect(() => {
    if (!state.sessionId || !state.isPlaying) return

    const handleNextChunk = async () => {
      const nextIdx = state.currentIndex + 1
      if (nextIdx >= state.totalChunks) {
        pause()
        return
      }

      try {
        let nextUrl = preloadedBlobs.current[nextIdx]
        if (!nextUrl) {
          const text = state.script[nextIdx]?.text || ""
          const res = await podcastApi.getChunk(state.sessionId!, nextIdx, text)
          if (res.data instanceof Blob) {
            nextUrl = URL.createObjectURL(res.data)
            preloadedBlobs.current[nextIdx] = nextUrl
          }
        }

        if (nextUrl && audioRef.current) {
          audioRef.current.src = nextUrl
          audioRef.current.play()
          setCurrentIndex(nextIdx)
        }
      } catch (e) {
        console.error("Autonomous transition failed:", e)
        setCurrentIndex(nextIdx) // Skip to next if failed
      }
    }

    const audio = audioRef.current
    if (audio) {
      audio.onended = handleNextChunk
    }
    return () => { if (audio) audio.onended = null }
  }, [state.sessionId, state.isPlaying, state.currentIndex, state.script, state.totalChunks])

  // --- BACKGROUND PRELOADER ---
  useEffect(() => {
    if (!state.sessionId || !state.isPlaying) return

    const preload = async (idx: number) => {
      if (idx >= state.totalChunks || preloadedBlobs.current[idx]) return
      try {
        const text = state.script[idx]?.text || ""
        const res = await podcastApi.getChunk(state.sessionId!, idx, text)
        if (res.data instanceof Blob) {
          preloadedBlobs.current[idx] = URL.createObjectURL(res.data)
        }
      } catch (e) {
        console.error("Global preload failed:", e)
      }
    }

    preload(state.currentIndex + 1)
    preload(state.currentIndex + 2)
  }, [state.sessionId, state.isPlaying, state.currentIndex, state.script, state.totalChunks])

  return (
    <AudioContext.Provider value={{ 
      state, 
      play, 
      startPodcast,
      pause, 
      resume, 
      stop, 
      setMiniPlayerVisible, 
      updateScript,
      setCurrentIndex,
      audioRef 
    }}>
      {children}
    </AudioContext.Provider>
  )
}

export function useAudio() {
  const context = useContext(AudioContext)
  if (!context) throw new Error('useAudio must be used within an AudioProvider')
  return context
}
