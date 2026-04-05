'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import {
  Upload, Search, Grid, List, Sparkles, Trash2, BookOpen,
  FileText, Video, Code2, Layers, Loader2, CheckCircle, Clock,
  Brain, Zap, MoreVertical
} from 'lucide-react'
import { formatBytes, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import UploadModal from '@/components/library/UploadModal'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'All Files', value: 'all' },
  { label: 'PDFs', value: 'pdf' },
  { label: 'Videos', value: 'video' },
  { label: 'Code', value: 'code' },
]

const TYPE_ICONS: Record<string, any> = {
  pdf: FileText,
  video: Video,
  code: Code2,
  slides: Layers,
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
  const [msgIdx, setMsgIdx] = useState(0)
  const [dots, setDots] = useState(1)

  useEffect(() => {
    const msgTimer = setInterval(() => setMsgIdx(i => (i + 1) % PROCESSING_MESSAGES.length), 2800)
    const dotTimer = setInterval(() => setDots(d => d === 3 ? 1 : d + 1), 600)
    return () => { clearInterval(msgTimer); clearInterval(dotTimer) }
  }, [])

  const Icon = TYPE_ICONS[resource.resource_type] || FileText

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700/60 p-5 group">
      {/* animated shimmer background */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-[shimmer_2s_infinite] bg-[length:200%_100%]" />

      <div className="relative flex items-start justify-between mb-4">
        <div className={cn('p-2.5 rounded-xl border', TYPE_COLORS[resource.resource_type] || 'bg-slate-700 text-slate-400 border-slate-600')}>
          <Icon className="w-5 h-5" />
        </div>
        <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-rose-400 transition-all rounded-lg hover:bg-rose-400/10">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <p className="text-sm font-bold text-white leading-snug mb-1 line-clamp-2">{resource.title}</p>
      <p className="text-xs text-slate-500 mb-4">{formatBytes(resource.file_size)}</p>

      {/* Processing indicator */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[0,1,2].map(i => (
              <span
                key={i}
                className={cn(
                  'w-1.5 h-1.5 rounded-full bg-primary transition-opacity duration-300',
                  i < dots ? 'opacity-100' : 'opacity-20'
                )}
              />
            ))}
          </div>
          <span className="text-[11px] font-bold text-primary uppercase tracking-widest">FlowAI Working</span>
        </div>
        <div className="h-7 overflow-hidden">
          <p key={msgIdx} className="text-xs text-slate-400 font-medium animate-in slide-in-from-bottom-2 duration-500">
            {PROCESSING_MESSAGES[msgIdx]}
          </p>
        </div>
        <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-violet-500 rounded-full animate-[progressPulse_2s_ease-in-out_infinite]" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  )
}

function ResourceCard({ resource: r, view, onDelete }: any) {
  const Icon = TYPE_ICONS[r.resource_type] || FileText
  const colorClass = TYPE_COLORS[r.resource_type] || 'bg-slate-700 text-slate-400 border-slate-600'
  const isProcessing = r.status !== 'ready'

  if (isProcessing) return <ProcessingCard resource={r} onDelete={onDelete} />

  if (view === 'list') {
    return (
      <div className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-white/3 dark:bg-slate-800/40 border border-slate-200/10 dark:border-slate-700/40 hover:border-primary/30 hover:bg-primary/3 transition-all group">
        <div className={cn('p-2 rounded-xl border flex-shrink-0', colorClass)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <Link href={`/library/${r.id}`} className="text-sm font-bold text-slate-900 dark:text-white hover:text-primary transition-colors truncate block">{r.title}</Link>
          <div className="text-xs text-slate-400 mt-0.5">{r.subject && <span className="mr-2">{r.subject}</span>}<span>{formatBytes(r.file_size)}</span></div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {r.has_study_kit && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
              <Brain className="w-3 h-3" /> AI Notes
            </span>
          )}
          <span className="text-xs text-slate-500">{timeAgo(r.created_at)}</span>
          <button onClick={onDelete} className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 transition-all rounded-lg">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <Link href={`/library/${r.id}`} className="block group">
      <div className="relative h-full rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 p-5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300">
        
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className={cn('p-2.5 rounded-xl border', colorClass)}>
            <Icon className="w-5 h-5" />
          </div>
          <button
            onClick={(e) => { e.preventDefault(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-400/10 transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Title */}
        <p className="font-bold text-slate-900 dark:text-white text-sm leading-snug line-clamp-2 mb-1.5 group-hover:text-primary transition-colors">{r.title}</p>
        {r.subject && <p className="text-xs text-slate-400 mb-3 font-medium">{r.subject}</p>}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2">
            {r.has_study_kit ? (
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                <CheckCircle className="w-3 h-3" /> Study Ready
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <Clock className="w-3 h-3" /> {formatBytes(r.file_size)}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400">{timeAgo(r.created_at)}</span>
        </div>

        {/* AI Notes badge */}
        {r.has_study_kit && (
          <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.3)]" />
        )}
      </div>
    </Link>
  )
}

export default function LibraryPage() {
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const qc = useQueryClient()

  const typeFilter = tab !== 'all' ? tab : undefined
  const { data, isLoading } = useQuery({
    queryKey: ['resources', typeFilter],
    queryFn: () => libraryApi.getResources(typeFilter).then((r) => r.data),
    // Auto-refresh if any resource is still processing (8s to reduce server load)
    refetchInterval: (query) => {
      const results = (query.state.data as any)?.results || []
      return results.some((r: any) => r.status !== 'ready') ? 8000 : false
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => libraryApi.deleteResource(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['resources'] }); toast.success('Removed.') },
  })

  const resources = (data?.results || []).filter((r: any) =>
    r.title.toLowerCase().includes(search.toLowerCase())
  )

  const processingCount = resources.filter((r: any) => r.status !== 'ready').length

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Study Library</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {resources.length} material{resources.length !== 1 ? 's' : ''} · Upload a PDF or video to get started
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/library/flashcards" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 hover:border-primary/40 hover:text-primary transition-all shadow-sm">
            <BookOpen className="w-4 h-4" /> Flashcards
          </Link>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-black shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all">
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
            <ResourceCard key={r.id} resource={r} view={view} onDelete={() => deleteMutation.mutate(r.id)} />
          ))}
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}
