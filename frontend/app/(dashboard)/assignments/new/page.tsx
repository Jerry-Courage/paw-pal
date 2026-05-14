'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { assignmentsApi, libraryApi } from '@/lib/api'
import { ArrowLeft, Upload, CheckCircle2, X, Plus, FileText, Image as ImageIcon, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function NewAssignmentPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [selectedResources, setSelectedResources] = useState<number[]>([])

  const { data: resData } = useQuery({ 
    queryKey: ['resources'], 
    queryFn: () => libraryApi.getResources().then(r => r.data) 
  })
  const resources = resData?.results || []

  const createMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('title', title)
      if (subject) fd.append('subject', subject)
      if (instructions) fd.append('instructions', instructions)
      if (dueDate) fd.append('due_date', dueDate)
      if (pdfFile) fd.append('file', pdfFile)
      
      // We'll send images as 'image_sources'
      imageFiles.forEach(file => {
        fd.append('image_sources', file)
      })
      
      selectedResources.forEach(id => fd.append('resources', String(id)))
      return assignmentsApi.create(fd)
    },
    onSuccess: (res) => {
      toast.success('Assignment initialized successfully!')
      qc.invalidateQueries({ queryKey: ['assignments'] })
      router.push(`/assignments/${res.data.id}`)
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.detail || 'Failed to initialize assignment.')
    }
  })

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setImageFiles(prev => [...prev, ...newFiles])
    }
  }

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/assignments" className="group flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-orange-500/50 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-orange-500 transition-colors" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-md bg-orange-500/10 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-orange-500" />
              </div>
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">Initialization Chamber</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">New Assignment</h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#111] rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
            <div className="p-8 sm:p-10 space-y-10">
              
              {/* Step 1: Identity */}
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 font-black text-sm border border-orange-500/20">1</div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Assignment Identity</h3>
                </div>
                
                <div className="space-y-5 pl-11">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Assignment Title <span className="text-orange-500">*</span></label>
                    <input 
                      value={title} onChange={e => setTitle(e.target.value)} 
                      placeholder="e.g. Advanced Thermodynamics Synthesis" 
                      className="input h-14 text-base font-bold bg-white/5 border-white/10 focus:border-orange-500/50 rounded-2xl" 
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Subject Area</label>
                      <input 
                        value={subject} onChange={e => setSubject(e.target.value)} 
                        placeholder="e.g. Physics" 
                        className="input h-14 font-bold bg-white/5 border-white/10 focus:border-orange-500/50 rounded-2xl" 
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Submission Deadline</label>
                      <input 
                        type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} 
                        className="input h-14 font-bold bg-white/5 border-white/10 focus:border-orange-500/50 rounded-2xl text-slate-300" 
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Step 2: Intelligence Context */}
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400 font-black text-sm border border-sky-500/20">2</div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Intelligence Context</h3>
                </div>
                
                <div className="space-y-6 pl-11">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Detailed Instructions</label>
                    <textarea 
                      value={instructions} onChange={e=>setInstructions(e.target.value)} 
                      placeholder="Paste your assignment prompt, specific requirements, or grading criteria here..." 
                      className="input min-h-[160px] resize-none py-4 font-medium leading-relaxed bg-white/5 border-white/10 focus:border-sky-500/50 rounded-2xl" 
                    />
                  </div>

                  {/* Multi-modal Uploads */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* PDF Upload */}
                    <div 
                      onClick={()=>fileRef.current?.click()} 
                      className={cn(
                        "relative p-6 rounded-[2rem] border-2 border-dashed transition-all cursor-pointer group flex flex-col items-center justify-center text-center",
                        pdfFile ? "bg-emerald-500/5 border-emerald-500/30" : "bg-white/5 border-white/10 hover:border-sky-500/30"
                      )}
                    >
                      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e=>setPdfFile(e.target.files?.[0]||null)} />
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-all",
                        pdfFile ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-slate-500 group-hover:scale-110"
                      )}>
                        <FileText className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-white mb-1">{pdfFile ? pdfFile.name : 'Master PDF'}</p>
                      <p className="text-[10px] font-medium text-slate-500">Core assignment document</p>
                      {pdfFile && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setPdfFile(null) }} 
                          className="absolute top-3 right-3 p-1.5 bg-rose-500/10 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Image Upload */}
                    <div 
                      onClick={()=>imageRef.current?.click()} 
                      className={cn(
                        "relative p-6 rounded-[2rem] border-2 border-dashed transition-all cursor-pointer group flex flex-col items-center justify-center text-center",
                        imageFiles.length > 0 ? "bg-violet-500/5 border-violet-500/30" : "bg-white/5 border-white/10 hover:border-sky-500/30"
                      )}
                    >
                      <input ref={imageRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-all",
                        imageFiles.length > 0 ? "bg-violet-500/20 text-violet-400" : "bg-white/5 text-slate-500 group-hover:scale-110"
                      )}>
                        <ImageIcon className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-white mb-1">{imageFiles.length > 0 ? `${imageFiles.length} Images` : 'Visual Sources'}</p>
                      <p className="text-[10px] font-medium text-slate-500">Charts, screenshots, or whiteboard</p>
                    </div>
                  </div>

                  {/* Image Preview Strip */}
                  {imageFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {imageFiles.map((file, i) => (
                        <div key={i} className="relative group/img w-16 h-16 rounded-xl border border-white/10 overflow-hidden bg-white/5">
                          <img src={URL.createObjectURL(file)} className="w-full h-full object-cover opacity-60" alt="" />
                          <button 
                            onClick={() => removeImage(i)}
                            className="absolute inset-0 bg-rose-500/80 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={()=>imageRef.current?.click()}
                        className="w-16 h-16 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center hover:border-sky-500/30 text-slate-500 hover:text-sky-400 transition-all"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* Step 3: Linked Knowledge */}
              {resources.length > 0 && (
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-black text-sm border border-emerald-500/20">3</div>
                    <h3 className="text-lg font-bold text-white tracking-tight">Linked Knowledge</h3>
                  </div>
                  
                  <div className="pl-11 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                    {resources.map((r:any) => (
                      <label key={r.id} className={cn(
                        'flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all', 
                        selectedResources.includes(r.id) ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/5 border-white/5 hover:border-white/15'
                      )}>
                        <input type="checkbox" className="hidden" onChange={()=>setSelectedResources(s=>s.includes(r.id)?s.filter(x=>x!==r.id):[...s,r.id])} />
                        <div className={cn("w-5 h-5 rounded-md border flex items-center justify-center transition-all", selectedResources.includes(r.id) ? "bg-orange-500 border-orange-500 text-white" : "border-white/20")}>
                          {selectedResources.includes(r.id) && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-200 truncate">{r.title}</p>
                          <p className="text-[10px] uppercase font-black text-slate-600 tracking-widest">{r.resource_type}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              )}
            </div>
            
            {/* Footer */}
            <div className="px-8 sm:px-10 py-8 bg-white/2 border-t border-white/5 flex items-center justify-between">
              <p className="hidden sm:block text-[10px] font-black text-slate-600 uppercase tracking-widest">Initialization takes approx. 20s</p>
              <div className="flex gap-4 w-full sm:w-auto">
                <Link href="/assignments" className="flex-1 sm:flex-none h-14 px-8 rounded-2xl border border-white/10 text-slate-400 font-bold hover:bg-white/5 transition-all flex items-center justify-center">Cancel</Link>
                <button 
                  onClick={()=>createMutation.mutate()} 
                  disabled={createMutation.isPending || !title.trim() || (!instructions.trim() && !pdfFile && imageFiles.length === 0)} 
                  className="flex-1 sm:flex-none h-14 px-10 rounded-2xl bg-orange-500 text-white font-black shadow-lg shadow-orange-500/20 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Initializing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Initialize Synthesis
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
          <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-orange-500 to-orange-600 shadow-2xl shadow-orange-500/20">
            <h4 className="text-white font-black text-xl tracking-tight mb-4 leading-tight">FlowAI Synthesis Protocol</h4>
            <ul className="space-y-4">
              {[
                'Multi-modal input processing (PDF + Images)',
                'High-fidelity academic structuring',
                'Automated integrity suite verification',
                'Structured output ready for export'
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-sm font-bold text-white/90 leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/5">
             <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Integrity Suite</h4>
             <p className="text-xs font-semibold text-slate-400 leading-relaxed">
               All synthesized assignments undergo a dual-audit for AI probability and originality. Removal protocols can be engaged post-initialization.
             </p>
          </div>
        </div>
      </div>
    </div>
  )
}
