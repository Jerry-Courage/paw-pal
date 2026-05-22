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
  Settings,
  MoreVertical,
  Pencil,
  Copy as CopyIcon,
  Pin as PinIcon,
  Paperclip,
  Video
} from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import { workspaceApi, libraryApi, assignmentsApi, getAuthToken, API_BASE } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import remarkGfm from 'remark-gfm'

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
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const qc = useQueryClient()

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
      // Instantly clear the unread badge on the workspace list
      qc.invalidateQueries({ queryKey: ['workspaces'] })
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
      // Always connect WS to the backend, not the frontend host
      const backendHost = (API_BASE || '').replace(/^https?:\/\//, '').replace(/\/api$/, '')
      const host = backendHost || (window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host)
      
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
                const optimistic = prev[optimisticIndex]
                // Preserve the blob: URL from the optimistic message so audio keeps playing
                // The server message may have a relative URL that fails to resolve
                const mergedMsg = { ...msg }
                if (optimistic.audio_file?.startsWith('blob:') && !msg.audio_file?.startsWith('http')) {
                  mergedMsg.audio_file = optimistic.audio_file
                }
                next[optimisticIndex] = mergedMsg
                return next
              }

              return [...prev, msg]
            })
          } else if (data.type === 'broadcast_typing') {
            setTypingUsers(prev => ({
              ...prev,
              [data.user]: data.is_typing
            }))
          } else if (data.type === 'broadcast_chat_message_edit') {
            const msg = data.message
            setMessages(prev => prev.map(m => String(m.id) === String(msg.id) ? { ...m, ...msg } : m))
          } else if (data.type === 'broadcast_chat_message_delete') {
            const msgId = data.message_id
            setMessages(prev => prev.filter(m => String(m.id) !== String(msgId)))
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

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
    ]
    for (const type of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }
    return 'audio/mpeg' // Fallback
  }

  const handleSendMessage = async (e?: React.FormEvent, audioBlob?: Blob) => {
    e?.preventDefault()
    if (!inputText.trim() && !audioBlob && !attachmentFile) return

    const tempText = inputText.trim()
    setInputText('')

    // --- Optimistic Update ---
    const optimisticId = `opt-${Date.now()}`
    const tempMsg = {
      id: optimisticId,
      content: tempText || (audioBlob ? "Voice Note" : "Attachment"),
      author: session?.user,
      created_at: new Date().toISOString(),
      is_ai: false,
      is_optimistic: true,
      audio_file: audioBlob ? URL.createObjectURL(audioBlob) : null,
      attachment: attachmentFile ? URL.createObjectURL(attachmentFile) : null,
      attachment_type: attachmentFile ? (attachmentFile.type.startsWith('video/') ? 'video' : 'image') : null
    }
    setMessages(prev => [...prev, tempMsg])
    
    const fileToSend = attachmentFile
    setAttachmentFile(null)

    try {
      let data: string | FormData = tempText
      if (audioBlob || fileToSend) {
        data = new FormData()
        data.append('content', tempText || (audioBlob ? "Voice Note" : "Attachment"))
        if (audioBlob) {
          // Use proper extension based on blob type
          const extension = audioBlob.type.includes('mp4') ? 'm4a' : 'webm'
          data.append('audio', audioBlob, `voice_note.${extension}`)
        }
        if (fileToSend) {
          data.append('attachment', fileToSend)
          data.append('attachment_type', fileToSend.type.startsWith('video/') ? 'video' : 'image')
        }
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
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
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
    <div className="flex items-center justify-center h-[100dvh] bg-[#0d0d0d]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-orange-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-orange-500 animate-spin" />
        </div>
        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-slate-500">Loading workspace...</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-full bg-[#0d0d0d] text-white overflow-hidden relative">
      
      {/* --- Main Chat Stage --- */}
      <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 sm:px-5 border-b border-white/5 bg-[#0d0d0d] z-20 flex-shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <button onClick={() => router.push('/workspace')} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors flex-shrink-0">
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            </button>
            <div className="w-7 h-7 bg-orange-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
               <LayoutGrid className="w-3.5 h-3.5 text-orange-500" />
            </div>
            <div className="overflow-hidden">
              <h1 className="text-sm font-semibold text-white truncate leading-tight">{workspace?.name || 'Collab Space'}</h1>
              <span className="text-[10px] text-slate-500 hidden sm:block truncate">{workspace?.subject || 'Collaboration'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Member avatars */}
            <div className="hidden md:flex items-center -space-x-1.5 mr-2">
              {workspace?.members?.slice(0, 4).map((m: any, i: number) => (
                <div key={i} className="relative w-6 h-6 rounded-full border-2 border-[#0d0d0d] bg-slate-700 flex items-center justify-center text-[9px] font-bold uppercase text-white">
                  {m.user?.username?.[0] || '?'}
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-[#0d0d0d]" />
                </div>
              ))}
              {(workspace?.members?.length || 0) > 4 && (
                <div className="w-6 h-6 rounded-full border-2 border-[#0d0d0d] bg-slate-800 flex items-center justify-center text-[9px] font-bold text-slate-400">
                  +{workspace.members.length - 4}
                </div>
              )}
            </div>

            {/* Invite code */}
            <button 
              onClick={copyInviteCode}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition-all"
            >
              <span className="text-[10px] font-bold text-slate-400 font-mono tracking-tight">{workspace?.invite_code}</span>
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500" />}
            </button>

            {/* Knowledge drawer button */}
            <button 
              onClick={() => setIsKnowledgeDrawerOpen(true)}
              className="p-2 bg-orange-500 rounded-lg hover:bg-orange-400 transition-all shadow-lg shadow-orange-500/20 active:scale-90"
            >
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </button>

            {/* Settings dropdown */}
            <div className="relative">
              <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="p-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition-all"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
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
                      initial={{ opacity: 0, scale: 0.95, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 8 }}
                      className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-white/8 rounded-xl shadow-2xl z-40 p-1.5 overflow-hidden"
                    >
                      {/* Mobile Invite Section */}
                      <div className="px-3 py-2.5 border-b border-white/5 mb-1.5 bg-white/[0.02]">
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Workspace Code</p>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            copyInviteCode();
                          }}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-2 bg-black/40 border border-white/8 rounded-lg hover:border-orange-500/30 transition-all group active:scale-[0.98]"
                        >
                          <span className="text-xs font-mono text-orange-500 font-bold tracking-wider">{workspace?.invite_code || '------'}</span>
                          {copied ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
                          )}
                        </button>
                      </div>

                      {workspace?.is_owner ? (
                        <button 
                          onClick={handleDeleteWorkspace}
                          disabled={isDeleting}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-all text-xs font-medium disabled:opacity-50"
                        >
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Delete workspace
                        </button>
                      ) : (
                        <button 
                          onClick={handleLeaveWorkspace}
                          disabled={isLeaving}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-slate-400 hover:bg-white/5 rounded-lg transition-all text-xs font-medium disabled:opacity-50"
                        >
                          {isLeaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                          Leave space
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
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-4 space-y-1 scroll-smooth custom-scrollbar"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
              <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] border border-white/5 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-slate-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-400">Start the conversation</p>
                <p className="text-xs text-slate-600 mt-1">Send a message or mention Flow for AI assistance</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((ms, i) => {
                const isMe = ms.author?.id === session?.user?.id
                const showAvatar = i === 0 || messages[i-1]?.author?.id !== ms.author?.id || messages[i-1]?.is_ai !== ms.is_ai
                const prevDate = i > 0 ? new Date(messages[i-1].created_at).toDateString() : null
                const currDate = new Date(ms.created_at).toDateString()
                const showDateSep = prevDate !== currDate
                const today = new Date().toDateString()
                const yesterday = new Date(Date.now() - 86400000).toDateString()
                const dateLabel = currDate === today ? 'Today' : currDate === yesterday ? 'Yesterday' : new Date(ms.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
                return (
                  <React.Fragment key={ms.id || i}>
                    {showDateSep && (
                      <div className="flex items-center gap-3 py-3">
                        <div className="flex-1 h-px bg-white/5" />
                        <span className="text-[10px] text-slate-600 font-medium px-2">{dateLabel}</span>
                        <div className="flex-1 h-px bg-white/5" />
                      </div>
                    )}
                    <MessageBubble 
                      message={ms} 
                      isMe={isMe} 
                      showAvatar={showAvatar}
                      workspaceId={Number(id)}
                      onReply={() => setReplyingTo({
                        id: ms.id,
                        author_name: ms.author?.username || 'User',
                        content: ms.content.substring(0, 60) + (ms.content.length > 60 ? '...' : '')
                      })}
                      onViewResource={(res: any) => {
                        setViewingResource(res)
                        setIsKnowledgeDrawerOpen(true)
                      }}
                    />
                  </React.Fragment>
                )
              })}
            </>
          )}
          <div className="h-2" />
        </div>

        {/* --- Input Area --- */}
        <div className="relative">
          <div className="absolute bottom-[calc(100%+4px)] left-0 right-0 px-4 sm:px-6 space-y-1.5 pointer-events-none">
            {/* Reply Context */}
            <AnimatePresence mode="wait">
              {replyingTo && (
                <motion.div 
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="pointer-events-auto bg-[#1a1a1a] border-l-2 border-l-orange-500 border border-white/8 rounded-xl p-3 flex items-center justify-between gap-3 shadow-xl"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <Reply className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-orange-500 mb-0.5">Replying to {replyingTo.author_name}</p>
                      <p className="text-xs text-slate-400 truncate italic">"{replyingTo.content}"</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setReplyingTo(null)}
                    className="p-1 hover:bg-white/5 rounded-md transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5 text-slate-500 hover:text-white transition-colors" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Typing Indicator */}
            <AnimatePresence>
              {Object.entries(typingUsers).filter(([_, isTyping]) => isTyping).length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-white/5 rounded-full w-fit shadow-lg"
                >
                  <div className="flex gap-0.5">
                    <span className="w-1 h-1 bg-orange-500 rounded-full animate-bounce" />
                    <span className="w-1 h-1 bg-orange-500 rounded-full animate-bounce [animation-delay:0.15s]" />
                    <span className="w-1 h-1 bg-orange-500 rounded-full animate-bounce [animation-delay:0.3s]" />
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {Object.entries(typingUsers)
                      .filter(([_, isTyping]) => isTyping)
                      .map(([user]) => user)
                      .join(", ")} {Object.entries(typingUsers).filter(([_, isTyping]) => isTyping).length > 1 ? 'are' : 'is'} typing
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="bg-[#0d0d0d] border-t border-white/5 px-4 sm:px-6 py-3">
            {attachmentFile && (
              <div className="max-w-4xl mx-auto mb-3 flex items-center gap-2">
                <div className="relative inline-block animate-in fade-in slide-in-from-bottom-2">
                  {attachmentFile.type.startsWith('video/') ? (
                    <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center border border-white/10 shadow-lg">
                      <Video className="w-6 h-6 text-slate-400" />
                    </div>
                  ) : (
                    <img src={URL.createObjectURL(attachmentFile)} className="w-16 h-16 rounded-xl object-cover border border-white/10 shadow-lg" />
                  )}
                  <button
                    onClick={() => setAttachmentFile(null)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 shadow-md text-white transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center gap-2.5">
              {/* Attachment button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 flex-shrink-0 bg-white/[0.03] text-slate-500 hover:text-orange-500 hover:bg-white/[0.06]"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    if (file.size > 50 * 1024 * 1024) {
                      toast.error("File size must be under 50MB")
                      return
                    }
                    setAttachmentFile(file)
                  }
                }}
              />

              {/* Mic button */}
              <button 
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 flex-shrink-0",
                  isRecording 
                    ? "bg-red-500 shadow-lg shadow-red-500/30 animate-pulse" 
                    : "bg-white/[0.03] text-slate-500 hover:text-orange-500 hover:bg-white/[0.06]"
                )}
              >
                {isRecording ? <Square className="w-3.5 h-3.5 fill-white text-white" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Input pill */}
              <div className="flex-1 relative flex items-center bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl transition-all group/input">
                <input 
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value)
                    handleUserTyping()
                  }}
                  placeholder={isRecording ? `Recording... ${recordingDuration}s` : replyingTo ? `Reply to ${replyingTo.author_name}...` : "Message or ask Flow..."}
                  disabled={isRecording}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm focus:outline-none placeholder:text-slate-600 disabled:opacity-50 min-w-0"
                />
                <button 
                  type="submit"
                  className="mr-1.5 w-7 h-7 bg-orange-500 rounded-xl flex items-center justify-center hover:bg-orange-400 transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  disabled={isRecording || !inputText.trim()}
                >
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </form>
            <p className="text-center text-[10px] text-slate-600 mt-2 max-w-4xl mx-auto">
              {isRecording ? "Tap mic to stop & send" : "Mention Flow for AI · Swipe message to reply"}
            </p>
          </div>
        </div>

      </div>

      {/* --- Knowledge Drawer --- */}
      <AnimatePresence>
        {isKnowledgeDrawerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsKnowledgeDrawerOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-full sm:max-w-sm bg-[#0d0d0d] border-l border-white/5 z-[70] flex flex-col"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5"
                style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-orange-500/10 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-3.5 h-3.5 text-orange-500" />
                  </div>
                  <h2 className="text-sm font-semibold text-white">
                    {viewingResource ? viewingResource.title : 'Knowledge Bank'}
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => { 
                      if (viewingResource) {
                        setViewingResource(null)
                      } else {
                        setIsKnowledgeDrawerOpen(false)
                      }
                    }} 
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-slate-300 hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="text-xs font-semibold">Back</span>
                  </button>
                </div>
              </div>

              {/* Hub Tab Switcher (Only when viewing) */}
              {viewingResource && (
                <div className="px-5 py-3 flex items-center gap-1.5 border-b border-white/5">
                  <button 
                    onClick={() => setHubTab('insights')}
                    className={cn(
                      "flex-1 py-2 text-xs font-medium rounded-lg transition-all",
                      hubTab === 'insights' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                    )}
                  >
                    AI Insights
                  </button>
                  <button 
                    onClick={() => setHubTab('source')}
                    className={cn(
                      "flex-1 py-2 text-xs font-medium rounded-lg transition-all",
                      hubTab === 'source' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
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
                      className="flex-1 flex flex-col p-5 space-y-4 overflow-hidden"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1 p-1 bg-[#1a1a1a] rounded-lg border border-white/5">
                          <button 
                            onClick={() => setHubView('shared')}
                            className={cn(
                              "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                              hubView === 'shared' ? "bg-[#0d0d0d] text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                            )}
                          >
                            Shared
                          </button>
                          <button 
                            onClick={() => setHubView('library')}
                            className={cn(
                              "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                              hubView === 'library' ? "bg-[#0d0d0d] text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                            )}
                          >
                            Library
                          </button>
                        </div>
                        {hubView === 'shared' && (
                          <button 
                            onClick={() => setHubView('library')}
                            className="p-1.5 bg-orange-500/10 text-orange-500 rounded-lg hover:bg-orange-500 hover:text-white transition-all"
                            title="Add from Library"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                        {hubView === 'shared' ? (
                          <>
                            {(workspace?.resources || []).length === 0 ? (
                              <div className="text-center py-12">
                                <BookOpen className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                                <p className="text-xs text-slate-500 font-medium">No shared resources yet</p>
                                <button 
                                  onClick={() => setHubView('library')}
                                  className="mt-3 text-xs text-orange-500 font-medium hover:text-orange-400 transition-colors"
                                >
                                  + Add from library
                                </button>
                              </div>
                            ) : (workspace.resources.map((res: any) => (
                              <div key={res.id} className="group relative">
                                <button 
                                  onClick={() => {
                                    setViewingResource(res)
                                    setHubTab('insights')
                                  }}
                                  className="w-full p-3.5 bg-[#1a1a1a] border border-white/5 rounded-xl transition-all text-left flex items-start gap-3 hover:border-orange-500/20 active:scale-[0.98]"
                                >
                                  <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <BookOpen className="w-3.5 h-3.5 text-orange-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-200 truncate">{res.title}</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5 capitalize">{res.resource_type || 'Note'}</p>
                                  </div>
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 flex-shrink-0 mt-0.5" />
                                </button>
                              </div>
                            )))}
                          </>
                        ) : (
                          <>
                            {libraryResources.filter(res => !workspace?.resources?.some((r: any) => r.id === res.id)).length === 0 ? (
                              <div className="text-center py-12">
                                <Check className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                                <p className="text-xs text-slate-500 font-medium px-6 leading-relaxed">All your library resources are already linked</p>
                              </div>
                            ) : libraryResources.filter(res => !workspace?.resources?.some((r: any) => r.id === res.id)).map((res) => (
                              <div key={res.id} className="group relative">
                                <div className="w-full p-3.5 bg-[#1a1a1a] border border-white/5 rounded-xl flex items-start gap-3">
                                  <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                                  </div>
                                  <div className="flex-1 min-w-0 pr-8">
                                    <p className="text-sm font-medium text-slate-400 truncate">{res.title}</p>
                                    <p className="text-[10px] text-slate-600 mt-0.5">In your library</p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => handleShareResource(res.id)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-orange-500/10 text-orange-500 rounded-lg group-hover:bg-orange-500 group-hover:text-white transition-all"
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
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
                        {hubTab === 'insights' ? (
                          <div>
                            {/* Resource header */}
                            <div className="mb-6">
                              <h3 className="text-base font-semibold text-white leading-tight mb-2">{viewingResource.title}</h3>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 text-[10px] font-medium rounded-md border border-orange-500/20 capitalize">
                                  {viewingResource.resource_type || 'Note'}
                                </span>
                              </div>
                            </div>

                            {/* AI Summary */}
                            {viewingResource.ai_summary && (
                              <div className="mb-6 p-4 bg-[#1a1a1a] border border-violet-500/15 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                  <span className="text-xs font-medium text-slate-400">AI Summary</span>
                                </div>
                                <div className="prose prose-invert prose-sm leading-relaxed text-slate-300 text-sm">
                                  <ReactMarkdown>{viewingResource.ai_summary}</ReactMarkdown>
                                </div>
                              </div>
                            )}

                            {/* Rich notes */}
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
                          <div className="h-[600px] w-full rounded-xl overflow-hidden border border-white/5 bg-[#1a1a1a]">
                            {viewingResource.file_url ? (
                              <PDFViewer fileUrl={viewingResource.file_url} title={viewingResource.title} />
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mb-3">
                                  <ExternalLink className="w-5 h-5 text-slate-600" />
                                </div>
                                <h4 className="text-sm font-medium text-white mb-1">Source unavailable</h4>
                                <p className="text-xs text-slate-500 max-w-[180px]">No PDF linked to this resource.</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action bar */}
                      <div className="p-5 border-t border-white/5 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <button 
                             onClick={() => {
                               const link = document.createElement('a')
                               link.href = viewingResource.file_url
                               link.download = viewingResource.title
                               link.click()
                             }}
                             className="py-2.5 bg-[#1a1a1a] border border-white/8 text-slate-300 rounded-xl text-xs font-medium hover:border-white/15 transition-all flex items-center justify-center gap-2"
                          >
                            <Download className="w-3.5 h-3.5 text-slate-500" />
                            Download
                          </button>
                          
                          {viewingResource.owner?.id !== session?.user?.id && (
                            <button 
                              onClick={handleCloneResource}
                              disabled={isCloning}
                              className={cn(
                                "py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2",
                                isCloning ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-orange-500 text-white hover:bg-orange-400 shadow-lg shadow-orange-500/20 active:scale-95"
                              )}
                            >
                              {isCloning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />}
                              {isCloning ? 'Saving...' : 'Save to Library'}
                            </button>
                          )}
                        </div>
                        
                        <button 
                          onClick={() => handleShareResource(viewingResource.id)}
                          className="w-full py-3 bg-[#1a1a1a] border border-orange-500/20 text-orange-500 rounded-xl text-xs font-medium hover:bg-orange-500/10 transition-all flex items-center justify-center gap-2"
                        >
                          <Pin className="w-3.5 h-3.5" />
                          Share to chat
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
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(249, 115, 22, 0.3); }
        
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
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const togglePlay = () => {
    if (!audioRef.current || error) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(e => {
        console.error('[AudioPlayer] play() failed:', e)
        setError(true)
      })
    }
  }

  // Resolve URL:
  // - blob: URLs → use as-is (optimistic user VN)
  // - data: URIs → use as-is (AI base64 voice note)
  // - http/https → use as-is (already absolute)
  // - relative /media/... → prepend backend origin
  const audioUrl = (() => {
    if (!url) return ''
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http')) return url
    // Derive backend base from NEXT_PUBLIC_API_URL (strip /api suffix)
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
    const backendBase = apiBase.replace(/\/api\/?$/, '')
    return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`
  })()

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div className={cn(
      "mt-2 flex items-center gap-2.5 p-2.5 rounded-2xl min-w-[180px] sm:min-w-[220px]",
      error ? "bg-red-500/10 border border-red-500/20" :
      isMe ? "bg-black/20" : "bg-[#0d0d0d] border border-white/5"
    )}>
      <audio
        ref={audioRef}
        src={audioUrl}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onTimeUpdate={e => {
          const el = e.currentTarget
          if (el.duration) setProgress((el.currentTime / el.duration) * 100)
        }}
        onEnded={() => { setIsPlaying(false); setProgress(0) }}
        onError={e => { console.error('[AudioPlayer] load error:', audioUrl, e); setError(true) }}
        preload="metadata"
        className="hidden"
      />
      <button
        onClick={togglePlay}
        disabled={error}
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0",
          error ? "bg-red-500/20 text-red-400 cursor-not-allowed" :
          isMe ? "bg-white/20 text-white hover:bg-white/30" : "bg-orange-500 text-white hover:bg-orange-400 shadow-sm shadow-orange-500/30"
        )}
      >
        {error ? <span className="text-[8px] font-bold">ERR</span> :
         isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden cursor-pointer"
          onClick={e => {
            if (!audioRef.current || error) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            audioRef.current.currentTime = pct * audioRef.current.duration
          }}>
          <div className={cn("h-full rounded-full transition-all", isMe ? "bg-white/70" : "bg-orange-500")}
            style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1 flex justify-between items-center">
          <span className="text-[9px] text-slate-500">
            {error ? 'Failed to load' : 'Voice note'}
          </span>
          {duration > 0 && <span className="text-[9px] text-slate-600 font-mono">{formatTime(duration)}</span>}
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ 
  message, 
  isMe, 
  showAvatar = true, 
  onReply, 
  onViewResource,
  workspaceId
}: { 
  message: any, 
  isMe: boolean, 
  showAvatar?: boolean, 
  onReply: () => void, 
  onViewResource: (res: any) => void,
  workspaceId: number
}) {
  const isAI = message.is_ai
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)

  // Handle outside click to close menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    if (isMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  const handleLongPress = () => {
    setIsMenuOpen(true)
    if (window.navigator.vibrate) window.navigator.vibrate(50)
  }

  const handleEdit = async () => {
    if (!editText.trim() || editText === message.content) {
      setIsEditing(false)
      return
    }
    try {
      await workspaceApi.editMessage(workspaceId, message.id, editText)
      setIsEditing(false)
    } catch (err) {
      toast.error('Failed to edit message')
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await workspaceApi.deleteMessage(workspaceId, message.id)
      toast.success('Message deleted')
    } catch (err) {
      toast.error('Failed to delete message')
      setIsDeleting(false)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content)
    toast.success('Copied to clipboard')
    setIsMenuOpen(false)
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.4 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 70) onReply()
      }}
      onPointerDown={() => {
        longPressTimer.current = setTimeout(handleLongPress, 500)
      }}
      onPointerUp={() => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current)
      }}
      onPointerLeave={() => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current)
      }}
      className={cn(
        "flex items-end gap-2 max-w-full group relative",
        isMe ? 'flex-row-reverse' : '',
        !showAvatar ? 'mt-0.5' : 'mt-3'
      )}
    >
      {/* Avatar */}
      {showAvatar ? (
        <div className={cn(
          "w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold uppercase mb-0.5",
          isAI ? 'bg-gradient-to-br from-violet-600 to-indigo-600' : isMe ? 'bg-orange-500' : 'bg-slate-700'
        )}>
          {isAI ? <Sparkles className="w-3.5 h-3.5 text-white" /> : (message.author?.username?.[0] || 'U')}
        </div>
      ) : (
        <div className="w-7 flex-shrink-0" />
      )}

      <div className={cn(
        "flex flex-col max-w-[85%] sm:max-w-[70%]",
        isMe ? 'items-end' : 'items-start'
      )}>
        {/* Sender name + time */}
        {showAvatar && (
          <div className={cn("flex items-center gap-1.5 mb-1 px-1", isMe ? 'flex-row-reverse' : '')}>
            <span className="text-[11px] font-medium text-slate-400">
              {isAI ? 'Flow AI' : message.author?.username || 'Member'}
            </span>
            <span className="text-[10px] text-slate-600">
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {message.is_edited && <span className="ml-1 text-[9px] opacity-50">(edited)</span>}
            </span>
          </div>
        )}

        {/* Reply preview */}
        {message.parent_data && (
          <div className={cn(
            "mb-1.5 px-3 py-2 rounded-xl bg-white/5 border-l-2 border-orange-500/50 max-w-xs",
            isMe ? "mr-2" : "ml-2"
          )}>
            <p className="text-[10px] font-medium text-orange-500 mb-0.5">
              {message.parent_data.author_name}
            </p>
            <p className="text-[11px] text-slate-500 italic truncate">
               "{message.parent_data.content}"
            </p>
          </div>
        )}

        {/* Bubble */}
        <div className={cn(
          "relative px-4 py-2.5 text-sm leading-relaxed shadow-lg transition-all duration-200",
          isAI 
            ? 'bg-[#1a1a1a] border-l-2 border-violet-500/40 text-slate-200 rounded-2xl rounded-tl-sm' 
            : isMe 
              ? 'bg-orange-500/10 border-r-2 border-orange-500/40 text-white rounded-2xl rounded-tr-sm font-medium' 
              : 'bg-white/[0.03] text-slate-200 rounded-2xl rounded-tl-sm',
          isDeleting && "opacity-40 grayscale pointer-events-none"
        )}>
          
          {/* Action Menu Trigger (Desktop 3-dots) */}
          {!isAI && !isEditing && (
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-[#1a1a1a] border border-white/5 text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100 hidden sm:block shadow-xl z-20",
                isMe ? "-left-10" : "-right-10"
              )}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Context Menu Dropdown */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div 
                ref={menuRef}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                  "absolute bottom-full mb-2 w-36 bg-[#1a1a1a] border border-white/8 rounded-xl shadow-2xl z-[100] p-1 overflow-hidden",
                  isMe ? "right-0" : "left-0"
                )}
              >
                <button 
                  onClick={copyToClipboard}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-slate-300 hover:bg-white/5 rounded-lg transition-all"
                >
                  <CopyIcon className="w-3 h-3" /> Copy text
                </button>
                {isMe && !message.audio_file && (
                  <button 
                    onClick={() => { setIsEditing(true); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-slate-300 hover:bg-white/5 rounded-lg transition-all"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                )}
                <button 
                  onClick={onReply}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-slate-300 hover:bg-white/5 rounded-lg transition-all"
                >
                  <Reply className="w-3 h-3" /> Reply
                </button>
                {(isMe || message.is_owner) && (
                  <button 
                    onClick={() => { handleDelete(); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {isEditing ? (
            <div className="flex flex-col gap-2 min-w-[150px] sm:min-w-[200px] py-1">
              <textarea 
                autoFocus
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit(); }
                  if (e.key === 'Escape') setIsEditing(false)
                }}
                className="w-full bg-black/40 border border-orange-500/30 rounded-xl px-3 py-2 text-sm text-white focus:outline-none min-h-[60px]"
              />
              <div className="flex justify-end gap-1.5">
                <button onClick={() => setIsEditing(false)} className="px-2.5 py-1 text-[10px] text-slate-500 hover:text-slate-300">Cancel</button>
                <button onClick={handleEdit} className="px-3 py-1 text-[10px] bg-orange-500 text-white rounded-lg hover:bg-orange-400">Save</button>
              </div>
            </div>
          ) : (message.audio_file || message.audio_data) ? (
            <AudioPlayer url={message.audio_data || message.audio_file} isMe={isMe} />
          ) : (
            <>
              {message.attachment && (
                <div className="mb-2 max-w-sm overflow-hidden rounded-xl border border-white/10">
                  {message.attachment_type === 'video' ? (
                    <video src={message.attachment} controls className="w-full h-auto max-h-[300px] object-contain bg-black/40" />
                  ) : (
                    <img src={message.attachment} alt="Attachment" className="w-full h-auto max-h-[300px] object-contain bg-black/40 cursor-zoom-in" onClick={() => window.open(message.attachment, '_blank')} />
                  )}
                </div>
              )}
              {message.content && (
                <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/5">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({children}) => <h1 className="text-base font-bold text-white mt-4 mb-2">{children}</h1>,
                      h2: ({children}) => <h2 className="text-sm font-bold text-white mt-4 mb-2">{children}</h2>,
                      h3: ({children}) => <h3 className="text-[13px] font-bold text-slate-200 mt-3 mb-1">{children}</h3>,
                      ul: ({children}) => <ul className="list-disc pl-4 space-y-1 mb-3">{children}</ul>,
                      ol: ({children}) => <ol className="list-decimal pl-4 space-y-1 mb-3">{children}</ol>,
                      li: ({children}) => <li className="text-[13px] text-slate-300 leading-normal">{children}</li>,
                      table: ({children}) => (
                        <div className="my-4 overflow-x-auto rounded-xl border border-white/5 bg-black/20">
                          <table className="w-full text-left border-collapse text-[12px]">{children}</table>
                        </div>
                      ),
                      thead: ({children}) => <thead className="bg-white/5 text-slate-400 font-semibold">{children}</thead>,
                      th: ({children}) => <th className="px-3 py-2 border-b border-white/5">{children}</th>,
                      td: ({children}) => <td className="px-3 py-2 border-b border-white/5 text-slate-300">{children}</td>,
                      p: ({children}) => <p className="mb-3 last:mb-0 text-[13px] text-slate-300 leading-relaxed">{children}</p>,
                    }}
                  >
                    {isAI ? message.content.split(/\bACTION\b/i)[0].trim() : message.content}
                  </ReactMarkdown>
                </div>
              )}
            </>
          )}
          
          {/* Pinned resource card */}
          {message.pinned_resource_data && (
            <div 
              onClick={() => onViewResource(message.pinned_resource_data)}
              className="mt-3 p-3 bg-black/30 border border-white/5 rounded-xl flex items-center gap-3 hover:border-orange-500/20 transition-all cursor-pointer group/res"
            >
              <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-3.5 h-3.5 text-orange-500" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-medium text-white truncate">{message.pinned_resource_data.title}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 capitalize">{message.pinned_resource_data.resource_type || 'Resource'}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover/res:text-orange-500 transition-colors flex-shrink-0" />
            </div>
          )}

          {/* Shared assignment card */}
          {message.shared_assignment_data && (
            <div className="mt-3 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-medium text-white truncate">{message.shared_assignment_data.title}</p>
                  <p className="text-[10px] text-violet-400 mt-0.5">{message.shared_assignment_data.subject || 'Assignment'}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-1.5">
                <button 
                  onClick={async () => {
                    try {
                      toast.loading('Fetching intelligence...', { id: 'export-toast' })
                      const res = await assignmentsApi.get(message.shared_assignment_data.id)
                      const a = res.data
                      toast.loading('Generating perfectly formatted PDF...', { id: 'export-toast' })
                      const { exportAssignment } = await import('@/lib/exportUtils')
                      await exportAssignment('pdf', a.title, a.ai_response || '', a.subject || 'General')
                      toast.dismiss('export-toast')
                    } catch {
                      toast.error('Failed to export PDF.', { id: 'export-toast' })
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg text-[10px] font-medium text-slate-400 hover:text-white transition-all"
                >
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button 
                  onClick={async () => {
                    try {
                      toast.loading('Fetching intelligence...', { id: 'export-toast' })
                      const res = await assignmentsApi.get(message.shared_assignment_data.id)
                      const a = res.data
                      const { exportAssignment } = await import('@/lib/exportUtils')
                      await exportAssignment('docx', a.title, a.ai_response || '', a.subject || 'General')
                      toast.dismiss('export-toast')
                    } catch {
                      toast.error('Failed to export Word.', { id: 'export-toast' })
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg text-[10px] font-medium text-slate-400 hover:text-white transition-all"
                >
                  <CloudDownload className="w-3 h-3" /> Word
                </button>
              </div>
            </div>
          )}

          {/* Optimistic sending indicator */}
          {message.is_optimistic && (
            <div className="absolute -bottom-4 right-0 flex items-center gap-1">
              <span className="text-[9px] text-slate-600">Sending</span>
              <div className="flex gap-0.5">
                <span className="w-0.5 h-0.5 bg-slate-600 rounded-full animate-bounce" />
                <span className="w-0.5 h-0.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-0.5 h-0.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
