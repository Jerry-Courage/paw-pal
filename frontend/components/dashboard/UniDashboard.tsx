'use client'

import { useState } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { libraryApi, aiApi, authApi } from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BookOpen, Upload, Brain, Trophy, ArrowRight, Flame, Zap, Target } from 'lucide-react'

const QUICK_ACTIONS = [
  { icon: Upload, label: 'Upload', desc: 'PDF, Video, Slides', href: '/library', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { icon: Brain, label: 'Ask AI', desc: 'Instant help', href: '/ai', color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  { icon: BookOpen, label: 'Library', desc: 'Study materials', href: '/library', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { icon: Trophy, label: 'Rankings', desc: 'Compete', href: '/rankings', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
]

function getMasteryInfo(mastery: number) {
  if (mastery >= 80) return { label: 'Mastered', color: 'text-green-400', bg: 'bg-green-500' }
  if (mastery >= 50) return { label: 'Strong', color: 'text-sky-400', bg: 'bg-sky-500' }
  if (mastery >= 20) return { label: 'Learning', color: 'text-primary', bg: 'bg-primary' }
  return { label: 'New', color: 'text-on-surface-variant', bg: 'bg-outline' }
}

export default function UniDashboard() {
  const { data: session } = useSession()
  const name = session?.user?.name?.split(' ')[0] || 'there'

  const { data: profileData } = useQuery({ queryKey: ['profile'], queryFn: () => authApi.me().then(r => r.data) })
  const { data: nudgeData } = useQuery({ queryKey: ['nudge'], queryFn: () => aiApi.getNudge().then(r => r.data) })
  const { data: resourcesData } = useQuery({ queryKey: ['resources'], queryFn: () => libraryApi.getResources().then(r => r.data) })
  const { data: analyticsData } = useQuery({ queryKey: ['analytics'], queryFn: () => authApi.getAnalytics().then(r => r.data) })

  const resources = resourcesData?.results || []
  const streak = profileData?.study_streak ?? 0
  const xp = profileData?.xp ?? 0
  const weekHours = analyticsData?.week_hours ?? 0
  const weeklyGoal = analyticsData?.goal_hours ?? profileData?.weekly_goal_hours ?? 10
  const weeklyPct = Math.min(100, Math.round((weekHours / Math.max(weeklyGoal, 1)) * 100))

  const progressQueries = useQueries({
    queries: resources.slice(0, 4).map((r: any) => ({
      queryKey: ['progress', r.id],
      queryFn: () => libraryApi.getProgress(r.id).then(res => res.data),
      staleTime: 30000,
      enabled: !!r.id,
    })),
  })

  return (
    <div className="space-y-8 pb-12">

      {/* ── Welcome Banner ── */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-500 p-6 sm:p-8 text-white shadow-2xl">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/20 backdrop-blur-md text-[11px] font-black uppercase tracking-wider text-blue-200">
              <span>🎓 University Hub</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Welcome back, {name}! 👋</h1>
            <p className="text-white/80 text-sm max-w-xl font-medium">
              {nudgeData?.nudge || 'Your AI tutor is ready. What are we studying today?'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-black/25 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
              <p className="text-[10px] uppercase font-black text-blue-200 tracking-wider">Streak</p>
              <p className="text-xl font-black flex items-center gap-1">🔥 {streak} <span className="text-sm font-bold">Days</span></p>
            </div>
            <div className="bg-black/25 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
              <p className="text-[10px] uppercase font-black text-blue-200 tracking-wider">Study XP</p>
              <p className="text-xl font-black flex items-center gap-1">⚡ {xp.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Weekly Progress ── */}
      <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-on-surface">Weekly Goal</h3>
          </div>
          <span className="text-xs font-bold text-on-surface-variant">{weekHours.toFixed(1)}h / {weeklyGoal}h</span>
        </div>
        <div className="w-full h-2.5 bg-surface-container-high rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-tertiary rounded-full transition-all duration-1000" style={{ width: `${weeklyPct}%` }} />
        </div>
        <p className="text-[11px] text-on-surface-variant mt-2">{weeklyPct}% of weekly goal completed</p>
      </div>

      {/* ── Quick Actions ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-black text-on-surface">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <Link key={action.label} href={action.href}
                className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30 flex flex-col items-center gap-3 text-center hover:border-primary/40 transition-all shadow-sm group">
                <div className={cn("w-12 h-12 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-110", action.color)}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-on-surface">{action.label}</p>
                  <p className="text-xs text-on-surface-variant">{action.desc}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Recent Materials ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-on-surface">Recent Materials</h2>
          <Link href="/library" className="text-xs font-black text-primary hover:underline flex items-center gap-1">
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {resources.length === 0 ? (
          <div className="bg-surface-container rounded-2xl p-8 border border-dashed border-outline-variant/30 text-center">
            <Upload className="w-10 h-10 text-on-surface-variant mx-auto mb-3" />
            <p className="font-bold text-on-surface mb-1">Library is empty</p>
            <p className="text-xs text-on-surface-variant mb-4">Upload your first material to get started.</p>
            <Link href="/library" className="inline-flex items-center gap-2 bg-primary text-on-primary text-xs font-bold px-4 py-2 rounded-xl hover:brightness-110 transition-all">
              <Upload className="w-4 h-4" /> Upload Now
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {resources.slice(0, 4).map((r: any, i: number) => {
              const progress = progressQueries[i]?.data as any
              const mastery = progress?.mastery ?? 0
              const info = getMasteryInfo(mastery)
              return (
                <Link key={r.id} href={`/library/${r.id}`}
                  className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/40 transition-all shadow-sm group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors">{r.title}</p>
                      <p className="text-xs text-on-surface-variant capitalize mt-0.5">{r.subject || r.resource_type}</p>
                    </div>
                    <span className={cn("text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full", info.color, 'bg-white/5')}>
                      {info.label}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", info.bg)} style={{ width: `${Math.min(100, mastery)}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-on-surface-variant">{mastery}%</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Study Activity (Simplified 7-day) ── */}
      {analyticsData?.daily_study?.length > 0 && (
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-on-surface">This Week</h3>
          </div>
          <div className="flex items-end gap-2 h-20">
            {analyticsData.daily_study.map((d: any, i: number) => {
              const maxMins = Math.max(...analyticsData.daily_study.map((x: any) => x.minutes), 1)
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex justify-center items-end h-14">
                    <div
                      className={cn("w-full max-w-[16px] rounded-t transition-all", d.minutes > 0 ? 'bg-primary' : 'bg-surface-container-high')}
                      style={{ height: `${Math.max(8, (d.minutes / maxMins) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-on-surface-variant">{d.day}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
