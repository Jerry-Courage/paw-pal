'use client'

import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

// ── Tier system (Study XP only) ───────────────────────────────────────────────
const TIERS = [
  { name: 'Cadet',    min: 0,     max: 499,     color: '#94a3b8' },
  { name: 'Scholar',  min: 500,   max: 1499,    color: '#60a5fa' },
  { name: 'Ace',      min: 1500,  max: 3499,    color: '#34d399' },
  { name: 'Expert',   min: 3500,  max: 7499,    color: '#f59e0b' },
  { name: 'Champion', min: 7500,  max: 14999,   color: '#c084fc' },
  { name: 'Legend',   min: 15000, max: Infinity, color: '#fbbf24' },
]

function getTier(xp: number) {
  return TIERS.find(t => xp >= t.min && xp <= t.max) || TIERS[0]
}
function getTierProgress(xp: number) {
  const t = getTier(xp)
  if (t.max === Infinity) return 100
  return Math.min(100, Math.round(((xp - t.min) / (t.max - t.min)) * 100))
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  {
    key:     'earned',
    label:   'Study XP',
    icon:    'school',
    rankKey: 'rank_earned_xp',
    xpKey:   'earned_xp',
    unit:    'XP',
    accent:  '#34d399',
    desc:    'Ranked by XP earned from studying — flashcards, quizzes, exam prep. Pure grind.',
  },
  {
    key:     'streak',
    label:   'Streaks',
    icon:    'local_fire_department',
    rankKey: 'rank_streak',
    xpKey:   'streak',
    unit:    'days',
    accent:  '#fb923c',
    desc:    "Ranked by current consecutive study-day streak. Miss a day and it resets. No shortcuts.",
  },
]

// ── Medal config ──────────────────────────────────────────────────────────────
const MEDALS = [
  { label: '1st', crown: true,  ring: '#fbbf24', bg: 'bg-yellow-400/10' },
  { label: '2nd', crown: false, ring: '#94a3b8', bg: 'bg-slate-400/10'  },
  { label: '3rd', crown: false, ring: '#d97706', bg: 'bg-amber-600/10'  },
]

