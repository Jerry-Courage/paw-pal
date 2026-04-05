'use client'

import { useState, useEffect, useRef } from 'react'
import { Play, Pause, RotateCcw, X, Sparkles, Coffee, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { authApi } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  session?: { title: string; duration_minutes?: number }
  onClose: () => void
}

type Mode = 'focus' | 'break'

export default function FocusTimer({ session, onClose }: Props) {
  const defaultMinutes = session?.duration_minutes || 25
  const [mode, setMode] = useState<Mode>('focus')
  const [totalSeconds, setTotalSeconds] = useState(defaultMinutes * 60)
  const [secondsLeft, setSecondsLeft] = useState(defaultMinutes * 60)
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [logged, setLogged] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout>()
  const elapsedRef = useRef(0)
  const queryClient = useQueryClient()

  const BREAK_SECONDS = 5 * 60

  // Track elapsed seconds for partial logging
  useEffect(() => {
    if (running) {
      const tick = setInterval(() => { elapsedRef.current += 1 }, 1000)
      return () => clearInterval(tick)
    }
  }, [running])

  useEffect(() => {
    if (running && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(intervalRef.current)
            setRunning(false)
            setCompleted(true)
            if (mode === 'focus') logTime(defaultMinutes)
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('FlowState', {
                body: mode === 'focus' ? '🎉 Focus session complete! Time for a break.' : '⚡ Break over. Back to work!',
                icon: '/favicon.ico',
              })
            }
            return 0
          }
          return s - 1
        })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running, mode])

  const logTime = async (minutes: number) => {
    if (logged || minutes < 1) return
    try {
      await authApi.logStudy(minutes)
      setLogged(true)
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    } catch {
      // silent fail
    }
  }

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const progress = ((totalSeconds - secondsLeft) / totalSeconds) * 100
  const circumference = 2 * Math.PI * 54

  const reset = () => {
    setRunning(false)
    const s = mode === 'focus' ? defaultMinutes * 60 : BREAK_SECONDS
    setTotalSeconds(s); setSecondsLeft(s)
    setCompleted(false); setLogged(false)
    elapsedRef.current = 0
  }

  const switchMode = (m: Mode) => {
    setMode(m); setRunning(false)
    const s = m === 'focus' ? defaultMinutes * 60 : BREAK_SECONDS
    setTotalSeconds(s); setSecondsLeft(s)
    setCompleted(false); setLogged(false)
    elapsedRef.current = 0
  }

  const handleClose = () => {
    if (mode === 'focus' && elapsedRef.current >= 60 && !logged) {
      logTime(Math.floor(elapsedRef.current / 60))
    }
    onClose()
  }

  const requestNotifPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className={cn(
          'px-6 pt-6 pb-4 text-center transition-colors',
          mode === 'focus' ? 'bg-sky-50 dark:bg-sky-950/50' : 'bg-emerald-50 dark:bg-emerald-950/50'
        )}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2">
              <button
                onClick={() => switchMode('focus')}
                className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors', mode === 'focus' ? 'bg-sky-500 text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300')}
              >
                <Sparkles className="w-3 h-3 inline mr-1" />Focus
              </button>
              <button
                onClick={() => switchMode('break')}
                className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors', mode === 'break' ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300')}
              >
                <Coffee className="w-3 h-3 inline mr-1" />Break
              </button>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 truncate">
            {session?.title || 'Focus Session'}
          </p>
        </div>

        <div className="flex flex-col items-center py-8 px-6">
          <div className="relative w-36 h-36 mb-6">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-800" />
              <circle
                cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (progress / 100) * circumference}
                className={mode === 'focus' ? 'text-sky-500' : 'text-emerald-500'}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold tabular-nums text-gray-900 dark:text-white">
                {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
              </span>
              <span className="text-xs text-gray-400 mt-0.5 capitalize">{mode}</span>
            </div>
          </div>

          {completed && (
            <div className="text-center mb-6">
              <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                {mode === 'focus' ? '🎉 Session Complete!' : '⚡ Break Over!'}
              </p>
              <p className="text-sm text-gray-400">
                {mode === 'focus' ? 'Great work! Take a 5-minute break.' : 'Ready to focus again?'}
              </p>
              {logged && (
                <p className="text-xs text-emerald-500 mt-1 flex items-center justify-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Study time logged
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-4">
            <button onClick={reset} className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={() => { setRunning(!running); requestNotifPermission() }}
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95',
                mode === 'focus' ? 'bg-sky-500 hover:bg-sky-600 shadow-sky-200 dark:shadow-sky-900' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200 dark:shadow-emerald-900'
              )}
            >
              {running ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
            </button>
            <div className="w-11 h-11" />
          </div>

          <div className="flex items-center gap-1.5 mt-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={cn('w-2.5 h-2.5 rounded-full', i === 0 ? 'bg-sky-500' : 'bg-gray-200 dark:bg-gray-700')} />
            ))}
            <span className="text-xs text-gray-400 ml-1">1 of 4 pomodoros</span>
          </div>
        </div>
      </div>
    </div>
  )
}
