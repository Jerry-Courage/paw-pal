'use client'

import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'

const TIERS = [
  { name: 'Cadet',    min: 0,     max: 499,     color: '#9ca3af', bg: 'bg-gray-500/10',    border: 'border-gray-500/30',    badge: '🎓' },
  { name: 'Scholar',  min: 500,   max: 1499,    color: '#60a5fa', bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    badge: '📚' },
  { name: 'Ace',      min: 1500,  max: 3499,    color: '#34d399', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', badge: '⭐' },
  { name: 'Expert',   min: 3500,  max: 7499,    color: '#f59e0b', bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   badge: '🔥' },
  { name: 'Champion', min: 7500,  max: 14999,   color: '#e879f9', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/30', badge: '🏆' },
  { name: 'Legend',   min: 15000, max: Infinity, color: '#fbbf24', bg: 'bg-yellow-400/10',  border: 'border-yellow-400/40',  badge: '👑' },
]

function getTier(xp) {
  return TIERS.find(t => xp >= t.min && xp <= t.max) || TIERS[0]
}

function getTierProgress(xp) {
  const tier = getTier(xp)
  if (tier.max === Infinity) return 100
  return Math.min(100, Math.round(((xp - tier.min) / (tier.max - tier.min)) * 100))
}

const RANK_META = {
  1: { bg: 'bg-yellow-400/15',  text: 'text-yellow-300', medal: '🥇' },
  2: { bg: 'bg-slate-400/15',   text: 'text-slate-300',  medal: '🥈' },
  3: { bg: 'bg-amber-600/15',   text: 'text-amber-400',  medal: '🥉' },
}

function RankRow({ entry, index }) {
  const meta   = RANK_META[entry.rank]
  const tier   = getTier(entry.total_xp)
  const isTop3 = entry.rank <= 3

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-[1.25rem] border transition-all duration-200',
        entry.is_me
          ? 'bg-primary/10 border-primary/40 shadow-lg shadow-primary/10'
          : isTop3
            ? (meta?.bg + ' border-transparent shadow-md')
            : 'bg-surface-container border-outline-variant/10 hover:bg-surface-container-high'
      )}
      style={{ animationDelay: index * 30 + 'ms', animationFillMode: 'both' }}
    >
      <div className={cn(
        'w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black shrink-0',
        entry.is_me ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
      )}>
        {isTop3 ? meta?.medal : entry.rank}
      </div>
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
        style={{ background: tier.color + '30', color: tier.color }}
      >
        {entry.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-[14px] font-bold truncate', entry.is_me ? 'text-primary' : 'text-on-surface')}>
            {entry.name}{entry.is_me && <span className="ml-1 text-[11px] font-normal opacity-60"> (you)</span>}
          </span>
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0', tier.bg, tier.border)} style={{ color: tier.color }}>
            {tier.badge} {tier.name}
          </span>
        </div>
        {entry.streak > 0 && <span className="text-[11px] text-on-surface-variant">🔥 {entry.streak}-day streak</span>}
      </div>
      <div className="text-right shrink-0">
        <p className={cn('text-[14px] font-black', entry.is_me ? 'text-primary' : isTop3 ? meta?.text : 'text-on-surface')}>
          {entry.total_xp.toLocaleString()}
        </p>
        <p className="text-[10px] text-on-surface-variant">XP</p>
      </div>
    </div>
  )
}

