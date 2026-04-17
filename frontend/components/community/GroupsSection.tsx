'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi } from '@/lib/api'
import { 
  Users, Star, Plus, ShieldCheck, 
  MapPin, ArrowRight 
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

const GRADIENTS = [
  'from-sky-400 to-sky-600', 
  'from-violet-400 to-violet-600', 
  'from-emerald-400 to-emerald-600', 
  'from-orange-400 to-orange-600', 
  'from-pink-400 to-pink-600'
]

export default function GroupsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['public-groups'],
    queryFn: () => groupsApi.getGroups('all').then(r => r.data),
  })
  const qc = useQueryClient()
  const groups: any[] = data?.results || []

  const joinMutation = useMutation({
    mutationFn: (id: number) => groupsApi.joinGroup(id),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['public-groups'] })
      toast.success('Joined group! Welcome to the squad.') 
    },
  })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Groups Directory
            <Users className="w-5 h-5 text-primary" />
          </h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Find your study tribe</p>
        </div>
        <Link href="/groups" className="bg-primary hover:opacity-90 text-white text-[10px] font-black uppercase tracking-widest px-4 py-3 rounded-xl shadow-lg shadow-primary/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95">
          <Plus className="w-4 h-4" /> Create Agency
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => <div key={i} className="glass-card h-64 animate-pulse" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="glass-card p-16 text-center border-slate-200/60 dark:border-white/5">
          <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-slate-300 dark:text-slate-700" />
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">No Public Groups</h3>
          <p className="text-sm text-slate-500 font-medium max-w-sm mx-auto mb-8">Be the first to create a public study group and lead your peers to success.</p>
          <Link href="/groups" className="text-primary font-black uppercase tracking-widest text-[10px] bg-primary/10 px-8 py-4 rounded-xl hover:bg-primary/20 transition-all">Start Your Group</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((g: any, i: number) => (
            <motion.div 
              key={g.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -5 }}
              className="group glass-card flex flex-col p-6 hover:border-primary/50 transition-all duration-300 border-slate-200/60 dark:border-white/5 relative overflow-hidden"
            >
              {/* Background Glow */}
              <div className={cn('absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br opacity-[0.03] group-hover:opacity-[0.08] rounded-full blur-2xl transition-opacity', GRADIENTS[i % GRADIENTS.length])} />

              <div className="flex items-start justify-between mb-6">
                <div className={cn('w-14 h-14 bg-gradient-to-br rounded-[1.25rem] flex items-center justify-center text-white font-black text-2xl shadow-lg ring-4 ring-white dark:ring-slate-900', GRADIENTS[i % GRADIENTS.length])}>
                  {g.name[0].toUpperCase()}
                </div>
                {g.is_verified && (
                  <div className="bg-sky-50 dark:bg-sky-950/40 text-sky-500 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Verified</span>
                  </div>
                )}
              </div>

              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors leading-tight mb-2">{g.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium line-clamp-2 leading-relaxed mb-6">
                  {g.description || 'Global collaboration space for students focused on excellence and shared knowledge.'}
                </p>
              </div>

              <div className="flex items-center justify-between mt-auto pt-6 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {[1,2,3].map(j => (
                      <div key={j} className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 border-2 border-white dark:border-slate-950" />
                    ))}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{g.member_count} Members</span>
                </div>

                {g.is_member ? (
                  <Link href={`/groups/${g.id}`} className="group/btn flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-primary hover:text-primary/80 transition-all">
                    Hub Access <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                  </Link>
                ) : (
                  <button 
                    onClick={() => joinMutation.mutate(g.id)} 
                    className="bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-lg"
                  >
                    Join Squad
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
