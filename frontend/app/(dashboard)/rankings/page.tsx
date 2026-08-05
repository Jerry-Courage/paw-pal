'use client'

import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

// ─── Tier system ─────────────────────────────────────────────────────────────
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

// ─── Tab config ──────────────────────────────────────────────────────────────
const TABS = [
  {
    key:      'earned',
    label:    'Study XP',
    icon:     'school',
    color:    'text-emerald-400',
    activeBg: 'bg-emerald-500/15 border-emerald-500/30',
    pill:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    headline: '📚 Study XP — The Fair Board',
    desc:     'Ranked by XP earned purely through studying: completing flashcards, quizzes, exam prep, and practice sessions. Buying XP packs has zero effect here. This is the real measure of how hard you study.',
    rankKey:  'rank_earned_xp',
    xpKey:    'earned_xp',
    unit:     'XP',
  },
  {
    key:      'total',
    label:    'Total XP',
    icon:     'star',
    color:    'text-yellow-400',
    activeBg: 'bg-yellow-400/15 border-yellow-400/30',
    pill:     'bg-yellow-400/15 text-yellow-400 border-yellow-400/30',
    headline: '⭐ Total XP — All-Time Board',
    desc:     'Ranked by total XP including any XP packs purchased from the Marketplace. This shows your overall investment in the platform — study effort + supporter status combined.',
    rankKey:  'rank_total_xp',
    xpKey:    'total_xp',
    unit:     'XP',
  },
  {
    key:      'streak',
    label:    'Streaks',
    icon:     'local_fire_department',
    color:    'text-orange-400',
    activeBg: 'bg-orange-500/15 border-orange-500/30',
    pill:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
    headline: '🔥 Streaks — Consistency Board',
    desc:     "Ranked by your current consecutive study-day streak. Miss a day and it resets. No shortcuts — you can't buy a streak. This is pure discipline.",
    rankKey:  'rank_streak',
    xpKey:    'streak',
    unit:     'days',
  },
]

// ─── Rank medal colours ───────────────────────────────────────────────────────
const RANK_META = {
  1: { bg: 'bg-yellow-400/15',  text: 'text-yellow-300', medal: '🥇' },
  2: { bg: 'bg-slate-400/15',   text: 'text-slate-300',  medal: '🥈' },
  3: { bg: 'bg-amber-600/15',   text: 'text-amber-400',  medal: '🥉' },
}

// ─── Row component ────────────────────────────────────────────────────────────
function RankRow({ entry, tab, index }) {
  const meta   = RANK_META[entry[tab.rankKey]]
  const tier   = getTier(entry.earned_xp ?? 0)
  const isTop3 = entry[tab.rankKey] <= 3
  const value  = entry[tab.xpKey] ?? 0

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-[1.25rem] border transition-all duration-200',
        entry.is_me
          ? 'bg-primary/10 border-primary/40 shadow-lg shadow-primary/10'
          : isTop3
            ? (meta?.bg ?? '') + ' border-transparent shadow-md'
            : 'bg-surface-container border-outline-variant/10 hover:bg-surface-container-high'
      )}
      style={{ animationDelay: index * 25 + 'ms', animationFillMode: 'both' }}
    >
      {/* Rank */}
      <div className={cn(
        'w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black shrink-0',
        entry.is_me ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
      )}>
        {isTop3 ? meta?.medal : entry[tab.rankKey]}
      </div>

      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
        style={{ background: tier.color + '28', color: tier.color }}
      >
        {entry.initials}
      </div>

      {/* Name + tier */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('text-[14px] font-bold truncate max-w-[120px]', entry.is_me ? 'text-primary' : 'text-on-surface')}>
            {entry.name}
          </span>
          {entry.is_me && (
            <span className="text-[10px] font-bold bg-primary/15 text-primary border border-primary/30 px-1.5 py-0.5 rounded-full">
              you
            </span>
          )}
          {entry.bonus_xp > 0 && tab.key === 'total' && (
            <span className="text-[10px] text-on-surface-variant border border-outline-variant/30 bg-surface-container px-1.5 py-0.5 rounded-full">
              +{entry.bonus_xp} bought
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', tier.bg, tier.border)} style={{ color: tier.color }}>
            {tier.badge} {tier.name}
          </span>
          {tab.key !== 'streak' && entry.streak > 0 && (
            <span className="text-[10px] text-orange-400">🔥 {entry.streak}d</span>
          )}
        </div>
      </div>

      {/* Value */}
      <div className="text-right shrink-0">
        <p className={cn(
          'text-[14px] font-black',
          entry.is_me ? 'text-primary' : isTop3 ? meta?.text ?? 'text-on-surface' : 'text-on-surface'
        )}>
          {value.toLocaleString()}
        </p>
        <p className="text-[10px] text-on-surface-variant">{tab.unit}</p>
      </div>
    </div>
  )
}

