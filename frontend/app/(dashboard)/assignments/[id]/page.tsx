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
  Activity, ShieldAlert, BadgeCheck, Layers, Share2, 
  Trash2, Search, MoreVertical, Copy, RotateCcw
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import ShareAssignmentModal from '@/components/assignments/ShareAssignmentModal'

const sanitizeMath = (content: string) => {
  if (!content) return ''
  return content
    .replace(/\\\[/g, '$$$$')
    .replace(/\\\]/g, '$$$$')
    .replace(/\\\(/g, '$$')
    .replace(/\\\)/g, '$$')
    .replace(/\[\s+/g, '$$$$ ')
    .replace(/\s+\]/g, ' $$$$')
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: any }> = {
  pending:    { color: 'text-slate-500 bg-slate-500/10 border-slate-500/20',   label: 'Pending', icon: Clock },
  processing: { color: 'text-sky-400 bg-sky-400/10 border-sky-400/20',       label: 'AI Working', icon: Loader2 },
  completed:  { color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Completed', icon: CheckCircle2 },
  error:      { color: 'text-rose-400 bg-rose-400/10 border-rose-400/20',     label: 'Error', icon: AlertCircle },
}

export default function AssignmentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const qc = useQueryClient()
  const id = parseInt(params.id)
  
  const [refinePrompt, setRefinePrompt] = useState('')
  const [activeTab, setActiveTab] = useState<'document' | 'integrity' | 'sources'>('document')
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
      if (res.data?.action === 'export_pdf') handleExport('pdf')
      if (res.data?.action === 'export_docx') handleExport('docx')
    } 
  })

  const humanizeMutation = useMutation({
    mutationFn: () => assignmentsApi.humanize(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey:['assignment', id] })
      toast.success("Applied 'Vanish' Protocol (AI Remover)")
    }
  })
  
  const originalityMutation = useMutation({
    mutationFn: () => assignmentsApi.originality(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey:['assignment', id] })
      toast.success("Engaged 'Originality Shield' (Plagiarism Remover)")
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
      if (!downloadTriggered) toast.error(`Failed to export as ${fmt.toUpperCase()}`)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 bg-orange-500 blur-2xl opacity-20 animate-pulse" />
            <Loader2 className="w-12 h-12 text-orange-500 animate-spin relative z-10" />
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] animate-pulse">Synchronizing Workspace...</p>
        </div>
      </div>
    )
  }

  if (!a) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
        <AlertCircle className="w-12 h-12 text-rose-500 opacity-20" />
        <p className="text-slate-500 font-bold">Assignment not found in initialization records.</p>
        <Link href="/assignments" className="btn-secondary text-xs">Back to Theater</Link>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0d0d0d] z-50">
      <header className="flex flex-col border-b border-white/5 bg-[#111]/80 backdrop-blur-xl z-50 shrink-0">
        <div className="h-14 md:h-16 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2 md:gap-6 min-w-0">
          <Link href="/assignments" className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-500 hover:text-white shrink-0">
            <ArrowLeft className="w-4 h-4 md:w-5 h-5" />
          </Link>
          <div className="h-6 w-px bg-white/5 hidden sm:block" />
          <div className="flex flex-col min-w-0">
            <h1 className="text-xs md:text-sm font-black text-white tracking-tight truncate max-w-[150px] sm:max-w-[300px]">{a.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn("text-[7px] md:text-[8px] font-black uppercase tracking-widest px-1 md:px-1.5 py-0.5 rounded-md", STATUS_CONFIG[a.status]?.color)}>
                {STATUS_CONFIG[a.status]?.label || a.status}
              </span>
              {a.subject && <span className="text-[7px] md:text-[8px] font-black text-slate-600 uppercase tracking-widest truncate">{a.subject}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden lg:flex items-center gap-1.5 p-1 bg-white/5 border border-white/10 rounded-xl mr-2">
            {[
              { id: 'document', icon: FileText, label: 'Manuscript' },
              { id: 'integrity', icon: ShieldCheck, label: 'Integrity Suite' },
              { id: 'sources', icon: Layers, label: 'Sources' },
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  activeTab === tab.id ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-slate-500 hover:text-white"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-1.5 md:gap-2">
            <button onClick={() => handleExport('pdf')} disabled={a.status !== 'completed'} className="p-2 md:p-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all disabled:opacity-30">
              <FileText className="w-3.5 h-3.5 md:w-4 h-4" />
            </button>
            <button onClick={() => handleExport('docx')} disabled={a.status !== 'completed'} className="p-2 md:p-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all disabled:opacity-30">
              <FileDown className="w-3.5 h-3.5 md:w-4 h-4" />
            </button>
            <button 
              onClick={() => {
                if (a.ai_response) {
                  navigator.clipboard.writeText(a.ai_response)
                  toast.success('Copied to clipboard')
                }
              }} 
              disabled={a.status !== 'completed'} 
              className="p-2 md:p-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all disabled:opacity-30"
              title="Copy to clipboard"
            >
              <Copy className="w-3.5 h-3.5 md:w-4 h-4" />
            </button>
            <div className="hidden sm:block w-px h-6 bg-white/5 mx-1" />
            <button onClick={() => setIsShareModalOpen(true)} className="btn-primary h-9 md:h-10 px-3 md:px-4 text-[9px] md:text-[10px] whitespace-nowrap">
              <Share2 className="w-3 md:w-3.5 h-3 md:h-3.5" /> Share
            </button>
          </div>
        </div>
        </div>
      </header>

      {/* Mobile Tabs */}
      <div className="lg:hidden flex items-center justify-around bg-[#111] border-b border-white/5 px-2 py-2 shrink-0">
        {[
          { id: 'document', icon: FileText, label: 'Manus' },
          { id: 'integrity', icon: ShieldCheck, label: 'Integrity' },
          { id: 'sources', icon: Layers, label: 'Sources' },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all min-w-[70px]",
              activeTab === tab.id ? "text-orange-500 bg-orange-500/5" : "text-slate-500"
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span className="text-[9px] font-black uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* ── Main Canvas ─────────────────────────── */}
        <main className="flex-1 overflow-y-auto custom-scrollbar relative bg-[#0a0a0a]">
          <div className="max-w-4xl mx-auto px-5 py-10 md:px-16 md:py-16 pb-32 md:pb-40">
            
            {activeTab === 'document' && (
              <div className="space-y-12">
                {a.status === 'completed' ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="prose-ai prose-invert max-w-none prose-p:leading-relaxed prose-headings:tracking-tight"
                  >
                    <ReactMarkdown 
                      remarkPlugins={[remarkMath, remarkGfm]} 
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        p: ({node, ...props}) => <p className="mb-6 last:mb-0" {...props} />,
                        h1: ({node, ...props}) => <h1 className="text-3xl font-black mb-6 mt-10" {...props} />,
                        h2: ({node, ...props}) => <h2 className="text-2xl font-black mb-4 mt-8" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-xl font-black mb-3 mt-6" {...props} />,
                        code: ({node, ...props}) => <code className="bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-md text-[0.9em] font-mono" {...props} />
                      }}
                    >
                      {sanitizeMath(a.ai_response)}
                    </ReactMarkdown>
                  </motion.div>
                ) : a.status === 'processing' ? (
                  <div className="h-[50vh] flex flex-col items-center justify-center text-center space-y-8">
                    <div className="relative">
                      <div className="absolute inset-0 bg-orange-500 blur-3xl opacity-20 animate-pulse" />
                      <div className="w-24 h-24 bg-[#111] border border-white/10 rounded-[2.5rem] shadow-2xl flex items-center justify-center relative">
                        <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-3xl font-black text-white tracking-tight">Synthesizing...</h3>
                      <p className="text-slate-500 font-bold text-sm uppercase tracking-[0.2em] max-w-xs mx-auto leading-relaxed">
                        FlowAI is constructing your high-fidelity academic masterpiece.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[50vh] flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-white/5 rounded-[4rem] group hover:border-orange-500/20 transition-all duration-700">
                    <Sparkles className="w-20 h-20 text-white/5 mb-8 transition-transform group-hover:scale-110 group-hover:text-orange-500 duration-700" />
                    <h2 className="text-3xl font-black text-white tracking-tight mb-4">Initialization Complete</h2>
                    <p className="text-slate-500 max-w-md mx-auto font-medium text-lg leading-relaxed mb-10">Your instructions and materials are staged. Engage the synthesis engine to generate the solution.</p>
                    <button onClick={()=>solveMutation.mutate()} disabled={solveMutation.isPending} className="btn-primary px-12 py-5 text-lg font-black rounded-3xl shadow-2xl shadow-orange-500/20 hover:-translate-y-1 transition-all active:scale-95 flex items-center gap-3">
                      {solveMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6" />}
                      {solveMutation.isPending ? 'Engaging Core...' : 'Initialize Intelligence'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'integrity' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* AI Integrity Pair */}
                  <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <ShieldAlert className="w-12 h-12 text-sky-500" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-400 border border-sky-500/20">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <h4 className="text-lg font-bold text-white tracking-tight">AI Integrity</h4>
                    </div>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      Linguistic fingerprinting to detect AI patterns and engage high-fidelity humanization protocols.
                    </p>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button 
                        onClick={() => detectMutation.mutate()}
                        disabled={a.status !== 'completed' || detectMutation.isPending}
                        className="flex flex-col items-center gap-3 p-5 rounded-[1.5rem] bg-[#0d0d0d] border border-white/5 hover:border-sky-500/50 hover:bg-sky-500/5 transition-all group disabled:opacity-30 relative"
                      >
                        {detectMutation.isPending ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]/80 rounded-[1.5rem] z-10">
                            <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
                          </div>
                        ) : null}
                        <ShieldAlert className="w-6 h-6 text-slate-600 group-hover:text-sky-400 transition-colors" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-white transition-colors">Detector</span>
                      </button>
                      <button 
                        onClick={() => humanizeMutation.mutate()}
                        disabled={a.status !== 'completed' || humanizeMutation.isPending}
                        className="flex flex-col items-center gap-3 p-5 rounded-[1.5rem] bg-[#0d0d0d] border border-white/5 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group disabled:opacity-30 relative"
                      >
                        {humanizeMutation.isPending ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]/80 rounded-[1.5rem] z-10">
                            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                          </div>
                        ) : null}
                        <UserCheck className="w-6 h-6 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-white transition-colors">Remover</span>
                      </button>
                    </div>
                  </div>

                  {/* Originality Shield Pair */}
                  <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <ShieldCheck className="w-12 h-12 text-violet-500" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 border border-violet-500/20">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <h4 className="text-lg font-bold text-white tracking-tight">Originality Shield</h4>
                    </div>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      Cross-database plagiarism verification and structural re-synthesis for absolute originality.
                    </p>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button 
                        onClick={() => detectMutation.mutate()}
                        disabled={a.status !== 'completed' || detectMutation.isPending}
                        className="flex flex-col items-center gap-3 p-5 rounded-[1.5rem] bg-[#0d0d0d] border border-white/5 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all group disabled:opacity-30 relative"
                      >
                        {detectMutation.isPending ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]/80 rounded-[1.5rem] z-10">
                            <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                          </div>
                        ) : null}
                        <Search className="w-6 h-6 text-slate-600 group-hover:text-violet-400 transition-colors" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-white transition-colors">Checker</span>
                      </button>
                      <button 
                        onClick={() => originalityMutation.mutate()}
                        disabled={a.status !== 'completed' || originalityMutation.isPending}
                        className="flex flex-col items-center gap-3 p-5 rounded-[1.5rem] bg-[#0d0d0d] border border-white/5 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all group disabled:opacity-30 relative"
                      >
                        {originalityMutation.isPending ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]/80 rounded-[1.5rem] z-10">
                            <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                          </div>
                        ) : null}
                        <RotateCcw className="w-6 h-6 text-slate-600 group-hover:text-orange-400 transition-colors" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-white transition-colors">Remover</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-10 rounded-[3rem] bg-orange-500 shadow-2xl shadow-orange-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-3xl rounded-full -mr-32 -mt-32" />
                  <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black text-white tracking-tight">Full Integrity Audit</h3>
                      <p className="text-white/80 text-sm font-bold">Generate a comprehensive heatmap report of your assignment's integrity.</p>
                    </div>
                    <button 
                      onClick={() => detectMutation.mutate()}
                      disabled={a.status !== 'completed' || detectMutation.isPending}
                      className="h-14 px-10 bg-white text-orange-600 font-black rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-50"
                    >
                      Initialize Full Audit
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'sources' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Instructions Card */}
                  <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Core Instructions</h4>
                    <p className="text-sm font-medium text-slate-300 leading-relaxed line-clamp-[12]">
                      {a.instructions || 'No textual instructions provided.'}
                    </p>
                  </div>

                  {/* Attached Sources */}
                  <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Initialization Sources</h4>
                    <div className="space-y-3">
                      {a.file_name && (
                        <div className="flex items-center gap-4 p-4 bg-[#0d0d0d] border border-white/5 rounded-2xl">
                          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{a.file_name}</p>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Master PDF</p>
                          </div>
                        </div>
                      )}
                      {a.sources?.filter((s: any) => s.file_type === 'image').map((src: any, i: number) => (
                        <div key={src.id} className="flex items-center gap-4 p-4 bg-[#0d0d0d] border border-white/5 rounded-2xl">
                          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center overflow-hidden shrink-0">
                            <img src={src.file} alt="" className="w-full h-full object-cover opacity-80" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{src.file_name || `Image Source ${i + 1}`}</p>
                            <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Visual Source</p>
                          </div>
                        </div>
                      ))}
                      {!a.file_name && !a.sources?.length && (
                        <p className="text-xs text-slate-600 font-bold py-6 text-center">No file sources attached.</p>
                      )}
                    </div>
                  </div>
                </div>

                {a.resource_titles?.length > 0 && (
                  <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-5">Linked Library Resources</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {a.resource_titles.map((r: any) => (
                        <div key={r.id} className="flex items-center gap-3 p-4 bg-[#0d0d0d] border border-white/5 rounded-2xl">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                            <Layers className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{r.title}</p>
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{r.type}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </main>

        {/* ── Chat/Refinement Island ─────────────────────────── */}
        {a.status === 'completed' && activeTab === 'document' && (
          <div className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-40">
            <div className="bg-[#161616]/90 backdrop-blur-3xl border border-white/10 rounded-3xl md:rounded-[2.5rem] p-1.5 md:p-2 shadow-2xl focus-within:border-orange-500/50 transition-all flex items-center gap-2 group">
              <div className="ml-2 p-2.5 md:p-3 bg-orange-500/10 text-orange-500 rounded-xl md:rounded-2xl group-focus-within:bg-orange-500 group-focus-within:text-white transition-all">
                <Sparkles className="w-4 h-4 md:w-5 h-5" />
              </div>
              <input 
                value={refinePrompt} 
                onChange={e=>setRefinePrompt(e.target.value)} 
                onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&refineMutation.mutate()} 
                placeholder="Ask AI to refine or edit..." 
                className="flex-1 bg-transparent border-none focus:outline-none text-white font-bold placeholder:text-slate-600 text-xs md:text-sm py-3 md:py-4 px-1 min-w-0" 
              />
              <button 
                onClick={()=>refineMutation.mutate()} 
                disabled={!refinePrompt || refineMutation.isPending} 
                className={cn(
                  "h-10 md:h-12 px-4 md:px-6 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all",
                  refinePrompt ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "bg-white/5 text-slate-600"
                )}
              >
                {refineMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Audit Modal (Simplified copy from original) ────────────────── */}
      <AnimatePresence>
        {isAuditModalOpen && auditReport && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAuditModalOpen(false)}
              className="absolute inset-0 bg-[#0d0d0d]/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-5xl bg-[#111] rounded-[3rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col"
            >
               <div className="p-8 border-b border-white/5 flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
                       <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                       <h2 className="text-2xl font-black text-white tracking-tight">Mission Audit Report</h2>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Full Integrity Heatmap</p>
                    </div>
                 </div>
                 <button onClick={() => setIsAuditModalOpen(false)} className="px-6 py-2 rounded-xl bg-white/5 text-slate-400 font-bold text-xs hover:bg-white/10 transition-all">Dismiss</button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar bg-[#0a0a0a]">
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-8">
                     <div className="lg:col-span-1 space-y-4 md:space-y-6">
                        {/* AI Confidence */}
                        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-4 shadow-xl">
                           <div className="flex justify-between items-center text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
                              <span>AI Probability</span>
                              <span className={cn("px-2 py-0.5 rounded-md", auditReport.ai_score > 50 ? "bg-orange-500 text-white" : "bg-emerald-500 text-white")}>
                                {auditReport.ai_score}%
                              </span>
                           </div>
                           <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className={cn("h-full transition-all duration-1000", auditReport.ai_score > 50 ? "bg-orange-500" : "bg-emerald-500")} style={{ width: `${auditReport.ai_score}%` }} />
                           </div>
                        </div>

                        {/* Originality Score */}
                        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-4 shadow-xl">
                           <div className="flex justify-between items-center text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
                              <span>Originality</span>
                              <span className="text-violet-400">{auditReport.originality_score || 0}%</span>
                           </div>
                           <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-500 transition-all duration-1000" style={{ width: `${auditReport.originality_score || 0}%` }} />
                           </div>
                        </div>

                        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-3">
                           <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Linguistic Verdict</h4>
                           <p className="text-sm font-bold text-white leading-tight">{auditReport.verdict || 'Verification Success'}</p>
                           <p className="text-[10px] text-slate-500 font-medium leading-relaxed">{auditReport.summary || 'Document follows standard academic patterns.'}</p>
                        </div>
                     </div>
                     
                     <div className="lg:col-span-3 p-6 md:p-8 rounded-[2rem] bg-white/5 border border-white/10 font-medium leading-relaxed text-sm text-slate-400 relative">
                        <div className="absolute top-4 right-6 flex items-center gap-4 text-[8px] font-black uppercase tracking-widest text-slate-600">
                          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500/40" /> AI Marker</div>
                          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500/40" /> Plagiarism</div>
                          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-white/10" /> Human</div>
                        </div>
                        <div className="mt-4 max-h-[60vh] overflow-y-auto pr-4 custom-scrollbar">
                           {auditReport.segments?.map((seg: any, idx: number) => (
                              <span key={idx} className={cn(
                                 "inline px-0.5 rounded transition-all duration-300",
                                 seg.type === 'ai' ? "bg-orange-500/10 text-orange-200/80 border-b-2 border-orange-500/30" : 
                                 seg.type === 'plagiarism' ? "bg-rose-500/10 text-rose-200/80 border-b-2 border-rose-500/30" : 
                                 "hover:bg-white/5"
                              )} title={seg.reason}>
                                 {seg.text}{" "}
                              </span>
                           ))}
                        </div>
                     </div>
                  </div>
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
  );
}
