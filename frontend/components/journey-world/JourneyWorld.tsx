'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, BookOpen, ChevronRight, Clock3, Coins, Crown, Flame, Lightbulb, LockKeyhole, Menu, MessageCircle, RefreshCw, ShieldCheck, Swords, Target, X } from 'lucide-react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { authApi, gamificationApi, learningApi } from '@/lib/api'
import FlowCompanion from '@/components/onboarding/FlowCompanion'
import { normalizeForRendering, normalizeReadableMath } from '@/lib/mathFormatting'
import { cn } from '@/lib/utils'
import type { EncounterActivitiesResponse, EncounterActivity, EncounterAttemptResponse, JourneyConceptDetail, JourneyPathDetail, JourneyRoadmapNode, JourneyRoadmapResponse, RewardResponse } from '@/types/journey'

type NodeKind = 'lesson' | 'practice' | 'review' | 'checkpoint' | 'challenge' | 'finale'
type WorldNode = JourneyRoadmapNode & { kind: NodeKind; unitIndex: number; unitTitle: string; displayState: 'locked' | 'available' | 'current' | 'in_progress' | 'completed' | 'mastered' | 'review_due' }

export default function JourneyWorld({ pathId }: { pathId: string }) {
  const qc = useQueryClient()
  const reduceMotion = useReducedMotion()
  const currentRef = useRef<HTMLButtonElement>(null)
  const didAutoPosition = useRef(false)
  const [selected, setSelected] = useState<WorldNode | null>(null)
  const [encounter, setEncounter] = useState<WorldNode | null>(null)
  const [reward, setReward] = useState<RewardResponse | null>(null)
  const [rewardMastery, setRewardMastery] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  const pathQuery = useQuery({ queryKey: ['learning-path', pathId], queryFn: () => learningApi.getPath(pathId).then(r => r.data as JourneyPathDetail) })
  const roadmapQuery = useQuery({ queryKey: ['roadmap', pathId], queryFn: () => learningApi.getRoadmap(pathId).then(r => r.data), enabled: pathQuery.isSuccess })
  const progressionQuery = useQuery({ queryKey: ['progression'], queryFn: () => gamificationApi.getProgress().then(r => r.data) })
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => authApi.me().then(r => r.data) })

  const nodes = useMemo(() => mapWorldNodes(roadmapQuery.data), [roadmapQuery.data])
  const current = nodes.find(node => node.displayState === 'review_due') || nodes.find(node => node.status === 'current') || [...nodes].reverse().find(node => node.status === 'completed')

  useEffect(() => {
    if (!currentRef.current || didAutoPosition.current) return
    didAutoPosition.current = true
    const timer = setTimeout(() => currentRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' }), 300)
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
          return <section key={unit.id} className={cn('relative mb-8 min-h-80 overflow-x-clip border-y border-white/10 px-2 py-10 sm:px-10', zoneAtmosphere(unitIndex))} aria-labelledby={`zone-${unit.id}`}>
            {unitIndex > 0 && <div className="absolute left-1/2 top-0 h-10 w-1 -translate-x-1/2 -translate-y-full bg-gradient-to-b from-flow-success via-flow-orange to-flow-orange" aria-hidden="true" />}
            <div className="relative z-10 mb-8 max-w-lg"><p className="text-xs font-black uppercase tracking-[.28em] text-flow-orange">Zone {unitIndex + 1}</p><h3 id={`zone-${unit.id}`} className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-5xl">{normalizeReadableMath(unit.title)}</h3><p className="mt-2 text-sm font-bold text-flow-muted">{unit.completed_count}/{unit.concept_count} conquered</p></div>
            <div className="relative z-10" style={{ height: routeHeight(unitNodes.length) }}>
              <RouteLine nodes={unitNodes} />
              {unitNodes.map((node, index) => <WorldNodeButton key={node.id} node={node} index={index} marker={marker} isFocus={node.id === current?.id} buttonRef={node.id === current?.id ? currentRef : undefined} onSelect={() => setSelected(node)} />)}
            </div>
          </section>
        })}
      </div>
    </section>

    {selected && !encounter && <NodeSheet node={selected} onClose={() => setSelected(null)} onStart={() => { if (selected.displayState !== 'locked') { setEncounter(selected); setSelected(null) } }} />}
    <AnimatePresence>{encounter && <StudyEncounter node={encounter} onClose={() => setEncounter(null)} onCompleted={async (result, mastery) => { setEncounter(null); setSelected(null); setReward(result); setRewardMastery(mastery); await refresh() }} />}</AnimatePresence>
    <AnimatePresence>{reward && <RewardMoment reward={reward} mastery={rewardMastery} next={nodes.find(node => node.status === 'current')} onClose={() => setReward(null)} />}</AnimatePresence>
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
    <span className="mt-2 max-w-44 text-center text-[11px] font-black uppercase tracking-wide text-flow-muted">{node.kind.replace('_', ' ')}</span>
    {(isFocus || node.displayState === 'review_due') && <span className="mt-1 line-clamp-2 max-w-48 text-center text-xs font-bold leading-tight text-flow-ink">{normalizeReadableMath(node.title)}</span>}
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

