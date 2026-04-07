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
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-white/5 border-r border-gray-100 dark:border-gray-800 animate-in slide-in-from-left-2 duration-300">
      {/* Header with Tabs */}
      <div className="px-4 pt-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
           <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-full">
             <button 
               onClick={() => setActiveTab('resources')}
               className={cn(
                 "flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-bold transition-all",
                 activeTab === 'resources' ? "bg-white dark:bg-gray-700 shadow-sm text-violet-600" : "text-gray-400 hover:text-gray-600"
               )}>
               <Library className="w-3.5 h-3.5" /> Resources
             </button>
             <button 
               onClick={() => setActiveTab('history')}
               className={cn(
                 "flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-bold transition-all",
                 activeTab === 'history' ? "bg-white dark:bg-gray-700 shadow-sm text-violet-600" : "text-gray-400 hover:text-gray-600"
               )}>
               <History className="w-3.5 h-3.5" /> History
             </button>
           </div>
        </div>

        {activeTab === 'resources' && (
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-900 dark:text-white text-[11px] uppercase tracking-widest opacity-50">Shelf Content</h3>
            <button onClick={() => setShowLibraryAdd(!showLibraryAdd)} 
              className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors">
              {showLibraryAdd ? <X className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
            </button>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-900 dark:text-white text-[11px] uppercase tracking-widest opacity-50">Timeline</h3>
            <button 
              onClick={() => saveSnapshotMutation.mutate()}
              disabled={saveSnapshotMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1 bg-violet-600 text-white rounded-lg text-[10px] font-bold hover:bg-violet-700 transition-all shadow-sm">
              {saveSnapshotMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Snapshot
            </button>
          </div>
        )}

        {/* Library Search Panel (Resources Only) */}
        {showLibraryAdd && activeTab === 'resources' && (
          <div className="space-y-3 pb-2 animate-in fade-in zoom-in-95 duration-200">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search Library..." className="input pl-8 text-xs py-2 bg-gray-50/50 border-gray-200" />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {libraryResources.filter(r => !linked.find(l => l.id === r.id)).map(r => (
                <button key={r.id} onClick={() => linkMutation.mutate(r.id)}
                  className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-100 transition-all text-left">
                  <div className="p-1.5 bg-gray-50 dark:bg-gray-800 text-gray-400 rounded-lg group-hover:text-violet-500">
                    {getIcon(r.resource_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate text-gray-800 dark:text-gray-200">{r.title}</div>
                    <div className="text-[10px] text-gray-400">{r.subject || 'General'}</div>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-violet-400" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Shelf Body */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {activeTab === 'resources' ? (
          <div className="space-y-6">
            {/* Linked Resources */}
            <div>
              <div className="px-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                Linked Resources
                <span className="bg-gray-200 dark:bg-gray-800 text-gray-500 rounded-full px-1.5 py-0.5">{linked.length}</span>
              </div>
              <div className="space-y-2">
                {linked.map(r => (
                  <div key={r.id} className="group relative bg-white dark:bg-gray-900 rounded-2xl p-2.5 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all hover:translate-x-1">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-violet-50 dark:bg-violet-950/30 text-violet-600 rounded-xl">
                        {getIcon(r.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{r.title}</div>
                        <div className="text-[10px] text-gray-400 font-medium uppercase tracking-tighter">{r.type}</div>
                      </div>
                    </div>
                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-all flex gap-1 items-center">
                      <button onClick={() => unlinkMutation.mutate(r.id)} 
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Direct Uploads */}
            <div>
              <div className="px-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                Direct Uploads
                <span className="bg-gray-200 dark:bg-gray-800 text-gray-500 rounded-full px-1.5 py-0.5">{uploaded.length}</span>
              </div>
              <div className="space-y-2">
                {uploaded.map(f => (
                  <div key={f.id} className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl p-2.5 border border-gray-100 dark:border-gray-800 shadow-sm group">
                    <div className="p-2 bg-sky-50 dark:bg-sky-950/30 text-sky-600 rounded-xl">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{f.name}</div>
                      <div className="text-[10px] text-gray-400">{Math.round(f.file_size / 1024)} KB</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {versionsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
              </div>
            ) : (
              versions.map(v => (
                <div key={v.id} className="bg-white dark:bg-gray-900 rounded-2xl p-3 border border-gray-100 dark:border-gray-800 group transition-all hover:border-violet-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-gray-50 dark:bg-gray-800 text-gray-400 rounded-lg">
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[11px] font-bold text-gray-800 dark:text-gray-200">v{v.version}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{format(new Date(v.created_at), 'MMM d, HH:mm')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-gray-400">
                      Saved by <span className="font-bold text-gray-600 dark:text-gray-300">{v.saved_by_name}</span>
                    </div>
                    <button 
                      onClick={() => restoreMutation.mutate(v.id)}
                      disabled={restoreMutation.isPending}
                      className="flex items-center gap-1 text-[10px] font-black text-violet-600 uppercase tracking-widest hover:text-violet-700 opacity-0 group-hover:opacity-100 transition-opacity">
                      <RotateCcw className="w-3 h-3" /> Restore
                    </button>
                  </div>
                </div>
              ))
            )}
            {versions.length === 0 && !versionsLoading && (
              <div className="text-center py-20">
                <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                  <History className="w-6 h-6 text-gray-200" />
                </div>
                <p className="text-[11px] text-gray-400 px-8">No milestones saved yet. Capture a snapshot to secure your current progress.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Workspace Context Intelligence */}
      <div className="p-3 bg-violet-600 text-white rounded-t-3xl shadow-2xl flex-shrink-0 animate-in slide-in-from-bottom-5 duration-700">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-violet-200" />
          <span className="text-[10px] font-black uppercase tracking-widest">Active Context</span>
        </div>
        <p className="text-[10px] text-violet-100 leading-relaxed font-medium opacity-90">
          FlowAI is analyzing {linked.length + uploaded.length} sources to power your collaborative workspace in real-time.
        </p>
      </div>
    </div>
  )
}
