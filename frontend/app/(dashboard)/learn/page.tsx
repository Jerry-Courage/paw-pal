'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { learningApi, libraryApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import FlowMascot from '@/components/learning/FlowMascot'

export default function LearnPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [startDate, setStartDate] = useState('')
  const [deadline, setDeadline] = useState('')
  const [selectedResources, setSelectedResources] = useState<number[]>([])

  const { data: paths, isLoading } = useQuery({
    queryKey: ['learning-paths'],
    queryFn: () => learningApi.getPaths().then(r => Array.isArray(r.data) ? r.data : r.data?.results || []),
  })

  const { data: resources } = useQuery({
    queryKey: ['library'],
    queryFn: () => libraryApi.getResources().then(r => Array.isArray(r.data) ? r.data : r.data?.results || []),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => learningApi.createPath(data),
    onSuccess: (res) => {
      // Auto-generate concepts if resources selected
      if (selectedResources.length > 0) {
        learningApi.generateConcepts(res.data.id, selectedResources).then(() => {
          qc.invalidateQueries({ queryKey: ['learning-paths'] })
          window.location.href = `/learn/${res.data.id}`
        }).catch(() => {
          qc.invalidateQueries({ queryKey: ['learning-paths'] })
          window.location.href = `/learn/${res.data.id}`
        })
      } else {
        qc.invalidateQueries({ queryKey: ['learning-paths'] })
        window.location.href = `/learn/${res.data.id}`
      }
      setShowCreate(false)
      resetForm()
    },
    onError: () => toast.error('Failed to create path'),
  })

  const resetForm = () => {
    setTitle('')
    setSubject('')
    setStartDate('')
    setDeadline('')
    setSelectedResources([])
  }

  const handleCreate = () => {
    if (!title.trim()) return toast.error('Enter a title')
    if (selectedResources.length === 0) return toast.error('Select at least one resource')
    createMutation.mutate({
      title: title.trim(),
      subject: subject.trim(),
      start_date: startDate || null,
      deadline: deadline || null,
    })
  }

  const toggleResource = (id: number) => {
    setSelectedResources(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id])
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-slate-500/20 text-slate-400',
    active: 'bg-emerald-500/20 text-emerald-400',
    paused: 'bg-amber-500/20 text-amber-400',
    completed: 'bg-primary/20 text-primary',
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Learning Paths</h1>
          <p className="text-sm text-on-surface-variant mt-1">Master concepts step by step</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-on-primary font-bold text-sm shadow-lg shadow-primary/20 hover:brightness-110 active:translate-y-0.5 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Path
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-surface rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-xl font-black mb-1">Create Learning Path</h2>
              <p className="text-xs text-on-surface-variant mb-4">Pick your materials and set your timeline</p>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Title *</label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Biology Exam Prep"
                    className="w-full mt-1 bg-surface-variant/50 border border-outline-variant/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Subject */}
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Subject</label>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. Biology"
                    className="w-full mt-1 bg-surface-variant/50 border border-outline-variant/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Start Date</label>
                    <input
                      type="datetime-local"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full mt-1 bg-surface-variant/50 border border-outline-variant/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Deadline *</label>
                    <input
                      type="datetime-local"
                      value={deadline}
                      onChange={e => setDeadline(e.target.value)}
                      className="w-full mt-1 bg-surface-variant/50 border border-outline-variant/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Resource Selection */}
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Study Materials * ({selectedResources.length} selected)
                  </label>
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5">
                    {!resources || resources.length === 0 ? (
                      <p className="text-xs text-on-surface-variant py-3 text-center">No resources in your library yet. Upload some first.</p>
                    ) : (
                      resources.map((res: any) => (
                        <button
                          key={res.id}
                          onClick={() => toggleResource(res.id)}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                            selectedResources.includes(res.id)
                              ? 'border-primary bg-primary/5'
                              : 'border-outline-variant/20 hover:border-outline-variant/40'
                          )}
                        >
                          <span className={cn(
                            'material-symbols-outlined text-[18px]',
                            selectedResources.includes(res.id) ? 'text-primary' : 'text-on-surface-variant/50'
                          )}>
                            {selectedResources.includes(res.id) ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{res.title}</p>
                            <p className="text-[10px] text-on-surface-variant">
                              {res.ai_concepts?.length || 0} concepts · {res.resource_type || 'note'}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowCreate(false); resetForm() }} className="flex-1 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-bold">Cancel</button>
                <button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !title.trim() || selectedResources.length === 0}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createMutation.isPending ? (
                    <><span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span> Creating…</>
                  ) : (
                    <><span className="material-symbols-outlined text-[16px]">school</span> Create Path</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paths Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : paths?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FlowMascot mood="wave" size={140} />
          <h2 className="text-xl font-black mt-6 mb-2">Hey there, learner!</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6 leading-relaxed">
            Create a learning path to get a personalized roadmap through your study materials.
            AI breaks down your notes into bite-sized concepts and guides you step by step.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-6 py-3 rounded-full bg-gradient-to-r from-primary to-amber-500 text-white font-bold text-sm shadow-lg shadow-primary/30 hover:scale-105 transition-transform"
          >
            <span className="material-symbols-outlined text-[16px] mr-1.5 align-middle">add</span>
            Create Your First Path
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paths?.map((path: any) => (
            <Link key={path.id} href={`/learn/${path.id}`}>
              <div className="group bg-surface border border-outline-variant/20 rounded-2xl p-5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <span className={cn('px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', STATUS_COLORS[path.status] || STATUS_COLORS.draft)}>
                    {path.status}
                  </span>
                  {path.due_reviews > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                      {path.due_reviews} due
                    </span>
                  )}
                </div>
                <h3 className="font-black text-lg mb-1 group-hover:text-primary transition-colors">{path.title}</h3>
                {path.subject && <p className="text-xs text-on-surface-variant mb-3">{path.subject}</p>}

                {/* Dates */}
                {(path.start_date || path.deadline) && (
                  <div className="flex items-center gap-2 text-[10px] text-on-surface-variant mb-3">
                    {path.start_date && <span>Start: {new Date(path.start_date).toLocaleDateString()}</span>}
                    {path.start_date && path.deadline && <span>→</span>}
                    {path.deadline && <span>Due: {new Date(path.deadline).toLocaleDateString()}</span>}
                  </div>
                )}

                {/* Mastery Bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-on-surface-variant">Mastery</span>
                    <span className="font-bold text-primary">{path.mastery_percent}%</span>
                  </div>
                  <div className="h-2 bg-surface-variant rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
                      style={{ width: `${path.mastery_percent}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 text-[10px] text-on-surface-variant">
                  <span>{path.concepts_completed}/{path.total_concepts} concepts</span>
                  <span>{path.total_xp} XP</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
