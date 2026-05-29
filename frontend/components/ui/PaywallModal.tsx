'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, BookOpen, Headphones, Brain, Layers, Zap, Check, Loader2 } from 'lucide-react'
import { paymentsApi } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface PaywallModalProps {
  onClose: () => void
  notesUsed: number
  notesLimit: number
  /** Called after successful payment verification */
  onSuccess?: () => void
}

const PERKS = [
  { icon: BookOpen,   text: 'Unlimited AI study notes from any material' },
  { icon: Headphones, text: 'Unlimited podcasts, quizzes & flashcards' },
  { icon: Brain,      text: 'Live exam prep & voice sessions' },
  { icon: Layers,     text: 'Spaced repetition & mind maps' },
  { icon: Zap,        text: 'Priority AI processing — no queue' },
]

export default function PaywallModal({ onClose, notesUsed, notesLimit, onSuccess }: PaywallModalProps) {
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)

  // Listen for Paystack popup close / callback
  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      // Paystack inline popup sends a message when payment completes
      if (e.data?.event === 'payment.success' || e.data?.reference) {
        const ref = e.data?.reference || e.data?.data?.reference
        if (ref) await verifyPayment(ref)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handlePay = async () => {
    setLoading(true)
    try {
      const res = await paymentsApi.initialize()
      const { authorization_url, reference } = res.data

      // Open Paystack popup
      const popup = window.open(
        authorization_url,
        'paystack_popup',
        'width=500,height=700,scrollbars=yes,resizable=yes'
      )

      // Poll for popup close then verify
      const pollTimer = setInterval(async () => {
        if (popup?.closed) {
          clearInterval(pollTimer)
          // Give Paystack webhook a moment, then verify via reference
          await verifyPayment(reference)
        }
      }, 800)
    } catch (err) {
      toast.error('Could not connect to payment service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const verifyPayment = async (reference: string) => {
    setVerifying(true)
    try {
      const res = await paymentsApi.verify(reference)
      if (res.data.success) {
        toast.success('Payment confirmed! Welcome to Premium 🎉')
        onSuccess?.()
        onClose()
      } else {
        toast.error('Payment not completed. Please try again.')
      }
    } catch {
      // Payment may not have gone through — don't show error, just close
    } finally {
      setVerifying(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="w-full sm:max-w-md bg-[#111] rounded-t-[2rem] sm:rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-6 pt-7 pb-5 text-center border-b border-white/[0.06]">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Usage indicator */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {Array.from({ length: notesLimit }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i < notesUsed ? 'bg-orange-500 w-8' : 'bg-white/10 w-5'
                  )}
                />
              ))}
            </div>

            <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-orange-400" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight mb-1">
              You've used {notesUsed}/{notesLimit} free kits
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Unlock unlimited study kits, podcasts, and AI tools for just
            </p>
            <div className="mt-3 flex items-baseline justify-center gap-1">
              <span className="text-4xl font-black text-white">$0.99</span>
              <span className="text-slate-500 text-sm font-medium">/ month</span>
            </div>
          </div>

          {/* Perks */}
          <div className="px-6 py-5 space-y-3">
            {PERKS.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                  <p.icon className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <span className="text-sm text-slate-300">{p.text}</span>
                <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto shrink-0" />
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="px-6 pb-7 space-y-3">
            <button
              onClick={handlePay}
              disabled={loading || verifying}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl py-3.5 transition-all shadow-lg shadow-orange-500/25"
            >
              {loading || verifying ? (
                <><Loader2 className="w-4 h-4 animate-spin" />
                  {verifying ? 'Confirming payment…' : 'Opening payment…'}
                </>
              ) : (
                <><Sparkles className="w-4 h-4" /> Upgrade to Premium — $0.99/mo</>
              )}
            </button>
            <button
              onClick={onClose}
              className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors py-1"
            >
              Maybe later
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
