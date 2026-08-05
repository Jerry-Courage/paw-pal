'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { plannerApi, libraryApi, aiApi, authApi, workspaceApi, paymentsApi } from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { usePricing } from '@/hooks/usePricing'

const PaywallModal = dynamic(() => import('@/components/ui/PaywallModal'), { ssr: false })

function getMasteryLabel(mastery: number) {
  if (mastery >= 80) return { label: 'Mastered', color: 'text-green-400', barColor: 'bg-green-500' }
  if (mastery >= 60) return { label: 'Strong', color: 'text-sky-400', barColor: 'bg-sky-500' }
  if (mastery >= 40) return { label: 'Building', color: 'text-primary', barColor: 'bg-primary-container' }
  if (mastery >= 20) return { label: 'Learning', color: 'text-tertiary', barColor: 'bg-tertiary' }
  return { label: 'New', color: 'text-on-surface-variant', barColor: 'bg-outline' }
}

const QUICK_ACTIONS = [
  { icon: 'upload_file', label: 'Upload', sub: 'PDF, Video, Slides', href: '/library', color: 'bg-primary-container text-on-primary-container' },
  { icon: 'smart_toy', label: 'Ask AI', sub: 'Instant help', href: '/ai', color: 'bg-secondary-container text-on-secondary-container' },
  { icon: 'school', label: 'Tutor', sub: 'Personalised', href: '/dashboard/personalised', color: 'bg-tertiary-container text-on-tertiary-container' },
  { icon: 'shelves', label: 'Library', sub: 'Study materials', href: '/library', color: 'bg-surface-container-highest text-on-surface' },
]

