'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi, API_BASE, getAuthToken } from '@/lib/api'
import { X, Upload, FileText, Youtube, Code, Presentation, Plus, Loader2, Sparkles, CheckCircle2, ShieldAlert, Cloud } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const TYPES = [
  { id: 'pdf', label: 'PDF/Word', sub: 'Textbooks, notes', icon: FileText, color: 'text-blue-500 bg-blue-50' },
  { id: 'video', label: 'YouTube', sub: 'Lecture links', icon: Youtube, color: 'text-red-500 bg-red-50' },
  { id: 'code', label: 'Code', sub: '.js, .py, .rs', icon: Code, color: 'text-emerald-500 bg-emerald-50' },
  { id: 'slides', label: 'Slides', sub: 'PPT, Keynote', icon: Presentation, color: 'text-orange-500 bg-orange-50' },
]

export default function UploadModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState('pdf')
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  
  // Progress States
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [stage, setStage] = useState<'idle' | 'uploading' | 'building' | 'complete'>('idle')
  const [processingStatus, setProcessingStatus] = useState({ progress: 0, text: 'Preparing ingestion...' })
  const [resourceId, setResourceId] = useState<number | null>(null)

  const qc = useQueryClient()

  // SSD Stream Management
  useEffect(() => {
    if (stage !== 'building' || !resourceId) return

    let eventSource: EventSource | null = null
    
    const connectSSE = async () => {
        const token = await getAuthToken()
        const sseUrl = `${API_BASE}/library/resources/status-stream/?token=${token}`
        eventSource = new EventSource(sseUrl)

        eventSource.addEventListener('status', (e: any) => {
            const data = JSON.parse(e.data)
            const myResource = data.find((r: any) => r.id === resourceId)
            if (myResource) {
                setProcessingStatus({ 
                    progress: myResource.progress || 0, 
                    text: myResource.text || 'Building your study kit...' 
                })
                if (myResource.status === 'ready') {
                    setStage('complete')
                    setProcessingStatus({ progress: 100, text: 'Study Kit Ready!' })
                    qc.invalidateQueries({ queryKey: ['resources'] })
                    toast.success('Your Hyper-Notes are ready!')
                    setTimeout(onClose, 1500)
                }
            }
        })

        eventSource.onerror = () => {
            eventSource?.close()
        }
    }

    connectSSE()
    return () => eventSource?.close()
  }, [stage, resourceId, qc, onClose])

  const mutation = useMutation({
    mutationFn: (data: FormData) => libraryApi.uploadResource(data, (pe) => {
        const p = Math.round((pe.loaded * 100) / pe.total)
        setUploadProgress(p)
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      const id = res.data?.id
      if (id) {
          setResourceId(id)
          setStage('building')
      } else {
          toast.success('Resource uploaded!')
          onClose()
      }
    },
    onError: () => {
        setStage('idle')
        setIsUploading(false)
        setUploadProgress(0)
        toast.error('Upload failed. Please try a smaller file.')
    },
  })

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) {
      setFile(files[0])
      if (!title) setTitle(files[0].name.replace(/\.[^/.]+$/, ''))
    }
  }, [title])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'application/pdf': [], 
      'application/msword': [], 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
      'application/vnd.ms-powerpoint': [],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': [],
      'text/*': [], 
      'image/*': [] 
    },
    maxFiles: 1,
    disabled: stage !== 'idle'
  })

  const handleSubmit = () => {
    if (!title) { toast.error('Please add a title.'); return }
    if (type !== 'video' && !file) { toast.error('Please select a file to upload.'); return }
    if (type === 'video' && !url) { toast.error('Please provide a YouTube URL.'); return }
    
    setStage('uploading')
    const fd = new FormData()
    fd.append('title', title)
    fd.append('resource_type', type)
    fd.append('subject', subject)
    if (file) fd.append('file', file)
    if (url) fd.append('url', url)
    mutation.mutate(fd)
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-t-[1.5rem] sm:rounded-[2rem] w-full max-w-2xl shadow-2xl border border-slate-200/50 dark:border-slate-800/50 flex flex-col max-h-[92vh] sm:max-h-[95vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-2 duration-300 overflow-hidden">
        
        {/* Progress Overlay - High Fidelity */}
        {stage !== 'idle' && (
            <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 z-50 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
                <div className="w-full max-w-md space-y-8">
                    <div className="relative mx-auto w-24 h-24">
                        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-25" />
                        <div className="relative bg-white dark:bg-slate-800 rounded-full w-full h-full flex items-center justify-center shadow-xl border border-slate-100 dark:border-slate-700">
                            {stage === 'complete' ? (
                                <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-in zoom-in duration-300" />
                            ) : (
                                <Sparkles className="w-10 h-10 text-primary animate-pulse" />
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                            {stage === 'uploading' ? 'Ingesting Material...' : 
                             stage === 'building' ? 'Building Hyper-Notes Kit' : 'Kit Complete!'}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 font-medium italic">
                            {stage === 'uploading' ? `Uploading ${title}...` : processingStatus.text}
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner p-1">
                            <div 
                                className="h-full bg-gradient-to-r from-primary to-indigo-500 rounded-full transition-all duration-700 ease-out relative"
                                style={{ width: `${stage === 'uploading' ? uploadProgress : processingStatus.progress}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-pulse" />
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                            <span>{stage === 'uploading' ? 'Upload Phase' : 'AI Ingestion'}</span>
                            <span className="text-primary">{stage === 'uploading' ? uploadProgress : processingStatus.progress}%</span>
                        </div>
                    </div>

                    {stage === 'building' && (
                        <div className="p-4 bg-primary/5 dark:bg-primary/10 rounded-2xl border border-primary/10 animate-in slide-in-from-bottom-4 duration-1000">
                            <p className="text-xs text-primary font-bold leading-relaxed">
                                Our Hyper-Notes engine uses Macro-Chunking to synthesize your content 5x faster than before. Hang tight!
                            </p>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between p-4 sm:p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary shadow-inner">
              <Upload className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight">Upload Materials</h2>
              <p className="hidden sm:block text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">FlowAI builder starts after ingestion.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 rounded-xl text-slate-400 bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-8 space-y-5 sm:space-y-8 overflow-y-auto flex-1 scrollbar-hide">
          {/* Type selector */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={cn(
                  "p-2 sm:p-4 rounded-xl sm:rounded-2xl border-2 text-center transition-all group",
                  type === t.id 
                    ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-sm' 
                    : 'border-slate-100 dark:border-slate-800 hover:border-primary/30'
                )}
              >
                <div className={cn(
                  "w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl mx-auto mb-1.5 sm:mb-3 flex items-center justify-center transition-transform group-hover:scale-110",
                  type === t.id ? 'bg-primary text-white shadow-lg' : t.color
                )}>
                  <t.icon className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                </div>
                <div className={cn("text-[8px] sm:text-xs font-black uppercase tracking-widest leading-tight truncate px-1", type === t.id ? 'text-primary' : 'text-slate-500')}>{t.label}</div>
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Resource Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 1: Intro" className="input py-2.5 sm:py-3 text-sm sm:text-base" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Biology" className="input py-2.5 sm:py-3 text-sm sm:text-base" />
            </div>
          </div>

          {type === 'video' ? (
            <div className="space-y-1.5 animate-in slide-in-from-bottom-2">
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">YouTube Link</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="input py-2.5 sm:py-3 text-sm sm:text-base" />
            </div>
          ) : (
            <div className="space-y-1.5 animate-in slide-in-from-bottom-2">
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Source File</label>
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-[1.25rem] sm:rounded-[2rem] p-5 sm:p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center group",
                  isDragActive 
                    ? 'border-primary bg-primary/5' 
                    : 'border-slate-200 dark:border-slate-800 hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                )}
              >
                <input {...getInputProps()} />
                <div className="w-10 h-10 sm:w-14 sm:h-14 bg-slate-100 dark:bg-slate-800 rounded-xl sm:rounded-[1.5rem] mb-2 sm:mb-4 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner text-slate-400">
                  <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                {file ? (
                  <div>
                    <p className="text-sm sm:text-base font-black text-primary truncate max-w-[200px] sm:max-w-md">{file.name}</p>
                    <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 sm:mt-1 uppercase tracking-widest font-bold">Ready to ingest</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm sm:text-base font-black text-slate-700 dark:text-slate-200">Drag & Drop Materials</p>
                    <p className="text-[10px] sm:text-sm text-slate-400 mt-1 font-medium italic">PDF, DOCX, PPTX, JPG, & Code</p>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="hidden sm:flex bg-primary/5 dark:bg-primary/10 rounded-2xl p-4 items-center gap-3 border border-primary/10">
            <div className="p-2 bg-primary/10 rounded-lg text-primary"><Cloud className="w-4 h-4" /></div>
            <p className="text-xs text-primary font-bold tracking-tight">Pro tip: Connect your Google Drive or Notion to sync study materials automatically.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 pb-8 sm:pb-8">
          <button onClick={onClose} className="hidden sm:block flex-shrink-0 px-6 py-2.5 text-xs font-black text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 uppercase tracking-widest transition-colors">Cancel</button>
          
          <div className="flex w-full sm:w-auto items-center gap-2 sm:gap-3">
            <button onClick={onClose} className="sm:hidden flex-1 py-3 text-xs font-black text-slate-500 hover:text-slate-700 border border-slate-200 dark:border-slate-800 rounded-xl uppercase tracking-widest transition-colors">Cancel</button>
            <button className="hidden sm:flex flex-1 sm:flex-none btn-secondary border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-5 text-xs py-3 justify-center items-center gap-1.5 transition-colors">
              <Sparkles className="w-3.5 h-3.5" /> <span>Import</span>
            </button>
            <button 
              onClick={handleSubmit} 
              disabled={mutation.isPending || stage !== 'idle'} 
              className={cn(
                "flex-[2] sm:flex-none btn-primary px-4 sm:px-8 py-3.5 shadow-xl shadow-primary/20 text-xs flex justify-center items-center gap-2",
                mutation.isPending || stage !== 'idle' ? "opacity-75 cursor-wait" : ""
              )}
            >
              {mutation.isPending || stage !== 'idle' ? <><Loader2 className="w-4 h-4 animate-spin" /> Working...</> : <><Sparkles className="w-4 h-4" /> Ingest Now</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
