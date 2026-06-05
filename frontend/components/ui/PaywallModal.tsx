'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Sparkles, BookOpen, Headphones, Brain, Layers,
  Zap, Check, Loader2, Tag, ChevronDown, ChevronUp
} from 'lucide-react'
import { paymentsApi } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { usePricing } from '@/hooks/usePricing'

interface PaywallModalProps {
  onClose: () => void
  notesUsed: number
  notesLimit: number
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
  const [loading, setLoading]       = useState(false)
  const [verifying, setVerifying]   = useState(false)
  const [promoCode, setPromoCode]   = useState('')
  const [promoOpen, setPromoOpen]   = useState(false)
  const [promoLoading, setPromoLoading] = useState(false)

  const { priceInfo } = usePricing()

  const handlePay = async () => {
    setLoading(true)
    try {
      const res = await paymentsApi.initialize(
        undefined,
        promoCode || undefined,
        priceInfo.paystackCurrency,
        priceInfo.amount,
      )

      // Promo code was applied directly (free days) — no popup needed
      if (res.data.promo_applied) {
        toast.success(res.data.message || 'Promo applied!')
        onSuccess?.()
        onClose()
        return
      }

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
          await verifyPayment(reference)
        }
      }, 800)
    } catch (err: any) {
      const msg = err?.response?.data?.error
      if (msg) toast.error(msg)
      else toast.error('Could not connect to payment service. Please try again.')
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
      // Silently ignore — user may have closed without paying
    } finally {
      setVerifying(false)
    }
  }

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return
    setPromoLoading(true)
    try {
      const res = await paymentsApi.applyPromo(promoCode.trim().toUpperCase())
      if (res.data.success) {
        toast.success(res.data.message || 'Promo applied!')
        onSuccess?.()
        onClose()
      } else if (res.data.requires_payment) {
        // percent_off promo — proceed to payment with promo pre-filled
        setPromoOpen(false)
        toast.info('Discount applied at checkout!')
        await handlePay()
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Invalid promo code.'
      toast.error(msg)
    } finally {
      setPromoLoading(false)
    }
  }

  const isWorking = loading || verifying || promoLoading

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

            {/* Usage bar */}
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
              <span className="text-4xl font-black text-white">{priceInfo.display}</span>
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
                <span className="text-sm text-slate-300 flex-1">{p.text}</span>
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              </div>
            ))}
          </div>

          {/* CTA + Promo */}
          <div className="px-6 pb-7 space-y-3">
            <button
              onClick={handlePay}
              disabled={isWorking}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl py-3.5 transition-all shadow-lg shadow-orange-500/25"
            >
              {loading || verifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {verifying ? 'Confirming payment…' : 'Opening payment…'}
                </>
              ) : (
                <><Sparkles className="w-4 h-4" /> Upgrade to Premium — {priceInfo.displayShort}</>
              )}
            </button>

            {/* Promo code toggle */}
            <button
              onClick={() => setPromoOpen(v => !v)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors py-1"
            >
              <Tag className="w-3.5 h-3.5" />
              Have a promo code?
              {promoOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <AnimatePresence>
              {promoOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-2 pt-1">
                    <input
                      value={promoCode}
                      onChange={e => setPromoCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && handleApplyPromo()}
                      placeholder="SCHOOL2024"
                      className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 font-mono tracking-wider uppercase transition-colors"
                    />
                    <button
                      onClick={handleApplyPromo}
                      disabled={!promoCode.trim() || promoLoading}
                      className="px-4 py-2.5 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
                    >
                      {promoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
