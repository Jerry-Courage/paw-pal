'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { paymentsApi } from '@/lib/api'
import { toast } from 'sonner'
import { usePricing } from '@/hooks/usePricing'

const FEATURES = [
  { icon: 'all_inclusive', color: 'text-primary', title: 'Unlimited Study Kits', desc: 'Create and store as many subjects as you need. No monthly caps.' },
  { icon: 'psychology', color: 'text-secondary', title: 'AI Voice Tutor', desc: 'Interactive exam prep that speaks with you like a real teacher.' },
  { icon: 'podcasts', color: 'text-tertiary', title: 'AI Podcast Generation', desc: 'Turn your notes into 5-minute study podcasts for your commute.' },
  { icon: 'view_in_ar', color: 'text-primary', title: 'VR Classroom', desc: 'Immersive study environments to boost focus and recall.' },
  { icon: 'bolt', color: 'text-secondary', title: 'Priority AI Processing', desc: 'No wait times. Instant summaries and question generation.' },
  { icon: 'insights', color: 'text-tertiary', title: 'Advanced Analytics', desc: 'See exactly where you\'re struggling and how to improve.' },
]

const TESTIMONIALS = [
  { stars: 5, text: '"The AI Voice Tutor is a game changer for my Bio exams. I actually feel like I have a personal tutor available at 2 AM."', name: 'Leo, 11th Grade' },
  { stars: 5, text: '"I used to spend hours summarizing chapters. Now the AI Podcast does it for me while I\'m on the bus. Worth every penny."', name: 'Maya, University Freshman' },
  { stars: 5, text: '"The VR Classroom environment helps my ADHD so much. It\'s the only way I can stay focused for more than 20 minutes."', name: 'James, 10th Grade' },
]

