'use client'

import { useEffect, useMemo, useState } from 'react'
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical, Link2, MousePointer2 } from 'lucide-react'
import { motion } from 'framer-motion'
import type { EncounterActivity, EncounterAttemptResponse } from '@/types/journey'
import { normalizeReadableMath } from '@/lib/mathFormatting'
import { cn } from '@/lib/utils'
import { useFlowSound } from '@/context/FlowSoundContext'

export type JourneyInteractionProps = {
  activity: EncounterActivity
  answer: unknown
  result?: EncounterAttemptResponse
  onAnswer: (value: unknown) => void
}

export function OrderingInteraction(props: JourneyInteractionProps) {
  const { activity, answer, result, onAnswer } = props
  const items = activity.content?.items || []
  const sounds = useFlowSound()
  const order = Array.isArray(answer) ? answer as number[] : items.map((_, index) => index)
  useEffect(() => { if (!Array.isArray(answer) && items.length) onAnswer(items.map((_, index) => index)) }, [activity.id])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const move = (position: number, direction: -1 | 1) => { const target = position + direction; if (target < 0 || target >= order.length) return; onAnswer(arrayMove(order, position, target)) }
  const dropped = (event: DragEndEvent) => { if (!event.over || event.active.id === event.over.id) return; const from = order.indexOf(Number(event.active.id)); const to = order.indexOf(Number(event.over.id)); if (from >= 0 && to >= 0) { onAnswer(arrayMove(order, from, to)); sounds.play('drop') } }
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dropped}><SortableContext items={order} strategy={verticalListSortingStrategy}><ol className="mt-6 space-y-3" aria-label="Arrange these steps in order">{order.map((itemIndex, position) => <SortableStep key={itemIndex} id={itemIndex} label={items[itemIndex]} position={position} disabled={Boolean(result)} onMove={move} />)}</ol></SortableContext></DndContext>
}

function SortableStep({ id, label, position, disabled, onMove }: { id: number; label: string; position: number; disabled: boolean; onMove: (position: number, direction: -1 | 1) => void }) {
  const sortable = useSortable({ id, disabled })
  return <motion.li ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} layout className="group flex min-h-16 items-center gap-3 rounded-2xl border border-white/10 bg-white/[.045] p-3 shadow-sm focus-within:border-flow-orange">
    <button {...sortable.attributes} {...sortable.listeners} disabled={disabled} aria-label={`Drag step ${position + 1}: ${label}`} className="grid h-11 w-11 shrink-0 touch-none place-items-center rounded-xl bg-white/[.06] text-flow-muted focus-visible:ring-2 focus-visible:ring-flow-orange"><GripVertical /></button>
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-flow-orange text-sm font-black text-flow-void">{position + 1}</span><span className="min-w-0 flex-1 text-sm font-bold leading-6">{normalizeReadableMath(label)}</span>
    <span className="sr-only"><button onClick={() => onMove(position, -1)}>Move up</button><button onClick={() => onMove(position, 1)}>Move down</button></span>
  </motion.li>
}

export function MatchingInteraction(props: JourneyInteractionProps) {
  const { activity, answer, result, onAnswer } = props
  const pairs = activity.content?.pairs || []
  const sounds = useFlowSound()
  const [left, setLeft] = useState<number | null>(null)
  const selected = (answer && typeof answer === 'object' ? answer : {}) as Record<string, number>
  const rightItems = useMemo(() => pairs.map((pair, index) => ({ label: pair.right, index })).sort((a, b) => a.label.localeCompare(b.label)), [pairs])
  const chooseRight = (rightIndex: number) => { if (left === null || result) return; onAnswer({ ...selected, [left]: rightIndex }); sounds.play('match'); setLeft(null) }
  return <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto_1fr]"><div className="space-y-2">{pairs.map((pair, index) => <button key={index} onClick={() => setLeft(index)} aria-pressed={left === index} className={cn('min-h-14 w-full rounded-2xl border px-4 text-left text-sm font-bold', left === index ? 'border-flow-orange bg-flow-orange/15' : selected[index] !== undefined ? 'border-flow-success/50 bg-flow-success/10' : 'border-white/10 bg-white/[.04]')}>{pair.left}</button>)}</div><Link2 className="mx-auto self-center rotate-90 text-flow-violet sm:rotate-0" /><div className="space-y-2">{rightItems.map(item => <button key={item.index} onClick={() => chooseRight(item.index)} disabled={left === null || Boolean(result)} className="min-h-14 w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 text-left text-sm font-bold disabled:opacity-70">{item.label}</button>)}</div></div>
}

