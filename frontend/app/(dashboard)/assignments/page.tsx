'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { assignmentsApi, paymentsApi } from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'

const PaywallModal = dynamic(() => import('@/components/ui/PaywallModal'), { ssr: false })

const STATUS_STYLES: Record<string, { label: string; icon: string; badge: string; pulse?: boolean }> = {
  processing: { label: 'AI Working', icon: 'bolt', badge: 'bg-secondary-container text-on-secondary-container', pulse: true },
  completed:  { label: 'Completed',  icon: 'check_circle', badge: 'bg-green-500/20 text-green-400' },
  pending:    { label: 'Pending',    icon: 'schedule', badge: 'bg-surface-container-highest text-on-surface-variant' },
  error:      { label: 'Error',      icon: 'error', badge: 'bg-error-container/20 text-error' },
}

const SUBJECT_COLORS: Record<string, string> = {
  science: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  math:    'bg-primary/10 text-primary border-primary/20',
  english: 'bg-pink-500/10 text-pink-400 border-pink-400/20',
  history: 'bg-secondary/10 text-secondary border-secondary/20',
}
function getSubjectColor(subject: string) {
  const s = (subject || '').toLowerCase()
  if (s.includes('science') || s.includes('bio') || s.includes('chem') || s.includes('physics')) return SUBJECT_COLORS.science
  if (s.includes('math') || s.includes('calc') || s.includes('stat') || s.includes('alg')) return SUBJECT_COLORS.math
  if (s.includes('english') || s.includes('lit') || s.includes('writing')) return SUBJECT_COLORS.english
  if (s.includes('history') || s.includes('social') || s.includes('geo')) return SUBJECT_COLORS.history
  return 'bg-surface-container-highest text-on-surface-variant border-outline-variant'
}

