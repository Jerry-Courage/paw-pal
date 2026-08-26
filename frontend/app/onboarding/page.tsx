'use client'

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ArrowRight, BookOpen, BriefcaseBusiness, Check, GraduationCap, Plus, School, X } from 'lucide-react'
import { toast } from 'sonner'
import FlowCompanion, { type FlowCompanionState } from '@/components/onboarding/FlowCompanion'
import FirstJourneyBuilder from '@/components/journey-builder/FirstJourneyBuilder'
import { authApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { LearnerType, LearningDifficulty, OnboardingProfile, StarterIdentity } from '@/types/onboarding'

const LEARNER_TYPES: Array<{ id: LearnerType; label: string; note: string; icon: typeof GraduationCap; angle: string }> = [
  { id: 'university', label: 'University', note: 'Modules, lectures, finals', icon: GraduationCap, angle: '-rotate-1' },
  { id: 'shs', label: 'SHS', note: 'Classes, WASSCE, everything', icon: School, angle: 'rotate-1' },
  { id: 'professional', label: 'Professional Exam', note: 'One serious qualification', icon: BriefcaseBusiness, angle: 'rotate-[-0.5deg]' },
  { id: 'self_learning', label: 'Self Learning', note: 'Curiosity makes the rules', icon: BookOpen, angle: 'rotate-[0.5deg]' },
]

const DIFFICULTIES: Array<{ id: LearningDifficulty; label: string; mark: string }> = [
  { id: 'understanding', label: 'Understanding concepts', mark: '≈' },
  { id: 'remembering', label: 'Remembering things', mark: '↻' },
  { id: 'exam_prep', label: 'Exam preparation', mark: '!' },
  { id: 'assignments', label: 'Assignments', mark: '✎' },
  { id: 'consistency', label: 'Staying consistent', mark: '→' },
  { id: 'everything', label: 'Everything 😭', mark: '✦' },
]

const IDENTITIES: Array<{ id: StarterIdentity; name: string; shape: string; accent: string }> = [
  { id: 'ember', name: 'Ember', shape: 'rounded-[42%_58%_54%_46%]', accent: 'bg-flow-orange' },
  { id: 'pulse', name: 'Pulse', shape: 'rounded-[55%_45%_38%_62%]', accent: 'bg-flow-violet' },
  { id: 'orbit', name: 'Orbit', shape: 'rounded-full', accent: 'bg-cyan-300' },
  { id: 'nova', name: 'Nova', shape: 'rounded-[35%_65%_58%_42%]', accent: 'bg-amber-300' },
]

const SUGGESTIONS: Record<LearnerType, string[]> = {
  university: ['Calculus', 'Biochemistry', 'Economics', 'Computer Science'],
  shs: ['Core Mathematics', 'Integrated Science', 'English', 'Social Studies'],
  professional: ['ACCA', 'Medicine', 'Law', 'Project Management'],
  self_learning: ['A new language', 'Design', 'Coding', 'Personal finance'],
}

const EMPTY_PROFILE: OnboardingProfile = { version: 2, current_step: 0, subjects: [], difficulties: [] }

export default function OnboardingPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const reduceMotion = useReducedMotion()
  const inputRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState<OnboardingProfile>(EMPTY_PROFILE)
  const [subjectInput, setSubjectInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [builderFlowState, setBuilderFlowState] = useState<FlowCompanionState>('idle')

  const { data: user, isLoading, isError, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.me().then(response => response.data),
    staleTime: 0,
  })

  useEffect(() => {
    if (!user || hydrated) return
    const saved = user.onboarding_status?.onboarding_v2 as Partial<OnboardingProfile> | undefined
    if (user.onboarding_status?.completed && !saved) {
      router.replace('/dashboard')
      return
    }
    const prefilled = user.education_level === 'secondary' ? 'shs' : undefined
    setProfile({ ...EMPTY_PROFILE, ...saved, learner_type: saved?.learner_type || prefilled })
    setHydrated(true)
  }, [user, hydrated, router])

  const step = profile.current_step
  const companionState: FlowCompanionState = step === 3 ? builderFlowState : saving ? 'thinking' : profile.learner_type && step === 0 ? 'celebrating' : 'idle'
  const suggestions = SUGGESTIONS[profile.learner_type || 'university']

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(profile.learner_type)
    if (step === 1) return profile.subjects.length > 0 && profile.difficulties.length > 0
    if (step === 2) return Boolean(profile.starter_identity)
    return true
  }, [profile, step])

  const persist = async (next: Partial<OnboardingProfile>) => {
    setSaving(true)
    try {
      const response = await authApi.updateOnboardingV2(next)
      const serverProfile = response.data.onboarding_v2 as OnboardingProfile
      setProfile(current => ({ ...current, ...serverProfile }))
      await qc.invalidateQueries({ queryKey: ['profile'] })
      return true
    } catch {
      toast.error('Flow lost the signal. Your answers are still here — try again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const continueStep = async () => {
    if (!canContinue || saving) return
    if (step === 0 && profile.learner_type) {
      const education_level = profile.learner_type === 'shs' ? 'secondary' : 'tertiary'
      try { await authApi.updateProfile({ education_level }) } catch { /* onboarding state remains authoritative */ }
    }
    const nextStep = Math.min(3, step + 1)
    const ok = await persist({
      current_step: nextStep,
      learner_type: profile.learner_type,
      subjects: profile.subjects,
      difficulties: profile.difficulties,
      starter_identity: profile.starter_identity,
    })
    if (ok && nextStep === 1) setTimeout(() => inputRef.current?.focus(), 450)
  }

  const addSubject = (value = subjectInput) => {
    const subject = value.trim().replace(/\s+/g, ' ')
    if (!subject || profile.subjects.some(item => item.toLowerCase() === subject.toLowerCase())) return
    setProfile(current => ({ ...current, subjects: [...current.subjects, subject].slice(0, 12) }))
    setSubjectInput('')
    inputRef.current?.focus()
  }

  const submitSubject = (event: FormEvent) => { event.preventDefault(); addSubject() }
  const subjectKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === ',' || event.key === 'Enter') { event.preventDefault(); addSubject() }
  }

  if (isError) {
    return (
      <main className="flow-v2 min-h-[100dvh] grid place-items-center px-6 text-center">
        <div>
          <FlowCompanion state="thinking" className="mx-auto w-44" />
          <h1 className="text-2xl font-black">I lost the signal.</h1>
          <p className="mt-2 text-sm text-flow-muted">Your saved onboarding progress is safe on the server.</p>
          <button type="button" onClick={() => refetch()} className="mt-6 bg-flow-orange px-6 py-3 font-black text-flow-void shadow-[0_5px_0_#8f3600] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Try again</button>
        </div>
      </main>
    )
  }

  if (isLoading || !hydrated) {
    return <main className="flow-v2 min-h-[100dvh] grid place-items-center"><FlowCompanion state="thinking" className="w-48" /></main>
  }

  return (
    <main className="flow-v2 relative min-h-[100dvh] overflow-x-hidden selection:bg-flow-orange selection:text-flow-void">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,.08)_1px,transparent_0)] [background-size:32px_32px]" />
      <div className="pointer-events-none absolute -left-32 top-1/3 h-80 w-80 rounded-full bg-flow-orange/8 blur-[100px]" />
      <div className="pointer-events-none absolute -right-32 top-0 h-96 w-96 rounded-full bg-flow-violet/8 blur-[120px]" />

      <header className="relative z-20 flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 lg:px-14">
        <div className="flex items-center gap-2.5" aria-label="FlowState">
          <span className="grid h-8 w-8 place-items-center rounded-[40%] bg-flow-orange text-sm font-black text-flow-void shadow-[0_4px_0_#8f3600]">F</span>
          <span className="font-black tracking-[-0.03em]">FlowState</span>
        </div>
        <div className="flex items-center gap-2" aria-label={`Step ${step + 1} of 4`}>
          {[0, 1, 2, 3].map(index => <span key={index} className={cn('h-1.5 rounded-full transition-all', index === step ? 'w-9 bg-flow-orange' : index < step ? 'w-4 bg-flow-success' : 'w-4 bg-white/15')} />)}
        </div>
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-4rem)] max-w-[92rem] grid-cols-1 items-center gap-2 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-8 md:grid-cols-[minmax(17rem,.8fr)_minmax(25rem,1.2fr)] md:gap-8 lg:px-14 xl:gap-20">
        <div className="order-1 flex justify-center md:order-none md:justify-start">
          <FlowCompanion state={companionState} className="w-[min(58vw,18rem)] sm:w-[18rem] md:w-full" />
        </div>

        <section className="order-2 min-w-0 pb-2 md:order-none" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={reduceMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -16 }} transition={{ duration: .32 }}>
              {step === 0 && (
                <div>
                  <p className="mb-2 text-sm font-bold uppercase tracking-[.22em] text-flow-orange">Hey. I&apos;m Flow.</p>
                  <h1 className="max-w-3xl text-[clamp(2.35rem,6vw,5.4rem)] font-black leading-[.94] tracking-[-.055em]">What are we trying to survive?</h1>
                  <div className="mt-8 grid grid-cols-2 gap-3 sm:max-w-2xl sm:gap-4">
                    {LEARNER_TYPES.map(({ id, label, note, icon: Icon, angle }, index) => {
                      const selected = profile.learner_type === id
                      return <motion.button key={id} type="button" onClick={() => setProfile(current => ({ ...current, learner_type: id }))}
                        whileTap={reduceMotion ? undefined : { scale: .96, y: 3 }}
                        className={cn('group relative min-h-28 overflow-hidden px-4 py-4 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-flow-orange focus-visible:ring-offset-4 focus-visible:ring-offset-flow-void sm:min-h-32 sm:px-5', angle,
                          selected ? 'bg-flow-orange text-flow-void shadow-[0_7px_0_#8f3600]' : 'bg-flow-raised text-flow-ink shadow-[0_7px_0_#080912] hover:-translate-y-1')}
                        style={{ clipPath: index % 2 ? 'polygon(3% 0,100% 4%,97% 100%,0 95%)' : 'polygon(0 4%,97% 0,100% 95%,4% 100%)' }}
                        aria-pressed={selected}>
                        <Icon className="mb-3 h-6 w-6" aria-hidden="true" />
                        <span className="block text-base font-black sm:text-lg">{label}</span>
                        <span className={cn('mt-1 block text-[11px] font-semibold sm:text-xs', selected ? 'text-flow-void/70' : 'text-flow-muted')}>{note}</span>
                        {selected && <Check className="absolute right-4 top-4 h-5 w-5" aria-hidden="true" />}
                      </motion.button>
                    })}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <p className="mb-2 text-sm font-bold uppercase tracking-[.22em] text-flow-violet">Let&apos;s tune your world</p>
                  <h1 className="text-[clamp(2.15rem,5vw,4.5rem)] font-black leading-none tracking-[-.05em]">What are you studying?</h1>
                  <form onSubmit={submitSubject} className="mt-6 flex max-w-2xl items-end gap-3 border-b-2 border-white/20 pb-2 focus-within:border-flow-orange">
                    <label htmlFor="subject" className="sr-only">Add a subject or topic</label>
                    <input ref={inputRef} id="subject" value={subjectInput} onChange={event => setSubjectInput(event.target.value)} onKeyDown={subjectKeyDown}
                      placeholder="Type a subject, then press Enter" className="min-w-0 flex-1 bg-transparent py-3 text-lg font-bold text-flow-ink outline-none placeholder:text-flow-muted/60" />
                    <button type="submit" aria-label="Add subject" className="mb-1 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-flow-orange text-flow-void shadow-[0_4px_0_#8f3600] transition active:translate-y-1 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Plus /></button>
                  </form>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <AnimatePresence initial={false}>{profile.subjects.map(subject => <motion.button layout initial={{ opacity: 0, scale: .7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .7 }} key={subject} type="button"
                      onClick={() => setProfile(current => ({ ...current, subjects: current.subjects.filter(item => item !== subject) }))}
                      className="group inline-flex items-center gap-2 rounded-full bg-flow-orange px-4 py-2 text-sm font-black text-flow-void shadow-[0_4px_0_#8f3600] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                      {subject}<X className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" /><span className="sr-only">Remove {subject}</span>
                    </motion.button>)}</AnimatePresence>
                    {profile.subjects.length < 4 && suggestions.filter(item => !profile.subjects.includes(item)).slice(0, 4).map(item => <button key={item} type="button" onClick={() => addSubject(item)} className="rounded-full border border-dashed border-white/25 px-3 py-2 text-xs font-bold text-flow-muted hover:border-flow-orange hover:text-flow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-orange">+ {item}</button>)}
                  </div>

                  <h2 className="mt-8 text-xl font-black tracking-tight sm:text-2xl">What&apos;s making it difficult?</h2>
                  <div className="mt-3 flex max-w-3xl flex-wrap gap-2.5">
                    {DIFFICULTIES.map(item => {
                      const selected = profile.difficulties.includes(item.id)
                      return <motion.button whileTap={reduceMotion ? undefined : { scale: .95 }} key={item.id} type="button" aria-pressed={selected}
                        onClick={() => setProfile(current => ({
                          ...current,
                          difficulties: selected
                            ? current.difficulties.filter(value => value !== item.id)
                            : item.id === 'everything'
                              ? ['everything']
                              : [...current.difficulties.filter(value => value !== 'everything'), item.id],
                        }))}
                        className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-flow-orange', selected ? 'bg-flow-violet text-flow-void shadow-[0_4px_0_#493990]' : 'bg-flow-raised text-flow-muted hover:text-flow-ink')}>
                        <span aria-hidden="true" className="font-black">{selected ? '✓' : item.mark}</span>{item.label}
                      </motion.button>
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <p className="mb-2 text-sm font-bold uppercase tracking-[.22em] text-flow-orange">One last thing</p>
                  <h1 className="text-[clamp(2.2rem,5vw,4.8rem)] font-black leading-none tracking-[-.05em]">Pick your first signal.</h1>
                  <p className="mt-4 max-w-xl text-base text-flow-muted sm:text-lg">This is your starter identity—not a shop, not a commitment. Just a small way for FlowState to feel like yours.</p>
                  <div className="mt-8 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
                    {IDENTITIES.map((identity, index) => {
                      const selected = profile.starter_identity === identity.id
                      return <motion.button key={identity.id} type="button" aria-pressed={selected} whileTap={reduceMotion ? undefined : { scale: .94, y: 4 }}
                        onClick={() => setProfile(current => ({ ...current, starter_identity: identity.id }))}
                        className={cn('relative flex aspect-[.9] flex-col items-center justify-center gap-4 bg-flow-raised px-3 outline-none transition focus-visible:ring-2 focus-visible:ring-flow-orange', selected ? 'translate-y-[-5px] shadow-[0_9px_0_#8f3600] ring-2 ring-flow-orange' : 'shadow-[0_7px_0_#080912] hover:-translate-y-1')}
                        style={{ clipPath: index % 2 ? 'polygon(5% 0,100% 5%,94% 100%,0 93%)' : 'polygon(0 6%,94% 0,100% 94%,6% 100%)' }}>
                        <span className={cn('relative block h-16 w-16', identity.shape, identity.accent)}>
                          <span className="absolute left-[28%] top-[38%] h-2 w-2 rounded-full bg-flow-void" /><span className="absolute right-[28%] top-[38%] h-2 w-2 rounded-full bg-flow-void" />
                          <span className="absolute -right-2 -top-2 h-6 w-6 rounded-full border-4 border-flow-raised bg-flow-orange/70" />
                        </span>
                        <span className="font-black">{identity.name}</span>
                        {selected && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-flow-orange text-flow-void"><Check className="h-4 w-4" /></span>}
                      </motion.button>
                    })}
                  </div>
                </div>
              )}

              {step === 3 && (
                <FirstJourneyBuilder
                  initialResourceIds={profile.resource_ids}
                  initialGoal={profile.journey_goal}
                  initialDepth={profile.journey_depth}
                  initialJourneyId={profile.journey_id}
                  onPersist={persist}
                  onFlowState={setBuilderFlowState}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {step < 3 && (
            <div className="mt-8 flex items-center gap-4">
              {step > 0 && <button type="button" disabled={saving} onClick={() => persist({ current_step: step - 1 })} className="px-2 py-3 text-sm font-bold text-flow-muted hover:text-flow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-orange">Back</button>}
              <motion.button type="button" disabled={!canContinue || saving} onClick={continueStep} whileTap={reduceMotion ? undefined : { scale: .97, y: 3 }}
                className="inline-flex min-h-14 items-center gap-3 bg-flow-orange px-7 py-3 text-base font-black text-flow-void shadow-[0_6px_0_#8f3600] transition disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-flow-void">
                {saving ? 'Saving…' : step === 2 ? 'That’s me' : 'Continue'}<ArrowRight className="h-5 w-5" />
              </motion.button>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
