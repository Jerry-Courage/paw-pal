'use client'

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import { podcastApi } from '@/lib/api'

interface AudioState {
  isPlaying: boolean
  activeResourceId: number | null
  activeResourceTitle: string
  currentIndex: number
  totalChunks: number
  isMiniPlayerVisible: boolean
  playbackProgress: number // 0 to 100
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

  // Initialize Audio Element once
  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio
    return () => {
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [])

  // The Autonomous Driver: Loads and plays a specific chunk
  const handleNextChunk = useCallback(async (idx: number) => {
    if (!state.sessionId || idx >= state.totalChunks || !audioRef.current) return

    try {
      let url = preloadedBlobs.current[idx]
      if (!url) {
        const text = state.script[idx]?.text || ""
        const res = await podcastApi.getChunk(state.sessionId, idx, text)
        if (res.data instanceof Blob) {
           url = URL.createObjectURL(res.data)
           preloadedBlobs.current[idx] = url
        }
      }

      if (url && audioRef.current) {
        audioRef.current.src = url
        audioRef.current.play().catch(console.error)
        
        setState(prev => ({
          ...prev,
          currentIndex: idx,
          isPlaying: true,
          playbackProgress: prev.totalChunks > 0 ? ((idx + 1) / prev.totalChunks) * 100 : 0
        }))
      }
    } catch (e) {
      console.error("Chunk load failed:", e)
      // If one fails, try to skip to next
      if (idx + 1 < state.totalChunks) {
         handleNextChunk(idx + 1)
      }
    }
  }, [state.sessionId, state.script, state.totalChunks])

  const startPodcast = (resourceId: number, title: string, sessionId: number, script: any[]) => {
    // Revoke old URLs to prevent memory leaks
    Object.values(preloadedBlobs.current).forEach(url => URL.revokeObjectURL(url))
    preloadedBlobs.current = {}
    
    if (audioRef.current) {
      audioRef.current.src = ''
    }

    const safeScript = script || []
    setState({
      activeResourceId: resourceId,
      activeResourceTitle: title,
      sessionId: sessionId,
      script: safeScript,
      totalChunks: safeScript.length,
      currentIndex: 0,
      isPlaying: true,
      isMiniPlayerVisible: true,
      playbackProgress: safeScript.length > 0 ? (1 / safeScript.length) * 100 : 0
    })
  }

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
    if (audioRef.current?.src) {
        audioRef.current.play().catch(console.error)
        setState(prev => ({ ...prev, isPlaying: true }))
    } else if (state.sessionId) {
        handleNextChunk(state.currentIndex)
    }
  }

  const stop = () => {
    audioRef.current?.pause()
    if (audioRef.current) {
        audioRef.current.src = ''
    }
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

  const updateScript = (newScript: any[], newTotal: number) => {
    setState(prev => ({ ...prev, script: newScript, totalChunks: newTotal }))
  }

  const setCurrentIndex = (index: number) => {
    handleNextChunk(index)
  }

  // --- AUTOMATIC SEQUENCER & INITIAL TRIGGER ---
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !state.sessionId || !state.isPlaying) return

    const handleEnded = () => {
      const nextIdx = state.currentIndex + 1
      if (nextIdx < state.totalChunks) {
        handleNextChunk(nextIdx)
      } else {
        setState(prev => ({ ...prev, isPlaying: false }))
      }
    }

    audio.onended = handleEnded

    // Initial Trigger: Kickstart if we have a session/script but nothing is playing
    if (state.script.length > 0 && !audio.src) {
      handleNextChunk(0)
    }

    return () => { audio.onended = null }
  }, [state.sessionId, state.isPlaying, state.currentIndex, state.script.length, state.totalChunks, handleNextChunk])

  // --- BACKGROUND PRELOADER ---
  useEffect(() => {
    if (!state.sessionId || !state.isPlaying || state.script.length === 0) return

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
