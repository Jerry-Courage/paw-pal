'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import {
  Zap, BookOpen, Users, Sparkles, Upload,
  ArrowRight, Check, ChevronRight, GraduationCap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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

interface Step {
  id: string
  title: string
  subtitle: string
}

const STEPS: Step[] = [
  { id: 'welcome', title: 'Welcome to FlowState', subtitle: 'Your AI-powered study companion' },
  { id: 'profile', title: 'Tell us about yourself', subtitle: 'Help us personalize your experience' },
  { id: 'subjects', title: 'What do you study?', subtitle: 'Pick your subjects so we can tailor your content' },
  { id: 'goals', title: 'What are your goals?', subtitle: 'We\'ll optimize FlowState for what matters to you' },
  { id: 'upload', title: 'Upload your first resource', subtitle: 'Drop a PDF, paste a YouTube link, or skip for now' },
  { id: 'done', title: 'You\'re all set!', subtitle: 'Your personalized study space is ready' },
]

export default function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState('forward')
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

  const current = STEPS[step]

  const toggleSubject = (s: string) =>
    setData((d) => ({
      ...d,
      subjects: d.subjects.includes(s) ? d.subjects.filter((x) => x !== s) : [...d.subjects, s],
    }))

  const toggleGoal = (g: string) =>
    setData((d) => ({
      ...d,
      goals: d.goals.includes(g) ? d.goals.filter((x) => x !== g) : [...d.goals, g],
    }))

  const next = async () => {
    if (step === STEPS.length - 2) {
      await updateProfile.mutateAsync().catch(() => {})
    }
    if (step < STEPS.length - 1) {
      setDirection('forward')
      setStep((s) => s + 1)
    }
  }

  const prev = () => {
    if (step > 0) {
      setDirection('backward')
      setStep((s) => s - 1)
    }
  }

  const finish = () => {
    localStorage.setItem('flowstate_onboarded', 'true')
    onComplete()
    router.push('/dashboard')
  }

  return (
    <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center z-[100] px-4 py-8 overflow-y-auto overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[20%] w-[50vw] h-[50vw] max-w-[500px] max-h-[500px] bg-primary/20 rounded-full blur-[100px] animate-pulse-slow"></div>
        <div className="absolute bottom-[10%] right-[10%] w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-violet-500/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-xl relative z-10 flex flex-col">
        {/* Progress dots */}
        {step > 0 && step < STEPS.length - 1 && (
          <div className="flex items-center justify-center gap-3 mb-8">
            {STEPS.slice(1, -1).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'transition-all duration-500 ease-out',
                  i + 1 === step ? 'w-8 h-2 bg-primary rounded-full shadow-lg shadow-primary/50' :
                  i + 1 < step ? 'w-2 h-2 bg-primary/40 rounded-full' :
                  'w-2 h-2 bg-slate-200 dark:bg-slate-800 rounded-full'
                )}
              />
            ))}
          </div>
        )}

        <div className="animate-fade-in-up w-full" key={step}>
          {/* Welcome step */}
          {step === 0 && (
            <div className="glass-card p-8 md:p-12 text-center rounded-[2rem]">
              <div className="w-24 h-24 bg-gradient-to-br from-primary to-violet-500 rounded-[2rem] mx-auto mb-8 flex items-center justify-center shadow-xl shadow-primary/30 transform hover:scale-105 transition-transform">
                <Zap className="w-12 h-12 text-white" />
              </div>
              <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">
                Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-violet-400">FlowState</span>
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mb-10 text-lg leading-relaxed">
                Your AI-powered study companion. Let's set up your personalized learning space in less than a minute.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
                {[
                  { icon: BookOpen, label: 'Smart Library', color: 'bg-primary/10 text-primary border-primary/20' },
                  { icon: Users, label: 'Study Groups', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
                  { icon: Sparkles, label: 'AI Tutor', color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' },
                ].map((f) => (
                  <div key={f.label} className="flex flex-col items-center justify-center p-4 rounded-2xl border bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm transition-all hover:scale-105">
                    <div className={cn('w-12 h-12 rounded-xl mb-3 flex items-center justify-center border', f.color)}>
                      <f.icon className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{f.label}</div>
                  </div>
                ))}
              </div>
              <button onClick={next} className="btn-primary w-full py-4 text-lg">
                Get Started <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          )}

          {/* Profile step */}
          {step === 1 && (
            <div className="glass-card p-6 md:p-10 rounded-[2rem]">
              <StepHeader icon={GraduationCap} title={current.title} subtitle={current.subtitle} color="from-sky-500 to-primary" />
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">University / Institution</label>
                  <input
                    value={data.university}
                    onChange={(e) => setData((d) => ({ ...d, university: e.target.value }))}
                    placeholder="e.g. MIT, Stanford, Oxford..."
                    className="input text-base"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 block">Daily study hours</label>
                  <div className="grid grid-cols-2 gap-3">
                    {STUDY_HOURS.map((h) => (
                      <button
                        key={h}
                        onClick={() => setData((d) => ({ ...d, study_hours_per_day: h }))}
                        className={cn(
                          'py-3 rounded-xl text-sm font-bold border-2 transition-all',
                          data.study_hours_per_day === h
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700 bg-white/50 dark:bg-slate-900/50'
                        )}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 block">Weekly goal duration</label>
                  <div className="flex items-center gap-4 bg-white/50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <input
                      type="range" min={2} max={60} step={2}
                      value={data.weekly_goal_hours}
                      onChange={(e) => setData((d) => ({ ...d, weekly_goal_hours: Number(e.target.value) }))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-primary font-bold w-16 text-right text-xl">{data.weekly_goal_hours}h</span>
                  </div>
                </div>
              </div>
              <StepButtons onNext={next} onBack={prev} onSkip={next} showSkip />
            </div>
          )}

          {/* Subjects step */}
          {step === 2 && (
            <div className="glass-card p-6 md:p-10 rounded-[2rem]">
              <StepHeader icon={BookOpen} title={current.title} subtitle={current.subtitle} color="from-violet-500 to-fuchsia-500" />
              <div className="flex flex-wrap gap-3 mb-6">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleSubject(s)}
                    className={cn(
                      'px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all flex items-center gap-2',
                      data.subjects.includes(s)
                        ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 bg-white/50 dark:bg-slate-900/50'
                    )}
                  >
                    {data.subjects.includes(s) && <Check className="w-4 h-4" />}
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-sm text-slate-500 font-medium mb-8 bg-slate-100 dark:bg-slate-800/50 inline-block px-3 py-1 rounded-lg">
                {data.subjects.length} selected
              </p>
              <StepButtons onNext={next} onBack={prev} onSkip={next} showSkip />
            </div>
          )}

          {/* Goals step */}
          {step === 3 && (
            <div className="glass-card p-6 md:p-10 rounded-[2rem]">
              <StepHeader icon={Sparkles} title={current.title} subtitle={current.subtitle} color="from-emerald-500 to-teal-500" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => toggleGoal(g.id)}
                    className={cn(
                      'p-5 rounded-2xl border-2 text-left transition-all active:scale-[0.98]',
                      data.goals.includes(g.id)
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-md shadow-emerald-500/10'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/50 dark:bg-slate-900/50'
                    )}
                  >
                    <div className="text-3xl mb-3 bg-white dark:bg-slate-800 w-12 h-12 flex items-center justify-center rounded-xl shadow-sm">{g.icon}</div>
                    <div className={cn('text-base font-bold', data.goals.includes(g.id) ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300')}>
                      {g.label}
                    </div>
                  </button>
                ))}
              </div>
              <StepButtons onNext={next} onBack={prev} onSkip={next} showSkip />
            </div>
          )}

          {/* Upload step */}
          {step === 4 && (
            <div className="glass-card p-6 md:p-10 rounded-[2rem]">
              <StepHeader icon={Upload} title={current.title} subtitle={current.subtitle} color="from-orange-500 to-amber-500" />
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-[2rem] p-12 text-center mb-8 hover:border-primary transition-colors cursor-pointer bg-slate-50/50 dark:bg-slate-900/50 group">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:shadow-md transition-all duration-300 border border-slate-100 dark:border-slate-700">
                  <Upload className="w-8 h-8 text-slate-400 group-hover:text-primary transition-colors" />
                </div>
                <p className="text-base font-bold text-slate-700 dark:text-slate-300 mb-2">Drag and drop or browse</p>
                <p className="text-sm font-medium text-slate-500">Supports PDF, DOCX, Youtube Links</p>
              </div>
              <StepButtons onNext={next} onBack={prev} onSkip={next} nextLabel="Upload & Continue" showSkip skipLabel="Skip for now" />
            </div>
          )}

          {/* Done step */}
          {step === STEPS.length - 1 && (
            <div className="glass-card p-8 md:p-12 text-center rounded-[2rem]">
              <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-[2rem] mx-auto mb-8 flex items-center justify-center shadow-xl shadow-emerald-500/30 transform hover:scale-105 transition-transform">
                <Check className="w-12 h-12 text-white" />
              </div>
              <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">You're all set!</h1>
              <p className="text-slate-500 dark:text-slate-400 mb-10 text-lg leading-relaxed">
                Your personalized workspace is primed.
                {data.subjects.length > 0 && ` Specially tuned for ${data.subjects.slice(0, 2).join(' & ')}.`}
              </p>

              <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 mb-10 text-left border border-slate-200 dark:border-slate-800 shadow-inner">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 px-2">Quick Commands</h4>
                <div className="space-y-4">
                  {[
                    { icon: '📚', text: 'Head to Library to upload docs' },
                    { icon: '🤖', text: 'Ask FlowAI anything in chat' },
                    { icon: '👥', text: 'Create your first study group' },
                  ].map((tip) => (
                    <div key={tip.text} className="flex items-center gap-4 bg-white dark:bg-slate-800 p-3 rounded-xl shadow-sm">
                      <div className="bg-slate-50 dark:bg-slate-900 w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-sm">{tip.icon}</div>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{tip.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={finish} className="btn-primary w-full py-4 text-lg">
                Enter Dashboard <ChevronRight className="w-6 h-6 ml-2" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StepHeader({ icon: Icon, title, subtitle, color }: { icon: any, title: string, subtitle: string, color: string }) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
      <div className={cn('w-14 h-14 rounded-2xl flex flex-shrink-0 items-center justify-center shadow-lg bg-gradient-to-br', color)}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">{title}</h2>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
      </div>
    </div>
  )
}

function StepButtons({
  onNext, onBack, onSkip, showSkip = false,
  nextLabel = 'Continue', skipLabel = 'Skip'
}: {
  onNext: () => void
  onBack?: () => void
  onSkip?: () => void
  showSkip?: boolean
  nextLabel?: string
  skipLabel?: string
}) {
  return (
    <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-800 mt-4">
      <div className="flex gap-2">
        {onBack && (
          <button onClick={onBack} className="btn-secondary px-6">
            Back
          </button>
        )}
        {showSkip && (
          <button onClick={onSkip} className="text-sm font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors px-4">
            {skipLabel}
          </button>
        )}
      </div>
      <button onClick={onNext} className="btn-primary px-8">
        {nextLabel} <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}
