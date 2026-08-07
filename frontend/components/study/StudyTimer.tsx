'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Settings, Play, Pause, RotateCcw, Volume2, VolumeX, Coffee, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TimerSettings {
  workMinutes: number
  breakMinutes: number
  longBreakMinutes: number
  sessionsBeforeLongBreak: number
}

const PRESETS: { label: string; settings: TimerSettings }[] = [
  { label: 'Pomodoro', settings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsBeforeLongBreak: 4 } },
  { label: 'Deep Focus', settings: { workMinutes: 50, breakMinutes: 10, longBreakMinutes: 20, sessionsBeforeLongBreak: 3 } },
  { label: 'Sprint', settings: { workMinutes: 15, breakMinutes: 3, longBreakMinutes: 10, sessionsBeforeLongBreak: 5 } },
  { label: 'Marathon', settings: { workMinutes: 90, breakMinutes: 15, longBreakMinutes: 30, sessionsBeforeLongBreak: 2 } },
]

interface StudyTimerProps {
  onTick?: (elapsedSeconds: number) => void
  onComplete?: () => void
  onBreakStart?: (isLong: boolean) => void
  onBreakEnd?: () => void
}

export default function StudyTimer({ onTick, onComplete, onBreakStart, onBreakEnd }: StudyTimerProps) {
  const [settings, setSettings] = useState<TimerSettings>(PRESETS[0].settings)
  const [showSettings, setShowSettings] = useState(false)
  const [mode, setMode] = useState<'work' | 'break'>('work')
  const [isLongBreak, setIsLongBreak] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(PRESETS[0].settings.workMinutes * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [sessionsCompleted, setSessionsCompleted] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [muted, setMuted] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const intervalRef = useRef<NodeJS.Timeout>()
  const totalDuration = mode === 'work' ? settings.workMinutes * 60 : (isLongBreak ? settings.longBreakMinutes : settings.breakMinutes) * 60

  // Play notification sound
  const playSound = useCallback((type: 'complete' | 'break') => {
    if (muted) return
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      if (type === 'complete') {
        // Cheerful completion sound
        osc.frequency.setValueAtTime(523.25, ctx.currentTime) // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15) // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3) // G5
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.5)
      } else {
        // Gentle break start sound
        osc.frequency.setValueAtTime(440, ctx.currentTime) // A4
        osc.frequency.setValueAtTime(392, ctx.currentTime + 0.2) // G4
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.4)
      }
    } catch (e) { /* audio not supported */ }
  }, [muted])

  // Timer tick
  useEffect(() => {
    if (!isRunning) return
    intervalRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(intervalRef.current)
          // Timer completed
          if (mode === 'work') {
            playSound('complete')
            const newSessions = sessionsCompleted + 1
            setSessionsCompleted(newSessions)
            onComplete?.()

            if (newSessions % settings.sessionsBeforeLongBreak === 0) {
              setIsLongBreak(true)
              setMode('break')
              setSecondsLeft(settings.longBreakMinutes * 60)
              onBreakStart?.(true)
            } else {
              setIsLongBreak(false)
              setMode('break')
              setSecondsLeft(settings.breakMinutes * 60)
              onBreakStart?.(false)
            }
          } else {
            // Break completed
            playSound('break')
            setMode('work')
            setSecondsLeft(settings.workMinutes * 60)
            onBreakEnd?.()
          }
          setIsRunning(false)
          return 0
        }
        setElapsed(e => e + 1)
        onTick?.(elapsed + 1)
        return s - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [isRunning, mode, sessionsCompleted, settings, playSound, onTick, onComplete, onBreakStart, onBreakEnd, elapsed])

  const reset = () => {
    setIsRunning(false)
    setMode('work')
    setSecondsLeft(settings.workMinutes * 60)
    setElapsed(0)
    setSessionsCompleted(0)
    setIsLongBreak(false)
  }

  const progress = 1 - secondsLeft / totalDuration
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const circumference = 2 * Math.PI * 54
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div className="bg-surface-container-high rounded-[1.5rem] border border-outline-variant/20 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-bold text-on-surface text-[14px] flex items-center gap-2">
          {mode === 'work' ? (
            <Zap className="w-4 h-4 text-primary" />
          ) : (
            <Coffee className="w-4 h-4 text-amber-500" />
          )}
          {mode === 'work' ? 'Focus Timer' : (isLongBreak ? 'Long Break' : 'Short Break')}
        </h4>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMuted(!muted)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-4 p-3 bg-surface-container rounded-xl border border-outline-variant/20 space-y-3 animate-in slide-in-from-top-2">
          <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Presets</p>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => {
                  setSettings(preset.settings)
                  setSecondsLeft(preset.settings.workMinutes * 60)
                  setIsRunning(false)
                  setMode('work')
                }}
                className={cn(
                  "px-3 py-2 rounded-lg text-[12px] font-bold transition-all border",
                  settings === preset.settings
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Focus</label>
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={settings.workMinutes}
                  onChange={e => setSettings(s => ({ ...s, workMinutes: parseInt(e.target.value) || 25 }))}
                  className="w-16 px-2 py-1 text-[12px] font-bold bg-surface-container-high border border-outline-variant/20 rounded-lg text-on-surface text-center focus:outline-none focus:border-primary"
                />
                <span className="text-[10px] text-on-surface-variant">min</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Break</label>
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.breakMinutes}
                  onChange={e => setSettings(s => ({ ...s, breakMinutes: parseInt(e.target.value) || 5 }))}
                  className="w-16 px-2 py-1 text-[12px] font-bold bg-surface-container-high border border-outline-variant/20 rounded-lg text-on-surface text-center focus:outline-none focus:border-primary"
                />
                <span className="text-[10px] text-on-surface-variant">min</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timer Circle */}
      <div className="relative w-32 h-32 mx-auto mb-4">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="6"
            className="text-surface-container-low" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            stroke={mode === 'work' ? 'var(--color-primary)' : 'var(--color-amber-500)'}
            strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[32px] font-bold text-on-surface font-mono tracking-wider">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
            {mode === 'work' ? 'Focus' : 'Break'}
          </span>
        </div>
      </div>

      {/* Session dots */}
      <div className="flex justify-center gap-1.5 mb-4">
        {Array.from({ length: settings.sessionsBeforeLongBreak }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-2 h-2 rounded-full transition-all",
              i < sessionsCompleted % settings.sessionsBeforeLongBreak
                ? "bg-primary scale-110"
                : "bg-surface-container-low"
            )}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className={cn(
            "flex-1 py-2.5 rounded-xl font-bold text-[13px] transition-all flex items-center justify-center gap-2",
            mode === 'work'
              ? "bg-primary text-on-primary hover:bg-primary/80"
              : "bg-amber-500 text-white hover:bg-amber-600"
          )}
        >
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'Pause' : 'Start'}
        </button>
        <button
          onClick={reset}
          className="px-3 py-2.5 rounded-xl font-bold text-[13px] bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-all border border-outline-variant/30"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
