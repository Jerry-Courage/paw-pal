'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assignmentsApi, libraryApi } from '@/lib/api'
import {
  Plus, Sparkles, FileText, Download, Trash2, X, Loader2,
  BookOpen, CheckCircle2, Clock, AlertCircle, ChevronDown,
  FileDown, Upload, Calendar, ArrowRight, Zap, Eye,
  RotateCcw, File, CalendarPlus, Link2
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'

const STATUS_CONFIG: Record<string, { color: string; dot: string; icon: any; label: string }> = {
  pending:    { color: 'text-gray-500 bg-gray-100 dark:bg-gray-800',           dot: 'bg-gray-400',    icon: Clock,         label: 'Pending' },
  processing: { color: 'text-sky-600 bg-sky-100 dark:bg-sky-950/50',           dot: 'bg-sky-500',     icon: Loader2,       label: 'Processing' },
  completed:  { color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', dot: 'bg-emerald-500', icon: CheckCircle2,  label: 'Completed' },
  error:      { color: 'text-red-600 bg-red-100 dark:bg-red-950/50',           dot: 'bg-red-500',     icon: AlertCircle,   label: 'Error' },
}

const SUBJECT_COLORS: Record<string, string> = {
  math: 'from-blue-400 to-blue-600',
  biology: 'from-emerald-400 to-emerald-600',
  chemistry: 'from-violet-400 to-violet-600',
  physics: 'from-orange-400 to-orange-600',
  history: 'from-amber-400 to-amber-600',
  english: 'from-pink-400 to-pink-600',
  default: 'from-sky-400 to-sky-600',
}

function subjectColor(subject: string) {
  const s = subject?.toLowerCase() || ''
  return Object.entries(SUBJECT_COLORS).find(([k]) => s.includes(k))?.[1] || SUBJECT_COLORS.default
}

export default function AssignmentsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.getAll().then(r => r.data),
  })
  const assignments: any[] = data?.results || []

  const deleteMutation = useMutation({
    mutationFn: (id: number) => assignmentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      setSelected(null)
      toast.success('Assignment deleted.')
    },
  })

  const pending = assignments.filter(a => a.status === 'pending').length
  const completed = assignments.filter(a => a.status === 'completed').length

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Assignments</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Upload or type your assignment — FlowAI solves it using your study materials.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2 text-sm self-start sm:self-auto">
          <Plus className="w-4 h-4" /> New Assignment
        </button>
      </div>

      {/* Stats bar */}
      {assignments.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total', value: assignments.length, color: 'text-gray-700 dark:text-gray-300' },
            { label: 'Pending', value: pending, color: 'text-sky-600' },
            { label: 'Completed', value: completed, color: 'text-emerald-600' },
          ].map(s => (
            <div key={s.label} className="card p-3 text-center">
              <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="card h-52 animate-pulse" />)}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState onNew={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignments.map((a: any) => (
            <AssignmentCard key={a.id} assignment={a}
              onClick={() => setSelected(a)}
              onDelete={() => deleteMutation.mutate(a.id)} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(a) => { setShowCreate(false); setSelected(a) }}
        />
      )}
      {selected && (
        <DetailModal
          assignment={selected}
          onClose={() => setSelected(null)}
          onDelete={() => deleteMutation.mutate(selected.id)}
        />
      )}
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="card p-12 text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-sky-400 to-violet-500 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-sky-200 dark:shadow-sky-900">
        <FileText className="w-10 h-10 text-white" />
      </div>
      <h3 className="font-bold text-xl mb-2">No assignments yet</h3>
      <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto leading-relaxed">
        Type your assignment question or upload a PDF. Link your study resources and FlowAI will craft a complete, structured response using your materials.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center text-sm text-gray-400 mb-6">
        {['Upload PDF or type instructions', 'Link your study resources', 'FlowAI writes the response', 'Export as PDF, DOCX, or TXT'].map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 h-6 bg-sky-100 dark:bg-sky-950 text-sky-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
            <span className="text-xs">{step}</span>
            {i < 3 && <ArrowRight className="w-3 h-3 hidden sm:block flex-shrink-0" />}
          </div>
        ))}
      </div>
      <button onClick={onNew} className="btn-primary flex items-center gap-2 mx-auto">
        <Plus className="w-4 h-4" /> Create First Assignment
      </button>
    </div>
  )
}

