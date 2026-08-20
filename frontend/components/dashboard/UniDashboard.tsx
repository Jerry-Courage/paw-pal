'use client'

import { useState } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { libraryApi, aiApi, authApi } from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BookOpen, Upload, Brain, Trophy, ArrowRight, Flame, Zap, Target, Headphones } from 'lucide-react'

const QUICK_ACTIONS = [
  { icon: Upload, label: 'Upload', desc: 'PDF, Video, Slides', href: '/library', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { icon: Brain, label: 'Ask AI', desc: 'Instant help', href: '/ai', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
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
      <div className="relative overflow-hidden rounded-[2rem] bg-[#0c0c1d] p-6 sm:p-8 text-white shadow-2xl border border-white/[0.06]">
        {/* Animated mesh background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Glowing orbs */}
          <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-orange-500/[0.07] rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute bottom-0 right-1/4 w-60 h-60 bg-amber-500/[0.05] rounded-full blur-[80px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
          <div className="absolute top-0 right-1/3 w-40 h-40 bg-orange-400/[0.04] rounded-full blur-[60px] animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />

          {/* Floating data nodes */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <circle cx="15%" cy="30%" r="2" fill="#f97316" className="animate-pulse" style={{ animationDuration: '3s' }} />
            <circle cx="85%" cy="20%" r="1.5" fill="#f97316" className="animate-pulse" style={{ animationDuration: '4s', animationDelay: '1s' }} />
            <circle cx="70%" cy="70%" r="2" fill="#f97316" className="animate-pulse" style={{ animationDuration: '3.5s', animationDelay: '0.5s' }} />
            <circle cx="30%" cy="80%" r="1.5" fill="#f97316" className="animate-pulse" style={{ animationDuration: '4.5s', animationDelay: '1.5s' }} />
            <circle cx="50%" cy="15%" r="1" fill="#fb923c" className="animate-pulse" style={{ animationDuration: '3s', animationDelay: '2s' }} />
            <circle cx="90%" cy="55%" r="1.5" fill="#fb923c" className="animate-pulse" style={{ animationDuration: '5s', animationDelay: '0.8s' }} />
            {/* Connection lines */}
            <line x1="15%" y1="30%" x2="30%" y2="80%" stroke="#f97316" strokeWidth="0.5" opacity="0.3" />
            <line x1="70%" y1="70%" x2="85%" y2="20%" stroke="#f97316" strokeWidth="0.5" opacity="0.2" />
            <line x1="50%" y1="15%" x2="85%" y2="20%" stroke="#fb923c" strokeWidth="0.5" opacity="0.2" />
          </svg>

          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px'
          }} />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            {/* AI badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 backdrop-blur-sm">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
                  <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93" />
                  <path d="M12 9.93V22" />
                  <path d="M8 13h8" />
                  <path d="M9 17h6" />
                </svg>
              </div>
              <span className="text-[11px] font-black uppercase tracking-wider text-orange-300">AI-Powered Study Hub</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
              Welcome back, <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">{name}</span>! <span className="inline-block animate-bounce" style={{ animationDuration: '2s' }}>👋</span>
            </h1>
            <p className="text-white/50 text-sm max-w-lg font-medium leading-relaxed">
              {nudgeData?.nudge || 'Your AI tutor is warmed up and ready to help you crush your goals.'}
            </p>
          </div>

          {/* Stats as glass panels */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-orange-500/20 to-amber-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative bg-white/[0.04] backdrop-blur-xl px-5 py-3.5 rounded-2xl border border-white/[0.06] text-center hover:border-orange-500/20 transition-colors">
                <p className="text-[10px] uppercase font-black text-orange-400/80 tracking-widest mb-0.5">Streak</p>
                <p className="text-2xl font-black flex items-center justify-center gap-1.5">
                  <span className="text-lg">🔥</span>
                  <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">{streak}</span>
                  <span className="text-[11px] font-bold text-white/40">days</span>
                </p>
              </div>
            </div>
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative bg-white/[0.04] backdrop-blur-xl px-5 py-3.5 rounded-2xl border border-white/[0.06] text-center hover:border-orange-500/20 transition-colors">
                <p className="text-[10px] uppercase font-black text-orange-400/80 tracking-widest mb-0.5">Study XP</p>
                <p className="text-2xl font-black flex items-center justify-center gap-1.5">
                  <span className="text-lg">⚡</span>
                  <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">{xp.toLocaleString()}</span>
                </p>
              </div>
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

      {/* ── Personal Tutor CTA ── */}
      <Link href="/dashboard/personalised"
        className="flex items-center gap-4 rounded-2xl bg-surface-container border border-outline-variant/30 p-4 sm:p-5 hover:border-primary/50 hover:bg-surface-container-high transition-all group shadow-sm">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
          <Headphones className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm sm:text-base font-black text-on-surface tracking-tight">Talk to Your Personal Tutor</h3>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
          </div>
          <p className="text-xs text-on-surface-variant font-medium line-clamp-1">
            Real-time voice conversations · Remembers everything · Adapts to your level
          </p>
        </div>
        <div className="shrink-0 bg-primary text-on-primary text-xs font-bold px-4 py-2 rounded-xl group-hover:brightness-110 transition-all hidden sm:flex items-center gap-1.5">
          Start Session <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </Link>

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
