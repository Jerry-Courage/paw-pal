'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { paymentsApi } from '@/lib/api'
import { usePricing } from '@/hooks/usePricing'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Sparkles, Check, Loader2, Tag, ChevronDown, ChevronUp,
  BookOpen, Headphones, Brain, Layers, Zap, Infinity,
  Shield, Star, Crown
} from 'lucide-react'

const FREE_FEATURES = [
  '5 AI study kits',
  'Notes, flashcards & quizzes',
  'Basic AI chat',
  'Study planner',
]

const PREMIUM_FEATURES = [
  { icon: Infinity,   text: 'Unlimited AI study kits' },
  { icon: Brain,      text: 'Live AI voice tutor sessions' },
  { icon: Headphones, text: 'AI podcasts from any material' },
  { icon: Layers,     text: 'Spaced repetition flashcards' },
  { icon: BookOpen,   text: 'VR classroom experience' },
  { icon: Zap,        text: 'Priority AI processing' },
  { icon: Shield,     text: 'Study Mode with section quizzes' },
  { icon: Star,       text: 'XP & level system' },
]

export default function UpgradePage() {
  const { data: session } = useSession()
  const { priceInfo } = usePricing()
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoOpen, setPromoOpen] = useState(false)
  const [promoLoading, setPromoLoading] = useState(false)

  const { data: subStatus, refetch } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => paymentsApi.getStatus().then(r => r.data),
    staleTime: 30000,
  })

  const isPremium = subStatus?.is_premium
  const notesUsed = subStatus?.notes_used ?? 0
  const notesLimit = subStatus?.notes_limit ?? 5

  // Parse redirect callback URL parameters on mobile return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reference = params.get('reference')
    const payment = params.get('payment')
    
    if (reference && payment === 'success') {
      // Clear URL params immediately so it doesn't verify on every refresh
      const newUrl = window.location.pathname
      window.history.replaceState({}, document.title, newUrl)
      
      const verifyPayment = async () => {
        setVerifying(true)
        try {
          const res = await paymentsApi.verify(reference)
          if (res.data.success) {
            toast.success('Payment confirmed! You\'re now Premium 🎉')
            refetch()
          } else {
            toast.error('Payment verification failed.')
          }
        } catch (e) {
          toast.error('Failed to verify payment status.')
        } finally {
          setVerifying(false)
        }
      }
      verifyPayment()
    }
  }, [refetch])

  const handlePay = async () => {
    setLoading(true)
    try {
      const callbackUrl = `${window.location.origin}/upgrade?payment=success`
      const res = await paymentsApi.initialize(
        callbackUrl,
        promoCode || undefined,
        priceInfo.paystackCurrency,
        priceInfo.amount,
      )
      if (res.data.promo_applied) {
        toast.success(res.data.message || 'Promo applied! You\'re now Premium 🎉')
        refetch()
        return
      }
      const { authorization_url, reference } = res.data
      
      // Detect if user is on a mobile device
      const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      
      if (isMobile) {
        // Direct redirect on mobile to avoid aggressive popup blockers
        window.location.href = authorization_url
      } else {
        // Desktop popup fallback
        const popup = window.open(authorization_url, 'paystack_popup', 'width=500,height=700,scrollbars=yes')
        const pollTimer = setInterval(async () => {
          if (popup?.closed) {
            clearInterval(pollTimer)
            setLoading(false)
            setVerifying(true)
            try {
              const vres = await paymentsApi.verify(reference)
              if (vres.data.success) {
                toast.success('Payment confirmed! You\'re now Premium 🎉')
                refetch()
              } else {
                toast.error('Payment not completed.')
              }
            } catch { /* user closed without paying */ }
            finally { setVerifying(false) }
          }
        }, 800)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Payment service unavailable.')
    } finally {
      setLoading(false)
    }
  }

  const handlePromo = async () => {
    if (!promoCode.trim()) return
    setPromoLoading(true)
    try {
      const res = await paymentsApi.applyPromo(promoCode.trim().toUpperCase())
      if (res.data.success) {
        toast.success(res.data.message || 'Promo applied!')
        refetch()
      } else if (res.data.requires_payment) {
        setPromoOpen(false)
        await handlePay()
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Invalid promo code.')
    } finally {
      setPromoLoading(false)
    }
  }

  const isWorking = loading || verifying || promoLoading

  return (
    <div className="min-h-screen bg-[#0d0d0d] -m-4 md:-m-6 px-4 md:px-8 pb-20">

      {/* Hero */}
      <div className="max-w-2xl mx-auto pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-black uppercase tracking-widest mb-6">
          <Crown className="w-3 h-3" /> Premium Plan
        </div>
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
          Unlock your full<br />
          <span className="text-orange-400">study potential</span>
        </h1>
        <p className="text-slate-500 text-base max-w-md mx-auto">
          One price. Unlimited study kits, AI tools, VR classroom, and everything Flow State has to offer.
        </p>
      </div>

      {/* If already premium */}
      {isPremium && (
        <div className="max-w-lg mx-auto mb-10">
          <div className="flex items-center gap-4 p-5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl">
            <Crown className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <p className="font-black text-white">You're on Premium 🎉</p>
              <p className="text-sm text-slate-400 mt-0.5">
                Expires: {subStatus?.subscription_expires_at
                  ? new Date(subStatus.subscription_expires_at).toLocaleDateString()
                  : 'Never'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pricing card */}
      <div className="max-w-lg mx-auto">
        <div className="bg-[#111] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">

          {/* Price header */}
          <div className="bg-gradient-to-br from-orange-500/20 to-amber-500/10 border-b border-white/8 px-8 py-8 text-center">
            <div className="flex items-baseline justify-center gap-1 mb-2">
              <span className="text-5xl font-black text-white">{priceInfo.display}</span>
              <span className="text-slate-400 text-base font-medium">/ month</span>
            </div>
            <p className="text-slate-400 text-sm">Cancel anytime. No hidden fees.</p>

            {/* Usage bar for free users */}
            {!isPremium && (
              <div className="mt-5 space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Free kits used</span>
                  <span className="font-bold text-slate-300">{notesUsed} / {notesLimit}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all"
                    style={{ width: `${(notesUsed / notesLimit) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Features */}
          <div className="px-8 py-6 space-y-3">
            {PREMIUM_FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                  <f.icon className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <span className="text-sm text-slate-200 flex-1">{f.text}</span>
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="px-8 pb-8 space-y-3">
            {!isPremium ? (
              <>
                <button
                  onClick={handlePay}
                  disabled={isWorking}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-orange-500 text-white font-black text-base hover:bg-orange-400 active:scale-[0.98] disabled:opacity-60 transition-all shadow-xl shadow-orange-500/25"
                >
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Opening payment…</>
                  : verifying ? <><Loader2 className="w-5 h-5 animate-spin" /> Confirming…</>
                  : <><Sparkles className="w-5 h-5" /> Upgrade Now — {priceInfo.display}/mo</>}
                </button>

                {/* Promo code */}
                <button
                  onClick={() => setPromoOpen(v => !v)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors py-1"
                >
                  <Tag className="w-3.5 h-3.5" />
                  Have a promo code?
                  {promoOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {promoOpen && (
                  <div className="flex gap-2">
                    <input
                      value={promoCode}
                      onChange={e => setPromoCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && handlePromo()}
                      placeholder="PROMO CODE"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 font-mono uppercase tracking-widest transition-colors"
                    />
                    <button
                      onClick={handlePromo}
                      disabled={!promoCode.trim() || promoLoading}
                      className="px-5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
                    >
                      {promoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-slate-500">You already have an active Premium subscription.</p>
              </div>
            )}

            <p className="text-center text-xs text-slate-700 mt-2">
              Secured by Paystack · SSL encrypted
            </p>
          </div>
        </div>

        {/* Free tier comparison */}
        <div className="mt-6 bg-[#111] border border-white/5 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Free tier includes</p>
          <div className="grid grid-cols-2 gap-2">
            {FREE_FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
