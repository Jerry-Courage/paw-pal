'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, BookOpen, Check, ChevronRight, Clock3, Coins, Crown, Flame, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, Swords, Target, X } from 'lucide-react'
import Link from 'next/link'
import { authApi, gamificationApi, learningApi } from '@/lib/api'
import FlowCompanion from '@/components/onboarding/FlowCompanion'
import { normalizeReadableMath } from '@/lib/mathFormatting'
import { cn } from '@/lib/utils'
import type { JourneyConceptDetail, JourneyPathDetail, JourneyRoadmapNode, JourneyRoadmapResponse, RewardResponse } from '@/types/journey'

type NodeKind = 'lesson' | 'practice' | 'review' | 'checkpoint' | 'challenge' | 'finale'
type WorldNode = JourneyRoadmapNode & { kind: NodeKind; unitIndex: number; unitTitle: string; displayState: 'locked' | 'available' | 'current' | 'in_progress' | 'completed' | 'mastered' | 'review_due' }

export default function JourneyWorld({ pathId }: { pathId: string }) {
  const qc = useQueryClient()
  const reduceMotion = useReducedMotion()
  const currentRef = useRef<HTMLButtonElement>(null)
  const [selected, setSelected] = useState<WorldNode | null>(null)
  const [encounter, setEncounter] = useState<WorldNode | null>(null)
  const [reward, setReward] = useState<RewardResponse | null>(null)

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
      </div>
      <div className="mx-auto mt-3 flex max-w-6xl items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden bg-white/10"><motion.div className="h-full bg-flow-orange" animate={{ width: `${progress}%` }} /></div><span className="text-[10px] font-black text-flow-muted">{progress}%</span></div>
    </header>

    <section className="relative mx-auto max-w-6xl px-3 pb-[max(6rem,env(safe-area-inset-bottom))] pt-8 sm:px-8">
      <div className="mb-10 max-w-2xl pl-3 sm:pl-12"><p className="text-xs font-black uppercase tracking-[.22em] text-flow-violet">{pathQuery.data.depth} route</p><h2 className="mt-2 text-[clamp(2.5rem,6vw,5.6rem)] font-black leading-[.9] tracking-[-.055em]">{normalizeReadableMath(pathQuery.data.goal)}</h2><p className="mt-4 text-flow-muted">{current?.status === 'current' ? `${normalizeReadableMath(current.title)} is next.` : 'Your route remembers exactly where you stopped.'}</p></div>
      <div className="relative mx-auto max-w-4xl" role="list" aria-label="Journey concepts in progression order">
        {roadmapQuery.data.units.map((unit, unitIndex) => {
          const unitNodes = nodes.filter(node => node.unit_id === unit.id)
          return <section key={unit.id} className={cn('relative mb-12 min-h-80 overflow-hidden border-y border-white/10 px-2 py-10 sm:px-10', zoneAtmosphere(unitIndex))} aria-labelledby={`zone-${unit.id}`}>
            <div className="relative z-10 mb-8 max-w-lg"><p className="text-xs font-black uppercase tracking-[.28em] text-flow-orange">Zone {unitIndex + 1}</p><h3 id={`zone-${unit.id}`} className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-5xl">{normalizeReadableMath(unit.title)}</h3><p className="mt-2 text-sm font-bold text-flow-muted">{unit.completed_count}/{unit.concept_count} conquered</p></div>
            <div className="relative z-10 space-y-5 sm:min-h-[26rem]">
              <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true"><path d={mobilePath(unitNodes.length)} fill="none" stroke="rgba(255,122,26,.28)" strokeWidth="5" strokeDasharray="10 12" /></svg>
              {unitNodes.map((node, index) => <WorldNodeButton key={node.id} node={node} index={index} isFocus={node.id === current?.id} buttonRef={node.id === current?.id ? currentRef : undefined} onSelect={() => setSelected(node)} />)}
            </div>
          </section>
        })}
      </div>
    </section>

    <AnimatePresence>{selected && !encounter && <NodeSheet node={selected} onClose={() => setSelected(null)} onStart={() => { if (selected.displayState !== 'locked') setEncounter(selected) }} />}</AnimatePresence>
    <AnimatePresence>{encounter && <StudyEncounter node={encounter} onClose={() => setEncounter(null)} onCompleted={async result => { setEncounter(null); setSelected(null); setReward(result); await refresh() }} />}</AnimatePresence>
    <AnimatePresence>{reward && <RewardMoment reward={reward} next={nodes.find(node => node.status === 'current')} onClose={() => setReward(null)} />}</AnimatePresence>
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
function WorldNodeButton({ node, index, isFocus, onSelect, buttonRef }: { node: WorldNode; index: number; isFocus: boolean; onSelect: () => void; buttonRef?: React.RefObject<HTMLButtonElement> }) {
  const Icon = ICONS[node.kind]
  const left = index % 4 === 0 ? 'ml-[8%]' : index % 4 === 1 ? 'ml-[52%]' : index % 4 === 2 ? 'ml-[28%]' : 'ml-[62%]'
  return <motion.button ref={buttonRef} role="listitem" initial={{ opacity: 0, scale: .75 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, margin: '-40px' }} onClick={onSelect} aria-label={`${normalizeReadableMath(node.title)}, ${node.kind}, ${node.displayState}`} className={cn('group relative z-10 grid min-h-20 w-[38%] min-w-32 max-w-48 place-items-center outline-none focus-visible:ring-2 focus-visible:ring-flow-orange', left)}>
    {isFocus && <FlowCompanion state="idle" className="pointer-events-none absolute -right-12 -top-12 w-20" label="Flow at your current position" />}
    <span className={cn('grid h-16 w-16 place-items-center border-4 shadow-[0_7px_0_#050611] transition group-hover:-translate-y-1 sm:h-20 sm:w-20', node.kind === 'lesson' && 'rounded-[42%]', node.kind === 'practice' && 'rotate-45', node.kind === 'review' && 'rounded-full border-dashed', node.kind === 'checkpoint' && '[clip-path:polygon(50%_0,100%_24%,88%_100%,12%_100%,0_24%)]', node.kind === 'challenge' && 'rotate-3 [clip-path:polygon(10%_0,100%_12%,88%_100%,0_86%)]', node.kind === 'finale' && 'h-20 w-20 rounded-full sm:h-24 sm:w-24', stateClass(node.displayState))}><Icon className={cn('h-7 w-7', node.kind === 'practice' && '-rotate-45')} />{node.displayState === 'locked' && <LockKeyhole className="absolute h-5 w-5" />}</span>
    <span className="mt-2 max-w-40 text-center text-[11px] font-black uppercase tracking-wide text-flow-muted">{node.kind.replace('_', ' ')}</span>
    {node.displayState === 'current' && <span className="mt-1 text-xs font-black text-flow-orange">CURRENT</span>}
    {node.displayState === 'review_due' && <span className="mt-1 text-xs font-black text-flow-violet">REVIEW READY</span>}
  </motion.button>
}

function NodeSheet({ node, onClose, onStart }: { node: WorldNode; onClose: () => void; onStart: () => void }) {
  const action = node.displayState === 'locked' ? 'Complete the previous node first' : node.displayState === 'review_due' ? 'Reinforce' : node.status === 'completed' ? 'Review again' : 'Start'
  return <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.section role="dialog" aria-modal="true" aria-labelledby="node-title" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} onClick={event => event.stopPropagation()} className="flow-v2 w-full max-w-xl border-t-4 border-flow-orange bg-flow-raised p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-flow-ink shadow-2xl sm:border-4">
    <button onClick={onClose} aria-label="Close" className="float-right p-2 text-flow-muted focus-visible:ring-2 focus-visible:ring-flow-orange"><X /></button><p className="text-xs font-black uppercase tracking-[.22em] text-flow-orange">{node.unitTitle} · {node.kind}</p><h2 id="node-title" className="mt-3 pr-8 text-3xl font-black tracking-[-.04em]">{normalizeReadableMath(node.title)}</h2><div className="mt-5 flex flex-wrap gap-4 text-xs font-bold text-flow-muted"><span><Clock3 className="mr-1 inline h-4 w-4" />{node.estimated_minutes} min</span><span>{node.difficulty}</span><span>{node.mastery}% mastery</span><span>Potential 25 XP</span></div><p className="mt-5 text-sm text-flow-muted">{node.displayState === 'locked' ? 'The route opens when its prerequisite is complete.' : 'Flow will guide you through one focused encounter grounded in your material.'}</p><button disabled={node.displayState === 'locked'} onClick={onStart} className="mt-7 min-h-14 w-full bg-flow-orange px-6 font-black text-flow-void shadow-[0_6px_0_#8f3600] disabled:bg-white/10 disabled:text-flow-muted disabled:shadow-none">{action}</button>
  </motion.section></motion.div>
}

