'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import FlowCompanion from '@/components/onboarding/FlowCompanion'
import { learningApi } from '@/lib/api'

type Challenge = { id: string; objective_id: string; concept_id: string; type: string; prompt: string; objective_type: string; source_title?: string }
type Draft = { index: number; answers: Record<string, string>; key: string; startedAt: number }

export default function JourneyMasteryPage({ params }: { params: { id: string } }) {
  const reduceMotion = useReducedMotion()
  const storageKey = `flow-mastery:${params.id}`
  const [started, setStarted] = useState(false)
  const [draft, setDraft] = useState<Draft>({ index: 0, answers: {}, key: crypto.randomUUID(), startedAt: Date.now() })
  const query = useQuery({ queryKey: ['journey-mastery', params.id], queryFn: () => learningApi.getMasteryChallenge(params.id).then(r => r.data), retry: false })
  const challenges: Challenge[] = query.data?.challenges || []
  const active = challenges[draft.index]
  const submit = useMutation({ mutationFn: () => learningApi.submitMasteryChallenge(params.id, { idempotency_key: draft.key, responses: challenges.map(item => ({ challenge_id: item.id, answer: draft.answers[item.id] || '' })) }).then(r => r.data), onSuccess: () => localStorage.removeItem(storageKey) })
  useEffect(() => { const saved = localStorage.getItem(storageKey); if (saved) { try { setDraft(JSON.parse(saved)); setStarted(true) } catch { localStorage.removeItem(storageKey) } } }, [storageKey])
  useEffect(() => { if (started && !submit.data) localStorage.setItem(storageKey, JSON.stringify(draft)) }, [draft, started, storageKey, submit.data])
  const answered = useMemo(() => challenges.filter(item => (draft.answers[item.id] || '').trim()).length, [challenges, draft.answers])

  if (query.isLoading) return <MasteryShell><FlowCompanion state="thinking" className="mx-auto w-28" /><p className="mt-4 text-center font-black">Building your mixed challenge…</p></MasteryShell>
  if (query.isError || query.data?.eligible === false) return <MasteryShell><FlowCompanion state="encouraging" className="mx-auto w-28" /><h1 className="mt-5 text-center text-3xl font-black">Finish the Journey objectives first.</h1><Link href={`/learn/${params.id}`} className="flow-primary-button mx-auto mt-7 w-fit">Return to Journey</Link></MasteryShell>

  if (submit.data) {
    const weakConcept = submit.data.review_concept_ids?.[0]
    const strongest = [...(submit.data.objective_results || [])].sort((a: any, b: any) => b.score - a.score)[0]
    return <MasteryShell><motion.section initial={{ opacity: 0, scale: reduceMotion ? 1 : .96 }} animate={{ opacity: 1, scale: 1 }} className="text-center"><FlowCompanion state={submit.data.passed ? 'celebrating' : 'encouraging'} className="mx-auto w-36" /><p className="flow-eyebrow mt-4">{submit.data.passed ? 'Journey mastered' : 'Focused review recommended'}</p><h1 className="mt-3 text-5xl font-black">{submit.data.score}%</h1><p className="mx-auto mt-4 max-w-xl text-flow-muted">{submit.data.passed ? 'Your evidence holds across the Journey.' : `${submit.data.review_objective_ids.length} objectives need another focused pass. No completion or rewards were fabricated.`}</p>{strongest && <p className="mt-3 text-sm font-bold text-flow-success">Strongest demonstrated objective: {strongest.score}%</p>}<div className="mt-8 flex flex-wrap justify-center gap-3">{weakConcept && <Link href={`/learn/${params.id}?concept=${weakConcept}&review=mastery`} className="flow-primary-button">Review weak areas</Link>}<Link href="/library/flashcards?mode=due" className="min-h-12 rounded-xl px-5 py-3 font-black text-flow-violet">Review flashcards</Link><Link href={`/learn/${params.id}`} className="min-h-12 rounded-xl px-5 py-3 font-black">Finish</Link></div></motion.section></MasteryShell>
  }

  if (!started) return <MasteryShell><section className="text-center"><FlowCompanion state="encouraging" className="mx-auto w-32" /><p className="flow-eyebrow mt-4">Learning path complete</p><h1 className="mt-3 text-[clamp(2rem,6vw,3.5rem)] font-black leading-none">Now prove what you know.</h1><p className="mx-auto mt-4 max-w-xl leading-7 text-flow-muted">{challenges.length} objective-grounded challenges · about {query.data.estimated_minutes} minutes. Flow will not coach or reveal answers during Mastery.</p><button onClick={() => setStarted(true)} className="flow-primary-button mx-auto mt-8">Start Mastery Challenge <ArrowRight className="h-4 w-4" /></button><Link href={`/learn/${params.id}`} className="mx-auto mt-4 block min-h-11 py-3 text-sm font-black text-flow-muted">Not now</Link></section></MasteryShell>

  return <MasteryShell><Link href={`/learn/${params.id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-flow-muted"><ArrowLeft className="h-4 w-4" />Save and leave</Link><header className="mt-5"><p className="flow-eyebrow">Master your Journey</p><div className="mt-4 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-flow-orange" animate={{ width: `${((draft.index + 1) / challenges.length) * 100}%` }} /></div><span className="text-xs font-black text-flow-muted">{draft.index + 1}/{challenges.length}</span></div></header>{active && <motion.section key={active.id} initial={{ opacity: 0, x: reduceMotion ? 0 : 20 }} animate={{ opacity: 1, x: 0 }} className="mt-8 rounded-3xl border border-white/10 bg-flow-raised p-5 sm:p-8"><div className="flex items-center gap-3"><FlowCompanion state="thinking" className="w-16" /><div><p className="text-xs font-black uppercase tracking-[.15em] text-flow-violet">Challenge {draft.index + 1}</p><p className="text-xs text-flow-muted">No hints during Mastery</p></div></div><h2 className="mt-6 text-xl font-black leading-snug sm:text-2xl">{active.prompt}</h2>{active.source_title && <p className="mt-2 text-xs font-bold text-flow-violet">From {active.source_title}</p>}<label className="mt-6 block text-sm font-black" htmlFor="mastery-answer">Your answer</label><textarea id="mastery-answer" rows={6} value={draft.answers[active.id] || ''} onChange={event => setDraft(current => ({ ...current, answers: { ...current.answers, [active.id]: event.target.value } }))} className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-flow-void p-4 outline-none focus:border-flow-orange" /><div className="mt-5 flex items-center justify-between gap-3"><button disabled={draft.index === 0} onClick={() => setDraft(current => ({ ...current, index: current.index - 1 }))} className="min-h-12 px-4 font-black disabled:opacity-30">Back</button>{draft.index < challenges.length - 1 ? <button onClick={() => setDraft(current => ({ ...current, index: current.index + 1 }))} className="flow-primary-button">Next <ArrowRight className="h-4 w-4" /></button> : <button onClick={() => submit.mutate()} disabled={submit.isPending || answered === 0} className="flow-primary-button">{submit.isPending ? <RotateCcw className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Check className="h-4 w-4" />} Finish challenge</button>}</div></motion.section>}</MasteryShell>
}

function MasteryShell({ children }: { children: React.ReactNode }) {
  return <main className="flow-atmosphere min-h-[calc(100dvh-4rem)] px-4 py-6 text-flow-ink sm:px-8"><div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-flow-raised/80 p-5 shadow-2xl sm:p-9">{children}</div></main>
}
