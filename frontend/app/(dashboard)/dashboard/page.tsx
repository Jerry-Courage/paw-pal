'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { plannerApi, libraryApi, aiApi, authApi, groupsApi } from '@/lib/api'
import { Plus, Users, Upload, Sparkles, Clock, Flame, ArrowRight, Play, TrendingUp, BookOpen, Brain, Target, BarChart2, Zap, Pencil, Check, Headphones } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const { data: session } = useSession()
  const name = session?.user?.name || 'there'

  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.me().then((r) => r.data),
    refetchInterval: 60000,
  })

  const { data: nudgeData } = useQuery({
    queryKey: ['nudge'],
    queryFn: () => aiApi.getNudge().then((r) => r.data),
  })

  const { data: sessionsData } = useQuery({
    queryKey: ['planner-sessions'],
    queryFn: () => plannerApi.getSessions().then((r) => r.data),
  })

  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then((r) => r.data),
  })

  const { data: analyticsData } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => authApi.getAnalytics().then((r) => r.data),
  })

  const sessions = sessionsData?.results || []
  const resources = resourcesData?.results || []
  const activeSession = sessions.find((s: any) => s.status === 'active' || s.status === 'scheduled')

  const studyStreak = profileData?.study_streak ?? 0
  const studyTime = profileData?.total_study_time ?? 0
  const weeklyGoal = profileData?.weekly_goal_hours ?? 10
  const weeklyProgress = Math.min(100, Math.round((studyTime / weeklyGoal) * 100))

  const quickActions = [
    { icon: Plus, label: 'New Session', sub: 'Start a focused block', href: '/planner?new=1' as const, bg: 'bg-primary', light: 'bg-primary/10', text: 'text-primary' },
    { icon: Users, label: 'Start Group', sub: 'Collaborate with peers', href: '/groups' as const, bg: 'bg-emerald-500', light: 'bg-emerald-500/10', text: 'text-emerald-500' },
    { icon: Upload, label: 'Upload Files', sub: 'PDF, Video, or Notes', href: '/library' as const, bg: 'bg-violet-500', light: 'bg-violet-500/10', text: 'text-violet-500' },
    { icon: Sparkles, label: 'Ask AI', sub: 'Instant study help', href: '/ai' as const, bg: 'bg-pink-500', light: 'bg-pink-500/10', text: 'text-pink-500' },
  ]

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 animate-fade-in-up">
      {/* Welcome banner */}
      <div id="tour-welcome" className="glass-card p-6 md:p-8 overflow-hidden relative">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-violet-500/10 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-block px-3 py-1 mb-4 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              YOUR WORKSPACE
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold mb-2 tracking-tight text-slate-900 dark:text-white">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-violet-500">{name}</span> 👋
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-base max-w-xl leading-relaxed">
              {nudgeData?.nudge || "Ready to crush your goals today? Your AI tutor is primed and your workspace is waiting."}
            </p>
            {weeklyGoal > 0 && (
              <div className="mt-6 flex items-center gap-3 bg-white/50 dark:bg-slate-900/50 w-fit px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex-1 w-32 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-violet-500 rounded-full transition-all duration-1000"
                    style={{ width: `${weeklyProgress}%` }}
                  />
                </div>
                <span className="text-sm text-slate-700 dark:text-slate-300 font-bold">{weeklyProgress}% of weekly goal</span>
              </div>
            )}
          </div>
          <div className="flex gap-4 sm:gap-6 flex-shrink-0">
            <div className="bg-white/60 dark:bg-slate-900/60 p-5 rounded-2xl border border-white/20 dark:border-slate-800/50 shadow-sm backdrop-blur-md text-center min-w-[120px]">
              <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-primary to-sky-400">
                {studyTime < 1 ? `${Math.round(studyTime * 60)}m` : `${studyTime.toFixed(1)}h`}
              </div>
              <div className="text-[10px] font-bold tracking-widest text-slate-400 mt-1 uppercase">Total Focus</div>
            </div>
            <div className="bg-white/60 dark:bg-slate-900/60 p-5 rounded-2xl border border-white/20 dark:border-slate-800/50 shadow-sm backdrop-blur-md text-center min-w-[120px]">
              <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center gap-1">
                {studyStreak} <Flame className="w-5 h-5 text-orange-400 drop-shadow-sm" />
              </div>
              <div className="text-[10px] font-bold tracking-widest text-slate-400 mt-1 uppercase">Day Streak</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
        <div className="xl:col-span-2 space-y-6 lg:space-y-8">
          {/* Quick Actions */}
          <div id="tour-quick-actions">
            <h2 className="text-lg font-extrabold mb-4 flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Zap className="w-5 h-5 text-primary" /> Quick Actions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickActions.map((a) => (
                <Link key={a.label} href={a.href} className="glass-card p-5 group transition-all duration-300">
                  <div className={cn('w-12 h-12 rounded-2xl mb-4 flex items-center justify-center shadow-inner transition-transform group-hover:scale-110 group-hover:rotate-3 duration-300', a.light, a.text)}>
                    <a.icon className="w-6 h-6" />
                  </div>
                  <div className="text-[15px] font-bold text-slate-800 dark:text-slate-100 mb-1">{a.label}</div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">{a.sub}</div>
                </Link>
              ))}
            </div>
          </div>

          {/* Active session */}
          {activeSession && (
            <div id="tour-active-session" className="glass-card relative overflow-hidden p-6 border-l-4 border-l-primary group">
              <div className="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
              <div className="text-xs font-extrabold tracking-widest text-primary mb-2 uppercase flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Live Session
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-extrabold text-xl text-slate-900 dark:text-white">{activeSession.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(activeSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                    {new Date(activeSession.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {activeSession.location && <span className="opacity-50">|</span>}
                    {activeSession.location && ` ${activeSession.location}`}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button className="btn-secondary text-sm">Skip</button>
                  <Link
                    href={`/planner`}
                    className="btn-primary text-sm min-w-[140px]"
                  >
                    <Play className="w-4 h-4" /> Resume Session
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Recommended resources */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500" /> Recommended For You
              </h2>
              <Link href="/library" className="text-sm font-bold text-primary hover:text-primary-600 transition-colors flex items-center gap-1">
                View Library <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {resources.slice(0, 6).map((r: any) => (
                <Link key={r.id} href={`/library/${r.id}`} className="glass-card p-4 flex items-center gap-4 group">
                  <div className="w-14 h-14 bg-gradient-to-br from-slate-100 to-white dark:from-slate-800 dark:to-slate-900 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner border border-slate-200/50 dark:border-slate-700/50 group-hover:scale-105 transition-transform duration-300">
                    <BookIcon type={r.resource_type} />
                  </div>
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-violet-500 bg-violet-50 dark:bg-violet-500/10 px-2 py-0.5 rounded-md">
                        {r.resource_type}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-800 dark:text-white truncate">{r.title}</div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 truncate">{r.subject}</div>
                  </div>
                </Link>
              ))}
              {resources.length === 0 && (
                <div className="col-span-full border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm mb-4">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-slate-800 dark:text-white mb-2">Your library is empty</h3>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
                    Upload your first syllabus, reading material, or lecture video to unlock AI tutoring.
                  </p>
                  <Link href="/library" className="btn-primary">
                    Upload Now
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6 lg:space-y-8">
          <StudyInsights analytics={analyticsData} />
          <AIMastery analytics={analyticsData} />
          <ActivePulse />
        </div>
      </div>
    </div>
  )
}

function BookIcon({ type }: { type: string }) {
  const icons: Record<string, any> = { pdf: <BookOpen className="w-6 h-6 text-red-400" />, video: <Play className="w-6 h-6 text-sky-400" />, code: <Target className="w-6 h-6 text-emerald-400" /> }
  return icons[type] || <BookOpen className="w-6 h-6 text-slate-400" />
}

function ActivePulse() {
  const { data } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.getGroups('my').then(r => r.data),
  })
  const groups: any[] = (data?.results || []).slice(0, 3)
  const COLORS = ['bg-emerald-400 shadow-emerald-400/50', 'bg-sky-400 shadow-sky-400/50', 'bg-orange-400 shadow-orange-400/50', 'bg-violet-400 shadow-violet-400/50']

  return (
    <div className="glass-card p-6 border-t-4 border-t-emerald-400">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-500" /> Study Groups
        </h3>
        <Link href="/groups" className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors uppercase tracking-widest">
          View All
        </Link>
      </div>
      {groups.length === 0 ? (
        <div className="text-center py-6 bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">No active groups yet</p>
          <Link href="/groups" className="text-sm font-bold text-emerald-500 hover:text-emerald-600 transition-colors">
            Create or join a group →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g: any, i: number) => (
            <Link key={g.id} href={`/groups/${g.id}`} className="group relative flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
              <div className={`w-2 h-10 rounded-full shadow-lg ${COLORS[i % COLORS.length]}`} />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-emerald-500 transition-colors">{g.name}</div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">{g.member_count} members</div>
              </div>
              <div className="w-8 h-8 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-300">
                <ArrowRight className="w-4 h-4 text-emerald-500" />
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
        <Link href="/community" className="btn-secondary w-full">Explore Community</Link>
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
    <div className="glass-card p-6 space-y-4 animate-pulse">
      <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
      <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-xl" />
    </div>
  )

  const { daily_study = [], flashcards = {}, resources = {}, goal_progress = 0, goal_hours = 10, week_hours = 0, best_day, sessions_this_week = 0 } = analytics
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
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="tour-analytics" className="glass-card p-6 border-t-4 border-t-violet-500">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-violet-500" /> Study Analytics
        </h3>
        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">Last 7 days</span>
      </div>

      {/* Weekly goal */}
      <div className="bg-slate-50/50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 mb-6">
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Target className="w-4 h-4 text-primary" /> Weekly Goal
          </span>
          {editingGoal ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="168"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveGoal()}
                className="w-16 text-sm font-bold border-2 border-primary/50 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                placeholder={String(goal_hours)}
                autoFocus
              />
              <span className="text-slate-400 font-bold">h</span>
              <button onClick={saveGoal} disabled={saving} className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center hover:bg-emerald-600 transition-colors">
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setGoalInput(String(goal_hours)); setEditingGoal(true) }}
              className="font-bold text-primary flex items-center gap-1.5 hover:text-primary-600 transition-colors bg-primary/10 px-2 py-1 rounded-lg"
            >
              {week_hours}h / {goal_hours}h <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
          <div
            className={cn('h-full rounded-full transition-all duration-1000', goal_progress >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-primary to-sky-400')}
            style={{ width: `${Math.min(100, goal_progress)}%` }}
          />
        </div>
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-3 flex items-center justify-between">
          <span>{goal_progress}% complete</span>
          {goal_progress >= 100 && <span className="text-emerald-500">Goal crushed! 🎉</span>}
        </p>
      </div>

      {/* Daily study bar chart */}
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400 mb-4">Daily study time</p>
        <div className="flex items-end gap-2 h-24">
          {daily_study.map((d: any, i: number) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full relative group flex justify-center h-full items-end">
                <div
                  className={cn('w-full max-w-[24px] rounded-t-md transition-all duration-500', d.minutes > 0 ? 'bg-primary dark:bg-sky-500 group-hover:opacity-80' : 'bg-slate-200 dark:bg-slate-800/80')}
                  style={{ height: `${Math.max(10, (d.minutes / maxMins) * 100)}%` }}
                />
                {d.minutes > 0 && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-bold rounded-lg px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                    {d.minutes}m
                  </div>
                )}
              </div>
              <span className="text-[10px] font-bold text-slate-400">{d.day}</span>
            </div>
          ))}
        </div>
        {best_day && best_day.minutes > 0 && (
          <div className="mt-4 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 text-xs font-bold px-3 py-2 rounded-lg flex items-center justify-center gap-2">
            <Zap className="w-4 h-4" /> Best day: {best_day.day} ({best_day.minutes}m)
          </div>
        )}
      </div>

      {/* Flashcard progress */}
      {flashcards.total > 0 && (
        <div className="bg-slate-50/50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 mb-6">
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-violet-500" /> Mastery Progress
            </span>
            <span className="font-bold text-violet-500 bg-violet-50 dark:bg-violet-500/10 px-2 py-0.5 rounded-lg">{flashcards.reviewed}/{flashcards.total}</span>
          </div>
          <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-1000"
              style={{ width: `${Math.round((flashcards.reviewed / flashcards.total) * 100)}%` }}
            />
          </div>
          {flashcards.due > 0 && (
            <p className="text-xs font-bold text-orange-500 mt-3 flex items-center gap-1.5 bg-orange-50 dark:bg-orange-500/10 w-fit px-2 py-1 rounded-md">
              <TrendingUp className="w-3.5 h-3.5" /> {flashcards.due} cards due for review
            </p>
          )}
        </div>
      )}

      <Link href="/library/flashcards" className="btn-secondary w-full group">
        <span className="group-hover:text-primary transition-colors flex items-center gap-2">
          Review Flashcards <ArrowRight className="w-4 h-4" />
        </span>
      </Link>
    </div>
  )
}

function AIMastery({ analytics }: { analytics?: any }) {
  if (!analytics?.ai_stats) return null
  const stats = analytics.ai_stats

  const items = [
    { label: 'FlowCast Podcasts', value: stats.podcasts, icon: Headphones, color: 'text-pink-500', bg: 'bg-pink-500/10' },
    { label: 'AI Visual Analyses', value: stats.vision, icon: Sparkles, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { label: 'Smart Flashcards', value: stats.mastered_flashcards, icon: Brain, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'AI Conversations', value: stats.chats, icon: Sparkles, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  ]

  return (
    <div className="glass-card p-6 border-t-4 border-t-primary">
       <h3 className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-6">
          <Sparkles className="w-5 h-5 text-primary" /> AI Mastery
       </h3>
       
       <div className="grid grid-cols-2 gap-4">
          {items.map((item, i) => (
            <div key={i} className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
               <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", item.bg, item.color)}>
                  <item.icon className="w-5 h-5" />
               </div>
               <div className="text-xl font-black text-slate-900 dark:text-white">{item.value}</div>
               <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">{item.label}</div>
            </div>
          ))}
       </div>
    </div>
  )
}
