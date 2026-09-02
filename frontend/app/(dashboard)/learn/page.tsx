'use client'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Plus, X } from 'lucide-react'
import { learningApi } from '@/lib/api'
import FlowCompanion from '@/components/onboarding/FlowCompanion'
import FlowLoader from '@/components/ui/FlowLoader'
import FirstJourneyBuilder from '@/components/journey-builder/FirstJourneyBuilder'
import { normalizeReadableMath } from '@/lib/mathFormatting'
import type { FlowCompanionState } from '@/components/onboarding/FlowCompanion'

export default function JourneyHubPage() {
  const params = useSearchParams(); const router = useRouter(); const qc = useQueryClient()
  const requestedSource = Number(params.get('source')) || undefined
  const requestedCreate = params.get('create') === '1'
  const [creating, setCreating] = useState(() => requestedCreate || Boolean(requestedSource)); const [flowState, setFlowState] = useState<FlowCompanionState>('idle')
  const [builderSource, setBuilderSource] = useState<number | undefined>(() => requestedSource)
  useEffect(() => {
    if (!requestedCreate && !requestedSource) return
    setBuilderSource(requestedSource)
    setCreating(true)
    const next = new URLSearchParams(params.toString())
    next.delete('source')
    next.delete('create')
    router.replace(next.size ? `/learn?${next.toString()}` : '/learn', { scroll: false })
  }, [params, requestedCreate, requestedSource, router])
  const pathsQuery = useQuery({ queryKey: ['learning-paths'], queryFn: () => learningApi.getPaths().then(r => Array.isArray(r.data) ? r.data : r.data?.results || []) })
  const paths = useMemo(() => pathsQuery.data || [], [pathsQuery.data])
  const active = useMemo(() => paths.find((path: any) => path.mastery_state?.eligible && !path.mastery_state?.passed) || paths.find((path: any) => path.status === 'active') || paths.find((path: any) => path.status !== 'completed'), [paths])
  const others = paths.filter((path: any) => path.id !== active?.id && path.status !== 'completed'); const completed = paths.filter((path: any) => path.status === 'completed')
  const pathQuery = useQuery({ queryKey: ['learning-path', active?.id], queryFn: () => learningApi.getPath(active.id).then(r => r.data), enabled: Boolean(active?.id) })
  const current = pathQuery.data?.concepts?.find((concept: any) => concept.status === 'current')
  const sessionQuery = useQuery({ queryKey: ['teaching-session', current?.id], queryFn: () => learningApi.getTeachingSession(current.id).then(r => r.data), enabled: Boolean(current?.id), retry: false })
  const open = sessionQuery.data && !['completed', 'not_started'].includes(sessionQuery.data.status)
  const masteryDue = Boolean(active?.mastery_state?.eligible && !active?.mastery_state?.passed)
  const activate = useMutation({ mutationFn: (id: string) => learningApi.setActivePath(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['learning-paths'] }) })
  const openBuilder = () => { setBuilderSource(undefined); setFlowState('idle'); setCreating(true) }
  const closeBuilder = () => { setCreating(false); setBuilderSource(undefined); setFlowState('idle') }

  if (creating) return <main className="flow-atmosphere min-h-[calc(100dvh-4rem)] overflow-x-hidden px-4 pb-20 pt-[max(1.25rem,env(safe-area-inset-top))] text-flow-ink min-[390px]:px-5 sm:px-8 sm:pt-8 md:px-10 lg:px-14">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex justify-end sm:mb-8">
        <button onClick={closeBuilder} aria-label="Close Journey builder" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-flow-raised text-flow-muted transition hover:text-flow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-orange"><X className="h-5 w-5" /></button>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_15rem] xl:gap-12">
        <FirstJourneyBuilder initialResourceIds={builderSource ? [builderSource] : []} onPersist={async () => true} onFlowState={setFlowState} />
        <aside className="hidden lg:flex lg:justify-center" aria-hidden="true"><FlowCompanion state={flowState} className="sticky top-10 w-44 max-w-full xl:w-48" /></aside>
      </div>
    </div>
  </main>

  if (pathsQuery.isLoading) return <FlowLoader state="thinking" message="Finding your spot." className="min-h-[75dvh]" />
  if (pathsQuery.isError) return <main className="flow-atmosphere grid min-h-[70dvh] place-items-center px-5 text-center"><div><FlowCompanion state="encouraging" className="mx-auto w-28" /><h1 className="mt-4 text-3xl font-black">Your Journeys are still safe.</h1><p className="mt-2 text-flow-muted">The connection dropped before Flow could load them.</p><button onClick={() => pathsQuery.refetch()} className="flow-primary-button mt-6">Try again</button></div></main>

  return <main className="flow-atmosphere min-h-[calc(100dvh-4rem)] overflow-x-hidden px-4 py-6 min-[390px]:px-5 sm:py-9 md:px-10 lg:px-14">
    <div className="mx-auto max-w-[96rem]">
      <nav aria-label="Learn destinations" className="mb-7 flex gap-1 overflow-x-auto border-b border-white/10 pb-3 text-sm font-black"><Link href="/learn" aria-current="page" className="min-h-11 shrink-0 rounded-xl bg-flow-orange/10 px-4 py-3 text-flow-orange">Journeys</Link><Link href="/library" className="min-h-11 shrink-0 rounded-xl px-4 py-3 text-flow-muted hover:text-flow-ink">Sources</Link><Link href="/library/flashcards" className="min-h-11 shrink-0 rounded-xl px-4 py-3 text-flow-muted hover:text-flow-ink">Flashcards</Link><Link href="/library/saves" className="min-h-11 shrink-0 rounded-xl px-4 py-3 text-flow-muted hover:text-flow-ink">Saved</Link></nav>
      <header className="grid gap-5 sm:flex sm:items-end sm:justify-between">
        <div><p className="flow-eyebrow">Journey</p><h1 className="flow-hero mt-2 max-w-4xl">Where you’re<br className="sm:hidden" /> going.</h1></div>
        <button onClick={openBuilder} className="flow-primary-button w-full sm:w-auto"><Plus className="h-5 w-5" />New Journey</button>
      </header>

      {active ? <section className="relative mt-7 overflow-hidden border-y border-white/10 py-6 sm:mt-8 sm:py-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(148,124,255,.15),transparent_25rem)]" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
          <div><p className="flow-eyebrow">Current Journey</p><h2 className="mt-2 text-[clamp(2rem,6vw,3rem)] font-black leading-[1.02] tracking-[-.045em]">{active.title}</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-flow-muted sm:text-base">{active.goal || active.description}</p>
            <div className="mt-5 h-2 w-full max-w-2xl overflow-hidden rounded-full bg-white/10" aria-label={`${active.mastery_percent}% complete`}><div className="h-full rounded-full bg-gradient-to-r from-flow-success to-flow-orange" style={{ width: `${Math.max(2, active.mastery_percent || 0)}%` }} /></div>
            <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap sm:items-center"><Link href={masteryDue ? `/learn/${active.id}/mastery` : `/learn/${active.id}${open ? `?concept=${current.id}` : ''}`} className="flow-primary-button w-full sm:w-auto">{masteryDue ? (active.mastery_state?.started ? 'Continue Mastery' : 'Start Mastery') : open ? 'Continue with Flow' : 'Continue Journey'} <ArrowRight /></Link><span className="text-sm font-bold text-flow-muted">{masteryDue ? 'Learning complete · Mastery still waiting' : open ? `${sessionQuery.data.completion_evaluation?.objectives_satisfied || 0}/${sessionQuery.data.completion_evaluation?.objectives_total || 0} objectives understood` : `${active.concepts_completed}/${active.total_concepts} concepts · ${active.due_reviews || 0} due`}</span></div>
          </div>
          <div className="flex items-center gap-4 lg:block"><FlowCompanion state={open ? 'teaching' : 'idle'} className="w-20 shrink-0 sm:w-24 lg:mx-auto lg:w-36" /><p className="text-sm font-bold text-flow-muted lg:text-center">{current ? `Next: ${normalizeReadableMath(current.title)}` : 'Your route is complete.'}</p></div>
        </div>
      </section> : <section className="mt-10 grid items-center gap-6 border-y border-white/10 py-8 sm:grid-cols-[1fr_12rem]"><div><h2 className="text-3xl font-black">No Journey yet.</h2><p className="mt-3 text-flow-muted">Bring a Source and Flow will turn it into a route.</p><button onClick={openBuilder} className="flow-primary-button mt-6 w-full sm:w-auto">Create a Journey</button></div><FlowCompanion state="encouraging" className="mx-auto w-28 sm:w-44" /></section>}

      {others.length > 0 && <section className="mt-10 sm:mt-14"><p className="flow-eyebrow">Your Journeys</p><div className="mt-4 divide-y divide-white/10 border-y border-white/10">{others.map((path: any) => <article key={path.id} className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center"><Link href={`/learn/${path.id}`} className="min-w-0"><h3 className="break-words text-xl font-black sm:text-2xl">{path.title}</h3><p className="mt-1 line-clamp-2 text-sm text-flow-muted">{path.subject || path.goal}</p></Link><div className="flex flex-wrap items-center gap-4"><span className="font-black text-flow-violet">{path.mastery_percent}%</span><button disabled={activate.isPending} onClick={() => activate.mutate(path.id)} className="min-h-11 text-sm font-black text-flow-orange">Make current</button><Link href={`/learn/${path.id}`} className="min-h-11 py-3 font-black">Open →</Link></div></article>)}</div></section>}
      {completed.length > 0 && <details className="mt-10 border-t border-white/10 pt-5"><summary className="min-h-11 cursor-pointer py-3 font-black text-flow-muted">Completed Journeys ({completed.length})</summary><div className="space-y-3">{completed.map((path: any) => <Link key={path.id} href={`/learn/${path.id}`} className="block py-2 text-sm font-bold text-flow-muted">{path.title} · {path.total_xp} XP</Link>)}</div></details>}
    </div>
  </main>
}
