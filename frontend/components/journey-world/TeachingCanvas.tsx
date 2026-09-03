'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, Braces, CheckCircle2, Quote, Sigma } from 'lucide-react'
import type { EncounterActivity } from '@/types/journey'
import { normalizeReadableMath } from '@/lib/mathFormatting'

export function ArchitectureCanvas({ object }: { object: EncounterActivity }) {
  const nodes = object.content?.nodes || []
  const edges = object.content?.edges || []
  return <section className="mx-auto max-w-3xl"><h3 className="text-center text-2xl font-black sm:text-3xl">{normalizeReadableMath(object.title || object.prompt)}</h3><div className="mt-7 flex flex-col items-center gap-2">{nodes.map((node,index) => <div key={node.id || index} className="contents"><motion.div initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:index*.12}} className="flex min-h-20 w-full max-w-md items-center gap-4 rounded-3xl bg-white/[.055] p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-flow-violet/15 text-flow-violet"><Braces/></span><strong>{normalizeReadableMath(node.label)}</strong></motion.div>{index<nodes.length-1&&<div className="flex flex-col items-center text-xs font-bold text-flow-orange"><ArrowDown/><span>{edges[index]?.label}</span></div>}</div>)}</div></section>
}

export function CycleCanvas({ object }: { object: EncounterActivity }) {
  const reduced = useReducedMotion()
  const nodes = object.content?.nodes || []
  return <section className="mx-auto max-w-3xl"><h3 className="text-center text-2xl font-black sm:text-3xl">{normalizeReadableMath(object.title || object.prompt)}</h3><div className="relative mx-auto mt-8 aspect-square w-full max-w-[28rem]">{nodes.slice(0,6).map((node,index)=>{const angle=(Math.PI*2*index/Math.max(1,nodes.length))-Math.PI/2;const left=50+Math.cos(angle)*36,top=50+Math.sin(angle)*36;return <motion.div key={node.id||index} className="absolute grid min-h-20 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-3xl bg-white/[.06] p-3 text-center text-sm font-black" style={{left:`${left}%`,top:`${top}%`}} initial={reduced?false:{opacity:0,scale:.7}} animate={{opacity:1,scale:1}} transition={{delay:index*.12}}>{node.label}</motion.div>})}<motion.div className="absolute left-1/2 top-1/2 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-flow-orange/15 text-center text-sm font-black text-flow-orange" animate={reduced?undefined:{rotate:[0,2,-2,0]}} transition={{duration:2.5,repeat:Infinity}}>Follow<br/>the route</motion.div><svg className="pointer-events-none absolute inset-0 -z-10 h-full w-full" viewBox="0 0 100 100" aria-hidden="true"><motion.circle cx="50" cy="50" r="36" fill="none" stroke="rgb(var(--flow-violet) / .42)" strokeWidth="1.5" strokeDasharray="3 3" initial={reduced?false:{pathLength:0}} animate={{pathLength:1}} transition={{duration:1}}/></svg></div></section>
}

export function EvidenceCanvas({ object }: { object: EncounterActivity }) {
  const evidence = object.content?.evidence || []
  return <section className="mx-auto max-w-3xl"><div className="flex items-center gap-3"><Quote className="text-flow-orange"/><h3 className="text-2xl font-black sm:text-3xl">{normalizeReadableMath(object.title || object.prompt)}</h3></div>{object.content?.body&&<p className="mt-4 max-w-2xl text-sm font-bold leading-7 text-flow-muted">{normalizeReadableMath(object.content.body)}</p>}<div className="mt-6 space-y-3">{evidence.map((excerpt,index)=><motion.blockquote key={index} initial={{opacity:0,x:-15}} animate={{opacity:1,x:0}} transition={{delay:index*.1}} className="rounded-[.5rem_2rem_2rem_2rem] bg-flow-orange/[.09] px-5 py-4 text-base font-bold leading-7"><span className="mr-2 text-flow-orange">“</span>{normalizeReadableMath(excerpt)}<span className="ml-1 text-flow-orange">”</span></motion.blockquote>)}</div></section>
}

export function GraphCanvas({ object }: { object: EncounterActivity }) {
  const reduced = useReducedMotion()
  const nodes = object.content?.nodes || []
  return <section className="mx-auto max-w-3xl"><h3 className="text-center text-2xl font-black sm:text-3xl">{normalizeReadableMath(object.title || object.prompt)}</h3><div className="relative mt-7 min-h-72 rounded-[2rem] bg-white/[.035] p-5"><div className="absolute bottom-8 left-10 top-6 w-px bg-white/20"/><div className="absolute bottom-8 left-10 right-5 h-px bg-white/20"/><svg viewBox="0 0 500 230" className="relative min-h-56 w-full overflow-visible" role="img" aria-label="Graph of the current relationship"><motion.path d="M20 205 C100 190 110 100 190 110 S300 170 470 25" fill="none" stroke="rgb(var(--flow-orange))" strokeWidth="7" strokeLinecap="round" initial={reduced?false:{pathLength:0}} animate={{pathLength:1}} transition={{duration:1.1}}/></svg>{nodes.length>0&&<div className="mt-2 flex flex-wrap justify-center gap-2">{nodes.map((node,index)=><span key={node.id||index} className="rounded-full bg-flow-violet/10 px-3 py-1 text-xs font-bold">{node.label}</span>)}</div>}</div></section>
}

export function LabeledDiagramCanvas({ object }: { object: EncounterActivity }) {
  const nodes = object.content?.nodes || []
  return <section className="mx-auto max-w-3xl"><h3 className="text-center text-2xl font-black sm:text-3xl">{normalizeReadableMath(object.title || object.prompt)}</h3><div className="relative mx-auto mt-7 grid max-w-xl grid-cols-2 gap-4 rounded-[3rem] bg-gradient-to-br from-flow-violet/10 to-flow-orange/5 p-5 sm:p-8">{nodes.map((node,index)=><motion.div key={node.id||index} initial={{opacity:0,scale:.85}} animate={{opacity:1,scale:1}} transition={{delay:index*.08}} className="relative grid min-h-28 place-items-center rounded-[2rem] border border-white/10 bg-flow-void/40 p-4 text-center text-sm font-black"><span className="absolute -left-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-flow-orange text-xs text-flow-void">{index+1}</span>{node.label}</motion.div>)}</div></section>
}

export function StepSolverCanvas({ object, onAnswer }: { object: EncounterActivity; onAnswer?: (value:string)=>void }) {
  const steps = object.content?.steps || []
  return <section className="mx-auto max-w-2xl"><div className="flex items-center gap-3"><Sigma className="text-flow-orange"/><h3 className="text-2xl font-black sm:text-3xl">{normalizeReadableMath(object.title||object.prompt)}</h3></div><div className="mt-7 space-y-3">{steps.map((step,index)=><motion.div key={index} initial={{opacity:0,x:-12}} animate={{opacity:1,x:0}} transition={{delay:index*.1}} className="flex gap-3 rounded-2xl bg-white/[.04] p-4"><CheckCircle2 className="h-5 w-5 shrink-0 text-flow-violet"/><span className="text-sm font-bold leading-6">{normalizeReadableMath(typeof step==='string'?step:step.body)}</span></motion.div>)}</div>{onAnswer&&<label className="mt-5 block text-sm font-black">Your next step<input onChange={event=>onAnswer(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-white/15 bg-white/[.035] px-4 outline-none focus:border-flow-orange" placeholder="Complete the next move…"/></label>}</section>
}
