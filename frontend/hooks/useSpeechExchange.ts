'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'

export type SpeechState = 'idle' | 'waking' | 'listening' | 'thinking' | 'speaking' | 'error'

interface UseSpeechExchangeProps {
  onCommand?: (query: string) => void
  onWake?: () => void
  isVoiceResponseEnabled: boolean
}

export const useSpeechExchange = ({ onCommand, onWake, isVoiceResponseEnabled }: UseSpeechExchangeProps) => {
  const [state, setState] = useState<SpeechState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isHearing, setIsHearing] = useState(false)
  const [isStarted, setIsStarted] = useState(false)
  const [micVolume, setMicVolume] = useState(0)
  const [rawTranscription, setRawTranscription] = useState('')
  
  const commandHandlerRef = useRef(onCommand)
  const isEnabledRef = useRef(false) // Master toggle for the engine
  const stateRef = useRef<SpeechState>('idle')
  const recognitionRef = useRef<any>(null)
  const isStartedRef = useRef(false) // Tracking if .start() has been successfully called
  const silenceTimerRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const handleResultRef = useRef<any>(null)
  const [isAwake, setIsAwake] = useState(false)
  const isAwakeRef = useRef(false) // Mirrored ref for the high-speed engine
  const sessionTimeoutRef = useRef<any>(null)
  const analyzerRef = useRef<any>(null)
  const animationFrameRef = useRef<any>(null)
  const isSpeakingSyncRef = useRef(false) // IRON-CLAD SHIELD: Synchronous master lock
  
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    isAwakeRef.current = isAwake
  }, [isAwake])

  // Process Transcription
  const handleResult = useCallback((event: any) => {
    // IRON-CLAD SHIELD: If the master lock is ON, we DROP all input immediately
    if (isSpeakingSyncRef.current) {
        console.warn('[Speech] Iron-Clad Shield BLOCKED result (AI Speaking)')
        return
    }
    
    // Ignore input if we are currently speaking or thinking
    if (stateRef.current === 'speaking' || stateRef.current === 'thinking') {
        console.warn(`[Speech] Input DROP: Current state is ${stateRef.current}`)
        return
    }

    let interimTranscript = ''
    let finalTranscript = ''

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript.toLowerCase()
      if (event.results[i].isFinal) finalTranscript += transcript
      else interimTranscript += transcript
    }

    const currentText = (finalTranscript || interimTranscript).trim()

    // Strip punctuation for much higher accuracy
    const cleanCurrentText = currentText.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    
    // Log EVERY result with higher visibility
    console.log(`[Speech Debug] Hearing: "${cleanCurrentText}" (Raw: "${currentText}")`)
    setRawTranscription(cleanCurrentText)

    if (!cleanCurrentText) return

    // REGEX for Wake Words - highly expanded
    const WAKE_PATTERN = /\b(flow|flo|ai|low|glo|flare|hey flow|hi flow|ok flow|hello flow|hey ai|hi ai|ok ai|floor|flaw|flow state|glow|blow|slow|load|show|auto|oh|yo flow|hey flo|activate)\b/i

    // Look for Wake Word ONLY if we are not already awake
    if (!isAwakeRef.current) {
      if (WAKE_PATTERN.test(cleanCurrentText)) {
        console.log('[Speech] Wake word triggered! Session Unlocked.')
        setIsAwake(true)
        
        // PREMIUM CHIME: Double-tone acoustic feedback
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
          const now = ctx.currentTime
          const osc1 = ctx.createOscillator()
          const gain1 = ctx.createGain()
          osc1.frequency.setValueAtTime(659.25, now)
          gain1.gain.setValueAtTime(0.05, now)
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
          osc1.connect(gain1); gain1.connect(ctx.destination)
          const osc2 = ctx.createOscillator()
          const gain2 = ctx.createGain()
          osc2.frequency.setValueAtTime(880, now + 0.05)
          gain2.gain.setValueAtTime(0, now); gain2.gain.setValueAtTime(0.04, now + 0.05)
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
          osc2.connect(gain2); gain2.connect(ctx.destination)
          osc1.start(now); osc1.stop(now + 0.15); osc2.start(now + 0.05); osc2.stop(now + 0.2)
        } catch (e) {}

        setState('listening')
        if (onWake) onWake()
      }
    } else {
      // If we ARE awake, we are naturally in the listening state
      if (stateRef.current === 'idle') setState('listening')
    }

    // Capture Command logic (The "Always-Active" part of the session)
    if (isAwakeRef.current) {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        if (sessionTimeoutRef.current) clearTimeout(sessionTimeoutRef.current)

        // Set the conversation silence timer - 1.5s (The "Sweet Spot" for natural breathing)
        silenceTimerRef.current = setTimeout(() => {
          if (stateRef.current === 'listening') {
            const commandText = cleanCurrentText.replace(WAKE_PATTERN, '').trim()
            
            if (commandText && commandText.length > 2) {
              console.log('[Speech] Extracted command:', commandText)
              setState('thinking')
              
              // SAFETY: Reset to idle if AI takes >10s to reply
              setTimeout(() => {
                if (stateRef.current === 'thinking') {
                  console.log('[Speech] Thinking timed out. Resetting ears...')
                  setState('idle')
                }
              }, 10000)

              commandHandlerRef.current?.(commandText)
            } else {
              // No command yet, but stay awake for the session
              setState('idle')
            }
          }
        }, 1500)

        // Reset the session (Go back to sleep) after 30s of total silence
        sessionTimeoutRef.current = setTimeout(() => {
            console.log('[Speech] Session timed out. Falling asleep...')
            setIsAwake(false)
            setState('idle')
            toast('Flow is going to sleep. Say "Flow" to wake him up.', { 
                icon: '😴',
                duration: 3000 
            })
        }, 30000)
    }
  }, [])

  // Keep refs up to date
  useEffect(() => {
    commandHandlerRef.current = onCommand
    handleResultRef.current = handleResult
  }, [onCommand, handleResult])

  // Initialize Speech Recognition once
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported')
      return
    }

    const recognition = new SpeechRecognition()
    // SWITCH TO PULSING MODE: continuous=false is often more reliable for wake-words
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    // This is the core fix: Use a Ref to ensure the listener never goes stale
    recognition.onresult = (e: any) => {
        // HEARTBEAT: Global confirmation that browser is sending data
        console.log('[Speech] Event: Result received from browser engine')
        if (handleResultRef.current) handleResultRef.current(e)
    }

    recognition.onstart = () => {
        console.log('[Speech] Mic onstart - Listening...')
        setIsStarted(true)
    }
    recognition.onspeechstart = () => console.log('[Speech] Mic onspeechstart - Detecting Voice...')
    recognition.onsoundstart = () => console.log('[Speech] Mic onsoundstart - Detecting Sound...')
    
    recognition.onend = () => {
      isStartedRef.current = false
      setIsStarted(false)
      // ACOUSTIC SHIELD: Never restart the mic if we are speaking or thinking
      const shouldMute = isSpeakingSyncRef.current || stateRef.current === 'speaking' || stateRef.current === 'thinking'
      
      if (isEnabledRef.current && !shouldMute) {
        // TIGHT PULSE: 50ms recovery for a persistent session
        setTimeout(() => {
          if (isEnabledRef.current && !isSpeakingSyncRef.current && !isStartedRef.current) {
            try { 
              // HARD FLUSH: Clear any stalled browser sessions
              recognition.abort()
              setTimeout(() => {
                 recognition.start() 
                 isStartedRef.current = true
              }, 10)
            } catch (e) {}
          }
        }, 50)
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return // Silence timeouts
      
      console.error('[Speech] Critical Recognition error:', event.error)
      if (event.error === 'not-allowed') {
        setState('error')
        setError('Microphone access denied.')
      }
    }

    recognitionRef.current = recognition

    return () => {
      isEnabledRef.current = false
      if (recognitionRef.current) {
        recognitionRef.current.onend = null
        recognitionRef.current.stop()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startListening = useCallback((active: boolean = false) => {
    console.log('[Speech] startListening called. Mode:', active ? 'DIRECT (Always Listening)' : 'PASSIVE (Waiting for Flow)')
    isEnabledRef.current = true
    setState(active ? 'listening' : 'idle')
    if (recognitionRef.current && !isStartedRef.current) {
      try { 
        recognitionRef.current.start() 
        isStartedRef.current = true
        console.log('[Speech] Voice engine started successfully.')
      } catch (e: any) {
        // If it fails because of no user gesture, we wait for the FIRST click on the page
        if (e.name === 'InvalidStateError' || e.message?.includes('interaction')) {
            console.log('[Speech] Waiting for user interaction to start mic...')
            // Use toast to alert the user politely
            toast('Click anywhere to enable voice control', {
              id: 'voice-permission-hint',
              icon: '🎙️',
              duration: 5000
            })

            const startOnGesture = () => {
                if (isEnabledRef.current && !isStartedRef.current) {
                    try { 
                      recognitionRef.current.abort()
                      setTimeout(() => {
                        recognitionRef.current.start()
                        isStartedRef.current = true
                      }, 50)
                      toast.success('Hands-Free Engine Unlocked', { id: 'voice-permission-hint', duration: 3000 })
                    } catch (err) {}
                }
                // Cleanup ALL listeners
                window.removeEventListener('click', startOnGesture, true)
                window.removeEventListener('keydown', startOnGesture, true)
                window.removeEventListener('touchstart', startOnGesture, true)
            }
            // Use CAPTURING mode to ensure we catch the gesture before it's swallowed
            window.addEventListener('click', startOnGesture, true)
            window.addEventListener('keydown', startOnGesture, true)
            window.addEventListener('touchstart', startOnGesture, true)
        }
      }
    }

    // HARDWARE UNLOCK: We disable the volume analyzer to prevent mic-stream competition
    /*
    try {
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext)
        if (AudioCtx) {
            const tempCtx = new AudioCtx()
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                const source = tempCtx.createMediaStreamSource(stream)
                const analyzer = tempCtx.createAnalyser()
                analyzer.fftSize = 256
                source.connect(analyzer)
                analyzerRef.current = analyzer

                const dataArray = new Uint8Array(analyzer.frequencyBinCount)
                const updateVolume = () => {
                    if (analyzerRef.current) {
                        analyzerRef.current.getByteFrequencyData(dataArray)
                        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length
                        setMicVolume(avg)
                        animationFrameRef.current = requestAnimationFrame(updateVolume)
                    }
                }
                updateVolume()
            }).catch(() => {})
        }
    } catch (e) {}
    */

  }, [])

  const forceSession = useCallback(() => {
    setIsAwake(true)
    setState('listening')
    toast.success('Manual Session Started', { icon: '🎙️' })
  }, [])

  const stopListening = useCallback(() => {
    console.log('[Speech] stopListening called')
    isEnabledRef.current = false
    setState('idle')
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) {}
    }
    window.speechSynthesis.cancel()
    if (audioRef.current) audioRef.current.pause()
  }, [])

  const playAudio = useCallback((url: string, onEnd?: () => void) => {
    if (!isVoiceResponseEnabled || !url) {
        if (stateRef.current === 'thinking') setState('idle')
        if (onEnd) onEnd()
        return
    }

    // EAR MUTE: Stop listening while Flow is talking
    isSpeakingSyncRef.current = true // LOCK EARS INSTANTLY
    setState('speaking') // Set state BEFORE stopping to lock the restarter
    if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (e) {}
    }

    const audio = new Audio(url)
    audioRef.current = audio
    audio.onplay = () => setState('speaking')
    audio.onended = () => {
        setState('idle')
        if (onEnd) onEnd()
        // COOLDOWN: Wait for room-reverb to vanish before unlocking ears (1.2s)
        setTimeout(() => {
            isSpeakingSyncRef.current = false // UNLOCK EARS
            if (isEnabledRef.current) {
                try { recognitionRef.current.start() } catch (e) {}
            }
        }, 1200)
    }
    audio.onerror = () => {
        setState('idle')
        if (onEnd) onEnd()
    }
    audio.play().catch(() => {
        setState('idle')
        if (onEnd) onEnd()
    })
  }, [isVoiceResponseEnabled])

  const speak = useCallback((text: string) => {
    if (!isVoiceResponseEnabled || !text) {
        if (stateRef.current === 'thinking') setState('idle')
        return
    }
    
    // Final bulletproof cleaning for local speech synthesis
    const cleanText = text
      .split('ACTION:')[0]
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/[*_#~`]/g, '')       // Remove bold, italic, strikethrough, etc.
      .replace(/^\s*[\d\-.*()]+\s+/gm, '') // Remove list indicators and bullets
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '') // Remove emojis (surrogate pairs)
      .replace(/[\u2600-\u27BF]/g, '')                // Remove 2-byte emojis
      .replace(/\s+/g, ' ')          // Collapse multiple spaces
      .trim()

    if (!cleanText) {
        setState('idle')
        return
    }

    const utterance = new SpeechSynthesisUtterance(cleanText)
    
    // EAR MUTE: Stop listening while Flow is talking
    isSpeakingSyncRef.current = true // LOCK EARS INSTANTLY
    if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (e) {}
    }

    utterance.onstart = () => setState('speaking')
    utterance.onend = () => {
        setState('idle')
        // COOLDOWN: Wait for room-reverb to vanish before unlocking ears (1.2s)
        setTimeout(() => {
            isSpeakingSyncRef.current = false // UNLOCK EARS
            if (isEnabledRef.current) {
                try { recognitionRef.current.start() } catch (e) {}
            }
        }, 1200)
    }
    utterance.onerror = () => setState('idle')
    window.speechSynthesis.speak(utterance)
  }, [isVoiceResponseEnabled])

  // Initial priming
  useEffect(() => {
    startListening(false)
  }, [startListening])

  return {
    state,
    isListening: state === 'listening' || state === 'idle' || state === 'waking',
    isSpeaking: state === 'speaking',
    isThinking: state === 'thinking',
    isStarted,
    isAwake,
    isHearing,
    micVolume,
    rawTranscription,
    forceSession,
    startListening,
    stopListening,
    speak,
    playAudio,
    error
  }
}