export default function UpgradePage() {
  const [isAnnual, setIsAnnual] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [applyingPromo, setApplyingPromo] = useState(false)
  const { priceInfo } = usePricing()

  const { data: subStatus } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => paymentsApi.getStatus().then(r => r.data),
    staleTime: 60000,
  })

  const notesUsed = subStatus?.notes_used ?? 0
  const notesLimit = subStatus?.notes_limit ?? 5
  const isPremium = subStatus?.is_premium ?? false

  const initMutation = useMutation({
    mutationFn: ({ promo_code, currency, amount }: any) =>
      paymentsApi.initialize(undefined, promo_code, currency, amount),
    onSuccess: (res) => {
      if (res.data.promo_applied) {
        toast.success(res.data.message)
        return
      }
      if (res.data.authorization_url) {
        window.open(res.data.authorization_url, '_blank')
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Payment initialization failed.'),
  })

  const promoMutation = useMutation({
    mutationFn: (code: string) => paymentsApi.applyPromo(code),
    onSuccess: (res) => {
      toast.success(res.data.message)
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Invalid promo code.'),
  })

  const handleUpgrade = () => {
    initMutation.mutate({ promo_code: promoCode || undefined })
  }

  const handlePromo = () => {
    if (!promoCode.trim()) return
    promoMutation.mutate(promoCode.trim().toUpperCase())
  }

  if (isPremium) {
    return (
      <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-4xl mx-auto text-center">
        <div className="bg-surface-container-low rounded-[2rem] p-stack-lg border-2 border-primary glow-primary">
          <span className="material-symbols-outlined text-[64px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
          <h2 className="text-[32px] font-bold text-on-surface mt-stack-md mb-base">You&apos;re Premium! 🎉</h2>
          <p className="text-on-surface-variant text-[16px]">
            {subStatus?.subscription_expires_at
              ? `Your access is active until ${new Date(subStatus.subscription_expires_at).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}.`
              : 'Enjoy unlimited access to all FlowState tools.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-5xl mx-auto pb-stack-lg">

      {/* Hero */}
      <div className="text-center mb-stack-lg">
        <h1 className="text-[36px] md:text-[48px] font-bold text-primary mb-base leading-tight">
          Unlock Your Full Potential<br />with FlowState Premium
        </h1>
        <p className="text-on-surface-variant text-[16px] max-w-2xl mx-auto">
          Join thousands of students achieving their best grades with our most advanced learning tools.
        </p>
      </div>

      {/* Usage bar */}
      <div className="bg-surface-container-low rounded-[1.5rem] p-stack-md mb-stack-lg border border-outline-variant glow-primary">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-stack-sm">
          <div className="flex items-center gap-base mb-base md:mb-0">
            <div className="p-base bg-primary/10 rounded-full">
              <span className="material-symbols-outlined text-primary">inventory_2</span>
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-on-surface">You&apos;ve used {notesUsed} of {notesLimit} free study kits</h3>
              <p className="text-[13px] text-on-surface-variant">Upgrade for unlimited access</p>
            </div>
          </div>
        </div>
        <div className="w-full h-3 bg-surface-container-highest rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all shadow-[0_0_15px_rgba(255,182,141,0.5)]" style={{ width: `${Math.min(100, (notesUsed / notesLimit) * 100)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">

        {/* Pricing card */}
        <div className="lg:col-span-7 flex flex-col items-center">
          {/* Billing toggle */}
          <div className="flex items-center gap-stack-md mb-stack-md bg-surface-container-high p-base rounded-full border border-outline-variant">
            <span className={`text-[13px] font-bold transition-colors ${!isAnnual ? 'text-primary' : 'text-on-surface-variant'}`}>Monthly</span>
            <button onClick={() => setIsAnnual(!isAnnual)} className={`w-16 h-7 rounded-full relative transition-colors ${isAnnual ? 'bg-primary-container' : 'bg-surface-container-highest'}`}>
              <div className={`absolute top-0.5 w-6 h-6 bg-on-primary rounded-full shadow-md transition-all duration-300 ${isAnnual ? 'right-0.5' : 'left-0.5'}`} />
            </button>
            <span className={`text-[13px] font-bold flex items-center gap-base transition-colors ${isAnnual ? 'text-primary' : 'text-on-surface-variant'}`}>
              Annual
              <span className="bg-secondary-container text-on-secondary-container px-base py-0.5 rounded-full text-[10px] font-bold">Save 30%</span>
            </span>
          </div>

          {/* Main card */}
          <div className="w-full bg-surface-container-high rounded-[2rem] border-4 border-primary p-stack-lg glow-primary relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary opacity-5 blur-3xl rounded-full"></div>
            <div className="relative z-10 flex flex-col items-center text-center">
              <span className="bg-primary text-on-primary px-stack-md py-1 rounded-full text-[13px] font-bold mb-stack-md">MOST POPULAR</span>
              <h2 className="text-[28px] font-bold text-on-surface mb-base">FlowState Premium</h2>
              <div className="flex items-baseline gap-base mb-stack-md">
                <span className="text-[48px] font-bold text-on-surface">{isAnnual ? '$79' : priceInfo?.displayPrice || '$0.99'}</span>
                <span className="text-[18px] text-on-surface-variant">{isAnnual ? '/year' : '/mo'}</span>
              </div>

              <ul className="w-full space-y-stack-sm mb-stack-lg border-t border-outline-variant pt-stack-lg text-left">
                {['Full access to all 6 premium study tools', 'No limits, no ads, no interruptions', 'Cancel anytime with 1-click'].map(f => (
                  <li key={f} className="flex items-center gap-base text-[15px] text-on-surface">
                    <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* Promo code */}
              <div className="w-full flex gap-base mb-stack-md">
                <input
                  className="flex-1 bg-surface-container border border-outline-variant rounded-full px-stack-md py-2 text-[14px] text-on-surface focus:outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/60 uppercase"
                  placeholder="Promo code (optional)"
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value.toUpperCase())}
                />
                {promoCode && (
                  <button onClick={handlePromo} disabled={promoMutation.isPending} className="px-stack-md bg-secondary-container text-on-secondary-container font-bold rounded-full text-[13px] disabled:opacity-50">
                    Apply
                  </button>
                )}
              </div>

              <button
                onClick={handleUpgrade}
                disabled={initMutation.isPending}
                className="w-full py-stack-md bg-primary-container text-on-primary-container text-[20px] font-bold rounded-[1.5rem] border-b-4 border-on-primary-fixed-variant btn-squishy transition-all hover:brightness-110 disabled:opacity-50"
              >
                {initMutation.isPending ? 'Processing…' : 'Upgrade to Blast Off! 🚀'}
              </button>
              <p className="mt-stack-sm text-[13px] text-on-surface-variant">Secure checkout powered by Paystack</p>
            </div>
          </div>
        </div>

        {/* Feature list */}
        <div className="lg:col-span-5 space-y-stack-md">
          <h3 className="text-[18px] font-bold text-on-surface border-b border-outline-variant pb-base">Why Go Premium?</h3>
          <div className="space-y-base">
            {FEATURES.map(f => (
              <div key={f.title} className="p-stack-sm rounded-[1rem] border border-outline-variant hover:bg-surface-container-high transition-all cursor-default">
                <div className="flex items-start gap-base">
                  <div className="p-base bg-surface-container-highest rounded-[1rem]">
                    <span className={`material-symbols-outlined ${f.color} text-[22px]`}>{f.icon}</span>
                  </div>
                  <div>
                    <h4 className="text-[16px] font-bold text-on-surface">{f.title}</h4>
                    <p className="text-[13px] text-on-surface-variant">{f.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Testimonials */}
      <div className="mt-stack-lg border-t border-outline-variant pt-stack-lg">
        <h3 className="text-[28px] font-bold text-center text-on-surface mb-stack-lg">Loved by 10,000+ Students</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="bg-surface-container p-stack-md rounded-[1.5rem] flex flex-col gap-base">
              <div className="flex gap-1 text-primary">
                {[...Array(t.stars)].map((_, j) => (
                  <span key={j} className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                ))}
              </div>
              <p className="italic text-on-surface-variant text-[14px] flex-1">{t.text}</p>
              <p className="text-[13px] font-bold text-on-surface">{t.name}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