function AssignmentCard({ assignment: a, onClick, onDelete }: any) {
  const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending
  const Icon = cfg.icon
  const color = subjectColor(a.subject)

  return (
    <div onClick={onClick}
      className="card overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer group hover:-translate-y-0.5">
      {/* Color bar */}
      <div className={cn('h-1.5 bg-gradient-to-r', color)} />

      <div className="p-5">
        {/* Status + delete */}
        <div className="flex items-center justify-between mb-3">
          <span className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', cfg.color)}>
            <Icon className={cn('w-3 h-3', a.status === 'processing' && 'animate-spin')} />
            {cfg.label}
          </span>
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2 leading-snug">{a.title}</h3>
        {a.subject && (
          <span className="inline-block text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-full mb-2">{a.subject}</span>
        )}

        {/* Preview */}
        {a.file_name ? (
          <div className="flex items-center gap-2 text-xs text-sky-500 bg-sky-50 dark:bg-sky-950/30 rounded-lg px-2.5 py-1.5 mb-3">
            <Upload className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{a.file_name}</span>
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 leading-relaxed">{a.instructions}</p>
        )}

        {/* Resources */}
        {a.resource_titles?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {a.resource_titles.slice(0, 2).map((r: any) => (
              <span key={r.id} className="text-xs bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                <BookOpen className="w-2.5 h-2.5" />
                {r.title.length > 18 ? r.title.slice(0, 18) + '…' : r.title}
              </span>
            ))}
            {a.resource_titles.length > 2 && (
              <span className="text-xs text-gray-400 px-1">+{a.resource_titles.length - 2}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-50 dark:border-gray-800">
          <span className="text-xs text-gray-400">{format(new Date(a.created_at), 'MMM d, yyyy')}</span>
          {a.status === 'completed' ? (
            <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
              <Eye className="w-3 h-3" /> View result
            </span>
          ) : a.status === 'pending' ? (
            <span className="text-xs text-sky-500 font-medium flex items-center gap-1">
              <Zap className="w-3 h-3" /> Solve now
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (a: any) => void }) {
  const [inputMode, setInputMode] = useState<'type' | 'upload'>('type')
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [selectedResources, setSelectedResources] = useState<number[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })
  const resources: any[] = resourcesData?.results || []

  const mutation = useMutation({
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
    onSuccess: (res) => { onCreated(res.data); toast.success('Assignment created!') },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to create.'),
  })

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.type === 'application/pdf') { setFile(f); if (!title) setTitle(f.name.replace('.pdf', '')) }
    else toast.error('Only PDF files are supported.')
  }, [title])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); if (!title) setTitle(f.name.replace('.pdf', '')) }
  }

  const canSubmit = title.trim() && (inputMode === 'type' ? instructions.trim() : file)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="font-bold text-lg">New Assignment</h2>
            <p className="text-xs text-gray-400 mt-0.5">FlowAI will complete it using your study materials</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Title + Subject */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Assignment title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Essay on Climate Change" className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="e.g. Biology" className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Due date</label>
              <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
            </div>
          </div>

          {/* Input mode toggle */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Assignment content *</label>
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3">
              {[
                { id: 'type', icon: FileText, label: 'Type instructions' },
                { id: 'upload', icon: Upload, label: 'Upload PDF' },
              ].map(m => (
                <button key={m.id} onClick={() => setInputMode(m.id as any)}
                  className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all',
                    inputMode === m.id ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')}>
                  <m.icon className="w-3.5 h-3.5" /> {m.label}
                </button>
              ))}
            </div>

            {inputMode === 'type' ? (
              <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
                placeholder="Paste your assignment question, essay prompt, or full instructions here..."
                className="input resize-none text-sm leading-relaxed" rows={6} />
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                  dragging ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30' :
                  file ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20' :
                  'border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:bg-sky-50/50 dark:hover:bg-sky-950/10'
                )}>
                <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/50 rounded-xl flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    </div>
                    <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{file.name}</p>
                    <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
                    <button onClick={e => { e.stopPropagation(); setFile(null) }}
                      className="text-xs text-red-500 hover:underline mt-1">Remove</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
                      <Upload className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="font-medium text-sm text-gray-700 dark:text-gray-300">Drop your PDF here</p>
                    <p className="text-xs text-gray-400">or click to browse · PDF only · max 10MB</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Resources */}
          {resources.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">
                Link study resources <span className="text-gray-400 font-normal">(AI will use these to answer)</span>
              </label>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {resources.map((r: any) => {
                  const checked = selectedResources.includes(r.id)
                  return (
                    <label key={r.id} className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none',
                      checked ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                    )}>
                      <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                        checked ? 'bg-sky-500 border-sky-500' : 'border-gray-300 dark:border-gray-600')}>
                        {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <input type="checkbox" checked={checked} className="hidden"
                        onChange={() => setSelectedResources(s => checked ? s.filter(x => x !== r.id) : [...s, r.id])} />
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0',
                        r.resource_type === 'pdf' ? 'bg-red-100 text-red-500' : 'bg-sky-100 text-sky-500')}>
                        {r.resource_type === 'pdf' ? '📄' : '🎥'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate text-gray-800 dark:text-gray-200">{r.title}</div>
                        <div className="text-xs text-gray-400 capitalize">{r.resource_type} · {r.subject || 'No subject'}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6 flex-shrink-0 border-t border-gray-100 dark:border-gray-800 pt-4">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            {mutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
              : <><Sparkles className="w-4 h-4" /> Create Assignment</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailModal({ assignment: initial, onClose, onDelete }: any) {
  const qc = useQueryClient()
  const [exportOpen, setExportOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['assignment', initial.id],
    queryFn: () => assignmentsApi.get(initial.id).then(r => r.data),
    refetchInterval: (d: any) => d?.status === 'processing' ? 2500 : false,
    initialData: initial,
  })
  const a = data || initial
  const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending
  const StatusIcon = cfg.icon
  const color = subjectColor(a.subject)

  const solveMutation = useMutation({
    mutationFn: () => assignmentsApi.solve(a.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignment', a.id] }),
    onError: (e: any) => toast.error(e?.response?.data?.error || 'AI failed. Try again.'),
  })

  const handleExport = async (fmt: string) => {
    setExportOpen(false)
    try {
      const res = await assignmentsApi.export(a.id, fmt)
      const url = URL.createObjectURL(new Blob([res.data]))
      const el = document.createElement('a')
      el.href = url; el.download = `${a.title.replace(/\s+/g, '_')}.${fmt}`; el.click()
      URL.revokeObjectURL(url)
      toast.success(`Downloaded as .${fmt}`)
    } catch { toast.error('Export failed.') }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Color accent top */}
        <div className={cn('h-1 bg-gradient-to-r flex-shrink-0', color)} />

        {/* Header */}
        <div className="flex items-start gap-4 px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', cfg.color)}>
                <StatusIcon className={cn('w-3 h-3', a.status === 'processing' && 'animate-spin')} />
                {cfg.label}
              </span>
              {a.subject && <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{a.subject}</span>}
              {a.due_date && (
                <span className="text-xs text-orange-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Due {format(new Date(a.due_date), 'MMM d')}
                </span>
              )}
            </div>
            <h2 className="font-bold text-xl text-gray-900 dark:text-white leading-tight">{a.title}</h2>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {a.status === 'completed' && (
              <div className="relative">
                <button onClick={() => setExportOpen(!exportOpen)}
                  className="btn-secondary flex items-center gap-1.5 text-sm h-9 px-3">
                  <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3" />
                </button>
                {exportOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-xl z-20 w-44 overflow-hidden">
                      {[
                        { fmt: 'pdf', icon: FileDown, label: 'PDF Document', color: 'text-red-500' },
                        { fmt: 'docx', icon: File, label: 'Word Document', color: 'text-blue-500' },
                        { fmt: 'txt', icon: FileText, label: 'Plain Text', color: 'text-gray-500' },
                      ].map(({ fmt, icon: Icon, label, color: c }) => (
                        <button key={fmt} onClick={() => handleExport(fmt)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                          <Icon className={cn('w-4 h-4', c)} /> {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button onClick={onDelete}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose}
              className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Instructions / file */}
          <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Assignment</p>
            {a.file_name && (
              <div className="flex items-center gap-2 text-sm text-sky-600 bg-sky-50 dark:bg-sky-950/30 rounded-xl px-3 py-2 mb-2 w-fit">
                <Upload className="w-4 h-4 flex-shrink-0" /> {a.file_name}
              </div>
            )}
            {a.instructions && (
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed line-clamp-4">{a.instructions}</p>
            )}
            {a.resource_titles?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {a.resource_titles.map((r: any) => (
                  <span key={r.id} className="flex items-center gap-1.5 text-xs bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 px-2.5 py-1 rounded-full">
                    <BookOpen className="w-3 h-3" /> {r.title}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Planner integration */}
          <PlannerSection assignment={a} />

          {/* States */}
          {a.status === 'pending' && (
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-sky-400 to-violet-500 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-sky-200 dark:shadow-sky-900">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h3 className="font-bold text-xl mb-2">Ready to solve</h3>
              <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto leading-relaxed">
                FlowAI will read your {a.resource_titles?.length > 0 ? `${a.resource_titles.length} linked resource${a.resource_titles.length > 1 ? 's' : ''}` : 'instructions'} and craft a complete, structured response.
              </p>
              <button onClick={() => solveMutation.mutate()} disabled={solveMutation.isPending}
                className="btn-primary flex items-center gap-2 mx-auto px-6 py-2.5">
                {solveMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
                  : <><Sparkles className="w-4 h-4" /> Solve with FlowAI</>}
              </button>
            </div>
          )}

          {a.status === 'processing' && (
            <div className="p-12 text-center">
              <div className="relative w-20 h-20 mx-auto mb-5">
                <div className="w-20 h-20 bg-sky-50 dark:bg-sky-950/30 rounded-3xl flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-violet-500 rounded-full flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>
              <h3 className="font-bold text-lg mb-2">FlowAI is working on it...</h3>
              <p className="text-sm text-gray-400 max-w-xs mx-auto">Reading your resources and crafting a structured response. Usually takes 30–60 seconds.</p>
              <div className="flex justify-center gap-1.5 mt-5">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          {a.status === 'error' && (
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-950/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Something went wrong</h3>
              <p className="text-sm text-gray-400 mb-5">The AI couldn't complete this assignment. Check your connection and try again.</p>
              <button onClick={() => solveMutation.mutate()} disabled={solveMutation.isPending}
                className="btn-primary flex items-center gap-2 mx-auto">
                <RotateCcw className="w-4 h-4" /> Try Again
              </button>
            </div>
          )}

          {a.status === 'completed' && (
            <div className="p-6 space-y-5">
              {/* Overview card */}
              {a.ai_overview && (
                <div className="bg-gradient-to-br from-sky-50 to-violet-50 dark:from-sky-950/20 dark:to-violet-950/20 rounded-2xl p-5 border border-sky-100 dark:border-sky-900/50">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-sky-400 to-violet-500 rounded-xl flex items-center justify-center shadow-sm">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-200">FlowAI Overview</span>
                      <p className="text-xs text-gray-400">What the AI did</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{a.ai_overview}</p>
                </div>
              )}

              {/* Structure outline */}
              {a.ai_outline?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Document Structure</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {a.ai_outline.map((s: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                        <span className="w-6 h-6 bg-sky-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">{s.section}</div>
                          {s.summary && <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{s.summary}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full response */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Full Response</p>
                <div className="prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-gray-800/30 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                  <ReactMarkdown>{a.ai_response}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlannerSection({ assignment: a }: { assignment: any }) {
  const [showSchedule, setShowSchedule] = useState(false)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const qc = useQueryClient()

  const scheduleMutation = useMutation({
    mutationFn: () => assignmentsApi.scheduleSession(a.id, startTime, endTime),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignment', a.id] })
      qc.invalidateQueries({ queryKey: ['planner-sessions'] })
      setShowSchedule(false)
      toast.success('Study session added to your planner!')
    },
    onError: () => toast.error('Failed to schedule session.'),
  })

  return (
    <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> Planner
        </p>
        <Link href="/planner" className="text-xs text-sky-500 hover:underline">Open Planner →</Link>
      </div>

      <div className="flex flex-wrap gap-3">
        {/* Deadline badge */}
        {a.deadline_id ? (
          <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/50 rounded-xl px-3 py-2">
            <Calendar className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
            <div>
              <div className="text-xs font-medium text-orange-700 dark:text-orange-300">Deadline in planner</div>
              {a.deadline_date && (
                <div className="text-xs text-orange-500">{format(new Date(a.deadline_date), 'MMM d, yyyy · h:mm a')}</div>
              )}
            </div>
            <CheckCircle2 className="w-3.5 h-3.5 text-orange-400 ml-1" />
          </div>
        ) : a.due_date ? (
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-xs text-gray-400">
            <Calendar className="w-3.5 h-3.5" /> No planner deadline yet
          </div>
        ) : null}

        {/* Sessions count */}
        {a.session_count > 0 && (
          <div className="flex items-center gap-2 bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/50 rounded-xl px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-sky-500" />
            <span className="text-xs font-medium text-sky-700 dark:text-sky-300">
              {a.session_count} study session{a.session_count > 1 ? 's' : ''} scheduled
            </span>
          </div>
        )}

        {/* Schedule button */}
        <button onClick={() => setShowSchedule(!showSchedule)}
          className="flex items-center gap-1.5 text-xs text-sky-500 hover:text-sky-600 bg-sky-50 dark:bg-sky-950/30 hover:bg-sky-100 dark:hover:bg-sky-950/50 border border-sky-100 dark:border-sky-900/50 rounded-xl px-3 py-2 transition-colors font-medium">
          <CalendarPlus className="w-3.5 h-3.5" />
          Schedule study session
        </button>
      </div>

      {/* Inline schedule form */}
      {showSchedule && (
        <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 space-y-3">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">When do you want to work on this?</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Start</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className="input text-xs" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">End</label>
              <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className="input text-xs" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowSchedule(false)} className="btn-secondary flex-1 text-xs">Cancel</button>
            <button onClick={() => scheduleMutation.mutate()}
              disabled={!startTime || !endTime || scheduleMutation.isPending}
              className="btn-primary flex-1 text-xs flex items-center justify-center gap-1.5">
              {scheduleMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarPlus className="w-3 h-3" />}
              Add to Planner
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
