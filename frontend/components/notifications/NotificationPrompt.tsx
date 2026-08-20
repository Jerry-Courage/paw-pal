'use client'

import { useState, useEffect } from 'react'
import { X, Bell } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'

const DISMISSED_KEY = 'flowstate_notif_prompt_dismissed'

export default function NotificationPrompt() {
  const { permission, requestPermission } = useNotifications()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only show if permission is 'default' (not yet asked) and not dismissed this session
    const dismissed = sessionStorage.getItem(DISMISSED_KEY)
    if (permission === 'default' && !dismissed && 'Notification' in window) {
      // Delay showing the prompt by 10 seconds so it doesn't feel aggressive
      const t = setTimeout(() => setVisible(true), 10000)
      return () => clearTimeout(t)
    }
  }, [permission])

  const handleEnable = async () => {
    const result = await requestPermission()
    if (result === 'granted') {
      setVisible(false)
    } else {
      // User denied — don't show again this session
      sessionStorage.setItem(DISMISSED_KEY, '1')
      setVisible(false)
    }
  }

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  if (!visible || permission !== 'default') return null

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-slide-up">
      <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] border border-orange-500/20 rounded-2xl p-4 shadow-2xl shadow-orange-500/10">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 text-white/30 hover:text-white/60 transition-colors"
        >
          <X size={14} />
        </button>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/30">
            <Bell size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold">Stay on track</p>
            <p className="text-white/50 text-xs mt-0.5 leading-relaxed">
              Get gentle study reminders when you&apos;re offline. No spam — just 2-3 nudges a day.
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-3 ml-[52px]">
          <button
            onClick={handleEnable}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold rounded-xl hover:from-orange-400 hover:to-amber-400 transition-all shadow-lg shadow-orange-500/20"
          >
            Enable
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2 text-white/40 text-xs font-medium hover:text-white/60 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
