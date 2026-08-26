'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, BookOpen, ChevronRight, Clock3, Coins, Crown, Flame, LockKeyhole, Menu, RefreshCw, Send, ShieldCheck, Swords, Target, X } from 'lucide-react'
import Link from 'next/link'
import { authApi, gamificationApi, learningApi } from '@/lib/api'
import FlowCompanion from '@/components/onboarding/FlowCompanion'
import { normalizeReadableMath } from '@/lib/mathFormatting'
import { cn } from '@/lib/utils'
import type { EncounterActivitiesResponse, EncounterActivity, EncounterAttemptResponse, JourneyConceptDetail, JourneyPathDetail, JourneyRoadmapNode, JourneyRoadmapResponse, RewardResponse } from '@/types/journey'

type NodeKind = 'lesson' | 'practice' | 'review' | 'checkpoint' | 'challenge' | 'finale'
type WorldNode = JourneyRoadmapNode & { kind: NodeKind; unitIndex: number; unitTitle: string; displayState: 'locked' | 'available' | 'current' | 'in_progress' | 'completed' | 'mastered' | 'review_due' }

export default function JourneyWorld({ pathId }: { pathId: string }) {
  const qc = useQueryClient()
  const reduceMotion = useReducedMotion()
  const currentRef = useRef<HTMLButtonElement>(null)
  const [selected, setSelected] = useState<WorldNode | null>(null)
  const [encounter, setEncounter] = useState<WorldNode | null>(null)
  const [reward, setReward] = useState<RewardResponse | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const pathQuery = useQuery({ queryKey: ['learning-path', pathId], queryFn: () => learningApi.getPath(pathId).then(r => r.data as JourneyPathDetail) })
  const roadmapQuery = useQuery({ queryKey: ['roadmap', pathId], queryFn: () => learningApi.getRoadmap(pathId).then(r => r.data), enabled: pathQuery.isSuccess })
  const progressionQuery = useQuery({ queryKey: ['progression'], queryFn: () => gamificationApi.getProgress().then(r => r.data) })
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => authApi.me().then(r => r.data) })

  const nodes = useMemo(() => mapWorldNodes(roadmapQuery.data), [roadmapQuery.data])
  const current = nodes.find(node => node.displayState === 'review_due') || nodes.find(node => node.status === 'current') || [...nodes].reverse().find(node => node.status === 'completed')

  useEffect(() => {
    if (!currentRef.current) return
    const timer = setTimeout(() => currentRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }), 300)
    return () => clearTimeout(timer)
  }, [roadmapQuery.data, reduceMotion])

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['learning-path', pathId] }),
      qc.invalidateQueries({ queryKey: ['roadmap', pathId] }),
      qc.invalidateQueries({ queryKey: ['path-analytics', pathId] }),
      qc.invalidateQueries({ queryKey: ['progression'] }),
    ])
  }

  if (pathQuery.isLoading || roadmapQuery.isLoading) return <WorldMessage title="Finding your place…" state="thinking" />
  if (pathQuery.isError || roadmapQuery.isError) return <WorldMessage title="Couldn’t load this Journey." action={() => { pathQuery.refetch(); roadmapQuery.refetch() }} />
  if (!pathQuery.data || !roadmapQuery.data || !nodes.length) return <WorldMessage title="This Journey has no route yet." />

  const profile = profileQuery.data?.onboarding_status?.onboarding_v2
  const marker = String(profile?.starter_identity || 'ember')
  const progress = pathQuery.data.total_concepts ? Math.round(pathQuery.data.concepts_completed * 100 / pathQuery.data.total_concepts) : 0

  return <main className="flow-v2 relative min-h-[100dvh] overflow-x-hidden bg-flow-void text-flow-ink selection:bg-flow-orange selection:text-flow-void">
    <div className="pointer-events-none fixed inset-0 opacity-50 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,.08)_1px,transparent_0)] [background-size:30px_30px]" />
    <header className="sticky top-0 z-40 border-b border-white/10 bg-flow-void/90 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-7">
      <div className="mx-auto flex max-w-6xl items-center gap-4">
        <Link href="/learn" aria-label="Back to Journeys" className="grid h-10 w-10 shrink-0 place-items-center text-flow-muted hover:text-flow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-orange"><ArrowLeft /></Link>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.22em] text-flow-orange">Journey World</p><h1 className="truncate text-lg font-black sm:text-xl">{normalizeReadableMath(pathQuery.data.title)}</h1></div>
        <div className="hidden items-center gap-4 text-xs font-black sm:flex">
          <Hud icon={Flame} value={`${progressionQuery.data?.current_streak || 0}d`} />
          <Hud icon={Crown} value={progressionQuery.data?.level?.rank || 'Freshman'} />
          <Hud icon={Coins} value={String(progressionQuery.data?.flowcoins || 0)} />
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-[42%] bg-flow-orange text-xs font-black text-flow-void shadow-[0_4px_0_#8f3600]" title={`${marker} learner marker`}>{marker.slice(0, 1).toUpperCase()}</div>
        <button onClick={() => setMenuOpen(true)} aria-label="Open focus menu" className="grid h-10 w-10 place-items-center text-flow-muted hover:text-flow-ink focus-visible:ring-2 focus-visible:ring-flow-orange"><Menu /></button>
      </div>
      <div className="mx-auto mt-3 flex max-w-6xl items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden bg-white/10"><motion.div className="h-full bg-flow-orange" animate={{ width: `${progress}%` }} /></div><span className="text-[10px] font-black text-flow-muted">{progress}%</span></div>
    </header>

    <section className="relative mx-auto max-w-6xl px-3 pb-[max(6rem,env(safe-area-inset-bottom))] pt-8 sm:px-8">
      <div className="mb-7 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-3 pb-5 text-sm sm:px-10"><span className="font-black uppercase tracking-[.18em] text-flow-violet">{pathQuery.data.depth} route</span><span className="text-flow-muted">Goal: {normalizeReadableMath(pathQuery.data.goal)}</span><span className="text-flow-muted">{current?.status === 'current' ? `${normalizeReadableMath(current.title)} is next.` : 'Your place is saved.'}</span></div>
      <div className="relative mx-auto max-w-4xl" role="list" aria-label="Journey concepts in progression order">
        {roadmapQuery.data.units.map((unit, unitIndex) => {
          const unitNodes = nodes.filter(node => node.unit_id === unit.id)
          return <section key={unit.id} className={cn('relative mb-12 min-h-80 overflow-hidden border-y border-white/10 px-2 py-10 sm:px-10', zoneAtmosphere(unitIndex))} aria-labelledby={`zone-${unit.id}`}>
            <div className="relative z-10 mb-8 max-w-lg"><p className="text-xs font-black uppercase tracking-[.28em] text-flow-orange">Zone {unitIndex + 1}</p><h3 id={`zone-${unit.id}`} className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-5xl">{normalizeReadableMath(unit.title)}</h3><p className="mt-2 text-sm font-bold text-flow-muted">{unit.completed_count}/{unit.concept_count} conquered</p></div>
            <div className="relative z-10" style={{ height: routeHeight(unitNodes.length) }}>
              <RouteLine nodes={unitNodes} />
              {unitNodes.map((node, index) => <WorldNodeButton key={node.id} node={node} index={index} marker={marker} isFocus={node.id === current?.id} buttonRef={node.id === current?.id ? currentRef : undefined} onSelect={() => setSelected(node)} />)}
            </div>
          </section>
        })}
      </div>
    </section>

    <AnimatePresence>{selected && !encounter && <NodeSheet node={selected} onClose={() => setSelected(null)} onStart={() => { if (selected.displayState !== 'locked') setEncounter(selected) }} />}</AnimatePresence>
    <AnimatePresence>{encounter && <StudyEncounter node={encounter} onClose={() => setEncounter(null)} onCompleted={async result => { setEncounter(null); setSelected(null); setReward(result); await refresh() }} />}</AnimatePresence>
    <AnimatePresence>{reward && <RewardMoment reward={reward} next={nodes.find(node => node.status === 'current')} onClose={() => setReward(null)} />}</AnimatePresence>
    <AnimatePresence>{menuOpen && <FocusMenu onClose={() => setMenuOpen(false)} />}</AnimatePresence>
  </main>
}