function StudyEncounter({ node, onClose, onCompleted }: { node: WorldNode; onClose: () => void; onCompleted: (reward: RewardResponse) => void }) {
  const [step, setStep] = useState(0)
  const [score, setScore] = useState<number | null>(null)
  const conceptQuery = useQuery({ queryKey: ['concept', node.id], queryFn: () => learningApi.getConcept(node.id).then(r => r.data as JourneyConceptDetail) })
  const complete = useMutation({ mutationFn: (finalScore: number) => node.status === 'completed' ? learningApi.reviewConcept(node.id, finalScore) : learningApi.completeConcept(node.id, finalScore), onSuccess: response => onCompleted(response.data.reward || { xp: 0, flowcoins: 0, level: { previous: 0, current: 0, leveled_up: false }, streak: { current: 0, increased: false }, missions: [], achievements: [] }) })
  const concept = conceptQuery.data
  const stages = ['Hook', 'Learn', 'Interact', 'Check', 'Reflect']
  if (conceptQuery.isLoading) return <WorldMessage title="Flow is opening the encounter…" state="reading" />
  if (!concept) return <WorldMessage title="Couldn’t open this concept." action={() => conceptQuery.refetch()} />
  const source = [concept.source_resource_title, concept.source_section, concept.source_page ? `page ${concept.source_page}` : ''].filter(Boolean).join(' · ')
  return <motion.div className="fixed inset-0 z-[60] overflow-y-auto bg-flow-void text-flow-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="flow-v2 mx-auto min-h-[100dvh] max-w-4xl px-5 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[.25em] text-flow-orange">{stages[step]}</p><button onClick={onClose} aria-label="Leave encounter" className="p-3 text-flow-muted focus-visible:ring-2 focus-visible:ring-flow-orange"><X /></button></div><div className="mt-3 flex gap-2">{stages.map((_, index) => <span key={index} className={cn('h-1 flex-1', index <= step ? 'bg-flow-orange' : 'bg-white/10')} />)}</div>
    <div className="mt-10 grid gap-8 md:grid-cols-[8rem_1fr]"><FlowCompanion state={step === 4 ? 'celebrating' : 'reading'} className="mx-auto w-28 md:w-full" /><div><h1 className="text-[clamp(2.25rem,6vw,5rem)] font-black leading-[.92] tracking-[-.055em]">{normalizeReadableMath(concept.title)}</h1>{source && <p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-flow-violet">From your material · {normalizeReadableMath(source)}</p>}
      <div className="mt-8 min-h-48 border-y border-white/10 py-7 text-base leading-relaxed text-flow-muted sm:text-lg">{step === 0 && <p>Let’s find the idea underneath the notation. You only need to understand one thing at a time.</p>}{step === 1 && <div className="space-y-5"><p>{normalizeReadableMath(concept.summary || concept.description || 'This concept is part of the route Flow extracted from your material.')}</p>{concept.key_definitions?.slice(0, 3).map((item, index) => <p key={index}><strong className="text-flow-ink">{normalizeReadableMath(item.term || item.name || `Key idea ${index + 1}`)}:</strong> {normalizeReadableMath(item.definition || item.value || '')}</p>)}</div>}{step === 2 && <div><p>Say the core idea back in your own words before moving on.</p><button onClick={() => setStep(3)} className="mt-6 border-b-2 border-flow-orange pb-1 font-black text-flow-ink">I’ve made a prediction</button></div>}{step === 3 && <div><p>How clearly could you explain this without looking?</p><div className="mt-6 grid grid-cols-2 gap-3">{[[45,'Still fuzzy'],[65,'Getting there'],[82,'I understand it'],[95,'I can teach it']].map(([value,label]) => <button key={value} onClick={() => setScore(value as number)} aria-pressed={score === value} className={cn('min-h-14 px-3 font-black', score === value ? 'bg-flow-orange text-flow-void' : 'bg-white/10 text-flow-ink')}>{label}</button>)}</div></div>}{step === 4 && <p>{score && score >= 82 ? 'That connection held. Let’s lock in the progress.' : 'Good signal. Flow will schedule this idea for reinforcement.'}</p>}</div>
      <button disabled={(step === 3 && score === null) || complete.isPending} onClick={() => step < 4 ? setStep(step + 1) : score !== null && complete.mutate(score)} className="mt-7 inline-flex min-h-14 items-center gap-2 bg-flow-orange px-7 font-black text-flow-void shadow-[0_6px_0_#8f3600] disabled:opacity-40">{step === 4 ? complete.isPending ? 'Saving progress…' : node.status === 'completed' ? 'Save Review' : 'Complete Encounter' : 'Continue'}<ChevronRight /></button>{complete.isError && <p role="alert" className="mt-4 text-sm text-rose-300">Couldn’t save progress. Flow hasn’t marked this complete. Try again.</p>}</div></div></div></motion.div>
}

function RewardMoment({ reward, next, onClose }: { reward: RewardResponse; next?: WorldNode; onClose: () => void }) { return <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-flow-void/95 p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="flow-v2"><FlowCompanion state="celebrating" className="mx-auto w-40" /><p className="text-xs font-black uppercase tracking-[.25em] text-flow-success">Concept secured</p><h2 className="mt-2 text-5xl font-black">+{reward.xp} XP</h2><p className="mt-2 text-xl font-black text-flow-orange">+{reward.flowcoins} FlowCoins</p>{next && <p className="mt-6 text-sm text-flow-muted">Next: {normalizeReadableMath(next.title)}</p>}<button onClick={onClose} className="mt-7 min-h-14 bg-flow-orange px-8 font-black text-flow-void shadow-[0_6px_0_#8f3600]">Continue Journey</button></div></motion.div> }
function WorldMessage({ title, action, state = 'idle' }: { title: string; action?: () => void; state?: 'idle' | 'thinking' | 'reading' }) { return <main className="flow-v2 grid min-h-[100dvh] place-items-center bg-flow-void p-6 text-center text-flow-ink"><div><FlowCompanion state={state} className="mx-auto w-44" /><h1 className="text-3xl font-black">{title}</h1>{action && <button onClick={action} className="mt-6 bg-flow-orange px-6 py-3 font-black text-flow-void">Try again</button>}</div></main> }
function Hud({ icon: Icon, value }: { icon: typeof Flame; value: string }) { return <span className="inline-flex items-center gap-1.5 text-flow-muted"><Icon className="h-4 w-4 text-flow-orange" />{value}</span> }
function stateClass(state: WorldNode['displayState']) { return state === 'locked' ? 'border-white/10 bg-[#111323] text-white/20' : state === 'current' || state === 'available' ? 'border-flow-orange bg-flow-orange/15 text-flow-orange shadow-[0_7px_0_#8f3600,0_0_32px_rgba(255,122,26,.25)]' : state === 'review_due' ? 'border-flow-violet bg-flow-violet/15 text-flow-violet' : state === 'mastered' ? 'border-flow-success bg-flow-success/15 text-flow-success' : state === 'in_progress' ? 'border-flow-orange bg-flow-raised text-flow-ink' : 'border-flow-success/60 bg-flow-success/10 text-flow-success' }
function zoneAtmosphere(index: number) { return ['bg-[radial-gradient(circle_at_20%_20%,rgba(255,122,26,.12),transparent_35%)]','bg-[radial-gradient(circle_at_80%_30%,rgba(165,140,255,.13),transparent_38%)]','bg-[radial-gradient(circle_at_45%_70%,rgba(91,218,156,.10),transparent_40%)]'][index % 3] }
function mobilePath(count: number) { const height = Math.max(300, count * 100); return `M 90 20 C 20 ${height * .2}, 90 ${height * .35}, 45 ${height * .5} S 80 ${height * .8}, 50 ${height - 20}` }
