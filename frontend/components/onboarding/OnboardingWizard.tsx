'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import {
  Zap, BookOpen, Users, Sparkles,
  ArrowRight, Check, ChevronRight, GraduationCap, Brain,
  Trophy, Target, Rocket, Star
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import VideoTutorialModal from './VideoTutorialModal'

const SUBJECTS = [
  'Computer Science', 'Mathematics', 'Physics', 'Chemistry',
  'Biology', 'Economics', 'Psychology', 'History',
  'Literature', 'Engineering', 'Medicine', 'Law',
]

const GOALS = [
  { id: 'exams', label: 'Ace my exams', icon: <Trophy className="w-6 h-6" />, color: 'from-orange-500 to-amber-500' },
  { id: 'understand', label: 'Understand deeply', icon: <Brain className="w-6 h-6" />, color: 'from-violet-500 to-purple-600' },
  { id: 'collaborate', label: 'Study with others', icon: <Users className="w-6 h-6" />, color: 'from-emerald-500 to-teal-600' },
  { id: 'organize', label: 'Stay organized', icon: <Target className="w-6 h-6" />, color: 'from-sky-500 to-blue-600' },
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
  const [showTutorial, setShowTutorial] = useState(false)
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

  const next = () => {
    if (step === STEPS.length - 2) {
      updateProfile.mutateAsync().catch(() => {})
    }
    if (step < STEPS.length - 1) setStep(s => s + 1)
  }

  const prev = () => { if (step > 0) setStep(s => s - 1) }

  const handleFinish = () => {
    localStorage.setItem('flowstate_onboarded', 'true')
    authApi.updateOnboarding('completed').catch(() => {})
    onComplete()
    router.push('/dashboard')
  }

  const isLast = step === STEPS.length - 1

  return (
    <>
      <div
        className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Animated Background Gradients */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              x: [0, 50, 0],
              y: [0, -30, 0]
            }}
            transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-[10%] -left-[10%] w-[60vw] h-[60vw] bg-orange-500/10 rounded-full blur-[120px]" 
          />
          <motion.div 
            animate={{ 
              scale: [1.2, 1, 1.2],
              x: [0, -50, 0],
              y: [0, 30, 0]
            }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -bottom-[10%] -right-[10%] w-[60vw] h-[60vw] bg-violet-600/10 rounded-full blur-[120px]" 
          />
        </div>

        {/* Modal Card Container */}
        <div className="relative z-10 w-full max-w-lg bg-[#141416] border border-white/10 rounded-[2.5rem] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden my-auto p-6 sm:p-10">
          
          {/* Top Indicator & Step Counter */}
          <div className="flex items-center justify-between mb-6 sm:mb-8 shrink-0">
            <div className="flex items-center gap-1.5 flex-1 max-w-[220px]">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === step ? 'w-8 bg-orange-500' : 'w-4 bg-white/10'
                  )}
                />
              ))}
            </div>
            <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.98 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col py-2"
              >

                {/* ── WELCOME (Step 0) ── */}
                {step === 0 && (
                  <div className="text-center space-y-6">
                    {/* Circular 3D Robot Mascot Frame */}
                    <div className="relative mx-auto w-44 h-44 sm:w-52 sm:h-52 rounded-full border-2 border-orange-500/30 p-2 bg-[#1a1a1e] shadow-2xl flex items-center justify-center overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/15 via-transparent to-amber-500/15 animate-pulse" />
                      <img
                        src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop"
                        alt="Study Buddy Robot"
                        className="w-full h-full object-cover rounded-full scale-105 hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                        Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-orange-500 to-amber-400">FlowState Junior!</span>
                      </h1>
                      
                      <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-sm mx-auto font-medium">
                        I'm your new study buddy. Together, we'll turn homework time into a fun adventure and help you find your focus!
                      </p>
                    </div>
                  </div>
                )}

                {/* ── PROFILE (Step 1) ── */}
                {step === 1 && (
                  <div className="space-y-6">
                    <StepHeader icon={GraduationCap} title="Set your foundation" subtitle="Where are you learning today?" />
                    
                    <div className="space-y-5">
                      <div className="group">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block px-1 group-focus-within:text-orange-500 transition-colors">University / Institution</label>
                        <div className="relative">
                          <input
                            value={data.university}
                            onChange={e => setData(d => ({ ...d, university: e.target.value }))}
                            placeholder="e.g. Stanford University"
                            className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3.5 text-white placeholder-white/20 text-sm font-bold focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.06] transition-all"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/5 rounded-lg flex items-center justify-center">
                            <Star className="w-3.5 h-3.5 text-slate-600" />
                          </div>
                        </div>
                      </div>

                      <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 block text-center">Daily Study Commitment</label>
                        <div className="grid grid-cols-2 gap-2.5">
                          {STUDY_HOURS.map(h => (
                            <button key={h} onClick={() => setData(d => ({ ...d, study_hours_per_day: h }))}
                              className={cn('py-3.5 rounded-xl text-xs font-black border-2 transition-all active:scale-[0.97]',
                                data.study_hours_per_day === h
                                  ? 'border-orange-500 bg-orange-500/10 text-orange-500 shadow-lg shadow-orange-500/10'
                                  : 'border-white/5 text-slate-500 bg-white/3 hover:bg-white/5'
                              )}>
                              {h}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SUBJECTS (Step 2) ── */}
                {step === 2 && (
                  <div className="space-y-6">
                    <StepHeader icon={BookOpen} title="Select your focus" subtitle="What subjects should we optimize for?" />
                    
                    <div className="grid grid-cols-2 gap-2.5 max-h-[280px] overflow-y-auto pr-1">
                      {SUBJECTS.map(s => (
                        <button key={s} onClick={() => toggleSubject(s)}
                          className={cn('px-4 py-3 rounded-xl text-xs font-black border-2 transition-all flex items-center justify-between group active:scale-[0.97]',
                            data.subjects.includes(s)
                              ? 'border-violet-500 bg-violet-500/10 text-violet-400'
                              : 'border-white/5 text-slate-500 bg-white/3 hover:bg-white/5'
                          )}>
                          <span className="truncate">{s}</span>
                          <div className={cn("w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all", 
                             data.subjects.includes(s) ? "bg-violet-500 border-violet-500" : "border-white/10"
                          )}>
                            {data.subjects.includes(s) && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── GOALS (Step 3) ── */}
                {step === 3 && (
                  <div className="space-y-6">
                    <StepHeader icon={Target} title="Define your mission" subtitle="What does success look like for you?" />
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {GOALS.map((g, i) => (
                        <motion.button 
                          key={g.id} 
                          initial={{ opacity: 0, x: i % 2 === 0 ? -10 : 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.08 }}
                          onClick={() => toggleGoal(g.id)}
                          className={cn('p-4 rounded-2xl border-2 text-left transition-all relative overflow-hidden group active:scale-[0.97]',
                            data.goals.includes(g.id)
                              ? 'border-orange-500 bg-white/[0.05]'
                              : 'border-white/5 bg-white/3 hover:border-white/10'
                          )}
                        >
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3 shadow-lg transition-transform group-hover:scale-110", 
                            data.goals.includes(g.id) ? "bg-orange-500 text-white" : "bg-white/5 text-slate-500"
                          )}>
                            {g.icon}
                          </div>
                          
                          <h4 className={cn('text-sm font-black leading-tight mb-1',
                            data.goals.includes(g.id) ? 'text-white' : 'text-slate-400'
                          )}>{g.label}</h4>
                          
                          <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center absolute top-4 right-4 transition-all",
                            data.goals.includes(g.id) ? "bg-orange-500 border-orange-500" : "border-white/10 opacity-0 group-hover:opacity-100"
                          )}>
                            {data.goals.includes(g.id) && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── DONE (Step 4) ── */}
                {isLast && (
                  <div className="text-center space-y-4">
                    <motion.div 
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', bounce: 0.5 }}
                      className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-[2.5rem] flex items-center justify-center shadow-xl shadow-emerald-500/20 mx-auto"
                    >
                      <Check className="w-12 h-12 text-white" />
                    </motion.div>
                    
                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Mission Initialized!</h1>
                    <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-xs mx-auto">
                      Your Flow State is tuned and ready to transform how you study.
                    </p>

                    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-left space-y-3">
                      {[
                        { icon: '📁', text: 'Sync your study materials', sub: 'Upload any file or URL' },
                        { icon: '✨', text: 'Chat with Flow AI', sub: 'Your dedicated study partner' },
                      ].map((tip, i) => (
                        <div key={tip.text} className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-lg">
                            {tip.icon}
                          </div>
                          <div>
                            <p className="text-xs font-black text-white">{tip.text}</p>
                            <p className="text-[10px] text-slate-500 font-bold">{tip.sub}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom Actions */}
          <div className="mt-6 pt-4 border-t border-white/5 flex flex-col items-center gap-2.5 shrink-0">
            <button
              onClick={isLast ? handleFinish : next}
              className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-orange-500/25 active:scale-[0.98] transition-all"
            >
              {isLast ? 'Enter Flow State' : step === 0 ? "Next" : 'Continue'} <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                localStorage.setItem('flowstate_onboarded', 'true')
                authApi.updateOnboarding('completed').catch(() => {})
                onComplete()
                router.push('/dashboard')
              }}
              className="text-[11px] font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-colors py-1"
            >
              Skip intro
            </button>
          </div>

        </div>
      </div>

      <VideoTutorialModal 
        isOpen={showTutorial} 
        onClose={() => {
          setShowTutorial(false)
          onComplete()
          router.push('/dashboard')
        }} 
      />
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 10px; }
      `}</style>
    </>
  )
}

function StepHeader({ icon: Icon, title, subtitle, color = 'from-orange-500 to-amber-600' }: {
  icon: any, title: string, subtitle: string, color?: string
}) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className={cn('w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-lg bg-gradient-to-br relative overflow-hidden', color)}>
        <Icon className="w-6 h-6 text-white relative z-10" />
        <div className="absolute inset-0 bg-white/10 opacity-50 blur-sm" />
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight">{title}</h2>
        <p className="text-xs text-slate-500 font-bold mt-0.5 uppercase tracking-wider">{subtitle}</p>
      </div>
    </div>
  )
}
