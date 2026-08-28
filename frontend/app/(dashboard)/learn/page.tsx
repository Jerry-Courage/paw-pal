'use client'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Plus, X } from 'lucide-react'
import { learningApi } from '@/lib/api'
import FlowCompanion from '@/components/onboarding/FlowCompanion'
import FlowLoader from '@/components/ui/FlowLoader'
import FirstJourneyBuilder from '@/components/journey-builder/FirstJourneyBuilder'
import { normalizeReadableMath } from '@/lib/mathFormatting'
import type { FlowCompanionState } from '@/components/onboarding/FlowCompanion'

export default function JourneyHubPage() {
  const params = useSearchParams(); const qc = useQueryClient()
  const [creating, setCreating] = useState(false); const [flowState, setFlowState] = useState<FlowCompanionState>('idle')
  const initialSource = Number(params.get('source')) || undefined
  useEffect(() => { if (params.get('create') === '1' || initialSource) setCreating(true) }, [params, initialSource])
  const pathsQuery = useQuery({ queryKey: ['learning-paths'], queryFn: () => learningApi.getPaths().then(r => Array.isArray(r.data) ? r.data : r.data?.results || []) })
  const paths = useMemo(() => pathsQuery.data || [], [pathsQuery.data])
  const active = useMemo(() => paths.find((path: any) => path.status === 'active') || paths.find((path: any) => path.status !== 'completed'), [paths])
  const others = paths.filter((path: any) => path.id !== active?.id && path.status !== 'completed'); const completed = paths.filter((path: any) => path.status === 'completed')
  const pathQuery = useQuery({ queryKey: ['learning-path', active?.id], queryFn: () => learningApi.getPath(active.id).then(r => r.data), enabled: Boolean(active?.id) })
  const current = pathQuery.data?.concepts?.find((concept: any) => concept.status === 'current')
  const sessionQuery = useQuery({ queryKey: ['teaching-session', current?.id], queryFn: () => learningApi.getTeachingSession(current.id).then(r => r.data), enabled: Boolean(current?.id), retry: false })
  const open = sessionQuery.data && !['completed', 'not_started'].includes(sessionQuery.data.status)
  const activate = useMutation({ mutationFn: (id: string) => learningApi.setActivePath(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['learning-paths'] }) })
  if (pathsQuery.isLoading) return <FlowLoader state="thinking" message="Finding your spot." className="min-h-[75dvh]" />
  if (pathsQuery.isError) return <main className="flow-atmosphere grid min-h-[70dvh] place-items-center px-5 text-center"><div><FlowCompanion state="encouraging" className="mx-auto w-28" /><h1 className="mt-4 text-3xl font-black">Your Journeys are still safe.</h1><p className="mt-2 text-flow-muted">The connection dropped before Flow could load them.</p><button onClick={() => pathsQuery.refetch()} className="flow-primary-button mt-6">Try again</button></div></main>

  return <main className="flow-atmosphere min-h-[calc(100dvh-4rem)] overflow-x-hidden px-4 py-6 min-[390px]:px-5 sm:py-9 md:px-10 lg:px-14">
    <div className="mx-auto max-w-[96rem]">
      <header className="grid gap-5 sm:flex sm:items-end sm:justify-between">
        <div><p className="flow-eyebrow">Journey</p><h1 className="flow-hero mt-2 max-w-4xl">Where you’re<br className="sm:hidden" /> going.</h1></div>
        <button onClick={() => setCreating(true)} className="flow-primary-button w-full sm:w-auto"><Plus className="h-5 w-5" />New Journey</button>
      </header>

      {active ? <section className="relative mt-8 overflow-hidden border-y border-white/10 py-7 sm:mt-12 sm:py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(148,124,255,.15),transparent_25rem)]" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
          <div><p className="flow-eyebrow">Current Journey</p><h2 className="mt-3 text-[clamp(2rem,8vw,5.5rem)] font-black leading-[.96] tracking-[-.05em]">{active.title}</h2><p className="mt-4 max-w-2xl text-sm leading-relaxed text-flow-muted sm:text-lg">{active.goal || active.description}</p>
            <div className="mt-6 h-2 w-full max-w-2xl overflow-hidden rounded-full bg-white/10" aria-label={`${active.mastery_percent}% complete`}><div className="h-full rounded-full bg-gradient-to-r from-flow-success to-flow-orange" style={{ width: `${Math.max(2, active.mastery_percent || 0)}%` }} /></div>
            <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap sm:items-center"><Link href={`/learn/${active.id}${open ? `?concept=${current.id}` : ''}`} className="flow-primary-button w-full sm:w-auto">{open ? 'Continue with Flow' : 'Continue Journey'} <ArrowRight /></Link><span className="text-sm font-bold text-flow-muted">{open ? `${sessionQuery.data.completion_evaluation?.objectives_satisfied || 0}/${sessionQuery.data.completion_evaluation?.objectives_total || 0} objectives understood` : `${active.concepts_completed}/${active.total_concepts} concepts · ${active.due_reviews || 0} due`}</span></div>
          </div>
          <div className="flex items-center gap-4 lg:block"><FlowCompanion state={open ? 'teaching' : 'idle'} className="w-20 shrink-0 sm:w-28 lg:mx-auto lg:w-52" /><p className="text-sm font-bold text-flow-muted lg:text-center">{current ? `Next: ${normalizeReadableMath(current.title)}` : 'Your route is complete.'}</p></div>
        </div>
      </section> : <section className="mt-10 grid items-center gap-6 border-y border-white/10 py-8 sm:grid-cols-[1fr_12rem]"><div><h2 className="text-3xl font-black">No Journey yet.</h2><p className="mt-3 text-flow-muted">Bring a Source and Flow will turn it into a route.</p><button onClick={() => setCreating(true)} className="flow-primary-button mt-6 w-full sm:w-auto">Create a Journey</button></div><FlowCompanion state="encouraging" className="mx-auto w-28 sm:w-44" /></section>}

      {others.length > 0 && <section className="mt-10 sm:mt-14"><p className="flow-eyebrow">Your Journeys</p><div className="mt-4 divide-y divide-white/10 border-y border-white/10">{others.map((path: any) => <article key={path.id} className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center"><Link href={`/learn/${path.id}`} className="min-w-0"><h3 className="break-words text-xl font-black sm:text-2xl">{path.title}</h3><p className="mt-1 line-clamp-2 text-sm text-flow-muted">{path.subject || path.goal}</p></Link><div className="flex flex-wrap items-center gap-4"><span className="font-black text-flow-violet">{path.mastery_percent}%</span><button disabled={activate.isPending} onClick={() => activate.mutate(path.id)} className="min-h-11 text-sm font-black text-flow-orange">Make current</button><Link href={`/learn/${path.id}`} className="min-h-11 py-3 font-black">Open →</Link></div></article>)}</div></section>}
      {completed.length > 0 && <details className="mt-10 border-t border-white/10 pt-5"><summary className="min-h-11 cursor-pointer py-3 font-black text-flow-muted">Completed Journeys ({completed.length})</summary><div className="space-y-3">{completed.map((path: any) => <Link key={path.id} href={`/learn/${path.id}`} className="block py-2 text-sm font-bold text-flow-muted">{path.title} · {path.total_xp} XP</Link>)}</div></details>}
    </div>
    {creating && <div className="fixed inset-0 z-[70] overflow-y-auto bg-flow-void/98 px-4 pb-20 pt-[max(4.5rem,env(safe-area-inset-top))] text-flow-ink sm:px-6 md:p-12"><button onClick={() => setCreating(false)} aria-label="Close Journey builder" className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 grid h-12 w-12 place-items-center bg-flow-raised"><X /></button><div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"><FirstJourneyBuilder initialResourceIds={initialSource ? [initialSource] : []} onPersist={async () => true} onFlowState={setFlowState} /><aside className="hidden lg:block"><FlowCompanion state={flowState} className="sticky top-12 w-full" /></aside></div></div>}
  </main>
}
