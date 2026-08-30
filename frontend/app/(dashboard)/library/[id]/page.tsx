'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, BookOpen, Bot, FileText, MoreHorizontal, Route, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { libraryApi } from '@/lib/api'
import { useStudyTimer } from '@/hooks/useStudyTimer'
import FlowLoader from '@/components/ui/FlowLoader'

const ProcessingView = dynamic(() => import('@/components/library/ProcessingView'), { ssr: false })
const ConfirmationModal = dynamic(() => import('@/components/ui/ConfirmationModal'), { ssr: false })

export default function ResourcePage({ params }: { params: { id: string } }) {
  const id = Number(params.id)
  const router = useRouter()
  const qc = useQueryClient()
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showMore, setShowMore] = useState(false)
  useStudyTimer(true)

  const resourceQuery = useQuery({
    queryKey: ['resource', id],
    queryFn: () => libraryApi.getResource(id).then(response => response.data),
    refetchInterval: query => {
      const data = query.state.data as any
      return data?.status === 'ready' || data?.status === 'error' ? false : 4000
    },
  })
  const resource = resourceQuery.data
  const sections = useMemo(() => normalizeSections(resource?.ai_notes_json), [resource?.ai_notes_json])
  const deleteMutation = useMutation({
    mutationFn: () => libraryApi.deleteResource(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['resources'] }); toast.success('Source deleted.'); router.push('/library') },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Delete failed.'),
  })

  if (resourceQuery.isLoading) return <FlowLoader state="reading" message="Opening this Source." className="min-h-screen" />
  if (!resource) return <main className="flow-v2 grid min-h-screen place-items-center bg-flow-void text-flow-ink"><div className="text-center"><p className="text-xl font-black">Source not found.</p><Link href="/library" className="mt-3 inline-block text-flow-violet">Back to Sources</Link></div></main>

  const processing = resource.status === 'processing' || !resource.has_study_kit
  const uploaded = resource.created_at ? new Date(resource.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  const size = formatSize(resource.file_size)

  return <main className="flow-v2 flow-atmosphere min-h-screen bg-flow-void px-5 pb-20 pt-8 text-flow-ink sm:px-8">
    <div className="mx-auto max-w-[76rem]">
      <nav className="mb-8 text-sm font-bold text-flow-muted"><Link href="/library" className="hover:text-flow-ink">Sources</Link><span className="px-2">/</span><span className="text-flow-ink">{resource.title}</span></nav>
      <header className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-start">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-flow-orange/10 text-flow-orange"><FileText className="h-7 w-7" /></div>
        <div className="min-w-0 flex-1"><p className="flow-eyebrow">{resource.resource_type || 'Source'}</p><h1 className="mt-2 max-w-4xl text-[clamp(2rem,4vw,3.5rem)] font-black leading-[1.02] tracking-[-.04em]">{resource.title}</h1><p className="mt-3 text-sm text-flow-muted">{[uploaded && `Uploaded ${uploaded}`, size].filter(Boolean).join(' · ')}</p></div>
        <div className="flex gap-2"><button onClick={async () => { await navigator.clipboard.writeText(window.location.href); toast.success('Link copied.') }} className="inline-flex min-h-11 items-center gap-2 border border-white/10 px-4 text-sm font-black"><Share2 className="h-4 w-4" />Share</button><div className="relative"><button onClick={() => setShowMore(value => !value)} aria-label="More Source actions" className="grid h-11 w-11 place-items-center border border-white/10"><MoreHorizontal /></button>{showMore && <div className="absolute right-0 top-12 z-20 min-w-40 border border-white/10 bg-flow-raised p-2 shadow-2xl"><button onClick={() => { const title = prompt('New title:', resource.title); if (title?.trim()) libraryApi.updateResource(id, { title: title.trim() }).then(() => { qc.invalidateQueries({ queryKey: ['resource', id] }); toast.success('Renamed.') }) }} className="min-h-11 w-full px-3 text-left text-sm font-bold">Rename</button><button onClick={() => setShowConfirmDelete(true)} className="min-h-11 w-full px-3 text-left text-sm font-bold text-red-400">Delete</button></div>}</div></div>
      </header>

      {processing ? <section className="mt-10 min-h-80 overflow-hidden border border-white/10 bg-flow-raised"><ProcessingView resource={resource} onDelete={() => setShowConfirmDelete(true)} /></section> : <>
        <section className="grid gap-8 border-b border-white/10 py-10 lg:grid-cols-[minmax(0,1fr)_16rem]"><div><p className="flow-eyebrow">What Flow found</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">The useful shape of this Source.</h2><p className="mt-5 max-w-3xl text-base leading-7 text-flow-muted sm:text-lg">{resource.ai_summary || firstSectionSummary(sections) || 'Flow has processed this Source and its sections are ready to explore.'}</p></div><div className="border-l-2 border-flow-orange/60 pl-5"><p className="text-3xl font-black">{sections.length}</p><p className="mt-1 text-sm font-bold text-flow-muted">{sections.length === 1 ? 'readable section' : 'readable sections'}</p><p className="mt-5 text-sm text-flow-muted">Ready to read, question, or reuse in a Journey.</p></div></section>
        <section className="py-10"><p className="flow-eyebrow">What do you want to do?</p><div className="mt-5 grid gap-4 md:grid-cols-3"><SourceAction href={`/library/${id}/read`} icon={<BookOpen />} tone="orange" label="Read with Flow" detail="Move through the processed Source with quiet, contextual help." /><SourceAction href={`/ai?resource=${id}`} icon={<Bot />} tone="violet" label="Ask Flow" detail="Open one Flow conversation with this Source already attached." /><SourceAction href={`/learn?source=${id}`} icon={<Route />} tone="green" label="Build Journey" detail="Turn this same Source into an ordered learning route." /></div></section>
        <section className="border-t border-white/10 pt-10"><div className="flex items-end justify-between gap-4"><div><p className="flow-eyebrow">Source content</p><h2 className="mt-2 text-2xl font-black">Inside this Source</h2></div><Link href={`/library/${id}/read`} className="hidden items-center gap-1 text-sm font-black text-flow-orange sm:flex">Read all <ArrowRight className="h-4 w-4" /></Link></div><ol className="mt-6 divide-y divide-white/10 border-y border-white/10">{sections.slice(0, 12).map((section, index) => <li key={`${section.title}-${index}`}><Link href={`/library/${id}/read?section=${index}`} className="grid min-h-16 grid-cols-[2.5rem_1fr_auto] items-center gap-3 py-3"><span className="text-sm font-black text-flow-orange">{String(index + 1).padStart(2, '0')}</span><span className="font-bold">{section.title}</span><ArrowRight className="h-4 w-4 text-flow-muted" /></Link></li>)}</ol></section>
      </>}
    </div>
    {showConfirmDelete && <ConfirmationModal isOpen title="Delete Source" message={`Delete “${resource.title}”? This cannot be undone.`} confirmText="Delete" type="danger" onConfirm={() => deleteMutation.mutate()} onClose={() => setShowConfirmDelete(false)} isLoading={deleteMutation.isPending} />}
  </main>
}

