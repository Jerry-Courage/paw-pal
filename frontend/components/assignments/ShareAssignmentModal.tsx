import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceApi, assignmentsApi } from '@/lib/api'
import { 
  X, Search, Share2, Users, 
  ChevronRight, Loader2, Sparkles,
  CheckCircle2, AlertCircle
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ShareAssignmentModalProps {
  assignmentId: number
  assignmentTitle: string
  isOpen: boolean
  onClose: () => void
}

export default function ShareAssignmentModal({ 
  assignmentId, 
  assignmentTitle, 
  isOpen, 
  onClose 
}: ShareAssignmentModalProps) {
  const [search, setSearch] = useState('')
  const qc = useQueryClient()

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.getAll().then(r => r.data),
    enabled: isOpen
  })

  const shareMutation = useMutation({
    mutationFn: (workspaceId: number) => assignmentsApi.share(assignmentId, workspaceId),
    onSuccess: (res, workspaceId) => {
      toast.success(`Intelligence transmitted successfully!`)
      qc.invalidateQueries({ queryKey: ['workspace-messages', workspaceId] })
      onClose()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Transmission failed.')
    }
  })

  if (!isOpen) return null

  const allWorkspaces = workspaces?.results || []
  const filteredWorkspaces = allWorkspaces.filter((ws: any) => 
    ws.name.toLowerCase().includes(search.toLowerCase()) ||
    ws.subject?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-xl" 
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-lg bg-[#0a0a0b]/80 border border-white/10 rounded-3xl sm:rounded-[2.5rem] overflow-hidden shadow-[0_0_100px_rgba(139,92,246,0.1)] backdrop-blur-2xl"
      >
        {/* Header HUD */}
        <div className="px-6 sm:px-8 pt-8 pb-6 border-b border-white/5 relative bg-white/[0.02]">
           <div className="absolute top-0 right-0 p-8">
              <button 
                onClick={onClose}
                className="p-2 text-white/20 hover:text-white hover:bg-white/5 rounded-2xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
           </div>
           
           <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-violet-600/30 blur-xl rounded-full animate-pulse" />
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-2xl relative z-10 border border-white/20">
                  <Share2 className="w-6 h-6 text-white" />
                </div>
              </div>
              <div>
                <h2 className="font-black text-white text-lg tracking-tight">Transmit Intelligence</h2>
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
                   <span className="text-[10px] text-white/40 font-black uppercase tracking-widest">Targeting: {assignmentTitle}</span>
                </div>
              </div>
           </div>

           <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-violet-400 transition-colors" />
              <input 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Query target Collab Space..."
                className="w-full pl-12 pr-6 py-4 bg-white/5 rounded-2.5xl border border-white/5 focus:border-violet-500/40 text-[13px] text-white outline-none transition-all selection:bg-violet-500/30 shadow-2xl"
              />
           </div>
        </div>

        {/* Workspace Stream */}
        <div className="px-4 py-6 max-h-[400px] overflow-y-auto custom-scrollbar space-y-2">
           {isLoading ? (
             <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Querying Active Matrix...</span>
             </div>
           ) : filteredWorkspaces?.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-16 text-center px-10">
                <div className="p-4 bg-white/5 rounded-[2rem] mb-4">
                  <AlertCircle className="w-8 h-8 text-white/10" />
                </div>
                <p className="text-white/40 text-xs font-bold leading-relaxed"> No active collaboration spaces found matching your search query. </p>
             </div>
           ) : (
             filteredWorkspaces?.map((ws: any) => (
                <button 
                  key={ws.id}
                  onClick={() => shareMutation.mutate(ws.id)}
                  disabled={shareMutation.isPending}
                  className="w-full group relative flex items-center gap-4 p-4 rounded-3xl hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition-all outline-none disabled:opacity-50"
                >
                   <div className={cn(
                     "w-12 h-12 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-500 border border-white/10 group-hover:scale-105",
                     "bg-white/[0.03] text-white/40 group-hover:bg-violet-600 group-hover:text-white"
                   )}>
                      <Users className="w-5 h-5" />
                   </div>
                   
                   <div className="flex-1 text-left min-w-0">
                      <div className="text-[13px] font-black text-white/80 group-hover:text-white truncate uppercase tracking-wide">
                        {ws.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                         <span className="text-[10px] font-black text-white/20 group-hover:text-violet-400/60 uppercase tracking-widest">{ws.subject || 'GENERAL'}</span>
                         <span className="w-1 h-1 bg-white/5 rounded-full" />
                         <span className="text-[10px] font-black text-white/10 uppercase tracking-widest">{ws.member_count} MEMBERS</span>
                      </div>
                   </div>

                   <div className="p-2 rounded-xl bg-white/5 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1">
                      {shareMutation.isPending ? (
                        <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-violet-400" />
                      )}
                   </div>
                </button>
             ))
           )}
        </div>

        {/* Footer HUD */}
        <div className="p-8 border-t border-white/5 bg-white/[0.01]">
           <div className="flex items-center gap-3 justify-center">
              <Sparkles className="w-3.5 h-3.5 text-violet-400/40" />
              <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.3em]">Neural Link Context Authorized</p>
           </div>
        </div>
      </motion.div>
    </div>
  )
}
