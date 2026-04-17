'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { communityApi } from '@/lib/api'
import { 
  Plus, Calendar, Users, X, Clock, MapPin, 
  ChevronRight, Sparkles 
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

const EVENT_TYPES: Record<string, { label: string; color: string; icon: string }> = {
  workshop: { label: 'Workshop', color: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400', icon: '🎨' },
  exam_prep: { label: 'Exam Prep', color: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400', icon: '📝' },
  session: { label: 'Study Session', color: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400', icon: '📚' },
  challenge: { label: 'Challenge', color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400', icon: '⚡' },
  ama: { label: 'AMA', color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400', icon: '💬' },
}

export default function EventsSection() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['events'],
    queryFn: () => communityApi.getEvents().then(r => r.data),
  })
  const events: any[] = data?.results || []

  const registerMutation = useMutation({
    mutationFn: (id: number) => communityApi.registerEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      toast.success('Successfully registered for event!')
    },
  })

  const getCountdown = (date: string) => {
    const diff = new Date(date).getTime() - Date.now()
    if (diff < 0) return 'Ended'
    const days = Math.floor(diff / 86400000)
    const hrs = Math.floor((diff % 86400000) / 3600000)
    if (days > 0) return `${days}d ${hrs}h`
    const mins = Math.floor((diff % 3600000) / 60000)
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Upcoming Events
            <Sparkles className="w-4 h-4 text-amber-400" />
          </h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Don't miss out on the action</p>
        </div>
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCreate(true)} 
          className="bg-primary hover:opacity-90 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl shadow-lg shadow-primary/20 flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> Post Event
        </motion.button>
      </div>

      {events.length === 0 ? (
        <div className="glass-card p-16 text-center border-slate-200/60 dark:border-white/5">
          <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Calendar className="w-10 h-10 text-slate-300 dark:text-slate-700" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">The Calendar is Open</h3>
          <p className="text-sm text-slate-500 font-medium mb-6">Want to host a workshop or an AMA? Set it up now.</p>
          <button 
            onClick={() => setShowCreate(true)} 
            className="text-primary font-black uppercase tracking-widest text-[10px] bg-primary/10 px-6 py-3 rounded-xl hover:bg-primary/20 transition-colors"
          >
            Create Event
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map((e: any) => {
            const typeInfo = EVENT_TYPES[e.event_type] || EVENT_TYPES.session
            return (
              <motion.div 
                key={e.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="group glass-card overflow-hidden hover:border-primary/40 transition-all duration-300 border-slate-200/60 dark:border-white/5"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <span className={cn('text-[10px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider flex items-center gap-1.5', typeInfo.color)}>
                      <span>{typeInfo.icon}</span>
                      {typeInfo.label}
                    </span>
                    <div className="text-right">
                      <div className="text-[11px] font-black text-primary uppercase tracking-tighter">{getCountdown(e.scheduled_at)}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Countdown</div>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-primary transition-colors">{e.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-4 font-medium leading-relaxed">
                    {e.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold text-slate-400 mb-6 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl">
                    <div className="flex items-center gap-1.5 ">
                      <Calendar className="w-3.5 h-3.5 text-primary" />
                      {new Date(e.scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      {new Date(e.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      {e.registration_count}/{e.max_participants}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-500 text-[10px] font-black">
                        {getInitials(e.host_name)}
                      </div>
                      <div className="text-[10px]">
                        <span className="block text-slate-400 font-bold uppercase tracking-tighter">Host</span>
                        <span className="block text-slate-900 dark:text-white font-black truncate">{e.host_name}</span>
                      </div>
                    </div>

                    <button 
                      onClick={() => registerMutation.mutate(e.id)}
                      className={cn(
                        'text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl transition-all active:scale-95 shadow-lg',
                        e.is_registered 
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' 
                          : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90'
                      )}
                    >
                      {e.is_registered ? '✓ Registered' : 'Reserve Spot'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CreateEventModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', event_type: 'session', scheduled_at: '', max_participants: 50 })
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => communityApi.createEvent(form),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['events'] })
      onClose()
      toast.success('Event scheduled in the Nexus!') 
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
            className="absolute top-6 right-6 p-2 rounded-2xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all font-bold"
          >
            <X className="w-5 h-5" />
          </button>

          <header className="mb-8">
             <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-4">
              <Calendar className="w-6 h-6 text-amber-500" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">Host an Event</h2>
            <p className="text-sm text-slate-500 font-medium tracking-tight">Schedule workshops, AMAs, or group sessions.</p>
          </header>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Event Title</label>
              <input 
                placeholder="Name your session" 
                value={form.title} 
                onChange={e => setForm(f => ({...f, title: e.target.value}))} 
                className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border-transparent focus:bg-white dark:focus:bg-slate-950 border focus:border-primary rounded-[1.25rem] text-sm font-bold transition-all outline-none" 
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Details</label>
              <textarea 
                placeholder="What should participants expect?" 
                value={form.description} 
                onChange={e => setForm(f => ({...f, description: e.target.value}))} 
                className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border-transparent focus:bg-white dark:focus:bg-slate-950 border focus:border-primary rounded-[1.25rem] text-sm font-bold transition-all resize-none outline-none" 
                rows={2} 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Category</label>
                <select 
                  value={form.event_type} 
                  onChange={e => setForm(f => ({...f, event_type: e.target.value}))} 
                  className="w-full px-4 py-3.5 bg-slate-100 dark:bg-slate-900 border-transparent focus:bg-white dark:focus:bg-slate-950 border focus:border-primary rounded-[1.25rem] text-xs font-bold transition-all outline-none"
                >
                  <option value="session">Study Session</option>
                  <option value="workshop">Workshop</option>
                  <option value="exam_prep">Exam Prep</option>
                  <option value="challenge">Challenge</option>
                  <option value="ama">AMA</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Capacity</label>
                <input 
                  type="number" 
                  value={form.max_participants} 
                  onChange={e => setForm(f => ({...f, max_participants: parseInt(e.target.value)}))} 
                  className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border-transparent focus:bg-white dark:focus:bg-slate-950 border focus:border-primary rounded-[1.25rem] text-sm font-bold transition-all outline-none" 
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Date & Time</label>
              <input 
                type="datetime-local" 
                value={form.scheduled_at} 
                onChange={e => setForm(f => ({...f, scheduled_at: e.target.value}))} 
                className="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-900 border-transparent focus:bg-white dark:focus:bg-slate-950 border focus:border-primary rounded-[1.25rem] text-sm font-bold transition-all outline-none" 
              />
            </div>
          </div>

          <div className="flex gap-4 mt-10">
            <button onClick={onClose} className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 bg-slate-100 dark:bg-slate-900 rounded-2xl transition-all">Cancel</button>
            <button 
              onClick={() => mutation.mutate()} 
              disabled={!form.title || !form.scheduled_at || mutation.isPending} 
              className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-white bg-primary hover:opacity-90 rounded-2xl shadow-xl shadow-primary/20 transition-all disabled:opacity-50"
            >
              {mutation.isPending ? 'Publishing...' : 'Schedule'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
