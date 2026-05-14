'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assignmentsApi } from '@/lib/api'
import {
  Plus, Sparkles, FileText, Loader2,
  Zap, Search, Grid, List, Filter
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ShareAssignmentModal from '@/components/assignments/ShareAssignmentModal'
import AssignmentCard from '@/components/assignments/AssignmentCard'

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
    <div className="max-w-7xl mx-auto space-y-8 px-4 md:px-0">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-orange-500" />
            </div>
            <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">Academic Suite</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Assignments</h1>
          <p className="text-slate-500 text-sm font-medium">
            {allAssignments.length} active tasks · Powered by FlowAI Synthesis
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center p-1 bg-white/5 border border-white/10 rounded-xl">
            <button 
              onClick={() => setView('grid')}
              className={cn(
                "p-2 rounded-lg transition-all",
                view === 'grid' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-slate-500 hover:text-white"
              )}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setView('list')}
              className={cn(
                "p-2 rounded-lg transition-all",
                view === 'list' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-slate-500 hover:text-white"
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <Link href="/assignments/new" className="btn-primary h-11 px-6 text-sm whitespace-nowrap">
            <Plus className="w-4 h-4" /> New Assignment
          </Link>
        </div>
      </div>

      {/* Processing Banner */}
      {processingCount > 0 && (
        <div className="relative group overflow-hidden px-6 py-5 rounded-3xl bg-sky-500/5 border border-sky-500/20 shadow-lg shadow-sky-500/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 blur-[60px] rounded-full -mr-16 -mt-16" />
          <div className="flex items-center gap-5 relative">
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 flex items-center justify-center border border-sky-500/30">
                <Zap className="w-6 h-6 text-sky-400" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-sky-500 animate-ping" />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-sky-500 border-2 border-[#0d0d0d]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-white tracking-tight">FlowAI is synthesizing {processingCount} assignment{processingCount > 1 ? 's' : ''}</p>
              <p className="text-sm text-slate-500 font-medium mt-0.5">High-fidelity academic generation in progress. Usually takes 15-30s.</p>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20">
               <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
               <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Active</span>
            </div>
          </div>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-2">
        <div className="relative w-full sm:max-w-md group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-orange-500 transition-colors" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search titles, subjects, or keywords..."
            className="input pl-11 h-12 text-sm bg-white/5 border-white/10 hover:border-white/20 focus:border-orange-500/50 transition-all rounded-2xl" 
          />
        </div>
        <button className="hidden sm:flex items-center gap-2 px-4 h-12 rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all text-xs font-bold">
          <Filter className="w-4 h-4" /> Filter by Subject
        </button>
      </div>

      {/* Content Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-[2rem] bg-white/5 animate-pulse border border-white/5" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6' : 'space-y-4'}>
          {assignments.map((a: any) => (
            <AssignmentCard 
              key={a.id} 
              assignment={a} 
              view={view}
              onClick={() => router.push(`/assignments/${a.id}`)}
              onDelete={(e) => { e.stopPropagation(); deleteMutation.mutate(a.id) }}
              onShare={(e) => { e.stopPropagation(); setSharingAssignment(a) }} 
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center group">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-orange-500 blur-[80px] opacity-10 group-hover:opacity-20 transition-opacity" />
        <div className="w-24 h-24 bg-white/5 border border-white/10 rounded-[2.5rem] flex items-center justify-center relative transition-transform group-hover:scale-110 duration-500">
          <Sparkles className="w-10 h-10 text-slate-700 group-hover:text-orange-500 transition-colors" />
        </div>
      </div>
      <div className="space-y-2 mb-10">
        <h3 className="text-2xl font-black text-white tracking-tight">No assignments initialized</h3>
        <p className="text-slate-500 text-base font-medium max-w-sm mx-auto">Upload an assignment prompt and let FlowAI synthesize a comprehensive, academic solution for you.</p>
      </div>
      <Link href="/assignments/new" className="btn-primary h-12 px-8 rounded-2xl shadow-xl shadow-orange-500/20 active:scale-95 transition-all">
        <Plus className="w-5 h-5" /> Initialize First Assignment
      </Link>
    </div>
  )
}