export default function DashboardPage() {
  const { data: session } = useSession()
  const name = session?.user?.name?.split(' ')[0] || 'there'
  const [showPaywall, setShowPaywall] = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const { priceInfo } = usePricing()

  const { data: profileData } = useQuery({ queryKey: ['profile'], queryFn: () => authApi.me().then(r => r.data), refetchInterval: 60000 })
  const { data: nudgeData } = useQuery({ queryKey: ['nudge'], queryFn: () => aiApi.getNudge().then(r => r.data) })
  const { data: sessionsData } = useQuery({ queryKey: ['planner-sessions'], queryFn: () => plannerApi.getSessions().then(r => r.data) })
  const { data: resourcesData } = useQuery({ queryKey: ['resources'], queryFn: () => libraryApi.getResources().then(r => r.data) })
  const { data: analyticsData } = useQuery({ queryKey: ['analytics'], queryFn: () => authApi.getAnalytics().then(r => r.data) })
  const { data: workspacesData } = useQuery({ queryKey: ['workspaces'], queryFn: () => workspaceApi.getAll().then(r => r.data), staleTime: 30000 })
  const { data: subStatus, refetch: refetchSub } = useQuery({ queryKey: ['subscription-status'], queryFn: () => paymentsApi.getStatus().then(r => r.data), staleTime: 60000 })

  const isPremium = subStatus?.is_premium ?? false
  const notesUsed = subStatus?.notes_used ?? 0
  const notesLimit = subStatus?.notes_limit ?? 5
  const notesRemaining = subStatus?.notes_remaining ?? notesLimit
  const showUpgradeNudge = !isPremium && notesUsed >= Math.ceil(notesLimit * 0.4) && !nudgeDismissed

  const workspaces = Array.isArray(workspacesData) ? workspacesData : workspacesData?.results || []
  const totalUnread = workspaces.reduce((sum: number, ws: any) => sum + (ws.unread_count || 0), 0)
  const sessions = sessionsData?.results || []
  const resources = resourcesData?.results || []
  const activeSession = sessions.find((s: any) => s.status === 'active' || s.status === 'scheduled')

  const studyStreak = profileData?.study_streak ?? 0
  const studyTime = profileData?.total_study_time ?? 0
  const totalXp = profileData?.xp ?? 0
  const weekHours = analyticsData?.week_hours ?? 0
  const weeklyGoal = analyticsData?.goal_hours ?? profileData?.weekly_goal_hours ?? 10
  const weeklyPct = Math.min(100, Math.round((weekHours / Math.max(weeklyGoal, 1)) * 100))
  const userLevel = profileData?.level || { name: 'Freshman' }

  const progressQueries = useQueries({
    queries: resources.slice(0, 6).map((resource: any) => ({
      queryKey: ['progress', resource.id],
      queryFn: () => libraryApi.getProgress(resource.id).then(r => r.data),
      staleTime: 30000,
      enabled: !!resource.id,
    })),
  })

  // Handle payment return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reference = params.get('reference')
    const payment = params.get('payment')
    if (reference && payment === 'success') {
      window.history.replaceState({}, document.title, window.location.pathname)
      paymentsApi.verify(reference).then(res => {
        if (res.data.success) { toast.success('Payment confirmed! You\'re now Premium 🎉'); refetchSub() }
      }).catch(() => {})
    }
  }, [refetchSub])

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-6xl mx-auto space-y-stack-md">

      {/* ── Upgrade nudge ─────────────────────────────────── */}
      {showUpgradeNudge && (
        <div className="relative flex items-center gap-stack-md px-stack-md py-stack-sm rounded-[1rem] bg-secondary-container/20 border border-secondary-container/30">
          <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-on-surface">
              {notesRemaining === 0 ? "You've used all your free kits" : `${notesRemaining} free kit${notesRemaining !== 1 ? 's' : ''} remaining`}
            </p>
            <p className="text-[12px] text-on-surface-variant">Unlock unlimited kits for just {priceInfo?.displayShort || '$0.99/mo'}</p>
          </div>
          <button onClick={() => setShowPaywall(true)} className="shrink-0 bg-primary text-on-primary text-[13px] font-bold px-stack-sm py-2 rounded-[1rem] btn-3d hover:brightness-110 transition-all">
            Upgrade
          </button>
          <button onClick={() => setNudgeDismissed(true)} className="absolute top-2 right-2 text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* ── Hero greeting ─────────────────────────────────── */}
      <section className="bg-surface-container-low rounded-[2rem] p-stack-md border border-outline-variant/20 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-stack-md relative">
          <div className="flex-1">
            <h2 className="text-[28px] md:text-[36px] font-bold text-on-surface leading-tight mb-base">
              Welcome back, <span className="text-primary">{name}!</span>
            </h2>
            <p className="text-on-surface-variant text-body-md max-w-md">
              {nudgeData?.nudge || 'Your AI tutor is ready. What are we studying today?'}
            </p>
            {weeklyGoal > 0 && (
              <div className="mt-stack-sm flex items-center gap-stack-sm">
                <div className="w-32 h-2 bg-surface-container-highest rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${weeklyPct}%` }} />
                </div>
                <span className="text-[12px] text-on-surface-variant font-medium">{weekHours}h / {weeklyGoal}h this week</span>
              </div>
            )}
          </div>
          {/* Stats pills */}
          <div className="flex gap-base shrink-0 flex-wrap">
            <div className="flex flex-col items-center justify-center bg-surface-container rounded-[1.5rem] px-stack-sm py-stack-sm min-w-[72px] border border-outline-variant/20">
              <span className="text-[22px] font-bold text-primary-container">
                {studyTime < 1 ? `${Math.round(studyTime * 60)}m` : `${studyTime.toFixed(1)}h`}
              </span>
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Focus</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-surface-container rounded-[1.5rem] px-stack-sm py-stack-sm min-w-[72px] border border-outline-variant/20">
              <span className="text-[22px] font-bold text-primary-container flex items-center gap-1">
                {studyStreak}
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
              </span>
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Streak</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-surface-container rounded-[1.5rem] px-stack-sm py-stack-sm min-w-[80px] border border-outline-variant/20">
              <span className="text-[22px] font-bold text-tertiary">{totalXp.toLocaleString()}</span>
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">XP</span>
              <span className="text-[9px] text-on-surface-variant">{userLevel?.name || 'Freshman'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Quick actions ─────────────────────────────────── */}
      <section>
        <h3 className="text-[13px] font-bold text-on-surface-variant uppercase tracking-widest mb-stack-sm flex items-center gap-base">
          <span className="material-symbols-outlined text-[16px] text-primary-container">bolt</span>
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
          {QUICK_ACTIONS.map(a => (
            <Link key={a.label} href={a.href} className="group flex flex-col items-center gap-base p-stack-md rounded-[1.5rem] bg-surface-container-low border border-outline-variant/20 hover:border-outline-variant transition-all hover:-translate-y-1">
              <div className={cn('w-12 h-12 rounded-[1rem] flex items-center justify-center transition-transform group-hover:scale-110', a.color)}>
                <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>{a.icon}</span>
              </div>
              <div className="text-center">
                <p className="text-[14px] font-bold text-on-surface">{a.label}</p>
                <p className="text-[11px] text-on-surface-variant">{a.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Active session banner ─────────────────────────── */}
      {activeSession && (
        <div className="flex items-center justify-between gap-stack-md px-stack-md py-stack-sm rounded-[1rem] bg-primary-container/10 border border-primary-container/20">
          <div className="flex items-center gap-base">
            <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse shrink-0" />
            <div>
              <p className="text-[14px] font-bold text-on-surface">{activeSession.title}</p>
              <p className="text-[12px] text-on-surface-variant">
                {new Date(activeSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {new Date(activeSession.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <Link href="/planner" className="flex items-center gap-base bg-primary-container text-on-primary-container text-[13px] font-bold px-stack-sm py-2 rounded-[1rem] btn-3d hover:brightness-110 transition-all">
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
            Resume
          </Link>
        </div>
      )}

      {/* ── Main grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-gutter items-start">
        {/* Recent Materials */}
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between mb-stack-sm">
            <h3 className="text-[13px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-base">
              <span className="material-symbols-outlined text-[16px] text-primary-container">menu_book</span>
              Recent Materials
            </h3>
            <Link href="/library" className="text-[13px] font-bold text-primary hover:text-primary-container transition-colors flex items-center gap-1">
              View All
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </div>

          {resources.length === 0 ? (
            <div className="border-2 border-dashed border-outline-variant/30 rounded-[2rem] p-stack-lg text-center flex flex-col items-center gap-stack-md">
              <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-[32px] text-on-surface-variant">upload_file</span>
              </div>
              <div>
                <p className="font-bold text-on-surface mb-base">Library is empty</p>
                <p className="text-[13px] text-on-surface-variant mb-stack-md">Upload your first material to unlock AI study tools.</p>
                <Link href="/library" className="inline-flex items-center gap-base bg-primary text-on-primary text-[13px] font-bold px-stack-md py-2 rounded-[1rem] btn-3d hover:brightness-110 transition-all">
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Upload Now
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-base">
              {resources.slice(0, 6).map((r: any, index: number) => {
                const progress = progressQueries[index]?.data
                const mastery = progress?.mastery ?? 0
                const { label, color, barColor } = getMasteryLabel(mastery)
                return (
                  <Link key={r.id} href={`/library/${r.id}`} className="group flex items-center gap-stack-md bg-surface-container-low rounded-[1.5rem] p-stack-sm border border-outline-variant/20 hover:border-outline-variant transition-all">
                    <div className="w-12 h-12 rounded-[1rem] bg-surface-container-high flex items-center justify-center shrink-0">
                      <span className={cn('material-symbols-outlined text-[22px]', color)}>
                        {r.resource_type === 'video' ? 'play_circle' : r.resource_type === 'slides' ? 'slideshow' : r.resource_type === 'code' ? 'code' : 'description'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-on-surface truncate group-hover:text-primary transition-colors">{r.title}</p>
                      <p className="text-[11px] text-on-surface-variant capitalize">{r.subject || r.resource_type}</p>
                    </div>
                    <div className="shrink-0 text-right min-w-[80px]">
                      <p className={cn('text-[11px] font-bold', color)}>{label}</p>
                      <div className="h-1.5 w-16 bg-surface-container-highest rounded-full overflow-hidden mt-1">
                        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${Math.min(100, mastery)}%` }} />
                      </div>
                      <p className="text-[10px] text-on-surface-variant mt-0.5">{mastery}%</p>
                    </div>
                    {r.has_study_kit && (
                      <span className="shrink-0 text-[10px] font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">Kit</span>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Analytics sidebar */}
        <div className="space-y-stack-md">
          {/* 7-day bar chart */}
          {analyticsData?.daily_study?.length > 0 && (
            <div className="bg-surface-container-low rounded-[2rem] p-stack-md border border-outline-variant/20">
              <h3 className="text-[13px] font-bold text-on-surface-variant uppercase tracking-widest mb-stack-md flex items-center gap-base">
                <span className="material-symbols-outlined text-[16px] text-primary-container">bar_chart</span>
                This Week
              </h3>
              <div className="flex items-end gap-base h-16">
                {analyticsData.daily_study.map((d: any, i: number) => {
                  const maxMins = Math.max(...analyticsData.daily_study.map((x: any) => x.minutes), 1)
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex justify-center items-end h-12">
                        <div
                          className={cn('w-full max-w-[14px] rounded-t transition-all', d.minutes > 0 ? 'bg-primary' : 'bg-surface-container-highest')}
                          style={{ height: `${Math.max(6, (d.minutes / maxMins) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-on-surface-variant">{d.day}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* AI usage */}
          {analyticsData?.ai_stats && (
            <div className="bg-surface-container-low rounded-[2rem] p-stack-md border border-outline-variant/20">
              <h3 className="text-[13px] font-bold text-on-surface-variant uppercase tracking-widest mb-stack-md flex items-center gap-base">
                <span className="material-symbols-outlined text-[16px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                AI Usage
              </h3>
              <div className="grid grid-cols-2 gap-base">
                {[
                  { label: 'Podcasts', value: analyticsData.ai_stats.podcasts, icon: 'podcasts', color: 'text-primary' },
                  { label: 'AI Chats', value: analyticsData.ai_stats.chats, icon: 'smart_toy', color: 'text-secondary' },
                  { label: 'Flashcards', value: analyticsData.ai_stats.mastered_flashcards, icon: 'style', color: 'text-tertiary' },
                  { label: 'Analyses', value: analyticsData.ai_stats.vision, icon: 'visibility', color: 'text-primary' },
                ].map((item, i) => (
                  <div key={i} className="bg-surface-container p-3 rounded-[1rem]">
                    <span className={cn('material-symbols-outlined text-[20px] mb-1 block', item.color)}>{item.icon}</span>
                    <p className="text-[18px] font-bold text-on-surface">{item.value ?? 0}</p>
                    <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rankings leaderboard mini */}
          <div className="bg-surface-container-low rounded-[2rem] p-stack-md border border-outline-variant/20">
            <h3 className="text-[13px] font-bold text-on-surface-variant uppercase tracking-widest mb-stack-md flex items-center gap-base">
              <span className="material-symbols-outlined text-[16px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
              Rankings
            </h3>
            <div className="space-y-2">
              {/* Rank #1 placeholder — golden */}
              <div className="flex items-center gap-base px-base py-2 rounded-[1rem] bg-yellow-500/8 border border-yellow-500/20">
                <span className="text-[13px] font-black text-yellow-400 w-5 shrink-0">1</span>
                <div className="w-7 h-7 rounded-full bg-yellow-500/30 flex items-center justify-center text-yellow-300 text-[10px] font-bold shrink-0">🥇</div>
                <p className="text-[13px] text-on-surface flex-1 truncate">Top Scholar</p>
                <span className="text-[11px] font-bold text-yellow-400">—</span>
              </div>
              {/* Current user */}
              <div className="flex items-center gap-base px-base py-2 rounded-[1rem] bg-primary/10 border border-primary/30">
                <span className="text-[13px] font-black text-primary w-5 shrink-0">—</span>
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-on-primary text-[10px] font-bold shrink-0">
                  {name?.[0]?.toUpperCase() || 'Y'}
                </div>
                <p className="text-[13px] text-on-surface font-bold flex-1 truncate">You</p>
                <span className="text-[11px] font-bold text-primary">{totalXp.toLocaleString()} XP</span>
              </div>
            </div>
            <Link href="/rankings" className="mt-stack-sm w-full flex items-center justify-center gap-2 bg-primary-container text-on-primary-container font-bold text-[13px] py-2.5 rounded-[1rem] hover:brightness-110 transition-all btn-squishy">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>leaderboard</span>
              View Rankings
            </Link>
          </div>
        </div>
      </div>

      {/* Paywall modal */}
      {showPaywall && subStatus && (
        <PaywallModal
          onClose={() => setShowPaywall(false)}
          notesUsed={notesUsed}
          notesLimit={notesLimit}
          onSuccess={() => { refetchSub(); setShowPaywall(false); setNudgeDismissed(true) }}
        />
      )}
    </div>
  )
}
