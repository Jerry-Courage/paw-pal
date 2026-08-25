'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BookOpen, Calculator, Atom, Globe, ArrowRight, Headphones } from 'lucide-react'

const CORE_SUBJECTS = [
  { name: 'Core Mathematics', code: 'MATH-C', icon: Calculator, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', desc: 'Algebra, Geometry, Statistics, Vectors' },
  { name: 'English Language', code: 'ENG-C', icon: BookOpen, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', desc: 'Literature, Grammar, Essay Writing, Comprehension' },
  { name: 'Integrated Science', code: 'SCI-C', icon: Atom, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', desc: 'Biology, Chemistry, Physics, Agricultural Science' },
  { name: 'Social Studies', code: 'SOC-C', icon: Globe, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20', desc: 'Environment, Governance, National Unity, Culture' },
]

export default function SecondaryDashboard({ profileData }: { profileData: any }) {
  const name = profileData?.first_name || profileData?.username || 'Student'
  const streak = profileData?.study_streak || 0
  const xp = profileData?.xp || 0

  return (
    <div className="space-y-8 pb-12">
      {/* ── Welcome Banner ── */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 p-6 sm:p-8 text-white shadow-2xl">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/20 backdrop-blur-md text-[11px] font-black uppercase tracking-wider text-amber-300">
              <span>GHANA SHS CURRICULUM</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Akwaaba, {name}!</h1>
            <p className="text-white/80 text-sm max-w-xl font-medium">
              Aligned with the National Council for Curriculum and Assessment (NaCCA) & WASSCE standards.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-black/25 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
              <p className="text-[10px] uppercase font-black text-amber-300 tracking-wider">Streak</p>
              <p className="text-xl font-black">{streak} Days</p>
            </div>
            <div className="bg-black/25 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
              <p className="text-[10px] uppercase font-black text-amber-300 tracking-wider">Study XP</p>
              <p className="text-xl font-black">{xp.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Personal Tutor CTA ── */}
      <Link href="/dashboard/personalised"
        className="flex items-center gap-4 rounded-2xl bg-surface-container border border-outline-variant/30 p-4 sm:p-5 hover:border-primary/50 hover:bg-surface-container-high transition-all group shadow-sm">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
          <Headphones className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm sm:text-base font-black text-on-surface tracking-tight">Talk to Your Personal Tutor</h3>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
          </div>
          <p className="text-xs text-on-surface-variant font-medium line-clamp-1">
            Real-time voice conversations · Remembers everything · Adapts to your level
          </p>
        </div>
        <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <ArrowRight className="w-5 h-5 text-primary group-hover:translate-x-0.5 transition-transform" />
        </div>
      </Link>

      {/* ── Core Subjects ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-on-surface">Core Subjects</h2>
          <span className="text-xs text-on-surface-variant font-bold">Mandatory for all Senior High students</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CORE_SUBJECTS.map((sub) => {
            const Icon = sub.icon
            return (
              <div key={sub.code} className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30 flex flex-col justify-between hover:border-primary/40 transition-all shadow-sm">
                <div>
                  <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center mb-4", sub.color)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{sub.code}</span>
                  <h3 className="text-base font-black text-on-surface mt-0.5">{sub.name}</h3>
                  <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">{sub.desc}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-outline-variant/20 flex items-center justify-between">
                  <Link
                    href={`/library?subject=${encodeURIComponent(sub.name)}`}
                    className="text-xs font-black text-primary hover:underline flex items-center gap-1"
                  >
                    Open Study Kit <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
