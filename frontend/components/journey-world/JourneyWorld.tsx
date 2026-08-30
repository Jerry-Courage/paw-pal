'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, ChevronLeft, ChevronRight, Clock3, Coins, Crown, Flame, Lightbulb, LockKeyhole, Menu, MessageCircle, Mic, Play, Plus, RefreshCw, RotateCw, Send, ShieldCheck, Swords, Target, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { authApi, gamificationApi, learningApi } from '@/lib/api'
import FlowCompanion from '@/components/onboarding/FlowCompanion'
import TeachingVoiceMode from '@/components/journey-world/TeachingVoiceMode'
import { normalizeForRendering, normalizeReadableMath } from '@/lib/mathFormatting'
import { cn } from '@/lib/utils'
import { useFlowSound } from '@/context/FlowSoundContext'
import type { EncounterActivity, EncounterAttemptResponse, JourneyPathDetail, JourneyRoadmapNode, JourneyRoadmapResponse, RewardResponse, TeachingSessionResponse, TeachingTurn } from '@/types/journey'

type NodeKind = 'lesson' | 'practice' | 'review' | 'checkpoint' | 'challenge' | 'finale'
type WorldNode = JourneyRoadmapNode & { kind: NodeKind; unitIndex: number; unitTitle: string; displayState: 'locked' | 'available' | 'current' | 'in_progress' | 'completed' | 'mastered' | 'review_due' }

