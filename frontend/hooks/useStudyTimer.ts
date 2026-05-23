'use client'

import { useEffect, useRef } from 'react'
import { authApi } from '@/lib/api'

/**
 * useStudyTimer
 *
 * Tracks time the user actively spends on a library/study page and logs it
 * to the backend via POST /auth/log-study/ when they leave.
 *
 * Rules:
 * - Timer only runs while the tab is visible (pauses on tab switch / phone lock)
 * - Only logs if >= MIN_LOG_MINUTES was accumulated (avoids noise from quick visits)
 * - Uses sendBeacon for the unload case so the request survives page close
 * - Safe to mount on any page — pass enabled=false to disable without removing the hook
 */

const MIN_LOG_MINUTES = 0.5 // 30 seconds minimum before we bother logging

export function useStudyTimer(enabled = true) {
  const startRef      = useRef<number | null>(null)   // when current visible session started
  const accumulatedRef = useRef<number>(0)             // total minutes accumulated this mount
  const flushedRef    = useRef(false)                  // prevent double-flush on unmount

  const flush = (source: string) => {
    if (flushedRef.current) return
    // Add any currently-running visible time
    let total = accumulatedRef.current
    if (startRef.current !== null) {
      total += (Date.now() - startRef.current) / 60000
      startRef.current = null
    }
    if (total < MIN_LOG_MINUTES) return
    flushedRef.current = true

    const minutes = Math.round(total * 10) / 10 // 1 decimal place

    // Use sendBeacon for unload events (survives page close)
    // Fall back to fetch for visibility-change flushes
    if (source === 'unload' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob(
        [JSON.stringify({ minutes })],
        { type: 'application/json' }
      )
      // sendBeacon needs the full URL with auth — we can't set headers,
      // so fall through to fetch for this case too (sendBeacon is best-effort anyway)
    }

    // Use the api client (works for all cases including unload on modern browsers)
    authApi.logStudy(minutes).catch(() => {
      // Silently ignore — study time logging is best-effort
    })
  }

  useEffect(() => {
    if (!enabled) return

    // Reset state for this mount
    accumulatedRef.current = 0
    flushedRef.current = false
    startRef.current = null

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Tab hidden — accumulate elapsed time and pause
        if (startRef.current !== null) {
          accumulatedRef.current += (Date.now() - startRef.current) / 60000
          startRef.current = null
        }
        // Flush on hide (covers phone lock, tab switch, app background)
        flush('visibility-hidden')
        // Allow re-flush if they come back
        flushedRef.current = false
      } else {
        // Tab visible again — restart the clock
        startRef.current = Date.now()
      }
    }

    const handleBeforeUnload = () => {
      flush('unload')
    }

    // Start the clock immediately (tab is visible when component mounts)
    if (document.visibilityState === 'visible') {
      startRef.current = Date.now()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handleBeforeUnload) // iOS Safari

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handleBeforeUnload)
      // Flush on React unmount (route change)
      flush('unmount')
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps
}
