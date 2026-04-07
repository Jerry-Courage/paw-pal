'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceApi } from '@/lib/api'
import { 
  Users, ChevronDown, Download, ArrowLeft, 
  Copy, Check, Sparkles, BookOpen, 
  Menu, X, PanelLeftClose, PanelRightClose,
  FileDown, Presentation, File, FileText, Loader2, Zap,
  MessageSquare, Layout, History, Library
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useMedia } from 'react-use'

// New Workspace 2.0 Components
import ResourceShelf from '@/components/workspace/ResourceShelf'
import BlockList from '@/components/workspace/BlockList'
import AIAssistantSidebar from '@/components/workspace/AIAssistantSidebar'

import { useWorkspaceSocket } from '@/hooks/useWorkspaceSocket'

export default function WorkspaceDetailPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const qc = useQueryClient()
  const isMobile = useMedia('(max-width: 1024px)', false)
  const { isConnected, sendMessage, activeUsers, userFocus, lockedBlocks } = useWorkspaceSocket(id)
  
  // UI State
  const [showLeft, setShowLeft] = useState(!isMobile)
  const [showRight, setShowRight] = useState(!isMobile)
  const [exportOpen, setExportOpen] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  // Sync sidebar visibility with orientation/screen size changes
  useEffect(() => {
    if (isMobile) {
      setShowLeft(false)
      setShowRight(false)
    } else {
      setShowLeft(true)
      setShowRight(true)
    }
  }, [isMobile])

  const { data: ws, isLoading } = useQuery({
    queryKey: ['workspace', id],
    queryFn: () => workspaceApi.get(id).then(r => r.data),
  })

  const handleExport = async (fmt: string) => {
    setExportOpen(false)
    try {
      const res = await workspaceApi.export(id, fmt)
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `${ws?.name?.replace(/\s+/g, '_') || 'workspace'}.${fmt}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported as .${fmt}`)
    } catch { toast.error('Export failed.') }
  }

  const copyInviteCode = () => {
    if (ws?.invite_code) {
      navigator.clipboard.writeText(ws.invite_code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
      toast.success('Invite code copied!')
    }
  }

  const handleInsertAIResponse = (text: string) => {
    qc.invalidateQueries({ queryKey: ['workspace-blocks', id] })
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <Loader2 className="w-12 h-12 animate-spin text-violet-500" />
          <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-sky-400 animate-pulse" />
        </div>
        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest animate-pulse">Initializing Mission Control...</p>
      </div>
    </div>
  )

  if (!ws) return <div className="p-10 text-center">Workspace not found</div>

  return (
    <div className="flex flex-col h-screen bg-[#fafafa] dark:bg-gray-950 overflow-hidden -m-4 md:-m-6">
      
      {/* Premium Top Bar */}
      <header className="h-16 lg:h-14 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-3 lg:px-4 z-50 flex-shrink-0">
        <div className="flex items-center gap-2 lg:gap-3">
          <Link href="/workspace" className="p-1.5 lg:p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </Link>
          <div className="h-6 w-[1.5px] bg-gray-100 dark:bg-gray-800 mx-0.5 lg:mx-1" />
          <div>
            <div className="flex items-center gap-1.5 lg:gap-2">
              <h1 className="text-xs lg:text-sm font-black text-gray-900 dark:text-white tracking-tight truncate max-w-[120px] lg:max-w-none">{ws.name}</h1>
              <div className="px-1.5 py-0.5 bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 rounded-full text-[8px] lg:text-[9px] font-bold uppercase tracking-wider border border-sky-100 dark:border-sky-900">
                {ws.subject || 'Research'}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-0.5 lg:mt-0">
               <span className="flex items-center gap-1 text-[9px] lg:text-[10px] text-gray-400 font-medium whitespace-nowrap">
                 <Users className="w-2.5 h-2.5" /> {ws.member_count}
               </span>
               <div className="flex items-center gap-1">
                 <div className="w-1 h-1 lg:w-1.5 lg:h-1.5 bg-emerald-500 rounded-full" />
                 <span className="text-[8px] lg:text-[10px] text-emerald-600 dark:text-emerald-500 font-bold uppercase tracking-tighter">Live</span>
               </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 lg:gap-2">
          {/* Active Users - Hidden on very small screens to save space */}
          <div className="hidden sm:flex -space-x-1.5 mr-2 lg:mr-4">
            {activeUsers.slice(0, 3).map((user, i) => (
              <div key={user.id} 
                className={cn(
                  "w-6 h-6 lg:w-7 lg:h-7 rounded-full border-2 border-white dark:border-gray-900 bg-gradient-to-br flex items-center justify-center text-[8px] lg:text-[10px] font-black text-white shadow-sm transition-all hover:scale-110",
                  i % 3 === 0 ? "from-indigo-500 to-violet-500" : i % 3 === 1 ? "from-sky-500 to-indigo-500" : "from-violet-500 to-fuchsia-500"
                )}>
                {user.name[0].toUpperCase()}
              </div>
            ))}
            {activeUsers.length > 3 && (
              <div className="w-6 h-6 lg:w-7 lg:h-7 rounded-full border-2 border-white dark:border-gray-900 bg-gray-100 flex items-center justify-center text-[8px] font-bold text-gray-500">
                +{activeUsers.length - 3}
              </div>
            )}
          </div>

          {/* Panes Toggle - Integrated into mobile/tab experience */}
          <div className="flex bg-gray-50 dark:bg-gray-800 rounded-xl p-0.5 lg:p-1 mr-1 lg:mr-2">
            <button onClick={() => { setShowLeft(!showLeft); if (isMobile) setShowRight(false); }}
              title="Toggle Resource Cabinet"
              className={cn("p-1.5 rounded-lg transition-all", showLeft ? "bg-white dark:bg-gray-700 text-violet-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}>
              <Library className="w-4 h-4" />
            </button>
            <button onClick={() => { setShowRight(!showRight); if (isMobile) setShowLeft(false); }}
              title="Toggle AI Assistant"
              className={cn("p-1.5 rounded-lg transition-all", showRight ? "bg-white dark:bg-gray-700 text-violet-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}>
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>

          {/* Export - Icon only on mobile */}
          <div className="relative">
            <button onClick={() => setExportOpen(!exportOpen)}
              className="flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 p-2 lg:px-4 lg:py-2 rounded-xl text-[10px] lg:text-[11px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-gray-200 dark:shadow-none">
              <Download className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
              <span className="hidden lg:inline">Export</span>
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-2xl z-20 w-48 lg:w-56 overflow-hidden animate-in zoom-in-95 slide-in-from-top-2 duration-200">
                  {['pdf', 'pptx', 'docx'].map(fmt => (
                    <button key={fmt} onClick={() => handleExport(fmt)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-b last:border-0 border-gray-50 dark:border-gray-800">
                      <File className="w-4 h-4 text-violet-500" />
                      <span className="text-[11px] font-bold text-gray-900 dark:text-white uppercase">{fmt} Document</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 3-Pane Mission Control Workspace */}
      <main className="flex-1 flex min-h-0 overflow-hidden relative">
        
        {/* Left Pane: Resource Shelf - Responsive Overlay */}
        <aside className={cn(
          "fixed inset-y-16 lg:static z-40 bg-white lg:bg-transparent transition-all duration-300 shadow-2xl lg:shadow-none w-72 xl:w-80",
          showLeft ? "left-0" : "-left-full"
        )}>
           <ResourceShelf workspaceId={id} />
           {/* Close button for mobile */}
           <button onClick={() => setShowLeft(false)} className="lg:hidden absolute top-4 right-4 p-2 text-gray-400 bg-gray-50 rounded-full">
             <X className="w-4 h-4" />
           </button>
        </aside>

        {/* Center Pane: Collaborative Block Canvas */}
        <section className="flex-1 overflow-y-auto bg-gray-50/30 dark:bg-gray-950/50 custom-scrollbar relative">
          <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]" 
               style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
          
          <BlockList workspaceId={id} socket={{ isConnected, sendMessage, activeUsers, userFocus, lockedBlocks }} />
          
          {/* Backdrop for mobile overlays */}
          {(showLeft || showRight) && isMobile && (
            <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-30 lg:hidden" 
                 onClick={() => { setShowLeft(false); setShowRight(false); }} />
          )}
        </section>

        {/* Right Pane: AI Assistant Command Center - Responsive Overlay */}
        <aside className={cn(
          "fixed inset-y-16 lg:static z-40 bg-white lg:bg-transparent transition-all duration-300 shadow-2xl lg:shadow-none w-[85%] sm:w-80 xl:w-96",
          showRight ? "right-0" : "-right-full text-transparent"
        )}>
          <AIAssistantSidebar workspaceId={id} onInsertToCanvas={handleInsertAIResponse} socket={{ sendMessage }} />
          {/* Close button for mobile */}
          <button onClick={() => setShowRight(false)} className="lg:hidden absolute top-4 left-4 p-2 text-gray-400 bg-gray-50 rounded-full">
             <X className="w-4 h-4" />
           </button>
        </aside>
      </main>

      {/* Collaborative Presence Footer (Subtle) */}
      <footer className="h-10 lg:h-8 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-3 lg:px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 lg:gap-4">
          <div className="hidden sm:flex -space-x-2">
            {[1, 2].map(i => (
              <div key={i} className="w-4 h-4 lg:w-5 lg:h-5 rounded-full border-2 border-white dark:border-gray-900 bg-gray-200 flex items-center justify-center text-[7px] lg:text-[8px] font-bold text-gray-500">
                +1
              </div>
            ))}
          </div>
          <span className="text-[8px] lg:text-[9px] text-gray-400 font-bold uppercase tracking-widest">Global State Ready</span>
        </div>
        <div className="flex items-center gap-1.5">
           <Zap className="w-2.5 h-2.5 lg:w-3 lg:h-3 text-sky-500" />
           <span className="text-[8px] lg:text-[9px] text-sky-600 dark:text-sky-400 font-black uppercase tracking-tighter lg:tracking-widest">Neural Link Active</span>
        </div>
      </footer>
    </div>
  )
}