function SourceAction({ href, icon, tone, label, detail }: { href: string; icon: React.ReactNode; tone: 'orange' | 'violet' | 'green'; label: string; detail: string }) { const color = tone === 'orange' ? 'text-flow-orange border-flow-orange' : tone === 'violet' ? 'text-flow-violet border-flow-violet' : 'text-flow-success border-flow-success'; return <Link href={href} className={`group flex min-h-44 flex-col justify-between border-l-4 bg-flow-raised p-5 ${color}`}><span className="[&>svg]:h-6 [&>svg]:w-6">{icon}</span><div><h3 className="text-xl font-black text-flow-ink">{label}</h3><p className="mt-2 text-sm leading-6 text-flow-muted">{detail}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-black">Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></div></Link> }
function normalizeSections(notes: any) { const raw = Array.isArray(notes?.sections) ? notes.sections : []; return raw.map((section: any, index: number) => ({ title: String(section.title || section.heading || `Section ${index + 1}`), content: String(section.content || section.notes || section.plain_english || section.deep_dive || section.summary || '') })).filter((section: any) => section.title || section.content) }
function firstSectionSummary(sections: any[]) { return sections.find(section => section.content)?.content?.slice(0, 420) || '' }
function formatSize(bytes?: number) { if (!bytes) return ''; return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB` }
