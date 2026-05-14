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

  const next = async () => {
    if (step === STEPS.length - 2) {
      await updateProfile.mutateAsync().catch(() => {})
    }
    if (step < STEPS.length - 1) setStep(s => s + 1)
  }

  const prev = () => { if (step > 0) setStep(s => s - 1) }

  const handleFinish = async () => {
    localStorage.setItem('nitemind_onboarded', 'true')
    try { await authApi.updateOnboarding('completed') } catch {}
    setShowTutorial(true)
  }

  const isLast = step === STEPS.length - 1
  const progress = step / (STEPS.length - 1)

  return (
    <>
      <div
        className="fixed inset-0 z-[200] bg-[#050505] flex flex-col overflow-hidden"
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

        {/* Header / Progress */}
        {!isLast && (
          <div className="relative z-10 px-6 py-8 flex flex-col items-center">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center overflow-hidden p-1.5">
                <img src="/images/logo-icon.png" alt="NITE Mind" className="w-full h-full object-contain" />
              </div>
              <span className="text-base font-black text-white tracking-[0.2em] uppercase">NITE Mind</span>
            </div>
            
            <div className="w-full max-w-md h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-orange-500 to-violet-500 rounded-full"
                initial={false}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        )}

        {/* Main Step Content */}
        <div className="flex-1 overflow-y-auto relative z-10 custom-scrollbar">
          <div className="max-w-xl mx-auto px-6 h-full flex flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.98 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex-1 flex flex-col justify-center py-12"
              >

                {/* ── WELCOME ── */}
                {step === 0 && (
                  <div className="text-center">
                    <motion.div 
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                      className="w-28 h-28 bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-orange-500/20 mx-auto mb-10 relative"
                    >
                      <Rocket className="w-14 h-14 text-white" />
                      <div className="absolute -inset-4 bg-orange-500/20 blur-2xl rounded-full -z-10 animate-pulse" />
                    </motion.div>
                    
                    <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight leading-tight">
                      Welcome to the <br/>
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-orange-500 to-amber-400">
                        Future of Learning
                      </span>
                    </h1>
                    
                    <p className="text-slate-400 text-lg leading-relaxed mb-12 max-w-sm mx-auto font-medium">
                      Personalize your intelligence engine in just a few taps.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { icon: Sparkles, title: 'AI Tutor', desc: 'Instant support', color: 'text-orange-400 bg-orange-500/10' },
                        { icon: BookOpen, title: 'Library', desc: 'Smart storage', color: 'text-violet-400 bg-violet-500/10' },
                        { icon: Users, title: 'Collab', desc: 'Shared brain', color: 'text-emerald-400 bg-emerald-500/10' },
                      ].map((item, i) => (
                        <motion.div 
                          key={item.title}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 + (i * 0.1) }}
                          className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 backdrop-blur-sm"
                        >
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3", item.color)}>
                            <item.icon className="w-5 h-5" />
                          </div>
                          <h3 className="text-sm font-bold text-white mb-1">{item.title}</h3>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{item.desc}</p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── PROFILE ── */}
                {step === 1 && (
                  <div className="space-y-8">
                    <StepHeader icon={GraduationCap} title="Set your foundation" subtitle="Where are you learning today?" />
                    
                    <div className="space-y-6">
                      <div className="group">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 block px-1 group-focus-within:text-orange-500 transition-colors">University / Institution</label>
                        <div className="relative">
                          <input
                            value={data.university}
                            onChange={e => setData(d => ({ ...d, university: e.target.value }))}
                            placeholder="e.g. Stanford University"
                            className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 text-white placeholder-white/20 text-base font-bold focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.06] transition-all"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center">
                            <Star className="w-4 h-4 text-slate-600" />
                          </div>
                        </div>
                      </div>

                      <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-5 block text-center">Daily Study Commitment</label>
                        <div className="grid grid-cols-2 gap-3">
                          {STUDY_HOURS.map(h => (
                            <button key={h} onClick={() => setData(d => ({ ...d, study_hours_per_day: h }))}
                              className={cn('py-4 rounded-2xl text-sm font-black border-2 transition-all active:scale-[0.97]',
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

                {/* ── SUBJECTS ── */}
                {step === 2 && (
                  <div className="space-y-8">
                    <StepHeader icon={BookOpen} title="Select your focus" subtitle="What subjects should we optimize for?" />
                    
                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                      {SUBJECTS.map(s => (
                        <button key={s} onClick={() => toggleSubject(s)}
                          className={cn('px-5 py-4 rounded-2xl text-sm font-black border-2 transition-all flex items-center justify-between group active:scale-[0.97]',
                            data.subjects.includes(s)
                              ? 'border-violet-500 bg-violet-500/10 text-violet-400'
                              : 'border-white/5 text-slate-500 bg-white/3 hover:bg-white/5'
                          )}>
                          <span className="truncate">{s}</span>
                          <div className={cn("w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all", 
                             data.subjects.includes(s) ? "bg-violet-500 border-violet-500" : "border-white/10"
                          )}>
                            {data.subjects.includes(s) && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── GOALS ── */}
                {step === 3 && (
                  <div className="space-y-8">
                    <StepHeader icon={Target} title="Define your mission" subtitle="What does success look like for you?" />
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {GOALS.map((g, i) => (
                        <motion.button 
                          key={g.id} 
                          initial={{ opacity: 0, x: i % 2 === 0 ? -10 : 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          onClick={() => toggleGoal(g.id)}
                          className={cn('p-6 rounded-[2rem] border-2 text-left transition-all relative overflow-hidden group active:scale-[0.97]',
                            data.goals.includes(g.id)
                              ? 'border-orange-500 bg-white/[0.05]'
                              : 'border-white/5 bg-white/3 hover:border-white/10'
                          )}
                        >
                          {data.goals.includes(g.id) && (
                            <motion.div 
                              layoutId="goal-bg"
                              className={cn("absolute inset-0 bg-gradient-to-br opacity-5", g.color)} 
                            />
                          )}
                          
                          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-lg transition-transform group-hover:scale-110", 
                            data.goals.includes(g.id) ? "bg-orange-500 text-white" : "bg-white/5 text-slate-500"
                          )}>
                            {g.icon}
                          </div>
                          
                          <h4 className={cn('text-base font-black leading-tight mb-2',
                            data.goals.includes(g.id) ? 'text-white' : 'text-slate-400'
                          )}>{g.label}</h4>
                          
                          <div className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center absolute top-6 right-6 transition-all",
                            data.goals.includes(g.id) ? "bg-orange-500 border-orange-500" : "border-white/10 opacity-0 group-hover:opacity-100"
                          )}>
                            {data.goals.includes(g.id) && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── DONE ── */}
                {isLast && (
                  <div className="text-center">
                    <motion.div 
                      initial={{ rotate: -10, scale: 0.8 }}
                      animate={{ rotate: 0, scale: 1 }}
                      transition={{ type: 'spring', bounce: 0.5 }}
                      className="w-32 h-32 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-[3rem] flex items-center justify-center shadow-2xl shadow-emerald-500/20 mx-auto mb-10"
                    >
                      <Check className="w-16 h-16 text-white" />
                    </motion.div>
                    
                    <h1 className="text-4xl font-black text-white mb-4 tracking-tight">Mission Initialized!</h1>
                    <p className="text-slate-400 text-lg leading-relaxed mb-10 max-w-sm mx-auto">
                      Your NITE Mind is tuned and ready to transform how you study.
                    </p>

                    <div className="bg-white/[0.03] border border-white/5 rounded-[2.5rem] p-8 text-left space-y-5">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 px-1">Getting Started</h4>
                      {[
                        { icon: '📁', text: 'Sync your study materials', sub: 'Upload any file or URL' },
                        { icon: '✨', text: 'Chat with NITE AI', sub: 'Your dedicated study partner' },
                        { icon: '📈', text: 'Track your progress', sub: 'Weekly goals and mastery' },
                      ].map((tip, i) => (
                        <motion.div 
                          key={tip.text} 
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5 + (i * 0.1) }}
                          className="flex items-center gap-4"
                        >
                          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-xl shadow-inner">
                            {tip.icon}
                          </div>
                          <div>
                            <p className="text-sm font-black text-white">{tip.text}</p>
                            <p className="text-xs text-slate-500 font-bold mt-0.5">{tip.sub}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="relative z-10 px-6 py-10 flex flex-col items-center bg-gradient-to-t from-[#050505] via-[#050505] to-transparent">
          <div className="w-full max-w-md space-y-4">
            <button
              onClick={isLast ? handleFinish : next}
              className="w-full py-5 rounded-[2rem] bg-orange-500 text-white font-black text-lg flex items-center justify-center gap-3 shadow-2xl shadow-orange-500/20 active:scale-[0.98] transition-all hover:bg-orange-400 hover:shadow-orange-500/40"
            >
              {isLast ? 'Enter NITE Mind' : step === 0 ? "Let's Go" : 'Continue'}
              {isLast ? <Rocket className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
            </button>
            
            {step > 0 && !isLast && (
              <button onClick={prev}
                className="w-full py-4 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-white transition-colors">
                Back to previous
              </button>
            )}
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
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(249, 115, 22, 0.2); }
      `}</style>
    </>
  )
}

function StepHeader({ icon: Icon, title, subtitle, color = 'from-orange-500 to-amber-600' }: {
  icon: any, title: string, subtitle: string, color?: string
}) {
  return (
    <div className="flex items-center gap-5 mb-10">
      <div className={cn('w-16 h-16 rounded-[1.5rem] flex-shrink-0 flex items-center justify-center shadow-xl bg-gradient-to-br relative overflow-hidden', color)}>
        <Icon className="w-8 h-8 text-white relative z-10" />
        <div className="absolute inset-0 bg-white/10 opacity-50 blur-sm" />
      </div>
      <div>
        <h2 className="text-2xl font-black text-white tracking-tight leading-tight">{title}</h2>
        <p className="text-sm text-slate-500 font-bold mt-1 uppercase tracking-wider">{subtitle}</p>
      </div>
    </div>
  )
}
