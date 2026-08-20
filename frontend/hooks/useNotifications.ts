'use client'

import { useEffect, useRef, useCallback } from 'react'

const NOTIFICATION_KEY = 'flowstate_last_notification'
const MIN_INTERVAL_MS = 3 * 60 * 60 * 1000 // 3 hours minimum between notifications

export function useNotifications() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getPermission = useCallback(() => {
    if (!('Notification' in window)) return 'denied'
    return Notification.permission
  }, [])

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'denied'
    const result = await Notification.requestPermission()
    return result
  }, [])

  const canSendNotification = useCallback(() => {
    if (getPermission() !== 'granted') return false
    const last = localStorage.getItem(NOTIFICATION_KEY)
    if (!last) return true
    return Date.now() - parseInt(last) > MIN_INTERVAL_MS
  }, [getPermission])

  const sendNotification = useCallback((title: string, body: string, url: string = '/dashboard') => {
    if (!canSendNotification()) return
    if (Notification.permission !== 'granted') return

    try {
      // Use service worker for better mobile support
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          title,
          body,
          tag: 'flowstate-study-reminder',
          data: { url },
        })
      } else {
        new Notification(title, { body, icon: '/images/logo-icon.png', tag: 'flowstate-study-reminder' })
      }
      localStorage.setItem(NOTIFICATION_KEY, Date.now().toString())
    } catch (e) {
      console.warn('Notification failed:', e)
    }
  }, [canSendNotification])

  // Smart study reminder scheduler
  const scheduleStudyReminders = useCallback(() => {
    if (getPermission() !== 'granted') return

    // Clear existing
    if (timerRef.current) clearTimeout(timerRef.current)

    const checkAndNotify = () => {
      const now = new Date()
      const hour = now.getHours()

      // Only send during study hours (8am - 9pm)
      if (hour >= 8 && hour <= 21 && canSendNotification()) {
        const messages = [
          { title: 'Time to study! 📚', body: 'A quick review session keeps your streak alive. You got this!' },
          { title: 'Study reminder 🧠', body: 'Your brain is ready. Even 15 minutes of review makes a difference.' },
          { title: 'Keep the momentum! 🔥', body: 'Your streak is counting on you. Open FlowState for a quick session.' },
          { title: 'Quick study break? 💡', body: 'Review one concept — it takes 2 minutes and keeps retention high.' },
        ]
        const msg = messages[Math.floor(Math.random() * messages.length)]
        sendNotification(msg.title, msg.body)
      }

      // Schedule next check in 30 minutes
      timerRef.current = setTimeout(checkAndNotify, 30 * 60 * 1000)
    }

    // First check in 30 minutes
    timerRef.current = setTimeout(checkAndNotify, 30 * 60 * 1000)
  }, [getPermission, canSendNotification, sendNotification])

  useEffect(() => {
    if (getPermission() === 'granted') {
      scheduleStudyReminders()
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [getPermission, scheduleStudyReminders])

  return {
    permission: getPermission(),
    requestPermission,
    sendNotification,
    canSend: canSendNotification(),
  }
}
