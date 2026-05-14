'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import {
  Zap, BookOpen, Users, Sparkles, Upload,
  ArrowRight, Check, ChevronRight, GraduationCap, Brain
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

const SUBJECTS = [
  'Computer Science', 'Mathematics', 'Physics', 'Chemistry',
  'Biology', 'Economics', 'Psychology', 'History',
  'Literature', 'Engineering', 'Medicine', 'Law',
]

const GOALS = [
  { id: 'exams', label: 'Ace my exams', icon: '🎯' },
  { id: 'understand', label: 'Understand deeply', icon: '🧠' },
  { id: 'collaborate', label: 'Study with others', icon: '👥' },
  { id: 'organize', label: 'Stay organized', icon: '📋' },
]

const STUDY_HOURS = ['< 2 hours', '2-4 hours', '4-6 hours', '6+ hours']

const STEPS = [
  { id: 'welcome' },
  { id: 'profile' },
  { id: 'subjects' },
  { id: 'goals' },
  { id: 'done' },
]

export default function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [data, setData] = useState({
    university: '',
    weekly_goal_hours: 10,
    study_hours_per_day: '2-4 hours',
    subjects: [] as string[],
    goals: [] as string[],
  })

  const updateProfile = useMutation({
    mutationFn: () => authApi.updateProfile({
      university: data.university,
      weekly_goal_hours: data.weekly_goal_hours,
    }),
  })

  const toggleSubject = (s: string) =>
    setData(d => ({ ...d, subjects: d.subjects.includes(s) ? d.subjects.filter(x => x !== s) : [...d.subjects, s] }))

  const toggleGoal = (g: string) =>
    setData(d => ({ ...d, goals: d.goals.includes(g) ? d.goals.filter(x => x !== g) : [...d.goals, g] }))

  const next = async () => {
    if (step === STEPS.length - 2) {
      await updateProfile.mutateAsync().catch(() => {})
    }
    if (step < STEPS.length - 1) setStep(s => s + 1)
  }

  const prev = () => { if (step > 0) setStep(s => s - 1) }

  const finish = async () => {
    localStorage.setItem('nitemind_onboarded', 'true')
    try { await authApi.updateOnboarding('completed') } catch {}
    onComplete()
    router.push('/dashboard')
  }

  const isLast = step === STEPS.length - 1
  const progress = step / (STEPS.length - 1)

  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-950 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[40vh] bg-primary/20 rounded-full blur-[80px]" />
        <div className="absolute bottom-0 right-0 w-[50vw] h-[30vh] bg-violet-500/10 rounded-full blur-[80px]" />
      </div>

      {/* Progress bar */}
      {step > 0 && !isLast && (
        <div className="relative z-10 px-6 pt-4 pb-2 flex-shrink-0">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={false}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Step {step} of {STEPS.length - 1}</span>
            <button onClick={next} className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Skip</button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto relative z-10 px-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="min-h-full flex flex-col justify-center py-6"
          >

            {/* ── WELCOME ── */}
            {step === 0 && (
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 bg-gradient-to-br from-primary to-violet-500 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-primary/40 mb-8">
                  <Brain className="w-12 h-12 text-white" />
                </div>
                <h1 className="text-3xl font-black text-white mb-3 tracking-tight">
                  Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-violet-400">NITE Mind</span>
                </h1>
                <p className="text-slate-400 text-base leading-relaxed mb-10 max-w-xs">
                  Your AI-powered study companion. Let's set up your space in under a minute.
                </p>
                <div className="grid grid-cols-3 gap-3 w-full mb-10">
                  {[
                    { icon: BookOpen, label: 'Smart Library', color: 'text-primary bg-primary/10' },
                    { icon: Users, label: 'Study Groups', color: 'text-emerald-400 bg-emerald-500/10' },
                    { icon: Sparkles, label: 'AI Tutor', color: 'text-violet-400 bg-violet-500/10' },
                  ].map(f => (
                    <div key={f.label} className="flex flex-col items-center p-4 rounded-2xl bg-white/5 border border-white/10">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-2', f.color)}>
                        <f.icon className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold text-white/60 text-center leading-tight">{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── PROFILE ── */}
            {step === 1 && (
              <div>
                <StepHeader icon={GraduationCap} title="Tell us about you" subtitle="Personalise your experience" />
                <div className="space-y-5">
                  <div>
                    <label className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2 block">University / Institution</label>
                    <input
                      value={data.university}
                      onChange={e => setData(d => ({ ...d, university: e.target.value }))}
                      placeholder="e.g. MIT, Stanford, Oxford..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/20 text-sm font-medium focus:outline-none focus:border-primary/50 focus:bg-white/8 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3 block">Daily study hours</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {STUDY_HOURS.map(h => (
                        <button key={h} onClick={() => setData(d => ({ ...d, study_hours_per_day: h }))}
                          className={cn('py-3 rounded-2xl text-sm font-bold border transition-all',
                            data.study_hours_per_day === h
                              ? 'border-primary bg-primary/20 text-primary'
                              : 'border-white/10 text-white/40 bg-white/5'
                          )}>
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3 block">
                      Weekly goal — <span className="text-primary">{data.weekly_goal_hours}h</span>
                    </label>
                    <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-4">
                      <input type="range" min={2} max={60} step={2}
                        value={data.weekly_goal_hours}
                        onChange={e => setData(d => ({ ...d, weekly_goal_hours: Number(e.target.value) }))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── SUBJECTS ── */}
            {step === 2 && (
              <div>
                <StepHeader icon={BookOpen} title="What do you study?" subtitle="Pick your subjects" />
                <div className="flex flex-wrap gap-2.5 mb-4">
                  {SUBJECTS.map(s => (
                    <button key={s} onClick={() => toggleSubject(s)}
                      className={cn('px-4 py-2.5 rounded-2xl text-sm font-bold border transition-all flex items-center gap-2',
                        data.subjects.includes(s)
                          ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                          : 'border-white/10 text-white/40 bg-white/5'
                      )}>
                      {data.subjects.includes(s) && <Check className="w-3.5 h-3.5" />}
                      {s}
                    </button>
                  ))}
                </div>
                {data.subjects.length > 0 && (
                  <p className="text-xs font-bold text-primary/60 uppercase tracking-widest">{data.subjects.length} selected</p>
                )}
              </div>
            )}

            {/* ── GOALS ── */}
            {step === 3 && (
              <div>
                <StepHeader icon={Sparkles} title="What are your goals?" subtitle="We'll optimise NITE Mind for you" />
                <div className="grid grid-cols-2 gap-3">
                  {GOALS.map(g => (
                    <button key={g.id} onClick={() => toggleGoal(g.id)}
                      className={cn('p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.97]',
                        data.goals.includes(g.id)
                          ? 'border-emerald-500 bg-emerald-500/15'
                          : 'border-white/10 bg-white/5'
                      )}>
                      <div className="text-2xl mb-2">{g.icon}</div>
                      <div className={cn('text-sm font-bold leading-tight',
                        data.goals.includes(g.id) ? 'text-emerald-400' : 'text-white/60'
                      )}>{g.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── DONE ── */}
            {isLast && (
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-emerald-500/40 mb-8">
                  <Check className="w-12 h-12 text-white" />
                </div>
                <h1 className="text-3xl font-black text-white mb-3 tracking-tight">You're all set!</h1>
                <p className="text-slate-400 text-base leading-relaxed mb-8 max-w-xs">
                  Your personalized workspace is ready.
                  {data.subjects.length > 0 && ` Tuned for ${data.subjects.slice(0, 2).join(' & ')}.`}
                </p>
                <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 mb-8 text-left space-y-3">
                  {[
                    { icon: '📚', text: 'Upload docs to your Library' },
                    { icon: '🤖', text: 'Ask NITE AI anything' },
                    { icon: '👥', text: 'Create a study group' },
                  ].map(tip => (
                    <div key={tip.text} className="flex items-center gap-3">
                      <span className="text-xl">{tip.icon}</span>
                      <span className="text-sm font-semibold text-white/60">{tip.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom action buttons */}
      <div className="relative z-10 px-5 pb-4 flex-shrink-0 space-y-3">
        <button
          onClick={isLast ? finish : next}
          className="w-full py-4 rounded-2xl bg-primary text-white font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-primary/30 active:scale-[0.98] transition-transform"
        >
          {isLast ? 'Enter NITE Mind' : step === 0 ? 'Get Started' : 'Continue'}
          {isLast ? <ChevronRight className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
        </button>
        {step > 0 && !isLast && (
          <button onClick={prev}
            className="w-full py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white/50 font-bold text-sm active:scale-[0.98] transition-transform">
            Back
          </button>
        )}
      </div>
    </div>
  )
}

function StepHeader({ icon: Icon, title, subtitle, color = 'from-primary to-violet-500' }: {
  icon: any, title: string, subtitle: string, color?: string
}) {
  return (
    <div className="flex items-center gap-4 mb-7">
      <div className={cn('w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-lg bg-gradient-to-br', color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <h2 className="text-xl font-black text-white tracking-tight">{title}</h2>
        <p className="text-sm text-white/40 font-medium mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}
