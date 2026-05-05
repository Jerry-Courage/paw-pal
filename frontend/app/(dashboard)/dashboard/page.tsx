'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { plannerApi, libraryApi, aiApi, authApi, groupsApi } from '@/lib/api'
import { Plus, Users, Upload, Sparkles, Clock, Flame, ArrowRight, Play, BookOpen, Brain, Target, BarChart2, Zap, Pencil, Check, Headphones, TrendingUp } from 'lucide-react'
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

  const sessions = sessionsData?.results || []
  const resources = resourcesData?.results || []
  const activeSession = sessions.find((s: any) => s.status === 'active' || s.status === 'scheduled')

  const studyStreak = profileData?.study_streak ?? 0
  const studyTime = profileData?.total_study_time ?? 0
  const weeklyGoal = profileData?.weekly_goal_hours ?? 10
  const weeklyProgress = Math.min(100, Math.round((studyTime / weeklyGoal) * 100))

  const quickActions = [
    { icon: Plus,     label: 'New Session',  sub: 'Start a focused block',   href: '/planner?new=1', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
    { icon: Users,    label: 'Start Group',  sub: 'Collaborate with peers',  href: '/groups',        color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    { icon: Upload,   label: 'Upload Files', sub: 'PDF, Video, or Notes',    href: '/library',       color: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
    { icon: Sparkles, label: 'Ask AI',       sub: 'Instant study help',      href: '/ai',            color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">

      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[#1a1a1a] border border-white/6 p-6 md:p-8">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-block px-3 py-1 mb-3 rounded-full bg-white/5 border border-white/8 text-[10px] font-black text-slate-500 tracking-widest uppercase">
              Your Workspace
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2">
              Welcome back, <span className="text-orange-400">{name}</span> 👋
            </h1>
            <p className="text-slate-500 text-sm max-w-lg leading-relaxed">
              {nudgeData?.nudge || "Ready to crush your goals today? Your AI tutor is primed and your workspace is waiting."}
            </p>
            {weeklyGoal > 0 && (
              <div className="mt-4 flex items-center gap-3 w-fit">
                <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-1000"
                    style={{ width: `${weeklyProgress}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 font-bold">{weeklyProgress}% of weekly goal</span>
              </div>
            )}
          </div>
          <div className="flex gap-4 shrink-0">
            <div className="bg-white/5 border border-white/8 p-4 rounded-2xl text-center min-w-[100px]">
              <div className="text-2xl font-black text-orange-400">
                {studyTime < 1 ? `${Math.round(studyTime * 60)}m` : `${studyTime.toFixed(1)}h`}
              </div>
              <div className="text-[9px] font-black text-slate-600 mt-1 uppercase tracking-widest">Total Focus</div>
            </div>
            <div className="bg-white/5 border border-white/8 p-4 rounded-2xl text-center min-w-[100px]">
              <div className="text-2xl font-black text-orange-400 flex items-center justify-center gap-1">
                {studyStreak} <Flame className="w-4 h-4 text-orange-400" />
              </div>
              <div className="text-[9px] font-black text-slate-600 mt-1 uppercase tracking-widest">Day Streak</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">

          {/* Quick Actions */}
          <div>
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-orange-500" /> Quick Actions
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickActions.map(a => (
                <Link key={a.label} href={a.href} className="group flex flex-col gap-3 p-4 rounded-2xl bg-[#1a1a1a] border border-white/6 hover:border-white/12 transition-all hover:-translate-y-0.5">
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center border transition-transform group-hover:scale-110', a.color)}>
                    <a.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{a.label}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">{a.sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Active session */}
          {activeSession && (
            <div className="relative overflow-hidden p-5 rounded-2xl bg-orange-500/5 border border-orange-500/20">
              <div className="text-[10px] font-black tracking-widest text-orange-500 mb-2 uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" /> Live Session
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-lg text-white">{activeSession.title}</h3>
                  <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(activeSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                    {new Date(activeSession.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <Link href="/planner" className="btn-primary text-sm shrink-0">
                  <Play className="w-4 h-4" /> Resume
                </Link>
              </div>
            </div>
          )}

          {/* Recent resources */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-orange-500" /> Recommended For You
              </h2>
              <Link href="/library" className="text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1">
                View Library <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {resources.slice(0, 6).map((r: any) => (
                <Link key={r.id} href={`/library/${r.id}`} className="group flex items-center gap-3 p-4 rounded-2xl bg-[#1a1a1a] border border-white/6 hover:border-white/12 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                    <BookIcon type={r.resource_type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-white truncate group-hover:text-orange-400 transition-colors">{r.title}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5 truncate">{r.subject || r.resource_type}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-700 group-hover:text-orange-400 transition-colors shrink-0" />
                </Link>
              ))}
              {resources.length === 0 && (
                <div className="col-span-full border border-dashed border-white/8 rounded-2xl p-10 text-center flex flex-col items-center gap-4">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center">
                    <Upload className="w-6 h-6 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white mb-1">Your library is empty</h3>
                    <p className="text-sm text-slate-600 mb-4">Upload your first material to unlock AI tutoring.</p>
                    <Link href="/library" className="btn-primary text-sm">Upload Now</Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <StudyInsights analytics={analyticsData} />
          <AIMastery analytics={analyticsData} />
          <ActivePulse />
        </div>
      </div>
    </div>
  )
}

function BookIcon({ type }: { type: string }) {
  const map: Record<string, any> = {
    pdf:   <BookOpen className="w-5 h-5 text-rose-400" />,
    video: <Play className="w-5 h-5 text-sky-400" />,
    code:  <Target className="w-5 h-5 text-emerald-400" />,
  }
  return map[type] || <BookOpen className="w-5 h-5 text-slate-500" />
}

function ActivePulse() {
  const { data } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.getGroups('my').then(r => r.data),
  })
  const groups: any[] = (data?.results || []).slice(0, 3)
  const COLORS = ['bg-emerald-400', 'bg-sky-400', 'bg-orange-400', 'bg-violet-400']

  return (
    <div className="rounded-2xl bg-[#1a1a1a] border border-white/6 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-emerald-400" /> Study Groups
        </h3>
        <Link href="/groups" className="text-[10px] font-black text-slate-600 hover:text-slate-400 uppercase tracking-widest transition-colors">
          View All
        </Link>
      </div>
      {groups.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-slate-600 mb-3">No active groups yet</p>
          <Link href="/groups" className="text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
            Create or join a group →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g: any, i: number) => (
            <Link key={g.id} href={`/groups/${g.id}`} className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all">
              <div className={`w-1.5 h-8 rounded-full ${COLORS[i % COLORS.length]}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate group-hover:text-orange-400 transition-colors">{g.name}</div>
                <div className="text-[11px] text-slate-600">{g.member_count} members</div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="mt-4 pt-4 border-t border-white/5">
        <Link href="/community" className="btn-secondary w-full text-sm">Explore Community</Link>
      </div>
    </div>
  )
}

function StudyInsights({ analytics }: { analytics?: any }) {
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const [saving, setSaving] = useState(false)
  const queryClient = useQueryClient()

  if (!analytics) return (
    <div className="rounded-2xl bg-[#1a1a1a] border border-white/6 p-5 space-y-3 animate-pulse">
      <div className="h-4 bg-white/5 rounded w-1/2" />
      <div className="h-20 bg-white/5 rounded-xl" />
    </div>
  )

  const { daily_study = [], flashcards = {}, goal_progress = 0, goal_hours = 10, week_hours = 0, best_day } = analytics
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
    <div className="rounded-2xl bg-[#1a1a1a] border border-white/6 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5 text-orange-400" /> Study Analytics
        </h3>
        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Last 7 days</span>
      </div>

      {/* Weekly goal */}
      <div className="bg-white/3 border border-white/5 p-4 rounded-xl mb-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-bold text-slate-400 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-orange-400" /> Weekly Goal
          </span>
          {editingGoal ? (
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max="168"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveGoal()}
                className="w-14 text-xs font-bold bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white outline-none"
                placeholder={String(goal_hours)}
                autoFocus
              />
              <span className="text-slate-500 text-xs">h</span>
              <button onClick={saveGoal} disabled={saving} className="w-6 h-6 bg-emerald-500 text-white rounded-lg flex items-center justify-center">
                <Check className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setGoalInput(String(goal_hours)); setEditingGoal(true) }}
              className="text-xs font-bold text-orange-400 flex items-center gap-1 hover:text-orange-300 transition-colors"
            >
              {week_hours}h / {goal_hours}h <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-1000', goal_progress >= 100 ? 'bg-emerald-500' : 'bg-orange-500')}
            style={{ width: `${Math.min(100, goal_progress)}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-600 mt-2">{goal_progress}% complete{goal_progress >= 100 && ' 🎉'}</p>
      </div>

      {/* Bar chart */}
      <div className="mb-4">
        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3">Daily study time</p>
        <div className="flex items-end gap-1.5 h-16">
          {daily_study.map((d: any, i: number) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex justify-center h-full items-end">
                <div
                  className={cn('w-full max-w-[18px] rounded-t transition-all duration-500', d.minutes > 0 ? 'bg-orange-500' : 'bg-white/5')}
                  style={{ height: `${Math.max(8, (d.minutes / maxMins) * 100)}%` }}
                />
              </div>
              <span className="text-[9px] font-bold text-slate-600">{d.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flashcard progress */}
      {flashcards.total > 0 && (
        <div className="bg-white/3 border border-white/5 p-3 rounded-xl mb-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-bold text-slate-400 flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-violet-400" /> Mastery
            </span>
            <span className="font-bold text-violet-400">{flashcards.reviewed}/{flashcards.total}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-1000"
              style={{ width: `${Math.round((flashcards.reviewed / flashcards.total) * 100)}%` }}
            />
          </div>
          {flashcards.due > 0 && (
            <p className="text-[10px] text-orange-400 mt-2">{flashcards.due} cards due for review</p>
          )}
        </div>
      )}

      <Link href="/library/flashcards" className="btn-secondary w-full text-xs">
        Review Flashcards <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

function AIMastery({ analytics }: { analytics?: any }) {
  if (!analytics?.ai_stats) return null
  const stats = analytics.ai_stats

  const items = [
    { label: 'Podcasts',    value: stats.podcasts,            icon: Headphones, color: 'text-pink-400 bg-pink-500/10' },
    { label: 'AI Chats',    value: stats.chats,               icon: Sparkles,   color: 'text-violet-400 bg-violet-500/10' },
    { label: 'Flashcards',  value: stats.mastered_flashcards, icon: Brain,      color: 'text-emerald-400 bg-emerald-500/10' },
    { label: 'Analyses',    value: stats.vision,              icon: Zap,        color: 'text-sky-400 bg-sky-500/10' },
  ]

  return (
    <div className="rounded-2xl bg-[#1a1a1a] border border-white/6 p-5">
      <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-orange-400" /> AI Mastery
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item, i) => (
          <div key={i} className="p-3 rounded-xl bg-white/3 border border-white/5">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', item.color)}>
              <item.icon className="w-4 h-4" />
            </div>
            <div className="text-lg font-black text-white">{item.value}</div>
            <div className="text-[9px] font-black text-slate-600 uppercase tracking-wider mt-0.5">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

