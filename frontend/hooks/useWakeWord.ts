'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

interface UseWakeWordProps {
  onWake: () => void
}

export function useWakeWord({ onWake }: UseWakeWordProps) {
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const isEnabledRef = useRef(false)

  const startListening = useCallback(() => {
    if (recognitionRef.current || isEnabledRef.current) return
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.warn('Wake word engine not supported in this browser.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      let interimTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) continue
        interimTranscript += event.results[i][0].transcript.toLowerCase()
      }

      // Look for the "Flow" wake word variations
      if (/\b(flow|flo|hello flow|hey flow|hi flow|ok flow|glow|flaw|floor|low)\b/i.test(interimTranscript)) {
        console.log('[Wake] Flow Awakened!')
        onWake()
      }
    }

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => {
      setIsListening(false)
      // Persistence: Restart if still enabled
      if (isEnabledRef.current) {
        try { recognition.start() } catch (e) {}
      }
    }

    recognitionRef.current = recognition
    isEnabledRef.current = true
    
    try {
      recognition.start()
    } catch (err) {
      console.error('[Wake] Engine Start Error:', err)
    }
  }, [onWake])

  const stopListening = useCallback(() => {
    isEnabledRef.current = false
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  return { isListening, startListening, stopListening }
}
