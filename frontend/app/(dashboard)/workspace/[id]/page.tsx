'use client'
import dynamic from 'next/dynamic'

import React, { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Send, 
  Users, 
  BookOpen, 
  Sparkles, 
  Copy, 
  Check, 
  ChevronLeft,
  X,
  Search,
  Pin,
  Clock,
  Menu,
  Mic,
  Square,
  Play,
  Pause,
  Volume2,
  Reply,
  Download,
  CloudDownload,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Loader2,
  LayoutGrid,
  Network,
  Plus,
  FileText,
  Trash2,
  LogOut,
  Settings
} from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import { workspaceApi, libraryApi, assignmentsApi, getAuthToken, API_BASE } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'

const RichNotesViewer = dynamic(() => import('@/components/library/RichNotesViewer'), { ssr: false })
const PDFViewer = dynamic(() => import('@/components/library/PDFViewer'), { ssr: false })
const ConfirmationModal = dynamic(() => import('@/components/ui/ConfirmationModal'), { ssr: false })

export default function WorkspaceCollaborationStudio() {
  const { id } = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const [workspace, setWorkspace] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [inputText, setInputText] = useState('')
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({})
  const [replyingTo, setReplyingTo] = useState<any>(null)
  const [isKnowledgeDrawerOpen, setIsKnowledgeDrawerOpen] = useState(false)
  const [hubTab, setHubTab] = useState<'insights' | 'source'>('insights')
  const [isCloning, setIsCloning] = useState(false)
  const [viewingResource, setViewingResource] = useState<any>(null)
  const [libraryResources, setLibraryResources] = useState<any[]>([])
  const [hubView, setHubView] = useState<'shared' | 'library'>('shared')
  const [copied, setCopied] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    type: 'danger' | 'warning';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    type: 'warning',
    onConfirm: () => {}
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<any>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    fetchWorkspace()
    fetchLibrary()
    connectWebSocket()
    return () => socketRef.current?.close()
  }, [id])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const fetchWorkspace = async () => {
    try {
      const res = await workspaceApi.get(Number(id))
      setWorkspace(res.data)
      setMessages(res.data.messages || [])
      setIsLoading(false)
    } catch (err) {
      console.error(err)
    }
  }

  const fetchLibrary = async () => {
    try {
      const res = await libraryApi.getResources()
      // Fix: Handle paginated results
      const resources = Array.isArray(res.data) ? res.data : res.data.results || []
      setLibraryResources(resources)
    } catch (err) {
      console.error(err)
    }
  }

  const connectingPromiseRef = useRef<Promise<void> | null>(null)
  
  const connectWebSocket = async () => {
    // --- 0. Prevent race conditions with a lock ---
    if (connectingPromiseRef.current) {
      return await connectingPromiseRef.current
    }

    // --- 1. Guard against already active connection ---
    if (socketRef.current?.readyState === WebSocket.CONNECTING || 
        socketRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    // Create a new connection promise
    connectingPromiseRef.current = (async () => {
      // --- 2. Cleanly terminate existing socket ---
      if (socketRef.current) {
        socketRef.current.onclose = null
        socketRef.current.close()
        socketRef.current = null
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host
      
      try {
        const token = await getAuthToken()
        const wsUrl = `${protocol}//${host}/ws/workspace/${id}/${token ? `?token=${token}` : ''}`
        
        console.log("[WS] Initiating connection...")
        const socket = new WebSocket(wsUrl)
        socketRef.current = socket

        socket.onopen = () => {
          console.log("[WS] Connection established successfully.")
        }

        socket.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.type === 'broadcast_chat_message') {
            const msg = data.message
            setMessages(prev => {
              if (prev.find(m => String(m.id) === String(msg.id))) return prev
              
              const optimisticIndex = prev.findIndex(m => {
                if (!m.is_optimistic) return false
                if (m.content?.trim() === msg.content?.trim()) return true
                if (m.audio_file && msg.audio_file) {
                  const mTime = new Date(m.created_at).getTime()
                  const msgTime = new Date(msg.created_at).getTime()
                  return Math.abs(msgTime - mTime) < 15000 
                }
                return false
              })
              
              if (optimisticIndex !== -1) {
                const next = [...prev]
                next[optimisticIndex] = msg 
                return next
              }

              return [...prev, msg]
            })
          } else if (data.type === 'broadcast_typing') {
            setTypingUsers(prev => ({
              ...prev,
              [data.user]: data.is_typing
            }))
          }
        }

        socket.onclose = (event) => {
          if (event.wasClean) {
            console.log("[WS] Connection closed cleanly.")
          } else {
            console.warn("[WS] Connection lost. Retrying in 5s...")
            setTimeout(() => {
              if (window.location.pathname.includes(`/workspace/${id}`)) {
                connectWebSocket()
              }
            }, 5000)
          }
        }

        socket.onerror = (error) => {
          console.error("[WS] Socket error:", error)
        }
      } catch (err) {
        console.error("[WS] Failed to initialize WebSocket:", err)
      } finally {
        connectingPromiseRef.current = null
      }
    })()

    return await connectingPromiseRef.current
  }

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sendTypingStatus = (isTyping: boolean) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'typing_status',
        is_typing: isTyping
      }))
    }
  }

  const handleUserTyping = () => {
    sendTypingStatus(true)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false)
    }, 3000)
  }

  const handleSendMessage = async (e?: React.FormEvent, audioBlob?: Blob) => {
    e?.preventDefault()
    if (!inputText.trim() && !audioBlob) return

    const tempText = inputText.trim()
    setInputText('')

    // --- Optimistic Update ---
    const optimisticId = `opt-${Date.now()}`
    const tempMsg = {
      id: optimisticId,
      content: tempText || "Voice Note",
      author: session?.user,
      created_at: new Date().toISOString(),
      is_ai: false,
      is_optimistic: true,
      audio_file: audioBlob ? URL.createObjectURL(audioBlob) : null
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      let data: string | FormData = tempText
      if (audioBlob) {
        data = new FormData()
        data.append('content', tempText || "Voice Note")
        data.append('audio', audioBlob, 'voice_note.webm')
      }
      
      const response = await workspaceApi.sendMessage(Number(id), data, replyingTo?.id)
      setReplyingTo(null) // Clear reply context after sending
    } catch (err) {
      console.error(err)
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        handleSendMessage(undefined, blob)
        stream.getTracks().forEach(t => t.stop())
      }

      recorder.start()
      setIsRecording(true)
      setRecordingDuration(0)
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
    } catch (err) {
      console.error("Recording failed", err)
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.stop()
      setIsRecording(false)
      clearInterval(timerRef.current)
    }
  }

  const handleShareResource = async (resourceId: number) => {
    try {
      await workspaceApi.shareResource(Number(id), resourceId)
      // Refresh workspace to show new resource
      fetchWorkspace()
      setHubView('shared')
      toast.success('Resource pinned to workspace intelligence!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to pin resource.')
    }
  }

  const handleCloneResource = async () => {
    if (!viewingResource || isCloning) return
    setIsCloning(true)
    try {
      await libraryApi.cloneResource(viewingResource.id)
      toast.success('Resource captured to your library!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to capture resource.')
    } finally {
      setIsCloning(false)
    }
  }

  const copyInviteCode = () => {
    if (workspace?.invite_code) {
      navigator.clipboard.writeText(workspace.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDeleteWorkspace = async () => {
    setConfirmModal({
      isOpen: true,
      title: "Decommission Space",
      message: "Are you absolutely sure? This will terminate the entire collab environment and redact all shared intelligence permanently. This action cannot be undone.",
      confirmText: "Decommission",
      type: 'danger',
      onConfirm: async () => {
        setIsDeleting(true)
        setConfirmModal(prev => ({ ...prev, isOpen: false }))
        try {
          await workspaceApi.delete(Number(id))
          toast.success("Workspace decommissioned successfully.")
          router.push('/workspace')
        } catch (err) {
          console.error(err)
          toast.error("Failed to decommission workspace.")
          setIsDeleting(false)
        }
      }
    })
  }

  const handleLeaveWorkspace = async () => {
    setConfirmModal({
      isOpen: true,
      title: "Leave Collab Space",
      message: "Exit this environment? You will lose access to the shared knowledge base until you rejoin with an invite code.",
      confirmText: "Leave Space",
      type: 'warning',
      onConfirm: async () => {
        setIsLeaving(true)
        setConfirmModal(prev => ({ ...prev, isOpen: false }))
        try {
          await workspaceApi.leave(Number(id))
          toast.success("You have left the space.")
          router.push('/workspace')
        } catch (err) {
          console.error(err)
          toast.error("Failed to leave workspace.")
          setIsLeaving(false)
        }
      }
    })
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-[100dvh] bg-[#050505]">
      <motion.div 
        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="text-violet-500 font-bold tracking-[0.2em] uppercase text-[10px]"
      >
        Initializing Collab Space...
      </motion.div>
    </div>
  )

  return (
    <div className="flex h-full bg-[#050505] text-white overflow-hidden relative pb-20 md:pb-0">
      
      {/* --- Main Chat Stage --- */}
      <div className="relative flex-1 flex flex-col min-w-0">
        
        {/* Header - Fluid Design */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-white/5 bg-black/40 backdrop-blur-xl z-20">
          <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
            <button onClick={() => router.push('/workspace')} className="p-2 hover:bg-white/5 rounded-full transition-colors flex-shrink-0">
              <ChevronLeft className="w-5 h-5 text-zinc-400" />
            </button>
            <div className="w-8 h-8 bg-violet-600/10 rounded-xl flex items-center justify-center flex-shrink-0">
               <LayoutGrid className="w-4 h-4 text-violet-400" />
            </div>
            <div className="overflow-hidden">
              <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white truncate">{workspace?.name || 'Collab Space'}</h1>
              <span className="text-[9px] sm:text-[10px] text-zinc-500 font-medium uppercase tracking-widest hidden sm:block">{workspace?.subject || 'Collab Space'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center -space-x-2 mr-4">
              {workspace?.members?.slice(0, 3).map((m: any, i: number) => (
                <div key={i} className="w-7 h-7 rounded-full border-2 border-[#050505] bg-violet-600 flex items-center justify-center text-[10px] font-black uppercase">
                  {m.user?.username?.[0] || '?'}
                </div>
              ))}
            </div>

            <button 
              onClick={copyInviteCode}
              className="px-2 sm:px-3 py-1.5 bg-zinc-900 border border-white/5 rounded-full flex items-center gap-2 hover:bg-zinc-800 transition-all active:scale-95"
            >
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-zinc-400">
                {copied ? 'Copied' : (
                  <span className="hidden xs:inline">{workspace?.invite_code}</span>
                )}
                {!copied && <span className="xs:hidden">Code</span>}
              </span>
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-500" />}
            </button>

            <button 
              onClick={() => setIsKnowledgeDrawerOpen(true)}
              className="p-2 bg-violet-600 rounded-full hover:bg-violet-500 transition-all shadow-lg shadow-violet-600/20 active:scale-90"
            >
              <Pin className="w-4 h-4 text-white" />
            </button>

            {/* Management Actions */}
            <div className="relative">
              <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="p-2 bg-zinc-900 border border-white/5 rounded-full hover:bg-zinc-800 transition-all active:scale-95"
              >
                <Settings className="w-4 h-4 text-zinc-400" />
              </button>
              
              <AnimatePresence>
                {isSettingsOpen && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsSettingsOpen(false)}
                      className="fixed inset-0 z-30"
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute right-0 mt-2 w-48 bg-[#0d0d0d] border border-white/10 rounded-2xl shadow-2xl z-40 p-2 overflow-hidden ring-1 ring-white/5"
                    >
                      {workspace?.is_owner ? (
                        <button 
                          onClick={handleDeleteWorkspace}
                          disabled={isDeleting}
                          className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                        >
                          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          Decommission
                        </button>
                      ) : (
                        <button 
                          onClick={handleLeaveWorkspace}
                          disabled={isLeaving}
                          className="w-full flex items-center gap-3 px-4 py-3 text-zinc-400 hover:bg-white/5 rounded-xl transition-all text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                        >
                          {isLeaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                          Leave Space
                        </button>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* --- Message Stream --- */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 space-y-6 sm:space-y-8 scroll-smooth"
        >
          {messages.map((ms, i) => {
            const isMe = ms.author?.id === session?.user?.id
            const showAvatar = i === 0 || messages[i-1]?.author?.id !== ms.author?.id
            return (
              <MessageBubble 
                key={ms.id || i} 
                message={ms} 
                isMe={isMe} 
                showAvatar={showAvatar}
                onReply={() => setReplyingTo({
                  id: ms.id,
                  author_name: ms.author?.username || 'User',
                  content: ms.content.substring(0, 50) + (ms.content.length > 50 ? '...' : '')
                })}
                onViewResource={(res: any) => {
                  setViewingResource(res)
                  setIsKnowledgeDrawerOpen(true)
                }}
              />
            )
          })}
          <div className="h-4" />
        </div>

        {/* --- Global Input Chamber & Tool Area --- */}
        <div className="relative group/input">
          <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 px-4 sm:px-8 space-y-2 pointer-events-none">
            {/* Reply Context - High Visibility Mode */}
            <AnimatePresence mode="wait">
              {replyingTo && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="pointer-events-auto bg-[#0d0d0d] border-l-4 border-l-violet-600 border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-[0_-10px_40px_rgba(0,0,0,0.6)] ring-1 ring-white/5 active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-9 h-9 rounded-xl bg-violet-600/10 flex items-center justify-center flex-shrink-0 animate-in fade-in zoom-in">
                      <Reply className="w-5 h-5 text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-violet-400 mb-0.5 leading-none">Replying to {replyingTo.author_name}</p>
                      <p className="text-[11px] sm:text-xs text-zinc-300 truncate font-semibold opacity-90 italic">"{replyingTo.content}"</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setReplyingTo(null)}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors group flex-shrink-0"
                  >
                    <X className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Typing Indicator */}
            <AnimatePresence>
              {Object.entries(typingUsers).filter(([_, isTyping]) => isTyping).length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 backdrop-blur-md rounded-full w-fit border border-white/5 shadow-xl"
                >
                  <div className="flex gap-1">
                    <span className="w-1 h-1 bg-violet-500 rounded-full animate-bounce" />
                    <span className="w-1 h-1 bg-violet-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1 h-1 bg-violet-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                    {Object.entries(typingUsers)
                      .filter(([_, isTyping]) => isTyping)
                      .map(([user]) => user)
                      .join(", ")} {Object.entries(typingUsers).filter(([_, isTyping]) => isTyping).length > 1 ? 'are' : 'is'} typing...
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="backdrop-blur-xl bg-[#050505]/80 border-t border-white/5 px-4 sm:px-8 py-4 sm:py-6 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-end gap-3 sm:gap-4">
              <button 
                type="button"
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={cn(
                  "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all duration-300",
                  isRecording 
                    ? "bg-red-500 animate-pulse scale-110 shadow-[0_0_20px_rgba(239,68,68,0.4)]" 
                    : "bg-[#111] border border-white/5 text-zinc-500 hover:text-white hover:border-violet-500/30 shadow-xl"
                )}
              >
                {isRecording ? <Square className="w-4 h-4 fill-white text-white" /> : <Mic className="w-5 h-5" />}
              </button>

              <div className="flex-1 relative">
                <input 
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value)
                    handleUserTyping()
                  }}
                  placeholder={isRecording ? `Recording... (${recordingDuration}s)` : replyingTo ? `Reply to ${replyingTo.author_name}...` : "Ask FlowAI or chat with group..."}
                  disabled={isRecording}
                  className="w-full bg-[#111] border border-white/5 rounded-2xl px-5 py-3 sm:py-4 text-xs sm:text-sm focus:outline-none focus:border-violet-500/50 transition-all placeholder:text-zinc-700 shadow-2xl disabled:opacity-50"
                />
                <button 
                  type="submit"
                  className="absolute right-2 sm:right-3 top-2 sm:top-2 p-2.5 bg-violet-600 rounded-xl hover:bg-violet-500 transition-all active:scale-90 disabled:opacity-50"
                  disabled={isRecording || !inputText.trim()}
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </button>
              </div>
            </form>
            <p className="text-center text-[8px] sm:text-[9px] text-zinc-600 mt-3 sm:mt-4 uppercase tracking-[0.2em] font-medium">
              {isRecording ? "Release to Send" : <>Hold <Mic className="w-2.5 h-2.5 inline mx-0.5" /> to Record • Mention <span className="text-violet-400 font-bold">Flow</span> for AI</>}
            </p>
          </div>
        </div>

      </div>

      {/* --- Knowledge Drawer - Full Adaptive Logic --- */}
      <AnimatePresence>
        {isKnowledgeDrawerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsKnowledgeDrawerOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-full sm:max-w-sm bg-[#050505] border-l border-white/5 z-50 flex flex-col shadow-[0_0_100px_rgba(0,0,0,1)]"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-violet-600/10 rounded-xl flex items-center justify-center">
                    <LayoutGrid className="w-4 h-4 text-violet-400" />
                  </div>
                  <h2 className="text-xs font-black uppercase tracking-widest text-white">
                    {viewingResource ? 'Collab Resource Hub' : 'Knowledge Bank'}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {viewingResource && (
                    <button 
                      onClick={() => setViewingResource(null)}
                      className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-500 hover:text-white"
                      title="Back to Library"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={() => setIsKnowledgeDrawerOpen(false)} 
                    className="p-2 hover:bg-white/5 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>
              </div>

              {/* Hub Tab Switcher (Only when viewing) */}
              {viewingResource && (
                <div className="px-6 py-4 flex items-center gap-2 border-b border-white/5 bg-black/20">
                  <button 
                    onClick={() => setHubTab('insights')}
                    className={cn(
                      "flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all",
                      hubTab === 'insights' ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Neural Insights
                  </button>
                  <button 
                    onClick={() => setHubTab('source')}
                    className={cn(
                      "flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all",
                      hubTab === 'source' ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Source PDF
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-hidden flex flex-col">
                <AnimatePresence mode="wait">
                  {!viewingResource ? (
                    <motion.div 
                      key="list"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex-1 flex flex-col p-6 space-y-6 overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex gap-2 p-1 bg-zinc-900/50 rounded-xl border border-white/5">
                          <button 
                            onClick={() => setHubView('shared')}
                            className={cn(
                              "px-3 py-1.5 text-[9px] font-black uppercase tracking-tighter rounded-lg transition-all",
                              hubView === 'shared' ? "bg-zinc-800 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-400"
                            )}
                          >
                            Shared
                          </button>
                          <button 
                            onClick={() => setHubView('library')}
                            className={cn(
                              "px-3 py-1.5 text-[9px] font-black uppercase tracking-tighter rounded-lg transition-all",
                              hubView === 'library' ? "bg-zinc-800 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-400"
                            )}
                          >
                            Library
                          </button>
                        </div>
                        {hubView === 'shared' && (
                          <button 
                            onClick={() => setHubView('library')}
                            className="p-2 bg-violet-600/10 text-violet-400 rounded-lg hover:bg-violet-600 hover:text-white transition-all group"
                            title="Add from Library"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                        {hubView === 'shared' ? (
                          <>
                            {(workspace?.resources || []).length === 0 ? (
                              <div className="text-center py-12">
                                <Network className="w-8 h-8 text-zinc-800 mx-auto mb-4" />
                                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">No shared materials yet</p>
                                <button 
                                  onClick={() => setHubView('library')}
                                  className="mt-4 text-[9px] text-violet-500 font-black uppercase tracking-widest hover:text-violet-400 transition-colors"
                                >
                                  + Link from Library
                                </button>
                              </div>
                            ) : (workspace.resources.map((res: any) => (
                              <div key={res.id} className="group relative">
                                <button 
                                  onClick={() => {
                                    setViewingResource(res)
                                    setHubTab('insights')
                                  }}
                                  className="w-full p-4 bg-[#0d0d0d] border border-white/5 rounded-2xl transition-all text-left flex items-start gap-4 hover:border-violet-500/20 active:scale-[0.98]"
                                >
                                  <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center transition-colors group-hover:bg-violet-600/10">
                                    <BookOpen className="w-4 h-4 text-zinc-600 group-hover:text-violet-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-zinc-100 truncate group-hover:text-white">{res.title}</p>
                                    <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter mt-1">{res.resource_type || 'Note'}</p>
                                  </div>
                                </button>
                              </div>
                            )))}
                          </>
                        ) : (
                          <>
                            {libraryResources.filter(res => !workspace?.resources?.some((r: any) => r.id === res.id)).length === 0 ? (
                              <div className="text-center py-12">
                                <Check className="w-8 h-8 text-zinc-800 mx-auto mb-4" />
                                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider px-8 leading-relaxed">Everything in your library is already linked to this space</p>
                              </div>
                            ) : libraryResources.filter(res => !workspace?.resources?.some((r: any) => r.id === res.id)).map((res) => (
                              <div key={res.id} className="group relative">
                                <div className="w-full p-4 bg-[#0d0d0d]/40 border border-white/5 rounded-2xl transition-all text-left flex items-start gap-4">
                                  <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
                                    <BookOpen className="w-4 h-4 text-zinc-700" />
                                  </div>
                                  <div className="flex-1 min-w-0 pr-10">
                                    <p className="text-xs font-bold text-zinc-400 truncate">{res.title}</p>
                                    <p className="text-[9px] text-zinc-700 font-bold uppercase tracking-tighter mt-1">Available in Library</p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => handleShareResource(res.id)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-violet-600/20 text-violet-400 rounded-lg group-hover:bg-violet-600 group-hover:text-white transition-all shadow-lg shadow-violet-600/10"
                                  title="Add to Workspace"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="viewer"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex-1 flex flex-col overflow-hidden"
                    >
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2 space-y-8">
                        {hubTab === 'insights' ? (
                          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Rich Content View */}
                            <div className="mb-8">
                              <h3 className="text-xl font-bold text-white leading-tight mb-2 tracking-tight">{viewingResource.title}</h3>
                              <div className="flex items-center gap-3">
                                <span className="px-2 py-0.5 bg-violet-600/20 text-violet-400 text-[8px] font-black uppercase tracking-widest rounded-md border border-violet-500/20">
                                  {viewingResource.resource_type || 'Note'}
                                </span>
                                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter">
                                  Collab Sync Active
                                </span>
                              </div>
                            </div>

                            {/* Summary Pulse */}
                            {viewingResource.ai_summary && (
                              <div className="mb-10 p-5 bg-zinc-900/40 border border-white/5 rounded-3xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-violet-600/5 blur-3xl -mr-12 -mt-12 transition-all group-hover:bg-violet-600/10" />
                                <div className="flex items-center gap-2 mb-4">
                                  <Sparkles className="w-4 h-4 text-violet-400" />
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Executive Summary</span>
                                </div>
                                <div className="prose prose-invert prose-xs leading-relaxed text-zinc-300">
                                  <ReactMarkdown>{viewingResource.ai_summary}</ReactMarkdown>
                                </div>
                              </div>
                            )}

                            {/* Deep Study Kit (Using adapted RichNotesViewer logic style) */}
                            {viewingResource.ai_notes_json && (
                              <RichNotesViewer 
                                notes={typeof viewingResource.ai_notes_json === 'string' ? JSON.parse(viewingResource.ai_notes_json) : viewingResource.ai_notes_json}
                                isEditing={false}
                                setIsEditing={() => {}}
                                onSave={() => {}}
                              />
                            )}
                          </div>
                        ) : (
                          <div className="h-[600px] w-full rounded-2xl overflow-hidden border border-white/5 bg-zinc-900/20">
                            {viewingResource.file_url ? (
                              <PDFViewer fileUrl={viewingResource.file_url} title={viewingResource.title} />
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                                  <ExternalLink className="w-8 h-8 text-zinc-700" />
                                </div>
                                <h4 className="text-sm font-bold text-white mb-2">Source Unavailable</h4>
                                <p className="text-[10px] text-zinc-500 font-medium max-w-[180px]">This resource doesn't have a linked PDF or the source has been moved.</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action Bar - Premium Utility */}
                      <div className="p-6 mt-auto border-t border-white/5 bg-black/40 backdrop-blur-xl space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <button 
                             onClick={() => {
                               const link = document.createElement('a')
                               link.href = viewingResource.file_url
                               link.download = viewingResource.title
                               link.click()
                             }}
                             className="py-3 bg-zinc-900 border border-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 group"
                          >
                            <Download className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white transition-colors" />
                            Download
                          </button>
                          
                          {viewingResource.owner?.id !== session?.user?.id && (
                            <button 
                              onClick={handleCloneResource}
                              disabled={isCloning}
                              className={cn(
                                "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2",
                                isCloning ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-violet-600 text-white hover:bg-violet-500 shadow-violet-600/20 active:scale-95"
                              )}
                            >
                              {isCloning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />}
                              {isCloning ? 'Capturing...' : 'Save to Library'}
                            </button>
                          )}
                        </div>
                        
                        <button 
                          onClick={() => handleShareResource(viewingResource.id)}
                          className="w-full py-4 bg-zinc-900/50 border border-violet-500/20 text-violet-400 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-violet-600/10 transition-all flex items-center justify-center gap-2"
                        >
                          <Pin className="w-3.5 h-3.5" />
                          Transmit to Studio Chat
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        isLoading={isDeleting || isLeaving}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        type={confirmModal.type}
      />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(139, 92, 246, 0.3); }
        
        @media (max-width: 640px) {
          .custom-scrollbar::-webkit-scrollbar { width: 0px; }
        }
      `}</style>
    </div>
  )
}

function AudioPlayer({ url, isMe }: { url: string, isMe: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) audioRef.current.pause()
    else audioRef.current.play()
    setIsPlaying(!isPlaying)
  }

  // Ensure absolute URL
  const audioUrl = url.startsWith('http') || url.startsWith('blob') 
    ? url 
    : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:8000'}${url}`

  return (
    <div className={cn(
      "mt-2 flex items-center gap-3 p-3 rounded-2xl min-w-[200px] sm:min-w-[240px]",
      isMe ? "bg-black/20" : "bg-zinc-800/40 border border-white/5"
    )}>
      <audio 
        ref={audioRef} 
        src={audioUrl} 
        onTimeUpdate={(e) => setProgress((e.currentTarget.currentTime / e.currentTarget.duration) * 100)}
        onEnded={() => { setIsPlaying(false); setProgress(0); }}
        className="hidden" 
      />
      <button 
        onClick={togglePlay}
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
          isMe ? "bg-white/20 text-white hover:bg-white/30" : "bg-violet-500 text-white hover:bg-violet-600"
        )}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      <div className="flex-1">
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
          <motion.div 
            className={cn("h-full", isMe ? "bg-white" : "bg-violet-500")}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between items-center">
          <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Neural Voice Note</span>
          <Volume2 className="w-3 h-3 opacity-20" />
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message, isMe, showAvatar = true, onReply, onViewResource }: { message: any, isMe: boolean, showAvatar?: boolean, onReply: () => void, onViewResource: (res: any) => void }) {
  const isAI = message.is_ai

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.5 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 80) onReply()
      }}
      className={cn(
        "flex items-start gap-3 sm:gap-4 max-w-full group",
        isMe ? 'flex-row-reverse' : '',
        !showAvatar ? 'mt-[-1rem]' : 'mt-0'
      )}
    >
      {showAvatar ? (
        <div className={cn(
          "w-8 h-8 sm:w-10 sm:h-10 rounded-2xl flex-shrink-0 flex items-center justify-center text-[10px] font-black uppercase ring-1 ring-white/10 shadow-2xl transition-all duration-500",
          isAI ? 'bg-gradient-to-br from-violet-600 via-fuchsia-600 to-indigo-600' : isMe ? 'bg-zinc-800' : 'bg-zinc-900'
        )}>
          {isAI ? <Sparkles className="w-5 h-5 text-white" /> : (message.author?.username?.[0] || 'U')}
        </div>
      ) : (
        <div className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0" />
      )}

      <div className={cn(
        "flex flex-col max-w-[85%] sm:max-w-[75%]",
        isMe ? 'items-end' : 'items-start'
      )}>
        {showAvatar && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
              {isAI ? 'FlowAI' : message.author?.username || 'Member'}
            </span>
            <div className="w-1 h-1 rounded-full bg-zinc-800" />
            <span className="text-[9px] text-zinc-700 font-bold uppercase tracking-widest">
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        {/* Reply Context Preview */}
        {message.parent_data && (
          <div className={cn(
            "mb-2 p-3 rounded-2xl bg-white/5 border-l-2 border-violet-500/50 max-w-xs",
            isMe ? "mr-4" : "ml-4"
          )}>
            <p className="text-[8px] font-black uppercase tracking-widest text-violet-400 mb-1">
              Replying to {message.parent_data.author_name}
            </p>
            <p className="text-[10px] text-zinc-500 italic truncate italic">
               "{message.parent_data.content}"
            </p>
          </div>
        )}

        <div className={cn(
          "relative px-5 py-3.5 rounded-3xl text-sm leading-relaxed shadow-2xl transition-all border group-hover:border-violet-500/30",
          isAI 
            ? 'bg-zinc-950/40 backdrop-blur-md border-violet-500/30 text-zinc-200 prose prose-invert prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/5' 
            : isMe 
              ? 'bg-violet-600 border-violet-500/50 text-white font-medium shadow-violet-600/20' 
              : 'bg-zinc-900/50 backdrop-blur-sm border-white/5 text-zinc-300'
        )}>
          {/* Quick Reply Button on Desktop Hover */}
          <button 
            onClick={onReply}
            className={cn(
              "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-[#111] border border-white/5 rounded-full shadow-2xl hover:text-violet-400",
              isMe ? "-left-14" : "-right-14"
            )}
            title="Reply"
          >
            <Reply className="w-4 h-4" />
          </button>

          {message.audio_file ? (
            <AudioPlayer url={message.audio_file} isMe={isMe} />
          ) : (
            <div className="prose-collab">
              <ReactMarkdown>
                {isAI ? message.content.split(/\bACTION\b/i)[0].trim() : message.content}
              </ReactMarkdown>
            </div>
          )}
          
          {message.pinned_resource_data && (
            <div 
              onClick={() => onViewResource(message.pinned_resource_data)}
              className="mt-4 p-4 bg-black/40 border border-white/10 rounded-2xl flex items-center gap-4 hover:bg-black/60 transition-all cursor-pointer group shadow-inner"
            >
              <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center ring-1 ring-white/5">
                <BookOpen className="w-5 h-5 text-violet-400" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[10px] font-black uppercase tracking-[0.1em] text-white truncate">{message.pinned_resource_data.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[8px] text-zinc-500 font-black uppercase tracking-tighter">Academic Resource</span>
                  <div className="w-0.5 h-0.5 rounded-full bg-zinc-700" />
                  <span className="text-[8px] text-violet-500/60 font-black uppercase">Linked</span>
                </div>
              </div>
              <Sparkles className="w-4 h-4 text-violet-500 opacity-40 group-hover:opacity-100 transition-opacity" />
            </div>
          )}

          {message.shared_assignment_data && (
            <div 
              className="mt-4 p-4 bg-violet-600/10 border border-violet-500/20 rounded-2xl flex flex-col gap-4 group/as shadow-xl"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-violet-500 rounded-xl flex items-center justify-center shadow-lg group-hover/as:scale-110 transition-transform">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-white truncate">{message.shared_assignment_data.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[8px] text-violet-400 font-black uppercase tracking-tighter">{message.shared_assignment_data.subject || 'SYNERGY'}</span>
                    <div className="w-0.5 h-0.5 rounded-full bg-violet-500/30" />
                    <span className="text-[8px] text-zinc-500 font-black uppercase">Shared Assignment</span>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={async () => {
                    try {
                      const res = await assignmentsApi.export(message.shared_assignment_data.id, 'pdf')
                      const url = window.URL.createObjectURL(new Blob([res.data]))
                      const link = document.createElement('a')
                      link.href = url
                      link.setAttribute('download', `${message.shared_assignment_data.title.replace(/\s+/g, '_')}.pdf`)
                      document.body.appendChild(link)
                      link.click()
                      link.remove()
                      toast.success('Intelligence exported (PDF)')
                    } catch {
                      toast.error('Failed to export PDF.')
                    }
                  }}
                  className="flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all"
                >
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button 
                  onClick={async () => {
                    try {
                      const res = await assignmentsApi.export(message.shared_assignment_data.id, 'docx')
                      const url = window.URL.createObjectURL(new Blob([res.data]))
                      const link = document.createElement('a')
                      link.href = url
                      link.setAttribute('download', `${message.shared_assignment_data.title.replace(/\s+/g, '_')}.docx`)
                      document.body.appendChild(link)
                      link.click()
                      link.remove()
                      toast.success('Intelligence exported (Word)')
                    } catch {
                      toast.error('Failed to export Word.')
                    }
                  }}
                  className="flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all"
                >
                  <CloudDownload className="w-3 h-3" /> Word
                </button>
              </div>
            </div>
          )}

          {message.is_optimistic && (
            <div className="absolute -bottom-5 right-0 flex items-center gap-1.5">
              <span className="text-[8px] font-black uppercase tracking-widest text-violet-500/50">Transmitting...</span>
              <div className="w-1 h-1 bg-violet-500 rounded-full animate-pulse" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
