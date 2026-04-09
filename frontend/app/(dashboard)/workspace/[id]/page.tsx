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
import { motion, AnimatePresence } from 'framer-motion'

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

  const handleInsertAIResponse = (text: string) => {
    qc.invalidateQueries({ queryKey: ['workspace-blocks', id] })
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-screen bg-[#020202]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 bg-violet-600/20 blur-3xl rounded-full animate-pulse" />
          <Loader2 className="w-16 h-16 animate-spin text-violet-500 relative z-10" />
          <Sparkles className="absolute -top-2 -right-2 w-7 h-7 text-sky-400 animate-bounce relative z-20" />
        </div>
        <p className="text-xs font-black text-violet-400/60 uppercase tracking-[0.3em] animate-pulse">Neural Genesis in Progress...</p>
      </motion.div>
    </div>
  )

  if (!ws) return <div className="p-10 text-center text-white">Workspace not found</div>

  return (
    <div className="relative flex flex-col h-screen bg-[#050505] text-white overflow-hidden -m-4 md:-m-6 selection:bg-violet-500/30">
      
      {/* Dynamic Ambient Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-sky-600/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 opacity-[0.03]" 
             style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Floating Glass Header */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative h-16 lg:h-14 bg-black/40 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 z-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/workspace" className="p-2 hover:bg-white/5 rounded-xl transition-all hover:scale-105">
            <ArrowLeft className="w-4 h-4 text-white/40 hover:text-white" />
          </Link>
          <div className="h-6 w-[1px] bg-white/10" />
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-black tracking-tight text-white/90">{ws.name}</h1>
              <span className="px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded-full text-[9px] font-black uppercase tracking-widest border border-violet-500/20">
                {ws.subject || 'Scientific'}
              </span>
            </div>
            <div className="flex items-center gap-2">
               <div className="flex items-center gap-1 text-[10px] text-white/30 font-bold uppercase tracking-tighter">
                 <Users className="w-2.5 h-2.5" /> {ws.member_count} Members
               </div>
               <div className="w-1 h-1 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]" />
               <span className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Neural Link Syncing</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Presence Ring */}
          <div className="hidden sm:flex -space-x-2 mr-4">
            {activeUsers.slice(0, 3).map((user, i) => (
              <motion.div 
                key={user.id} 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ y: -4, scale: 1.1 }}
                className={cn(
                  "w-8 h-8 rounded-full border-2 border-[#050505] bg-gradient-to-br flex items-center justify-center text-[10px] font-black text-white shadow-xl cursor-help",
                  i % 3 === 0 ? "from-violet-500 to-indigo-600" : i % 3 === 1 ? "from-blue-500 to-sky-600" : "from-fuchsia-500 to-pink-600"
                )}>
                {user.name[0].toUpperCase()}
              </motion.div>
            ))}
          </div>

          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 gap-1">
            <button onClick={() => setShowLeft(!showLeft)}
              className={cn("p-1.5 rounded-lg transition-all hover:bg-white/10", showLeft ? "text-violet-400 bg-violet-500/10 shadow-[inset_0_0_10px_rgba(139,92,246,0.2)]" : "text-white/40")}>
              <Library className="w-4 h-4" />
            </button>
            <button onClick={() => setShowRight(!showRight)}
              className={cn("p-1.5 rounded-lg transition-all hover:bg-white/10", showRight ? "text-violet-400 bg-violet-500/10 shadow-[inset_0_0_10px_rgba(139,92,246,0.2)]" : "text-white/40")}>
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>

          <button onClick={() => setExportOpen(!exportOpen)}
            className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-violet-400 hover:text-white transition-all shadow-xl active:scale-95 group">
            <Download className="w-3.5 h-3.5 transition-transform group-hover:translate-y-0.5" />
            <span className="hidden lg:inline">Transmit</span>
          </button>
        </div>
      </motion.header>

      {/* Neural Lab Workspace */}
      <main className="flex-1 flex min-h-0 overflow-hidden relative">
        
        {/* Floating Intelligence Islands (Sidebars) */}
        <AnimatePresence mode="wait">
          {showLeft && (
            <motion.aside 
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute lg:relative z-40 h-[calc(100%-2rem)] m-4 left-0 w-80 lg:w-80 group">
              <div className="h-full bg-black/40 backdrop-blur-2xl border border-white/5 rounded-3xl shadow-2xl overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
                <ResourceShelf workspaceId={id} />
                <button onClick={() => setShowLeft(false)} className="lg:hidden absolute top-4 right-4 p-2 text-white/40 bg-white/5 rounded-xl hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Cinematic Blocks Canvas */}
        <section className="flex-1 overflow-y-auto custom-scrollbar relative px-4 lg:px-0">
          <BlockList workspaceId={id} socket={{ isConnected, sendMessage, activeUsers, userFocus, lockedBlocks }} />
        </section>

        <AnimatePresence mode="wait">
          {showRight && (
            <motion.aside 
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute lg:relative z-40 h-[calc(100%-2rem)] m-4 right-0 w-[85%] lg:w-96 group">
              <div className="h-full bg-black/40 backdrop-blur-2xl border border-white/5 rounded-3xl shadow-2xl overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
                <AIAssistantSidebar workspaceId={id} onInsertToCanvas={handleInsertAIResponse} socket={{ sendMessage }} />
                <button onClick={() => setShowRight(false)} className="lg:hidden absolute top-4 left-4 p-2 text-white/40 bg-white/5 rounded-xl hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      {/* Futuristic Neural Presence Footer */}
      <footer className="h-10 bg-black/80 backdrop-blur-xl border-t border-white/5 px-6 flex items-center justify-between z-50">
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-2">
            <div className="flex -space-x-1.5">
               {[1, 2].map(i => <div key={i} className="w-5 h-5 rounded-full border border-[#050505] bg-white/10 flex items-center justify-center text-[7px] font-black text-white/40 tracking-tighter">AI</div>)}
            </div>
            <span className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em]">Synchronous Node Active</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2 group cursor-none">
              <Sparkles className="w-3 h-3 text-violet-400 animate-pulse" />
              <span className="text-[10px] text-violet-400 font-black uppercase tracking-[0.3em] group-hover:text-white transition-colors">Neural Intelligence Engaged</span>
           </div>
           <div className="h-4 w-[1px] bg-white/10 mx-2" />
           <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-ping opacity-50" />
              <span className="text-[10px] text-sky-400 font-bold uppercase tracking-widest">Global State 1.0</span>
           </div>
        </div>
      </footer>

      {/* Export Overlay */}
      <AnimatePresence>
        {exportOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" 
              onClick={() => setExportOpen(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-gray-900 border border-white/10 p-2 rounded-3xl shadow-2xl z-[101] overflow-hidden">
                <div className="px-4 py-3 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] border-b border-white/5 mb-2">Select Transmission Format</div>
                {['pdf', 'pptx', 'docx'].map(fmt => (
                  <button key={fmt} onClick={() => handleExport(fmt)}
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/5 transition-all text-left group rounded-2xl">
                    <div className="p-2 bg-violet-500/10 rounded-xl group-hover:bg-violet-500 group-hover:text-white transition-all">
                      <File className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-white/80 uppercase group-hover:text-white">{fmt} Master Document</span>
                  </button>
                ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
