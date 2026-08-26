'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type FlowCompanionState = 'idle' | 'receiving' | 'reading' | 'thinking' | 'celebrating' | 'listening' | 'speaking'

interface FlowCompanionProps {
  state?: FlowCompanionState
  className?: string
  label?: string
}

export default function FlowCompanion({ state = 'idle', className, label = 'Flow companion' }: FlowCompanionProps) {
  const reduceMotion = useReducedMotion()
  const celebrating = state === 'celebrating'
  const thinking = state === 'thinking' || state === 'reading'

  return (
    <motion.div
      role="img"
      aria-label={`${label}, ${state}`}
      className={cn('relative aspect-square w-full max-w-[26rem] select-none', className)}
      initial={reduceMotion ? false : { opacity: 0, scale: .78, rotate: -7 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 150, damping: 18 }}
    >
      <div className="absolute inset-[12%] rounded-[46%] bg-flow-orange/10 blur-3xl" />
      <motion.svg viewBox="0 0 420 420" className="relative h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="flow-core" x1="90" y1="70" x2="330" y2="350" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFAB5F" />
            <stop offset=".48" stopColor="#FF7A1A" />
            <stop offset="1" stopColor="#C54506" />
          </linearGradient>
          <linearGradient id="flow-violet" x1="100" y1="80" x2="340" y2="320" gradientUnits="userSpaceOnUse">
            <stop stopColor="#B9A3FF" stopOpacity=".9" />
            <stop offset="1" stopColor="#7157D9" stopOpacity=".1" />
          </linearGradient>
          <filter id="flow-shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy="24" stdDeviation="20" floodColor="#03040B" floodOpacity=".62" />
          </filter>
        </defs>

        <motion.ellipse cx="210" cy="365" rx="92" ry="22" fill="#050611" opacity=".72"
          animate={reduceMotion ? undefined : { rx: [92, 78, 92], opacity: [.72, .48, .72] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} />

        <motion.g
          filter="url(#flow-shadow)"
          animate={reduceMotion ? undefined : {
            y: celebrating ? [0, -24, 0] : thinking ? [0, -7, 0] : [0, -10, 0],
            rotate: celebrating ? [0, -4, 5, 0] : [0, 1.5, 0],
          }}
          transition={{ duration: celebrating ? .8 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path d="M92 232C62 163 101 80 174 57c48-15 102 4 130 47 23 36 18 72 43 102 21 25 19 69-6 96-27 29-68 27-95 52-26 24-74 16-92-14-21-34-48-74-62-108Z" fill="url(#flow-violet)" opacity=".42" />
          <path d="M107 224C78 156 119 87 181 72c53-13 111 17 127 69 12 40-7 67 18 103 17 25 4 65-25 78-36 17-67 5-95 27-25 19-63 3-70-29-8-37-15-63-29-96Z" fill="url(#flow-core)" />
          <path d="M126 203c-8-47 24-92 67-103 42-11 87 9 100 49 10 31-7 57 6 81 12 23-2 56-27 62-30 8-48-5-72 10-22 14-50-4-50-30 0-27-18-45-24-69Z" fill="#FF9A43" opacity=".46" />
          <path d="M130 133c22-35 75-57 118-38-45 2-82 20-118 38Z" fill="#FFD0A4" opacity=".5" />

          <motion.path d="M135 274c-36 17-54 2-52-25 3-27 29-48 53-42" fill="none" stroke="#FF7A1A" strokeWidth="20" strokeLinecap="round"
            animate={reduceMotion ? undefined : { rotate: celebrating ? [0, -18, 10, 0] : [0, -3, 0] }} style={{ transformOrigin: '136px 250px' }} />
          <motion.path d="M301 268c36 11 52-8 46-34-6-26-33-42-56-32" fill="none" stroke="#FF7A1A" strokeWidth="20" strokeLinecap="round"
            animate={reduceMotion ? undefined : { rotate: celebrating ? [0, 18, -10, 0] : [0, 3, 0] }} style={{ transformOrigin: '293px 248px' }} />

          <motion.g animate={thinking && !reduceMotion ? { x: [-3, 7, -3] } : undefined} transition={{ duration: 2.2, repeat: Infinity }}>
            <ellipse cx="177" cy="194" rx="12" ry="16" fill="#0B0C1A" />
            <ellipse cx="248" cy="194" rx="12" ry="16" fill="#0B0C1A" />
            <circle cx="181" cy="189" r="4" fill="#FFF8F0" />
            <circle cx="252" cy="189" r="4" fill="#FFF8F0" />
          </motion.g>
          <path d={celebrating ? 'M184 231c18 24 43 24 61 0' : thinking ? 'M201 238c9-5 19-5 28 0' : 'M190 232c14 15 29 18 46 3'} fill="none" stroke="#0B0C1A" strokeWidth="8" strokeLinecap="round" />
        </motion.g>

        {celebrating && [
          [78, 86, '#FF7A1A'], [344, 92, '#A58CFF'], [70, 300, '#FFD25A'], [356, 284, '#FF7A1A'], [218, 36, '#FFD25A'],
        ].map(([x, y, color], index) => (
          <motion.path key={index} d="M0-12 4-4 12 0 4 4 0 12-4 4-12 0-4-4Z" fill={color as string}
            transform={`translate(${x} ${y})`}
            initial={{ opacity: 0, scale: 0 }} animate={{ opacity: [0, 1, 0], scale: [0, 1, .7], y: [8, -8, -18] }}
            transition={{ duration: 1.2, delay: index * .08, repeat: reduceMotion ? 0 : Infinity, repeatDelay: .5 }} />
        ))}
      </motion.svg>
    </motion.div>
  )
}
