import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceApi, libraryApi } from '@/lib/api'
import { 
  BookOpen, FileText, File, Video, 
  Search, Plus, X, ExternalLink, 
  ChevronDown, Library, PlusCircle,
  FileSearch, Archive, Sparkles,
  History, RotateCcw, Save, Loader2,
  Clock
} from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { format } from 'date-fns'

interface ResourceShelfProps {
  workspaceId: number
}

export default function ResourceShelf({ workspaceId }: ResourceShelfProps) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'resources' | 'history'>('resources')
  const [showLibraryAdd, setShowLibraryAdd] = useState(false)
  const [search, setSearch] = useState('')

  // Resources Data
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['workspace-files', workspaceId],
    queryFn: () => workspaceApi.getFiles(workspaceId).then(r => r.data),
  })
  const uploaded: any[] = filesData?.uploaded || []
  const linked: any[] = filesData?.linked_resources || []

  // History Data
  const { data: versionsData, isLoading: versionsLoading } = useQuery({
    queryKey: ['workspace-versions', workspaceId],
    queryFn: () => workspaceApi.getVersions(workspaceId).then(r => r.data),
    enabled: activeTab === 'history'
  })
  const versions: any[] = versionsData || []

  const saveSnapshotMutation = useMutation({
    mutationFn: () => workspaceApi.createVersion(workspaceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-versions', workspaceId] })
      toast.success('Snapshot saved successfully!')
    }
  })

  const restoreMutation = useMutation({
    mutationFn: (versionId: number) => workspaceApi.restoreVersion(workspaceId, versionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-blocks', workspaceId] })
      toast.success('Workspace restored to this version!')
    }
  })

  const { data: libraryData } = useQuery({
    queryKey: ['resources', search],
    queryFn: () => libraryApi.getResources().then(r => r.data),
    enabled: showLibraryAdd,
  })
  const libraryResources: any[] = libraryData?.results || []

  const linkMutation = useMutation({
    mutationFn: (resource_id: number) => workspaceApi.linkResource(workspaceId, resource_id),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] })
      toast.success('Resource linked to workspace!')
    },
  })

  const unlinkMutation = useMutation({
    mutationFn: (resource_id: number) => workspaceApi.unlinkResource(workspaceId, resource_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] }),
  })

  const getIcon = (type: string) => {
    switch(type) {
      case 'pdf': return <FileText className="w-4 h-4" />
      case 'video': return <Video className="w-4 h-4" />
      default: return <File className="w-4 h-4" />
    }
  }

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden transition-all duration-700 relative">
      <div className="absolute inset-0 bg-white/[0.01] pointer-events-none" />
      
      {/* Header with Glass Tabs */}
      <div className="px-6 pt-6 pb-4 border-b border-white/5 bg-white/[0.02] backdrop-blur-md flex-shrink-0">
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 mb-6">
          <button 
            onClick={() => setActiveTab('resources')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === 'resources' ? "bg-white text-black shadow-2xl scale-105" : "text-white/30 hover:text-white/60"
            )}>
            <Library className="w-3.5 h-3.5" /> Sources
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === 'history' ? "bg-white text-black shadow-2xl scale-105" : "text-white/30 hover:text-white/60"
            )}>
            <History className="w-3.5 h-3.5" /> Timeline
          </button>
        </div>

        {activeTab === 'resources' && (
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-black text-white/20 text-[9px] uppercase tracking-[0.3em]">Neural Repository</h3>
            <button onClick={() => setShowLibraryAdd(!showLibraryAdd)} 
              className="p-1.5 text-white/40 hover:text-violet-400 hover:bg-violet-500/10 rounded-xl transition-all">
              {showLibraryAdd ? <X className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
            </button>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-black text-white/20 text-[9px] uppercase tracking-[0.3em]">Temporal Logs</h3>
            <button 
              onClick={() => saveSnapshotMutation.mutate()}
              disabled={saveSnapshotMutation.isPending}
              className="flex items-center gap-2 px-4 py-1.5 bg-violet-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-violet-700 transition-all shadow-xl active:scale-95">
              {saveSnapshotMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Capture
            </button>
          </div>
        )}

        {/* Library Search Panel */}
        {showLibraryAdd && activeTab === 'resources' && (
          <div className="mt-4 space-y-4 animate-in fade-in zoom-in-95 duration-500">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-white/20" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Query Library..." 
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-[11px] text-white outline-none focus:border-violet-500/40 transition-all selection:bg-violet-500/30 font-medium" />
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
              {libraryResources.filter(r => !linked.find(l => l.id === r.id)).map(r => (
                <button key={r.id} onClick={() => linkMutation.mutate(r.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all text-left group">
                  <div className="p-2 bg-white/5 text-white/20 rounded-xl group-hover:text-violet-400 group-hover:bg-violet-500/20 transition-all">
                    {getIcon(r.resource_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-black text-white/80 truncate uppercase tracking-wider group-hover:text-white">{r.title}</div>
                    <div className="text-[9px] text-white/20 font-bold uppercase tracking-tighter">{r.subject || 'Generic'}</div>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-white/10 group-hover:text-violet-400" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Shelf Body */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
        {activeTab === 'resources' ? (
          <>
            {/* Linked Resources */}
            <div>
              <div className="px-2 text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-4 flex items-center justify-between">
                Synced Intelligence
                <span className="bg-white/5 text-white/40 rounded-full px-2 py-0.5 border border-white/5">{linked.length}</span>
              </div>
              <div className="space-y-3">
                {linked.map(r => (
                  <div key={r.id} className="group relative bg-white/[0.03] rounded-2.5xl p-4 border border-white/5 shadow-2xl hover:border-white/10 hover:bg-white/[0.05] transition-all duration-500">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-violet-600/10 text-violet-400 rounded-2xl group-hover:scale-110 transition-transform">
                        {getIcon(r.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-black text-white/90 truncate uppercase tracking-wider">{r.title}</div>
                        <div className="text-[9px] text-white/30 font-bold uppercase tracking-tighter">{r.type} LINK</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => {
                          workspaceApi.aiAssist(workspaceId, 'auto_summarize', { resource_id: r.id })
                          toast.promise(new Promise(resolve => setTimeout(resolve, 2000)), {
                            loading: 'Synthesizing knowledge...',
                            success: 'Ghost block suggested!',
                            error: 'Synthesis failed.'
                          })
                        }}
                        className="p-2 text-violet-400 hover:bg-violet-500/10 rounded-xl"
                        title="Synthesize into Block"
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>
                      <button onClick={() => unlinkMutation.mutate(r.id)} 
                        className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-xl">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Direct Uploads */}
            <div>
              <div className="px-2 text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-4 flex items-center justify-between">
                Local Fragments
                <span className="bg-white/5 text-white/40 rounded-full px-2 py-0.5 border border-white/5">{uploaded.length}</span>
              </div>
              <div className="space-y-3">
                {uploaded.map(f => (
                  <div key={f.id} className="group flex items-center gap-4 bg-white/[0.02] rounded-2xl p-4 border border-white/5 hover:border-white/10 hover:bg-white/[0.04] transition-all duration-500 shadow-xl">
                    <div className="p-3 bg-sky-600/10 text-sky-400 rounded-2xl">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-black text-white/80 truncate uppercase tracking-wider">{f.name}</div>
                      <div className="text-[9px] text-white/20 font-bold uppercase tracking-widest">{Math.round(f.file_size / 1024)} KB</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {versionsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-white/10" />
              </div>
            ) : (
              versions.map(v => (
                <div key={v.id} className="bg-white/[0.03] rounded-[2rem] p-5 border border-white/5 group transition-all duration-500 hover:border-violet-500/30 hover:bg-violet-500/[0.02] shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-white/5 text-white/30 rounded-2xl group-hover:text-violet-400 transition-colors">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="block text-xs font-black text-white tracking-widest uppercase">Version {v.version}</span>
                        <span className="block text-[9px] text-white/20 font-black uppercase tracking-widest">{format(new Date(v.created_at), 'MMM d, HH:mm')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="text-[9px] text-white/30 font-black uppercase tracking-[0.2em] truncate max-w-[120px]">
                      By {v.saved_by_name}
                    </div>
                    <button 
                      onClick={() => restoreMutation.mutate(v.id)}
                      disabled={restoreMutation.isPending}
                      className="flex items-center gap-2 text-[10px] font-black text-violet-400 uppercase tracking-widest hover:text-white transition-all opacity-0 group-hover:opacity-100 p-2 bg-violet-600/10 rounded-xl">
                      <RotateCcw className="w-3.5 h-3.5" /> Rollback
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Intelligence HUD Footer */}
      <div className="p-6 m-4 mt-2 rounded-[2.5rem] bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-[0_20px_50px_rgba(139,92,246,0.3)] relative overflow-hidden group/hud">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.2),transparent)] opacity-0 group-hover/hud:opacity-100 transition-opacity duration-700" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm animate-pulse">
               <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Cerebral Matrix</span>
          </div>
          <p className="text-[11px] text-white/80 leading-relaxed font-black uppercase tracking-wider">
            Synthesizing {linked.length + uploaded.length} intelligence nodes in synchronous real-time.
          </p>
        </div>
      </div>
    </div>
  )
}