function Podium({ top3 }) {
  const order   = [top3[1], top3[0], top3[2]].filter(Boolean)
  const heights = ['h-20', 'h-28', 'h-14']
  const labels  = ['2nd', '1st', '3rd']
  const colors  = [
    'bg-slate-400/20 border-slate-400/30',
    'bg-yellow-400/20 border-yellow-400/40',
    'bg-amber-600/20 border-amber-600/30',
  ]
  const textC = ['text-slate-300', 'text-yellow-300', 'text-amber-400']

  return (
    <div className="flex items-end justify-center gap-3 mt-4 mb-6 px-4">
      {order.map((entry, i) => (
        <div key={entry.user_id} className="flex flex-col items-center gap-2 flex-1 max-w-[110px]">
          <div className="relative">
            <div className={cn('w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-black border-2', colors[i])}>
              {entry.initials}
            </div>
            {labels[i] === '1st' && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[18px]">👑</span>}
          </div>
          <p className={cn('text-[11px] font-bold truncate w-full text-center', textC[i])}>{entry.name.split(' ')[0]}</p>
          <p className="text-[10px] text-on-surface-variant font-semibold">{entry.total_xp.toLocaleString()} XP</p>
          <div className={cn('w-full rounded-t-[0.75rem] border flex items-center justify-center', heights[i], colors[i])}>
            <span className={cn('text-[13px] font-black', textC[i])}>{labels[i]}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function RankingsPage() {
  useSession()
  const { data, isLoading } = useQuery({
    queryKey: ['rankings'],
    queryFn:  () => authApi.getRankings().then(r => r.data),
    staleTime: 60000,
    refetchOnWindowFocus: false,
  })

  const myXp       = data?.my_xp ?? 0
  const myTier     = getTier(myXp)
  const myProgress = getTierProgress(myXp)
  const nextTierIdx = TIERS.indexOf(myTier) + 1
  const nextTier    = TIERS[nextTierIdx]

  const top3  = (data?.leaderboard ?? []).filter(e => e.rank <= 3)
  const rest  = (data?.leaderboard ?? []).filter(e => e.rank > 3)
  const meRow = rest.find(e => e.is_me)
  const others = rest.filter(e => !e.is_me)

  return (
    <div className="max-w-xl mx-auto px-4 pt-20 pb-32 md:pt-8 md:pb-12">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-primary-container/30 border border-primary/20 text-primary font-bold text-[13px] px-4 py-1.5 rounded-full mb-3">
          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>leaderboard</span>
          Global Rankings
        </div>
        <h1 className="text-[28px] font-black text-on-surface leading-tight">Who's on Top?</h1>
        {data && (
          <p className="text-[13px] text-on-surface-variant mt-1">
            {data.total_users?.toLocaleString()} scholars competing
          </p>
        )}
      </div>

      {!isLoading && data && (
        <div className={cn('rounded-[2rem] border p-5 mb-6', myTier.bg, myTier.border)}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-[20px] font-black shrink-0" style={{ background: myTier.color + '25', color: myTier.color }}>
              {myTier.badge}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[18px] font-black" style={{ color: myTier.color }}>{myTier.name}</span>
                {data.my_rank && (
                  <span className="text-[12px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                    #{data.my_rank} of {data.total_users}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-on-surface-variant">{myXp.toLocaleString()} XP earned</p>
              {nextTier && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-on-surface-variant mb-1">
                    <span>{myTier.name}</span>
                    <span>{nextTier.name} at {nextTier.min.toLocaleString()} XP</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-container overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: myProgress + '%', background: myTier.color }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">Tiers</p>
        <div className="grid grid-cols-3 gap-2">
          {TIERS.map(t => (
            <div key={t.name} className={cn('rounded-[1rem] border px-3 py-2 text-center', t.bg, t.border, myTier.name === t.name ? 'ring-2 ring-offset-0' : '')} style={myTier.name === t.name ? { '--tw-ring-color': t.color } as any : {}}>
              <div className="text-[18px]">{t.badge}</div>
              <div className="text-[11px] font-bold" style={{ color: t.color }}>{t.name}</div>
              <div className="text-[10px] text-on-surface-variant">
                {t.min >= 1000 ? t.min / 1000 + 'k' : t.min}{t.max === Infinity ? '+' : '–' + (t.max >= 1000 ? t.max / 1000 + 'k' : t.max)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-3 px-1">Top Scholars</p>
        {isLoading && (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-[1.25rem] bg-surface-container-low animate-pulse" />)}
          </div>
        )}
        {!isLoading && data && (
          <>
            {top3.length === 3 && <Podium top3={top3} />}
            <div className="space-y-2 mb-2">
              {top3.map((entry, i) => <RankRow key={entry.user_id} entry={entry} index={i} />)}
            </div>
            {others.length > 0 && (
              <div className="flex items-center gap-3 my-3 px-2">
                <div className="flex-1 h-px bg-outline-variant/20" />
                <span className="text-[11px] text-on-surface-variant">{others.length} more scholars</span>
                <div className="flex-1 h-px bg-outline-variant/20" />
              </div>
            )}
            <div className="space-y-2">
              {others.map((entry, i) => <RankRow key={entry.user_id} entry={entry} index={top3.length + i} />)}
            </div>
            {meRow && (
              <div className="sticky bottom-[5.5rem] md:bottom-4 mt-4">
                <div className="bg-surface-container-low/80 backdrop-blur-sm rounded-[1.5rem] p-1 border border-primary/20 shadow-xl">
                  <RankRow entry={meRow} index={0} />
                </div>
              </div>
            )}
            {(data.leaderboard?.length ?? 0) === 0 && (
              <div className="text-center py-12">
                <span className="text-4xl block mb-3">🏆</span>
                <p className="text-on-surface-variant text-[14px]">No rankings yet. Start studying to earn XP!</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
