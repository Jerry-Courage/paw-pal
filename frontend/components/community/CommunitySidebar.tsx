'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi, communityApi } from '@/lib/api'
import { 
  Users, Plus, Trophy, Flame, Clock, 
  Hash, ChevronRight, Sparkles 
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

export default function CommunitySidebar({ posts }: { posts: any[] }) {
  return (
    <div className="space-y-6 flex flex-col">
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

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-card p-6 border-slate-200/60 dark:border-white/5"
    >
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
        <Hash className="w-4 h-4 text-primary" /> Trending Now
      </h3>
      <div className="space-y-4">
        {trending.length > 0
          ? trending.map(([tag, count]) => (
            <div key={tag} className="flex items-center justify-between group cursor-pointer">
              <div className="flex flex-col">
                <span className="text-sm font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors">#{tag}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{count} insights shared</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          ))
          : staticTopics.map(t => (
            <div key={t} className="flex items-center justify-between group cursor-pointer">
              <div className="flex flex-col">
                <span className="text-sm font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors">#{t}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Community Favorite</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          ))
        }
      </div>
    </motion.div>
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
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-card p-6 border-slate-200/60 dark:border-white/5"
    >
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" /> Squad Suggestions
      </h3>
      <div className="space-y-6">
        {groups.map((g: any) => (
          <div key={g.id} className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-500 font-black flex-shrink-0 group-hover:bg-primary group-hover:text-white transition-all">
              {g.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{g.name}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{g.member_count} members</div>
            </div>
            <button 
              onClick={() => joinMutation.mutate(g.id)} 
              className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <Link href="/groups" className="text-[10px] font-black uppercase tracking-widest text-primary mt-6 block text-center py-3 bg-primary/5 rounded-xl hover:bg-primary/10 transition-colors">
        Discover Squads
      </Link>
    </motion.div>
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
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-card p-6 bg-slate-950 text-white border-0 relative overflow-hidden shadow-2xl shadow-slate-950/20"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-[60px] -mr-16 -mt-16" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Your Standing</h3>
          <Trophy className="w-4 h-4 text-amber-400" />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-white">#{myRank.rank || '?'}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Nexus Rank</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-amber-500">{myRank.study_streak}d</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Active Streak</div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 p-3 bg-white/5 rounded-2xl">
          <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
          <div className="text-[10px] font-bold text-slate-300">
            You're in the top <span className="text-white">15%</span> of learners this week.
          </div>
        </div>
      </div>
    </motion.div>
  )
}