export default function AssignmentsPage() {
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showPaywall, setShowPaywall] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.getAll().then(r => r.data),
    refetchInterval: 5000,
  })
  const { data: subStatus, refetch: refetchSub } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => paymentsApi.getStatus().then(r => r.data),
    staleTime: 60000,
  })

  const isPremium = subStatus?.is_premium ?? false
  const assignmentsAtLimit = subStatus?.assignments_at_limit ?? false
  const assignmentsUsed = subStatus?.assignments_used ?? 0
  const assignmentsLimit = subStatus?.assignments_limit ?? 3

  const assignments = data?.results || data || []
  const processing = assignments.filter((a: any) => a.status === 'processing')

  const filtered = assignments.filter((a: any) => {
    const matchesFilter = filter === 'All' || a.status === filter.toLowerCase()
    const matchesSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) || (a.subject || '').toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-6xl mx-auto">

      {/* ── AI Processing Banner ──────────────────────── */}
      {processing.length > 0 && (
        <div className="mb-stack-lg relative overflow-hidden rounded-[1.5rem] bg-secondary-container p-stack-sm md:p-stack-md flex items-center gap-gutter text-on-secondary-container shadow-lg pulse-ai">
          <div className="relative z-10 flex items-center justify-center bg-white/20 p-2 rounded-full backdrop-blur-sm">
            <span className="material-symbols-outlined text-[24px] animate-spin">autorenew</span>
          </div>
          <div className="relative z-10">
            <h3 className="font-bold text-[18px]">AI Writing Assistant Active</h3>
            <p className="text-[14px] opacity-90">Synthesizing {processing.length} assignment{processing.length > 1 ? 's' : ''}…</p>
          </div>
          <div className="relative z-10 ml-auto hidden sm:block">
            <div className="w-32 h-3 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full animate-[shimmer_2s_infinite]" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-stack-md mb-stack-lg">
        <div>
          <span className="text-secondary font-bold tracking-widest text-[13px] mb-2 block uppercase">Academic Suite</span>
          <h2 className="text-[32px] font-bold text-on-surface flex items-center gap-base">
            My Assignments
            <span className="bg-surface-container-highest text-primary text-[15px] px-3 py-1 rounded-full">{assignments.length} active</span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-base">
          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
            <input
              className="bg-surface-container-low border border-outline-variant rounded-full pl-10 pr-stack-md py-2 text-[14px] text-on-surface focus:outline-none focus:border-secondary transition-all w-48"
              placeholder="Search assignments..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {/* View toggle */}
          <div className="flex bg-surface-container rounded-[1rem] p-1">
            <button onClick={() => setViewMode('grid')} className={cn('p-2 rounded-[0.75rem] transition-all', viewMode === 'grid' ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant')}>
              <span className="material-symbols-outlined text-[18px]">grid_view</span>
            </button>
            <button onClick={() => setViewMode('list')} className={cn('p-2 rounded-[0.75rem] transition-all', viewMode === 'list' ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant')}>
              <span className="material-symbols-outlined text-[18px]">list</span>
            </button>
          </div>
          {/* Filter */}
          <select
            className="bg-surface-container-low border border-outline-variant rounded-[1rem] px-stack-md py-2 text-[14px] text-on-surface focus:outline-none appearance-none"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option>All</option>
            <option>Pending</option>
            <option>Processing</option>
            <option>Completed</option>
          </select>
        </div>
      </div>

      {/* ── Assignment Cards ──────────────────────────── */}
      {isLoading ? (
        <div className={cn('grid gap-gutter', viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1')}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-surface-container-low rounded-[1.5rem] p-stack-md border border-outline-variant animate-pulse">
              <div className="h-4 bg-surface-container-high rounded w-1/3 mb-3" />
              <div className="h-6 bg-surface-container-high rounded w-3/4 mb-2" />
              <div className="h-4 bg-surface-container-high rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-outline-variant/30 rounded-[2rem] p-stack-lg text-center flex flex-col items-center gap-stack-md">
          <div className="w-20 h-20 bg-surface-container rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant">edit_document</span>
          </div>
          <div>
            <p className="font-bold text-on-surface text-[18px] mb-base">{search ? 'No results found' : 'No assignments yet'}</p>
            <p className="text-[14px] text-on-surface-variant mb-stack-md">Create your first assignment and let AI help you write it.</p>
            <Link href="/assignments/new" className="inline-flex items-center gap-base bg-primary text-on-primary text-[14px] font-bold px-stack-md py-2 rounded-[1rem] btn-3d hover:brightness-110 transition-all">
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Assignment
            </Link>
          </div>
        </div>
      ) : (
        <div className={cn('grid gap-gutter', viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1')}>
          {filtered.map((a: any) => {
            const status = STATUS_STYLES[a.status] || STATUS_STYLES.pending
            return (
              <div key={a.id} className="bg-surface-container-low rounded-[1.5rem] p-stack-md flex flex-col border border-outline-variant hover:-translate-y-1 transition-all card-shadow">
                {/* Status + overflow */}
                <div className="flex justify-between items-start mb-stack-sm">
                  <span className={cn('flex items-center gap-1 text-[13px] px-3 py-1 rounded-full font-bold', status.badge)}>
                    <span className={cn('material-symbols-outlined text-[16px]', status.pulse && 'animate-pulse')} style={{ fontVariationSettings: "'FILL' 1" }}>{status.icon}</span>
                    {status.label}
                  </span>
                  <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-on-surface transition-colors">more_vert</span>
                </div>

                {/* Title */}
                <h3 className="text-[18px] font-bold text-on-surface mb-2 leading-tight">{a.title}</h3>

                {/* Tags */}
                <div className="flex gap-2 mb-stack-md flex-wrap">
                  {a.subject && (
                    <span className={cn('text-[12px] px-2 py-0.5 rounded border', getSubjectColor(a.subject))}>{a.subject}</span>
                  )}
                </div>

                {/* Due date */}
                {a.due_date && (
                  <div className="flex items-center gap-2 text-on-surface-variant text-[14px] mb-stack-md">
                    <span className="material-symbols-outlined text-[18px]">event</span>
                    Due {new Date(a.due_date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </div>
                )}

                {/* CTA */}
                <div className="mt-auto">
                  {a.status === 'completed' ? (
                    <Link href={`/assignments/${a.id}`} className="block w-full text-center bg-surface-container-high text-on-surface font-bold py-2 rounded-[1rem] border-2 border-outline-variant hover:bg-surface-container-highest transition-all text-[14px]">
                      Open Draft
                    </Link>
                  ) : a.status === 'processing' ? (
                    <Link href={`/assignments/${a.id}`} className="block w-full text-center bg-surface-container-high text-primary font-bold py-2 rounded-[1rem] border-2 border-primary/20 hover:bg-primary/10 transition-all text-[14px]">
                      View Progress
                    </Link>
                  ) : (
                    <Link href={`/assignments/${a.id}`} className="block w-full text-center bg-primary text-on-primary font-bold py-2 rounded-[1rem] btn-3d hover:brightness-110 transition-all text-[14px]">
                      Start Now
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── FAB ──────────────────────────────────────── */}
      {!assignmentsAtLimit || isPremium ? (
        <Link
          href="/assignments/new"
          className="fixed bottom-24 md:bottom-margin-desktop right-margin-mobile md:right-margin-desktop w-16 h-16 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-[0_8px_30px_rgba(255,138,61,0.5)] btn-3d hover:brightness-110 transition-all z-50 group"
        >
          <span className="material-symbols-outlined text-[28px] group-hover:rotate-90 transition-transform duration-300">add</span>
        </Link>
      ) : (
        <button
          onClick={() => setShowPaywall(true)}
          className="fixed bottom-24 md:bottom-margin-desktop right-margin-mobile md:right-margin-desktop w-16 h-16 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-[0_8px_30px_rgba(255,138,61,0.5)] btn-3d hover:brightness-110 transition-all z-50 group"
        >
          <span className="material-symbols-outlined text-[28px] group-hover:rotate-90 transition-transform duration-300">add</span>
        </button>
      )}

      {/* Free trial counter */}
      {!isPremium && (
        <div className="fixed bottom-44 md:bottom-[calc(7rem+env(safe-area-inset-bottom))] right-margin-mobile md:right-margin-desktop z-50">
          <div className="bg-surface-container-high border border-outline-variant/30 rounded-xl px-3 py-1.5 text-center shadow-lg">
            <p className="text-[10px] font-bold text-on-surface-variant">{assignmentsUsed}/{assignmentsLimit} free</p>
          </div>
        </div>
      )}

      {showPaywall && subStatus && (
        <PaywallModal
          onClose={() => setShowPaywall(false)}
          notesUsed={subStatus.notes_used}
          notesLimit={subStatus.notes_limit}
          onSuccess={() => { refetchSub(); setShowPaywall(false) }}
        />
      )}
    </div>
  )
}
