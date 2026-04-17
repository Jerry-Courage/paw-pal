'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { communityApi, libraryApi } from '@/lib/api'
import { 
  Plus, Users, BookOpen, X, Loader2, Play, 
  Crown, Radio, MessageSquare 
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

export default function StudyRooms() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['study-rooms'],
    queryFn: () => communityApi.getRooms().then(r => r.data),
    refetchInterval: 15000,
  })
  const rooms: any[] = data?.results || []

  const joinMutation = useMutation({
    mutationFn: (id: number) => communityApi.joinRoom(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study-rooms'] })
      toast.success('Joined study session!')
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Live Hubs
            <div className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
          </h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time collaboration</p>
        </div>
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCreate(true)} 
          className="bg-primary hover:opacity-90 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl shadow-lg shadow-primary/20 flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> Start Hub
        </motion.button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="glass-card p-6 animate-pulse h-48 border-slate-200/60 dark:border-white/5" />)}
        </div>
      ) : rooms.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-12 text-center border-dashed border-2 border-slate-200 dark:border-slate-800"
        >
          <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Radio className="w-10 h-10 text-slate-300 dark:text-slate-700" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No Active Hubs</h3>
          <p className="text-sm text-slate-500 max-w-xs mx-auto mb-6 font-medium">Be the pioneer! Create a study room and invite others to sync up.</p>
          <button 
            onClick={() => setShowCreate(true)} 
            className="text-primary font-black uppercase tracking-widest text-[10px] bg-primary/10 px-6 py-3 rounded-xl hover:bg-primary/20 transition-colors"
          >
            Launch First Room
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {rooms.map((room: any) => (
              <motion.div 
                key={room.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group glass-card p-5 hover:border-primary/50 transition-all duration-300 border-slate-200/60 dark:border-white/5 relative overflow-hidden"
              >
                {/* Background Accent */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />

                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">Live Now</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg">
                      <Users className="w-3 h-3" /> 
                      {room.participant_count}/{room.max_participants}
                    </div>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white mb-2 line-clamp-1 group-hover:text-primary transition-colors">
                    {room.title}
                  </h3>
                  
                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <MessageSquare className="w-3.5 h-3.5 opacity-50" />
                      {room.subject || 'General Focus'}
                    </div>
                    {room.resource_title && (
                      <div className="flex items-center gap-2 text-xs font-bold text-primary">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span className="truncate">{room.resource_title}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2">
                       <div className="w-7 h-7 bg-gradient-to-br from-primary/20 to-primary rounded-lg flex items-center justify-center text-white text-[10px] font-black ring-2 ring-white dark:ring-slate-900">
                        {getInitials(room.host?.username || 'H')}
                      </div>
                      <div className="text-[10px]">
                        <span className="block text-slate-400 font-bold uppercase tracking-tighter">Hosted by</span>
                        <span className="block text-slate-900 dark:text-white font-black truncate max-w-[80px]">{room.host?.username}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => joinMutation.mutate(room.id)}
                      disabled={joinMutation.isPending}
                      className={cn(
                        'text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50 overflow-hidden relative',
                        room.is_joined 
                          ? 'bg-rose-50 text-rose-500 dark:bg-rose-900/20' 
                          : 'bg-primary text-white shadow-lg shadow-primary/20 hover:shadow-primary/40'
                      )}
                    >
                      {room.is_joined ? 'Leave' : room.participant_count >= room.max_participants ? 'Full' : 'Join'}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ title: '', subject: '', resource: '', max_participants: 20 })
  const qc = useQueryClient()
  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })
  const resources: any[] = resourcesData?.results || []

  const mutation = useMutation({
    mutationFn: () => communityApi.createRoom({ ...form, resource: form.resource || null }),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['study-rooms'] })
      onClose()
      toast.success('Your Hub is now live!') 
    },
  })

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-slate-950 rounded-[2.5rem] w-full max-w-md shadow-2xl border border-white/20 overflow-hidden"
      >
        <div className="relative p-8">
          <button 
            onClick={onClose} 
            className="absolute top-6 right-6 p-2 rounded-2xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          <header className="mb-8">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">Start a Study Hub</h2>
            <p className="text-sm text-slate-500 font-medium">Gather your squad and hit the books.</p>
          </header>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Hub Title</label>
              <input 
                placeholder="What are we studying?" 
                value={form.title} 
                onChange={e => setForm(f => ({...f, title: e.target.value}))} 
                className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border-transparent focus:bg-white dark:focus:bg-slate-950 border focus:border-primary rounded-[1.25rem] text-sm font-bold transition-all" 
              />
            </div>

            <div className="space-y-1.5">
               <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Topic / Subject</label>
              <input 
                placeholder="e.g. Bio 101, Python Basics" 
                value={form.subject} 
                onChange={e => setForm(f => ({...f, subject: e.target.value}))} 
                className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border-transparent focus:bg-white dark:focus:bg-slate-950 border focus:border-primary rounded-[1.25rem] text-sm font-bold transition-all" 
              />
            </div>

            <div className="space-y-1.5">
               <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Library Context</label>
              <select 
                value={form.resource} 
                onChange={e => setForm(f => ({...f, resource: e.target.value}))} 
                className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border-transparent focus:bg-white dark:focus:bg-slate-950 border focus:border-primary rounded-[1.25rem] text-sm font-bold transition-all outline-none"
              >
                <option value="">Link a Resource (Optional)</option>
                {resources.map((r: any) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between mb-3 px-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Max Seat Count</label>
                <span className="text-sm font-bold text-primary">{form.max_participants}</span>
              </div>
              <input 
                type="range" min={2} max={50} value={form.max_participants}
                onChange={e => setForm(f => ({...f, max_participants: parseInt(e.target.value)}))}
                className="w-full h-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg appearance-none cursor-pointer accent-primary" 
              />
            </div>
          </div>

          <div className="flex gap-4 mt-10">
            <button onClick={onClose} className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 bg-slate-100 dark:bg-slate-900 dark:text-slate-400 rounded-2xl transition-all">Cancel</button>
            <button 
              onClick={() => mutation.mutate()} 
              disabled={!form.title || mutation.isPending} 
              className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-white bg-primary hover:opacity-90 rounded-2xl shadow-xl shadow-primary/20 transition-all disabled:opacity-50"
            >
              {mutation.isPending ? 'Launching...' : 'Go Live'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
