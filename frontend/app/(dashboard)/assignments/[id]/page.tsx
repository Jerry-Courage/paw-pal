'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assignmentsApi } from '@/lib/api'
import {
  ArrowLeft, Sparkles, FileText, Download, Loader2,
  CheckCircle2, Clock, AlertCircle, Cpu, CalendarPlus,
  Zap, Wand2, ArrowRight
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'

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
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey:['assignment', id] })
      setRefinePrompt('')
      toast.success('Solution refined.')
      // Scroll slightly to show new activity if needed
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

  useEffect(() => {
    if (a?.status === 'completed' && scrollRef.current) {
        // Auto scroll to bottom of chat history when new message comes in, but avoid aggressive scrolling
    }
  }, [a?.chat_history?.length])

  const handleExport = async (fmt: 'pdf' | 'docx') => {
    try {
      const res = await assignmentsApi.export(id, fmt)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${a.title.replace(/\s+/g, '_')}.${fmt}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success(`Successfully exported as ${fmt.toUpperCase()}`)
    } catch (err) {
      console.error('Export failed:', err)
      toast.error(`Failed to export as ${fmt.toUpperCase()}`)
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
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)] -m-4 md:-m-6 overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-500">
      
      {/* ── Main Content Area ─────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 overflow-hidden relative transition-all duration-700 ease-in-out">
        
        {/* Top Navigation Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20 flex-shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/assignments" className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all shrink-0">
              <ArrowLeft className="w-5 h-5 text-slate-500" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ring-1 ring-inset shadow-sm", STATUS_CONFIG[a.status]?.color)}>
                  {STATUS_CONFIG[a.status]?.label || a.status}
                </span>
                {a.subject && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{a.subject}</span>}
              </div>
              <h1 className="text-lg font-black text-slate-900 dark:text-white truncate">{a.title}</h1>
            </div>
          </div>
        </div>

        {/* Scrollable Document Canvas */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar relative px-6 py-8 md:px-12 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="max-w-4xl mx-auto space-y-12 pb-32"> {/* pb-32 to account for fixed refine input */}
            
            {/* Input Materials Header */}
            <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl rounded-[2rem] p-8 border border-white/60 dark:border-white/5 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-sky-400/10 to-transparent rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110 duration-700 pointer-events-none" />
              <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-5 flex items-center gap-2 relative z-10">
                <FileText className="w-4 h-4 text-sky-500" /> Research Input
              </h4>
              <p className="text-slate-700 dark:text-slate-300 font-medium italic border-l-4 border-sky-500/30 pl-5 py-1 text-lg relative z-10">
                "{a.instructions || 'No specific instructions provided.'}"
              </p>
              {a.file_name && (
                <div className="mt-8 flex items-center gap-3 p-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 rounded-xl w-fit shadow-sm relative z-10 group-hover:border-sky-300/50 dark:group-hover:border-sky-700/50 transition-colors cursor-default">
                  <div className="p-2.5 bg-sky-50 dark:bg-sky-900/40 text-sky-500 rounded-lg"><Download className="w-4 h-4" /></div>
                  <div className="pr-4">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{a.file_name}</p>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Source Document</p>
                  </div>
                </div>
              )}
            </div>

            {/* AI Synthesized Document */}
            {a.status === 'completed' ? (
              <div className="space-y-12">
                  <div className="absolute -inset-1 bg-gradient-to-b from-sky-400/20 via-transparent to-transparent blur-2xl rounded-[3rem] -z-10 pointer-events-none" />
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-[2.5rem] p-8 md:p-14 shadow-2xl shadow-slate-200/40 dark:shadow-none relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none transform -rotate-12">
                      <Sparkles className="w-64 h-64 text-sky-900 dark:text-sky-100" />
                    </div>
                    
                    <div className="flex items-center justify-between mb-10 border-b border-slate-100 dark:border-slate-800 pb-10 relative z-10">
                      <div className="flex items-center gap-5">
                        <div className="relative">
                          <div className="absolute inset-0 bg-sky-400 blur-xl opacity-40 animate-pulse" />
                          <div className="p-3.5 bg-gradient-to-br from-sky-400 to-sky-600 text-white rounded-2xl shadow-lg ring-1 ring-white/20 relative"><Sparkles className="w-6 h-6" /></div>
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Premium AI Synthesis</h2>
                          <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                            </span>
                            Current Master Version
                          </p>
                        </div>
                      </div>
                      
                      {/* Refinement Loader Indicator */}
                      {refineMutation.isPending && (
                         <div className="hidden sm:flex items-center gap-2 text-sky-500 font-bold text-xs bg-sky-50 dark:bg-sky-900/30 px-4 py-2 rounded-xl backdrop-blur-md border border-sky-100 dark:border-sky-800">
                           <Loader2 className="w-4 h-4 animate-spin" /> FlowAI is editing...
                         </div>
                      )}
                    </div>

                    <div className="prose-ai max-w-none relative z-10 text-slate-700 dark:text-slate-300">
                      <ReactMarkdown>{a.ai_response}</ReactMarkdown>
                    </div>
                  </div>

                {/* Collaboration History */}
                {visibleHistory.length > 0 && (
                  <div className="space-y-6 max-w-3xl mx-auto">
                    <div className="flex items-center justify-center gap-4 py-4">
                      <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Edit History
                      </span>
                      <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                    </div>
                    {visibleHistory.map((m: any, i: number) => (
                      <div key={i} className={cn("flex gap-4 group", m.role === 'assistant' ? "justify-start" : "justify-end")}>
                        <div className={cn(
                          "max-w-[85%] p-5 sm:p-6 rounded-[2rem] shadow-sm text-sm font-medium leading-relaxed relative",
                          m.role === 'assistant' 
                            ? "bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-tl-none prose-ai prose-sm shadow-slate-200/50 dark:shadow-none" 
                            : "bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-tr-none shadow-sky-200/50 dark:shadow-none border border-sky-400/50"
                        )}>
                            {m.role === 'assistant' ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : a.status === 'processing' ? (
              <div className="py-32 text-center space-y-8 animate-in fade-in">
                <div className="w-24 h-24 bg-sky-100 dark:bg-sky-900/50 rounded-3xl mx-auto flex items-center justify-center">
                   <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Synthesizing...</h3>
                  <p className="text-slate-500 max-w-sm mx-auto mt-2">Analyzing your instructions and resources to generate a comprehensive solution.</p>
                </div>
              </div>
            ) : (
              <div className="py-24 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[3rem] bg-slate-50/50 dark:bg-slate-900/30 group hover:bg-slate-50 dark:hover:bg-slate-900/50 hover:border-sky-200 dark:hover:border-sky-800 transition-all duration-500">
                <div className="relative inline-block mb-6">
                   <Cpu className="w-16 h-16 text-slate-300 dark:text-slate-600 relative z-10 transition-transform duration-700 group-hover:scale-110 group-hover:text-sky-400" />
                   <div className="absolute inset-0 bg-sky-400 blur-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-700" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight group-hover:text-sky-500 transition-colors duration-500">Ready for FlowAI</h3>
                <p className="text-slate-500 font-medium mb-10 max-w-sm mx-auto text-sm">Initialize the AI core to process your assignment instructions and linked documents.</p>
                <div className="relative inline-block">
                  <div className="absolute inset-0 bg-sky-500 blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-700" />
                  <button onClick={()=>solveMutation.mutate()} disabled={solveMutation.isPending} className="relative z-10 btn-primary px-10 py-4 mx-auto shadow-xl shadow-sky-200 dark:shadow-none hover:-translate-y-1 hover:shadow-sky-300/50 dark:hover:shadow-sky-900/50 transition-all active:scale-95 flex items-center justify-center font-bold">
                    <Sparkles className="w-5 h-5 mr-3" /> Initialize Intelligence
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Refinement Chat Input - Fixed at Bottom of Main Area */}
        {a.status === 'completed' && (
          <div className="absolute bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-100 dark:border-slate-800 p-4 shrink-0">
            <div className="max-w-4xl mx-auto">
              <div className={cn(
                "flex items-center gap-4 bg-slate-100 dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner focus-within:bg-white dark:focus-within:bg-slate-900 focus-within:border-sky-300 dark:focus-within:border-sky-700 transition-all",
                refineMutation.isPending && "opacity-50 pointer-events-none"
              )}>
                <div className="pl-3 text-slate-400">
                  <Wand2 className="w-5 h-5" />
                </div>
                <input 
                  value={refinePrompt} 
                  onChange={e=>setRefinePrompt(e.target.value)} 
                  onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&refineMutation.mutate()} 
                  placeholder="Refine the masterpiece (e.g. 'Make it professional', 'Add a summary')..." 
                  className="flex-1 bg-transparent border-none focus:outline-none text-slate-900 dark:text-white font-medium placeholder:text-slate-400 text-sm" 
                />
                <button onClick={()=>refineMutation.mutate()} disabled={!refinePrompt || refineMutation.isPending} 
                  className="btn-primary h-10 w-10 sm:h-12 sm:w-12 rounded-xl p-0 flex items-center justify-center shrink-0 active:scale-95 transition-transform">
                  {refineMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right Sidebar: Study Actions ─────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[350px] border-l border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/30 overflow-y-auto">
        <div className="p-6 space-y-8">
          
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4" /> Next Steps
            </h4>
            <div className="space-y-3">
              <button 
                onClick={()=>roadmapMutation.mutate()} 
                disabled={a.status !== 'completed' || roadmapMutation.isPending}
                className="w-full flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-sky-300 dark:hover:border-sky-700 hover:shadow-md transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed">
                <div className="p-2.5 bg-sky-50 dark:bg-sky-900/40 text-sky-500 rounded-xl group-hover:bg-sky-500 group-hover:text-white transition-colors">
                  <CalendarPlus className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Create Study Plan</p>
                  <p className="text-[10px] text-slate-500">Generate smart milestones</p>
                </div>
              </button>

              <button 
                onClick={()=>transformMutation.mutate()} 
                disabled={a.status !== 'completed' || transformMutation.isPending}
                className="w-full flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed">
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-500 rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Build Workspace</p>
                  <p className="text-[10px] text-slate-500">Transform to FlowState Project</p>
                </div>
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
              <Download className="w-4 h-4" /> Export Operations
            </h4>
            <div className="grid grid-cols-2 gap-3">
               <button 
                  onClick={() => handleExport('pdf')} 
                  disabled={a.status !== 'completed'}
                  className="p-3 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors uppercase tracking-wider flex items-center justify-center gap-2">
                  PDF Format
                </button>
                <button 
                  onClick={() => handleExport('docx')} 
                  disabled={a.status !== 'completed'}
                  className="p-3 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors uppercase tracking-wider flex items-center justify-center gap-2">
                  Word Doc
                </button>
            </div>
          </div>

          {a.ai_overview && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Zap className="w-16 h-16 text-sky-500" /></div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Insight Log</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{a.ai_overview}</p>
            </div>
          )}

        </div>
      </div>
      
    </div>
  )
}
