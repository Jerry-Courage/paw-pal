'use client'

import { useEffect, useRef } from 'react'
import { authApi } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Passive study time tracker.
 * Sends a heartbeat every `intervalSeconds` while the tab is visible.
 * After each successful log, invalidates 'profile' and 'analytics' queries
 * so the dashboard banner and charts update in real time.
 */
export function useStudyTracker(intervalSeconds = 30) {
  const accumulatedRef = useRef(0)
  const lastTickRef = useRef<number>(Date.now())
  const timerRef = useRef<NodeJS.Timeout>()
  const queryClient = useQueryClient()

  const flush = async () => {
    const minutes = Math.floor(accumulatedRef.current / 60)
    if (minutes < 1) return
    accumulatedRef.current = accumulatedRef.current % 60
    try {
      await authApi.logStudy(minutes)
      // Refresh dashboard banner + analytics chart
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    } catch {
      // silent — don't break the page
    }
  }

  useEffect(() => {
    lastTickRef.current = Date.now()

    const tick = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        const elapsed = (now - lastTickRef.current) / 1000
        // Cap to avoid inflating time after sleep/suspend
        accumulatedRef.current += Math.min(elapsed, intervalSeconds * 2)
      }
      lastTickRef.current = Date.now()
      flush()
    }

    timerRef.current = setInterval(tick, intervalSeconds * 1000)

    const handleUnload = () => flush()
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
      else lastTickRef.current = Date.now() // reset on tab focus so we don't count hidden time
    }

    window.addEventListener('beforeunload', handleUnload)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(timerRef.current)
      window.removeEventListener('beforeunload', handleUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
      flush()
    }
  }, [intervalSeconds])
}
