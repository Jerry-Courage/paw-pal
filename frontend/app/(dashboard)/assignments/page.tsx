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
  pending:    { color: 'text-slate-400 bg-white/5 border-white/8',          dot: 'bg-slate-500',    icon: Clock,        label: 'Pending' },
  processing: { color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',      dot: 'bg-sky-500',      icon: Loader2,      label: 'AI Working' },
  completed:  { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-500', icon: CheckCircle2, label: 'Completed' },
  error:      { color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',   dot: 'bg-rose-500',     icon: AlertCircle,  label: 'Error' },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); toast.success('Assignment deleted.') },
  })
  const processingCount = allAssignments.filter((a: any) => a.status === 'processing').length

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Assignments</h1>
          <p className="text-slate-500 text-sm mt-0.5">{allAssignments.length} task{allAssignments.length !== 1 ? 's' : ''} · AI-synthesized solutions</p>
        </div>
        <Link href="/assignments/new" className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> New Assignment
        </Link>
      </div>

      {processingCount > 0 && (
        <div className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-sky-500/5 border border-sky-500/20">
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-sky-400" />
            </div>
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-sky-500 animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-sky-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">FlowAI is synthesizing {processingCount} assignment{processingCount > 1 ? 's' : ''}</p>
            <p className="text-xs text-slate-500 mt-0.5">This takes about 10–20 seconds.</p>
          </div>
          <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
        </div>
      )}

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assignments..."
            className="input pl-9 text-sm" />
        </div>
        <button onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}
          className="p-2.5 rounded-xl bg-white/5 border border-white/8 text-slate-500 hover:text-white transition-all">
          {view === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-44 rounded-2xl bg-white/3 animate-pulse" />)}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3'}>
          {assignments.map((a: any) => (
            <AssignmentCard key={a.id} assignment={a} view={view}
              onClick={() => router.push(`/assignments/${a.id}`)}
              onDelete={() => deleteMutation.mutate(a.id)}
              onShare={() => setSharingAssignment(a)} />
          ))}
        </div>
      )}

      {sharingAssignment && (
        <ShareAssignmentModal isOpen={!!sharingAssignment} onClose={() => setSharingAssignment(null)}
          assignmentId={sharingAssignment.id} assignmentTitle={sharingAssignment.title} />
      )}
    </div>
  )
}

function AssignmentCard({ assignment: a, view, onClick, onDelete, onShare }: any) {
  const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending
  const Icon = cfg.icon

  if (view === 'list') {
    return (
      <div onClick={onClick} className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-[#1a1a1a] border border-white/6 hover:border-white/12 transition-all group cursor-pointer">
        <div className={cn('flex items-center justify-center w-9 h-9 rounded-xl border', cfg.color)}>
          <Icon className={cn('w-4 h-4', a.status === 'processing' && 'animate-spin')} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white truncate group-hover:text-orange-400 transition-colors">{a.title}</h3>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-600">
            {a.subject && <span>{a.subject}</span>}
            {a.subject && <span>·</span>}
            <span>{timeAgo(a.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={e => { e.stopPropagation(); onShare() }} className="p-1.5 text-slate-600 hover:text-sky-400 transition-all rounded-lg hover:bg-sky-500/10">
            <Share2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete() }} className="p-1.5 text-slate-600 hover:text-rose-400 transition-all rounded-lg hover:bg-rose-500/10">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div onClick={onClick} className="group relative bg-[#1a1a1a] border border-white/6 rounded-2xl p-5 hover:border-white/12 hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border', cfg.color)}>
          <Icon className={cn('w-3 h-3', a.status === 'processing' && 'animate-spin')} />
          {cfg.label}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={e => { e.stopPropagation(); onShare() }} className="p-1.5 text-slate-600 hover:text-sky-400 rounded-lg hover:bg-sky-500/10 transition-all">
            <Share2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete() }} className="p-1.5 text-slate-600 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <h3 className="font-bold text-white text-sm leading-snug line-clamp-2 mb-1 group-hover:text-orange-400 transition-colors">{a.title}</h3>
      {a.subject && <p className="text-[11px] text-slate-600 mb-4">{a.subject}</p>}
      <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-slate-600">
          <Calendar className="w-3 h-3" />
          <span className="text-[10px] font-bold">{format(new Date(a.created_at), 'MMM d, yyyy')}</span>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-700 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all" />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-5">
      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center">
        <FileText className="w-8 h-8 text-slate-600" />
      </div>
      <div>
        <p className="text-lg font-black text-white">No assignments yet</p>
        <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">Upload an assignment prompt and let FlowAI write a comprehensive solution.</p>
      </div>
      <Link href="/assignments/new" className="btn-primary text-sm">
        <Plus className="w-4 h-4" /> Create First Assignment
      </Link>
    </div>
  )
}

