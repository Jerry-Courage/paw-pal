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

  // 1. Initialize Audio Element with persistent configuration
  useEffect(() => {
    const audio = new Audio()
    // Explicitly set properties for better browser compatibility
    audio.preload = 'auto'
    audioRef.current = audio
    
    return () => {
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [])

  // 2. The Autonomous Driver: Loads and plays a specific chunk
  const handleNextChunk = useCallback(async (idx: number, autoPlay: boolean = true) => {
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
        
        if (autoPlay) {
          try {
            await audioRef.current.play()
            setState(prev => ({ ...prev, isPlaying: true, currentIndex: idx }))
          } catch (err) {
            console.warn("Autoplay blocked or failed:", err)
            // If play fails, we stay on this segment but show "Play" button
            setState(prev => ({ ...prev, isPlaying: false, currentIndex: idx }))
          }
        } else {
            setState(prev => ({ ...prev, currentIndex: idx }))
        }
      }
    } catch (e) {
      console.error("Chunk load failed:", e)
      // Skip logic: if a chunk literally fails to load, try the next one
      if (idx + 1 < state.totalChunks) {
         handleNextChunk(idx + 1, autoPlay)
      }
    }
  }, [state.sessionId, state.script, state.totalChunks])

  // 3. Audio UI Actions
  const startPodcast = (resourceId: number, title: string, sessionId: number, script: any[]) => {
    // Revoke old URLs to prevent memory leaks
    Object.values(preloadedBlobs.current).forEach(url => URL.revokeObjectURL(url))
    preloadedBlobs.current = {}
    
    if (audioRef.current) {
      audioRef.current.pause()
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
      isPlaying: false, // Wait for first chunk play success
      isMiniPlayerVisible: true,
      playbackProgress: 0
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
      totalChunks: total !== undefined ? total : prev.totalChunks
    }))
  }

  const pause = () => {
    if (audioRef.current) {
        audioRef.current.pause()
    }
    setState(prev => ({ ...prev, isPlaying: false }))
  }

  const resume = async () => {
    if (audioRef.current && audioRef.current.src) {
        try {
            await audioRef.current.play()
            setState(prev => ({ ...prev, isPlaying: true }))
        } catch (e) {
            console.error("Resume failed:", e)
        }
    } else if (state.sessionId) {
        handleNextChunk(state.currentIndex, true)
    }
  }

  const stop = () => {
    if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
    }
    Object.values(preloadedBlobs.current).forEach(url => URL.revokeObjectURL(url))
    preloadedBlobs.current = {}
    setState({
      isPlaying: false,
      activeResourceId: null,
      activeResourceTitle: '',
      sessionId: null,
      script: [],
      isMiniPlayerVisible: false,
      playbackProgress: 0,
      currentIndex: 0,
      totalChunks: 0
    })
  }

  const setMiniPlayerVisible = (visible: boolean) => {
    setState(prev => ({ ...prev, isMiniPlayerVisible: visible }))
  }

  const updateScript = (newScript: any[], newTotal: number) => {
    setState(prev => ({ ...prev, script: newScript, totalChunks: newTotal }))
  }

  const setCurrentIndex = (index: number) => {
    handleNextChunk(index, true)
  }

  // 4. Smooth Progress Tracker (TimeUpdate)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      if (!audio.duration || state.totalChunks === 0) return
      
      // Calculate local progress (current chunk)
      const chunkProgress = audio.currentTime / audio.duration
      // Calculate global progress
      const globalProgress = ((state.currentIndex + chunkProgress) / state.totalChunks) * 100
      
      setState(prev => ({ ...prev, playbackProgress: globalProgress }))
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [state.currentIndex, state.totalChunks])

  // 5. Automatic Sequencer & Kickstart Trigger
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !state.sessionId) return

    const handleEnded = () => {
      const nextIdx = state.currentIndex + 1
      if (nextIdx < state.totalChunks) {
        handleNextChunk(nextIdx, true)
      } else {
        setState(prev => ({ ...prev, isPlaying: false }))
      }
    }

    audio.onended = handleEnded

    // Kickstart logic: If we have a script but haven't started yet
    if (state.script.length > 0 && !audio.src) {
      handleNextChunk(0, true)
    }

    return () => { audio.onended = null }
  }, [state.sessionId, state.currentIndex, state.script.length, state.totalChunks, handleNextChunk])

  // 6. Background Preloader (Advanced)
  useEffect(() => {
    if (!state.sessionId || state.script.length === 0) return

    const preload = async (idx: number) => {
      if (idx >= state.totalChunks || preloadedBlobs.current[idx]) return
      try {
        const text = state.script[idx]?.text || ""
        const res = await podcastApi.getChunk(state.sessionId!, idx, text)
        if (res.data instanceof Blob) {
          preloadedBlobs.current[idx] = URL.createObjectURL(res.data)
        }
      } catch (e) {
        console.error("Global preload failed for chunk", idx, e)
      }
    }

    // Preload next 2 chunks
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
