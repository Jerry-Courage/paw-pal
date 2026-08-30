'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { ArrowLeft, Bookmark, ChevronDown, ExternalLink, Menu, MessageCircle, Sparkles, X } from 'lucide-react'
import { aiApi, libraryApi } from '@/lib/api'
import FlowCompanion from '@/components/onboarding/FlowCompanion'
import FlowLoader from '@/components/ui/FlowLoader'
import { normalizeForRendering, normalizeReadableMath } from '@/lib/mathFormatting'
import { useFlowSound } from '@/context/FlowSoundContext'
import { cn } from '@/lib/utils'
import { normalizeReadingSections, readingFailureMessage, unwrapApiCollection, type NormalizedReadingSection } from '@/lib/readingNormalization.mjs'

type Section = NormalizedReadingSection

export default function ReadWithFlowPage({ params }: { params: { id: string } }) {
  const id = Number(params.id); const qc = useQueryClient(); const sounds = useFlowSound(); const searchParams = useSearchParams()
  const [active, setActive] = useState(() => Math.max(0, Number(searchParams.get('section')) || 0)); const [navOpen, setNavOpen] = useState(false); const [flowOpen, setFlowOpen] = useState(false)
  const [selection, setSelection] = useState(''); const [question, setQuestion] = useState('Explain this')
  const articleRef = useRef<HTMLElement>(null)
  const resourceQuery = useQuery({ queryKey: ['resource-reading', id], queryFn: () => libraryApi.getReadingContent(id).then(r => r.data), retry: 1 })
  const bookmarksQuery = useQuery({ queryKey: ['source-bookmarks', id], queryFn: () => libraryApi.getBookmarks(id).then(r => r.data) })
  const sections = useMemo(() => normalizeReadingSections(resourceQuery.data?.sections, resourceQuery.data?.ai_summary), [resourceQuery.data])
  const section = sections[Math.min(active, Math.max(0, sections.length - 1))]
  const ask = useMutation({ mutationFn: () => aiApi.quickAsk(`${question}\n\nSelected source text:\n${selection || section?.content || ''}`, id).then(r => r.data), onSuccess: () => setFlowOpen(true) })
  const cards = useMutation({ mutationFn: () => libraryApi.generateFlashcards(id, 8), onSuccess: () => { sounds.play('flashcard_save', `reading-${id}-${active}`); window.location.href = `/library/${id}/flashcards` } })
  const bookmarks = useMemo(() => unwrapApiCollection(bookmarksQuery.data), [bookmarksQuery.data])
  const existing = bookmarks.find((item: any) => item.section_key === section?.key)
  const bookmark = useMutation({ mutationFn: () => existing ? libraryApi.deleteBookmark(existing.id) : libraryApi.createBookmark(id, { section_key: section.key, section_title: section.title, excerpt: section.content.slice(0, 500), page_number: section.page }), onSuccess: () => { sounds.play('flow_reaction', `bookmark-${id}-${section.key}`); qc.invalidateQueries({ queryKey: ['source-bookmarks', id] }) } })
  const selectSection = (index: number) => {
    setActive(index)
    requestAnimationFrame(() => articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  useEffect(() => {
    if (!resourceQuery.isError) return
    const error: any = resourceQuery.error
    console.error('[ReadWithFlow] reading request failed', { resourceId: id, status: error?.response?.status, code: error?.code, message: error?.message })
  }, [id, resourceQuery.error, resourceQuery.isError])

  if (resourceQuery.isLoading) return <FlowLoader state="reading" message="Opening this up." className="min-h-[100dvh]" />
  if (resourceQuery.isError) { const error: any = resourceQuery.error; const status = error?.response?.status; return <ReadingFailure status={status} onRetry={() => resourceQuery.refetch()} /> }
  if (!resourceQuery.data) return <main className="flow-v2 grid min-h-[100dvh] place-items-center"><p>Source not found.</p></main>
  const resource = resourceQuery.data
  if (!resource.processed_content_available) return <ReadingUnavailable id={id} title={resource.title} />
  const originalAvailable = resource.original_file_available ?? resource.original_available ?? false
  return <main className="flow-v2 flow-atmosphere min-h-[100dvh] bg-flow-void text-flow-ink">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-flow-void/90 px-4 py-3 backdrop-blur-xl"><div className="mx-auto flex max-w-[92rem] items-center gap-3"><Link href={`/library/${id}`} aria-label="Back to source" className="grid h-11 w-11 place-items-center text-flow-muted"><ArrowLeft /></Link><div className="min-w-0 flex-1"><p className="flow-eyebrow">Read with Flow</p><h1 className="truncate font-black">{resource.title}</h1></div><button onClick={() => setNavOpen(true)} className="grid h-11 w-11 place-items-center lg:hidden" aria-label="Open section navigation"><Menu /></button><button onClick={() => { setSelection(window.getSelection()?.toString().trim() || ''); setFlowOpen(true) }} className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-flow-violet"><MessageCircle className="h-4 w-4" /><span className="hidden sm:inline">Ask Flow</span></button></div></header>
    <div className="mx-auto grid max-w-[92rem] lg:grid-cols-[15rem_minmax(0,52rem)_18rem] lg:gap-10 lg:px-8">
      <nav aria-label="Source sections" className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] self-start overflow-y-auto border-r border-white/10 py-8 pr-5 lg:block"><SectionNav sections={sections} active={active} onSelect={selectSection} /></nav>
      <article ref={articleRef} onMouseUp={() => { const text = window.getSelection()?.toString().trim(); if (text) setSelection(text.slice(0, 3000)) }} className="min-w-0 scroll-mt-20 px-5 pb-40 pt-9 sm:px-10 lg:px-0">{!originalAvailable && <div className="mb-7 border-l-2 border-flow-orange bg-flow-orange/5 px-4 py-3 text-sm text-flow-muted"><strong className="text-flow-ink">Original file unavailable,</strong> but your processed notes are still here.</div>}<p className="flow-eyebrow">{section?.page ? `Page ${section.page}` : `Section ${Math.min(active, sections.length - 1) + 1}`}</p><h2 className="mt-3 text-[clamp(1.8rem,3.4vw,2.75rem)] font-black leading-[1.08] tracking-[-.035em]">{normalizeReadableMath(section?.title || resource.title)}</h2><div className="mt-7 text-[1.04rem] leading-8 sm:text-lg sm:leading-8"><ReadingMarkdown>{section?.content || resource.ai_summary}</ReadingMarkdown></div><p className="mt-9 text-xs font-bold text-flow-muted">From {resource.title}{section?.page ? ` · page ${section.page}` : ''}</p>{originalAvailable && resource.original_url && <a href={`${resource.original_url}?raw=1`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-black text-flow-violet">Open original <ExternalLink className="h-4 w-4" /></a>}</article>
      <aside className="sticky top-20 hidden h-fit py-8 lg:block"><FlowCompanion state={ask.isPending ? 'thinking' : 'reading'} className="mx-auto w-28" /><p className="mt-2 text-sm text-flow-muted">Quietly nearby. Highlight something when you want a hand.</p><ReadingActions onAsk={() => setFlowOpen(true)} onBookmark={() => bookmark.mutate()} bookmarked={Boolean(existing)} onCards={() => cards.mutate()} cardBusy={cards.isPending} sourceId={id} /></aside>
    </div>
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 border border-white/10 bg-flow-raised/95 p-1 shadow-2xl backdrop-blur lg:hidden"><button onClick={() => setFlowOpen(true)} className="min-h-11 px-4 text-sm font-black text-flow-violet">Ask Flow</button><button onClick={() => bookmark.mutate()} aria-label={existing ? 'Remove bookmark' : 'Bookmark section'} className="grid h-11 w-11 place-items-center"><Bookmark className={cn('h-5 w-5', existing && 'fill-flow-orange text-flow-orange')} /></button><Link href={`/learn?source=${id}`} className="min-h-11 px-4 py-3 text-sm font-black text-flow-orange">Journey</Link></div>
    {navOpen && <div className="fixed inset-0 z-50 bg-black/70 lg:hidden" onClick={() => setNavOpen(false)}><nav onClick={e => e.stopPropagation()} className="absolute inset-y-0 left-0 w-[min(86vw,22rem)] overflow-y-auto bg-flow-raised p-6"><button onClick={() => setNavOpen(false)} className="float-right"><X /></button><p className="flow-eyebrow mb-6">Contents</p><SectionNav sections={sections} active={active} onSelect={index => { selectSection(index); setNavOpen(false) }} /></nav></div>}
    {flowOpen && <div className="fixed inset-0 z-50 bg-black/65" onClick={() => setFlowOpen(false)}><aside onClick={e => e.stopPropagation()} className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-flow-raised p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:inset-y-0 sm:left-auto sm:w-[28rem]"><button onClick={() => setFlowOpen(false)} className="float-right"><X /></button><FlowCompanion state={ask.isPending ? 'thinking' : 'reading'} className="w-24" /><p className="flow-eyebrow">Ask about this passage</p>{selection && <blockquote className="mt-3 border-l-2 border-flow-orange pl-3 text-sm text-flow-muted">{selection.slice(0, 360)}</blockquote>}<div className="mt-5 grid gap-2">{['Explain this','Simplify this','Give an example','Why is this important?','Quiz me on this'].map(action => <button key={action} onClick={() => setQuestion(action)} className={cn('border-l-2 px-3 py-2 text-left text-sm font-black', question === action ? 'border-flow-orange text-flow-ink' : 'border-white/10 text-flow-muted')}>{action}</button>)}</div><button onClick={() => ask.mutate()} disabled={ask.isPending} className="mt-5 min-h-12 bg-flow-violet px-5 font-black text-flow-void">{ask.isPending ? 'Connecting the dots…' : 'Ask Flow'}</button>{ask.data?.answer && <div className="mt-6 border-t border-white/10 pt-5"><ReadingMarkdown>{ask.data.answer}</ReadingMarkdown></div>}</aside></div>}
  </main>
}

function SectionNav({ sections, active, onSelect }: { sections: Section[]; active: number; onSelect: (index: number) => void }) { return <ol className="space-y-1">{sections.map((item, index) => <li key={item.key}><button onClick={() => onSelect(index)} aria-current={index === active ? 'true' : undefined} className={cn('w-full border-l-2 px-3 py-3 text-left text-sm', index === active ? 'border-flow-orange font-black text-flow-ink' : 'border-white/10 text-flow-muted hover:text-flow-ink')}>{item.title}</button></li>)}</ol> }
function ReadingMarkdown({ children }: { children: string }) { return <div className="prose prose-invert max-w-none prose-headings:text-flow-ink prose-strong:text-flow-ink prose-code:text-flow-violet"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeForRendering(children)}</ReactMarkdown></div> }
function ReadingActions({ onAsk, onBookmark, bookmarked, onCards, cardBusy, sourceId }: { onAsk: () => void; onBookmark: () => void; bookmarked: boolean; onCards: () => void; cardBusy: boolean; sourceId: number }) { return <div className="mt-6 space-y-1 border-t border-white/10 pt-4"><button onClick={onAsk} className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-black"><MessageCircle className="h-4 w-4 text-flow-violet" />Ask about selection</button><button onClick={onBookmark} className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-black"><Bookmark className={cn('h-4 w-4', bookmarked && 'fill-flow-orange text-flow-orange')} />{bookmarked ? 'Bookmarked' : 'Save this section'}</button><button onClick={onCards} disabled={cardBusy} className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-black"><Sparkles className="h-4 w-4 text-flow-orange" />{cardBusy ? 'Making cards…' : 'Turn into flashcards'}</button><Link href={`/learn?source=${sourceId}`} className="flex min-h-11 items-center text-sm font-black text-flow-orange">Add to a Journey</Link></div> }
function ReadingFailure({ status, onRetry }: { status?: number; onRetry: () => void }) { return <main className="flow-v2 grid min-h-[100dvh] place-items-center bg-flow-void px-6 text-center text-flow-ink"><div className="max-w-md"><p className="flow-eyebrow">Read with Flow</p><h1 className="mt-3 text-2xl font-black">This Source could not be opened.</h1><p className="mt-3 text-sm leading-6 text-flow-muted">{readingFailureMessage(status)}</p><button onClick={onRetry} className="mt-5 min-h-11 bg-flow-violet px-5 font-black text-flow-void">Try again</button></div></main> }
function ReadingUnavailable({ id, title }: { id: number; title: string }) { return <main className="flow-v2 grid min-h-[100dvh] place-items-center bg-flow-void px-6 text-center text-flow-ink"><div className="max-w-md"><p className="flow-eyebrow">{title}</p><h1 className="mt-3 text-2xl font-black">There is no processed reading content yet.</h1><p className="mt-3 text-sm leading-6 text-flow-muted">Flow needs a summary or readable sections before Reading Mode can open.</p><Link href={`/library/${id}`} className="mt-5 inline-flex min-h-11 items-center bg-flow-violet px-5 font-black text-flow-void">Back to Source</Link></div></main> }
