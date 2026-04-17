'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assignmentsApi } from '@/lib/api'
import {
  Plus, Sparkles, FileText, Trash2, Loader2,
  CheckCircle2, Clock, AlertCircle, ArrowRight, Zap,
  Calendar, Search, Grid, List
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { timeAgo } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ShareAssignmentModal from '@/components/assignments/ShareAssignmentModal'
import { Share2 } from 'lucide-react'

const STATUS_CONFIG: Record<string, { color: string; dot: string; icon: any; label: string }> = {
  pending:    { color: 'text-slate-500 bg-slate-100',           dot: 'bg-slate-400',    icon: Clock,         label: 'Pending' },
  processing: { color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30',                dot: 'bg-sky-500',     icon: Loader2,       label: 'AI Working' },
  completed:  { color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30',        dot: 'bg-emerald-500', icon: CheckCircle2,  label: 'Completed' },
  error:      { color: 'text-rose-600 bg-rose-50 dark:bg-rose-900/30',              dot: 'bg-rose-500',     icon: AlertCircle,   label: 'Error' },
}

export default function AssignmentsPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sharingAssignment, setSharingAssignment] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.getAll().then(r => r.data),
  })
  
  const allAssignments = data?.results || []
  
  const assignments = allAssignments.filter((a: any) => 
    a.title.toLowerCase().includes(search.toLowerCase()) || 
    (a.subject && a.subject.toLowerCase().includes(search.toLowerCase()))
  )

  const deleteMutation = useMutation({
    mutationFn: (id: number) => assignmentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      toast.success('Assignment deleted.')
    },
  })

  const processingCount = allAssignments.filter((a: any) => a.status === 'processing').length

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Assignments</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {allAssignments.length} task{allAssignments.length !== 1 ? 's' : ''} · Use AI to synthesize your assignments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link id="tour-assignments-new" href="/assignments/new" className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-black shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all">
            <Plus className="w-4 h-4" /> New Assignment
          </Link>
        </div>
      </div>

      {/* Processing Banner */}
      {processingCount > 0 && (
        <div className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 animate-in slide-in-from-top-2">
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-800 flex items-center justify-center">
              <Zap className="w-5 h-5 text-sky-500" />
            </div>
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-sky-500 animate-ping" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-sky-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-900 dark:text-white">FlowAI is synthesizing {processingCount} assignment{processingCount > 1 ? 's' : ''}</p>
            <p className="text-xs text-slate-500 mt-0.5">Extracting contexts and formalizing answers. This takes about 10-20 seconds.</p>
          </div>
          <Loader2 className="w-5 h-5 text-sky-500 animate-spin flex-shrink-0" />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assignments..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 ring-sky-500/20 outline-none transition-all"
          />
        </div>
        <div className="hidden sm:flex items-center gap-2 sm:ml-auto">
          <button
            onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-sky-500 hover:border-sky-500/40 transition-all"
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
      ) : assignments.length === 0 ? (
        <EmptyState />
      ) : (
        <div id="tour-assignments-list" className={view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3'}>
          {assignments.map((a: any) => (
            <AssignmentCard 
              key={a.id} 
              assignment={a} 
              view={view}
              onClick={() => router.push(`/assignments/${a.id}`)}
              onDelete={() => deleteMutation.mutate(a.id)}
              onShare={() => setSharingAssignment(a)}
            />
          ))}
        </div>
      )}

      {sharingAssignment && (
        <ShareAssignmentModal
          isOpen={!!sharingAssignment}
          onClose={() => setSharingAssignment(null)}
          assignmentId={sharingAssignment.id}
          assignmentTitle={sharingAssignment.title}
        />
      )}
    </div>
  )
}

function AssignmentCard({ assignment: a, view, onClick, onDelete, onShare }: any) {
  const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending
  const Icon = cfg.icon

  if (view === 'list') {
    return (
      <div 
        onClick={onClick}
        className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-sky-500/40 hover:shadow-lg hover:shadow-sky-500/5 transition-all group cursor-pointer"
      >
        <div className={cn("flex items-center justify-center w-10 h-10 rounded-xl", cfg.color)}>
           <Icon className={cn('w-5 h-5', a.status === 'processing' && 'animate-spin')} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-sky-500 transition-colors">{a.title}</h3>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
            {a.subject && <span className="font-medium text-slate-600 dark:text-slate-400">{a.subject}</span>}
            {a.subject && <span>·</span>}
            <span>{timeAgo(a.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className={cn("hidden lg:flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider", cfg.color)}>
            {cfg.label}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button 
              onClick={e => { e.stopPropagation(); onShare() }} 
              className="p-2 text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-all"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button 
              onClick={e => { e.stopPropagation(); onDelete() }} 
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div 
      onClick={onClick}
      className="group relative h-full bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:shadow-xl hover:shadow-sky-500/5 hover:border-sky-500/40 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold", cfg.color.replace('bg-', 'ring-1 ring-inset bg-').replace('text-', 'text-'))}>
          <Icon className={cn('w-3.5 h-3.5', a.status === 'processing' && 'animate-spin')} />
          {cfg.label}
        </div>
        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
          <button 
            onClick={e => { e.stopPropagation(); onShare() }} 
            className="p-1.5 text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-all"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button 
            onClick={e => { e.stopPropagation(); onDelete() }} 
            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <h3 className="font-bold text-slate-900 dark:text-white text-base leading-snug line-clamp-2 mb-2 group-hover:text-sky-500 transition-colors">{a.title}</h3>
      {a.subject && <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-4">{a.subject}</p>}

      <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-700/50 flex flex-col gap-3">
        {a.file_name ? (
           <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
             <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
             <span className="text-[10px] font-medium text-slate-500 truncate">{a.file_name}</span>
           </div>
        ) : (
           <p className="text-[11px] text-slate-400 line-clamp-1 italic">"{a.instructions}"</p>
        )}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">{format(new Date(a.created_at), 'MMM d, yyyy')}</span>
          </div>
          <span className="text-sky-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
            <ArrowRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-5 animate-in fade-in">
      <div className="relative">
        <div className="absolute inset-0 bg-sky-200 dark:bg-sky-500 blur-2xl opacity-20 animate-pulse" />
        <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-[1.5rem] flex items-center justify-center shadow-form relative border border-slate-100 dark:border-slate-700">
          <FileText className="w-10 h-10 text-sky-200 absolute rotate-12 -right-2 top-2" />
          <Sparkles className="w-8 h-8 text-sky-500 relative z-10" />
        </div>
      </div>
      <div>
         <p className="text-xl font-black text-slate-900 dark:text-white tracking-tight">No assignments yet</p>
         <p className="text-slate-400 text-sm mt-1 max-w-xs mx-auto">Upload an assignment prompt and let FlowAI write a comprehensive solution for you.</p>
      </div>
      <Link href="/assignments/new" className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-black shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all">
        <Plus className="w-4 h-4" /> Create First Assignment
      </Link>
    </div>
  )
}