export default function JourneyWorld({ pathId }: { pathId: string }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()
  const reduceMotion = useReducedMotion()
  const currentRef = useRef<HTMLButtonElement>(null)
  const didAutoPosition = useRef(false)
  const consumedConceptIntent = useRef<string | null>(null)
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

  useEffect(() => { const requested = searchParams.get('concept'); if (!requested || consumedConceptIntent.current === requested || !nodes.length) return; const node = nodes.find(item => item.id === requested); if (node && node.displayState !== 'locked') { consumedConceptIntent.current = requested; setEncounter(node) } }, [searchParams, nodes])

  const closeEncounter = () => {
    setEncounter(null)
    setSelected(null)
    if (searchParams.get('concept')) router.replace(`/learn/${pathId}`, { scroll: false })
  }

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
    <AnimatePresence>{encounter && <StudyEncounter node={encounter} onClose={closeEncounter} onCompleted={async (result, mastery) => { closeEncounter(); setReward(result); setRewardMastery(mastery); await refresh() }} />}</AnimatePresence>
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

function conciseCheckpointTitle(value: string) {
  const readable = normalizeReadableMath(value).replace(/^["']|["']$/g, '').trim()
  const sentence = readable.split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '')
  if (sentence.length <= 78) return sentence
  const shortened = sentence
    .replace(/^(the learner (?:will|should|can) |learners? (?:will|should|can) |you (?:will|should|can) )/i, '')
    .replace(/^(understand|explain|identify|describe|compare|apply) that /i, '$1 ')
  if (shortened.length <= 78) return shortened
  const words = shortened.split(/\s+/)
  return `${words.slice(0, 11).join(' ')}…`
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
  const queryClient = useQueryClient()
  const sounds = useFlowSound()
  const [message, setMessage] = useState('')
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [results, setResults] = useState<Record<string, EncounterAttemptResponse>>({})
  const [checkpointNotice, setCheckpointNotice] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const previousSatisfiedRef = useRef<number | null>(null)
  const sessionQuery = useQuery({ queryKey: ['teaching-session', node.id], queryFn: () => learningApi.getTeachingSession(node.id).then(response => response.data as TeachingSessionResponse) })
  const session = sessionQuery.data
  const send = useMutation({ mutationFn: (text: string) => learningApi.sendTeachingMessage(node.id, { message: text, idempotency_key: crypto.randomUUID() }).then(response => response.data as TeachingSessionResponse), onSuccess: data => { queryClient.setQueryData(['teaching-session', node.id], data); setMessage('') } })
  const respond = useMutation({ mutationFn: ({ activity, response }: { activity: EncounterActivity; response: unknown }) => learningApi.submitTeachingResponse(node.id, { activity_id: activity.id, response }).then(reply => reply.data as TeachingSessionResponse), onSuccess: (data, variables) => { queryClient.setQueryData(['teaching-session', node.id], data); if (data.evaluation) { sounds.play(data.evaluation.correct === false ? 'incorrect' : 'correct', data.evaluation.attempt_id); setResults(current => ({ ...current, [variables.activity.id]: { attempt_id: data.evaluation!.attempt_id, correct: data.evaluation!.correct, score: data.evaluation!.score, feedback: data.evaluation!.feedback, explanation: '', hint: '', evidence_score: data.mastery, attempt_number: 1, recommend_flow: data.evaluation!.correct === false } })) } } })
  const complete = useMutation({ mutationFn: () => node.status === 'completed' ? learningApi.reviewConcept(node.id, session?.mastery || 0) : learningApi.finalizeTeachingSession(node.id), onSuccess: response => { sounds.play('xp', `concept-${node.id}`); if (response.data.reward?.flowcoins) sounds.play('flowcoin', `concept-${node.id}`); if (response.data.reward?.level?.leveled_up) sounds.play('level_up', `concept-${node.id}`); onCompleted(response.data.reward || { xp: 0, flowcoins: 0, level: { previous: 0, current: 0, leveled_up: false }, streak: { current: 0, increased: false }, missions: [], achievements: [] }, response.data.mastery ?? session?.mastery ?? 0) } })
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [session?.turns.length, send.isPending])
  useEffect(() => {
    const objectives = session?.completion_evaluation.objectives
    if (!objectives) return
    const satisfied = objectives.filter(objective => objective.satisfied).length
    if (previousSatisfiedRef.current !== null && satisfied > previousSatisfiedRef.current) {
      const newlySatisfied = objectives.filter(objective => objective.satisfied)[satisfied - 1]
      setCheckpointNotice(newlySatisfied?.text || 'Checkpoint understood')
      const timer = window.setTimeout(() => setCheckpointNotice(null), 3200)
      previousSatisfiedRef.current = satisfied
      return () => window.clearTimeout(timer)
    }
    previousSatisfiedRef.current = satisfied
  }, [session?.completion_evaluation.objectives])
  if (sessionQuery.isLoading) return <WorldMessage title="Flow is remembering where you left off…" state="thinking" />
  if (!session) return <WorldMessage title="Flow couldn’t open this session." action={() => sessionQuery.refetch()} />
  const objectiveState = session.completion_evaluation.objectives
  const satisfiedCount = objectiveState.filter(objective => objective.satisfied).length
  const progress = objectiveState.length ? Math.round((satisfiedCount / objectiveState.length) * 100) : 0
  const currentObjective = objectiveState.find(objective => !objective.satisfied) || objectiveState[objectiveState.length - 1]
  const currentObjectiveIndex = Math.max(0, objectiveState.findIndex(objective => objective.id === currentObjective?.id))
  const currentCheckpointTitle = conciseCheckpointTitle(currentObjective?.text || node.title)
  const submitMessage = () => { const value = message.trim(); if (value && !send.isPending) send.mutate(value) }
  const closeVoice = () => { setVoiceOpen(false); queryClient.invalidateQueries({ queryKey: ['teaching-session', node.id] }) }
  const latestTurn = session.turns[session.turns.length - 1]
  const showQuickActions = latestTurn?.role !== 'learner' && !latestTurn?.payload.activity && !session.completion_evaluation.complete && !send.isPending
  return <motion.div className="flow-v2 flow-atmosphere fixed inset-0 z-[60] flex min-w-0 flex-col overflow-hidden text-flow-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><header className="z-20 shrink-0 border-b border-white/[.07] bg-flow-void/95 px-3 pb-3 pt-[max(.5rem,env(safe-area-inset-top))] backdrop-blur sm:px-6"><div className="mx-auto flex max-w-[900px] items-center gap-3"><button onClick={onClose} aria-label="Back to Journey" className="grid h-11 w-11 shrink-0 place-items-center text-flow-muted hover:text-flow-ink focus-visible:ring-2 focus-visible:ring-flow-orange"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><div className="flex items-center gap-3"><h1 className="min-w-0 flex-1 truncate text-sm font-black sm:text-base">{normalizeReadableMath(node.title)}</h1><button onClick={() => setProgressOpen(true)} aria-label={`Open Journey progress, ${progress}% complete`} className="shrink-0 text-xs font-black text-flow-muted hover:text-flow-ink focus-visible:ring-2 focus-visible:ring-flow-orange">{progress}%</button></div><div className="mt-2 flex gap-1" aria-label={`${satisfiedCount} of ${objectiveState.length} checkpoints understood`}>{objectiveState.map((objective, index) => <span key={objective.id} className={cn('h-1.5 min-w-2 flex-1 rounded-full transition-colors', objective.satisfied ? 'bg-flow-success' : index === currentObjectiveIndex ? 'bg-flow-orange' : 'bg-white/10')} />)}</div><p className="mt-2 line-clamp-2 text-[11px] font-bold leading-snug text-flow-muted"><span className="mr-2 uppercase tracking-[.14em] text-flow-orange">Now</span>{normalizeReadableMath(currentCheckpointTitle)}</p></div></div></header>
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 touch-pan-y sm:px-6 sm:py-8"><div className="mx-auto w-full max-w-[860px]"><section className="mb-9 border-y border-white/10 py-5"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[.18em] text-flow-orange">Checkpoint {Math.min(currentObjectiveIndex + 1, objectiveState.length)} of {objectiveState.length}</p><span className="text-xs font-bold text-flow-muted">~{Math.max(2, Math.ceil(node.estimated_minutes / Math.max(1, objectiveState.length)))} min</span></div><h2 className="mt-2 text-lg font-black leading-snug sm:text-xl">{normalizeReadableMath(currentCheckpointTitle)}</h2><p className="mt-2 text-sm leading-relaxed text-flow-muted">You’ll clear this when you can explain the idea and use it without an unresolved misconception.</p></section><AnimatePresence>{checkpointNotice && <motion.div role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-7 flex items-center gap-3 border-l-2 border-flow-success py-2 pl-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-flow-success text-flow-void"><Check className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.16em] text-flow-success">Checkpoint understood</p><p className="line-clamp-2 text-sm font-bold text-flow-ink">{normalizeReadableMath(checkpointNotice)}</p></div></motion.div>}</AnimatePresence><div className="space-y-9">{session.turns.map((turn, index) => <div key={turn.id} className={cn('transition-opacity duration-300', index < session.turns.length - 4 && 'opacity-35 hover:opacity-75 focus-within:opacity-100')}><ConversationTurn turn={turn} node={node} answer={turn.payload.activity ? answers[turn.payload.activity.id] : undefined} result={turn.payload.activity ? results[turn.payload.activity.id] : undefined} responding={respond.isPending} onAnswer={(activity, value) => { setAnswers(current => ({ ...current, [activity.id]: value })); setResults(current => { const next = { ...current }; delete next[activity.id]; return next }) }} onRespond={(activity, value) => respond.mutate({ activity, response: activity.options ? { choice: value } : activity.type === 'ordering' ? { order: value } : { text: value } })} onRefresh={() => sessionQuery.refetch()} /></div>)}{showQuickActions && <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Suggested replies">{[['Explain simpler','Explain that more simply'],['Show an example','Show me an example'],['Test me','Test me on this checkpoint']].map(([label, prompt]) => <button key={label} onClick={() => send.mutate(prompt)} className="min-h-11 shrink-0 rounded-full border border-white/10 px-4 text-xs font-black text-flow-muted hover:border-flow-violet hover:text-flow-violet">{label}</button>)}</div>}{send.isPending && <div className="flex items-center gap-3"><FlowCompanion state="thinking" className="w-12" /><p className="text-sm font-bold text-flow-muted">Connecting the dots.</p></div>}{send.isError && <p role="alert" className="text-sm text-rose-300">That message didn’t reach Flow. Your earlier progress is safe—send it again.</p>}{session.completion_evaluation.complete && <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="border-y border-flow-success/30 py-7 text-center"><span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-flow-success text-flow-void"><Check /></span><p className="mt-3 text-xl font-black">Checkpoint secure.</p><p className="mt-1 text-sm text-flow-muted">Every required objective has been verified.</p><button onClick={() => complete.mutate()} disabled={complete.isPending} className="mt-5 min-h-12 bg-flow-success px-6 font-black text-flow-void">{complete.isPending ? 'Securing progress…' : 'Finish this concept'}</button></motion.section>}<div ref={endRef} /></div></div></main>
    <footer className="flow-v2 relative shrink-0 border-t border-white/[.07] bg-flow-void/95 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6">{toolsOpen && <div className="absolute bottom-[calc(100%+.5rem)] left-3 z-30 w-56 border border-white/10 bg-flow-raised p-2 shadow-2xl sm:left-[calc(50%-24rem)]"><p className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-flow-muted">Ask Flow to…</p>{[['Show a video','show me a video'],['Make flashcards','make flashcards from what we have learned'],['Start a practice check','give me one practice question'],['Show the Source','show me the source']].map(([label, prompt]) => <button key={label} onClick={() => { setToolsOpen(false); send.mutate(prompt) }} className="min-h-11 w-full px-3 text-left text-sm font-bold hover:bg-white/5">{label}</button>)}</div>}<div className="mx-auto flex max-w-[860px] items-end gap-2"><button onClick={() => setToolsOpen(open => !open)} aria-label="Learning actions" aria-expanded={toolsOpen} className="grid h-12 w-10 shrink-0 place-items-center text-flow-muted sm:w-12"><Plus /></button><div className="flex min-h-12 flex-1 items-end border-b-2 border-white/20 focus-within:border-flow-orange"><textarea value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitMessage() } }} rows={1} placeholder="Ask Flow anything…" className="max-h-32 min-w-0 flex-1 resize-none bg-transparent px-2 py-3 text-base outline-none" /><button onClick={submitMessage} disabled={!message.trim() || send.isPending} aria-label="Send message" className="grid h-12 w-10 shrink-0 place-items-center text-flow-orange disabled:opacity-30 sm:w-12"><Send /></button></div><button onClick={() => setVoiceOpen(true)} aria-label="Talk to Flow" className="grid h-12 w-10 shrink-0 place-items-center text-flow-violet focus-visible:ring-2 focus-visible:ring-flow-orange sm:w-12"><Mic /></button></div></footer><AnimatePresence>{progressOpen && <motion.div className="fixed inset-0 z-[65] flex items-end bg-black/60 sm:items-center sm:justify-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setProgressOpen(false)}><motion.section role="dialog" aria-modal="true" aria-labelledby="journey-progress-title" initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} onClick={event => event.stopPropagation()} className="w-full max-w-lg border-t border-white/10 bg-flow-raised p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:border"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-flow-orange">Journey progress</p><h2 id="journey-progress-title" className="mt-1 text-xl font-black">{progress}% understood</h2></div><button onClick={() => setProgressOpen(false)} aria-label="Close Journey progress" className="grid h-11 w-11 place-items-center text-flow-muted"><X /></button></div><ol className="mt-5 space-y-4">{objectiveState.map((objective, index) => <li key={objective.id} className="flex items-start gap-3"><span className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black', objective.satisfied ? 'bg-flow-success text-flow-void' : index === currentObjectiveIndex ? 'bg-flow-orange text-flow-void' : 'bg-white/10 text-flow-muted')}>{objective.satisfied ? <Check className="h-4 w-4" /> : index + 1}</span><div><p className={cn('text-sm font-bold', index === currentObjectiveIndex || objective.satisfied ? 'text-flow-ink' : 'text-flow-muted')}>{normalizeReadableMath(conciseCheckpointTitle(objective.text))}</p>{objective.unresolved_misconception && <p className="mt-1 text-xs text-rose-300">A misconception still needs clearing.</p>}</div></li>)}</ol></motion.section></motion.div>}</AnimatePresence><AnimatePresence>{voiceOpen && <TeachingVoiceMode session={session} onClose={closeVoice} />}</AnimatePresence>{session.completion_evaluation.normal_requirements_met && !session.completion_evaluation.feynman.passed && <FeynmanFinale node={node} session={session} onRefresh={() => sessionQuery.refetch()} />}</motion.div>
}

