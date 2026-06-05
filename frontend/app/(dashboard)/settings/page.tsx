'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { authApi, paymentsApi } from '@/lib/api'
import { User, Bell, Shield, Palette, Upload, Check, Loader2, Sparkles, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { usePricing } from '@/hooks/usePricing'

const PaywallModal = dynamic(() => import('@/components/ui/PaywallModal'), { ssr: false })

const TABS = [
  { id: 'profile',       label: 'Profile',       icon: User },
  { id: 'billing',       label: 'Billing',        icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance',    label: 'Appearance',    icon: Palette },
  { id: 'security',      label: 'Security',      icon: Shield },
]

export default function SettingsPage() {
  const [tab, setTab] = useState('profile')

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Manage your account and preferences</p>
      </div>

      {/* Tab pills */}
      <div className="flex gap-1 p-1 bg-white/3 rounded-2xl w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all',
              tab === t.id ? 'bg-orange-500/10 text-orange-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            )}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'profile'       && <ProfileSettings />}
        {tab === 'billing'       && <BillingSettings />}
        {tab === 'notifications' && <NotificationSettings />}
        {tab === 'appearance'    && <AppearanceSettings />}
        {tab === 'security'      && <SecuritySettings />}
      </div>
    </div>
  )
}

function ProfileSettings() {
  const { data: session } = useSession()
  const [saved, setSaved] = useState(false)
  const { data: profileData } = useQuery({ queryKey: ['profile'], queryFn: () => authApi.me().then(r => r.data) })
  const [form, setForm] = useState({ first_name: '', last_name: '', username: '', bio: '', university: '', weekly_goal_hours: 10 })

  useEffect(() => {
    if (profileData) setForm({
      first_name: profileData.first_name || '',
      last_name: profileData.last_name || '',
      username: profileData.username || '',
      bio: profileData.bio || '',
      university: profileData.university || '',
      weekly_goal_hours: profileData.weekly_goal_hours || 10,
    })
  }, [profileData])

  const mutation = useMutation({
    mutationFn: () => authApi.updateProfile(form),
    onSuccess: () => { setSaved(true); toast.success('Profile updated!'); setTimeout(() => setSaved(false), 2000) },
    onError: () => toast.error('Failed to update profile.'),
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const name = profileData?.first_name
    ? `${profileData.first_name} ${profileData.last_name || ''}`.trim()
    : session?.user?.name || 'User'

  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-6 space-y-6">
      <h2 className="text-sm font-black text-white uppercase tracking-widest">Profile Information</h2>

      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center text-white text-xl font-black">
            {getInitials(name)}
          </div>
        </div>
        <div>
          <p className="font-bold text-white">{name}</p>
          <p className="text-sm text-slate-500">{session?.user?.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">First Name</label>
          <input value={form.first_name} onChange={set('first_name')} placeholder="First name" className="input" />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Last Name</label>
          <input value={form.last_name} onChange={set('last_name')} placeholder="Last name" className="input" />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Username</label>
          <input value={form.username} onChange={set('username')} placeholder="username" className="input" />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">University</label>
          <input value={form.university} onChange={set('university')} placeholder="e.g. MIT" className="input" />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Bio</label>
          <textarea value={form.bio} onChange={set('bio')} placeholder="Tell us about yourself..." className="input resize-none" rows={3} />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Weekly Goal (hours)</label>
          <input type="number" min={1} max={100} value={form.weekly_goal_hours}
            onChange={e => setForm(f => ({ ...f, weekly_goal_hours: Number(e.target.value) }))} className="input" />
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary text-sm">
          {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : saved ? <><Check className="w-4 h-4" /> Saved!</> : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

function BillingSettings() {
  const [showPaywall, setShowPaywall] = useState(false)
  const [loading, setLoading] = useState(false)

  const { data: sub, refetch } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => paymentsApi.getStatus().then(r => r.data),
    staleTime: 30000,
  })

  const { priceInfo } = usePricing()

  const isPremium = sub?.is_premium ?? false
  const notesUsed = sub?.notes_used ?? 0
  const notesLimit = sub?.notes_limit ?? 5
  const notesRemaining = sub?.notes_remaining ?? notesLimit
  const expiresAt = sub?.subscription_expires_at
    ? new Date(sub.subscription_expires_at)
    : null

  const formatExpiry = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000))
    : null

  const handleRenew = () => setShowPaywall(true)

  return (
    <div className="space-y-4">
      {/* Plan card */}
      <div className={cn(
        'rounded-2xl p-6 border',
        isPremium
          ? 'bg-gradient-to-br from-orange-500/10 to-amber-500/5 border-orange-500/25'
          : 'bg-[#1a1a1a] border-white/8'
      )}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center',
              isPremium ? 'bg-orange-500/15' : 'bg-white/5'
            )}>
              {isPremium
                ? <Sparkles className="w-5 h-5 text-orange-400" />
                : <CreditCard className="w-5 h-5 text-slate-400" />
              }
            </div>
            <div>
              <p className="text-sm font-black text-white">
                {isPremium ? 'Premium Plan' : 'Free Plan'}
              </p>
              {isPremium && expiresAt ? (
                <p className={cn(
                  'text-xs mt-0.5',
                  daysLeft !== null && daysLeft <= 5 ? 'text-orange-400 font-bold' : 'text-slate-400'
                )}>
                  {daysLeft !== null && daysLeft <= 5
                    ? `⏰ Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
                    : `Active until ${formatExpiry(expiresAt)}`
                  }
                </p>
              ) : !isPremium ? (
                <p className="text-xs text-slate-500 mt-0.5">{priceInfo.displayShort} to unlock unlimited</p>
              ) : null}
            </div>
          </div>

          {isPremium ? (
            <button
              onClick={handleRenew}
              className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors"
            >
              Renew
            </button>
          ) : (
            <button
              onClick={() => setShowPaywall(true)}
              className="shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-orange-500 text-white hover:bg-orange-400 transition-colors shadow-lg shadow-orange-500/20"
            >
              <Sparkles className="w-3.5 h-3.5" /> {priceInfo.displayShort}
            </button>
          )}
        </div>
      </div>

      {/* Usage card */}
      <div className="bg-[#1a1a1a] rounded-2xl p-6 border border-white/8 space-y-4">
        <h2 className="text-sm font-black text-white uppercase tracking-widest">Usage</h2>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Study Kits</span>
            <span className="text-xs font-black text-white">
              {isPremium ? `${notesUsed} used` : `${notesUsed} / ${notesLimit}`}
            </span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                isPremium
                  ? 'bg-orange-500'
                  : notesUsed >= notesLimit
                    ? 'bg-red-500'
                    : notesUsed >= notesLimit * 0.8
                      ? 'bg-orange-500'
                      : 'bg-emerald-500'
              )}
              style={{ width: isPremium ? '100%' : `${Math.min(100, (notesUsed / notesLimit) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5">
            {isPremium
              ? 'Unlimited study kits included'
              : notesRemaining > 0
                ? `${notesRemaining} free kit${notesRemaining !== 1 ? 's' : ''} remaining`
                : 'Limit reached — upgrade to continue'
            }
          </p>
        </div>

        <div className="flex items-center justify-between py-3 border-t border-white/5">
          <div>
            <p className="text-xs font-bold text-white">AI Requests / hour</p>
            <p className="text-[10px] text-slate-600 mt-0.5">Rate limit for AI features</p>
          </div>
          <span className={cn(
            'text-xs font-black px-2 py-1 rounded-lg',
            isPremium
              ? 'bg-orange-500/10 text-orange-400'
              : 'bg-white/5 text-slate-400'
          )}>
            {isPremium ? '600 / hr' : '100 / hr'}
          </span>
        </div>
      </div>

      {/* Payment history note */}
      <div className="bg-[#1a1a1a] rounded-2xl p-5 border border-white/8">
        <p className="text-xs text-slate-500 leading-relaxed">
          Payments are processed securely via Paystack. Each payment grants 30 days of Premium access.
          Your subscription does <span className="text-white font-bold">not</span> auto-renew — you'll receive a reminder 3 days before expiry.
        </p>
      </div>

      {showPaywall && sub && (
        <PaywallModal
          onClose={() => setShowPaywall(false)}
          notesUsed={notesUsed}
          notesLimit={notesLimit}
          onSuccess={() => { refetch(); setShowPaywall(false) }}
        />
      )}
    </div>
  )
}

function NotificationSettings() {
  const [settings, setSettings] = useState({
    study_reminders: true, group_messages: true, ai_nudges: true,
    community_posts: false, deadline_alerts: true, weekly_summary: true,
  })
  const toggle = (k: string) => setSettings(s => ({ ...s, [k]: !s[k as keyof typeof s] }))
  const items = [
    { key: 'study_reminders', label: 'Study Reminders',  sub: 'Get notified when a study session is about to start' },
    { key: 'group_messages',  label: 'Group Messages',   sub: 'Notifications for new messages in your groups' },
    { key: 'ai_nudges',       label: 'AI Nudges',        sub: 'FlowAI suggestions and study tips' },
    { key: 'community_posts', label: 'Community Posts',  sub: 'New posts from people you follow' },
    { key: 'deadline_alerts', label: 'Deadline Alerts',  sub: 'Reminders 24h and 1h before deadlines' },
    { key: 'weekly_summary',  label: 'Weekly Summary',   sub: 'Your weekly study stats and achievements' },
  ]
  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-6">
      <h2 className="text-sm font-black text-white uppercase tracking-widest mb-5">Notification Preferences</h2>
      <div className="space-y-1">
        {items.map(item => (
          <div key={item.key} className="flex items-center justify-between py-3.5 border-b border-white/5 last:border-0">
            <div>
              <div className="text-sm font-bold text-white">{item.label}</div>
              <div className="text-xs text-slate-600 mt-0.5">{item.sub}</div>
            </div>
            <button onClick={() => toggle(item.key)}
              className={cn('relative w-10 h-5.5 rounded-full transition-colors', settings[item.key as keyof typeof settings] ? 'bg-orange-500' : 'bg-white/10')}>
              <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', settings[item.key as keyof typeof settings] ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function AppearanceSettings() {
  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-6 space-y-6">
      <h2 className="text-sm font-black text-white uppercase tracking-widest">Appearance</h2>
      <div className="flex items-center justify-between py-3 border-b border-white/5">
        <div>
          <div className="text-sm font-bold text-white">Theme</div>
          <div className="text-xs text-slate-600 mt-0.5">FlowState uses a dark theme by default</div>
        </div>
        <div className="px-3 py-1.5 bg-white/5 border border-white/8 rounded-xl text-xs font-bold text-slate-400">Dark</div>
      </div>
      <div>
        <div className="text-sm font-bold text-white mb-3">Accent Color</div>
        <div className="flex gap-3">
          {[
            { c: 'bg-orange-500', active: true },
            { c: 'bg-violet-500', active: false },
            { c: 'bg-emerald-500', active: false },
            { c: 'bg-sky-500', active: false },
            { c: 'bg-pink-500', active: false },
          ].map(({ c, active }) => (
            <button key={c} className={cn(`w-7 h-7 rounded-full ${c} transition-all`, active ? 'ring-2 ring-offset-2 ring-offset-[#1a1a1a] ring-orange-500 scale-110' : 'opacity-50 hover:opacity-80')} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SecuritySettings() {
  const [form, setForm] = useState({ current: '', new_pass: '', confirm: '' })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-6 space-y-6">
      <h2 className="text-sm font-black text-white uppercase tracking-widest">Security</h2>
      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Current Password</label>
          <input type="password" value={form.current} onChange={set('current')} placeholder="••••••••" className="input" />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">New Password</label>
          <input type="password" value={form.new_pass} onChange={set('new_pass')} placeholder="••••••••" className="input" />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Confirm New Password</label>
          <input type="password" value={form.confirm} onChange={set('confirm')} placeholder="••••••••" className="input" />
        </div>
        <button className="btn-primary text-sm">Update Password</button>
      </div>
      <div className="border-t border-white/5 pt-5">
        <h3 className="text-xs font-black text-red-400 uppercase tracking-widest mb-3">Danger Zone</h3>
        <p className="text-xs text-slate-600 mb-3">Once you delete your account, there is no going back.</p>
        <button className="text-sm text-red-400 border border-red-500/20 px-4 py-2 rounded-xl hover:bg-red-500/5 transition-colors">
          Delete Account
        </button>
      </div>
    </div>
  )
}
