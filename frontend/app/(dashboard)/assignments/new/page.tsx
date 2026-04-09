'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { assignmentsApi, libraryApi } from '@/lib/api'
import { ArrowLeft, Upload, CheckCircle2, X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function NewAssignmentPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [selectedResources, setSelectedResources] = useState<number[]>([])
  const [inputMode, setInputMode] = useState<'type' | 'upload'>('type')

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
      if (file) fd.append('file', file)
      selectedResources.forEach(id => fd.append('resources', String(id)))
      return assignmentsApi.create(fd)
    },
    onSuccess: (res) => {
      toast.success('Assignment created successfully!')
      qc.invalidateQueries({ queryKey: ['assignments'] })
      router.push(`/assignments/${res.data.id}`)
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.detail || 'Failed to create assignment.')
    }
  })

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-8 flex items-center gap-4">
        <Link href="/assignments" className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </Link>
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">New Assignment</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Provide details and materials for FlowAI to analyze.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-white">
        <div className="p-8 sm:p-10 space-y-8">
          
          {/* Basic Info */}
          <div className="space-y-5">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400 text-xs">1</span>
              Basic Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pl-8">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Title <span className="text-rose-500">*</span></label>
                <input 
                  value={title} onChange={e => setTitle(e.target.value)} 
                  placeholder="e.g. Physics Lab Report" 
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Subject</label>
                <input 
                  value={subject} onChange={e => setSubject(e.target.value)} 
                  placeholder="e.g. Physics" 
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Due Date</label>
                <input 
                  type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} 
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-slate-700 dark:text-slate-300" 
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* Instructions */}
          <div className="space-y-5">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400 text-xs">2</span>
              Source Material
            </h3>
            <div className="pl-8 space-y-4">
              <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 w-fit">
                {['type','upload'].map(m => (
                  <button key={m} onClick={()=>setInputMode(m as any)} className={cn('px-6 py-2 rounded-lg text-xs font-bold transition-all', inputMode===m?'bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-400':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}>
                    {m === 'type' ? 'Write Instructions' : 'Upload PDF'}
                  </button>
                ))}
              </div>
              {inputMode==='type'?(
                <textarea 
                  value={instructions} onChange={e=>setInstructions(e.target.value)} 
                  placeholder="Type or paste the assignment prompt here..." 
                  className="w-full h-40 resize-none bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all font-medium" 
                />
              ):(
                <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group relative overflow-hidden">
                   <div className="absolute inset-0 bg-sky-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e=>setFile(e.target.files?.[0]||null)} />
                  <div className="flex flex-col items-center relative z-10">
                    <Upload className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3 group-hover:-translate-y-1 transition-transform" />
                    <p className="text-base font-bold text-slate-700 dark:text-slate-300">{file ? file.name : 'Select or drop a PDF'}</p>
                    <p className="text-sm text-slate-400 mt-1">FlowAI will extract text from your document</p>
                    {file && (
                      <button onClick={(e) => { e.stopPropagation(); setFile(null) }} className="mt-4 px-4 py-1.5 text-xs font-bold bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200 transition-colors">
                        Remove File
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {resources.length > 0 && (
            <>
              <hr className="border-slate-100 dark:border-slate-800" />
              <div className="space-y-5">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400 text-xs">3</span>
                  Link Library Resources (Optional)
                </h3>
                <div className="pl-8 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {resources.map((r:any) => (
                    <label key={r.id} className={cn('flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all', selectedResources.includes(r.id)?'bg-sky-50 dark:bg-sky-900/20 border-sky-300 dark:border-sky-700 shadow-sm':'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-sky-200')}>
                      <input type="checkbox" className="hidden" onChange={()=>setSelectedResources(s=>s.includes(r.id)?s.filter(x=>x!==r.id):[...s,r.id])} />
                      <CheckCircle2 className={cn("w-5 h-5 shrink-0 transition-colors", selectedResources.includes(r.id) ? "text-sky-500" : "text-slate-200 dark:text-slate-700")} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">{r.title}</p>
                        <p className="text-[10px] uppercase font-semibold text-slate-400">{r.resource_type}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

        </div>
        
        {/* Footer Actions */}
        <div className="px-8 sm:px-10 py-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-4">
          <Link href="/assignments" className="btn-secondary px-8 py-3 rounded-xl">Cancel</Link>
          <button 
            onClick={()=>createMutation.mutate()} 
            disabled={createMutation.isPending || !title.trim() || (!instructions.trim() && !file)} 
            className="btn-primary px-8 py-3 rounded-xl shadow-lg shadow-sky-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed">
            {createMutation.isPending ? 'Processing...' : 'Create Assignment'}
          </button>
        </div>
      </div>
    </div>
  )
}
