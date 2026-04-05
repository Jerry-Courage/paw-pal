'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceApi, assignmentsApi, libraryApi } from '@/lib/api'
import { Plus, Users, BookOpen, Sparkles, X, Loader2, Link2, ArrowRight, FileText, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import Link from 'next/link'

const COLORS = [
  'from-sky-400 to-sky-600', 'from-violet-400 to-violet-600',
  'from-emerald-400 to-emerald-600', 'from-orange-400 to-orange-600',
  'from-pink-400 to-pink-600', 'from-amber-400 to-amber-600',
]

export default function WorkspacePage() {
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.getAll().then(r => r.data),
  })
  const workspaces: any[] = data?.results || []

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-violet-500" /> Workspaces
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Collaborate, write, and present — with FlowAI as your team member.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowJoin(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <Link2 className="w-4 h-4" /> Join
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> New Workspace
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="card h-52 animate-pulse" />)}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-violet-400 to-sky-500 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-violet-200 dark:shadow-violet-900">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h3 className="font-bold text-xl mb-2">Your first workspace</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto leading-relaxed">
            Create a workspace for any project or assignment. Invite teammates, write together, and let FlowAI help you build something great.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setShowJoin(true)} className="btn-secondary flex items-center gap-2">
              <Link2 className="w-4 h-4" /> Join with code
            </button>
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Workspace
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((ws: any, i: number) => (
            <Link key={ws.id} href={`/workspace/${ws.id}`}
              className="card overflow-hidden hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 group">
              <div className={cn('h-2 bg-gradient-to-r', COLORS[i % COLORS.length])} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={cn('w-10 h-10 bg-gradient-to-br rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0', COLORS[i % COLORS.length])}>
                    {ws.name[0].toUpperCase()}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Users className="w-3 h-3" /> {ws.member_count}
                  </div>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-1">{ws.name}</h3>
                {ws.subject && <p className="text-xs text-gray-400 mb-2">{ws.subject}</p>}
                {ws.document_preview ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 leading-relaxed">{ws.document_preview}</p>
                ) : (
                  <p className="text-xs text-gray-400 italic mb-3">No content yet</p>
                )}
                {ws.assignment_title && (
                  <div className="flex items-center gap-1.5 text-xs text-violet-500 bg-violet-50 dark:bg-violet-950/30 rounded-lg px-2.5 py-1 mb-3 w-fit">
                    <FileText className="w-3 h-3" /> {ws.assignment_title}
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-gray-50 dark:border-gray-800">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {format(new Date(ws.updated_at), 'MMM d')}
                  </span>
                  <span className="text-xs text-violet-500 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                    Open <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
      {showJoin && <JoinModal onClose={() => setShowJoin(false)} />}
    </div>
  )
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: '', subject: '', description: '', assignment: '', resources: [] as number[] })
  const qc = useQueryClient()
  const { data: assignmentsData } = useQuery({ queryKey: ['assignments'], queryFn: () => assignmentsApi.getAll().then(r => r.data) })
  const { data: resourcesData } = useQuery({ queryKey: ['resources'], queryFn: () => libraryApi.getResources().then(r => r.data) })
  const assignments: any[] = assignmentsData?.results || []
  const resources: any[] = resourcesData?.results || []

  const mutation = useMutation({
    mutationFn: () => workspaceApi.create({ ...form, assignment: form.assignment || null }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      onClose()
      toast.success('Workspace created!')
      window.location.href = `/workspace/${res.data.id}`
    },
  })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="font-bold text-lg">New Workspace</h2>
            <p className="text-xs text-gray-400 mt-0.5">FlowAI joins as your team's AI member</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <input placeholder="Workspace name *" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="input" />
          <input placeholder="Subject (e.g. Biology, Computer Science)" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} className="input" />
          <textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="input resize-none" rows={2} />
          {assignments.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Link to assignment (optional)</label>
              <select value={form.assignment} onChange={e => setForm(f => ({...f, assignment: e.target.value}))} className="input">
                <option value="">No assignment</option>
                {assignments.map((a: any) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6 flex-shrink-0 border-t border-gray-100 dark:border-gray-800 pt-4">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Create Workspace
          </button>
        </div>
      </div>
    </div>
  )
}

function JoinModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('')
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => workspaceApi.join(code),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      onClose()
      toast.success('Joined workspace!')
      window.location.href = `/workspace/${res.data.id}`
    },
    onError: () => toast.error('Invalid invite code.'),
  })
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">Join Workspace</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
        </div>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="Enter invite code (e.g. AB12CD34)"
          className="input text-center text-lg font-mono tracking-widest mb-4" maxLength={8} />
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={code.length < 6 || mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Join
          </button>
        </div>
      </div>
    </div>
  )
}
