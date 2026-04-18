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
  isChunkLoaded: boolean
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
  const hasKickstarted = useRef(false)

  // === LIVE REFS: Always hold the latest values, immune to stale closures ===
  const scriptRef = useRef<any[]>([])
  const totalChunksRef = useRef(0)
  const sessionIdRef = useRef<number | null>(null)
  const currentIndexRef = useRef(0)

  // Keep refs in sync with state
  useEffect(() => {
    scriptRef.current = state.script
    totalChunksRef.current = state.totalChunks
    sessionIdRef.current = state.sessionId
    currentIndexRef.current = state.currentIndex
  }, [state.script, state.totalChunks, state.sessionId, state.currentIndex])

  // 1. Create persistent Audio element
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = 1.0
    audioRef.current = audio
    return () => {
      audio.pause()
      audio.removeAttribute('src')
      audioRef.current = null
    }
  }, [])

  // 2. Core chunk loader — reads from REFS, not state, so it's never stale
  const handleNextChunk = useCallback(async (idx: number, autoPlay: boolean = true) => {
    const sid = sessionIdRef.current
    const script = scriptRef.current
    const total = totalChunksRef.current

    if (!sid || idx >= total || !audioRef.current) {
      console.warn(`handleNextChunk bail: sid=${sid}, idx=${idx}, total=${total}`)
      return
    }

    try {
      let url = preloadedBlobs.current[idx]
      if (!url) {
        const text = script[idx]?.text || ''
        const res = await podcastApi.getChunk(sid, idx, text)
        if (res.data instanceof Blob && res.data.size > 0) {
          url = URL.createObjectURL(res.data)
          preloadedBlobs.current[idx] = url
        }
      }

      if (!url || !audioRef.current) return

      const audio = audioRef.current
      audio.src = url
      audio.load()

      if (autoPlay) {
        try {
          await audio.play()
          setState(prev => ({ ...prev, isPlaying: true, currentIndex: idx, isChunkLoaded: true }))
        } catch (err) {
          console.warn('Autoplay blocked:', err)
          setState(prev => ({ ...prev, isPlaying: false, currentIndex: idx, isChunkLoaded: true }))
        }
      } else {
        setState(prev => ({ ...prev, currentIndex: idx, isChunkLoaded: true }))
      }
    } catch (e) {
      console.error('Chunk load failed for index', idx, e)
      if (idx + 1 < totalChunksRef.current) {
        handleNextChunk(idx + 1, autoPlay)
      }
    }
  }, []) // No state deps — reads from refs

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
    // Update refs immediately (before React batches the setState)
    scriptRef.current = safeScript
    totalChunksRef.current = safeScript.length
    sessionIdRef.current = sessionId
    currentIndexRef.current = 0

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
    if (audioRef.current && audioRef.current.readyState > 0) {
      try {
        await audioRef.current.play()
        setState(prev => ({ ...prev, isPlaying: true }))
        return
      } catch (e) {
        console.warn('Resume play() failed:', e)
      }
    }
    // Force-load the current chunk
    if (sessionIdRef.current && totalChunksRef.current > 0) {
      handleNextChunk(currentIndexRef.current, true)
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
    scriptRef.current = []
    totalChunksRef.current = 0
    sessionIdRef.current = null
    currentIndexRef.current = 0
    setState({
      isPlaying: false, activeResourceId: null, activeResourceTitle: '',
      sessionId: null, script: [], isMiniPlayerVisible: false,
      playbackProgress: 0, currentIndex: 0, totalChunks: 0, isChunkLoaded: false,
    })
  }

  const setMiniPlayerVisible = (visible: boolean) => {
    setState(prev => ({ ...prev, isMiniPlayerVisible: visible }))
  }

  const updateScript = useCallback((newScript: any[], newTotal: number) => {
    // Update refs IMMEDIATELY so handleNextChunk sees the new data
    scriptRef.current = newScript
    totalChunksRef.current = newTotal
    setState(prev => ({ ...prev, script: newScript, totalChunks: newTotal }))
  }, [])

  const setCurrentIndex = useCallback((index: number) => {
    // Clear any preloaded blob for this index to force a fresh fetch
    if (preloadedBlobs.current[index]) {
      URL.revokeObjectURL(preloadedBlobs.current[index])
      delete preloadedBlobs.current[index]
    }
    handleNextChunk(index, true)
  }, [handleNextChunk])

  // 4. Smooth progress
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTimeUpdate = () => {
      if (!audio.duration || totalChunksRef.current === 0) return
      const chunkFrac = audio.currentTime / audio.duration
      const globalPct = ((currentIndexRef.current + chunkFrac) / totalChunksRef.current) * 100
      setState(prev => ({ ...prev, playbackProgress: globalPct }))
    }
    audio.addEventListener('timeupdate', onTimeUpdate)
    return () => audio.removeEventListener('timeupdate', onTimeUpdate)
  }, [])

  // 5. Auto-advance + kickstart
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !state.sessionId) return

    const handleEnded = () => {
      const next = currentIndexRef.current + 1
      if (next < totalChunksRef.current) {
        handleNextChunk(next, true)
      } else {
        setState(prev => ({ ...prev, isPlaying: false }))
      }
    }
    audio.onended = handleEnded

    if (state.script.length > 0 && !state.isChunkLoaded && !hasKickstarted.current) {
      hasKickstarted.current = true
      handleNextChunk(0, true)
    }

    return () => { audio.onended = null }
  }, [state.sessionId, state.script.length, state.isChunkLoaded, handleNextChunk])

  // 6. Background preloader
  useEffect(() => {
    if (!state.sessionId || state.script.length === 0) return
    const preload = async (idx: number) => {
      if (idx >= totalChunksRef.current || preloadedBlobs.current[idx]) return
      try {
        const text = scriptRef.current[idx]?.text || ''
        const res = await podcastApi.getChunk(sessionIdRef.current!, idx, text)
        if (res.data instanceof Blob && res.data.size > 0) {
          preloadedBlobs.current[idx] = URL.createObjectURL(res.data)
        }
      } catch (e) { /* silent */ }
    }
    preload(state.currentIndex + 1)
    preload(state.currentIndex + 2)
  }, [state.sessionId, state.currentIndex, state.script.length])

  return (
    <AudioContext.Provider value={{
      state, play, startPodcast, pause, resume, stop,
      setMiniPlayerVisible, updateScript, setCurrentIndex, audioRef,
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