function StudyEncounter({ node, onClose, onCompleted }: { node: WorldNode; onClose: () => void; onCompleted: (reward: RewardResponse, mastery: number) => void }) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [results, setResults] = useState<Record<string, EncounterAttemptResponse>>({})
  const [flowAction, setFlowAction] = useState<string | null>(null)
  const conceptQuery = useQuery({ queryKey: ['concept', node.id], queryFn: () => learningApi.getConcept(node.id).then(r => r.data as JourneyConceptDetail) })
  const activitiesQuery = useQuery({ queryKey: ['concept-activities', node.id], queryFn: () => learningApi.getConceptActivities(node.id).then(r => r.data as EncounterActivitiesResponse) })
  const attempt = useMutation({ mutationFn: ({ activity, response }: { activity: EncounterActivity; response: unknown }) => learningApi.submitConceptAttempt(node.id, { activity_id: activity.id, response }).then(r => r.data as EncounterAttemptResponse), onSuccess: (result, variables) => setResults(current => ({ ...current, [variables.activity.id]: result })) })
  const finalEvidence = Object.values(results).filter(item => item.evidence_score !== null).at(-1)?.evidence_score || 0
  const complete = useMutation({ mutationFn: () => node.status === 'completed' ? learningApi.reviewConcept(node.id, finalEvidence) : learningApi.completeConcept(node.id, 0), onSuccess: response => onCompleted(response.data.reward || { xp: 0, flowcoins: 0, level: { previous: 0, current: 0, leveled_up: false }, streak: { current: 0, increased: false }, missions: [], achievements: [] }, response.data.mastery ?? finalEvidence) })
  const concept = conceptQuery.data
  if (conceptQuery.isLoading || activitiesQuery.isLoading) return <WorldMessage title="Flow is opening the encounter…" state="reading" />
  if (!concept || !activitiesQuery.data) return <WorldMessage title="Couldn’t open this concept." action={() => { conceptQuery.refetch(); activitiesQuery.refetch() }} />
  const activities = activitiesQuery.data.activities
  const activity = activities[index]
  const answer = answers[activity.id]
  const result = results[activity.id]
  const isTeaching = ['comparison', 'worked_example'].includes(activity.type)
  const canAdvance = isTeaching || Boolean(result && result.correct !== false)
  const isLast = index === activities.length - 1
  const submit = () => activity && answer !== undefined && String(answer).trim() && attempt.mutate({ activity, response: activity.options ? { choice: answer } : { text: answer } })
  const resetAnswer = (value: unknown) => { setAnswers(current => ({ ...current, [activity.id]: value })); setResults(current => { const next = { ...current }; delete next[activity.id]; return next }) }
  return <motion.div className="fixed inset-0 z-[60] overflow-y-auto overscroll-y-contain bg-flow-void text-flow-ink touch-pan-y" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="flow-v2 mx-auto min-h-[100dvh] max-w-5xl px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8"><header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b border-white/10 bg-flow-void/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8"><button onClick={onClose} aria-label="Leave encounter" className="grid h-11 w-11 place-items-center text-flow-muted focus-visible:ring-2 focus-visible:ring-flow-orange"><X /></button><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.2em] text-flow-orange">{node.unitTitle} · {activity.purpose}</p><h1 className="truncate text-base font-black sm:text-lg">{normalizeReadableMath(concept.title)}</h1></div><span className="text-xs font-black text-flow-muted">{index + 1}/{activities.length}</span></header><div className="mt-3 flex gap-1.5">{activities.map((item, itemIndex) => <span key={item.id} className={cn('h-1 flex-1 transition-colors', itemIndex <= index ? 'bg-flow-orange' : 'bg-white/10')} />)}</div>
    <main className="mx-auto mt-6 grid max-w-4xl gap-5 md:mt-10 md:grid-cols-[minmax(0,1fr)_12rem] md:items-start"><section className="min-w-0"><div className="mb-4 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[.16em]"><span className="text-flow-violet">{activitiesQuery.data.subject_family}</span><span className="text-flow-muted">{activity.difficulty} · ~{Math.max(1, Math.round(activity.estimated_seconds / 60))} min</span></div><ActivityCard activity={activity} answer={answer} result={result} disabled={attempt.isPending} onAnswer={resetAnswer} onSubmit={submit} />
      <AnimatePresence mode="wait">{flowAction && <InlineFlow key={`${activity.id}-${flowAction}`} nodeId={node.id} activity={activity} action={flowAction} answer={answer} result={result} onClose={() => setFlowAction(null)} />}</AnimatePresence>
      <div className="mt-6 flex flex-wrap items-center gap-3"><button disabled={!canAdvance || complete.isPending} onClick={() => isLast ? complete.mutate() : setIndex(value => value + 1)} className="inline-flex min-h-14 items-center gap-2 bg-flow-orange px-7 font-black text-flow-void shadow-[0_6px_0_#8f3600] disabled:opacity-35">{isLast ? complete.isPending ? 'Saving progress…' : node.status === 'completed' ? 'Save Review' : 'Complete Concept' : nextLabel(activity)}<ChevronRight /></button>{index > 0 && <button onClick={() => setIndex(value => value - 1)} className="min-h-12 px-4 font-bold text-flow-muted">Back</button>}</div>{complete.isError && <p role="alert" className="mt-4 text-sm text-rose-300">Couldn’t save progress. Flow hasn’t marked this complete. Try again.</p>}</section>
      <aside className="md:sticky md:top-24"><FlowCompanion state={result?.correct === false ? 'thinking' : activity.purpose === 'reflect' ? 'celebrating' : 'reading'} className="mx-auto hidden w-24 md:block" /><p className="mt-2 hidden text-center text-xs font-bold text-flow-muted md:block">Flow is here when the idea needs another angle.</p><FlowActions result={result} onAction={setFlowAction} /></aside></main></div></motion.div>
}