function FeynmanFinale({ node, session, onRefresh }: { node: WorldNode; session: TeachingSessionResponse; onRefresh: () => void }) {
  const [voice, setVoice] = useState(false)
  const [typing, setTyping] = useState(false)
  const [explanation, setExplanation] = useState('')
  const evaluate = useMutation({ mutationFn: () => learningApi.evaluateFeynman(node.id, { explanation, source: 'text', idempotency_key: crypto.randomUUID() }), onSuccess: () => { setExplanation(''); setTyping(false); onRefresh() } })
  return <section className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-flow-void/95 p-5 backdrop-blur-xl"><div className="w-full max-w-2xl border-y border-white/10 py-10 text-center"><FlowCompanion state={evaluate.isPending ? 'thinking' : session.completion_evaluation.feynman.attempted ? 'encouraging' : 'listening'} className="mx-auto w-40" /><p className="flow-eyebrow mt-4">Final understanding check</p><h2 className="mt-3 text-4xl font-black tracking-[-.05em]">Teach Flow.</h2><p className="mx-auto mt-4 max-w-xl text-flow-muted">Lesson’s basically complete 👀. Pretend I know absolutely nothing and explain what you learned in your own words. I’ll ask if anything gets fuzzy.</p>{session.completion_evaluation.feynman.feedback && <p className="mx-auto mt-5 max-w-xl border-l-4 border-flow-violet pl-4 text-left font-bold">{session.completion_evaluation.feynman.feedback}</p>}<div className="mt-8 flex flex-wrap justify-center gap-4"><button onClick={() => setVoice(true)} className="inline-flex min-h-14 items-center gap-2 bg-flow-orange px-7 font-black text-flow-void shadow-[0_6px_0_#8f3600]"><Mic /> Teach with voice</button><button onClick={() => setTyping(value => !value)} className="min-h-14 px-5 font-black text-flow-violet">Type my explanation instead</button></div>{typing && <div className="mx-auto mt-7 max-w-xl text-left"><label htmlFor="feynman-text" className="text-sm font-black">Explain it like you’re teaching Flow</label><textarea id="feynman-text" value={explanation} onChange={event => setExplanation(event.target.value)} rows={7} className="mt-2 w-full resize-y border border-white/10 bg-surface-soft p-4 outline-none focus:border-flow-orange" /><button onClick={() => evaluate.mutate()} disabled={evaluate.isPending || explanation.trim().split(/\s+/).length < 5} className="mt-3 min-h-12 bg-flow-violet px-6 font-black text-flow-void disabled:opacity-40">{evaluate.isPending ? 'Flow is thinking…' : 'Let Flow check my explanation'}</button>{evaluate.isError && <p className="mt-3 text-sm text-rose-300">That explanation didn’t reach Flow. Your lesson progress is still safe.</p>}</div>}</div><AnimatePresence>{voice && <TeachingVoiceMode session={session} feynman onClose={() => { setVoice(false); onRefresh() }} />}</AnimatePresence></section>
}

function ConversationTurn({ turn, node, answer, result, responding, onAnswer, onRespond, onRefresh }: { turn: TeachingTurn; node: WorldNode; answer: unknown; result?: EncounterAttemptResponse; responding: boolean; onAnswer: (activity: EncounterActivity, value: unknown) => void; onRespond: (activity: EncounterActivity, value: unknown) => void; onRefresh: () => void }) {
  const activity = turn.payload.activity
  if (turn.role === 'learner') return <div className="ml-auto max-w-[88%] break-words rounded-[1.35rem_1.35rem_.25rem_1.35rem] bg-flow-orange px-4 py-3 text-flow-void shadow-[0_5px_0_#8f3600] sm:max-w-[72%] sm:px-5"><p className="text-[15px] font-bold leading-relaxed">{turn.content || 'Response submitted'}</p></div>
  const avatarState = turn.kind === 'completion' ? 'celebrating' : /why|interesting|curious/i.test(turn.content) ? 'thinking' : /not yet|slow|confus/i.test(turn.content) ? 'reading' : 'idle'
  return <section className="relative pl-11 sm:pl-14"><FlowCompanion state={avatarState} className="absolute left-0 top-0 w-9 sm:w-10" label="Flow" /><div className="max-w-[760px]"><p className="mb-1 text-[10px] font-black uppercase tracking-[.16em] text-flow-violet">Flow</p><MarkdownContent>{turn.content}</MarkdownContent>{activity && <div className="mt-5"><ActivityCard activity={activity} answer={answer} result={result} disabled={responding} onAnswer={value => onAnswer(activity, value)} onSubmit={() => onRespond(activity, answer)} /></div>}{turn.kind === 'video' && <VideoLearningObject videos={turn.payload.videos || []} />}{turn.kind === 'flashcards' && <FlashcardLearningObject nodeId={node.id} cards={turn.payload.cards || []} onSaved={onRefresh} />}</div></section>
}

function VideoLearningObject({ videos }: { videos: NonNullable<TeachingTurn['payload']['videos']> }) { const [active, setActive] = useState(0); const video = videos[active]; if (!video) return null; return <figure className="mt-5 overflow-hidden border border-white/10 bg-flow-raised"><div className="aspect-video bg-black"><iframe className="h-full w-full" src={video.embed_url || `https://www.youtube-nocookie.com/embed/${video.video_id}?rel=0`} title={video.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div><figcaption className="p-4 sm:p-5"><p className="text-base font-black text-flow-ink"><Play className="mr-2 inline h-4 w-4 text-flow-violet" />{video.title}</p><p className="mt-1 text-xs text-flow-muted">{video.channel}{video.duration_str ? ` · ${video.duration_str}` : ''}</p>{video.why && <p className="mt-3 text-sm leading-6 text-flow-muted">{video.why}</p>}<p className="mt-4 text-sm font-bold text-flow-ink">When you’re done, tell Flow what became clearer. Watching alone won’t count as understanding.</p><div className="mt-3 flex flex-wrap items-center gap-4">{videos.length > 1 && <button onClick={() => setActive(index => (index + 1) % videos.length)} className="text-xs font-black text-flow-violet">Try another video</button>}<a href={video.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-flow-muted underline">Open externally if playback is blocked</a></div></figcaption></figure> }
function FlashcardLearningObject({ nodeId, cards, onSaved }: { nodeId: string; cards: NonNullable<TeachingTurn['payload']['cards']>; onSaved: () => void }) { const [saved, setSaved] = useState(false); const [index, setIndex] = useState(0); const [flipped, setFlipped] = useState(false); const card = cards[index]; const save = useMutation({ mutationFn: () => learningApi.saveTeachingFlashcards(nodeId, cards), onSuccess: () => { setSaved(true); onSaved() } }); if (!card) return null; const move = (direction: number) => { setIndex(value => (value + direction + cards.length) % cards.length); setFlipped(false) }; return <section className="mt-5 max-w-xl" aria-label="Flow flashcards" onKeyDown={event => { if (event.key === 'ArrowRight') move(1); if (event.key === 'ArrowLeft') move(-1); if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setFlipped(value => !value) } }} tabIndex={0}><div className="mb-3 flex items-center justify-between text-xs font-black uppercase tracking-[.16em] text-flow-muted"><span>Revision deck</span><span>{index + 1} / {cards.length}</span></div><button onClick={() => setFlipped(value => !value)} aria-pressed={flipped} className="relative min-h-64 w-full overflow-hidden border border-white/10 bg-flow-raised p-7 text-left shadow-[0_18px_50px_rgba(0,0,0,.3)] focus-visible:ring-2 focus-visible:ring-flow-orange"><motion.div key={`${index}-${flipped}`} initial={{ rotateY: 75, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: .24 }}><p className="text-xs font-black uppercase tracking-[.2em] text-flow-orange">{flipped ? 'Back' : 'Front'}</p><p className="mt-8 text-xl font-black leading-snug text-flow-ink">{flipped ? card.answer : card.question}</p><p className="mt-8 flex items-center gap-2 text-xs font-bold text-flow-muted"><RotateCw className="h-4 w-4" />Tap or press Space to flip</p></motion.div></button><div className="mt-3 flex items-center justify-between"><button onClick={() => move(-1)} aria-label="Previous flashcard" className="grid h-11 w-11 place-items-center text-flow-muted"><ChevronLeft /></button><button onClick={() => save.mutate()} disabled={saved || save.isPending} className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-flow-violet"><Check className="h-4 w-4" />{saved ? 'Saved' : save.isPending ? 'Saving…' : 'Save cards'}</button><button onClick={() => move(1)} aria-label="Next flashcard" className="grid h-11 w-11 place-items-center text-flow-muted"><ChevronRight /></button></div>{saved && <p role="status" className="mt-2 text-center text-xs font-bold text-flow-success">Saved to your existing review deck.</p>}</section> }

function ActivityCard({ activity, answer, result, disabled, onAnswer, onSubmit }: { activity: EncounterActivity; answer: unknown; result?: EncounterAttemptResponse; disabled: boolean; onAnswer: (value: unknown) => void; onSubmit: () => void }) {
  const teaching = ['comparison', 'worked_example'].includes(activity.type)
  const diagnostic = activity.purpose === 'diagnose'
  return <article className="border-y border-white/10 py-5 sm:py-7">{diagnostic && <div className="mb-5 flex items-start gap-3 border-l-4 border-flow-violet pl-4"><Target className="mt-0.5 h-5 w-5 shrink-0 text-flow-violet" /><div><p className="text-xs font-black uppercase tracking-[.16em] text-flow-violet">Quick diagnostic</p><p className="mt-1 text-sm text-flow-muted">This first question helps Flow choose the best route. It won’t count against your mastery.</p></div></div>}<p className="text-[clamp(1.35rem,3.5vw,2.25rem)] font-black leading-tight tracking-[-.035em] text-flow-ink">{normalizeReadableMath(activity.prompt)}</p>{activity.instructions && <p className="mt-3 text-sm text-flow-muted">{activity.instructions}</p>}<SourceProvenance activity={activity} />
    {activity.type === 'comparison' && activity.content?.rows ? <ComparisonActivity activity={activity} /> : activity.type === 'worked_example' ? <WorkedExampleActivity activity={activity} /> : activity.type === 'ordering' ? <OrderingActivity activity={activity} answer={answer} result={result} onAnswer={onAnswer} /> : activity.options?.length ? <ChoiceActivity activity={activity} answer={answer} result={result} onAnswer={onAnswer} /> : <ConversationalAnswer activity={activity} answer={answer} result={result} onAnswer={onAnswer} />}
    {!teaching && (result ? <div className={cn('mt-5 border-l-4 p-4 text-sm', result.correct === false ? 'border-rose-400 bg-rose-400/10' : 'border-flow-success bg-flow-success/10')}><p className="font-black text-flow-ink">{result.correct === false ? 'Not yet — here is the useful clue.' : result.correct === null ? 'Reflection captured.' : 'That holds.'}</p><MarkdownContent>{result.feedback}</MarkdownContent>{result.correct === false && <button onClick={() => onAnswer(undefined)} className="mt-3 font-black text-flow-orange">Try again</button>}</div> : <button disabled={answer === undefined || !String(answer).trim() || disabled} onClick={onSubmit} className="mt-5 min-h-12 bg-flow-violet px-5 font-black text-flow-void disabled:opacity-40">{disabled ? 'Checking…' : 'Check my thinking'}</button>)}
  </article>
}

function ComparisonActivity({ activity }: { activity: EncounterActivity }) {
  return <div className="mt-7 overflow-x-auto border-t-4 border-flow-violet"><table className="w-full min-w-[34rem] border-collapse text-left text-sm"><thead className="bg-flow-violet/10"><tr>{activity.content?.columns?.map(column => <th key={column} className="p-4 text-xs font-black uppercase tracking-wider text-flow-violet">{column}</th>)}</tr></thead><tbody>{activity.content?.rows?.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-white/10">{row.map((cell, cellIndex) => <td key={cellIndex} className="p-4 align-top text-flow-muted first:text-base first:font-black first:text-flow-ink">{normalizeReadableMath(cell)}</td>)}</tr>)}</tbody></table></div>
}

function WorkedExampleActivity({ activity }: { activity: EncounterActivity }) {
  return <div className="mt-7 space-y-6 border-l-4 border-flow-orange pl-5"><div><p className="text-xs font-black uppercase tracking-[.16em] text-flow-orange">1 · Start with the idea</p><MarkdownContent>{activity.content?.idea || activity.explanation || ''}</MarkdownContent></div><div><p className="text-xs font-black uppercase tracking-[.16em] text-flow-violet">2 · Watch it in action</p><MarkdownContent>{activity.content?.example || ''}</MarkdownContent></div></div>
}

function ChoiceActivity({ activity, answer, result, onAnswer }: { activity: EncounterActivity; answer: unknown; result?: EncounterAttemptResponse; onAnswer: (value: unknown) => void }) {
  const prediction = activity.type === 'predict'
  return <div className={cn('mt-7 grid gap-3', prediction && 'sm:grid-cols-3')} role="group" aria-label={prediction ? 'Make your prediction' : 'Choose one answer'}>{activity.options?.map((option, optionIndex) => <button key={optionIndex} disabled={Boolean(result)} onClick={() => onAnswer(optionIndex)} aria-pressed={answer === optionIndex} className={cn('relative min-h-16 border px-4 py-4 text-left font-bold transition', prediction && 'min-h-28 text-center', answer === optionIndex ? 'border-flow-orange bg-flow-orange/15 text-flow-ink' : 'border-white/15 hover:border-flow-violet/70', result && answer === optionIndex && result.correct === false && 'border-rose-400 bg-rose-400/10')}><span className={cn('mb-2 block text-[10px] font-black uppercase tracking-[.16em] text-flow-muted', !prediction && 'sr-only')}>Decision {optionIndex + 1}</span>{normalizeReadableMath(option)}</button>)}</div>
}

function OrderingActivity({ activity, answer, result, onAnswer }: { activity: EncounterActivity; answer: unknown; result?: EncounterAttemptResponse; onAnswer: (value: unknown) => void }) {
  const items = activity.content?.items || []
  const order = Array.isArray(answer) ? answer as number[] : items.map((_, index) => index)
  const move = (position: number, direction: -1 | 1) => { const target = position + direction; if (target < 0 || target >= order.length) return; const next = [...order]; [next[position], next[target]] = [next[target], next[position]]; onAnswer(next) }
  return <ol className="mt-7 space-y-2">{order.map((itemIndex, position) => <li key={itemIndex} className="flex min-h-16 items-center gap-3 border-l-4 border-flow-orange bg-white/[.035] px-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-flow-orange text-sm font-black text-flow-void">{position + 1}</span><span className="flex-1 text-sm font-bold text-flow-ink">{normalizeReadableMath(items[itemIndex])}</span><div className="flex"><button disabled={Boolean(result) || position === 0} onClick={() => move(position, -1)} aria-label={`Move step ${position + 1} up`} className="grid h-11 w-10 place-items-center text-flow-muted disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button><button disabled={Boolean(result) || position === order.length - 1} onClick={() => move(position, 1)} aria-label={`Move step ${position + 1} down`} className="grid h-11 w-10 place-items-center text-flow-muted disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button></div></li>)}</ol>
}

function ConversationalAnswer({ activity, answer, result, onAnswer }: { activity: EncounterActivity; answer: unknown; result?: EncounterAttemptResponse; onAnswer: (value: unknown) => void }) {
  const reflection = activity.type === 'reflection'
  return <div className="mt-7"><p className="mb-2 text-sm font-bold text-flow-muted">{reflection ? 'Explain it as if you were talking it through with Flow.' : 'Talk through your reasoning—one clear thought is enough to start.'}</p><textarea value={String(answer || '')} disabled={Boolean(result)} onChange={event => onAnswer(event.target.value)} rows={5} placeholder={reflection ? 'I would explain it like this…' : 'Here’s how I’m thinking about it…'} className="w-full resize-y border-0 border-b-2 border-white/20 bg-transparent px-1 py-4 text-lg leading-relaxed text-flow-ink outline-none placeholder:text-flow-muted/60 focus:border-flow-orange" /></div>
}

function FlowActions({ result, onAction }: { result?: EncounterAttemptResponse; onAction: (action: string) => void }) {
  const actions = result?.correct === false ? ['Why was I wrong?', 'Give me a hint', 'Explain another way'] : ['Explain another way', 'Show me an example', 'Quiz me', 'Connect this to my goal']
  return <div className="mt-4 flex gap-2 overflow-x-auto pb-2 md:grid md:overflow-visible">{actions.map(action => <button key={action} onClick={() => onAction(action)} className="min-h-11 shrink-0 border border-white/10 bg-flow-raised px-3 text-left text-xs font-black text-flow-muted hover:border-flow-violet hover:text-flow-violet">{action}</button>)}</div>
}

function InlineFlow({ nodeId, activity, action, answer, result, onClose }: { nodeId: string; activity: EncounterActivity; action: string; answer: unknown; result?: EncounterAttemptResponse; onClose: () => void }) {
  const ask = useQuery({ queryKey: ['inline-flow', nodeId, activity.id, action, result?.attempt_id], queryFn: () => learningApi.askFlowInConcept(nodeId, { action, stage: activity.purpose, activity_id: activity.id, learner_response: answer, correct: result?.correct }).then(response => response.data as { answer: string }) })
  return <motion.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-5 overflow-hidden border-l-4 border-flow-violet bg-flow-violet/10"><div className="p-4"><button onClick={onClose} aria-label="Close Flow response" className="float-right p-1 text-flow-muted"><X className="h-4 w-4" /></button><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-flow-violet"><Lightbulb className="h-4 w-4" />Flow · {action}</p>{ask.isLoading && <div role="status" className="mt-4 flex items-center gap-3 text-sm font-bold text-flow-muted"><FlowCompanion state="thinking" className="w-12 animate-[pulse_1.4s_ease-in-out_infinite]" /><span>Flow is finding the clearest distinction</span><span className="flex gap-1" aria-hidden="true">{[0,1,2].map(dot => <motion.i key={dot} className="h-1.5 w-1.5 rounded-full bg-flow-violet" animate={{ opacity: [.25, 1, .25], y: [0, -3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: dot * .16 }} />)}</span></div>}{ask.data?.answer && <div className="mt-3 border-t border-flow-violet/30 pt-1"><MarkdownContent>{ask.data.answer}</MarkdownContent></div>}{ask.isError && <p className="mt-3 text-sm text-rose-300">Flow couldn’t respond right now. Your work is still saved.</p>}<Link href={`/ai?concept=${nodeId}`} className="mt-4 inline-flex items-center gap-2 text-xs font-black text-flow-violet"><MessageCircle className="h-4 w-4" />Talk to Flow</Link></div></motion.section>
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
