'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi } from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const BG_COLORS = ['bg-primary', 'bg-tertiary', 'bg-secondary', 'bg-green-400', 'bg-pink-400', 'bg-sky-400']

export default function StudyGroupsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('All Groups')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [showJoin, setShowJoin] = useState(false)

  const { data: myGroupsData, isLoading: loadingMy } = useQuery({
    queryKey: ['groups', 'my'],
    queryFn: () => groupsApi.getGroups('my').then(r => r.data),
  })
  const { data: allGroupsData, isLoading: loadingAll } = useQuery({
    queryKey: ['groups', 'all'],
    queryFn: () => groupsApi.getGroups('all').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => groupsApi.createGroup(data),
    onSuccess: () => { toast.success('Group created!'); queryClient.invalidateQueries({ queryKey: ['groups'] }); setShowCreate(false); setNewName(''); setNewDesc(''); setNewSubject('') },
    onError: () => toast.error('Failed to create group.'),
  })

  const joinMutation = useMutation({
    mutationFn: (id: number) => groupsApi.joinGroup(id),
    onSuccess: () => { toast.success('Joined group!'); queryClient.invalidateQueries({ queryKey: ['groups'] }) },
    onError: () => toast.error('Failed to join group.'),
  })

  const myGroups = myGroupsData?.results || myGroupsData || []
  const allGroups = allGroupsData?.results || allGroupsData || []
  const displayGroups = activeFilter === 'My Groups' ? myGroups : allGroups

  const filtered = displayGroups.filter((g: any) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase()) ||
    (g.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (g.subject || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-stack-md mb-stack-lg">
        <div className="max-w-2xl">
          <h1 className="text-[32px] font-bold text-on-surface mb-2">Find Your Study Squad</h1>
          <p className="text-[16px] text-on-surface-variant">Join a group to stay motivated, share notes, and level up together.</p>
        </div>
        <div className="flex gap-base">
          <button onClick={() => setShowJoin(true)} className="flex items-center gap-base px-gutter py-stack-sm bg-secondary-container text-on-secondary-container rounded-full shadow-[0_4px_0_0_#12139b] font-bold text-[14px] btn-squishy">
            <span className="material-symbols-outlined text-[18px]">qr_code</span>
            Join with Code
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-base px-gutter py-stack-sm bg-primary-container text-on-primary-container rounded-full btn-3d font-bold text-[14px] hover:brightness-110 transition-all">
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Create Group
          </button>
        </div>
      </div>

      {/* Search + filter chips */}
      <div className="flex flex-col sm:flex-row gap-stack-sm mb-stack-lg">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            className="w-full bg-surface-container-high rounded-full pl-12 pr-stack-md py-3 text-[15px] text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary transition-all border border-outline-variant placeholder:text-on-surface-variant/60"
            placeholder="Search groups..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-base overflow-x-auto no-scrollbar pb-1">
          {['All Groups', 'My Groups'].map(f => (
            <button key={f} onClick={() => setActiveFilter(f)} className={cn('px-gutter py-2 rounded-full font-bold whitespace-nowrap text-[14px] transition-all', activeFilter === f ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Groups grid */}
      {(loadingMy || loadingAll) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gutter">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-surface-container-low rounded-[1.5rem] p-stack-md border border-outline-variant/10 animate-pulse">
              <div className="w-20 h-20 rounded-[1rem] bg-surface-container-high mb-stack-md" />
              <div className="h-5 bg-surface-container-high rounded w-3/4 mb-2" />
              <div className="h-4 bg-surface-container-high rounded w-full mb-1" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-outline-variant/30 rounded-[2rem] p-stack-lg text-center flex flex-col items-center gap-stack-md">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[32px]">rocket_launch</span>
          </div>
          <h3 className="text-[18px] font-bold text-on-surface">Nothing found</h3>
          <p className="text-on-surface-variant text-[14px]">Start your own study revolution!</p>
          <button onClick={() => setShowCreate(true)} className="bg-secondary text-on-secondary px-gutter py-2 rounded-full font-bold shadow-[0_4px_0_0_#12139b] btn-squishy text-[14px]">
            Start Group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gutter">
          {filtered.map((g: any, idx: number) => {
            const bgColor = BG_COLORS[idx % BG_COLORS.length]
            const initial = (g.name || 'G')[0].toUpperCase()
            const isMember = myGroups.some((m: any) => m.id === g.id)
            const onlineCount = Math.floor(Math.random() * 15) // simulated
            return (
              <div key={g.id} className="squishy-card bg-surface-container-low p-stack-md rounded-[1.5rem] shadow-[0_8px_0_0_rgba(0,0,0,0.3)] flex flex-col h-full relative border border-outline-variant/10">
                {onlineCount > 0 && (
                  <div className="absolute top-4 right-4">
                    <div className="flex items-center gap-1 bg-green-500/10 text-green-400 px-3 py-1 rounded-full text-[11px] border border-green-500/20">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      {onlineCount} online
                    </div>
                  </div>
                )}
                <div className={cn('w-20 h-20 rounded-[1rem] flex items-center justify-center text-[36px] font-bold mb-stack-md shadow-lg text-white', bgColor)}>
                  {initial}
                </div>
                <h3 className="text-[16px] font-bold text-on-surface mb-1">{g.name}</h3>
                <p className="text-on-surface-variant text-[13px] mb-stack-lg flex-grow line-clamp-2">{g.description || `A study group for ${g.subject || 'all subjects'}.`}</p>
                <div className="flex items-center justify-between mt-auto">
                  <div className="flex items-center gap-1 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[18px]">group</span>
                    <span className="text-[13px]">{g.member_count || 0} members</span>
                  </div>
                  {isMember ? (
                    <Link href={`/groups/${g.id}`} className="px-gutter py-2 bg-primary text-on-primary font-bold rounded-full shadow-[0_4px_0_0_#763300] btn-squishy text-[13px]">
                      Enter
                    </Link>
                  ) : (
                    <button onClick={() => joinMutation.mutate(g.id)} disabled={joinMutation.isPending} className="px-gutter py-2 bg-primary text-on-primary font-bold rounded-full shadow-[0_4px_0_0_#763300] btn-squishy text-[13px] disabled:opacity-50">
                      Join
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Create card */}
          <div className="squishy-card bg-surface-container p-stack-md rounded-[1.5rem] border-2 border-dashed border-primary/30 flex flex-col items-center justify-center text-center gap-base opacity-80 hover:opacity-100 transition-opacity cursor-pointer" onClick={() => setShowCreate(true)}>
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[32px]">rocket_launch</span>
            </div>
            <h3 className="text-[16px] font-bold text-on-surface">Nothing fits?</h3>
            <p className="text-on-surface-variant text-[13px]">Start your own revolution!</p>
            <button className="bg-secondary text-on-secondary px-gutter py-2 rounded-full font-bold shadow-[0_4px_0_0_#12139b] btn-squishy text-[13px]">Start Group</button>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-surface-container-low rounded-[2rem] p-stack-md w-full max-w-md space-y-stack-sm border border-outline-variant">
            <h3 className="text-[20px] font-bold text-on-surface">Create Study Group</h3>
            <input className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none focus:border-secondary transition-all" placeholder="Group name" value={newName} onChange={e => setNewName(e.target.value)} />
            <input className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none focus:border-secondary transition-all" placeholder="Subject (optional)" value={newSubject} onChange={e => setNewSubject(e.target.value)} />
            <textarea className="w-full h-24 bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none focus:border-secondary transition-all resize-none" placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            <div className="flex gap-base pt-2">
              <button onClick={() => { if (!newName.trim()) return toast.error('Name required'); createMutation.mutate({ name: newName, description: newDesc, subject: newSubject, is_public: true }) }} disabled={createMutation.isPending} className="flex-1 bg-primary text-on-primary font-bold py-3 rounded-[1rem] btn-3d hover:brightness-110 transition-all disabled:opacity-50">
                {createMutation.isPending ? 'Creating…' : 'Create Group'}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-stack-md bg-surface-container-high text-on-surface-variant font-bold rounded-[1rem] hover:bg-surface-container-highest transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Join modal */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-low rounded-[2rem] p-stack-md w-full max-w-sm space-y-stack-sm border border-outline-variant">
            <h3 className="text-[20px] font-bold text-on-surface">Join with Invite Code</h3>
            <input className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none focus:border-secondary transition-all text-center text-[18px] font-bold tracking-widest uppercase" placeholder="Enter code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} />
            <div className="flex gap-base">
              <button className="flex-1 bg-primary text-on-primary font-bold py-3 rounded-[1rem] btn-3d hover:brightness-110 transition-all" onClick={() => { toast.info('Feature coming soon!'); setShowJoin(false) }}>Join</button>
              <button onClick={() => setShowJoin(false)} className="px-stack-md bg-surface-container-high text-on-surface-variant font-bold rounded-[1rem]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
