'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceApi } from '@/lib/api'
import { Plus, Users, BookOpen, Sparkles, X, Loader2, Link2, ArrowRight, Clock, MessageSquare, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

const COLORS = [
  'from-violet-500 to-fuchsia-600',
  'from-cyan-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-amber-400 to-orange-500',
  'from-rose-500 to-pink-600',
]

export default function WorkspacePortal() {
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const qc = useQueryClient()

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.getAll().then(r => r.data),
  })

  const workspaceList = Array.isArray(workspaces) ? workspaces : workspaces?.results || []

  return (
    <div className="max-w-6xl mx-auto space-y-8 sm:space-y-10 py-6 sm:py-8">
      {/* --- Adaptive Header --- */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 px-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-600/20">
              <LayoutGrid className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase italic">Collab Space</h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 font-medium max-w-xs sm:max-w-none">Collaborative group study with <span className="text-violet-400">FlowAI</span> as your third member.</p>
        </div>
        
        <div className="flex gap-2 sm:gap-3">
          <button 
            onClick={() => setShowJoin(true)} 
            className="flex-1 sm:flex-none px-4 sm:px-5 py-2.5 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all text-xs sm:text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <Link2 className="w-4 h-4" /> Join
          </button>
          <button 
            onClick={() => setShowCreate(true)} 
            className="flex-1 sm:flex-none px-4 sm:px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-lg shadow-violet-600/20 transition-all text-xs sm:text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95"
          >
            <Plus className="w-4 h-4" /> Initialize
          </button>
        </div>
      </div>

      {/* --- Content Area --- */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
          {[1,2,3].map(i => (
            <div key={i} className="h-48 bg-zinc-900/50 rounded-3xl border border-white/5 animate-pulse" />
          ))}
        </div>
      ) : workspaceList.length === 0 ? (
        <div className="px-4">
          <div className="relative group p-10 sm:p-16 bg-zinc-900/30 border border-dashed border-white/10 rounded-[2rem] sm:rounded-[3rem] text-center overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="relative z-10">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-2xl shadow-violet-600/30 ring-4 ring-white/5">
                <MessageSquare className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              </div>
              <h3 className="font-black text-xl sm:text-2xl mb-3 text-white italic tracking-tight uppercase">The studio is quiet</h3>
              <p className="text-xs sm:text-sm text-zinc-500 mb-6 sm:mb-8 max-w-sm mx-auto leading-relaxed font-medium">
                Create a space for your study group. Sync your library, mention <span className="text-violet-400 font-bold italic tracking-tighter">Flow</span>, and master anything together.
              </p>
              <div className="flex gap-4 justify-center">
                <button 
                  onClick={() => setShowCreate(true)} 
                  className="px-8 py-3 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-xs hover:bg-zinc-200 transition-all active:scale-95 shadow-xl"
                >
                  Create Your First Studio
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-4 pb-12">
          {workspaceList.map((ws: any, i: number) => (
            <Link key={ws.id} href={`/workspace/${ws.id}`} className="group">
              <motion.div 
                whileHover={{ y: -5 }}
                className="relative h-full bg-[#0d0d0d] border border-white/5 rounded-3xl p-6 overflow-hidden transition-all hover:border-violet-500/30 hover:shadow-2xl hover:shadow-violet-600/10"
              >
                <div className={cn('absolute top-0 right-0 w-32 h-32 bg-gradient-to-br blur-[80px] opacity-10 group-hover:opacity-30 transition-opacity', COLORS[i % COLORS.length])} />
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-6">
                    <div className={cn('w-12 h-12 bg-gradient-to-br rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg ring-1 ring-white/10', COLORS[i % COLORS.length])}>
                      {ws.name[0].toUpperCase()}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                      <Users className="w-3 h-3 text-zinc-500" />
                      <span className="text-[10px] font-black text-zinc-400">{ws.member_count}</span>
                    </div>
                  </div>

                  <div className="flex-1">
                    <h3 className="text-lg font-black text-white mb-1 group-hover:text-violet-400 transition-colors uppercase italic tracking-tight truncate">{ws.name}</h3>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-4 truncate">{ws.subject || 'Neural Link'}</p>
                    
                    {ws.description && (
                      <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed mb-4">{ws.description}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">
                    <div className="flex items-center gap-2 text-[10px] text-zinc-700 font-bold uppercase">
                      <Clock className="w-3 h-3" />
                      {format(new Date(ws.updated_at), 'MMM d')}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-violet-500 group-hover:gap-3 transition-all">
                      ENTER <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      )}

      {/* --- Modals --- */}
      <AnimatePresence>
        {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
        {showJoin && <JoinModal onClose={() => setShowJoin(false)} />}
      </AnimatePresence>
    </div>
  )
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: '', subject: '', description: '' })
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => workspaceApi.create(form),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      onClose()
      toast.success('Space Initialized!')
      window.location.href = `/workspace/${res.data.id}`
    },
  })

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-6 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-[#0d0d0d] border border-white/5 rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-lg shadow-[0_0_100px_rgba(139,92,246,0.1)] p-6 sm:p-10 overflow-hidden relative my-auto"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gradient-to-r from-transparent via-violet-600 to-transparent" />
        
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="font-black text-2xl text-white uppercase italic tracking-tighter">Initialize Collab Space</h2>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Configure your workspace</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-zinc-500 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Studio Name</label>
            <input 
              placeholder="e.g. Molecular Bio Hub" 
              value={form.name} 
              onChange={e => setForm(f => ({...f, name: e.target.value}))} 
              className="w-full bg-[#050505] border border-white/5 rounded-2xl px-5 py-4 text-xs sm:text-sm focus:outline-none focus:border-violet-500/50 transition-all placeholder:text-zinc-800" 
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Subject Area</label>
            <input 
              placeholder="e.g. Life Sciences" 
              value={form.subject} 
              onChange={e => setForm(f => ({...f, subject: e.target.value}))} 
              className="w-full bg-[#050505] border border-white/5 rounded-2xl px-5 py-4 text-xs sm:text-sm focus:outline-none focus:border-violet-500/50 transition-all placeholder:text-zinc-800" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Objective (Optional)</label>
            <textarea 
              placeholder="What's the mission?" 
              value={form.description} 
              onChange={e => setForm(f => ({...f, description: e.target.value}))} 
              className="w-full bg-[#050505] border border-white/5 rounded-2xl px-5 py-4 text-xs sm:text-sm focus:outline-none focus:border-violet-500/50 transition-all placeholder:text-zinc-800 resize-none" 
              rows={3} 
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-10">
          <button onClick={onClose} className="order-2 sm:order-1 flex-1 py-4 bg-zinc-900 text-zinc-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs rounded-2xl hover:bg-zinc-800 transition-all">Cancel</button>
          <button 
            onClick={() => mutation.mutate()} 
            disabled={!form.name || mutation.isPending}
            className="order-1 sm:order-2 flex-1 py-4 bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-widest text-[10px] sm:text-xs rounded-2xl transition-all shadow-lg shadow-violet-600/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Initialize
          </button>
        </div>
      </motion.div>
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
      toast.success('Access Granted!')
      window.location.href = `/workspace/${res.data.id}`
    },
    onError: () => toast.error('Neural key invalid.'),
  })

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-[#0d0d0d] border border-white/5 rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-sm shadow-2xl p-6 sm:p-10 relative"
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-black text-xl text-white uppercase italic tracking-tighter">Enter Studio</h2>
          <button onClick={onClose} className="p-1.5 rounded-full text-zinc-500 hover:bg-white/5"><X className="w-5 h-5" /></button>
        </div>
        
        <input 
          value={code} 
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="ENTER KEY"
          className="w-full bg-[#050505] border border-white/5 rounded-2xl py-6 text-center text-xl sm:text-2xl font-black tracking-[0.3em] text-violet-400 focus:outline-none focus:border-violet-500/50 mb-8 uppercase placeholder:text-zinc-900"
          maxLength={8} 
        />

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <button onClick={onClose} className="order-2 sm:order-1 flex-1 py-4 bg-zinc-900 text-zinc-400 font-bold uppercase tracking-widest text-[10px] rounded-2xl">Abort</button>
          <button 
            onClick={() => mutation.mutate()} 
            disabled={code.length < 6 || mutation.isPending}
            className="order-1 sm:order-2 flex-1 py-4 bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg shadow-violet-600/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Connect
          </button>
        </div>
      </motion.div>
    </div>
  )
}
