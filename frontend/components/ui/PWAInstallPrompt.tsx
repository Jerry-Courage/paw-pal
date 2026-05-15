'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Share } from 'lucide-react'
import Image from 'next/image'

type Platform = 'android' | 'ios' | null

export default function PWAInstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Don't show if already installed (running in standalone)
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // Don't show if dismissed this session
    if (sessionStorage.getItem('pwa_dismissed')) return

    const ua = navigator.userAgent.toLowerCase()
    const isIOS = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream
    const isAndroid = /android/.test(ua)

    if (!isIOS && !isAndroid) return

    if (isIOS) {
      // iOS doesn't support beforeinstallprompt — show manual instructions
      setPlatform('ios')
    }

    if (isAndroid) {
      // Capture the native Android install prompt
      const handler = (e: Event) => {
        e.preventDefault()
        setDeferredPrompt(e)
        setPlatform('android')
      }
      window.addEventListener('beforeinstallprompt', handler as any)
      return () => window.removeEventListener('beforeinstallprompt', handler as any)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setPlatform(null)
      }
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    sessionStorage.setItem('pwa_dismissed', '1')
    setDismissed(true)
    setPlatform(null)
  }

  if (dismissed || !platform) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[999] px-4 pb-6"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 p-5 max-w-md mx-auto">
          
          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg flex-shrink-0 bg-orange-500/5">
              <Image src="/images/logo-icon.png" alt="Flow State" width={64} height={64} className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="font-black text-slate-900 dark:text-white text-base leading-tight">Install Flow State</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Add to your home screen for the best experience</p>
            </div>
          </div>

          {platform === 'android' && (
            <button
              onClick={handleInstall}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--primary)] text-white font-black text-sm shadow-lg active:scale-95 transition-transform"
            >
              <Download className="w-4 h-4" />
              Install App
            </button>
          )}

          {platform === 'ios' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                <Share className="w-5 h-5 text-[var(--primary)] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium leading-snug">
                  Tap the <span className="font-black text-slate-900 dark:text-white">Share</span> button at the bottom of your browser
                </p>
              </div>
              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                <span className="text-lg leading-none flex-shrink-0">➕</span>
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium leading-snug">
                  Then tap <span className="font-black text-slate-900 dark:text-white">Add to Home Screen</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
