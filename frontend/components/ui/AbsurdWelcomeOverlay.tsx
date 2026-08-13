'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Volume2, Sparkles, AlertTriangle, Play, HelpCircle } from 'lucide-react'

interface AbsurdWelcomeOverlayProps {
  userName: string
}

export default function AbsurdWelcomeOverlay({ userName }: AbsurdWelcomeOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [active, setActive] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const [funnyText, setFunnyText] = useState('INITIATING LAUNCH SEQUENCE...')
  const audioCtxRef = useRef<AudioContext | null>(null)

  const FUNNY_STEP_TEXTS = [
    'READY TO ABSOLUTELY SHRED EXAMS... 🔥', // 1
    'COMPILING GENIUS REASONING MATRICES... 🧠', // 2
    'PREPARING MULTIVERSAL SYLLABUS OVERLORD PROTOCOL... 🌌', // 3
    'BANISHING ALL PROCRASTINATION DEMONS... 👹', // 4
    'CONVERTING PANIC INTO PURE FOCUSED INTELLIGENCE... ⚡', // 5
    'UNLEASHING ACADEMIC WEAPON LEVEL 9000... 🔫', // 6
    'SYNCHRONIZING WITH MITOCHONDRIA ENERGY CENTERS... 🔋', // 7
    'CHARGING CAFFEINE TURBINES... 🚀', // 8
    'DOWNLOADING ENTIRE SYLLABUS INTO SYNAPSES... 💾', // 9
    'CALIBRATING SLEEP DEPRIVATION RATIO... ☕', // 10
  ]

  useEffect(() => {
    // Only show if not welcomed yet in this session
    if (typeof window !== 'undefined') {
      const welcomed = sessionStorage.getItem('fs_logged_in_welcomed')
      if (!welcomed) {
        setVisible(true)
      }
    }
  }, [])

  // ── Web Audio API Synthesizer ───────────────────────────────────────
  const playCrazyTheme = () => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    audioCtxRef.current = ctx

    const playNote = (freq: number, start: number, duration: number, type: 'sawtooth' | 'triangle' | 'square' = 'sawtooth') => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = type
      osc.frequency.setValueAtTime(freq, start)
      osc.frequency.exponentialRampToValueAtTime(freq / 2, start + duration)

      gain.gain.setValueAtTime(0.12, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(start)
      osc.stop(start + duration)
    }

    const scale = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25, 587.33, 659.25]
    const tempo = 150
    const noteLength = 60 / tempo / 2 // eighth notes
    let time = ctx.currentTime

    // Play a wacky 10-second laser retro beat
    for (let i = 0; i < 45; i++) {
      const noteFreq = scale[Math.floor(Math.random() * scale.length)] * (Math.random() > 0.6 ? 2 : 1)
      playNote(noteFreq, time, noteLength * 1.6, i % 3 === 0 ? 'sawtooth' : 'square')

      // Bass beat
      if (i % 2 === 0) {
        playNote(55.00, time, noteLength * 1.8, 'triangle')
      }

      // High pitch laser
      if (i % 4 === 2) {
        playNote(1200, time, 0.08, 'sawtooth')
      }

      time += noteLength
    }
  }

  // ── Web Speech Synthesis ──────────────────────────────────────────
  const speakWelcome = (name: string) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()

    const firstWord = name.split(' ')[0] || 'Scholar'
    const text = `WELCOME TO FLOWSTATE, ${firstWord.toUpperCase()}!!! UNLEASH THE ACADEMIC WEAPON WITHIN!!!`
    const utterance = new SpeechSynthesisUtterance(text)

    utterance.rate = 1.15 // Fast energetic speech
    utterance.pitch = 1.25 // Funny high voice
    utterance.volume = 1.0

    // Try to get a high-quality english voice
    const voices = window.speechSynthesis.getVoices()
    const engVoice = voices.find(v => v.lang.includes('en') && v.name.includes('Google')) || voices.find(v => v.lang.includes('en'))
    if (engVoice) {
      utterance.voice = engVoice
    }

    window.speechSynthesis.speak(utterance)
  }

  // ── Launch! ────────────────────────────────────────────────────────
  const handleLaunch = () => {
    setActive(true)
    sessionStorage.setItem('fs_logged_in_welcomed', 'true')

    // Start audio theme + voice
    playCrazyTheme()
    speakWelcome(userName)

    // Start 10 second countdown
    let count = 10
    setCountdown(count)
    setFunnyText(FUNNY_STEP_TEXTS[9])

    const interval = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(interval)
        setCountdown(0)
        setFunnyText('LIFT OFF!!! 🚀🚀🚀')
        setTimeout(() => {
          setVisible(false)
          // Clean up audio context
          if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => {})
          }
        }, 1200)
      } else {
        setCountdown(count)
        setFunnyText(FUNNY_STEP_TEXTS[count - 1] || 'BOOSTING CONCENTRATION...')
      }
    }, 1000)
  }

  if (!visible) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black overflow-hidden select-none font-mono">
        
        {/* Animated laser grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:30px_30px]" />
        
        {/* Neon laser lines floating when active */}
        {active && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden animate-pulse">
            <div className="absolute top-1/4 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-rose-500 to-transparent blur-md animate-bounce" style={{ animationDuration: '3s' }} />
            <div className="absolute top-2/3 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-fuchsia-500 to-transparent blur-md animate-bounce" style={{ animationDuration: '4s' }} />
            <div className="absolute top-1/2 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-violet-500 to-transparent blur-md animate-bounce" style={{ animationDuration: '2.5s' }} />
          </div>
        )}

        <div className="relative z-10 max-w-xl w-full mx-4 text-center space-y-8 px-6 py-10 rounded-[2.5rem] bg-[#0c001c]/80 border-2 border-primary/30 backdrop-blur-md shadow-[0_0_50px_rgba(139,92,246,0.3)]">
          
          {/* Header Warning */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-black uppercase tracking-widest animate-pulse">
              <AlertTriangle className="w-4 h-4" />
              <span>Warning: extreme intelligence ahead</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase leading-tight">
              {active ? (
                <span className="bg-gradient-to-r from-violet-400 via-pink-400 to-amber-400 bg-clip-text text-transparent animate-gradient-xy">
                  HYPER-DRIVE ENGAGED
                </span>
              ) : (
                "FlowState Launchpad"
              )}
            </h1>
          </div>

          {!active ? (
            // ── READY SCREEN ──
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-left space-y-4">
                <p className="text-[13px] text-white/70 leading-relaxed">
                  Welcome, <strong className="text-primary font-black uppercase">{userName}</strong>! The system has detected that you are ready to absolutely shred your curriculum.
                </p>
                <p className="text-[11px] text-white/40 italic">
                  Pressing the button will unleash the heavy-metal synth chiptune and configure your brainwave receptors for study mode. Autoplay is armed.
                </p>
              </div>

              <button
                onClick={handleLaunch}
                className="w-full relative group overflow-hidden py-5 rounded-3xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-600 text-white font-black text-[16px] shadow-[0_0_30px_rgba(219,39,119,0.3)] hover:shadow-rose-500/50 hover:scale-[1.02] active:scale-95 transition-all duration-200 border-b-4 border-pink-800"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <span className="flex items-center justify-center gap-2.5">
                  <Play className="w-5 h-5 fill-white" />
                  ACTIVATE ACADEMIC WEAPON ENGINE 🚀
                </span>
              </button>
            </div>
          ) : (
            // ── ACTIVE COUNTDOWN SCREEN ──
            <div className="space-y-8 animate-fade-in">
              {/* Spinning Rainbow Star */}
              <div className="relative flex justify-center py-4">
                <div className="absolute w-24 h-24 rounded-full bg-gradient-to-tr from-violet-600 to-rose-500 blur-2xl opacity-60 animate-spin" style={{ animationDuration: '4s' }} />
                <div className="relative z-10 w-20 h-20 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-4xl shadow-inner font-black select-none">
                  {countdown}
                </div>
              </div>

              {/* Status and instruction */}
              <div className="space-y-2">
                <div className="h-6 overflow-hidden">
                  <p className="text-[13px] font-black text-rose-400 uppercase tracking-wider animate-bounce">{funnyText}</p>
                </div>
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${(countdown / 10) * 100}%` }}
                  />
                </div>
              </div>

              {/* Laser Grid Spinner */}
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-black animate-pulse">
                DO NOT RESIST CONCENTRATION. THE SYLLABUS IS COMMITTED.
              </p>
            </div>
          )}

        </div>
      </div>
    </AnimatePresence>
  )
}
