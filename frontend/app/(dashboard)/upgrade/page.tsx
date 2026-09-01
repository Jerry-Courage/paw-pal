'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { paymentsApi } from '@/lib/api'
import { toast } from 'sonner'

const BENEFITS = ['Unlimited Sources and study material', 'Unlimited Assignments', 'Access to Premium learning features']

export default function UpgradePage() {
  const [promoCode, setPromoCode] = useState('')
  const [callbackState, setCallbackState] = useState<'idle'|'verifying'|'success'|'pending'|'failed'|'cancelled'>('idle')
  const queryClient = useQueryClient()
  const { data: subStatus, isLoading } = useQuery({ queryKey: ['subscription-status'], queryFn: () => paymentsApi.getStatus().then(r => r.data), staleTime: 30000 })
  const plan = subStatus?.plans?.[0]
  const idempotencyKey = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const stored = sessionStorage.getItem('premium-checkout-key')
    if (stored) return stored
    const next = crypto.randomUUID()
    sessionStorage.setItem('premium-checkout-key', next)
    return next
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reference = params.get('reference') || params.get('trxref')
    const providerStatus = (params.get('status') || '').toLowerCase()
    if (!reference) {
      if (providerStatus === 'cancelled' || providerStatus === 'abandoned') setCallbackState('cancelled')
      return
    }
    setCallbackState('verifying')
    paymentsApi.verify(reference).then(res => {
      if (res.data.success) {
        setCallbackState('success'); sessionStorage.removeItem('premium-checkout-key')
        queryClient.invalidateQueries({ queryKey: ['subscription-status'] }); toast.success('Payment confirmed. Premium is active.')
      } else setCallbackState('pending')
    }).catch(err => setCallbackState(err?.response?.status === 202 ? 'pending' : 'failed'))
  }, [queryClient])

  const init = useMutation({
    mutationFn: () => paymentsApi.initialize('premium_monthly', promoCode || undefined, idempotencyKey),
    onSuccess: res => {
      if (res.data.promo_applied) { queryClient.invalidateQueries({ queryKey: ['subscription-status'] }); toast.success(res.data.message); return }
      if (res.data.authorization_url) window.location.assign(res.data.authorization_url)
    },
    onError: (error: any) => toast.error(error?.response?.data?.error || 'Secure checkout could not start.'),
  })
  const history = subStatus?.payment_history || []

  return <main className="mx-auto max-w-5xl px-margin-mobile md:px-margin-desktop py-stack-lg pb-24">
    <header className="max-w-2xl mb-stack-lg"><p className="text-[13px] font-bold uppercase tracking-[0.16em] text-primary">Plans & billing</p><h1 className="text-[36px] md:text-[52px] leading-[1.05] font-bold text-on-surface mt-2">More room to learn.</h1><p className="text-on-surface-variant mt-3 text-[16px]">Choose Premium when your learning needs outgrow the Free plan. Checkout stays on Paystack&apos;s secure hosted page.</p></header>
    {callbackState !== 'idle' && <section className="mb-stack-md rounded-2xl border border-outline-variant bg-surface-container-low p-stack-md" role="status"><strong className="text-on-surface">{callbackState === 'verifying' ? 'Confirming your payment…' : callbackState === 'success' ? 'Premium is active' : callbackState === 'pending' ? 'Payment is still pending' : callbackState === 'cancelled' ? 'Checkout was cancelled' : 'We could not confirm that payment'}</strong><p className="mt-1 text-sm text-on-surface-variant">{callbackState === 'pending' ? 'If you completed checkout, wait a moment and refresh this page.' : callbackState === 'cancelled' ? 'No Premium access was granted. You can restart checkout whenever you are ready.' : callbackState === 'failed' ? 'FlowState could not verify this payment. Retry verification or start a new checkout.' : 'Your account and payment history are shown below.'}</p></section>}
    <div className="grid gap-gutter lg:grid-cols-2">
      <section className="rounded-[1.75rem] border border-outline-variant bg-surface-container-low p-stack-lg"><p className="text-sm font-bold text-on-surface-variant">FREE</p><h2 className="mt-2 text-[28px] font-bold text-on-surface">Your current foundation</h2><p className="mt-2 text-on-surface-variant">Includes your existing Free usage limits. Your learning data remains yours when Premium expires.</p></section>
      <section className="rounded-[1.75rem] border-2 border-primary bg-surface-container-low p-stack-lg glow-primary">
        <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-primary">PREMIUM · 30 DAYS</p><h2 className="mt-2 text-[28px] font-bold text-on-surface">FlowState Premium</h2></div><span className="rounded-full bg-primary-container px-3 py-1 text-xs font-bold text-on-primary-container">{subStatus?.is_premium ? 'ACTIVE' : 'OPTIONAL'}</span></div>
        <div className="mt-5 flex items-baseline gap-2"><strong className="text-[42px] text-on-surface">{isLoading ? '—' : `${plan?.currency || 'GHS'} ${plan?.amount || '10.00'}`}</strong><span className="text-on-surface-variant">/ 30 days</span></div>
        <p className="mt-2 text-sm text-on-surface-variant">GHS is the checkout currency. International cardholders can pay; their bank handles currency conversion and fees.</p>
        <ul className="mt-6 space-y-3">{BENEFITS.map(item => <li key={item} className="flex gap-2 text-on-surface"><span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>{item}</li>)}</ul>
        {subStatus?.is_premium ? <div className="mt-6 rounded-xl bg-surface-container p-4 text-sm text-on-surface">Active until {subStatus.subscription_expires_at ? new Date(subStatus.subscription_expires_at).toLocaleString() : '—'}</div> : <><label className="block mt-6 text-sm font-bold text-on-surface" htmlFor="promo">Promo code <span className="font-normal text-on-surface-variant">(optional)</span></label><input id="promo" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} className="mt-2 w-full rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-on-surface outline-none focus:border-primary" placeholder="Enter code" /><button onClick={() => init.mutate()} disabled={init.isPending || !plan} className="mt-4 w-full rounded-xl bg-primary-container px-5 py-4 font-bold text-on-primary-container disabled:opacity-50">{init.isPending ? 'Opening secure checkout…' : 'Continue to secure checkout'}</button><p className="mt-3 text-center text-xs text-on-surface-variant">Pay with Ghana Mobile Money, local cards, or supported international cards on Paystack. FlowState never receives your full card number.</p></>}
      </section>
    </div>
    <section className="mt-stack-lg"><h2 className="text-[24px] font-bold text-on-surface">Payment history</h2><div className="mt-3 overflow-x-auto rounded-2xl border border-outline-variant">{history.length ? <table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-surface-container"><tr>{['Date','Plan','Amount','Status','Method','Reference'].map(h => <th key={h} className="p-4 text-on-surface-variant">{h}</th>)}</tr></thead><tbody>{history.map((item: any) => <tr key={item.reference} className="border-t border-outline-variant"><td className="p-4 text-on-surface">{new Date(item.created_at).toLocaleDateString()}</td><td className="p-4 text-on-surface">Premium</td><td className="p-4 text-on-surface">{item.currency} {item.amount}</td><td className="p-4 capitalize text-on-surface">{item.status}</td><td className="p-4 text-on-surface">{item.card_brand ? `${item.card_brand} •••• ${item.card_last4}` : item.channel || '—'}</td><td className="p-4 font-mono text-xs text-on-surface-variant">{item.reference}</td></tr>)}</tbody></table> : <p className="p-5 text-sm text-on-surface-variant">No payment attempts yet.</p>}</div></section>
  </main>
}
