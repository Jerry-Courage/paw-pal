'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi, API_BASE, getAuthToken } from '@/lib/api'
import {
  X, Upload, FileText, Youtube, Code, Presentation, Plus, Loader2,
  Sparkles, CheckCircle2, Cloud, BookOpen, HelpCircle, Map,
  Wand2, Radio, ArrowRight, ArrowLeft, Check, Brain, Headphones,
  FlaskConical, Layers, MessageSquare
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const TYPES = [
  { id: 'pdf', label: 'PDF/Word', sub: 'Textbooks, notes', icon: FileText, color: 'text-rose-500 bg-rose-500/10' },
  { id: 'video', label: 'YouTube', sub: 'Lectures, tutorials', icon: Youtube, color: 'text-red-500 bg-red-500/10' },
  { id: 'slides', label: 'Slides', sub: 'PPTX presentations', icon: Presentation, color: 'text-orange-500 bg-orange-500/10' },
  { id: 'code', label: 'Code', sub: 'Scripts, notebooks', icon: Code, color: 'text-emerald-500 bg-emerald-500/10' },
]

const FEATURES = [
  { id: 'notes', label: 'Study Notes', desc: 'AI-generated structured notes', icon: Brain, color: 'text-primary bg-primary/10', required: true },
  { id: 'flashcards', label: 'Flashcards', desc: '20–40 recall cards', icon: Layers, color: 'text-sky-500 bg-sky-500/10' },
  { id: 'quiz', label: 'Quiz', desc: '20–40 MCQ questions', icon: HelpCircle, color: 'text-orange-500 bg-orange-500/10' },
  { id: 'practice', label: 'Practice Test', desc: '20–40 exam questions', icon: FlaskConical, color: 'text-emerald-500 bg-emerald-500/10' },
  { id: 'mindmap', label: 'Mind Map', desc: 'Visual concept web', icon: Map, color: 'text-violet-500 bg-violet-500/10' },
  { id: 'podcast', label: 'Podcast', desc: '20–30 segment audio', icon: Headphones, color: 'text-pink-500 bg-pink-500/10' },
]

export default function UploadModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'details' | 'features'>('details')
  const [type, setType] = useState('pdf')
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['notes', 'flashcards', 'quiz'])

  // Progress States
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [stage, setStage] = useState<'idle' | 'uploading' | 'building' | 'complete'>('idle')
  const [processingStatus, setProcessingStatus] = useState({ progress: 0, text: 'Preparing ingestion...' })
  const [resourceId, setResourceId] = useState<number | null>(null)

  const qc = useQueryClient()

  const toggleFeature = (id: string) => {
    if (id === 'notes') return // notes always required
    setSelectedFeatures(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    )
  }

  // SSE Stream Management
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
          setProcessingStatus({ progress: myResource.progress || 0, text: myResource.text || 'Building your study kit...' })
          // Only close when truly ready (status=ready AND progress=100)
          if (myResource.status === 'ready' && myResource.progress >= 100) {
            setStage('complete')
            setProcessingStatus({ progress: 100, text: 'All features ready!' })
            qc.invalidateQueries({ queryKey: ['resources'] })
            toast.success('Your study kit is ready!')
            setTimeout(onClose, 1500)
          }
        }
      })
      eventSource.onerror = () => eventSource?.close()
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
      if (id) { setResourceId(id); setStage('building') }
      else { toast.success('Resource uploaded!'); onClose() }
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

  const handleNext = () => {
    if (!title) { toast.error('Please add a title.'); return }
    if (type !== 'video' && !file) { toast.error('Please select a file to upload.'); return }
    if (type === 'video' && !url) { toast.error('Please provide a YouTube URL.'); return }
    setStep('features')
  }

  const handleSubmit = () => {
    setStage('uploading')
    const fd = new FormData()
    fd.append('title', title)
    fd.append('resource_type', type)
    fd.append('subject', subject)
    fd.append('selected_features', JSON.stringify(selectedFeatures))
    if (file) fd.append('file', file)
    if (url) fd.append('url', url)
    mutation.mutate(fd)
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-t-[1.5rem] sm:rounded-[2rem] w-full max-w-2xl shadow-2xl border border-slate-200/50 dark:border-slate-800/50 flex flex-col max-h-[92vh] sm:max-h-[95vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-2 duration-300 overflow-hidden relative">

        {/* Progress Overlay */}
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
                  {stage === 'uploading' ? 'Uploading...' : stage === 'building' ? 'Building Your Kit' : 'All Ready!'}
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
                  <span>{stage === 'uploading' ? 'Upload' : 'AI Generation'}</span>
                  <span className="text-primary">{stage === 'uploading' ? uploadProgress : processingStatus.progress}%</span>
                </div>
              </div>
              {stage === 'building' && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {selectedFeatures.map(f => {
                    const feat = FEATURES.find(x => x.id === f)
                    if (!feat) return null
                    return (
                      <span key={f} className={cn('px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border', feat.color, 'border-current/20')}>
                        {feat.label}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="flex items-center gap-3">
            {step === 'features' && (
              <button onClick={() => setStep('details')} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              {step === 'details' ? <Upload className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {step === 'details' ? 'Upload Material' : 'Choose Features'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 'details' ? 'Step 1 of 2 — Add your file' : 'Step 2 of 2 — What to generate'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className={cn('w-2 h-2 rounded-full transition-colors', step === 'details' ? 'bg-primary' : 'bg-primary/30')} />
              <div className={cn('w-2 h-2 rounded-full transition-colors', step === 'features' ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700')} />
            </div>
            <button onClick={onClose} className="p-2.5 rounded-xl text-slate-400 bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 scrollbar-hide">

          {/* ── STEP 1: DETAILS ── */}
          {step === 'details' && (
            <>
              <div className="grid grid-cols-4 gap-2">
                {TYPES.map((t) => (
                  <button key={t.id} onClick={() => setType(t.id)}
                    className={cn('p-3 rounded-2xl border-2 text-center transition-all group',
                      type === t.id ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-slate-100 dark:border-slate-800 hover:border-primary/30'
                    )}>
                    <div className={cn('w-8 h-8 rounded-xl mx-auto mb-2 flex items-center justify-center transition-transform group-hover:scale-110',
                      type === t.id ? 'bg-primary text-white shadow-lg' : t.color)}>
                      <t.icon className="w-4 h-4" />
                    </div>
                    <div className={cn('text-[9px] font-black uppercase tracking-widest', type === t.id ? 'text-primary' : 'text-slate-500')}>{t.label}</div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Title</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 1: Intro" className="input" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Subject</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Biology" className="input" />
                </div>
              </div>

              {type === 'video' ? (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">YouTube Link</label>
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="input" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Source File</label>
                  <div {...getRootProps()} className={cn(
                    'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center group',
                    isDragActive ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-800 hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  )}>
                    <input {...getInputProps()} />
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-3 flex items-center justify-center group-hover:scale-110 transition-transform text-slate-400">
                      <Plus className="w-6 h-6" />
                    </div>
                    {file ? (
                      <div>
                        <p className="text-sm font-black text-primary truncate max-w-xs">{file.name}</p>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Ready to ingest</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-black text-slate-700 dark:text-slate-200">Drag & Drop or Browse</p>
                        <p className="text-xs text-slate-400 mt-1">PDF, DOCX, PPTX, Code files</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: FEATURES ── */}
          {step === 'features' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                Select what to generate for <span className="font-black text-slate-900 dark:text-white">"{title}"</span>. Everything runs in parallel — it'll all be ready when you open it.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {FEATURES.map((f) => {
                  const selected = selectedFeatures.includes(f.id)
                  return (
                    <button key={f.id} onClick={() => toggleFeature(f.id)}
                      className={cn(
                        'relative p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98]',
                        selected ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700',
                        f.required && 'cursor-default'
                      )}>
                      {selected && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                      {f.required && (
                        <div className="absolute top-3 right-3 text-[8px] font-black text-primary uppercase tracking-widest">Required</div>
                      )}
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', f.color)}>
                        <f.icon className="w-4.5 h-4.5" />
                      </div>
                      <div className="font-black text-sm text-slate-900 dark:text-white">{f.label}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{f.desc}</div>
                    </button>
                  )
                })}
              </div>
              <div className="p-3 bg-primary/5 rounded-2xl border border-primary/10 text-xs text-primary font-bold">
                {selectedFeatures.length} feature{selectedFeatures.length !== 1 ? 's' : ''} selected — all generate simultaneously after upload.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <button onClick={onClose} className="px-5 py-2.5 text-xs font-black text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 uppercase tracking-widest transition-colors">
            Cancel
          </button>
          {step === 'details' ? (
            <button onClick={handleNext} className="btn-primary px-8 py-3 flex items-center gap-2 text-sm">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={mutation.isPending || stage !== 'idle'}
              className={cn('btn-primary px-8 py-3 flex items-center gap-2 text-sm', (mutation.isPending || stage !== 'idle') && 'opacity-75 cursor-wait')}>
              {mutation.isPending || stage !== 'idle'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Building...</>
                : <><Sparkles className="w-4 h-4" /> Generate All</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

