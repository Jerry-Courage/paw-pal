'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceApi } from '@/lib/api'
import Link from 'next/link'
import { cn, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'

const WS_BG = ['bg-secondary-container', 'bg-tertiary-container', 'bg-primary-container/50', 'bg-surface-container-high']
const WS_ICONS = ['public', 'calculate', 'science', 'history_edu', 'language', 'code']

export default function WorkspacesPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.getAll().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (d: any) => workspaceApi.create(d),
    onSuccess: () => { toast.success('Workspace created!'); queryClient.invalidateQueries({ queryKey: ['workspaces'] }); setShowCreate(false); setNewName('') },
    onError: () => toast.error('Failed to create workspace.'),
  })

  const joinMutation = useMutation({
    mutationFn: (code: string) => workspaceApi.join(code),
    onSuccess: (res: any) => {
      toast.success(`Joined "${res.data?.name || 'workspace'}"!`)
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setShowJoin(false)
      setJoinCode('')
    },
    onError: () => toast.error('Invalid code or workspace not found.'),
  })

  const workspaces = Array.isArray(data) ? data : data?.results || []

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-stack-md mb-stack-lg">
        <div>
          <h1 className="text-[32px] font-bold text-on-surface mb-2">My Workspaces</h1>
          <p className="text-[16px] text-on-surface-variant">Jump into your collaborative studio environments.</p>
        </div>
        <div className="flex items-center gap-base">
          <button onClick={() => setShowJoin(true)} className="flex items-center gap-base bg-surface-container-high text-on-surface px-gutter py-stack-sm rounded-full font-bold hover:brightness-110 transition-all border border-outline-variant">
            <span className="material-symbols-outlined text-[18px]">vpn_key</span>
            Join with Code
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-base bg-primary-container text-on-primary-container px-gutter py-stack-sm rounded-full btn-3d font-bold hover:brightness-110 transition-all">
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Create Workspace
          </button>
        </div>
      </div>

      {/* Workspace grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface-container rounded-[1.5rem] overflow-hidden animate-pulse">
              <div className="h-32 bg-surface-container-high" />
              <div className="p-gutter">
                <div className="h-5 bg-surface-container-high rounded w-3/4 mb-2" />
                <div className="h-4 bg-surface-container-high rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {workspaces.map((ws: any, idx: number) => {
            const bgColor = WS_BG[idx % WS_BG.length]
            const icon = WS_ICONS[idx % WS_ICONS.length]
            return (
              <div key={ws.id} className="squishy-card bg-surface-container rounded-[1.5rem] overflow-hidden flex flex-col shadow-sm border border-outline-variant/20 hover:border-outline-variant transition-all">
                <div className={cn('h-32 relative flex items-center justify-center', bgColor)}>
                  <span className="material-symbols-outlined text-[64px] opacity-40 text-on-surface">{icon}</span>
                  {(ws.unread_count || 0) > 0 && (
                    <div className="absolute top-3 right-3 bg-primary text-on-primary text-[11px] font-black px-2 py-0.5 rounded-full">
                      {ws.unread_count} new
                    </div>
                  )}
                </div>
                <div className="p-gutter flex flex-col flex-grow">
                  <h3 className="text-[16px] font-bold text-on-surface mb-1">{ws.name}</h3>
                  <p className="text-[13px] text-on-surface-variant mb-stack-md">{ws.updated_at ? `Last active: ${timeAgo(ws.updated_at)}` : 'No activity yet'}</p>
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex -space-x-3">
                      {(ws.members || []).slice(0, 3).map((m: any, i: number) => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-surface-container bg-surface-container-highest flex items-center justify-center text-[11px] font-bold text-on-surface-variant">
                          {(m.username || m.email || 'U')[0].toUpperCase()}
                        </div>
                      ))}
                      {(ws.members?.length || 0) > 3 && (
                        <div className="w-8 h-8 rounded-full border-2 border-surface-container bg-surface-container-highest flex items-center justify-center text-[10px] font-bold text-on-surface-variant">
                          +{(ws.members?.length || 0) - 3}
                        </div>
                      )}
                    </div>
                    <Link href={`/workspace/${ws.id}`} className="bg-surface-container-highest text-primary font-bold px-stack-md py-2 rounded-full border-2 border-primary/20 hover:border-primary/50 transition-all text-[13px] squishy-card">
                      Enter Studio
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Empty state / create card */}
          <div
            className="squishy-card bg-surface-container-low border-2 border-dashed border-outline-variant rounded-[1.5rem] p-gutter flex flex-col items-center justify-center text-center gap-stack-sm min-h-[250px] cursor-pointer hover:border-primary/30 transition-all"
            onClick={() => setShowCreate(true)}
          >
            <div className="w-16 h-16 bg-surface-container-highest rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-outline text-[32px]">rocket_launch</span>
            </div>
            <h3 className="text-[16px] font-bold text-on-surface">Start something new!</h3>
            <p className="text-[13px] text-on-surface-variant">Team up to tackle big projects together.</p>
            <button className="text-primary font-bold hover:underline mt-2 text-[14px]">Browse templates</button>
          </div>
        </div>
      )}


      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-surface-container-low rounded-[2rem] p-stack-md w-full max-w-md space-y-stack-sm border border-outline-variant">
            <h3 className="text-[20px] font-bold text-on-surface">Create Workspace</h3>
            <input className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none focus:border-secondary transition-all" placeholder="Workspace name" value={newName} onChange={e => setNewName(e.target.value)} />
            <input className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none focus:border-secondary transition-all" placeholder="Subject (optional)" value={newSubject} onChange={e => setNewSubject(e.target.value)} />
            <div className="flex gap-base pt-2">
              <button onClick={() => { if (!newName.trim()) return toast.error('Name required'); createMutation.mutate({ name: newName, subject: newSubject }) }} disabled={createMutation.isPending} className="flex-1 bg-primary text-on-primary font-bold py-3 rounded-[1rem] btn-3d hover:brightness-110 transition-all disabled:opacity-50">
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-stack-md bg-surface-container-high text-on-surface-variant font-bold rounded-[1rem]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Join modal */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-surface-container-low rounded-[2rem] p-stack-md w-full max-w-md space-y-stack-sm border border-outline-variant">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px] text-primary">vpn_key</span>
              </div>
              <div>
                <h3 className="text-[20px] font-bold text-on-surface">Join Workspace</h3>
                <p className="text-[13px] text-on-surface-variant">Enter the invite code from your friend</p>
              </div>
            </div>
            <input
              className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface font-mono text-[18px] tracking-[0.2em] text-center uppercase focus:outline-none focus:border-primary transition-all"
              placeholder="e.g. A3F8B2C1"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8))}
              onKeyDown={e => { if (e.key === 'Enter' && joinCode.trim().length >= 6) joinMutation.mutate(joinCode.trim()) }}
              autoFocus
              maxLength={8}
            />
            <div className="flex gap-base pt-2">
              <button
                onClick={() => { if (!joinCode.trim()) return toast.error('Enter a code'); joinMutation.mutate(joinCode.trim()) }}
                disabled={joinMutation.isPending || joinCode.trim().length < 6}
                className="flex-1 bg-primary text-on-primary font-bold py-3 rounded-[1rem] btn-3d hover:brightness-110 transition-all disabled:opacity-50"
              >
                {joinMutation.isPending ? 'Joining…' : 'Join'}
              </button>
              <button onClick={() => { setShowJoin(false); setJoinCode('') }} className="px-stack-md bg-surface-container-high text-on-surface-variant font-bold rounded-[1rem]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
