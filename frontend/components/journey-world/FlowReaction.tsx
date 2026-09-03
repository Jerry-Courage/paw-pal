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

export default function FlowReaction({ state, line, className }: { state: FlowReactionState; line?: string; className?: string }) {
  const reduced = useReducedMotion()
  return <motion.div className={cn('relative flex items-center gap-3', className)} initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
    <motion.div className="relative w-20 shrink-0 sm:w-24" animate={reduced ? undefined : state === 'CORRECT' || state === 'CELEBRATING' ? { y: [0, -14, 0], rotate: [0, -4, 4, 0] } : state === 'SURPRISED' ? { rotate: [0, -5, 5, 0] } : undefined} transition={{ duration: .65 }}>
      <FlowCompanion state={mood[state]} label="Flow" />
      {(state === 'CORRECT' || state === 'CELEBRATING') && <div className="pointer-events-none absolute inset-0" aria-hidden="true">{[0,1,2,3,4].map(i => <motion.i key={i} className="absolute h-2 w-2 rounded-full bg-flow-success" style={{ left: `${12 + i * 18}%`, top: '22%' }} animate={reduced ? undefined : { y: [0, -28 - i * 3], x: [0, (i - 2) * 7], opacity: [0, 1, 0] }} transition={{ duration: .75, delay: i * .05 }} />)}</div>}
    </motion.div>
    {line && <motion.div className="max-w-md rounded-[1.4rem_1.4rem_1.4rem_.35rem] bg-white/[.065] px-4 py-3 text-sm font-bold leading-6 text-flow-ink" initial={reduced ? false : { opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }}>{line}</motion.div>}
  </motion.div>
}