// ── Podium ────────────────────────────────────────────────────────────────────
function Podium({ top3, xpKey, unit }: { top3: any[]; xpKey: string; unit: string }) {
  if (!top3 || top3.length < 1) return null
  // order: 2nd  1st  3rd
  const order = [top3[1], top3[0], top3[2]].filter(Boolean)
  const podiumH = ['h-16', 'h-24', 'h-10']

  return (
    <div className="flex items-end justify-center gap-4 mb-6 px-2">
      {order.map((entry, i) => {
        const medal = MEDALS[i]
        const tier  = getTier(entry.earned_xp ?? 0)
        return (
          <div key={entry.user_id} className="flex flex-col items-center gap-1 flex-1 max-w-[100px]">
            {/* Crown */}
            {medal.crown && (
              <span className="text-[20px] mb-0.5">👑</span>
            )}
            {/* Avatar */}
            <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center text-[15px] font-black"
              style={{ borderColor: medal.ring, background: medal.ring + '22', color: medal.ring }}>
              {entry.initials}
            </div>
            {/* Name */}
            <p className="text-[11px] font-bold truncate w-full text-center text-on-surface">
              {entry.name.split(' ')[0]}
            </p>
            {/* Value */}
            <p className="text-[10px] text-on-surface-variant">
              {(entry[xpKey] ?? 0).toLocaleString()} {unit}
            </p>
            {/* Tier dot */}
            <div className="w-2 h-2 rounded-full mb-1" style={{ background: tier.color }} />
            {/* Podium block */}
            <div className={cn('w-full rounded-t-[0.5rem] flex items-center justify-center', podiumH[i])}
              style={{ background: medal.ring + '18', borderTop: `2px solid ${medal.ring}44` }}>
              <span className="text-[11px] font-black" style={{ color: medal.ring }}>{medal.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Rank row ──────────────────────────────────────────────────────────────────
function RankRow({ entry, tab, index }: { entry: any; tab: typeof TABS[0]; index: number }) {
  const rank   = entry[tab.rankKey] ?? index + 1
  const value  = entry[tab.xpKey] ?? 0
  const tier   = getTier(entry.earned_xp ?? 0)
  const isTop3 = rank <= 3
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-[1.25rem] border transition-all',
      entry.is_me
        ? 'bg-primary/8 border-primary/30'
        : isTop3
        ? 'bg-surface-container border-outline-variant/20'
        : 'bg-surface-container border-outline-variant/10 hover:bg-surface-container-high'
    )}>
      {/* Rank number / medal */}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black shrink-0',
        entry.is_me ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
      )}>
        {isTop3 ? medals[rank - 1] : rank}
      </div>

      {/* Avatar circle */}
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black shrink-0"
        style={{ background: tier.color + '22', color: tier.color }}>
        {entry.initials}
      </div>

      {/* Name + tier */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('text-[14px] font-bold truncate', entry.is_me ? 'text-primary' : 'text-on-surface')}>
            {entry.name}
          </span>
          {entry.is_me && (
            <span className="text-[10px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-full shrink-0">you</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tier.color }} />
          <span className="text-[11px] font-medium" style={{ color: tier.color }}>{tier.name}</span>
          {tab.key === 'earned' && entry.streak > 0 && (
            <span className="text-[11px] text-orange-400 ml-1">🔥 {entry.streak}d</span>
          )}
        </div>
      </div>

      {/* Score */}
      <div className="text-right shrink-0">
        <p className={cn('text-[15px] font-black tabular-nums', entry.is_me ? 'text-primary' : 'text-on-surface')}>
          {value.toLocaleString()}
        </p>
        <p className="text-[10px] text-on-surface-variant">{tab.unit}</p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RankingsPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState('earned')

  const { data, isLoading, error } = useQuery({
    queryKey:  ['rankings'],
    queryFn:   () => authApi.getRankings().then(r => r.data),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const tab      = TABS.find(t => t.key === activeTab)!
  const board    = data?.[activeTab]?.board ?? []
  const myRank   = activeTab === 'streak' ? data?.streak?.my_rank : data?.earned?.my_rank
  const myXp     = activeTab === 'streak' ? data?.streak?.my_streak ?? 0 : data?.earned?.my_xp ?? 0
  const myEarnedXp = data?.earned?.my_xp ?? 0
  const myTier   = getTier(myEarnedXp)
  const myProgress = getTierProgress(myEarnedXp)
  const nextTierIdx = TIERS.indexOf(myTier) + 1
  const nextTier = TIERS[nextTierIdx]

  const top3     = board.filter((e: any) => e[tab.rankKey] <= 3)
  const rest     = board.filter((e: any) => e[tab.rankKey] > 3)
  const meRow    = rest.find((e: any) => e.is_me)
  const others   = rest.filter((e: any) => !e.is_me)

  return (
    <div className="max-w-xl mx-auto px-4 pt-20 pb-36 md:pt-8 md:pb-12">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-[28px] font-black text-on-surface">Rankings</h1>
        <p className="text-[14px] text-on-surface-variant mt-0.5">
          {data ? `${data.total_users?.toLocaleString()} scholars competing` : 'Global leaderboard'}
        </p>
      </div>

      {/* ── My rank card ────────────────────────────────────────────── */}
      {!isLoading && data && (
        <div className="rounded-[1.5rem] border border-outline-variant/20 bg-surface-container p-4 mb-5 flex items-center gap-4">
          {/* Tier colour dot + initials */}
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-[18px] font-black shrink-0"
            style={{ background: myTier.color + '22', color: myTier.color }}>
            {(session?.user?.name || session?.user?.email || 'You').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[16px] font-black" style={{ color: myTier.color }}>{myTier.name}</span>
              {myRank && (
                <span className="text-[11px] font-bold bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full">
                  #{myRank} globally
                </span>
              )}
            </div>
            <p className="text-[12px] text-on-surface-variant">{myEarnedXp.toLocaleString()} Study XP earned</p>
            {nextTier ? (
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-on-surface-variant mb-1">
                  <span>{myTier.name}</span>
                  <span>{nextTier.name} — {nextTier.min.toLocaleString()} XP</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface-container-high overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: myProgress + '%', background: myTier.color }} />
                </div>
              </div>
            ) : (
              <p className="text-[11px] font-bold mt-1" style={{ color: myTier.color }}>Max tier reached 👑</p>
            )}
          </div>
        </div>
      )}

      {/* ── Tab switcher ────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[1rem] text-[13px] font-bold border transition-all',
              activeTab === t.key
                ? 'bg-surface-container-high border-outline-variant/40 text-on-surface'
                : 'border-transparent text-on-surface-variant hover:bg-surface-container'
            )}
          >
            <span className="material-symbols-outlined text-[16px]"
              style={{
                fontVariationSettings: activeTab === t.key ? "'FILL' 1" : "'FILL' 0",
                color: activeTab === t.key ? t.accent : undefined,
              }}>
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Board description ───────────────────────────────────────── */}
      <p className="text-[12px] text-on-surface-variant mb-4 px-1">{tab.desc}</p>

      {/* ── Loading skeleton ────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-[60px] rounded-[1.25rem] bg-surface-container animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {!isLoading && error && (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 block mb-3">wifi_off</span>
          <p className="text-[14px] text-on-surface-variant">Could not load rankings. Check your connection.</p>
        </div>
      )}

      {/* ── Leaderboard ─────────────────────────────────────────────── */}
      {!isLoading && data && (
        <>
          {/* Podium */}
          {top3.length >= 2 && <Podium top3={top3} xpKey={tab.xpKey} unit={tab.unit} />}

          {/* Top 3 rows */}
          {top3.length > 0 && (
            <div className="space-y-2 mb-3">
              {top3.map((entry: any, i: number) => (
                <RankRow key={entry.user_id} entry={entry} tab={tab} index={i} />
              ))}
            </div>
          )}

          {/* Separator */}
          {others.length > 0 && (
            <div className="flex items-center gap-3 my-3 px-1">
              <div className="flex-1 h-px bg-outline-variant/20" />
              <span className="text-[11px] text-on-surface-variant">{others.length} more</span>
              <div className="flex-1 h-px bg-outline-variant/20" />
            </div>
          )}

          {/* Rest of board */}
          <div className="space-y-2">
            {others.map((entry: any, i: number) => (
              <RankRow key={entry.user_id} entry={entry} tab={tab} index={top3.length + i} />
            ))}
          </div>

          {/* Empty state */}
          {board.length === 0 && (
            <div className="text-center py-16">
              <span className="material-symbols-outlined text-[48px] text-on-surface-variant/20 block mb-3"
                style={{ fontVariationSettings: "'FILL' 1" }}>leaderboard</span>
              <p className="text-[15px] font-bold text-on-surface mb-1">No rankings yet</p>
              <p className="text-[13px] text-on-surface-variant">Start studying to earn XP and appear here.</p>
            </div>
          )}

          {/* Sticky my-rank row when I'm outside top entries */}
          {meRow && (
            <div className="sticky bottom-[5.5rem] md:bottom-4 mt-4 z-10">
              <div className="bg-surface-container-low/90 backdrop-blur-md rounded-[1.5rem] p-1 border border-primary/25 shadow-xl shadow-primary/5">
                <RankRow entry={meRow} tab={tab} index={0} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
