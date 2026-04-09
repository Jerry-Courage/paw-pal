'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export type SpeechState = 'idle' | 'waking' | 'listening' | 'thinking' | 'speaking' | 'error'

interface UseSpeechExchangeProps {
  onCommand: (query: string) => void
  isVoiceResponseEnabled: boolean
}

export const useSpeechExchange = ({ onCommand, isVoiceResponseEnabled }: UseSpeechExchangeProps) => {
  const [state, setState] = useState<SpeechState>('idle')
  const [error, setError] = useState<string | null>(null)
  
  const commandHandlerRef = useRef(onCommand)
  const isEnabledRef = useRef(false) // Master toggle for the engine
  const stateRef = useRef<SpeechState>('idle')
  const recognitionRef = useRef<any>(null)
  const isStartedRef = useRef(false) // Tracking if .start() has been successfully called
  const silenceTimerRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // Keep refs up to date without triggering engine restarts
  useEffect(() => {
    commandHandlerRef.current = onCommand
  }, [onCommand])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Process Transcription
  const handleResult = (event: any) => {
    // Ignore input if we are currently speaking or thinking
    if (stateRef.current === 'speaking' || stateRef.current === 'thinking') return

    let interimTranscript = ''
    let finalTranscript = ''

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript.toLowerCase()
      if (event.results[i].isFinal) finalTranscript += transcript
      else interimTranscript += transcript
    }

    const currentText = (finalTranscript || interimTranscript).trim()
    if (!currentText) return

    // Debug what the mic is hearing while in idle state
    if (stateRef.current === 'idle' || stateRef.current === 'waking') {
      console.log(`[Speech Debug] Hearing: "${currentText}"`)
    }

    // REGEX for Wake Words - handles phonetic variations and punctuation
    // Added \b (word boundaries) to prevent words like "details", "daily", or "main" from triggering "ai"
    const WAKE_PATTERN = /\b(flow|flo|ai|low|glo|flare)\b/i

    // 1. & 2. Handle PASSIVE and ACTIVE LISTENING
    let currentState = stateRef.current

    // Look for Wake Word if we are idle
    if (currentState === 'idle' || currentState === 'waking') {
      if (WAKE_PATTERN.test(currentText)) {
        console.log('[Speech] Wake word triggered by:', currentText)
        
        // PREMIUM CHIME: Double-tone acoustic feedback
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
          const now = ctx.currentTime
          
          // Note 1 (E5)
          const osc1 = ctx.createOscillator()
          const gain1 = ctx.createGain()
          osc1.type = 'sine'
          osc1.frequency.setValueAtTime(659.25, now)
          gain1.gain.setValueAtTime(0.05, now)
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
          osc1.connect(gain1)
          gain1.connect(ctx.destination)
          
          // Note 2 (A5) - slightly delayed for a "bling" effect
          const osc2 = ctx.createOscillator()
          const gain2 = ctx.createGain()
          osc2.type = 'sine'
          osc2.frequency.setValueAtTime(880, now + 0.05)
          gain2.gain.setValueAtTime(0, now)
          gain2.gain.setValueAtTime(0.04, now + 0.05)
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
          osc2.connect(gain2)
          gain2.connect(ctx.destination)
          
          osc1.start(now)
          osc1.stop(now + 0.15)
          osc2.start(now + 0.05)
          osc2.stop(now + 0.2)
        } catch (e) {}

        setState('listening')
        currentState = 'listening'
      }
    }

    // Capture Command if we are listening (either already or just now)
    if (currentState === 'listening') {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)

      // Set to 2s for more "natural" pauses as requested (ChatGPT style)
      silenceTimerRef.current = setTimeout(() => {
        if (stateRef.current === 'listening') {
          const commandText = currentText.replace(WAKE_PATTERN, '').trim()
          
          if (commandText && commandText.length > 2) {
            console.log('[Speech] Extracted command:', commandText)
            setState('thinking')
            commandHandlerRef.current(commandText)

            // BUFFER RESET: Stop recognition to clear memory
            if (recognitionRef.current) {
                try { recognitionRef.current.stop() } catch (e) {}
            }
          } else {
            console.log('[Speech] No substantial command found, returning to idle.')
            setState('idle')
          }
        }
      }, 2000)
    }
  }

  // Initialize Speech Recognition once
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = handleResult
    
    recognition.onend = () => {
      isStartedRef.current = false
      // Auto-restart if the master toggle is still ON
      // CRITICAL: Exit if we are currently speaking, to let playAudio/speak handle the restart after cooldown
      if (isEnabledRef.current && stateRef.current !== 'speaking') {
        console.log('[Speech] Restarting engine...')
        setTimeout(() => {
          if (isEnabledRef.current && stateRef.current !== 'speaking' && !isStartedRef.current) {
            try { 
              recognition.start() 
              isStartedRef.current = true
            } catch (e) {}
          }
        }, 300)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('[Speech] Recognition error:', event.error)
      if (event.error === 'aborted') return // Ignore aborted, handled by onend
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
    console.log('[Speech] startListening called, active:', active)
    isEnabledRef.current = true
    setState(active ? 'listening' : 'idle')
    if (recognitionRef.current && !isStartedRef.current) {
      try { 
        recognitionRef.current.start() 
        isStartedRef.current = true
      } catch (e: any) {
        // If it fails because of no user gesture, we wait for the FIRST click on the page
        if (e.name === 'InvalidStateError' || e.message?.includes('interaction')) {
            console.log('[Speech] Waiting for user interaction to start mic...')
            const startOnGesture = () => {
                if (isEnabledRef.current) {
                    try { recognitionRef.current.start() } catch (err) {}
                }
                window.removeEventListener('click', startOnGesture)
            }
            window.addEventListener('click', startOnGesture)
        }
      }
    }
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
    if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (e) {}
    }

    const audio = new Audio(url)
    audioRef.current = audio
    audio.onplay = () => setState('speaking')
    audio.onended = () => {
        setState('idle')
        if (onEnd) onEnd()
        // COOLDOWN: Wait for echo to clear before restarting mic
        setTimeout(() => {
            if (isEnabledRef.current) {
                try { recognitionRef.current.start() } catch (e) {}
            }
        }, 500)
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
    if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (e) {}
    }

    utterance.onstart = () => setState('speaking')
    utterance.onend = () => {
        setState('idle')
        // COOLDOWN: Wait for echo to clear before restarting mic
        setTimeout(() => {
            if (isEnabledRef.current) {
                try { recognitionRef.current.start() } catch (e) {}
            }
        }, 500)
    }
    utterance.onerror = () => setState('idle')
    window.speechSynthesis.speak(utterance)
  }, [isVoiceResponseEnabled])

  return {
    state,
    isListening: state === 'listening' || state === 'idle' || state === 'waking',
    isSpeaking: state === 'speaking',
    isThinking: state === 'thinking',
    startListening,
    stopListening,
    speak,
    playAudio,
    error
  }
}
