'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { learningApi, libraryApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'

export default function LearnPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [deadline, setDeadline] = useState('')
  const [selectedResources, setSelectedResources] = useState<number[]>([])

  const { data: paths, isLoading } = useQuery({
    queryKey: ['learning-paths'],
    queryFn: () => learningApi.getPaths().then(r => r.data),
  })

  const { data: resources } = useQuery({
    queryKey: ['library'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => learningApi.createPath(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['learning-paths'] })
      setShowCreate(false)
      setTitle('')
      setSubject('')
      setDeadline('')
      setSelectedResources([])
      toast.success('Learning path created! Generate concepts to get started.')
      window.location.href = `/learn/${res.data.id}`
    },
    onError: () => toast.error('Failed to create path'),
  })

  const handleCreate = () => {
    if (!title.trim()) return toast.error('Enter a title')
    createMutation.mutate({
      title: title.trim(),
      subject: subject.trim(),
      deadline: deadline || null,
    })
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
          <div className="bg-surface rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-black mb-4">Create Learning Path</h2>
            <div className="space-y-3">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Path title (e.g. Biology Exam Prep)"
                className="w-full bg-surface-variant/50 border border-outline-variant/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject (optional)"
                className="w-full bg-surface-variant/50 border border-outline-variant/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="datetime-local"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                className="w-full bg-surface-variant/50 border border-outline-variant/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-bold">Cancel</button>
              <button onClick={handleCreate} disabled={createMutation.isPending} className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-50">
                {createMutation.isPending ? 'Creating…' : 'Create Path'}
              </button>
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
          <span className="material-symbols-outlined text-6xl text-on-surface-variant/30 mb-4">school</span>
          <h2 className="text-xl font-bold mb-2">No learning paths yet</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Create a learning path to get a Duolingo-style roadmap through your study materials.
            AI breaks down your notes into concepts and guides you step by step.
          </p>
          <button onClick={() => setShowCreate(true)} className="px-6 py-3 rounded-full bg-primary text-on-primary font-bold text-sm">
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