function mapWorldNodes(roadmap?: JourneyRoadmapResponse): WorldNode[] {
  if (!roadmap) return []
  return roadmap.nodes.map((node, index) => {
    const unitIndex = Math.max(0, roadmap.units.findIndex(unit => unit.id === node.unit_id))
    const siblings = roadmap.nodes.filter(item => item.unit_id === node.unit_id)
    const inUnit = siblings.findIndex(item => item.id === node.id)
    const kind: NodeKind = node.reviews_due ? 'review' : inUnit === siblings.length - 1 ? 'finale' : node.difficulty === 'hard' ? 'challenge' : index > 0 && index % 4 === 0 ? 'checkpoint' : index > 0 && index % 3 === 0 ? 'practice' : 'lesson'
    const displayState: WorldNode['displayState'] = node.reviews_due ? 'review_due' : node.status === 'locked' ? 'locked' : node.status === 'current' && node.mastery > 0 ? 'in_progress' : node.status === 'current' ? 'current' : node.mastery >= 85 ? 'mastered' : 'completed'
    return { ...node, kind, unitIndex, unitTitle: roadmap.units[unitIndex]?.title || `Zone ${unitIndex + 1}`, displayState }
  })
}

const ICONS = { lesson: BookOpen, practice: Target, review: RefreshCw, checkpoint: ShieldCheck, challenge: Swords, finale: Crown }
function WorldNodeButton({ node, index, marker, isFocus, onSelect, buttonRef }: { node: WorldNode; index: number; marker: string; isFocus: boolean; onSelect: () => void; buttonRef?: React.RefObject<HTMLButtonElement> }) {
  const Icon = ICONS[node.kind]
  const point = routePoint(index)
  return <motion.button ref={buttonRef} role="listitem" initial={{ opacity: 0, scale: .75 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, margin: '-40px' }} onClick={onSelect} aria-label={`${normalizeReadableMath(node.title)}, ${node.kind}, ${node.displayState}`} style={{ left: `${point.x}%`, top: point.y }} className="group absolute z-10 grid min-h-20 w-[42%] min-w-32 max-w-48 -translate-x-1/2 place-items-center outline-none focus-visible:ring-2 focus-visible:ring-flow-orange">
    {isFocus && <FlowCompanion state="idle" className="pointer-events-none absolute -right-12 -top-12 w-20" label="Flow at your current position" />}
    {isFocus && <span className="absolute -left-3 -top-3 z-20 grid h-8 w-8 place-items-center rounded-[42%] bg-flow-orange text-[10px] font-black text-flow-void shadow-[0_3px_0_#8f3600]" title={`${marker} is here`}>{marker.slice(0, 1).toUpperCase()}</span>}
    <span className={cn('grid h-16 w-16 place-items-center border-4 shadow-[0_7px_0_#050611] transition group-hover:-translate-y-1 sm:h-20 sm:w-20', node.kind === 'lesson' && 'rounded-[42%]', node.kind === 'practice' && 'rotate-45', node.kind === 'review' && 'rounded-full border-dashed', node.kind === 'checkpoint' && '[clip-path:polygon(50%_0,100%_24%,88%_100%,12%_100%,0_24%)]', node.kind === 'challenge' && 'rotate-3 [clip-path:polygon(10%_0,100%_12%,88%_100%,0_86%)]', node.kind === 'finale' && 'h-20 w-20 rounded-full sm:h-24 sm:w-24', stateClass(node.displayState))}><Icon className={cn('h-7 w-7', node.kind === 'practice' && '-rotate-45')} />{node.displayState === 'locked' && <LockKeyhole className="absolute h-5 w-5" />}</span>
    <span className="mt-2 max-w-40 text-center text-[11px] font-black uppercase tracking-wide text-flow-muted">{node.kind.replace('_', ' ')}</span>
    {node.displayState === 'current' && <span className="mt-1 text-xs font-black text-flow-orange">CURRENT</span>}
    {node.displayState === 'review_due' && <span className="mt-1 text-xs font-black text-flow-violet">REVIEW READY</span>}
  </motion.button>
}

