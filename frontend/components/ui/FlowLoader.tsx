'use client'

import FlowCompanion, { type FlowCompanionState } from '@/components/onboarding/FlowCompanion'

const messages = {
  reading: ["I’m reading this… give me a sec 👀", 'Connecting the dots.', 'Found something interesting.'],
  thinking: ['Flow is thinking it through.', 'Connecting the dots.', 'Cooking your next challenge.'],
  processing: ['Getting everything into place.', 'Reading, sorting, connecting.', 'This part is worth doing carefully.'],
  waiting: ['Almost ready.', 'Holding your place.', 'Warming up the next step.'],
} as const

export default function FlowLoader({ state = 'thinking', message, className = '' }: { state?: 'reading' | 'thinking' | 'processing' | 'waiting'; message?: string; className?: string }) {
  const choices = messages[state]
  const selected = message || choices[0]
  const mascotState: FlowCompanionState = state === 'waiting' ? 'sleepy' : state === 'processing' ? 'processing' : state
  return <div role="status" aria-live="polite" className={`flow-v2 flex flex-col items-center justify-center gap-3 text-center ${className}`}>
    <FlowCompanion state={mascotState} className="w-28" />
    <p className="max-w-xs text-sm font-bold text-flow-muted">{selected}</p>
  </div>
}
