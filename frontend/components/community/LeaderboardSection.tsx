'use client'

import { useQuery } from '@tanstack/react-query'
import { communityApi } from '@/lib/api'
import { 
  Trophy, Flame, Clock, Zap, Crown, 
  TrendingUp, Star 
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

export default function LeaderboardSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => communityApi.getLeaderboard().then(r => r.data),
    refetchInterval: 60000,
  })

  const leaderboard: any[] = data?.leaderboard || []
  const myRank = data?.my_rank

  const rankInfo = (rank: number) => {
    if (rank === 1) return { icon: <Crown className="w-6 h-6 text-amber-400" />, color: 'from-amber-400 to-yellow-600', badge: '🥇' }
    if (rank === 2) return { icon: <Trophy className="w-6 h-6 text-slate-400" />, color: 'from-slate-300 to-slate-500', badge: '🥈' }
    if (rank === 3) return { icon: <Trophy className="w-6 h-6 text-orange-400" />, color: 'from-orange-300 to-orange-500', badge: '🥉' }
    return { icon: <span className="text-sm font-black text-slate-400">#{rank}</span>, color: 'from-primary/20 to-primary/40', badge: null }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Hall of <span className="sparkle-text">Fame</span></h2>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Global Ranking • Updated Hourly</p>
      </div>

      {/* Podium for Top 3 */}
      {leaderboard.length >= 3 && (
        <div className="grid grid-cols-3 items-end gap-2 sm:gap-4 pt-10 pb-4">
          {/* Rank 2 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center"
          >
            <div className="relative mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center border-4 border-slate-200 dark:border-slate-700 shadow-xl">
                <span className="text-xl sm:text-2xl font-black text-slate-400">{getInitials(leaderboard[1].full_name)}</span>
              </div>
              <div className="absolute -top-3 -right-3 w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-sm shadow-lg border-2 border-white dark:border-black">🥈</div>
            </div>
            <div className="text-center mb-2">
              <div className="text-xs font-black text-slate-900 dark:text-white truncate max-w-[80px] sm:max-w-none">{leaderboard[1].full_name}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">{leaderboard[1].total_study_hours}h studied</div>
            </div>
            <div className="w-full h-24 sm:h-32 bg-gradient-to-t from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-t-2xl shadow-inner" />
          </motion.div>

          {/* Rank 1 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center z-10 scale-110 sm:scale-125"
          >
            <div className="relative mb-6">
              <motion.div 
                animate={{ rotate: [0, -5, 5, 0] }}
                transition={{ repeat: Infinity, duration: 4 }}
                className="absolute -top-10 left-1/2 -translate-x-1/2"
              >
                <Crown className="w-10 h-10 text-amber-400 filter drop-shadow-lg" />
              </motion.div>
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-3xl flex items-center justify-center border-4 border-amber-200 dark:border-amber-700 shadow-2xl">
                <span className="text-2xl sm:text-3xl font-black text-white">{getInitials(leaderboard[0].full_name)}</span>
              </div>
              <div className="absolute -top-2 -right-2 w-10 h-10 bg-amber-400 rounded-full flex items-center justify-center text-lg shadow-xl border-4 border-white dark:border-black">🥇</div>
            </div>
            <div className="text-center mb-4">
              <div className="text-xs font-black text-slate-900 dark:text-white truncate max-w-[80px] sm:max-w-none">{leaderboard[0].full_name}</div>
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">{leaderboard[0].total_study_hours}h studied</div>
            </div>
            <div className="w-full h-32 sm:h-44 bg-gradient-to-t from-amber-500/20 to-amber-500/5 dark:from-amber-900/40 dark:to-amber-950/20 rounded-t-[2rem] border-x border-t border-amber-500/20 flex items-center justify-center">
              <Star className="w-8 h-8 text-amber-400/30 animate-pulse" />
            </div>
          </motion.div>

          {/* Rank 3 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center"
          >
            <div className="relative mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-orange-50 dark:bg-orange-950/30 rounded-2xl flex items-center justify-center border-4 border-orange-100 dark:border-orange-900 shadow-xl">
                <span className="text-xl sm:text-2xl font-black text-orange-600 dark:text-orange-400">{getInitials(leaderboard[2].full_name)}</span>
              </div>
              <div className="absolute -top-3 -right-3 w-8 h-8 bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center text-sm shadow-lg border-2 border-white dark:border-black">🥉</div>
            </div>
            <div className="text-center mb-2">
              <div className="text-xs font-black text-slate-900 dark:text-white truncate max-w-[80px] sm:max-w-none">{leaderboard[2].full_name}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">{leaderboard[2].total_study_hours}h studied</div>
            </div>
            <div className="w-full h-20 sm:h-28 bg-gradient-to-t from-orange-100 to-orange-50 dark:from-orange-950 dark:to-black rounded-t-2xl shadow-inner border-x border-t border-orange-200/20" />
          </motion.div>
        </div>
      )}

      {/* Your Rank Card */}
      {myRank && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-6 bg-gradient-to-r from-primary/10 to-violet-500/10 border-primary/20 dark:border-primary/30 relative overflow-hidden group hover:scale-[1.02] transition-all duration-500"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Zap className="w-20 h-20 text-primary" />
          </div>
          <div className="flex items-center gap-6 relative z-10">
            <div className="w-16 h-16 bg-primary text-white rounded-2xl flex flex-col items-center justify-center shadow-xl shadow-primary/30">
              <span className="text-[10px] font-black uppercase tracking-tighter opacity-80 leading-none mb-1">Rank</span>
              <span className="text-2xl font-black leading-none">#{myRank.rank || '?'}</span>
            </div>
            <div className="flex-1">
              <div className="text-lg font-black text-slate-900 dark:text-white">Fantastic work, {myRank.full_name?.split(' ')[0]}!</div>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-orange-500 bg-orange-50 dark:bg-orange-950/30 px-3 py-1.5 rounded-xl">
                  <Flame className="w-4 h-4 fill-current" />
                  {myRank.study_streak} Day Streak
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/5 dark:bg-primary/20 px-3 py-1.5 rounded-xl">
                  <Clock className="w-4 h-4" />
                  {myRank.total_study_hours}h Focus
                </div>
              </div>
            </div>
            <div className="hidden sm:block">
               <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right mb-1">Next Milestone</div>
               <div className="w-32 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="w-[70%] h-full bg-primary" />
               </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Full Leaderboard List */}
      <div className="glass-card overflow-hidden border-slate-200/60 dark:border-white/5">
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-white/10 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">All Time Leaders</span>
          <TrendingUp className="w-4 h-4 text-slate-400" />
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {isLoading ? (
            [1,2,3,4,5].map(i => <div key={i} className="p-6 animate-pulse bg-slate-50/50 dark:bg-slate-900/20" />)
          ) : (
            leaderboard.map((user: any, i: number) => {
              const info = rankInfo(user.rank)
              return (
                <motion.div 
                  key={user.username}
                  whileHover={{ backgroundColor: 'rgba(var(--primary-rgb), 0.02)' }}
                  className={cn(
                    'flex items-center gap-4 px-6 py-5 transition-colors',
                    user.is_me && 'bg-primary/5 dark:bg-primary/10'
                  )}
                >
                  <div className="w-8 flex items-center justify-center flex-shrink-0">
                    {info.icon}
                  </div>
                  <div className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-lg flex-shrink-0',
                    i === 0 ? 'bg-gradient-to-br from-amber-400 to-yellow-600' :
                    i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-500' :
                    i === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' : 
                    'bg-slate-500'
                  )}>
                    {getInitials(user.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                       <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {user.full_name}
                      </span>
                      {user.is_me && <span className="text-[9px] bg-primary text-white px-1.5 py-0.5 rounded-full font-black uppercase">You</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-orange-500">
                        <Flame className="w-3 h-3 fill-current" /> {user.study_streak}d
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-primary">
                        <Clock className="w-3 h-3" /> {user.total_study_hours}h
                      </div>
                    </div>
                  </div>
                  {info.badge && (
                    <div className="text-xl">
                      {info.badge}
                    </div>
                  )}
                </motion.div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
