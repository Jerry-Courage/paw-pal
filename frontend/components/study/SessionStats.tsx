'use client'

import { useMemo } from 'react'
import { Zap, Clock, Target, Flame, TrendingUp, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SessionStatsProps {
  totalXP: number
  sectionsCompleted: number
  totalSections: number
  focusMinutes: number
  streak: number
  sessionXP: number
}

export default function SessionStats({
  totalXP,
  sectionsCompleted,
  totalSections,
  focusMinutes,
  streak,
  sessionXP,
}: SessionStatsProps) {
  const progressPercent = totalSections > 0 ? (sectionsCompleted / totalSections) * 100 : 0
  const xpLevel = useMemo(() => {
    if (totalXP >= 15000) return { level: 'Legend', color: 'text-purple-500', bg: 'bg-purple-500/10', next: null, progress: 100 }
    if (totalXP >= 7500) return { level: 'Champion', color: 'text-amber-500', bg: 'bg-amber-500/10', next: 15000, progress: ((totalXP - 7500) / 7500) * 100 }
    if (totalXP >= 3500) return { level: 'Expert', color: 'text-blue-500', bg: 'bg-blue-500/10', next: 7500, progress: ((totalXP - 3500) / 4000) * 100 }
    if (totalXP >= 1500) return { level: 'Ace', color: 'text-emerald-500', bg: 'bg-emerald-500/10', next: 3500, progress: ((totalXP - 1500) / 2000) * 100 }
    if (totalXP >= 500) return { level: 'Scholar', color: 'text-amber-600', bg: 'bg-amber-600/10', next: 1500, progress: ((totalXP - 500) / 1000) * 100 }
    return { level: 'Cadet', color: 'text-on-surface-variant', bg: 'bg-on-surface-variant/10', next: 500, progress: (totalXP / 500) * 100 }
  }, [totalXP])

  const timeDisplay = useMemo(() => {
    if (focusMinutes < 60) return `${focusMinutes}m`
    const h = Math.floor(focusMinutes / 60)
    const m = focusMinutes % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }, [focusMinutes])

  return (
    <div className="bg-surface-container rounded-[1.5rem] border border-outline-variant/20 p-5">
      <h4 className="font-bold text-on-surface text-[14px] mb-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        Session Stats
      </h4>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* XP Earned This Session */}
        <div className="bg-surface-container-high rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Session XP</span>
          </div>
          <div className="text-[20px] font-black text-amber-500">{sessionXP}</div>
        </div>

        {/* Focus Time */}
        <div className="bg-surface-container-high rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3 h-3 text-blue-500" />
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Focus Time</span>
          </div>
          <div className="text-[20px] font-black text-blue-500">{timeDisplay}</div>
        </div>

        {/* Sections Progress */}
        <div className="bg-surface-container-high rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Sections</span>
          </div>
          <div className="text-[20px] font-black text-emerald-500">{sectionsCompleted}/{totalSections}</div>
        </div>

        {/* Streak */}
        <div className="bg-surface-container-high rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame className="w-3 h-3 text-orange-500" />
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Streak</span>
          </div>
          <div className="text-[20px] font-black text-orange-500">{streak}d</div>
        </div>
      </div>

      {/* Sections Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[11px] font-bold text-on-surface-variant">Sections Progress</span>
          <span className="text-[11px] font-bold text-primary">{Math.round(progressPercent)}%</span>
        </div>
        <div className="h-2 bg-surface-container-low rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Rank / Level */}
      <div className={cn("rounded-xl p-3 border border-outline-variant/20", xpLevel.bg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className={cn("w-4 h-4", xpLevel.color)} />
            <div>
              <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Current Rank</p>
              <p className={cn("text-[16px] font-black", xpLevel.color)}>{xpLevel.level}</p>
            </div>
          </div>
          {xpLevel.next && (
            <div className="text-right">
              <p className="text-[10px] text-on-surface-variant">{xpLevel.next - totalXP} XP to next</p>
              <div className="w-20 h-1.5 bg-surface-container-low rounded-full mt-1 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", xpLevel.color.replace('text-', 'bg-'))}
                  style={{ width: `${xpLevel.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