function routePoint(index: number) { return { x: [22, 62, 38, 72, 46][index % 5], y: 22 + index * 126 } }
function routeHeight(count: number) { return Math.max(190, 128 * count + 16) }
function routePath(count: number) {
  if (count < 2) return ''
  return Array.from({ length: count }, (_, index) => routePoint(index)).map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
}
function RouteLine({ nodes }: { nodes: WorldNode[] }) {
  const reached = Math.max(1, nodes.findIndex(node => ['current', 'review_due'].includes(node.displayState)) + 1 || nodes.filter(node => ['completed', 'mastered'].includes(node.displayState)).length)
  const ratio = nodes.length > 1 ? Math.min(1, Math.max(0, (reached - 1) / (nodes.length - 1))) : 0
  return <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 100 ${routeHeight(nodes.length)}`} preserveAspectRatio="none" aria-hidden="true"><path d={routePath(nodes.length)} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2" vectorEffect="non-scaling-stroke" /><motion.path d={routePath(nodes.length)} fill="none" stroke="rgb(255 122 26)" strokeWidth="4" strokeLinecap="round" pathLength="1" vectorEffect="non-scaling-stroke" initial={{ strokeDasharray: '0 1' }} animate={{ strokeDasharray: `${ratio} 1` }} /></svg>
}

function NodeSheet({ node, onClose, onStart }: { node: WorldNode; onClose: () => void; onStart: () => void }) {
  const action = node.displayState === 'locked' ? 'Complete the previous node first' : node.displayState === 'review_due' ? 'Reinforce' : node.status === 'completed' ? 'Review again' : 'Start'
  return <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.section role="dialog" aria-modal="true" aria-labelledby="node-title" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} onClick={event => event.stopPropagation()} className="flow-v2 w-full max-w-xl border-t-4 border-flow-orange bg-flow-raised p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-flow-ink shadow-2xl sm:border-4">
    <button onClick={onClose} aria-label="Close" className="float-right p-2 text-flow-muted focus-visible:ring-2 focus-visible:ring-flow-orange"><X /></button><p className="text-xs font-black uppercase tracking-[.22em] text-flow-orange">{node.unitTitle} · {node.kind}</p><h2 id="node-title" className="mt-3 pr-8 text-3xl font-black tracking-[-.04em]">{normalizeReadableMath(node.title)}</h2><div className="mt-5 flex flex-wrap gap-4 text-xs font-bold text-flow-muted"><span><Clock3 className="mr-1 inline h-4 w-4" />{node.estimated_minutes} min</span><span>{node.difficulty}</span><span>{node.mastery}% mastery</span><span>Potential 25 XP</span></div><p className="mt-5 text-sm text-flow-muted">{node.displayState === 'locked' ? 'The route opens when its prerequisite is complete.' : 'Flow will guide you through one focused encounter grounded in your material.'}</p><button disabled={node.displayState === 'locked'} onClick={onStart} className="mt-7 min-h-14 w-full bg-flow-orange px-6 font-black text-flow-void shadow-[0_6px_0_#8f3600] disabled:bg-white/10 disabled:text-flow-muted disabled:shadow-none">{action}</button>
  </motion.section></motion.div>
}

function StudyEncounter({ node, onClose, onCompleted }: { node: WorldNode; onClose: () => void; onCompleted: (reward: RewardResponse) => void }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [results, setResults] = useState<Record<string, EncounterAttemptResponse>>({})
  const [flowOpen, setFlowOpen] = useState(false)
  const conceptQuery = useQuery({ queryKey: ['concept', node.id], queryFn: () => learningApi.getConcept(node.id).then(r => r.data as JourneyConceptDetail) })
  const activitiesQuery = useQuery({ queryKey: ['concept-activities', node.id], queryFn: () => learningApi.getConceptActivities(node.id).then(r => r.data as EncounterActivitiesResponse) })
  const attempt = useMutation({ mutationFn: ({ activity, response }: { activity: EncounterActivity; response: unknown }) => learningApi.submitConceptAttempt(node.id, { activity_id: activity.id, response }).then(r => r.data as EncounterAttemptResponse), onSuccess: (result, variables) => setResults(current => ({ ...current, [variables.activity.stage]: result })) })
  const complete = useMutation({ mutationFn: () => node.status === 'completed' ? learningApi.reviewConcept(node.id, results.reflect?.score || results.check?.score || 0) : learningApi.completeConcept(node.id, 0), onSuccess: response => onCompleted(response.data.reward || { xp: 0, flowcoins: 0, level: { previous: 0, current: 0, leveled_up: false }, streak: { current: 0, increased: false }, missions: [], achievements: [] }) })
  const concept = conceptQuery.data
  const stages = ['Hook', 'Learn', 'Interact', 'Check', 'Reflect']
  if (conceptQuery.isLoading || activitiesQuery.isLoading) return <WorldMessage title="Flow is opening the encounter…" state="reading" />
  if (!concept || !activitiesQuery.data) return <WorldMessage title="Couldn’t open this concept." action={() => { conceptQuery.refetch(); activitiesQuery.refetch() }} />
  const source = [concept.source_resource_title, concept.source_section, concept.source_page ? `page ${concept.source_page}` : ''].filter(Boolean).join(' · ')
  const activity = activitiesQuery.data.activities.find(item => item.stage === stages[step].toLowerCase())
  const answer = activity ? answers[activity.id] : undefined
  const result = results[stages[step].toLowerCase()]
  const canContinue = step === 1 || Boolean(result && result.correct !== false)
  const submit = () => activity && answer !== undefined && String(answer).trim() && attempt.mutate({ activity, response: activity.options ? { choice: answer } : { text: answer } })
  return <motion.div className="fixed inset-0 z-[60] overflow-y-auto bg-flow-void text-flow-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="flow-v2 mx-auto min-h-[100dvh] max-w-4xl px-5 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[.25em] text-flow-orange">{stages[step]}</p><button onClick={onClose} aria-label="Leave encounter" className="p-3 text-flow-muted focus-visible:ring-2 focus-visible:ring-flow-orange"><X /></button></div><div className="mt-3 flex gap-2">{stages.map((_, index) => <span key={index} className={cn('h-1 flex-1', index <= step ? 'bg-flow-orange' : 'bg-white/10')} />)}</div>
    <div className="mt-10 grid gap-8 md:grid-cols-[8rem_1fr]"><FlowCompanion state={step === 4 ? 'celebrating' : 'reading'} className="mx-auto w-28 md:w-full" /><div><h1 className="text-[clamp(2.25rem,6vw,5rem)] font-black leading-[.92] tracking-[-.055em]">{normalizeReadableMath(concept.title)}</h1>{source && <p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-flow-violet">From your material · {normalizeReadableMath(source)}</p>}
      <div className="mt-8 min-h-64 border-y border-white/10 py-7 text-base leading-relaxed text-flow-muted sm:text-lg">
        {step === 1 ? <LearnCanvas concept={concept} subject={activitiesQuery.data.subject_family} /> : activity ? <ActivityCard activity={activity} answer={answer} result={result} disabled={attempt.isPending} onAnswer={value => { setAnswers(current => ({ ...current, [activity.id]: value })); setResults(current => { const next = { ...current }; delete next[activity.stage]; return next }) }} onSubmit={submit} /> : <p>Flow could not prepare this activity.</p>}
      </div>
      <div className="mt-7 flex flex-wrap gap-3"><button disabled={!canContinue || complete.isPending} onClick={() => step < 4 ? setStep(step + 1) : complete.mutate()} className="inline-flex min-h-14 items-center gap-2 bg-flow-orange px-7 font-black text-flow-void shadow-[0_6px_0_#8f3600] disabled:opacity-40">{step === 4 ? complete.isPending ? 'Saving progress…' : node.status === 'completed' ? 'Save Review' : 'Complete Encounter' : 'Continue'}<ChevronRight /></button><button onClick={() => setFlowOpen(true)} className="min-h-14 border border-flow-violet/50 px-5 font-black text-flow-violet">Ask Flow</button></div>{complete.isError && <p role="alert" className="mt-4 text-sm text-rose-300">Couldn’t save progress. Flow hasn’t marked this complete. Try again.</p>}</div></div></div>
    <AnimatePresence>{flowOpen && <FlowHelp nodeId={node.id} stage={stages[step]} onClose={() => setFlowOpen(false)} />}</AnimatePresence>
  </motion.div>
}

function LearnCanvas({ concept, subject }: { concept: JourneyConceptDetail; subject: string }) {
  const ideas = concept.key_definitions?.slice(0, 3) || []
  return <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-flow-orange">{subject} lens</p><p className="mt-3 text-flow-ink">{normalizeReadableMath(concept.summary || concept.description || 'This idea connects the next part of your route.')}</p><div className="mt-6 grid gap-3 sm:grid-cols-3">{ideas.map((item, index) => <div key={index} className="border border-white/10 bg-white/[.04] p-4"><strong className="block text-sm text-flow-violet">{normalizeReadableMath(item.term || item.name || `Key idea ${index + 1}`)}</strong><span className="mt-2 block text-sm">{normalizeReadableMath(item.definition || item.value || '')}</span></div>)}</div>{!ideas.length && <div className="mt-5 border-l-4 border-flow-violet pl-4 text-sm">Trace this idea back to the cited source, then test it in the next interaction.</div>}</div>
}

function ActivityCard({ activity, answer, result, disabled, onAnswer, onSubmit }: { activity: EncounterActivity; answer: unknown; result?: EncounterAttemptResponse; disabled: boolean; onAnswer: (value: unknown) => void; onSubmit: () => void }) {
  return <div><p className="font-bold text-flow-ink">{normalizeReadableMath(activity.prompt)}</p>{activity.options?.length ? <div className="mt-5 grid gap-3">{activity.options.map((option, index) => <button key={index} onClick={() => onAnswer(index)} aria-pressed={answer === index} className={cn('min-h-14 border px-4 text-left font-bold', answer === index ? 'border-flow-orange bg-flow-orange/15 text-flow-ink' : 'border-white/10 bg-white/[.04]')}>{normalizeReadableMath(option)}</button>)}</div> : <textarea value={String(answer || '')} onChange={event => onAnswer(event.target.value)} rows={4} placeholder="Write your thinking here…" className="mt-5 w-full resize-none border border-white/15 bg-white/[.04] p-4 text-flow-ink outline-none focus:border-flow-orange" />}{result ? <div className={cn('mt-5 border-l-4 p-4 text-sm', result.correct === false ? 'border-rose-400 bg-rose-400/10' : 'border-flow-success bg-flow-success/10')}><p className="font-black text-flow-ink">{result.correct === false ? 'Try that connection again.' : 'Evidence captured.'}</p><p className="mt-1">{result.feedback}</p>{result.correct === false && <button onClick={() => onAnswer(undefined)} className="mt-3 font-black text-flow-orange">Retry</button>}</div> : <button disabled={answer === undefined || !String(answer).trim() || disabled} onClick={onSubmit} className="mt-5 min-h-12 bg-flow-violet px-5 font-black text-flow-void disabled:opacity-40">{disabled ? 'Checking…' : 'Check my thinking'}</button>}</div>
}

function FlowHelp({ nodeId, stage, onClose }: { nodeId: string; stage: string; onClose: () => void }) {
  const [question, setQuestion] = useState('Explain this another way')
  const ask = useMutation({ mutationFn: () => learningApi.askFlowInConcept(nodeId, { question, stage }).then(r => r.data as { answer: string }) })
  return <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed inset-y-0 right-0 z-[80] w-full max-w-md overflow-y-auto border-l border-flow-violet/40 bg-flow-raised p-6 shadow-2xl"><button onClick={onClose} aria-label="Close Flow help" className="float-right p-2"><X /></button><p className="text-xs font-black uppercase tracking-[.2em] text-flow-violet">Flow · {stage}</p><h2 className="mt-3 text-3xl font-black">What feels stuck?</h2><div className="mt-6 flex flex-wrap gap-2">{['Explain this another way', 'Give me a hint', 'Connect this to my goal'].map(item => <button key={item} onClick={() => setQuestion(item)} className="border border-white/10 px-3 py-2 text-sm font-bold">{item}</button>)}</div><textarea value={question} onChange={event => setQuestion(event.target.value)} rows={4} className="mt-5 w-full border border-white/15 bg-flow-void p-4 outline-none focus:border-flow-violet" /><button onClick={() => ask.mutate()} disabled={!question.trim() || ask.isPending} className="mt-3 inline-flex min-h-12 items-center gap-2 bg-flow-violet px-5 font-black text-flow-void disabled:opacity-40"><Send className="h-4 w-4" />{ask.isPending ? 'Flow is thinking…' : 'Ask Flow'}</button>{ask.data?.answer && <div className="mt-6 border-l-4 border-flow-violet bg-flow-void p-4 text-sm leading-relaxed text-flow-muted">{normalizeReadableMath(ask.data.answer)}</div>}{ask.isError && <p className="mt-4 text-sm text-rose-300">Flow couldn’t answer right now. Your encounter is still safe.</p>}</motion.aside>
}

function FocusMenu({ onClose }: { onClose: () => void }) {
  const links = [['Journey', '/learn'], ['Sources', '/library'], ['Tasks', '/assignments'], ['Collab', '/workspace'], ['Flow', '/ai'], ['You', '/settings'], ['Battle', '/groups']]
  return <motion.div className="fixed inset-0 z-[80] bg-flow-void/95 p-6 text-flow-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="mx-auto max-w-xl"><button onClick={onClose} aria-label="Close focus menu" className="float-right p-3"><X /></button><p className="pt-16 text-xs font-black uppercase tracking-[.22em] text-flow-orange">Focus menu</p><nav className="mt-6 grid gap-2">{links.map(([label, href], index) => <Link key={href} href={href} className={cn('border-b border-white/10 py-4 text-2xl font-black hover:text-flow-orange', index > 3 && 'text-lg text-flow-muted')}>{label}</Link>)}</nav></div></motion.div>
}

function RewardMoment({ reward, next, onClose }: { reward: RewardResponse; next?: WorldNode; onClose: () => void }) { return <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-flow-void/95 p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="flow-v2"><FlowCompanion state="celebrating" className="mx-auto w-40" /><p className="text-xs font-black uppercase tracking-[.25em] text-flow-success">Concept secured</p><h2 className="mt-2 text-5xl font-black">+{reward.xp} XP</h2><p className="mt-2 text-xl font-black text-flow-orange">+{reward.flowcoins} FlowCoins</p>{next && <p className="mt-6 text-sm text-flow-muted">Next: {normalizeReadableMath(next.title)}</p>}<button onClick={onClose} className="mt-7 min-h-14 bg-flow-orange px-8 font-black text-flow-void shadow-[0_6px_0_#8f3600]">Continue Journey</button></div></motion.div> }
function WorldMessage({ title, action, state = 'idle' }: { title: string; action?: () => void; state?: 'idle' | 'thinking' | 'reading' }) { return <main className="flow-v2 grid min-h-[100dvh] place-items-center bg-flow-void p-6 text-center text-flow-ink"><div><FlowCompanion state={state} className="mx-auto w-44" /><h1 className="text-3xl font-black">{title}</h1>{action && <button onClick={action} className="mt-6 bg-flow-orange px-6 py-3 font-black text-flow-void">Try again</button>}</div></main> }
function Hud({ icon: Icon, value }: { icon: typeof Flame; value: string }) { return <span className="inline-flex items-center gap-1.5 text-flow-muted"><Icon className="h-4 w-4 text-flow-orange" />{value}</span> }
function stateClass(state: WorldNode['displayState']) { return state === 'locked' ? 'border-white/10 bg-[#111323] text-white/20' : state === 'current' || state === 'available' ? 'border-flow-orange bg-flow-orange/15 text-flow-orange shadow-[0_7px_0_#8f3600,0_0_32px_rgba(255,122,26,.25)]' : state === 'review_due' ? 'border-flow-violet bg-flow-violet/15 text-flow-violet' : state === 'mastered' ? 'border-flow-success bg-flow-success/15 text-flow-success' : state === 'in_progress' ? 'border-flow-orange bg-flow-raised text-flow-ink' : 'border-flow-success/60 bg-flow-success/10 text-flow-success' }
function zoneAtmosphere(index: number) { return ['bg-[radial-gradient(circle_at_20%_20%,rgba(255,122,26,.12),transparent_35%)]','bg-[radial-gradient(circle_at_80%_30%,rgba(165,140,255,.13),transparent_38%)]','bg-[radial-gradient(circle_at_45%_70%,rgba(91,218,156,.10),transparent_40%)]'][index % 3] }
function mobilePath(count: number) { const height = Math.max(300, count * 100); return `M 90 20 C 20 ${height * .2}, 90 ${height * .35}, 45 ${height * .5} S 80 ${height * .8}, 50 ${height - 20}` }
