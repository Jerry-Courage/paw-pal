'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Clock3, Map, Route } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { JourneyPreviewResponse } from '@/types/journey'
import { cn } from '@/lib/utils'
import { normalizeReadableMath } from '@/lib/mathFormatting'

export default function JourneyPreview({ preview }: { preview: JourneyPreviewResponse }) {
  const [activeUnit, setActiveUnit] = useState(0)
  const reduceMotion = useReducedMotion()
  const nodes = useMemo(() => preview.units.flatMap((unit, unitIndex) => unit.concepts.map((concept, conceptIndex) => ({ ...concept, unitIndex, conceptIndex }))), [preview])
  const width = 760
  const height = Math.max(350, nodes.length * 54 + 120)
  const points = nodes.map((_, index) => {
    const mobileX = [48, 62, 40, 56, 36][index % 5]
    const desktopX = [12, 31, 53, 77, 61, 38, 19][index % 7]
    return { x: desktopX * width / 100, y: 70 + index * 54, mobileX }
  })
  const path = points.reduce((route, point, index) => {
    if (!index) return `M ${point.x} ${point.y}`
    const previous = points[index - 1]
    const bend = index % 2 ? 18 : -18
    return `${route} Q ${(previous.x + point.x) / 2 + bend} ${(previous.y + point.y) / 2} ${point.x} ${point.y}`
  }, '')

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-black uppercase tracking-widest text-flow-muted">
        <span className="inline-flex items-center gap-2"><Route className="h-4 w-4 text-flow-orange" />{preview.total_concepts} concepts</span>
        <span className="inline-flex items-center gap-2"><Map className="h-4 w-4 text-flow-violet" />{preview.units.length} units</span>
        <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-flow-success" />About {formatMinutes(preview.estimated_minutes)}</span>
      </div>

      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="relative overflow-hidden border-y border-white/10 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,.07)_1px,transparent_0)] [background-size:28px_28px]">
          <div className="space-y-0 px-3 py-7 md:hidden" aria-label="Journey preview route">
            {nodes.map((node, index) => <button key={`${node.unitIndex}-${node.title}`} type="button" onClick={() => setActiveUnit(node.unitIndex)} className={cn('relative flex min-h-20 w-full items-center gap-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-flow-orange', index % 2 ? 'pl-[24%]' : 'pl-[5%]')}>
              {index < nodes.length - 1 && <span className={cn('absolute top-[58%] h-[70%] w-1 origin-top bg-flow-orange/45', index % 2 ? 'left-[31%] rotate-[22deg]' : 'left-[12%] -rotate-[22deg]')} />}
              <span className={cn('relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-4', activeUnit === node.unitIndex ? 'border-flow-orange bg-flow-violet' : 'border-flow-ink bg-flow-void')} />
              <span className={cn('relative z-10 text-sm font-black', activeUnit === node.unitIndex ? 'text-flow-ink' : 'text-flow-muted')}>{normalizeReadableMath(node.title)}</span>
            </button>)}
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMin meet" className="hidden h-auto min-h-[34rem] w-full md:block" aria-label="Journey preview route">
            <motion.path d={path} fill="none" stroke="rgba(255,122,26,.22)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
            <motion.path d={path} fill="none" stroke="#FF7A1A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
              initial={reduceMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: Math.min(1.8, .5 + nodes.length * .08), ease: 'easeOut' }} />
            {nodes.map((node, index) => {
              const point = points[index]
              const selected = activeUnit === node.unitIndex
              const radius = node.conceptIndex === 0 ? 15 : 10
              return <motion.g key={`${node.unitIndex}-${node.title}`} initial={reduceMotion ? false : { opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduceMotion ? 0 : .18 + index * .055 }}
                onClick={() => setActiveUnit(node.unitIndex)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveUnit(node.unitIndex) } }} className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-flow-orange" role="button" tabIndex={0} aria-label={`${node.title}, unit ${node.unitIndex + 1}`}>
                <circle cx={point.x} cy={point.y} r={radius + 10} fill={selected ? 'rgba(148,124,255,.18)' : 'transparent'} />
                <circle cx={point.x} cy={point.y} r={radius} fill={selected ? '#A58CFF' : '#0B0C1A'} stroke={node.conceptIndex === 0 ? '#FF7A1A' : '#F8F6F2'} strokeWidth={node.conceptIndex === 0 ? 6 : 3} />
                <text x={point.x + (point.x > width / 2 ? -22 : 22)} y={point.y + 5} textAnchor={point.x > width / 2 ? 'end' : 'start'} fill={selected ? '#F8F6F2' : '#AAABC0'} fontSize="15" fontWeight="800">{normalizeReadableMath(node.title).slice(0, 38)}{normalizeReadableMath(node.title).length > 38 ? '…' : ''}</text>
              </motion.g>
            })}
            <text x={points[0]?.x || 80} y="35" textAnchor="middle" fill="#5BDA9C" fontSize="13" fontWeight="900" letterSpacing="3">START</text>
            <text x={points[points.length - 1]?.x || 680} y={(points[points.length - 1]?.y || 300) + 52} textAnchor="middle" fill="#FF7A1A" fontSize="13" fontWeight="900" letterSpacing="3">GOAL</text>
          </svg>
        </div>

        <div className="self-center">
          <p className="text-xs font-black uppercase tracking-[.2em] text-flow-violet">Zone {activeUnit + 1}</p>
          <AnimatePresence mode="wait">
            <motion.div key={activeUnit} initial={reduceMotion ? false : { opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? undefined : { opacity: 0, x: -10 }}>
              <h3 className="mt-2 text-2xl font-black tracking-tight">{normalizeReadableMath(preview.units[activeUnit]?.title || '')}</h3>
              <ol className="mt-5 space-y-3">
                {preview.units[activeUnit]?.concepts.map((concept, index) => <li key={concept.title} className="flex gap-3 text-sm text-flow-muted"><span className="font-black text-flow-orange">{String(index + 1).padStart(2, '0')}</span><span>{normalizeReadableMath(concept.title)}</span></li>)}
              </ol>
            </motion.div>
          </AnimatePresence>
          <div className="mt-6 flex gap-2" aria-label="Journey units">
            {preview.units.map((unit, index) => <button key={unit.title} onClick={() => setActiveUnit(index)} aria-label={`Show ${unit.title}`} aria-pressed={activeUnit === index} className={cn('h-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-orange', activeUnit === index ? 'w-10 bg-flow-orange' : 'w-5 bg-white/20')} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}