function ActivityCard({ activity, answer, result, disabled, onAnswer, onSubmit }: { activity: EncounterActivity; answer: unknown; result?: EncounterAttemptResponse; disabled: boolean; onAnswer: (value: unknown) => void; onSubmit: () => void }) {
  const teaching = ['comparison', 'worked_example'].includes(activity.type)
  return <article className="border border-white/10 bg-flow-raised p-5 shadow-[0_12px_40px_rgba(0,0,0,.18)] sm:p-7"><p className="text-[clamp(1.35rem,3.5vw,2.25rem)] font-black leading-tight tracking-[-.035em] text-flow-ink">{normalizeReadableMath(activity.prompt)}</p>{activity.instructions && <p className="mt-3 text-sm text-flow-muted">{activity.instructions}</p>}<SourceProvenance activity={activity} />
    {activity.type === 'comparison' && activity.content?.rows ? <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[34rem] border-collapse text-left text-sm"><thead><tr>{activity.content.columns?.map(column => <th key={column} className="border-b border-flow-violet/40 p-3 text-flow-violet">{column}</th>)}</tr></thead><tbody>{activity.content.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border-b border-white/10 p-3 align-top text-flow-muted first:font-black first:text-flow-ink">{normalizeReadableMath(cell)}</td>)}</tr>)}</tbody></table></div> : teaching ? <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="border-l-4 border-flow-orange bg-flow-void p-4"><p className="text-[10px] font-black uppercase tracking-wider text-flow-orange">Core model</p><MarkdownContent>{activity.content?.idea || activity.explanation || ''}</MarkdownContent></div><div className="border-l-4 border-flow-violet bg-flow-void p-4"><p className="text-[10px] font-black uppercase tracking-wider text-flow-violet">Grounded example</p><MarkdownContent>{activity.content?.example || ''}</MarkdownContent></div></div> : activity.options?.length ? <div className="mt-6 grid gap-3">{activity.options.map((option, optionIndex) => <button key={optionIndex} disabled={Boolean(result)} onClick={() => onAnswer(optionIndex)} aria-pressed={answer === optionIndex} className={cn('min-h-16 border px-4 text-left font-bold transition', answer === optionIndex ? 'border-flow-orange bg-flow-orange/15 text-flow-ink' : 'border-white/10 bg-flow-void hover:border-flow-violet/60', result && answer === optionIndex && result.correct === false && 'border-rose-400 bg-rose-400/10')}>{normalizeReadableMath(option)}</button>)}</div> : <textarea value={String(answer || '')} disabled={Boolean(result)} onChange={event => onAnswer(event.target.value)} rows={5} placeholder="Work it through here…" className="mt-6 w-full resize-y border border-white/15 bg-flow-void p-4 text-base text-flow-ink outline-none focus:border-flow-orange" />}
    {!teaching && (result ? <div className={cn('mt-5 border-l-4 p-4 text-sm', result.correct === false ? 'border-rose-400 bg-rose-400/10' : 'border-flow-success bg-flow-success/10')}><p className="font-black text-flow-ink">{result.correct === false ? 'Not yet — here is the useful clue.' : result.correct === null ? 'Reflection captured.' : 'That holds.'}</p><MarkdownContent>{result.feedback}</MarkdownContent>{result.correct === false && <button onClick={() => onAnswer(undefined)} className="mt-3 font-black text-flow-orange">Try again</button>}</div> : <button disabled={answer === undefined || !String(answer).trim() || disabled} onClick={onSubmit} className="mt-5 min-h-12 bg-flow-violet px-5 font-black text-flow-void disabled:opacity-40">{disabled ? 'Checking…' : 'Check my thinking'}</button>)}
  </article>
}

