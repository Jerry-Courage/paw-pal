'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Sparkles, BookOpen, Calculator, Atom, Globe, Award, ExternalLink, ArrowRight, Play, CheckCircle2 } from 'lucide-react'

const CORE_SUBJECTS = [
  { name: 'Core Mathematics', code: 'MATH-C', icon: Calculator, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', desc: 'Algebra, Geometry, Statistics, Vectors' },
  { name: 'English Language', code: 'ENG-C', icon: BookOpen, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', desc: 'Literature, Grammar, Essay Writing, Comprehension' },
  { name: 'Integrated Science', code: 'SCI-C', icon: Atom, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', desc: 'Biology, Chemistry, Physics, Agricultural Science' },
  { name: 'Social Studies', code: 'SOC-C', icon: Globe, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20', desc: 'Environment, Governance, National Unity, Culture' },
]

const ELECTIVE_PROGRAMS = [
  { name: 'Science Programme', subjects: ['Physics', 'Chemistry', 'Biology', 'Elective Mathematics'], icon: 'science' },
  { name: 'Business Programme', subjects: ['Financial Accounting', 'Business Management', 'Cost Accounting', 'Economics'], icon: 'payments' },
  { name: 'General Arts', subjects: ['History', 'Geography', 'Government', 'Literature-in-English'], icon: 'history_edu' },
  { name: 'Agricultural Science', subjects: ['General Agriculture', 'Crop Husbandry', 'Animal Husbandry', 'Agric Economics'], icon: 'agriculture' },
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
              <span>🇬🇭 Ghana SHS Curriculum Hub</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Akwaaba, {name}! 👋</h1>
            <p className="text-white/80 text-sm max-w-xl font-medium">
              Aligned with the National Council for Curriculum and Assessment (NaCCA) & WASSCE standards.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-black/25 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
              <p className="text-[10px] uppercase font-black text-amber-300 tracking-wider">Streak</p>
              <p className="text-xl font-black">🔥 {streak} Days</p>
            </div>
            <div className="bg-black/25 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
              <p className="text-[10px] uppercase font-black text-amber-300 tracking-wider">Study XP</p>
              <p className="text-xl font-black">⚡ {xp.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Official Curriculum Banner Link ── */}
      <a
        href="https://curriculumresources.edu.gh"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between p-5 rounded-2xl bg-surface-container border border-outline-variant/30 hover:border-primary/50 transition-all group shadow-sm"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">Official NaCCA Curriculum Resources</h3>
            <p className="text-xs text-on-surface-variant">Access official Ghana Education Service syllabi and syllabus documents at curriculumresources.edu.gh</p>
          </div>
        </div>
        <ExternalLink className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors shrink-0 ml-4" />
      </a>

      {/* ── Core Subjects ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-on-surface">Core Subjects (SHS)</h2>
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

      {/* ── Elective Programmes ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-black text-on-surface">Elective Programmes &amp; Pathways</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ELECTIVE_PROGRAMS.map((prog) => (
            <div key={prog.name} className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">{prog.icon}</span>
                </div>
                <h3 className="text-base font-black text-on-surface">{prog.name}</h3>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {prog.subjects.map((s) => (
                  <span key={s} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-surface-container-high text-on-surface-variant border border-outline-variant/20">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
