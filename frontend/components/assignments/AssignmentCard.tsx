'use client'

import { format } from 'date-fns'
import { Calendar, ArrowRight, Share2, Trash2, Clock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  pending:    { color: 'text-slate-400 bg-white/5 border-white/8',          icon: Clock,        label: 'Pending' },
  processing: { color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',      icon: Loader2,      label: 'AI Working' },
  completed:  { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2, label: 'Completed' },
  error:      { color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',   icon: AlertCircle,  label: 'Error' },
}

interface AssignmentCardProps {
  assignment: any
  view: 'grid' | 'list'
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  onShare: (e: React.MouseEvent) => void
}

export default function AssignmentCard({ assignment: a, view, onClick, onDelete, onShare }: AssignmentCardProps) {
  const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending
  const Icon = cfg.icon

  if (view === 'list') {
    return (
      <div 
        onClick={onClick} 
        className="group flex items-center gap-4 px-6 py-4 rounded-2xl bg-[#111] hover:bg-[#161616] border border-white/5 hover:border-white/10 transition-all cursor-pointer shadow-sm"
      >
        <div className={cn('flex items-center justify-center w-10 h-10 rounded-xl border transition-all group-hover:scale-105', cfg.color)}>
          <Icon className={cn('w-5 h-5', a.status === 'processing' && 'animate-spin')} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white truncate group-hover:text-orange-500 transition-colors">{a.title}</h3>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-medium">
            {a.subject && <span className="text-slate-400">{a.subject}</span>}
            {a.subject && <span className="opacity-30">·</span>}
            <span>{timeAgo(a.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={onShare} className="p-2 text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 rounded-xl transition-all">
            <Share2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-800 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
      </div>
    )
  }

  return (
    <div 
      onClick={onClick} 
      className="group relative bg-[#111] rounded-3xl p-6 border border-white/5 hover:border-white/10 hover:-translate-y-1 transition-all cursor-pointer flex flex-col min-h-[180px] shadow-lg overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-orange-500/5 blur-3xl rounded-full group-hover:bg-orange-500/10 transition-all duration-500" />
      
      <div className="flex items-start justify-between mb-4 relative">
        <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border', cfg.color)}>
          <Icon className={cn('w-3.5 h-3.5', a.status === 'processing' && 'animate-spin')} />
          {cfg.label}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={onShare} className="p-2 text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 rounded-xl transition-all">
            <Share2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="relative">
        <h3 className="font-bold text-white text-base leading-tight line-clamp-2 mb-1.5 group-hover:text-orange-500 transition-colors">
          {a.title}
        </h3>
        {a.subject && (
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{a.subject}</p>
        )}
      </div>

      <div className="mt-auto pt-6 flex items-center justify-between border-t border-white/5">
        <div className="flex items-center gap-2 text-slate-500">
          <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest leading-none">Created</span>
            <span className="text-[11px] font-bold text-slate-400">{format(new Date(a.created_at), 'MMM d, yyyy')}</span>
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-white/5 group-hover:bg-orange-500/10 flex items-center justify-center transition-all">
          <ArrowRight className="w-4 h-4 text-slate-700 group-hover:text-orange-500 transition-all" />
        </div>
      </div>
    </div>
  )
}
