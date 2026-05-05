'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { libraryApi, getAuthToken, SERVER_URL } from '@/lib/api'
import {
  Upload, Link2, Mic, Search, Sparkles, Trash2, BookOpen,
  FileText, Video, Code2, Layers, Loader2, Brain, Zap,
  AlertTriangle, Image as ImageIcon, ArrowRight, Radio,
  Folder, ChevronRight, Clock, MoreHorizontal
} from 'lucide-react'
import { formatBytes, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import UploadModal from '@/components/library/UploadModal'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'

const ConfirmationModal = dynamic(() => import('@/components/ui/ConfirmationModal'), { ssr: false })

const SUBJECT_FILTERS = [
  'All', 'Biology', 'Physics', 'History', 'Mathematics',
  'Computer Science', 'Medicine', 'Economics', 'Chemistry', 'Law',
]

const TYPE_ICONS: Record<string, any> = {
  pdf: FileText, video: Video, code: Code2, slides: Layers,
}

const SUBJECT_GRADIENTS: Record<string, string> = {
  Biology:          'from-emerald-600 to-teal-800',
  Physics:          'from-violet-600 to-purple-900',
  Mathematics:      'from-blue-600 to-indigo-900',
  'Computer Science': 'from-slate-700 to-slate-900',
  Medicine:         'from-rose-600 to-pink-900',
  Economics:        'from-amber-600 to-orange-900',
  Chemistry:        'from-cyan-600 to-sky-900',
  History:          'from-yellow-700 to-amber-900',
  Law:              'from-stone-600 to-stone-900',
  General:          'from-indigo-600 to-blue-900',
}

function getGradient(subject: string, title: string) {
  const key = Object.keys(SUBJECT_GRADIENTS).find(k =>
    subject?.toLowerCase().includes(k.toLowerCase()) ||
    title?.toLowerCase().includes(k.toLowerCase())
  )
  return SUBJECT_GRADIENTS[key || 'General']
}

function ProcessingCard({ resource, onDelete }: { resource: any; onDelete: () => void }) {
  const Icon = TYPE_ICONS[resource.resource_type] || FileText
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#1a1a1a] border border-white/5 p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
            <Icon className="w-5 h-5 text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate max-w-[180px]">{resource.title}</p>
            <p className="text-[10px] text-slate-500 font-medium">{formatBytes(resource.file_size)}</p>
          </div>
        </div>
        <button onClick={onDelete} className="p-1.5 text-slate-600 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-400/10">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[0,1,2].map(i => (
              <span key={i} className="w-1 h-1 rounded-full bg-orange-500 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
            ))}
          </div>
          <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Processing</span>
        </div>
        <p className="text-xs text-slate-500 italic truncate">{resource.status_text || 'Ingesting content...'}</p>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700 rounded-full"
            style={{ width: `${Math.max(resource.processing_progress || 0, 5)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function ResourceCard({ resource: r, onDelete }: { resource: any; onDelete: () => void }) {
  const Icon = TYPE_ICONS[r.resource_type] || FileText
  const gradient = getGradient(r.subject, r.title)
  const thumbnail = r.cover_image_url || r.thumbnail_url

  return (
    <Link href={`/library/${r.id}`} className="group block">
      <div className="relative rounded-2xl overflow-hidden bg-[#1a1a1a] border border-white/5 hover:border-white/15 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/40">
        {/* Thumbnail */}
        <div className="h-40 relative overflow-hidden">
          {thumbnail ? (
            <img
              src={thumbnail}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              alt={r.title}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }}
            />
          ) : null}
          <div className={cn('w-full h-full bg-gradient-to-br flex items-center justify-center absolute inset-0', gradient, thumbnail ? 'hidden' : '')}>
            <Icon className="w-10 h-10 text-white/30" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-transparent" />

          {/* Type badge */}
          <div className="absolute top-3 left-3">
            <span className="px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-[9px] font-black text-white/70 uppercase tracking-widest border border-white/10">
              {r.resource_type}
            </span>
          </div>

          {/* Delete on hover */}
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete() }}
            className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/50 hover:text-rose-400 hover:bg-rose-400/20 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* AI Ready badge */}
          {r.has_study_kit && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 backdrop-blur-sm border border-emerald-500/30">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Ready</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-4">
          {r.subject && (
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{r.subject}</span>
          )}
          <h3 className="text-sm font-bold text-white mt-1 line-clamp-2 leading-snug group-hover:text-orange-400 transition-colors">
            {r.title}
          </h3>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] text-slate-600 font-medium">{timeAgo(r.created_at)}</span>
            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function LibraryPage() {
  const { data: session } = useSession()
  const firstName = session?.user?.name?.split(' ')[0] || 'there'

  const [subjectFilter, setSubjectFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [uploadMode, setUploadMode] = useState<'file' | 'paste' | 'record'>('file')
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; resourceId: number | null; title: string }>({
    isOpen: false, resourceId: null, title: ''
  })
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })

  const { data: curatedData } = useQuery({
    queryKey: ['curated-resources'],
    queryFn: () => libraryApi.getCuratedResources().then(r => r.data),
  })

  // SSE for real-time processing updates
  useEffect(() => {
    const resources = (data?.results || []) as any[]
    const hasProcessing = resources.some((r: any) => r.status !== 'ready' && r.status !== 'error')
    if (!hasProcessing) return

    let aborted = false
    const ctrl = new AbortController()

    const connectSSE = async () => {
      try {
        const token = await getAuthToken()
        if (!token || aborted) return
        const res = await fetch(`${SERVER_URL}/api/library/resources/status-stream/`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        })
        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() || ''
          for (const part of parts) {
            const dataLine = part.split('\n').find(l => l.startsWith('data:'))
            const eventLine = part.split('\n').find(l => l.startsWith('event:'))
            const evt = eventLine?.replace('event:', '').trim()
            if (!dataLine || evt === 'heartbeat' || evt === 'timeout') continue
            try {
              const pulse = JSON.parse(dataLine.replace('data:', '').trim())
              if (evt === 'status' || evt === 'snapshot') {
                const updates = Array.isArray(pulse) ? pulse : [pulse]
                qc.setQueryData(['resources'], (old: any) => {
                  if (!old?.results) return old
                  const newResults = [...old.results]
                  updates.forEach((up: any) => {
                    const idx = newResults.findIndex((r: any) => r.id === up.id)
                    if (idx !== -1) {
                      newResults[idx] = {
                        ...newResults[idx],
                        status: up.status,
                        processing_progress: up.progress,
                        status_text: up.text,
                        has_study_kit: up.status === 'ready',
                      }
                    }
                  })
                  return { ...old, results: newResults }
                })
              }
              if (evt === 'done') { reader.cancel(); return }
            } catch {}
          }
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') console.warn('SSE error', e)
      }
    }
    connectSSE()
    return () => { aborted = true; ctrl.abort() }
  }, [data, qc])

  const deleteMutation = useMutation({
    mutationFn: (id: number) => libraryApi.deleteResource(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      toast.success('Resource deleted.')
      setConfirmModal({ isOpen: false, resourceId: null, title: '' })
    },
    onError: () => {
      toast.error('Delete failed.')
      setConfirmModal({ isOpen: false, resourceId: null, title: '' })
    }
  })

  const allResources: any[] = data?.results || []
  const curatedResources: any[] = curatedData?.results || curatedData || []

  const myResources = allResources.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase())
    const matchesSubject = subjectFilter === 'All' ||
      r.subject?.toLowerCase().includes(subjectFilter.toLowerCase()) ||
      r.title?.toLowerCase().includes(subjectFilter.toLowerCase())
    return matchesSearch && matchesSubject
  })

  const exploreResources = curatedResources.filter(r => {
    return subjectFilter === 'All' ||
      r.subject?.toLowerCase().includes(subjectFilter.toLowerCase()) ||
      r.title?.toLowerCase().includes(subjectFilter.toLowerCase())
  })

  const handleOpenUpload = (mode: 'file' | 'paste' | 'record') => {
    setUploadMode(mode)
    setShowUpload(true)
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] -m-4 md:-m-6 px-4 md:px-8 pb-16">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto pt-16 pb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-3">
          Hey {firstName}, what do you wanna master?
        </h1>
        <p className="text-slate-500 text-base">
          Upload anything and get interactive notes, flashcards, quizzes, and more
        </p>

        {/* Upload cards */}
        <div className="grid grid-cols-3 gap-3 mt-10 max-w-2xl mx-auto">
          {[
            { mode: 'file' as const, icon: Upload, label: 'Upload', sub: 'Image, file, audio, video' },
            { mode: 'paste' as const, icon: Link2, label: 'Paste', sub: 'YouTube, website, text' },
            { mode: 'record' as const, icon: Mic, label: 'Record', sub: 'Record live lecture' },
          ].map(({ mode, icon: Icon, label, sub }) => (
            <button
              key={mode}
              onClick={() => handleOpenUpload(mode)}
              className="group flex flex-col items-start gap-3 p-5 rounded-2xl bg-[#1a1a1a] border border-white/8 hover:border-orange-500/40 hover:bg-[#1f1f1f] transition-all text-left active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 group-hover:bg-orange-500/10 flex items-center justify-center transition-colors">
                <Icon className="w-5 h-5 text-slate-400 group-hover:text-orange-400 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-black text-white">{label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── My Resources (if any) ─────────────────────────────────── */}
      {myResources.length > 0 && (
        <div className="max-w-6xl mx-auto mb-12">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <Folder className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-black text-white uppercase tracking-widest">My Library</h2>
              <span className="text-[10px] font-black text-slate-600 bg-white/5 px-2 py-0.5 rounded-full">{myResources.length}</span>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-8 pr-4 py-2 bg-white/5 border border-white/8 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-white/20 w-48"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {myResources.map(r => (
              r.status !== 'ready'
                ? <ProcessingCard key={r.id} resource={r} onDelete={() => setConfirmModal({ isOpen: true, resourceId: r.id, title: r.title })} />
                : <ResourceCard key={r.id} resource={r} onDelete={() => setConfirmModal({ isOpen: true, resourceId: r.id, title: r.title })} />
            ))}
          </div>
        </div>
      )}

      {/* ── Explore ───────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-1 h-5 bg-orange-500 rounded-full" />
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Explore</h2>
        </div>

        {/* Subject filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide mb-6">
          {SUBJECT_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setSubjectFilter(s)}
              className={cn(
                'shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all border',
                subjectFilter === s
                  ? 'bg-white text-black border-white'
                  : 'bg-white/5 text-slate-400 border-white/8 hover:border-white/20 hover:text-white'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Explore grid */}
        {exploreResources.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {exploreResources.map(r => (
              <ResourceCard key={r.id} resource={r} onDelete={() => {}} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-slate-600">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No resources found for this subject yet.</p>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          initialMode={uploadMode}
        />
      )}

      {/* Delete Confirmation */}
      {confirmModal.isOpen && (
        <ConfirmationModal
          title="Delete Resource"
          message={`Are you sure you want to delete "${confirmModal.title}"? This cannot be undone.`}
          onConfirm={() => confirmModal.resourceId && deleteMutation.mutate(confirmModal.resourceId)}
          onCancel={() => setConfirmModal({ isOpen: false, resourceId: null, title: '' })}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
