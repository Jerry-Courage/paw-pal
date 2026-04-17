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
  playbackProgress: number
  sessionId: number | null
  script: any[]
  isChunkLoaded: boolean // NEW: tracks whether the audio element has a real chunk loaded
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
    isChunkLoaded: false,
  })

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const preloadedBlobs = useRef<Record<number, string>>({})
  // Track whether we've already kicked off chunk 0 so we don't do it twice
  const hasKickstarted = useRef(false)

  // 1. Create a persistent Audio element once
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = 1.0
    audioRef.current = audio
    return () => {
      audio.pause()
      if (audio.src) { audio.removeAttribute('src'); audio.load() }
      audioRef.current = null
    }
  }, [])

  // 2. The core chunk loader: fetches a blob from the backend, loads it into the Audio element, and optionally plays it
  const handleNextChunk = useCallback(async (idx: number, autoPlay: boolean = true) => {
    if (!state.sessionId || idx >= state.totalChunks || !audioRef.current) return

    try {
      // Fetch the blob (from preload cache or network)
      let url = preloadedBlobs.current[idx]
      if (!url) {
        const text = state.script[idx]?.text || ''
        const res = await podcastApi.getChunk(state.sessionId, idx, text)
        if (res.data instanceof Blob && res.data.size > 0) {
          url = URL.createObjectURL(res.data)
          preloadedBlobs.current[idx] = url
        }
      }

      if (!url || !audioRef.current) return

      const audio = audioRef.current
      // Set the source and force the browser to recognize it
      audio.src = url
      audio.load() // <-- CRITICAL: forces the browser to re-parse the new source

      if (autoPlay) {
        try {
          await audio.play()
          setState(prev => ({ ...prev, isPlaying: true, currentIndex: idx, isChunkLoaded: true }))
        } catch (err) {
          console.warn('Autoplay blocked:', err)
          // Mark isChunkLoaded so the user sees a Play button (not a spinner)
          setState(prev => ({ ...prev, isPlaying: false, currentIndex: idx, isChunkLoaded: true }))
        }
      } else {
        setState(prev => ({ ...prev, currentIndex: idx, isChunkLoaded: true }))
      }
    } catch (e) {
      console.error('Chunk load failed for index', idx, e)
      if (idx + 1 < state.totalChunks) {
        handleNextChunk(idx + 1, autoPlay)
      }
    }
  }, [state.sessionId, state.script, state.totalChunks])

  // 3. Public actions
  const startPodcast = (resourceId: number, title: string, sessionId: number, script: any[]) => {
    Object.values(preloadedBlobs.current).forEach(u => URL.revokeObjectURL(u))
    preloadedBlobs.current = {}
    hasKickstarted.current = false

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
    }

    const safeScript = script || []
    setState({
      activeResourceId: resourceId,
      activeResourceTitle: title,
      sessionId,
      script: safeScript,
      totalChunks: safeScript.length,
      currentIndex: 0,
      isPlaying: false,
      isMiniPlayerVisible: true,
      playbackProgress: 0,
      isChunkLoaded: false,
    })
  }

  const play = (resourceId: number, title: string, src?: string, index?: number, total?: number) => {
    if (src && audioRef.current) {
      audioRef.current.src = src
      audioRef.current.load()
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
    }))
  }

  const pause = () => {
    audioRef.current?.pause()
    setState(prev => ({ ...prev, isPlaying: false }))
  }

  const resume = async () => {
    // If we have a loaded chunk, just call play() on the existing element
    if (state.isChunkLoaded && audioRef.current) {
      try {
        await audioRef.current.play()
        setState(prev => ({ ...prev, isPlaying: true }))
        return
      } catch (e) {
        console.warn('Resume play() failed:', e)
      }
    }
    // Otherwise, force-load the current chunk from scratch
    if (state.sessionId && state.totalChunks > 0) {
      handleNextChunk(state.currentIndex, true)
    }
  }

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
    }
    Object.values(preloadedBlobs.current).forEach(u => URL.revokeObjectURL(u))
    preloadedBlobs.current = {}
    hasKickstarted.current = false
    setState({
      isPlaying: false,
      activeResourceId: null,
      activeResourceTitle: '',
      sessionId: null,
      script: [],
      isMiniPlayerVisible: false,
      playbackProgress: 0,
      currentIndex: 0,
      totalChunks: 0,
      isChunkLoaded: false,
    })
  }

  const setMiniPlayerVisible = (visible: boolean) => {
    setState(prev => ({ ...prev, isMiniPlayerVisible: visible }))
  }

  const updateScript = useCallback((newScript: any[], newTotal: number) => {
    setState(prev => ({
      ...prev,
      script: newScript,
      totalChunks: newTotal,
    }))
  }, [])

  const setCurrentIndex = (index: number) => {
    handleNextChunk(index, true)
  }

  // 4. Smooth progress via timeupdate
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTimeUpdate = () => {
      if (!audio.duration || state.totalChunks === 0) return
      const chunkFrac = audio.currentTime / audio.duration
      const globalPct = ((state.currentIndex + chunkFrac) / state.totalChunks) * 100
      setState(prev => ({ ...prev, playbackProgress: globalPct }))
    }
    audio.addEventListener('timeupdate', onTimeUpdate)
    return () => audio.removeEventListener('timeupdate', onTimeUpdate)
  }, [state.currentIndex, state.totalChunks])

  // 5. Auto-advance to next chunk when current finishes + initial kickstart
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !state.sessionId) return

    // onended → play next segment
    const handleEnded = () => {
      const next = state.currentIndex + 1
      if (next < state.totalChunks) {
        handleNextChunk(next, true)
      } else {
        setState(prev => ({ ...prev, isPlaying: false }))
      }
    }
    audio.onended = handleEnded

    // Kickstart: if we have a script and haven't started yet, load chunk 0
    if (state.script.length > 0 && !state.isChunkLoaded && !hasKickstarted.current) {
      hasKickstarted.current = true
      handleNextChunk(0, true)
    }

    return () => { audio.onended = null }
  }, [state.sessionId, state.currentIndex, state.script.length, state.totalChunks, state.isChunkLoaded, handleNextChunk])

  // 6. Background preloader
  useEffect(() => {
    if (!state.sessionId || state.script.length === 0) return
    const preload = async (idx: number) => {
      if (idx >= state.totalChunks || preloadedBlobs.current[idx]) return
      try {
        const text = state.script[idx]?.text || ''
        const res = await podcastApi.getChunk(state.sessionId!, idx, text)
        if (res.data instanceof Blob && res.data.size > 0) {
          preloadedBlobs.current[idx] = URL.createObjectURL(res.data)
        }
      } catch (e) { /* preload failures are silent */ }
    }
    preload(state.currentIndex + 1)
    preload(state.currentIndex + 2)
  }, [state.sessionId, state.currentIndex, state.script, state.totalChunks])

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
      audioRef,
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
