'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { plannerApi, libraryApi, aiApi, authApi, workspaceApi } from '@/lib/api'
import {
  Upload, Sparkles, Clock, Flame, ArrowRight, Play,
  BookOpen, Brain, Target, BarChart2, Zap, Pencil,
  Check, Headphones, LayoutGrid, FileText, TrendingUp,
  Layers, Plus
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const { data: session } = useSession()
  const name = session?.user?.name?.split(' ')[0] || 'there'

  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.me().then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: nudgeData } = useQuery({
    queryKey: ['nudge'],
    queryFn: () => aiApi.getNudge().then(r => r.data),
  })

  const { data: sessionsData } = useQuery({
    queryKey: ['planner-sessions'],
    queryFn: () => plannerApi.getSessions().then(r => r.data),
  })

  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })

  const { data: analyticsData } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => authApi.getAnalytics().then(r => r.data),
  })

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.getAll().then(r => r.data),
    staleTime: 30000,
  })

  const workspaces = Array.isArray(workspacesData) ? workspacesData : workspacesData?.results || []
  const totalUnread = workspaces.reduce((sum: number, ws: any) => sum + (ws.unread_count || 0), 0)
  const sessions = sessionsData?.results || []
  const resources = resourcesData?.results || []
  const activeSession = sessions.find((s: any) => s.status === 'active' || s.status === 'scheduled')

  const studyStreak  = profileData?.study_streak ?? 0
  // total_study_time is lifetime hours — use it for the Focus stat display
  const studyTime    = profileData?.total_study_time ?? 0
  // Weekly progress comes from analytics (week_hours vs goal_hours), NOT lifetime total
  const weekHours    = analyticsData?.week_hours ?? 0
  const weeklyGoal   = analyticsData?.goal_hours ?? profileData?.weekly_goal_hours ?? 10
  const weeklyPct    = Math.min(100, Math.round((weekHours / Math.max(weeklyGoal, 1)) * 100))

  const quickActions = [
    {
      icon: Upload,
      label: 'Upload',
      sub: 'PDF, Video, Slides',
      href: '/library',
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
    },
    {
      icon: Sparkles,
      label: 'Ask AI',
      sub: 'Instant help',
      href: '/ai',
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
    },
    {
      icon: LayoutGrid,
      label: 'Collab',
      sub: 'Study together',
      href: '/workspace',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      badge: totalUnread,
    },
    {
      icon: Layers,
      label: 'Flashcards',
      sub: 'Review & practice',
      href: '/library/flashcards',
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
    },
  ]

  return (
    <div className="max-w-5xl mx-auto px-0 space-y-6">

      {/* ── Hero greeting ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-[#111] border border-white/[0.05] p-6 md:p-8">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-orange-500/[0.04] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-violet-500/[0.04] rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight mb-2">
              Hey, <span className="text-orange-400">{name}</span> 👋
            </h1>
            <p className="text-slate-500 text-sm leading-relaxed max-w-md">
              {nudgeData?.nudge || 'Your AI tutor is ready. What are we studying today?'}
            </p>

            {/* Weekly progress bar */}
            {weeklyGoal > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <div className="w-28 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-1000"
                    style={{ width: `${weeklyPct}%` }}
                  />
                </div>
                <span className="text-xs text-slate-600 font-medium">
                  {weekHours}h / {weeklyGoal}h this week
                </span>
              </div>
            )}
          </div>

          {/* Stats pills */}
          <div className="flex gap-2.5 shrink-0">
            <div className="flex flex-col items-center justify-center bg-white/[0.04] border border-white/[0.06] rounded-2xl px-5 py-3.5 min-w-[80px]">
              <span className="text-xl font-black text-orange-400">
                {studyTime < 1 ? `${Math.round(studyTime * 60)}m` : `${studyTime.toFixed(1)}h`}
              </span>
              <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">Focus</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-white/[0.04] border border-white/[0.06] rounded-2xl px-5 py-3.5 min-w-[80px]">
              <span className="text-xl font-black text-orange-400 flex items-center gap-1">
                {studyStreak}<Flame className="w-3.5 h-3.5" />
              </span>
              <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">Streak</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick actions ──────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {quickActions.map(a => (
          <Link
            key={a.label}
            href={a.href}
            className="group relative flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-[#111] border border-white/[0.05] hover:border-white/10 hover:-translate-y-0.5 transition-all duration-200"
          >
            {(a as any).badge > 0 && (
              <div className="absolute top-2.5 right-2.5 w-4 h-4 bg-orange-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30">
                {(a as any).badge > 9 ? '9+' : (a as any).badge}
              </div>
            )}
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110', a.bg, a.color)}>
              <a.icon className="w-5 h-5" />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-white leading-none">{a.label}</p>
              <p className="text-[10px] text-slate-600 mt-0.5 hidden sm:block">{a.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Active session banner ──────────────────────────── */}
      {activeSession && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-orange-500/[0.06] border border-orange-500/20">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shrink-0" />
            <div>
              <p className="text-sm font-bold text-white leading-none">{activeSession.title}</p>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(activeSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {new Date(activeSession.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <Link href="/planner" className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold rounded-xl transition-all shrink-0">
            <Play className="w-3.5 h-3.5" /> Resume
          </Link>
        </div>
      )}

      {/* ── Main grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5">

        {/* Left: Recent library */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-orange-500" /> Recent Materials
            </h2>
            <Link href="/library" className="text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1">
              Library <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {resources.length === 0 ? (
            <div className="border border-dashed border-white/[0.08] rounded-2xl p-10 text-center flex flex-col items-center gap-4">
              <div className="w-12 h-12 bg-white/[0.04] rounded-2xl flex items-center justify-center">
                <Upload className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <p className="font-bold text-white text-sm mb-1">Library is empty</p>
                <p className="text-xs text-slate-600 mb-4">Upload your first material to unlock AI study tools.</p>
                <Link href="/library" className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold rounded-xl transition-all">
                  <Plus className="w-3.5 h-3.5" /> Upload Now
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {resources.slice(0, 6).map((r: any) => (
                <Link
                  key={r.id}
                  href={`/library/${r.id}`}
                  className="group flex items-center gap-3.5 p-3.5 rounded-xl bg-[#111] border border-white/[0.05] hover:border-white/10 transition-all"
                >
                  <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0">
                    <ResourceIcon type={r.resource_type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate group-hover:text-orange-400 transition-colors leading-none mb-0.5">
                      {r.title}
                    </p>
                    <p className="text-[11px] text-slate-600 truncate capitalize">
                      {r.subject || r.resource_type}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.has_study_kit && (
                      <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Ready
                      </span>
                    )}
                    <ArrowRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-orange-400 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right: Analytics sidebar */}
        <div className="space-y-4">
          <StudyInsights analytics={analyticsData} />
          <AIMastery analytics={analyticsData} />
        </div>
      </div>
    </div>
  )
}

/* ── Resource type icon ─────────────────────────────── */
function ResourceIcon({ type }: { type: string }) {
  const map: Record<string, React.ReactNode> = {
    pdf:    <FileText className="w-4 h-4 text-rose-400" />,
    video:  <Play className="w-4 h-4 text-sky-400" />,
    slides: <Layers className="w-4 h-4 text-orange-400" />,
    code:   <Zap className="w-4 h-4 text-emerald-400" />,
  }
  return <>{map[type] || <BookOpen className="w-4 h-4 text-slate-500" />}</>
}

/* ── Study analytics card ───────────────────────────── */
function StudyInsights({ analytics }: { analytics?: any }) {
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput]     = useState('')
  const [saving, setSaving]           = useState(false)
  const queryClient = useQueryClient()

  if (!analytics) return (
    <div className="rounded-2xl bg-[#111] border border-white/[0.05] p-5 space-y-3 animate-pulse">
      <div className="h-3 bg-white/[0.06] rounded w-1/2" />
      <div className="h-20 bg-white/[0.06] rounded-xl" />
    </div>
  )

  const {
    daily_study = [], flashcards = {},
    goal_progress = 0, goal_hours = 10,
    week_hours = 0,
  } = analytics

  const maxMins = Math.max(...daily_study.map((d: any) => d.minutes), 1)

  const saveGoal = async () => {
    const h = parseFloat(goalInput)
    if (!h || h <= 0) return
    setSaving(true)
    try {
      await authApi.setWeeklyGoal(h)
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setEditingGoal(false)
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-2xl bg-[#111] border border-white/[0.05] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5 text-orange-400" /> Analytics
        </h3>
        <span className="text-[9px] text-slate-600 font-medium">7 days</span>
      </div>

      {/* Weekly goal */}
      <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3.5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
            <Target className="w-3 h-3 text-orange-400" /> Weekly Goal
          </span>
          {editingGoal ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number" min="1" max="168"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveGoal()}
                className="w-12 text-xs font-bold bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-white outline-none focus:border-orange-500/50"
                placeholder={String(goal_hours)}
                autoFocus
              />
              <span className="text-slate-500 text-xs">h</span>
              <button
                onClick={saveGoal} disabled={saving}
                className="w-6 h-6 bg-emerald-500 text-white rounded-lg flex items-center justify-center"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setGoalInput(String(goal_hours)); setEditingGoal(true) }}
              className="text-xs font-bold text-orange-400 flex items-center gap-1 hover:text-orange-300 transition-colors"
            >
              {week_hours}h / {goal_hours}h <Pencil className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-1000', goal_progress >= 100 ? 'bg-emerald-500' : 'bg-orange-500')}
            style={{ width: `${Math.min(100, goal_progress)}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-600 mt-1.5">
          {goal_progress}% complete{goal_progress >= 100 ? ' 🎉' : ''}
        </p>
      </div>

      {/* Bar chart */}
      {daily_study.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2.5">Daily study</p>
          <div className="flex items-end gap-1.5 h-14">
            {daily_study.map((d: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex justify-center h-full items-end">
                  <div
                    className={cn('w-full max-w-[16px] rounded-t transition-all duration-500', d.minutes > 0 ? 'bg-orange-500' : 'bg-white/[0.05]')}
                    style={{ height: `${Math.max(6, (d.minutes / maxMins) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] font-medium text-slate-600">{d.day}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flashcard mastery */}
      {flashcards.total > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-400 flex items-center gap-1.5">
              <Brain className="w-3 h-3 text-violet-400" /> Flashcard Mastery
            </span>
            <span className="font-bold text-violet-400">{flashcards.reviewed}/{flashcards.total}</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-1000"
              style={{ width: `${Math.round((flashcards.reviewed / flashcards.total) * 100)}%` }}
            />
          </div>
          {flashcards.due > 0 && (
            <p className="text-[10px] text-orange-400 mt-1.5">{flashcards.due} cards due</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── AI usage stats ─────────────────────────────────── */
function AIMastery({ analytics }: { analytics?: any }) {
  if (!analytics?.ai_stats) return null
  const s = analytics.ai_stats

  const items = [
    { label: 'Podcasts',   value: s.podcasts,            icon: Headphones, color: 'text-pink-400 bg-pink-500/10'     },
    { label: 'AI Chats',   value: s.chats,               icon: Sparkles,   color: 'text-violet-400 bg-violet-500/10' },
    { label: 'Flashcards', value: s.mastered_flashcards, icon: Brain,      color: 'text-emerald-400 bg-emerald-500/10'},
    { label: 'Analyses',   value: s.vision,              icon: Zap,        color: 'text-sky-400 bg-sky-500/10'       },
  ]

  return (
    <div className="rounded-2xl bg-[#111] border border-white/[0.05] p-5">
      <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-orange-400" /> AI Usage
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item, i) => (
          <div key={i} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center mb-2', item.color)}>
              <item.icon className="w-3.5 h-3.5" />
            </div>
            <p className="text-base font-black text-white leading-none">{item.value ?? 0}</p>
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
