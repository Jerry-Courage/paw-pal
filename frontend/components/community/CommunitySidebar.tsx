'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi, communityApi } from '@/lib/api'
import { Users, Plus, Trophy, Hash, ChevronRight, Zap } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function CommunitySidebar({ posts }: { posts: any[] }) {
  return (
    <div className="space-y-4">
      <QuickStats />
      <TrendingTopics posts={posts} />
      <SuggestedGroups />
    </div>
  )
}

function TrendingTopics({ posts }: { posts: any[] }) {
  const allTags = posts.flatMap((p: any) => p.tags || [])
  const counts: Record<string, number> = {}
  allTags.forEach(t => { counts[t] = (counts[t] || 0) + 1 })
  const trending = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const staticTopics = ['FinalWeek', 'AIStudyBuddy', 'FlowState', 'StudyWithMe']
  const items = trending.length > 0
    ? trending.map(([tag, count]) => ({ tag, sub: `${count} insights shared` }))
    : staticTopics.map(t => ({ tag: t, sub: 'Community Favorite' }))

  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-5">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
        <Hash className="w-3.5 h-3.5 text-orange-400" /> Trending Now
      </h3>
      <div className="space-y-3">
        {items.map(({ tag, sub }) => (
          <div key={tag} className="flex items-center justify-between group cursor-pointer">
            <div>
              <span className="text-sm font-black text-white group-hover:text-orange-400 transition-colors block">#{tag}</span>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">{sub}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all" />
          </div>
        ))}
      </div>
    </div>
  )
}

function SuggestedGroups() {
  const { data } = useQuery({
    queryKey: ['public-groups'],
    queryFn: () => groupsApi.getGroups('all').then(r => r.data),
  })
  const groups: any[] = (data?.results || []).filter((g: any) => !g.is_member).slice(0, 3)
  const qc = useQueryClient()
  const joinMutation = useMutation({
    mutationFn: (id: number) => groupsApi.joinGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-groups'] }),
  })

  if (groups.length === 0) return null

  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-5">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-orange-400" /> Squad Suggestions
      </h3>
      <div className="space-y-3">
        {groups.map((g: any) => (
          <div key={g.id} className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-slate-400 font-black text-sm shrink-0 group-hover:bg-orange-500/10 group-hover:text-orange-400 transition-all">
              {g.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white truncate">{g.name}</div>
              <div className="text-[10px] text-slate-600 uppercase tracking-tighter">{g.member_count} members</div>
            </div>
            <button onClick={() => joinMutation.mutate(g.id)} className="p-1.5 text-slate-600 hover:text-orange-400 hover:bg-orange-500/10 rounded-xl transition-all">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <Link href="/groups" className="text-[10px] font-black uppercase tracking-widest text-orange-400 mt-4 block text-center py-2.5 bg-orange-500/5 rounded-xl hover:bg-orange-500/10 transition-colors">
        Discover Squads
      </Link>
    </div>
  )
}

function QuickStats() {
  const { data } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => communityApi.getLeaderboard().then(r => r.data),
  })
  const myRank = data?.my_rank
  if (!myRank) return null

  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-[60px] -mr-16 -mt-16 pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Your Standing</h3>
          <Trophy className="w-4 h-4 text-amber-400" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-center">
            <div className="text-2xl font-black text-white">#{myRank.rank || '?'}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mt-1">Nexus Rank</div>
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-center">
            <div className="text-2xl font-black text-amber-400">{myRank.study_streak}d</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mt-1">Active Streak</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 p-3 bg-white/3 rounded-xl">
          <Zap className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
          <div className="text-[10px] font-bold text-slate-400">
            You're in the top <span className="text-white">15%</span> of learners this week.
          </div>
        </div>
      </div>
    </div>
  )
}
