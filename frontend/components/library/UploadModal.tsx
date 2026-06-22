'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { libraryApi, paymentsApi, API_BASE, getAuthToken } from '@/lib/api'
import {
  X, Upload, FileText, Youtube, Code, Presentation, Plus, Loader2,
  Sparkles, CheckCircle2, Brain, HelpCircle, Map,
  Wand2, Radio, ArrowLeft, Check, Headphones,
  FlaskConical, Layers, Link2, Mic, BookOpen, Calculator, Lock
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'

const PaywallModal = dynamic(() => import('@/components/ui/PaywallModal'), { ssr: false })

const TYPES = [
  { id: 'pdf', label: 'PDF/Word', sub: 'Textbooks, notes', icon: FileText, color: 'text-rose-500 bg-rose-500/10' },
  { id: 'video', label: 'YouTube', sub: 'Lectures, tutorials', icon: Youtube, color: 'text-red-500 bg-red-500/10' },
  { id: 'slides', label: 'Slides', sub: 'PPTX presentations', icon: Presentation, color: 'text-orange-500 bg-orange-500/10' },
  { id: 'code', label: 'Code', sub: 'Scripts, notebooks', icon: Code, color: 'text-emerald-500 bg-emerald-500/10' },
]

const FEATURES = [
  { id: 'notes',     label: 'Notes',           icon: BookOpen,    required: true },
  { id: 'quiz',      label: 'Multiple Choice', icon: HelpCircle,  required: false },
  { id: 'flashcards',label: 'Flashcards',      icon: Layers,      required: false },
  { id: 'practice',  label: 'Written Tests',   icon: Wand2,       required: false },
  { id: 'podcast',   label: 'Podcast',         icon: Headphones,  required: false },
  { id: 'mindmap',   label: 'Mind Map',        icon: Map,         required: false },
]

interface UploadModalProps {
  onClose: () => void
  initialMode?: 'file' | 'paste' | 'record'
}

export default function UploadModal({ onClose, initialMode = 'file' }: UploadModalProps) {
  const [step, setStep] = useState<'upload' | 'features'>('upload')
  const [type, setType] = useState(initialMode === 'paste' ? 'video' : 'pdf')
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['notes', 'flashcards', 'quiz'])
  const [stage, setStage] = useState<'idle' | 'uploading' | 'building' | 'complete'>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processingStatus, setProcessingStatus] = useState({ progress: 0, text: 'Preparing ingestion...' })
  const [resourceId, setResourceId] = useState<number | null>(null)
  const [showPaywall, setShowPaywall] = useState(false)

  const qc = useQueryClient()

  // Fetch subscription / usage status
  const { data: subStatus, refetch: refetchSub } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => paymentsApi.getStatus().then(r => r.data),
    staleTime: 30000,
  })

  const atLimit = subStatus?.at_limit === true

  const toggleFeature = (id: string) => {
    if (id === 'notes') return
    setSelectedFeatures(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    )
  }

  // SSE for progress tracking
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
          // Only mark complete when status=ready AND has_study_kit=true
          // has_study_kit is set AFTER the AI kit is fully written — prevents
          // the "says ready but still building" race condition
          if (myResource.status === 'ready' && myResource.has_study_kit === true) {
            setStage('complete')
            setProcessingStatus({ progress: 100, text: 'All features ready!' })
            qc.invalidateQueries({ queryKey: ['resources'] })
            toast.success('Your study kit is ready!')
            setTimeout(onClose, 1500)
          } else if (myResource.status === 'error') {
            setStage('idle')
            setProcessingStatus({ progress: 0, text: '' })
            toast.error(myResource.text || 'Generation failed. Please try again.')
            eventSource?.close()
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
      setUploadProgress(Math.round((pe.loaded * 100) / pe.total))
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      const id = res.data?.id
      if (id) { setResourceId(id); setStage('building') }
      else { toast.success('Resource uploaded!'); onClose() }
    },
    onError: (err: any) => {
      setStage('idle')
      setUploadProgress(0)
      const status = err?.response?.status
      const data   = err?.response?.data

      // Backend freemium gate returns 402 with error: 'free_limit_reached'
      if (status === 402 || data?.error === 'free_limit_reached') {
        refetchSub() // refresh usage count so the badge updates
        setShowPaywall(true)
      } else if (status === 413 || data?.error?.toLowerCase?.()?.includes('too large') || data?.error?.toLowerCase?.()?.includes('file too large')) {
        toast.error('File is too large. Maximum size is 50 MB.')
      } else {
        toast.error(data?.error || data?.detail || 'Upload failed. Please check your file and try again.')
      }
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
    if (type !== 'video' && !file) { toast.error('Please select a file.'); return }
    if (type === 'video' && !url) { toast.error('Please provide a YouTube URL.'); return }
    // Check free limit before proceeding — show paywall immediately instead of letting the
    // request go through and getting a confusing error back from the server
    if (atLimit) { setShowPaywall(true); return }
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

  // ── STEP 2: Full-screen feature selection ────────────────────────
  if (step === 'features' && stage === 'idle') {
    return (
      <div className="fixed inset-0 bg-[#0d0d0d] z-[100] flex flex-col animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <button onClick={() => setStep('upload')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-bold">Back</span>
          </button>
          <h2 className="text-sm font-black text-white">New Study Set</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-2xl space-y-10">
            <div className="text-center">
              <h1 className="text-3xl font-black text-white tracking-tight">What would you like to include?</h1>
              <p className="text-slate-500 mt-2">Choose all the methods you want included in your study set:</p>
            </div>

            {/* Feature grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {FEATURES.map(f => {
                const selected = selectedFeatures.includes(f.id)
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFeature(f.id)}
                    className={cn(
                      'relative flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all active:scale-[0.98]',
                      selected
                        ? 'border-orange-500/60 bg-orange-500/10'
                        : 'border-white/8 bg-[#1a1a1a] hover:border-white/20 hover:bg-[#1f1f1f]',
                      f.required && 'cursor-default'
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                      selected ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-slate-400'
                    )}>
                      <f.icon className="w-5 h-5" />
                    </div>
                    <span className={cn('text-sm font-bold', selected ? 'text-white' : 'text-slate-300')}>
                      {f.label}
                    </span>
                    {selected && (
                      <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    {f.required && !selected && (
                      <div className="absolute top-3 right-3 text-[8px] font-black text-orange-500 uppercase tracking-widest">Always</div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Footer row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="w-5 h-5 rounded bg-white/5 flex items-center justify-center text-[10px] font-black text-slate-400">US</span>
                <span className="font-medium">English</span>
              </div>
              <button
                onClick={handleSubmit}
                className="px-8 py-3 rounded-xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 active:scale-95 transition-all shadow-lg shadow-orange-500/20 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Generate
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Progress overlay (uploading / building / complete) ────────────
  if (stage !== 'idle') {
    return (
      <div className="fixed inset-0 bg-[#0d0d0d] z-[100] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
        <div className="w-full max-w-md space-y-8">
          <div className="relative mx-auto w-24 h-24">
            <div className="absolute inset-0 bg-orange-500/20 rounded-full animate-ping opacity-30" />
            <div className="relative bg-[#1a1a1a] rounded-full w-full h-full flex items-center justify-center border border-white/10">
              {stage === 'complete'
                ? <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-in zoom-in duration-300" />
                : <Sparkles className="w-10 h-10 text-orange-400 animate-pulse" />}
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-white">
              {stage === 'uploading' ? 'Uploading...' : stage === 'building' ? 'Building Your Kit' : 'All Ready!'}
            </h3>
            <p className="text-slate-500 italic">
              {stage === 'uploading' ? `Uploading ${title}...` : processingStatus.text}
            </p>
          </div>
          <div className="space-y-3">
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-700"
                style={{ width: `${stage === 'uploading' ? uploadProgress : processingStatus.progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-600">
              <span>{stage === 'uploading' ? 'Upload' : 'AI Generation'}</span>
              <span className="text-orange-500">{stage === 'uploading' ? uploadProgress : processingStatus.progress}%</span>
            </div>
          </div>
          {stage === 'building' && (
            <div className="flex flex-wrap gap-2 justify-center">
              {selectedFeatures.map(f => {
                const feat = FEATURES.find(x => x.id === f)
                if (!feat) return null
                return (
                  <span key={f} className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-slate-400">
                    {feat.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── STEP 1: Upload modal ──────────────────────────────────────────
  return (
    <>
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-[#111] rounded-t-[1.5rem] sm:rounded-2xl w-full max-w-lg shadow-2xl border border-white/8 flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <div>
            <h2 className="text-base font-black text-white">Please upload your file</h2>
            <p className="text-xs text-slate-500 mt-0.5">We will turn your file into insane study material</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Free usage indicator */}
            {subStatus && !subStatus.is_premium && (
              <div className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border',
                atLimit
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : 'bg-white/5 border-white/8 text-slate-400'
              )}>
                {atLimit ? <Lock className="w-3 h-3" /> : <Sparkles className="w-3 h-3 text-orange-400" />}
                {atLimit ? 'Limit reached' : `${subStatus.notes_used}/${subStatus.notes_limit} free`}
              </div>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1 scrollbar-hide">
          {/* Type selector */}
          <div className="grid grid-cols-4 gap-2">
            {TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={cn(
                  'p-3 rounded-xl border text-center transition-all',
                  type === t.id ? 'border-orange-500/50 bg-orange-500/10' : 'border-white/8 bg-white/3 hover:border-white/15'
                )}
              >
                <div className={cn('w-7 h-7 rounded-lg mx-auto mb-1.5 flex items-center justify-center', type === t.id ? 'bg-orange-500/20 text-orange-400' : t.color)}>
                  <t.icon className="w-3.5 h-3.5" />
                </div>
                <div className={cn('text-[9px] font-black uppercase tracking-widest', type === t.id ? 'text-orange-400' : 'text-slate-500')}>{t.label}</div>
              </button>
            ))}
          </div>

          {/* Title + Subject */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Chapter 1"
                className="w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/40 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="e.g. Biology"
                className="w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/40 transition-colors"
              />
            </div>
          </div>

          {/* File / URL */}
          {type === 'video' ? (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">YouTube URL</label>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/40 transition-colors"
              />
            </div>
          ) : (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center gap-3',
                isDragActive ? 'border-orange-500 bg-orange-500/5' : 'border-white/10 hover:border-white/20 hover:bg-white/3'
              )}
            >
              <input {...getInputProps()} />
              {file ? (
                <div className="flex items-center gap-3 w-full bg-white/5 rounded-xl px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-white truncate">{file.name}</p>
                    <p className="text-[10px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-300">Drop file here or click to browse</p>
                    <p className="text-xs text-slate-600 mt-0.5">PDF, DOCX, PPTX, images</p>
                  </div>
                </>
              )}
            </div>
          )}

          {file && (
            <button
              onClick={() => { setFile(null); setTitle('') }}
              className="w-full py-2 rounded-xl border border-dashed border-orange-500/30 text-orange-400 text-xs font-black uppercase tracking-widest hover:bg-orange-500/5 transition-all"
            >
              + Add Another File
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
          <button onClick={onClose} className="text-xs font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
            Cancel
          </button>
          <button
            onClick={handleNext}
            className={cn(
              "px-8 py-2.5 rounded-xl text-white font-black text-sm active:scale-95 transition-all shadow-lg",
              atLimit
                ? "bg-slate-700 hover:bg-slate-600 shadow-none"
                : "bg-orange-500 hover:bg-orange-400 shadow-orange-500/20"
            )}
          >
            {atLimit ? <><Lock className="w-3.5 h-3.5 inline mr-1.5" />Upgrade to Continue</> : 'Next'}
          </button>
        </div>
      </div>
    </div>

    {/* Paywall modal — rendered outside the upload modal stack */}
    {showPaywall && subStatus && (
      <PaywallModal
        notesUsed={subStatus.notes_used}
        notesLimit={subStatus.notes_limit}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          refetchSub()
          setShowPaywall(false)
          // Let them continue to features step after upgrade
          setStep('features')
        }}
      />
    )}
  </>
  )
}