export function SortingInteraction(props: JourneyInteractionProps) {
  const { activity, answer, result, onAnswer } = props
  const groups = activity.content?.groups || []
  const items = activity.content?.items || []
  const placements = (answer && typeof answer === 'object' ? answer : {}) as Record<string, string>
  const [item, setItem] = useState<string | null>(null)
  return <div className="mt-6"><div className="flex flex-wrap gap-2">{items.map(value => <button key={value} onClick={() => setItem(value)} disabled={Boolean(result)} className={cn('min-h-12 rounded-full border px-4 text-sm font-black', item === value ? 'border-flow-orange bg-flow-orange/15' : placements[value] ? 'border-flow-success/50 text-flow-success' : 'border-white/15')}>{value}</button>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-2">{groups.map(group => <button key={group.id} onClick={() => { if (item) { onAnswer({ ...placements, [item]: group.id }); setItem(null) } }} className="min-h-28 rounded-3xl border-2 border-dashed border-white/15 bg-white/[.025] p-4 text-left focus-visible:border-flow-orange"><strong>{group.label}</strong><span className="mt-3 flex flex-wrap gap-2">{items.filter(value => placements[value] === group.id).map(value => <i key={value} className="not-italic rounded-full bg-flow-violet/15 px-3 py-1 text-xs">{value}</i>)}</span></button>)}</div></div>
}

export function TapTargetInteraction(props: JourneyInteractionProps) {
  const { activity, answer, result, onAnswer } = props
  const nodes = activity.content?.nodes || []
  return <div className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Choose the part that answers the question">{nodes.map((node, index) => <motion.button whileTap={{ scale: .97 }} key={node.id || index} role="radio" aria-checked={answer === (node.id || index)} disabled={Boolean(result)} onClick={() => onAnswer(node.id || index)} className={cn('relative min-h-24 rounded-3xl border p-4 text-left font-bold', answer === (node.id || index) ? 'border-flow-orange bg-flow-orange/15' : 'border-white/10 bg-white/[.04]')}><MousePointer2 className="mb-3 h-5 w-5 text-flow-violet" />{node.label}{answer === (node.id || index) && <Check className="absolute right-3 top-3 h-5 w-5 text-flow-orange" />}</motion.button>)}</div>
}

export function RevealInteraction({ activity }: Pick<JourneyInteractionProps, 'activity'>) {
  const [revealed, setRevealed] = useState(false)
  return <div className="mt-6 text-center"><button onClick={() => setRevealed(true)} disabled={revealed} className="min-h-14 rounded-full bg-flow-orange px-6 font-black text-flow-void shadow-[0_5px_0_#8f3600]">{revealed ? 'There it is' : 'Show me'}</button>{revealed && <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-5 max-w-xl text-lg font-bold leading-8">{normalizeReadableMath(activity.content?.takeaway || activity.content?.body || activity.prompt)}</motion.p>}</div>
}

export function EvidenceHighlightInteraction(props: JourneyInteractionProps) {
  const { activity, answer, result, onAnswer } = props
  const selected = Array.isArray(answer) ? answer as number[] : []
  const evidence = activity.content?.evidence || []
  return <div className="mt-6 space-y-3" aria-label="Select the source evidence that supports the idea">{evidence.map((excerpt,index)=><button key={index} disabled={Boolean(result)} onClick={()=>onAnswer(selected.includes(index)?selected.filter(item=>item!==index):[...selected,index])} aria-pressed={selected.includes(index)} className={cn('w-full rounded-[.5rem_2rem_2rem_2rem] border px-5 py-4 text-left text-sm font-bold leading-6',selected.includes(index)?'border-flow-orange bg-flow-orange/15':'border-white/10 bg-white/[.035]')}>“{normalizeReadableMath(excerpt)}”</button>)}</div>
}

export function canSubmitInteraction(activity: EncounterActivity, answer: unknown) {
  if (activity.type === 'matching') return Object.keys((answer || {}) as object).length === (activity.content?.pairs?.length || 0)
  if (activity.type === 'sorting') return Object.keys((answer || {}) as object).length === (activity.content?.items?.length || 0)
  return answer !== undefined && String(answer).trim().length > 0
}