function FlowActions({ result, onAction }: { result?: EncounterAttemptResponse; onAction: (action: string) => void }) {
  const actions = result?.correct === false ? ['Why was I wrong?', 'Give me a hint', 'Explain another way'] : ['Explain another way', 'Show me an example', 'Quiz me', 'Connect this to my goal']
  return <div className="mt-4 flex gap-2 overflow-x-auto pb-2 md:grid md:overflow-visible">{actions.map(action => <button key={action} onClick={() => onAction(action)} className="min-h-11 shrink-0 border border-white/10 bg-flow-raised px-3 text-left text-xs font-black text-flow-muted hover:border-flow-violet hover:text-flow-violet">{action}</button>)}</div>
}

function InlineFlow({ nodeId, activity, action, answer, result, onClose }: { nodeId: string; activity: EncounterActivity; action: string; answer: unknown; result?: EncounterAttemptResponse; onClose: () => void }) {
  const ask = useQuery({ queryKey: ['inline-flow', nodeId, activity.id, action, result?.attempt_id], queryFn: () => learningApi.askFlowInConcept(nodeId, { action, stage: activity.purpose, activity_id: activity.id, learner_response: answer, correct: result?.correct }).then(response => response.data as { answer: string }) })
  return <motion.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 overflow-hidden border-l-4 border-flow-violet bg-flow-violet/10"><div className="p-4"><button onClick={onClose} aria-label="Close Flow response" className="float-right p-1 text-flow-muted"><X className="h-4 w-4" /></button><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-flow-violet"><Lightbulb className="h-4 w-4" />Flow · {action}</p>{ask.isLoading && <p className="mt-3 text-sm text-flow-muted">Finding the clearest angle…</p>}{ask.data?.answer && <MarkdownContent>{ask.data.answer}</MarkdownContent>}{ask.isError && <p className="mt-3 text-sm text-rose-300">Flow couldn’t respond right now. Your work is still saved.</p>}<Link href={`/ai?concept=${nodeId}`} className="mt-4 inline-flex items-center gap-2 text-xs font-black text-flow-violet"><MessageCircle className="h-4 w-4" />Talk to Flow</Link></div></motion.section>
}

function MarkdownContent({ children }: { children: string }) {
  return <div className="prose prose-invert prose-sm mt-3 max-w-none text-flow-muted prose-headings:text-flow-ink prose-strong:text-flow-ink prose-code:text-flow-violet"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeForRendering(children || '')}</ReactMarkdown></div>
}

