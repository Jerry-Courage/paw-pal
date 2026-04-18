'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi, getAuthToken, SERVER_URL } from '@/lib/api'
import {
  Upload, Search, Grid, List, Sparkles, Trash2, BookOpen,
  FileText, Video, Code2, Layers, Loader2, CheckCircle, Clock,
  Brain, Zap, MoreVertical, AlertTriangle, Image as ImageIcon,
  ArrowRight, Radio
} from 'lucide-react'
import { formatBytes, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import UploadModal from '@/components/library/UploadModal'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'

const ConfirmationModal = dynamic(() => import('@/components/ui/ConfirmationModal'), { ssr: false })

const TABS = [
  { label: 'All Files', value: 'all' },
  { label: 'PDFs', value: 'pdf' },
  { label: 'Videos', value: 'video' },
  { label: 'Code', value: 'code' },
]

const LIBRARY_MODES = [
  { label: 'My Library', value: 'my', icon: Layers },
  { label: 'Discover', value: 'discover', icon: Sparkles },
]

const TYPE_ICONS: Record<string, any> = {
  pdf: FileText,
  video: Video,
  code: Code2,
  slides: Layers,
}

const SUBJECT_THEMES: Record<string, { gradient: string, glow: string, icon: any, pattern: string }> = {
  Math: { gradient: 'from-blue-600/80 to-indigo-900/90', glow: 'shadow-blue-500/40', icon: Code2, pattern: 'bg-[radial-gradient(circle_at_center,_white_1px,_transparent_1px)] bg-[size:20px_20px] opacity-20' },
  Physics: { gradient: 'from-violet-600/80 to-purple-900/90', glow: 'shadow-purple-500/40', icon: Zap, pattern: 'bg-[linear-gradient(45deg,_white_1px,_transparent_1px)] bg-[size:15px_15px] opacity-10' },
  Biology: { gradient: 'from-emerald-500/80 to-teal-900/90', glow: 'shadow-emerald-500/40', icon: Layers, pattern: 'bg-[radial-gradient(circle_at_30%_30%,_white_1px,_transparent_1px)] bg-[size:10px_10px] opacity-20' },
  Chemistry: { gradient: 'from-rose-500/80 to-pink-900/90', glow: 'shadow-rose-500/40', icon: Sparkles, pattern: 'bg-[conic-gradient(white_0deg,_transparent_90deg)] bg-[size:30px_30px] opacity-10' },
  Computer: { gradient: 'from-slate-800/80 to-black/90', glow: 'shadow-slate-500/40', icon: Code2, pattern: 'bg-[grid-white/10] bg-[size:24px_24px] opacity-30' },
  General: { gradient: 'from-indigo-600/80 to-blue-900/90', glow: 'shadow-indigo-500/40', icon: FileText, pattern: 'bg-[radial-gradient(circle_at_center,_white_1px,_transparent_1px)] bg-[size:24px_24px] opacity-10' },
}

const TYPE_COLORS: Record<string, string> = {
  pdf:    'bg-rose-500/10 text-rose-400 border-rose-500/20',
  video:  'bg-violet-500/10 text-violet-400 border-violet-500/20',
  code:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  slides: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

// Fun processing messages that cycle during AI analysis
const PROCESSING_MESSAGES = [
  '📖 Reading every page...',
  '🔬 Analyzing concepts...',
  '🖼️ Describing diagrams...',
  '🧠 Building study kit...',
  '✨ Polishing notes...',
]

function ProcessingCard({ resource, onDelete }: { resource: any; onDelete: () => void }) {
  const Icon = TYPE_ICONS[resource.resource_type] || FileText

  return (
    <div className="relative overflow-hidden rounded-[2.5rem] bg-white dark:bg-slate-950 border border-slate-100 dark:border-white/10 p-8 group transition-all duration-500 shadow-xl shadow-slate-200/50 dark:shadow-none">
      {/* Dynamic Glow Background */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl animate-pulse" />
      
      <div className="relative flex items-start justify-between mb-8">
        <div className="p-4 rounded-3xl bg-rose-500/10 dark:bg-rose-500/20 text-rose-500 border border-rose-500/10 shadow-inner">
          <Icon className="w-8 h-8" />
        </div>
        <button onClick={onDelete} className="p-2.5 text-slate-300 hover:text-rose-500 transition-all rounded-xl hover:bg-rose-500/10">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-1 mb-8">
        <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight line-clamp-2">{resource.title}</h3>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{formatBytes(resource.file_size)}</p>
      </div>

      {/* Real-time Status Area */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {[0,1,2].map(i => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
            ))}
          </div>
          <span className="text-[11px] font-black text-primary uppercase tracking-[0.2em]">FlowAI Working</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 italic animate-in fade-in slide-in-from-left-2 duration-500">
             <span>{resource.status_text || '📖 Ingesting content...'}</span>
          </div>
          
          <div className="relative h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary via-violet-500 to-indigo-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(139,92,246,0.3)]"
              style={{ width: `${Math.max(resource.processing_progress || 0, 5)}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] bg-[length:200%_100%]" />
            </div>
          </div>
        </div>

        {/* Stall Detection */}
        {new Date().getTime() - new Date(resource.created_at).getTime() > 300000 && (
          <div className="pt-2 flex items-center gap-2 text-[10px] font-black text-rose-500 uppercase tracking-widest animate-pulse">
            <AlertTriangle className="w-3 h-3" /> Queue Delay Detected
          </div>
        )}
      </div>
    </div>
  )
}

function ResourceCard({ resource: r, view, onDelete, curated }: any) {
  const Icon = TYPE_ICONS[r.resource_type] || FileText
  const isProcessing = r.status !== 'ready'
  
  if (isProcessing) return <ProcessingCard resource={r} onDelete={onDelete} />

  const qc = useQueryClient()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)

  const uploadMutation = useMutation({
    mutationFn: (file: File) => libraryApi.updateResourceCover(r.id, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: r.resource_type ? ['resources', r.resource_type] : ['resources'] })
      toast.success('Cover image updated.')
      setIsUploading(false)
    },
    onError: () => {
      toast.error('Upload failed.')
      setIsUploading(false)
    }
  })

  // ─── CLONE / SAVE FUNCTIONALITY ───
  const saveMutation = useMutation({
    mutationFn: () => libraryApi.cloneResource(r.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      toast.success('Resource saved to your library!', {
        description: 'You can now find it in the "My Library" tab.'
      })
      setIsSaving(false)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Saving failed.')
      setIsSaving(false)
    }
  })

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) return toast.error('File too large (max 5MB)')
      setIsUploading(true)
      uploadMutation.mutate(file)
    }
  }

  const theme = Object.entries(SUBJECT_THEMES).find(([key]) => 
    r.subject?.toLowerCase().includes(key.toLowerCase()) || 
    r.title?.toLowerCase().includes(key.toLowerCase())
  )?.[1] || SUBJECT_THEMES.General

  const thumbnail = r.cover_image_url || r.thumbnail_url

  if (view === 'list') {
    return (
      <div className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-white/5 dark:bg-slate-900/40 backdrop-blur-xl border border-white/10 hover:border-primary/40 hover:bg-white/10 transition-all group">
        <div className={cn('p-2.5 rounded-xl border flex-shrink-0', TYPE_COLORS[r.resource_type] || 'bg-slate-800 text-slate-400 border-slate-700')}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <Link href={`/library/${r.id}`} className="text-sm font-bold text-slate-900 dark:text-white hover:text-primary transition-colors truncate block">{r.title}</Link>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 font-medium">
            {r.subject && <span className="bg-slate-800/50 px-2 py-0.5 rounded text-[10px] font-black uppercase text-slate-400">{r.subject}</span>}
            <span>{formatBytes(r.file_size)}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {r.has_study_kit && (
            <div className="flex items-center gap-2">
               <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-1.5 rounded-full">
                <Brain className="w-3.5 h-3.5" /> AI Ready
               </span>
               <button className="p-2 bg-primary/20 hover:bg-primary text-primary hover:text-white rounded-xl transition-all shadow-lg active:scale-95">
                 <Radio className="w-4 h-4" />
               </button>
            </div>
          )}
          <span className="text-xs text-slate-500 font-medium">{timeAgo(r.created_at)}</span>
          <button onClick={onDelete} className="p-2 opacity-100 sm:opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 transition-all rounded-xl hover:bg-rose-400/10">
            <Trash2 className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <Link id={`resource-card-${r.id}`} href={`/library/${r.id}`} className="block group h-full">
      <div className="relative h-full rounded-[2.5rem] bg-white dark:bg-slate-950 border border-slate-100 dark:border-white/10 overflow-hidden hover:border-primary/50 hover:shadow-[0_0_40px_rgba(139,92,246,0.15)] hover:-translate-y-2 transition-all duration-500 flex flex-col group/card">
        
        {/* Cover Canvas */}
        <div className="h-52 sm:h-56 relative overflow-hidden bg-slate-900">
          {thumbnail ? (
            <img 
              src={thumbnail} 
              className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-1000" 
              alt={r.title}
            />
          ) : (
            <div className={cn("w-full h-full bg-gradient-to-br flex items-center justify-center relative", theme.gradient)}>
              <div className={cn("absolute inset-0", theme.pattern)} />
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="p-4 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl transform group-hover/card:rotate-[10deg] transition-transform duration-500">
                  <theme.icon className="w-10 h-10 text-white drop-shadow-lg" />
                </div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em]">{r.subject || "Research"}</p>
              </div>
              
              {/* Abstract accents */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/20 rounded-full blur-2xl -ml-5 -mb-5" />
            </div>
          )}

          {/* Glass Badges */}
          <div className="absolute top-4 left-4 flex flex-col gap-2">
             <div className={cn(
               "flex items-center gap-2 px-3 py-1.5 rounded-2xl backdrop-blur-xl border border-white/20 text-[10px] font-black uppercase text-white shadow-2xl",
               r.resource_type === 'pdf' ? 'bg-rose-500/50' : 'bg-indigo-500/50'
             )}>
               <Icon className="w-3.5 h-3.5" />
               {r.resource_type}
             </div>
             
             <button
               onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click(); }}
               className="w-9 h-9 flex items-center justify-center bg-black/40 hover:bg-primary text-white rounded-xl backdrop-blur-md transition-all shadow-xl border border-white/10 opacity-0 group-hover/card:opacity-100 translate-x-[-10px] group-hover/card:translate-x-0 group-hover/card:delay-75"
             >
               {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
             </button>
             <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          </div>

          {/* Quick Actions */}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            {!curated ? (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
                className="w-9 h-9 flex items-center justify-center opacity-0 group-hover/card:opacity-100 bg-black/40 hover:bg-rose-500 text-white rounded-xl backdrop-blur-md transition-all shadow-xl translate-x-[10px] group-hover/card:translate-x-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsSaving(true); saveMutation.mutate(); }}
                disabled={isSaving}
                className="w-9 h-9 flex items-center justify-center opacity-0 group-hover/card:opacity-100 bg-primary/90 hover:bg-primary text-white rounded-xl backdrop-blur-md transition-all shadow-xl translate-x-[10px] group-hover/card:translate-x-0"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              </button>
            )}
            {r.has_study_kit && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} // This will eventually trigger play
                className="w-9 h-9 flex items-center justify-center opacity-0 group-hover/card:opacity-100 bg-emerald-500/80 hover:bg-emerald-500 text-white rounded-xl backdrop-blur-md transition-all shadow-xl hover:scale-110 active:scale-95 translate-x-[10px] group-hover/card:translate-x-0 delay-75"
              >
                <Radio className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Info Zone */}
        <div className="p-6 flex-1 flex flex-col relative z-20">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border border-slate-200/50 dark:border-white/5">
                {r.subject || "General"}
              </span>
              {r.has_study_kit && (
                <div className="flex items-center gap-1 text-emerald-500 animate-pulse">
                  <Sparkles className="w-3 h-3 fill-current" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Active Kit</span>
                </div>
              )}
            </div>
            <h3 className="font-black text-slate-900 dark:text-white text-lg leading-tight group-hover/card:text-primary transition-colors line-clamp-2">
              {r.title}
            </h3>
            {curated && (
               <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wider italic">
                 Curated by {r.author_name || 'FlowState Team'}
               </p>
            )}
          </div>

          {/* Footer Metrics */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Size</span>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{formatBytes(r.file_size)}</span>
              </div>
              <div className="w-px h-6 bg-slate-200 dark:bg-white/10" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Added</span>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{timeAgo(r.created_at)}</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center group-hover/card:bg-primary group-hover/card:text-white transition-colors">
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Animated Glow on Kit Ready */}
        {r.has_study_kit && (
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
        )}
      </div>
    </Link>
  )
}

export default function LibraryPage() {
  const [tab, setTab] = useState('all')
  const [mode, setMode] = useState<'my' | 'discover'>('my')
  const [search, setSearch] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    resourceId: number | null;
    title: string;
  }>({
    isOpen: false,
    resourceId: null,
    title: ''
  })
  const qc = useQueryClient()

  const typeFilter = tab !== 'all' ? tab : undefined
  const { data, isLoading } = useQuery({
    queryKey: ['resources', mode, typeFilter],
    queryFn: () => (mode === 'my' 
      ? libraryApi.getResources(typeFilter) 
      : libraryApi.getCuratedResources(typeFilter)
    ).then((r) => r.data),
  })

  // Real-time processing updates via SSE (replaces polling)
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
            const dataLine = part.split('\n').find((l) => l.startsWith('data:'))
            const eventLine = part.split('\n').find((l) => l.startsWith('event:'))
            const evt = eventLine?.replace('event:', '').trim()
            if (!dataLine || evt === 'heartbeat' || evt === 'timeout') continue
            try {
              const pulse = JSON.parse(dataLine.replace('data:', '').trim())
              
              if (evt === 'status' || evt === 'snapshot') {
                const updates = Array.isArray(pulse) ? pulse : [pulse]
                
                // ─── THE "LIVE-INJECTOR" ENGINE ───
                // Instead of a full refetch, we surgically update the specific cards.
                // This makes the progress bar move percentage-by-percentage in real-time.
                qc.setQueryData(['resources', typeFilter], (old: any) => {
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
                            has_study_kit: up.status === 'ready'
                        }
                    }
                  })
                  return { ...old, results: newResults }
                })
              }
              if (evt === 'done') { reader.cancel(); return }
            } catch (err) {
              console.error('SSE Pulse Parse Error', err)
            }
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
      qc.invalidateQueries({ queryKey: ['resources'] }); 
      toast.success('Material decommissioned.');
      setConfirmModal({ isOpen: false, resourceId: null, title: '' });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Decommissioning failed.');
      setConfirmModal({ isOpen: false, resourceId: null, title: '' });
    }
  })

  const confirmDelete = (resource: any) => {
    setConfirmModal({
      isOpen: true,
      resourceId: resource.id,
      title: resource.title
    })
  }

  const resources = (data?.results || []).filter((r: any) =>
    r.title.toLowerCase().includes(search.toLowerCase())
  )

  const processingCount = resources.filter((r: any) => r.status !== 'ready').length

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-primary/20">
              FlowState Library
            </span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            {mode === 'my' ? 'Your Knowledge' : 'Global Discovery'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-sm">
            {mode === 'my' 
              ? 'Manage your personal research, videos, and generated study kits.'
              : 'Browse high-end pre-generated notes and save them to your library.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex items-center p-1.5 bg-slate-100 dark:bg-slate-900/50 rounded-2xl border border-slate-200/50 dark:border-white/5">
            {LIBRARY_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value as any)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all duration-300',
                  mode === m.value
                    ? 'bg-white dark:bg-slate-800 text-primary shadow-lg shadow-primary/5 ring-1 ring-black/5 dark:ring-white/10'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                )}
              >
                <m.icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-white/10 mx-1 hidden md:block" />

          <button id="tour-library-upload" onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-black shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all">
            <Upload className="w-4 h-4" /> Upload
          </button>
        </div>
      </div>

      {/* Processing Banner */}
      {processingCount > 0 && (
        <div className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-primary/5 border border-primary/20 animate-in slide-in-from-top-2">
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary animate-ping" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-900 dark:text-white">FlowAI is analyzing {processingCount} material{processingCount > 1 ? 's' : ''}</p>
            <p className="text-xs text-slate-500 mt-0.5">Extracting text, describing diagrams, and building your study kit. This takes 1–3 minutes for large PDFs.</p>
          </div>
          <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                'px-4 py-1.5 text-xs font-black rounded-lg transition-all uppercase tracking-wide',
                tab === t.value
                  ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 sm:justify-end">
          {/* Search */}
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search materials..."
              className="w-full sm:w-52 pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 ring-primary/20 outline-none transition-all"
            />
          </div>
          {/* View toggle */}
          <button
            onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-primary hover:border-primary/40 transition-all"
          >
            {view === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : resources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-5 animate-in fade-in">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center">
            <Upload className="w-10 h-10 text-slate-300" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900 dark:text-white">Nothing here yet</p>
            <p className="text-slate-400 text-sm mt-1 max-w-xs">Upload a PDF, YouTube video, or code file — FlowAI will turn it into a full study kit automatically.</p>
          </div>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-black shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all">
            <Upload className="w-4 h-4" /> Upload First Material
          </button>
        </div>
      ) : (
        <div className={view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-2'}>
          {resources.map((r: any) => (
            <ResourceCard 
              key={r.id} 
              resource={r} 
              view={view} 
              onDelete={() => confirmDelete(r)}
              curated={mode === 'discover'}
            />
          ))}
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}

      <ConfirmationModal 
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, resourceId: null, title: '' })}
        onConfirm={() => confirmModal.resourceId && deleteMutation.mutate(confirmModal.resourceId)}
        isLoading={deleteMutation.isPending}
        title="Decommission Material"
        message={`Are you sure you want to permanently delete "${confirmModal.title}" from your study library? This will redact all AI insights and study kits associated with this file.`}
        confirmText="Decommission"
        type="danger"
      />
    </div>
  )
}
