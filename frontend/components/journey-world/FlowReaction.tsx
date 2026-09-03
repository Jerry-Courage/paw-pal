'use client'

import { motion, useReducedMotion } from 'framer-motion'
import FlowCompanion, { type FlowCompanionState } from '@/components/onboarding/FlowCompanion'
import { cn } from '@/lib/utils'

export type FlowReactionState = 'WELCOME' | 'CURIOUS' | 'THINKING' | 'TEACHING' | 'CORRECT' | 'CELEBRATING' | 'ENCOURAGING' | 'SURPRISED' | 'REMEDIATING' | 'MASTERY'

const mood: Record<FlowReactionState, FlowCompanionState> = {
  WELCOME: 'idle', CURIOUS: 'thinking', THINKING: 'thinking', TEACHING: 'teaching',
  CORRECT: 'celebrating', CELEBRATING: 'celebrating', ENCOURAGING: 'encouraging',
  SURPRISED: 'confused', REMEDIATING: 'encouraging', MASTERY: 'battle-ready',
}

type FlowPosition = 'upper' | 'beside' | 'edge' | 'center'

export default function FlowReaction({ state, line, position = 'upper', className }: { state: FlowReactionState; line?: string; position?: FlowPosition; className?: string }) {
  const reduced = useReducedMotion()
  return <motion.div className={cn('relative flex items-center gap-2', position === 'center' && 'justify-center', position === 'edge' && 'justify-end', position === 'beside' && 'sm:-ml-4', className)} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
    <motion.div className={cn('relative w-14 shrink-0 sm:w-16', position === 'center' && 'w-24 sm:w-28')} animate={reduced ? undefined : state === 'CORRECT' || state === 'CELEBRATING' ? { y: [0, -10, 0], rotate: [0, -3, 3, 0] } : state === 'SURPRISED' ? { rotate: [0, -4, 4, 0] } : undefined} transition={{ duration: .55 }}>
      <FlowCompanion state={mood[state]} label="Flow" />
      {(state === 'CORRECT' || state === 'CELEBRATING') && <div className="pointer-events-none absolute inset-0" aria-hidden="true">{[0,1,2,3,4].map(i => <motion.i key={i} className="absolute h-2 w-2 rounded-full bg-flow-success" style={{ left: `${12 + i * 18}%`, top: '22%' }} animate={reduced ? undefined : { y: [0, -28 - i * 3], x: [0, (i - 2) * 7], opacity: [0, 1, 0] }} transition={{ duration: .75, delay: i * .05 }} />)}</div>}
    </motion.div>
    {line && <motion.div className="max-w-sm rounded-[1.2rem_1.2rem_1.2rem_.3rem] bg-white/[.06] px-3.5 py-2.5 text-sm font-bold leading-5 text-flow-ink" initial={reduced ? false : { opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }}>{line}</motion.div>}
  </motion.div>
}