function SourceProvenance({ activity }: { activity: EncounterActivity }) {
  const source = activity.grounding
  if (!source?.resource_title && !source?.section && !source?.page) return null
  return <p className="mt-3 text-[10px] font-black uppercase tracking-[.16em] text-flow-violet">From {[source.section, source.page ? `p. ${source.page}` : '', source.resource_title].filter(Boolean).join(' · ')}</p>
}

function nextLabel(activity: EncounterActivity) {
  if (activity.purpose === 'diagnose') return 'See how it works'
  if (activity.purpose === 'learn' || activity.purpose === 'remediate') return 'Try it'
  if (activity.purpose === 'check') return 'Use this understanding'
  return 'Next activity'
}

function FocusMenu({ onClose }: { onClose: () => void }) {
  const links = [['Journey', '/learn'], ['Sources', '/library'], ['Tasks', '/assignments'], ['Collab', '/workspace'], ['Flow', '/ai'], ['You', '/settings'], ['Battle', '/groups']]
  return <motion.div className="fixed inset-0 z-[80] bg-flow-void/95 p-6 text-flow-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="mx-auto max-w-xl"><button onClick={onClose} aria-label="Close focus menu" className="float-right p-3"><X /></button><p className="pt-16 text-xs font-black uppercase tracking-[.22em] text-flow-orange">Focus menu</p><nav className="mt-6 grid gap-2">{links.map(([label, href], index) => <Link key={href} href={href} className={cn('border-b border-white/10 py-4 text-2xl font-black hover:text-flow-orange', index > 3 && 'text-lg text-flow-muted')}>{label}</Link>)}</nav></div></motion.div>
}

function RewardMoment({ reward, mastery, next, onClose }: { reward: RewardResponse; mastery: number; next?: WorldNode; onClose: () => void }) { return <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-flow-void/95 p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="flow-v2"><FlowCompanion state="celebrating" className="mx-auto w-40" /><p className="text-xs font-black uppercase tracking-[.25em] text-flow-success">Concept secured</p><h2 className="mt-2 text-4xl font-black">{mastery}% mastery</h2><p className="mt-3 text-xl font-black">+{reward.xp} XP</p><p className="mt-1 text-lg font-black text-flow-orange">+{reward.flowcoins} FlowCoins</p>{next && <p className="mt-6 text-sm text-flow-muted">Next: {normalizeReadableMath(next.title)}</p>}<button onClick={onClose} className="mt-7 min-h-14 bg-flow-orange px-8 font-black text-flow-void shadow-[0_6px_0_#8f3600]">Return to Journey</button></div></motion.div> }
function WorldMessage({ title, action, state = 'idle' }: { title: string; action?: () => void; state?: 'idle' | 'thinking' | 'reading' }) { return <main className="flow-v2 grid min-h-[100dvh] place-items-center bg-flow-void p-6 text-center text-flow-ink"><div><FlowCompanion state={state} className="mx-auto w-44" /><h1 className="text-3xl font-black">{title}</h1>{action && <button onClick={action} className="mt-6 bg-flow-orange px-6 py-3 font-black text-flow-void">Try again</button>}</div></main> }
function Hud({ icon: Icon, value }: { icon: typeof Flame; value: string }) { return <span className="inline-flex items-center gap-1.5 text-flow-muted"><Icon className="h-4 w-4 text-flow-orange" />{value}</span> }
function stateClass(state: WorldNode['displayState']) { return state === 'locked' ? 'border-white/10 bg-[#111323] text-white/20' : state === 'current' || state === 'available' ? 'border-flow-orange bg-flow-orange/15 text-flow-orange shadow-[0_7px_0_#8f3600,0_0_32px_rgba(255,122,26,.25)]' : state === 'review_due' ? 'border-flow-violet bg-flow-violet/15 text-flow-violet' : state === 'mastered' ? 'border-flow-success bg-flow-success/15 text-flow-success' : state === 'in_progress' ? 'border-flow-orange bg-flow-raised text-flow-ink' : 'border-flow-success/60 bg-flow-success/10 text-flow-success' }
function zoneAtmosphere(index: number) { return ['bg-[radial-gradient(circle_at_20%_20%,rgba(255,122,26,.12),transparent_35%)]','bg-[radial-gradient(circle_at_80%_30%,rgba(165,140,255,.13),transparent_38%)]','bg-[radial-gradient(circle_at_45%_70%,rgba(91,218,156,.10),transparent_40%)]'][index % 3] }