// ─── Podium ───────────────────────────────────────────────────────────────────
function Podium({ top3, tab }) {
  if (top3.length < 2) return null
  const order   = [top3[1], top3[0], top3[2]].filter(Boolean)
  const heights = ['h-20', 'h-28', 'h-14']
  const labels  = ['2nd', '1st', '3rd']
  const colors  = [
    'bg-slate-400/20 border-slate-400/30',
    'bg-yellow-400/20 border-yellow-400/40',
    'bg-amber-600/20 border-amber-600/30',
  ]
  const textC   = ['text-slate-300', 'text-yellow-300', 'text-amber-400']

  return (
    <div className="flex items-end justify-center gap-3 mt-2 mb-5 px-2">
      {order.map((entry, i) => (
        <div key={entry.user_id} className="flex flex-col items-center gap-1.5 flex-1 max-w-[110px]">
          <div className="relative">
            <div className={cn('w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-black border-2', colors[i])}>
              {entry.initials}
            </div>
            {labels[i] === '1st' && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[18px]">👑</span>}
          </div>
          <p className={cn('text-[11px] font-bold truncate w-full text-center', textC[i])}>
            {entry.name.split(' ')[0]}
          </p>
          <p className="text-[10px] text-on-surface-variant font-semibold">
            {(entry[tab.xpKey] ?? 0).toLocaleString()} {tab.unit}
          </p>
          <div className={cn('w-full rounded-t-[0.75rem] border flex items-center justify-center', heights[i], colors[i])}>
            <span className={cn('text-[13px] font-black', textC[i])}>{labels[i]}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RankingsPage() {
  useSession()
  const [activeTab, setActiveTab] = useState('earned')

  const { data, isLoading } = useQuery({
    queryKey: ['rankings'],
    queryFn:  () => authApi.getRankings().then(r => r.data),
    staleTime: 60000,
    refetchOnWindowFocus: false,
  })

  const tab = TABS.find(t => t.key === activeTab)!

  const board    = data?.[activeTab]?.board ?? []
  const myRank   = data?.[activeTab]?.my_rank ?? null
  const myXp     = activeTab === 'streak' ? data?.streak?.my_streak ?? 0 : data?.[activeTab]?.my_xp ?? 0

  const myEarnedXp = data?.earned?.my_xp ?? 0
  const myTier     = getTier(myEarnedXp)
  const myProgress = getTierProgress(myEarnedXp)
  const nextTierIdx = TIERS.indexOf(myTier) + 1
  const nextTier    = TIERS[nextTierIdx]

  const top3   = board.filter(e => e[tab.rankKey] <= 3)
  const rest   = board.filter(e => e[tab.rankKey] > 3)
  const meRow  = rest.find(e => e.is_me)
  const others = rest.filter(e => !e.is_me)

  return (
    <div className="max-w-xl mx-auto px-4 pt-20 pb-36 md:pt-8 md:pb-12">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="text-center mb-5">
        <div className="inline-flex items-center gap-2 bg-primary-container/30 border border-primary/20 text-primary font-bold text-[13px] px-4 py-1.5 rounded-full mb-2">
          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>leaderboard</span>
          Global Rankings
        </div>
        <h1 className="text-[26px] font-black text-on-surface leading-tight">Who's on Top?</h1>
        {data && (
          <p className="text-[13px] text-on-surface-variant mt-0.5">
            {data.total_users?.toLocaleString()} scholars competing
          </p>
        )}
      </div>

      {/* ── My rank card ────────────────────────────────────────── */}
      {!isLoading && data && (
        <div className={cn('rounded-[2rem] border p-5 mb-5', myTier.bg, myTier.border)}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-[22px] font-black shrink-0"
              style={{ background: myTier.color + '22', color: myTier.color }}>
              {myTier.badge}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-[18px] font-black" style={{ color: myTier.color }}>{myTier.name}</span>
                {myRank && (
                  <span className="text-[11px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                    #{myRank} on {tab.label}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-on-surface-variant">{myEarnedXp.toLocaleString()} XP from studying</p>
              {nextTier && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-on-surface-variant mb-1">
                    <span>{myTier.name}</span>
                    <span>{nextTier.name} at {nextTier.min.toLocaleString()} XP</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-container overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: myProgress + '%', background: myTier.color }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tier legend ─────────────────────────────────────────── */}
      <div className="mb-5">
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">Tiers (based on Study XP)</p>
        <div className="grid grid-cols-3 gap-2">
          {TIERS.map(t => (
            <div key={t.name}
              className={cn('rounded-[1rem] border px-3 py-2 text-center transition-all', t.bg, t.border, myTier.name === t.name ? 'ring-2' : '')}
              style={myTier.name === t.name ? { outline: `2px solid ${t.color}`, outlineOffset: '2px' } : {}}>
              <div className="text-[18px]">{t.badge}</div>
              <div className="text-[11px] font-bold" style={{ color: t.color }}>{t.name}</div>
              <div className="text-[10px] text-on-surface-variant">
                {t.min >= 1000 ? t.min / 1000 + 'k' : t.min}
                {t.max === Infinity ? '+' : '–' + (t.max >= 1000 ? t.max / 1000 + 'k' : t.max)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab switcher ─────────────────────────────────────────── */}
      <div className="bg-surface-container-low rounded-[1.5rem] p-1.5 flex gap-1 mb-4 border border-outline-variant/15">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-[1.1rem] text-[12px] font-bold transition-all duration-200 border',
              activeTab === t.key
                ? t.activeBg + ' ' + t.color + ' shadow-sm'
                : 'border-transparent text-on-surface-variant hover:bg-surface-container-high'
            )}
          >
            <span className="material-symbols-outlined text-[15px]"
              style={{ fontVariationSettings: activeTab === t.key ? "'FILL' 1" : "'FILL' 0" }}>
              {t.icon}
            </span>
            <span className="hidden xs:inline sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Board explanation banner ─────────────────────────────── */}
      <div className={cn('rounded-[1.5rem] border p-4 mb-5 flex gap-3', tab.activeBg)}>
        <span className={cn('material-symbols-outlined text-[22px] shrink-0 mt-0.5', tab.color)}
          style={{ fontVariationSettings: "'FILL' 1" }}>
          info
        </span>
        <div>
          <p className={cn('text-[13px] font-black mb-0.5', tab.color)}>{tab.headline}</p>
          <p className="text-[12px] text-on-surface-variant leading-relaxed">{tab.desc}</p>
        </div>
      </div>

      {/* ── Leaderboard ──────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-[1.25rem] bg-surface-container-low animate-pulse" />)}
        </div>
      )}

      {!isLoading && data && (
        <>
          {top3.length >= 2 && <Podium top3={top3} tab={tab} />}

          <div className="space-y-2 mb-2">
            {top3.map((entry, i) => <RankRow key={entry.user_id} entry={entry} tab={tab} index={i} />)}
          </div>

          {others.length > 0 && (
            <div className="flex items-center gap-3 my-3 px-2">
              <div className="flex-1 h-px bg-outline-variant/20" />
              <span className="text-[11px] text-on-surface-variant">{others.length} more scholars</span>
              <div className="flex-1 h-px bg-outline-variant/20" />
            </div>
          )}

          <div className="space-y-2">
            {others.map((entry, i) => <RankRow key={entry.user_id} entry={entry} tab={tab} index={top3.length + i} />)}
          </div>

          {meRow && (
            <div className="sticky bottom-[5.5rem] md:bottom-4 mt-4">
              <div className="bg-surface-container-low/80 backdrop-blur-sm rounded-[1.5rem] p-1 border border-primary/20 shadow-xl">
                <RankRow entry={meRow} tab={tab} index={0} />
              </div>
            </div>
          )}

          {board.length === 0 && (
            <div className="text-center py-12">
              <span className="text-4xl block mb-3">🏆</span>
              <p className="text-on-surface-variant text-[14px]">No rankings yet. Start studying to earn XP!</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
