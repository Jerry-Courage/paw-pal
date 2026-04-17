'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assignmentsApi } from '@/lib/api'
import {
  ArrowLeft, Sparkles, FileText, Download, Loader2,
  CheckCircle2, Clock, AlertCircle, Cpu, CalendarPlus,
  Zap, Wand2, ArrowRight, FileDown, UserCheck, ShieldCheck,
  Activity, ShieldAlert, BadgeCheck, Layers, Share2
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import ShareAssignmentModal from '@/components/assignments/ShareAssignmentModal'

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending:    { color: 'text-slate-500 ring-slate-200',   label: 'Pending' },
  processing: { color: 'text-sky-600 ring-sky-200',       label: 'AI Working' },
  completed:  { color: 'text-emerald-600 ring-emerald-200', label: 'Completed' },
  error:      { color: 'text-rose-600 ring-rose-200',     label: 'Error' },
}

export default function AssignmentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const qc = useQueryClient()
  const id = parseInt(params.id)
  
  const [refinePrompt, setRefinePrompt] = useState('')
  const [showSpecialized, setShowSpecialized] = useState(false)
  const [auditReport, setAuditReport] = useState<any>(null)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: assignment, isLoading } = useQuery({ 
    queryKey: ['assignment', id], 
    queryFn: () => assignmentsApi.get(id).then(r => r.data),
    refetchInterval: (query: any) => query.state.data?.status === 'processing' ? 2500 : false
  })
  
  const a = assignment

  const solveMutation = useMutation({ 
    mutationFn: () => assignmentsApi.solve(id), 
    onSuccess: () => qc.invalidateQueries({ queryKey:['assignment', id] }) 
  })
  
  const refineMutation = useMutation({ 
    mutationFn: () => assignmentsApi.refine(id, refinePrompt), 
    onSuccess: (res) => { 
      qc.invalidateQueries({ queryKey:['assignment', id] })
      setRefinePrompt('')
      toast.success('Solution refined.')
      
      // tactical intercept for auto-export
      if (res.data?.action === 'export_pdf') handleExport('pdf')
      if (res.data?.action === 'export_docx') handleExport('docx')
    } 
  })
  
  const roadmapMutation = useMutation({ 
    mutationFn: () => assignmentsApi.generateRoadmap(id), 
    onSuccess: (res) => toast.success(res.data.message) 
  })
    const transformMutation = useMutation({ 
    mutationFn: () => assignmentsApi.transformToWorkspace(id), 
    onSuccess: (res) => { 
      toast.success('Workspace created!')
      router.push(`/workspace/${res.data.workspace_id}`) 
    } 
  })

  const humanizeMutation = useMutation({
    mutationFn: () => assignmentsApi.humanize(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey:['assignment', id] })
      toast.success("Applied 'Vanish' Protocol (Humanizer)")
    }
  })
  
  const originalityMutation = useMutation({
    mutationFn: () => assignmentsApi.originality(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey:['assignment', id] })
      toast.success("Engaged 'Originality Shield' (Anti-Plagiarism)")
    }
  })

  const detectMutation = useMutation({
    mutationFn: () => assignmentsApi.detect(id),
    onSuccess: (res) => {
      setAuditReport(res.data)
      setIsAuditModalOpen(true)
      toast.success("Mission Audit Complete!")
    }
  })

  useEffect(() => {
    if (a?.status === 'completed' && scrollRef.current) {
        // Auto scroll to bottom of chat history when new message comes in, but avoid aggressive scrolling
    }
  }, [a?.chat_history?.length])

  const handleExport = async (fmt: 'pdf' | 'docx') => {
    let downloadTriggered = false
    try {
      const res = await assignmentsApi.export(id, fmt)
      if (res.data) {
        const url = window.URL.createObjectURL(new Blob([res.data]))
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `${a.title.replace(/\s+/g, '_')}.${fmt}`)
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
        downloadTriggered = true
        toast.success(`Successfully exported as ${fmt.toUpperCase()}`)
      }
    } catch (err) {
      console.error('Export signal artifact:', err)
      // Only show error if we didn't actually get the file
      if (!downloadTriggered) {
        toast.error(`Failed to export as ${fmt.toUpperCase()}`)
      }
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-[80vh]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Loading Assignment...</p>
      </div>
    </div>
  )

  if (!a) return (
    <div className="flex items-center justify-center h-[80vh]">
      <p>Assignment not found.</p>
    </div>
  )

  const visibleHistory = (a.chat_history || []).filter((m: any) => m.role !== 'system')

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)] -m-4 md:-m-6 overflow-hidden bg-white dark:bg-slate-950 transition-colors duration-500">
      
      {/* ── Tactical Sidebar (Left) ─────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[380px] border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 overflow-y-auto custom-scrollbar">
        <div className="p-8 space-y-10">
          
          {/* Header & Status */}
          <div className="space-y-4">
            <Link href="/assignments" className="inline-flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-sky-500 uppercase tracking-widest transition-colors mb-2">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Theater
            </Link>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                 <span className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ring-1 ring-inset shadow-sm", STATUS_CONFIG[a.status]?.color)}>
                  {STATUS_CONFIG[a.status]?.label || a.status}
                </span>
                {a.subject && <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">{a.subject}</span>}
              </div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">{a.title}</h1>
            </div>
          </div>

          {/* Research Input Source */}
          <div className="bg-white dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 rounded-3xl p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-sky-400/5 to-transparent rounded-full -mr-8 -mt-8" />
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-sky-500" /> Research Data
            </h4>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 leading-relaxed italic mb-4 line-clamp-4 group-hover:line-clamp-none transition-all duration-500">
               "{a.instructions || 'No specific instructions provided.'}"
            </p>
            {a.file_name && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl">
                <div className="p-2 bg-sky-500 text-white rounded-xl"><Download className="w-3.5 h-3.5" /></div>
                <div className="min-w-0">
                   <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{a.file_name}</p>
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Master Source</p>
                </div>
              </div>
            )}
          </div>

          {/* Tactical Ops */}
          <div className="space-y-6">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-500" /> Strategic Actions
            </h4>
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={()=>roadmapMutation.mutate()} 
                disabled={a.status !== 'completed' || roadmapMutation.isPending || refineMutation.isPending} 
                className="flex items-center gap-4 p-4 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-sky-500 transition-all text-left font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="p-2.5 bg-sky-50 dark:bg-sky-900/50 text-sky-500 rounded-xl">
                  {roadmapMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <CalendarPlus className="w-5 h-5" />}
                </div>
                <div className="min-w-0 text-sm">Create Study Plan</div>
              </button>
              <button 
                onClick={()=>transformMutation.mutate()} 
                disabled={a.status !== 'completed' || transformMutation.isPending || refineMutation.isPending} 
                className="flex items-center gap-4 p-4 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-emerald-500 transition-all text-left font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/50 text-emerald-500 rounded-xl">
                   {transformMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cpu className="w-5 h-5" />}
                </div>
                <div className="min-w-0 text-sm">Build Workspace</div>
              </button>
              <button 
                onClick={()=>setIsShareModalOpen(true)} 
                disabled={a.status !== 'completed' || refineMutation.isPending} 
                className="flex items-center gap-4 p-4 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-violet-500 transition-all text-left font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="p-2.5 bg-violet-50 dark:bg-violet-900/50 text-violet-500 rounded-xl">
                   <Share2 className="w-5 h-5" />
                </div>
                <div className="min-w-0 text-sm">Share to Collab Space</div>
              </button>
            </div>
          </div>

          {/* Intelligence Polishing */}
          <div className="space-y-6">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-500" /> Intelligence Suite
            </h4>
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={()=>humanizeMutation.mutate()} 
                disabled={a.status !== 'completed' || humanizeMutation.isPending || refineMutation.isPending} 
                className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl hover:border-sky-500 transition-all text-left font-bold disabled:opacity-40 disabled:cursor-not-allowed group/btn shadow-sm"
              >
                <div className="p-2.5 bg-sky-50 dark:bg-sky-900/50 text-sky-500 rounded-xl group-hover/btn:scale-110 transition-transform">
                  {humanizeMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserCheck className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                   <div className="text-sm text-slate-900 dark:text-slate-100">Humanize Draft</div>
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vanish Protocol</div>
                </div>
              </button>
              
              <button 
                onClick={()=>originalityMutation.mutate()} 
                disabled={a.status !== 'completed' || originalityMutation.isPending || refineMutation.isPending} 
                className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl hover:border-violet-500 transition-all text-left font-bold disabled:opacity-40 disabled:cursor-not-allowed group/btn shadow-sm"
              >
                <div className="p-2.5 bg-violet-50 dark:bg-violet-900/50 text-violet-500 rounded-xl group-hover/btn:scale-110 transition-transform">
                   {originalityMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                   <div className="text-sm text-slate-900 dark:text-slate-100">Pure Originality</div>
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anti-Plagiarism</div>
                </div>
              </button>

              <button 
                onClick={()=>detectMutation.mutate()} 
                disabled={a.status !== 'completed' || detectMutation.isPending || refineMutation.isPending} 
                className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl hover:border-emerald-500 transition-all text-left font-bold disabled:opacity-40 disabled:cursor-not-allowed group/btn shadow-sm"
              >
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/50 text-emerald-500 rounded-xl group-hover/btn:scale-110 transition-transform">
                   {detectMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldAlert className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                   <div className="text-sm text-slate-900 dark:text-slate-100">Scan Integrity</div>
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Double Audit</div>
                </div>
              </button>
            </div>
          </div>

          {/* Exports */}
          <div className="pt-4">
             <div className="grid grid-cols-2 gap-3">
                <button onClick={() => handleExport('pdf')} disabled={a.status !== 'completed' || refineMutation.isPending} className="p-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black rounded-xl hover:opacity-90 transition-all uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed">Export PDF</button>
                <button onClick={() => handleExport('docx')} disabled={a.status !== 'completed' || refineMutation.isPending} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed">Word Doc</button>
             </div>
          </div>

        </div>
      </div>

      {/* ── Document Canvas (Right) ─────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-950 overflow-hidden relative">
        
        {/* Mobile Header (Hidden on LG) */}
        <div className="lg:hidden px-6 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
           <Link href="/assignments" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"><ArrowLeft className="w-5 h-5" /></Link>
           <h1 className="text-sm font-black truncate px-4">{a.title}</h1>
           <div className={cn("px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest", STATUS_CONFIG[a.status]?.color)}>{a.status}</div>
        </div>

        {/* Scrollable Document Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar relative px-6 py-12 md:px-24 xl:px-32">
          <div className="max-w-4xl mx-auto pb-80 md:pb-48">
            
            {a.status === 'completed' ? (
              <div className="space-y-16 animate-in fade-in duration-1000 slide-in-from-bottom-4">
                
                {/* AI Document Container */}
                <div className="relative group">
                   <div className="absolute -inset-4 bg-gradient-to-b from-sky-400/5 to-transparent blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000 -z-10" />
                   <div className="prose-ai max-w-none text-slate-800 dark:text-slate-200">
                     <ReactMarkdown>{a.ai_response}</ReactMarkdown>
                   </div>
                </div>

                {/* Refinement History Bubbles */}
                {visibleHistory.length > 0 && (
                   <div className="pt-16 border-t border-slate-100 dark:border-slate-800 space-y-8">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-[0.3em]">Tactical Iterations</span>
                        <div className="h-px bg-slate-100 dark:bg-slate-800 flex-1" />
                      </div>
                      
                      <div className="space-y-6">
                        {visibleHistory.map((m: any, i: number) => (
                          <div key={i} className={cn("flex flex-col gap-2", m.role === 'assistant' ? "items-start" : "items-end")}>
                            <div className={cn(
                              "max-w-[85%] px-6 py-5 rounded-[2rem] text-sm font-bold leading-relaxed shadow-sm",
                              m.role === 'assistant' 
                                ? "bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-tl-none" 
                                : "bg-sky-500 text-white rounded-tr-none shadow-sky-200 dark:shadow-none"
                            )}>
                                {m.role === 'assistant' ? <ReactMarkdown className="prose-sm">{m.content}</ReactMarkdown> : m.content}
                            </div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-4">{m.role === 'assistant' ? 'FlowAI Synthesis' : 'Command Intent'}</span>
                          </div>
                        ))}
                      </div>
                   </div>
                )}
              </div>
            ) : a.status === 'processing' ? (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-8">
                 <div className="relative">
                    <div className="absolute inset-0 bg-sky-500 blur-3xl opacity-20 animate-pulse" />
                    <div className="w-24 h-24 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] shadow-2xl flex items-center justify-center relative">
                       <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">Engaging Synthesis Engine</h3>
                    <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">Constructing Masterpiece Architecture...</p>
                 </div>
              </div>
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-8 border-4 border-dashed border-slate-100 dark:border-slate-900 rounded-[4rem] group hover:border-sky-500/20 transition-all duration-700">
                 <Zap className="w-20 h-20 text-slate-200 dark:text-slate-800 mb-8 transition-transform group-hover:scale-110 group-hover:text-sky-500 duration-700" />
                 <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter mb-4">Masterpiece Foundationalized</h2>
                 <p className="text-slate-500 max-w-md mx-auto font-medium text-lg leading-relaxed mb-10">Your research input is loaded. Initialize the intelligence protocol to generate the ultimate synthesis.</p>
                 <button onClick={()=>solveMutation.mutate()} disabled={solveMutation.isPending} className="btn-primary px-12 py-5 text-xl font-black rounded-3xl shadow-2xl shadow-sky-500/20 hover:-translate-y-1 transition-all active:scale-95 flex items-center gap-3">
                    <Sparkles className="w-6 h-6" /> {solveMutation.isPending ? 'Engaging Core...' : 'Initialize Intelligence'}
                 </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Floating Command Island ─────────────────────────── */}
        {a.status === 'completed' && (
          <div className="absolute bottom-[88px] md:bottom-10 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] md:w-full max-w-2xl z-40">
            
            {/* Specialized Intelligence Pills */}
            <div className={cn(
              "flex items-center gap-2 mb-3 px-4 transition-all duration-500",
              showSpecialized ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
            )}>
              <button 
                onClick={()=>detectMutation.mutate()} 
                disabled={detectMutation.isPending || refineMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 backdrop-blur-xl rounded-2xl text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all shadow-xl shadow-emerald-500/10"
              >
                 {detectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                 Integrity Scan
              </button>
              <button 
                onClick={()=>humanizeMutation.mutate()} 
                disabled={humanizeMutation.isPending || refineMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-sky-500/10 dark:bg-sky-500/20 border border-sky-500/30 backdrop-blur-xl rounded-2xl text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-widest hover:bg-sky-500 hover:text-white transition-all shadow-xl shadow-sky-500/10"
              >
                 {humanizeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                 Humanize
              </button>
              <button 
                onClick={()=>originalityMutation.mutate()} 
                disabled={originalityMutation.isPending || refineMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-500/10 dark:bg-violet-500/20 border border-violet-500/30 backdrop-blur-xl rounded-2xl text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest hover:bg-violet-500 hover:text-white transition-all shadow-xl shadow-violet-500/10"
              >
                 {originalityMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                 Originality
              </button>
            </div>

            <div className={cn(
              "bg-white/80 dark:bg-slate-900/80 backdrop-blur-3xl border-2 border-white dark:border-slate-800 rounded-[2rem] md:rounded-[2.5rem] p-2 md:p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-none flex items-center gap-1.5 md:gap-2 group focus-within:ring-4 ring-sky-500/10 transition-all",
              refineMutation.isPending && "opacity-50 pointer-events-none scale-95"
            )}>
              <button 
                onClick={() => setShowSpecialized(!showSpecialized)}
                className={cn(
                  "ml-3 h-10 w-10 md:h-12 md:w-12 rounded-2xl flex items-center justify-center transition-all",
                  showSpecialized ? "bg-sky-500 text-white rotate-45" : "bg-sky-50 dark:bg-sky-900/50 text-sky-500 hover:bg-sky-100 dark:hover:bg-sky-900/80"
                )}
                title="Intelligence Suite Protocols"
              >
                <Wand2 className="w-5 h-5 md:w-6 h-6" />
              </button>
              
              <input 
                value={refinePrompt} 
                onChange={e=>setRefinePrompt(e.target.value)} 
                onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&refineMutation.mutate()} 
                placeholder="Direct FlowAI..." 
                className="flex-1 bg-transparent border-none focus:outline-none text-slate-900 dark:text-white font-bold placeholder:text-slate-400 text-sm md:text-base py-3 px-2 min-w-0" 
              />
              
              {/* Tactical Export Shortcuts */}
              <div className="flex items-center gap-1.5 pr-1 font-black">
                <button 
                  onClick={() => handleExport('pdf')} 
                  className="h-9 md:h-10 px-2.5 md:px-3 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-900/40 text-slate-400 hover:text-sky-500 rounded-xl md:rounded-2xl transition-all text-[9px] md:text-[10px] uppercase tracking-widest border border-slate-100 dark:border-slate-700 hover:border-sky-200 dark:hover:border-sky-800"
                  title="Quick PDF Masterpiece"
                >
                   <FileText className="w-3.5 h-3.5" /> <span className="hidden sm:inline">PDF</span>
                </button>
                <button 
                  onClick={() => handleExport('docx')} 
                  className="h-9 md:h-10 px-2.5 md:px-3 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 text-slate-400 hover:text-emerald-500 rounded-xl md:rounded-2xl transition-all text-[9px] md:text-[10px] uppercase tracking-widest border border-slate-100 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-800"
                  title="Quick Word Synthesis"
                >
                   <FileDown className="w-3.5 h-3.5" /> <span className="hidden sm:inline">DOCX</span>
                </button>
              </div>

              <button onClick={()=>refineMutation.mutate()} disabled={!refinePrompt || refineMutation.isPending} 
                className={cn(
                  "h-14 w-14 rounded-[1.75rem] flex items-center justify-center shrink-0 transition-all shadow-lg active:scale-90",
                  refinePrompt ? "bg-sky-500 text-white shadow-sky-500/30" : "bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                )}>
                {refineMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ── Intelligence Audit Report Modal ────────────────── */}
      <AnimatePresence>
        {isAuditModalOpen && auditReport && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 lg:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAuditModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-5xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-[0_32px_128px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col border border-white/20"
            >
              {/* Modal Header */}
              <div className="p-8 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-500/20">
                      <ShieldAlert className="w-6 h-6" />
                   </div>
                   <div>
                      <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Mission Audit Report</h2>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Integrity Scan Complete</p>
                   </div>
                </div>
                <button onClick={() => setIsAuditModalOpen(false)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl text-slate-400 hover:text-slate-600 transition-all font-bold">Close Port</button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  
                  {/* Left Column: Metrics & Charts */}
                  <div className="lg:col-span-4 space-y-6">
                    {/* Score Rings */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] p-6 border border-slate-100 dark:border-slate-800 space-y-8">
                       <div className="space-y-4">
                          <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                             <span>AI Probability</span>
                             <span className={cn(auditReport.ai_score > 50 ? "text-rose-500" : "text-emerald-500")}>{auditReport.ai_score}%</span>
                          </div>
                          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                             <motion.div initial={{ width: 0 }} animate={{ width: `${auditReport.ai_score}%` }} transition={{ duration: 1, ease: "easeOut" }} className={cn("h-full", auditReport.ai_score > 50 ? "bg-rose-500" : "bg-emerald-500")} />
                          </div>
                       </div>
                       
                       <div className="space-y-4">
                          <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                             <span>Originality Score</span>
                             <span className="text-sky-500">{auditReport.originality_score}%</span>
                          </div>
                          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                             <motion.div initial={{ width: 0 }} animate={{ width: `${auditReport.originality_score}%` }} transition={{ duration: 1, ease: "easeOut", delay: 0.3 }} className="h-full bg-sky-500" />
                          </div>
                       </div>

                       <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-3 mb-4">
                             <Activity className="w-5 h-5 text-emerald-500" />
                             <span className="text-sm font-bold text-slate-900 dark:text-white">Linguistic Fidelity</span>
                          </div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Audit Verdict</div>
                          <div className={cn(
                             "px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-center shadow-sm",
                             auditReport.verdict?.toLowerCase().includes('safe') ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                          )}>
                             {auditReport.verdict || 'Analysis Inconclusive'}
                          </div>
                       </div>
                    </div>

                    {/* Mission Summary */}
                    <div className="p-6 bg-sky-500/5 border border-sky-500/20 rounded-[2rem] space-y-3">
                       <h4 className="text-[10px] font-black text-sky-500 uppercase tracking-widest">Mission Summary</h4>
                       <p className="text-xs font-bold leading-relaxed text-slate-600 dark:text-slate-400">
                          {auditReport.summary || 'Synthesizing detailed audit parameters...'}
                       </p>
                    </div>
                  </div>

                  {/* Right Column: Heatmap Text */}
                  <div className="lg:col-span-8 space-y-6">
                     <div className="bg-white dark:bg-slate-950 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-inner min-h-[400px]">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-2">
                           <Layers className="w-4 h-4" /> Tactical Heatmap Analysis
                        </h4>
                        
                        <div className="text-sm font-bold leading-loose text-slate-800 dark:text-slate-300 space-y-2">
                           {auditReport.segments?.map((seg: any, idx: number) => (
                             <span 
                                key={idx} 
                                className={cn(
                                   "inline px-0.5 rounded transition-all cursor-help relative group/seg",
                                   seg.type === 'ai' ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-b-2 border-rose-500/30" : 
                                   seg.type === 'plagiarism' ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-b-2 border-violet-500/30" :
                                   "hover:bg-emerald-500/5"
                                )}
                                title={seg.reason}
                             >
                                {seg.text}
                                {seg.type !== 'human' && (
                                   <div className="absolute bottom-full left-0 mb-2 w-48 p-3 bg-slate-900 text-[10px] text-white rounded-xl opacity-0 group-hover/seg:opacity-100 pointer-events-none transition-opacity z-50 shadow-2xl font-black uppercase tracking-widest border border-white/10">
                                      <div className={cn("mb-1", seg.type === 'ai' ? "text-rose-400" : "text-violet-400")}>
                                         Audit Flag: {seg.type.toUpperCase()} ({seg.probability}%)
                                      </div>
                                      <div className="text-[9px] text-slate-400 lowercase italic tracking-normal">{seg.reason}</div>
                                   </div>
                                )}
                             </span>
                           ))}
                        </div>
                     </div>
                  </div>

                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-8 bg-slate-50 dark:bg-slate-800/30 text-center">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.5em]">This report is mission-advisory. Exercise ultimate academic judgement.</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ShareAssignmentModal 
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        assignmentId={id}
        assignmentTitle={a.title}
      />
    </div>
  )
}
