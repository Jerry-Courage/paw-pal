'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi } from '@/lib/api'
import { Plus, Users, Sparkles, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function GroupsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.getGroups('my').then((r) => r.data),
  })

  const joinMutation = useMutation({
    mutationFn: (id: number) => groupsApi.joinGroup(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); toast.success('Joined group!') },
  })

  const groups = data?.results || []

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Study Groups</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="card p-16 text-center">
          <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No groups yet</p>
          <p className="text-gray-400 text-sm mb-4">Create or join a study group to collaborate with peers</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">Create Your First Group</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {groups.map((g: any) => (
            <Link key={g.id} href={`/groups/${g.id}`} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-gradient-to-br from-sky-400 to-sky-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                  {g.name[0]}
                </div>
                {g.is_verified && (
                  <span className="text-xs bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Verified
                  </span>
                )}
              </div>
              <h3 className="font-semibold mb-1">{g.name}</h3>
              <p className="text-sm text-gray-500 line-clamp-2 mb-3">{g.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {g.member_count} members
                </span>
                <span className="text-xs text-sky-500 flex items-center gap-1">
                  Enter <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: '', description: '', subject: '', is_public: true })
  const qc = useQueryClient()
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: () => groupsApi.createGroup(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); onClose(); toast.success('Group created!') },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <h2 className="font-bold text-lg mb-4">Create Study Group</h2>
        <div className="space-y-3">
          <input placeholder="Group name" value={form.name} onChange={set('name')} className="input" required />
          <textarea placeholder="Description" value={form.description} onChange={set('description')} className="input resize-none" rows={3} />
          <input placeholder="Subject (e.g. Computer Science)" value={form.subject} onChange={set('subject')} className="input" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_public} onChange={(e) => setForm((f) => ({ ...f, is_public: e.target.checked }))} />
            Public group (anyone can join)
          </label>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name} className="btn-primary flex-1">
            {mutation.isPending ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}
