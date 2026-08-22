'use client'
import dynamic from 'next/dynamic'

import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  Video,
  SmilePlus,
  Hash,
  MessageCircle,
  Wifi
} from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import StageNavigator from '@/components/workspace/StageNavigator'
import { workspaceApi, libraryApi, assignmentsApi, getAuthToken, API_BASE } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import remarkGfm from 'remark-gfm'

const RichNotesViewer = dynamic(() => import('@/components/library/RichNotesViewer'), { ssr: false })
const PDFViewer = dynamic(() => import('@/components/library/PDFViewer'), { ssr: false })
const ConfirmationModal = dynamic(() => import('@/components/ui/ConfirmationModal'), { ssr: false })

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '💡', '👀', '💪']

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

  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({})
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isMobileResourceOpen, setIsMobileResourceOpen] = useState(false)
  const [currentStage, setCurrentStage] = useState<'ingest' | 'synthesize' | 'master'>('ingest')
  const reactionPickerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setReactionPickerMessageId(null)
      }
    }
    if (reactionPickerMessageId) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [reactionPickerMessageId])

  const fetchWorkspace = async () => {
    try {
      const res = await workspaceApi.get(Number(id))
      setWorkspace(res.data)
      setMessages(res.data.messages || [])
      setIsLoading(false)
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    } catch (err) {
      console.error(err)
    }
  }

  const fetchLibrary = async () => {
    try {
      const res = await libraryApi.getResources()
      const resources = Array.isArray(res.data) ? res.data : res.data.results || []
      setLibraryResources(resources)
    } catch (err) {
      console.error(err)
    }
  }

  const connectingPromiseRef = useRef<Promise<void> | null>(null)
  
  const connectWebSocket = async () => {
    if (connectingPromiseRef.current) {
      return await connectingPromiseRef.current
    }
    if (socketRef.current?.readyState === WebSocket.CONNECTING || 
        socketRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    connectingPromiseRef.current = (async () => {
      if (socketRef.current) {
        socketRef.current.onclose = null
        socketRef.current.close()
        socketRef.current = null
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
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
            const msg = data
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
          } else if (data.type === 'presence_update') {
            setOnlineUsers(new Set(data.online_users || []))
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
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ]
    for (const type of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }
    return ''
  }

  const handleSendMessage = async (e?: React.FormEvent, audioBlob?: Blob) => {
    e?.preventDefault()
    if (!inputText.trim() && !audioBlob && !attachmentFile) return

    const tempText = inputText.trim()
    setInputText('')

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
          const extension = audioBlob.type.includes('mp4') ? 'm4a' : 'webm'
          data.append('audio', audioBlob, `voice_note.${extension}`)
        }
        if (fileToSend) {
          data.append('attachment', fileToSend)
          data.append('attachment_type', fileToSend.type.startsWith('video/') ? 'video' : 'image')
        }
      }
      
      const response = await workspaceApi.sendMessage(Number(id), data, replyingTo?.id)
      setReplyingTo(null)
    } catch (err) {
      console.error(err)
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
    }
  }

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Microphone not supported in this browser. Try Chrome or Firefox.')
        return
      }
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        toast.error('Microphone requires a secure connection (HTTPS). Please use the app over HTTPS.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedMimeType()
      let recorder: MediaRecorder
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream)
      } catch {
        recorder = new MediaRecorder(stream)
      }
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        setTimeout(() => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          chunksRef.current = []
          handleSendMessage(undefined, blob)
          stream.getTracks().forEach(t => t.stop())
        }, 0)
      }
      recorder.start(250)
      setIsRecording(true)
      setRecordingDuration(0)
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
    } catch (err: any) {
      console.error('Recording failed', err)
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        toast.error('Microphone access denied. Please allow microphone permission in your browser settings and try again.')
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        toast.error('No microphone found. Please connect a microphone and try again.')
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        toast.error('Microphone is in use by another app. Close other apps using the mic and try again.')
      } else {
        toast.error('Could not start recording. Please check your microphone and try again.')
      }
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.stop()
      recorderRef.current = null
      setIsRecording(false)
      clearInterval(timerRef.current)
    }
  }

  const handleShareResource = async (resourceId: number) => {
    try {
      await workspaceApi.shareResource(Number(id), resourceId)
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
      toast.success('Invite code copied!')
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

  const handleReact = useCallback((messageId: string, emoji: string) => {
    const userId = session?.user?.id || 'me'
    setReactions(prev => {
      const msgReactions = { ...(prev[messageId] || {}) }
      const users = [...(msgReactions[emoji] || [])]
      const idx = users.indexOf(userId)
      if (idx !== -1) {
        users.splice(idx, 1)
        if (users.length === 0) delete msgReactions[emoji]
        else msgReactions[emoji] = users
      } else {
        msgReactions[emoji] = [...users, userId]
      }
      return { ...prev, [messageId]: msgReactions }
    })
  }, [session?.user?.id])

  const filteredMessages = searchQuery.trim()
    ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

  if (isLoading) return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
        </div>
        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-on-surface-variant/60">Loading workspace...</p>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-on-surface overflow-hidden">

      {/* ═══════════════ HEADER ═══════════════ */}
      <header className="h-14 flex items-center justify-between px-4 sm:px-5 border-b border-outline-variant/20 bg-background z-20 flex-shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <button onClick={() => router.push('/workspace')} className="p-1.5 hover:bg-surface-container-high rounded-lg transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ChevronLeft className="w-4 h-4 text-on-surface-variant" />
          </button>
          <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <LayoutGrid className="w-3.5 h-3.5 text-primary-container" />
          </div>
          <div className="overflow-hidden">
            <h1 className="text-sm font-semibold text-on-surface truncate leading-tight">{workspace?.name || 'Collab Space'}</h1>
            <span className="text-[10px] text-on-surface-variant/60 hidden sm:block truncate">{workspace?.subject || 'Collaboration'}</span>
          </div>
        </div>

        {/* Center: Stage Navigator */}
        <div className="hidden lg:flex flex-1 justify-center px-4">
          <StageNavigator currentStage={currentStage} onStageChange={setCurrentStage} />
        </div>

        <div className="flex items-center gap-1.5">
          {/* Member avatars */}
          <div className="hidden md:flex items-center -space-x-1.5 mr-2">
            {workspace?.members?.slice(0, 4).map((m: any, i: number) => (
              <div key={i} className="relative w-6 h-6 rounded-full border-2 border-background bg-slate-700 flex items-center justify-center text-[9px] font-bold uppercase text-on-surface">
                {m.user?.username?.[0] || '?'}
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background",
                  onlineUsers.has(String(m.user?.id)) ? "bg-emerald-500" : "bg-gray-500"
                )} />
              </div>
            ))}
            {(workspace?.members?.length || 0) > 4 && (
              <div className="w-6 h-6 rounded-full border-2 border-background bg-surface-container flex items-center justify-center text-[9px] font-bold text-on-surface-variant">
                +{workspace.members.length - 4}
              </div>
            )}
          </div>

          {/* Search toggle */}
          <button 
            onClick={() => { setIsSearchOpen(!isSearchOpen); if (isSearchOpen) setSearchQuery('') }}
            className={cn(
              "p-2 rounded-xl transition-all min-w-[44px] min-h-[44px] flex items-center justify-center",
              isSearchOpen ? "bg-primary-container text-on-surface" : "bg-surface-container/40 hover:bg-surface-container/60 text-on-surface-variant"
            )}
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Invite code */}
          <button 
            onClick={copyInviteCode}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-surface-container/40 hover:bg-surface-container/60 rounded-xl transition-all min-h-[44px]"
          >
            <span className="text-[10px] font-bold text-on-surface-variant font-mono tracking-tight">{workspace?.invite_code}</span>
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-on-surface-variant/60" />}
          </button>

          {/* Knowledge bank button */}
          <button 
            onClick={() => setIsKnowledgeDrawerOpen(true)}
            className="p-2 bg-primary-container rounded-lg hover:bg-primary-container/80 transition-all shadow-lg shadow-primary/20 active:scale-90 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <BookOpen className="w-3.5 h-3.5 text-on-surface" />
          </button>

          {/* Settings dropdown */}
          <div className="relative">
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-2 bg-surface-container/40 hover:bg-surface-container/60 rounded-xl transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Settings className="w-3.5 h-3.5 text-on-surface-variant" />
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
                    className="absolute right-0 mt-2 w-48 bg-surface-container-high border border-outline-variant/40 rounded-xl shadow-2xl z-40 p-1.5 overflow-hidden"
                  >
                    <div className="px-3 py-2.5 border-b border-outline-variant/25 mb-1.5 bg-surface-container/40">
                      <p className="text-[9px] font-bold text-on-surface-variant/60 uppercase tracking-wider mb-2">Workspace Code</p>
                      <button 
                        onClick={(e) => { e.stopPropagation(); copyInviteCode(); }}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 bg-black/40 border border-outline-variant/40 rounded-lg hover:border-primary/30 transition-all group active:scale-[0.98]"
                      >
                        <span className="text-xs font-mono text-primary-container font-bold tracking-wider">{workspace?.invite_code || '------'}</span>
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-on-surface-variant/60 group-hover:text-on-surface/80 transition-colors" />}
                      </button>
                    </div>
                    <button 
                      onClick={() => { setIsSearchOpen(!isSearchOpen); setIsSettingsOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-all text-xs font-medium sm:hidden"
                    >
                      <Search className="w-3.5 h-3.5" /> Search messages
                    </button>
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
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-all text-xs font-medium disabled:opacity-50"
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

      {/* ═══════════════ SEARCH BAR ═══════════════ */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-outline-variant/20 bg-surface-container-low overflow-hidden flex-shrink-0"
          >
            <div className="px-4 sm:px-8 py-2.5 flex items-center gap-3">
              <Search className="w-4 h-4 text-on-surface-variant/60 flex-shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setIsSearchOpen(false); setSearchQuery('') } }}
                placeholder="Search messages..."
                className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
              />
              {searchQuery.trim() && (
                <span className="text-[10px] text-on-surface-variant/60 font-medium whitespace-nowrap">
                  {filteredMessages.length} result{filteredMessages.length !== 1 ? 's' : ''}
                </span>
              )}
              <button
                onClick={() => { setIsSearchOpen(false); setSearchQuery('') }}
                className="p-1.5 hover:bg-surface-container-high rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2"
              >
                <X className="w-4 h-4 text-on-surface-variant/60" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════ 3-COLUMN BODY ═══════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT PANEL: Resources (w-56) ── */}
        <aside className="hidden md:flex w-56 flex-shrink-0 flex-col bg-surface-container border-r border-outline-variant/20 overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <span className="text-xs font-bold tracking-widest uppercase text-primary">Resources</span>
            <button
              onClick={() => setIsKnowledgeDrawerOpen(true)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-surface-container-low border border-outline-variant/30 hover:bg-surface-container-high transition-colors"
              title="Add resource"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Resource cards */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 custom-scrollbar">
            {(workspace?.resources || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
                <BookOpen className="w-8 h-8 text-on-surface-variant/30" />
                <p className="text-[11px] text-on-surface-variant/50 leading-relaxed">No resources yet. Add from your library.</p>
              </div>
            ) : (workspace?.resources || []).map((res: any) => (
              <button
                key={res.id}
                onClick={() => { setViewingResource(res); setHubTab('insights'); setIsKnowledgeDrawerOpen(true) }}
                className="w-full flex items-center gap-3 p-3 bg-surface-container-low border border-outline-variant/30 rounded-[1rem] hover:bg-surface-container-high transition-colors text-left group min-h-[44px]"
              >
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-3.5 h-3.5 text-primary-container" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-on-surface truncate leading-tight">{res.title}</p>
                  <p className="text-[10px] text-on-surface-variant/50 capitalize mt-0.5">{res.resource_type || 'Note'}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-on-surface-variant/30 group-hover:text-on-surface-variant transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>

          {/* Add from Library button */}
          <div className="p-3 border-t border-outline-variant/20">
            <button
              onClick={() => { setHubView('library'); setIsKnowledgeDrawerOpen(true) }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[1rem] bg-surface-container-low border border-outline-variant/30 hover:bg-surface-container-high transition-colors text-[11px] font-semibold text-on-surface-variant min-h-[44px]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add from Library
            </button>
          </div>
        </aside>

        {/* ── CENTER PANEL: Collaborative Chat ── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Message stream */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-8 py-6 space-y-1 scroll-smooth custom-scrollbar">
            {/* Doc title */}
            <div className="mb-6">
              <h2 className="text-[28px] font-bold text-on-surface leading-tight">{workspace?.name || 'Collab Space'}</h2>
              {workspace?.subject && <p className="text-sm text-on-surface-variant/60 mt-1">{workspace.subject}</p>}
            </div>

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/15 to-primary-container/10 border border-primary/20 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-primary-container" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Wifi className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>
                <div className="text-center max-w-xs">
                  <p className="text-sm font-semibold text-on-surface mb-1">Start collaborating</p>
                  <p className="text-xs text-on-surface-variant/50 leading-relaxed">Send a message to kick things off, or mention @Flow for AI-powered help.</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <button
                    onClick={() => { setInputText(''); document.querySelector<HTMLInputElement>('input[placeholder*="Message"]')?.focus() }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary-container text-on-surface rounded-xl text-xs font-semibold hover:bg-primary transition-all active:scale-95 min-h-[44px]"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Send a message
                  </button>
                  <button
                    onClick={() => { setInputText('@Flow '); document.querySelector<HTMLInputElement>('input[placeholder*="Message"]')?.focus() }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-tertiary-container/15 border border-tertiary-container/25 text-on-surface rounded-xl text-xs font-semibold hover:bg-tertiary-container/25 transition-all active:scale-95 min-h-[44px]"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    Mention @Flow
                  </button>
                  <button
                    onClick={() => setIsKnowledgeDrawerOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-high border border-outline-variant/30 text-on-surface-variant rounded-xl text-xs font-semibold hover:bg-surface-container-highest transition-all active:scale-95 min-h-[44px]"
                  >
                    <ShareIcon className="w-3.5 h-3.5" />
                    Share a resource
                  </button>
                </div>
              </div>
            ) : (
              <>
                {(searchQuery.trim() ? filteredMessages : messages).map((ms, i) => {
                  const allMsgs = searchQuery.trim() ? filteredMessages : messages
                  const isMe = String(ms.author?.id) === String(session?.user?.id)
                  const showAvatar = i === 0 || allMsgs[i-1]?.author?.id !== ms.author?.id || allMsgs[i-1]?.is_ai !== ms.is_ai
                  const prevDate = i > 0 ? new Date(allMsgs[i-1].created_at).toDateString() : null
                  const currDate = new Date(ms.created_at).toDateString()
                  const showDateSep = prevDate !== currDate
                  const today = new Date().toDateString()
                  const yesterday = new Date(Date.now() - 86400000).toDateString()
                  const dateLabel = currDate === today ? 'Today' : currDate === yesterday ? 'Yesterday' : new Date(ms.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
                  return (
                    <React.Fragment key={ms.id || i}>
                      {showDateSep && (
                        <div className="flex items-center gap-3 py-3">
                          <div className="flex-1 h-px bg-outline-variant/25" />
                          <span className="text-[10px] text-on-surface-variant/40 font-medium px-2">{dateLabel}</span>
                          <div className="flex-1 h-px bg-outline-variant/25" />
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
                        reactions={reactions[String(ms.id)] || {}}
                        onReact={handleReact}
                      />
                    </React.Fragment>
                  )
                })}
              </>
            )}
            {searchQuery.trim() && filteredMessages.length === 0 && messages.length > 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Search className="w-8 h-8 text-on-surface-variant/30" />
                <p className="text-sm text-on-surface-variant/60">No messages match "{searchQuery}"</p>
              </div>
            )}
            <div className="h-2" />
          </div>

          {/* ── Input Area ── */}
          <div className="relative">
            <div className="absolute bottom-[calc(100%+4px)] left-0 right-0 px-4 sm:px-8 space-y-1.5 pointer-events-none">
              <AnimatePresence mode="wait">
                {replyingTo && (
                  <motion.div 
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="pointer-events-auto bg-surface-container-high border-l-2 border-l-primary border border-outline-variant/40 rounded-xl p-3 flex items-center justify-between gap-3 shadow-xl"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <Reply className="w-3.5 h-3.5 text-primary-container flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-primary-container mb-0.5">Replying to {replyingTo.author_name}</p>
                        <p className="text-xs text-on-surface-variant truncate italic">"{replyingTo.content}"</p>
                      </div>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-surface-container-high rounded-md transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center">
                      <X className="w-3.5 h-3.5 text-on-surface-variant/60 hover:text-on-surface transition-colors" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {Object.entries(typingUsers).filter(([_, isTyping]) => isTyping).length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-high border border-outline-variant/25 rounded-full w-fit shadow-lg"
                  >
                    <div className="flex gap-0.5">
                      <span className="w-1 h-1 bg-primary-container rounded-full animate-bounce" />
                      <span className="w-1 h-1 bg-primary-container rounded-full animate-bounce [animation-delay:0.15s]" />
                      <span className="w-1 h-1 bg-primary-container rounded-full animate-bounce [animation-delay:0.3s]" />
                    </div>
                    <span className="text-[10px] text-on-surface-variant/60">
                      {Object.entries(typingUsers).filter(([_, isTyping]) => isTyping).map(([user]) => user).join(", ")} {Object.entries(typingUsers).filter(([_, isTyping]) => isTyping).length > 1 ? 'are' : 'is'} typing
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="bg-surface-container-low border-t border-outline-variant/20 px-4 sm:px-8 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              {attachmentFile && (
                <div className="max-w-4xl mx-auto mb-3 flex items-center gap-2">
                  <div className="relative inline-block animate-in fade-in slide-in-from-bottom-2">
                    {attachmentFile.type.startsWith('video/') ? (
                      <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center border border-outline-variant/50 shadow-lg">
                        <Video className="w-6 h-6 text-on-surface-variant" />
                      </div>
                    ) : (
                      <img src={URL.createObjectURL(attachmentFile)} className="w-16 h-16 rounded-xl object-cover border border-outline-variant/50 shadow-lg" />
                    )}
                    <button onClick={() => setAttachmentFile(null)} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 shadow-md text-white transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
              <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 flex-shrink-0 bg-surface-container/40 text-on-surface-variant/60 hover:text-primary-container hover:bg-surface-container/60"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      if (file.size > 50 * 1024 * 1024) { toast.error("File size must be under 50MB"); return }
                      setAttachmentFile(file)
                    }
                  }}
                />
                <button 
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 flex-shrink-0",
                    isRecording ? "bg-red-500 shadow-lg shadow-red-500/30 animate-pulse" : "bg-surface-container/40 text-on-surface-variant/60 hover:text-primary-container hover:bg-surface-container/60"
                  )}
                >
                  {isRecording ? <Square className="w-3.5 h-3.5 fill-white text-white" /> : <Mic className="w-4 h-4" />}
                </button>
                <div className="flex-1 relative flex items-center bg-surface-container-highest border-2 border-transparent focus-within:border-tertiary-container rounded-full transition-all">
                  <input 
                    value={inputText}
                    onChange={(e) => { setInputText(e.target.value); handleUserTyping() }}
                    placeholder={isRecording ? `Recording... ${recordingDuration}s` : replyingTo ? `Reply to ${replyingTo.author_name}...` : "Message or ask @Flow..."}
                    disabled={isRecording}
                    className="flex-1 bg-transparent px-4 py-2.5 text-sm focus:outline-none placeholder:text-on-surface-variant/40 disabled:opacity-50 min-w-0"
                  />
                  <button 
                    type="submit"
                    className="mr-1.5 w-10 h-10 bg-tertiary rounded-full flex items-center justify-center hover:opacity-90 transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 text-on-tertiary-container"
                    disabled={isRecording || !inputText.trim()}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
              <p className="text-center text-[10px] text-on-surface-variant/40 mt-2 max-w-4xl mx-auto">
                {isRecording ? "Tap mic to stop & send" : "Mention @Flow for AI · Swipe message to reply"}
              </p>
            </div>
          </div>
        </main>

        {/* ── RIGHT PANEL: Members & Stats (w-64) ── */}
        <aside className="hidden md:flex w-64 flex-shrink-0 flex-col bg-surface-container border-l border-outline-variant/20 overflow-hidden">
          {/* Stats section */}
          <div className="px-4 pt-5 pb-3 border-b border-outline-variant/20">
            <p className="text-[10px] font-bold tracking-widest uppercase text-primary mb-3">Workspace</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-1 p-2 bg-surface-container-low rounded-xl border border-outline-variant/15">
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-on-surface-variant/60" />
                  <span className="text-sm font-bold text-on-surface">{workspace?.members?.length || 0}</span>
                </div>
                <span className="text-[9px] text-on-surface-variant/50">Members</span>
                {onlineUsers.size > 0 && (
                  <span className="text-[8px] text-emerald-400 font-medium">{onlineUsers.size} online</span>
                )}
              </div>
              <div className="flex flex-col items-center gap-1 p-2 bg-surface-container-low rounded-xl border border-outline-variant/15">
                <div className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3 text-on-surface-variant/60" />
                  <span className="text-sm font-bold text-on-surface">{messages.length}</span>
                </div>
                <span className="text-[9px] text-on-surface-variant/50">Messages</span>
              </div>
              <div className="flex flex-col items-center gap-1 p-2 bg-surface-container-low rounded-xl border border-outline-variant/15">
                <div className="flex items-center gap-1">
                  <BookOpen className="w-3 h-3 text-on-surface-variant/60" />
                  <span className="text-sm font-bold text-on-surface">{workspace?.resources?.length || 0}</span>
                </div>
                <span className="text-[9px] text-on-surface-variant/50">Resources</span>
              </div>
            </div>
          </div>

          {/* Members header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <span className="text-xs font-bold tracking-widest uppercase text-primary">Members</span>
            <button
              onClick={copyInviteCode}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary-container rounded-lg transition-all text-[10px] font-semibold min-h-[44px]"
            >
              {copied ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {copied ? 'Copied' : 'Invite'}
            </button>
          </div>

          {/* Member list */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1 custom-scrollbar">
            {(workspace?.members || []).map((member: any) => {
              const memberUser = member.user
              const isOnline = onlineUsers.has(String(memberUser?.id))
              const isMe = String(memberUser?.id) === String(session?.user?.id)
              return (
                <div
                  key={member.id || memberUser?.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-container-high transition-colors"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[11px] font-bold uppercase text-on-surface">
                      {memberUser?.username?.[0] || '?'}
                    </div>
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-container",
                      isOnline ? "bg-emerald-500" : "bg-gray-600"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-on-surface truncate">
                        {memberUser?.username || 'Member'}
                      </p>
                      {isMe && <span className="text-[8px] text-on-surface-variant/40">(you)</span>}
                    </div>
                    <p className="text-[10px] text-on-surface-variant/50 capitalize truncate">
                      {member.role || 'Member'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bottom: invite shortcut */}
          <div className="p-3 border-t border-outline-variant/20">
            <button
              onClick={copyInviteCode}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:bg-surface-container-high transition-colors text-[11px] font-semibold text-on-surface-variant min-h-[44px]"
            >
              <Copy className="w-3 h-3" />
              Copy Invite Code
            </button>
          </div>
        </aside>

      </div>{/* end 3-col body */}

      {/* ═══════════════ MOBILE BOTTOM BAR (Resources) ═══════════════ */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 pb-[env(safe-area-inset-bottom)]">
        <div className="bg-surface-container-low border-t border-outline-variant/20 px-4 py-2 flex items-center justify-center">
          <button
            onClick={() => setIsMobileResourceOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-primary-container text-on-surface rounded-xl text-xs font-semibold hover:bg-primary transition-all active:scale-95 shadow-lg shadow-primary/20 min-h-[44px]"
          >
            <BookOpen className="w-4 h-4" />
            Resources
            {workspace?.resources?.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-black/20 rounded-full text-[9px] font-bold">
                {workspace.resources.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ═══════════════ MOBILE RESOURCE BOTTOM SHEET ═══════════════ */}
      <AnimatePresence>
        {isMobileResourceOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileResourceOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] md:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-background border-t border-outline-variant/25 z-[90] md:hidden rounded-t-2xl max-h-[75vh] flex flex-col"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/25">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-3.5 h-3.5 text-primary-container" />
                  </div>
                  <h2 className="text-sm font-semibold text-on-surface">Resources</h2>
                </div>
                <button
                  onClick={() => setIsMobileResourceOpen(false)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-surface-container-high transition-colors"
                >
                  <X className="w-4 h-4 text-on-surface-variant" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {(workspace?.resources || []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <BookOpen className="w-10 h-10 text-on-surface-variant/30" />
                    <p className="text-xs text-on-surface-variant/50 text-center">No resources yet. Add from your library.</p>
                    <button
                      onClick={() => { setIsMobileResourceOpen(false); setHubView('library'); setIsKnowledgeDrawerOpen(true) }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-primary-container text-on-surface rounded-xl text-xs font-semibold min-h-[44px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add from Library
                    </button>
                  </div>
                ) : (
                  <>
                    {workspace.resources.map((res: any) => (
                      <button
                        key={res.id}
                        onClick={() => { setIsMobileResourceOpen(false); setViewingResource(res); setHubTab('insights'); setIsKnowledgeDrawerOpen(true) }}
                        className="w-full flex items-center gap-3 p-3.5 bg-surface-container-high border border-outline-variant/25 rounded-xl text-left min-h-[44px]"
                      >
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-3.5 h-3.5 text-primary-container" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate">{res.title}</p>
                          <p className="text-[10px] text-on-surface-variant/50 capitalize mt-0.5">{res.resource_type || 'Note'}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-on-surface-variant/40 flex-shrink-0" />
                      </button>
                    ))}
                    <button
                      onClick={() => { setIsMobileResourceOpen(false); setHubView('library'); setIsKnowledgeDrawerOpen(true) }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-surface-container-high border border-outline-variant/30 text-xs font-semibold text-on-surface-variant min-h-[44px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add from Library
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════ KNOWLEDGE DRAWER ═══════════════ */}
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
              className="fixed right-0 top-0 bottom-0 w-full sm:max-w-sm bg-background border-l border-outline-variant/25 z-[70] flex flex-col"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/25"
                style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-3.5 h-3.5 text-primary-container" />
                  </div>
                  <h2 className="text-sm font-semibold text-on-surface">
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
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest rounded-xl transition-all text-on-surface/80 hover:text-on-surface min-h-[44px]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="text-xs font-semibold">Back</span>
                  </button>
                </div>
              </div>

              {/* Hub Tab Switcher */}
              {viewingResource && (
                <div className="px-5 py-3 flex items-center gap-1.5 border-b border-outline-variant/25">
                  <button 
                    onClick={() => setHubTab('insights')}
                    className={cn("flex-1 py-2 text-xs font-medium rounded-lg transition-all min-h-[44px]", hubTab === 'insights' ? "bg-primary-container text-on-surface shadow-lg shadow-primary/20" : "text-on-surface-variant/60 hover:text-on-surface/80 hover:bg-surface-container-high")}
                  >AI Insights</button>
                  <button 
                    onClick={() => setHubTab('source')}
                    className={cn("flex-1 py-2 text-xs font-medium rounded-lg transition-all min-h-[44px]", hubTab === 'source' ? "bg-primary-container text-on-surface shadow-lg shadow-primary/20" : "text-on-surface-variant/60 hover:text-on-surface/80 hover:bg-surface-container-high")}
                  >Source PDF</button>
                </div>
              )}

              <div className="flex-1 overflow-hidden flex flex-col">
                <AnimatePresence mode="wait">
                  {!viewingResource ? (
                    <motion.div key="list" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col p-5 space-y-4 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1 p-1 bg-surface-container-high rounded-lg border border-outline-variant/25">
                          <button onClick={() => setHubView('shared')} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all min-h-[44px]", hubView === 'shared' ? "bg-background text-on-surface shadow-sm" : "text-on-surface-variant/60 hover:text-on-surface/80")}>Shared</button>
                          <button onClick={() => setHubView('library')} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all min-h-[44px]", hubView === 'library' ? "bg-background text-on-surface shadow-sm" : "text-on-surface-variant/60 hover:text-on-surface/80")}>Library</button>
                        </div>
                        {hubView === 'shared' && (
                          <button onClick={() => setHubView('library')} className="p-1.5 bg-primary/10 text-primary-container rounded-lg hover:bg-primary-container hover:text-on-surface transition-all min-w-[44px] min-h-[44px] flex items-center justify-center" title="Add from Library">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                        {hubView === 'shared' ? (
                          <>
                            {(workspace?.resources || []).length === 0 ? (
                              <div className="text-center py-12">
                                <BookOpen className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-3" />
                                <p className="text-xs text-on-surface-variant/60 font-medium">No shared resources yet</p>
                                <button onClick={() => setHubView('library')} className="mt-3 text-xs text-primary-container font-medium hover:text-primary transition-colors min-h-[44px] inline-flex items-center">+ Add from library</button>
                              </div>
                            ) : (workspace.resources.map((res: any) => (
                              <div key={res.id} className="group relative">
                                <button onClick={() => { setViewingResource(res); setHubTab('insights') }} className="w-full p-3.5 bg-surface-container-high border border-outline-variant/25 rounded-xl transition-all text-left flex items-start gap-3 hover:border-primary/20 active:scale-[0.98] min-h-[44px]">
                                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0"><BookOpen className="w-3.5 h-3.5 text-primary-container" /></div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-on-surface truncate">{res.title}</p>
                                    <p className="text-[10px] text-on-surface-variant/60 mt-0.5 capitalize">{res.resource_type || 'Note'}</p>
                                  </div>
                                  <ChevronRight className="w-3.5 h-3.5 text-on-surface-variant/40 group-hover:text-on-surface-variant flex-shrink-0 mt-0.5" />
                                </button>
                              </div>
                            )))}
                          </>
                        ) : (
                          <>
                            {libraryResources.filter(res => !workspace?.resources?.some((r: any) => r.id === res.id)).length === 0 ? (
                              <div className="text-center py-12">
                                <Check className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-3" />
                                <p className="text-xs text-on-surface-variant/60 font-medium px-6 leading-relaxed">All your library resources are already linked</p>
                              </div>
                            ) : libraryResources.filter(res => !workspace?.resources?.some((r: any) => r.id === res.id)).map((res) => (
                              <div key={res.id} className="group relative">
                                <div className="w-full p-3.5 bg-surface-container-high border border-outline-variant/25 rounded-xl flex items-start gap-3 min-h-[44px]">
                                  <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0"><BookOpen className="w-3.5 h-3.5 text-on-surface-variant/60" /></div>
                                  <div className="flex-1 min-w-0 pr-8">
                                    <p className="text-sm font-medium text-on-surface-variant truncate">{res.title}</p>
                                    <p className="text-[10px] text-on-surface-variant/40 mt-0.5">In your library</p>
                                  </div>
                                </div>
                                <button onClick={() => handleShareResource(res.id)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-primary/10 text-primary-container rounded-lg group-hover:bg-primary-container group-hover:text-on-surface transition-all min-w-[44px] min-h-[44px] flex items-center justify-center" title="Add to Workspace">
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="viewer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex-1 flex flex-col overflow-hidden">
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
                        {hubTab === 'insights' ? (
                          <div>
                            <div className="mb-6">
                              <h3 className="text-base font-semibold text-on-surface leading-tight mb-2">{viewingResource.title}</h3>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-primary/10 text-primary-container text-[10px] font-medium rounded-md border border-primary/20 capitalize">{viewingResource.resource_type || 'Note'}</span>
                              </div>
                            </div>
                            {viewingResource.ai_summary && (
                              <div className="mb-6 p-4 bg-surface-container-high border border-violet-500/15 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                  <span className="text-xs font-medium text-on-surface-variant">AI Summary</span>
                                </div>
                                <div className="prose prose-invert prose-sm leading-relaxed text-on-surface/80 text-sm">
                                  <ReactMarkdown>{viewingResource.ai_summary}</ReactMarkdown>
                                </div>
                              </div>
                            )}
                            {viewingResource.ai_notes_json && (
                              <RichNotesViewer 
                                resourceId={viewingResource.id}
                                notes={typeof viewingResource.ai_notes_json === 'string' ? JSON.parse(viewingResource.ai_notes_json) : viewingResource.ai_notes_json}
                                isEditing={false}
                                setIsEditing={() => {}}
                                onSave={() => {}}
                              />
                            )}
                          </div>
                        ) : (
                          <div className="h-[600px] w-full rounded-xl overflow-hidden border border-outline-variant/25 bg-surface-container-high">
                            {viewingResource.file_url ? (
                              <PDFViewer fileUrl={viewingResource.file_url} title={viewingResource.title} />
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center mb-3">
                                  <ExternalLink className="w-5 h-5 text-on-surface-variant/40" />
                                </div>
                                <h4 className="text-sm font-medium text-on-surface mb-1">Source unavailable</h4>
                                <p className="text-xs text-on-surface-variant/60 max-w-[180px]">No PDF linked to this resource.</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="p-5 border-t border-outline-variant/25 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => { const link = document.createElement('a'); link.href = viewingResource.file_url; link.download = viewingResource.title; link.click() }} className="py-2.5 bg-surface-container-high border border-outline-variant/40 text-on-surface/80 rounded-xl text-xs font-medium hover:border-outline-variant/70 transition-all flex items-center justify-center gap-2 min-h-[44px]">
                            <Download className="w-3.5 h-3.5 text-on-surface-variant/60" /> Download
                          </button>
                          {viewingResource.owner?.id !== session?.user?.id && (
                            <button onClick={handleCloneResource} disabled={isCloning} className={cn("py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 min-h-[44px]", isCloning ? "bg-slate-800 text-on-surface-variant/60 cursor-not-allowed" : "bg-primary-container text-on-surface hover:bg-primary shadow-lg shadow-primary/20 active:scale-95")}>
                              {isCloning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />}
                              {isCloning ? 'Saving...' : 'Save to Library'}
                            </button>
                          )}
                        </div>
                        <button onClick={() => handleShareResource(viewingResource.id)} className="w-full py-3 bg-surface-container-high border border-primary/20 text-primary-container rounded-xl text-xs font-medium hover:bg-primary/10 transition-all flex items-center justify-center gap-2 min-h-[44px]">
                          <Pin className="w-3.5 h-3.5" /> Share to chat
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

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
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

  const audioUrl = (() => {
    if (!url) return ''
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http')) return url
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
    const backendBase = apiBase.replace(/\/api\/?$/, '')
    return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`
  })()

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div className={cn(
      "mt-2 flex items-center gap-2.5 p-2.5 rounded-2xl min-w-[180px] sm:min-w-[220px]",
      error ? "bg-red-500/10 border border-red-500/20" :
      isMe ? "bg-black/20" : "bg-background border border-outline-variant/25"
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
          isMe ? "bg-white/20 text-on-surface hover:bg-white/30" : "bg-primary-container text-on-surface hover:bg-primary shadow-sm shadow-primary/30"
        )}
      >
        {error ? <span className="text-[8px] font-bold">ERR</span> :
         isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden cursor-pointer"
          onClick={e => {
            if (!audioRef.current || error) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            audioRef.current.currentTime = pct * audioRef.current.duration
          }}>
          <div className={cn("h-full rounded-full transition-all", isMe ? "bg-white/70" : "bg-primary-container")}
            style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1 flex justify-between items-center">
          <span className="text-[9px] text-on-surface-variant/60">{error ? 'Failed to load' : 'Voice note'}</span>
          {duration > 0 && <span className="text-[9px] text-on-surface-variant/40 font-mono">{formatTime(duration)}</span>}
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
  workspaceId,
  reactions = {},
  onReact
}: { 
  message: any, 
  isMe: boolean, 
  showAvatar?: boolean, 
  onReply: () => void, 
  onViewResource: (res: any) => void,
  workspaceId: number,
  reactions?: Record<string, string[]>,
  onReact?: (messageId: string, emoji: string) => void
}) {
  const isAI = message.is_ai
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const reactionPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    if (isMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setShowReactionPicker(false)
      }
    }
    if (showReactionPicker) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showReactionPicker])

  const handleLongPress = () => {
    setIsMenuOpen(true)
    if (window.navigator.vibrate) window.navigator.vibrate(50)
  }

  const handleEdit = async () => {
    if (!editText.trim() || editText === message.content) { setIsEditing(false); return }
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

  const messageId = String(message.id)
  const hasReactions = Object.keys(reactions).length > 0

  return (
    <motion.div 
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.4 }}
      onDragEnd={(_, info) => { if (info.offset.x > 70) onReply() }}
      onPointerDown={() => { longPressTimer.current = setTimeout(handleLongPress, 500) }}
      onPointerUp={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
      onPointerLeave={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
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
          isAI ? 'bg-gradient-to-br from-violet-600 to-indigo-600' : isMe ? 'bg-primary-container' : 'bg-slate-700'
        )}>
          {isAI ? <Sparkles className="w-3.5 h-3.5 text-on-surface" /> : (message.author?.username?.[0] || 'U')}
        </div>
      ) : (
        <div className="w-7 flex-shrink-0" />
      )}

      <div className={cn("flex flex-col max-w-[85%] sm:max-w-[70%]", isMe ? 'items-end' : 'items-start')}>
        {showAvatar && (
          <div className={cn("flex items-center gap-1.5 mb-1 px-1", isMe ? 'flex-row-reverse' : '')}>
            <span className="text-[11px] font-medium text-on-surface-variant">
              {isAI ? 'Flow AI' : message.author?.username || 'Member'}
            </span>
            <span className="text-[10px] text-on-surface-variant/40">
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {message.is_edited && <span className="ml-1 text-[9px] opacity-50">(edited)</span>}
            </span>
          </div>
        )}

        {message.parent_data && (
          <div className={cn("mb-1.5 px-3 py-2 rounded-xl bg-surface-container-high border-l-2 border-primary/50 max-w-xs", isMe ? "mr-2" : "ml-2")}>
            <p className="text-[10px] font-medium text-primary-container mb-0.5">{message.parent_data.author_name}</p>
            <p className="text-[11px] text-on-surface-variant/60 italic truncate">"{message.parent_data.content}"</p>
          </div>
        )}

        <div className={cn(
          "relative px-4 py-2.5 text-sm leading-relaxed shadow-lg transition-all duration-200",
          isAI 
            ? 'bg-tertiary-container/10 border border-tertiary-container/20 text-on-surface rounded-2xl rounded-tl-sm' 
            : isMe 
              ? 'bg-primary-container text-on-primary-container rounded-2xl rounded-tr-sm' 
              : 'bg-surface-container-high text-on-surface rounded-2xl rounded-tl-sm',
          isDeleting && "opacity-40 grayscale pointer-events-none"
        )}>
          {!isAI && !isEditing && (
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-surface-container-high border border-outline-variant/25 text-on-surface-variant hover:text-on-surface transition-all opacity-0 group-hover:opacity-100 hidden sm:block shadow-xl z-20",
                isMe ? "-left-10" : "-right-10"
              )}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Reaction picker trigger (desktop) */}
          {!isAI && !isEditing && (
            <button
              onClick={() => setShowReactionPicker(!showReactionPicker)}
              className={cn(
                "absolute -bottom-2 opacity-0 group-hover:opacity-100 p-1 rounded-full bg-surface-container-high border border-outline-variant/25 text-on-surface-variant hover:text-primary-container transition-all z-20 min-w-[44px] min-h-[44px] flex items-center justify-center",
                isMe ? "left-2" : "right-2"
              )}
            >
              <SmilePlus className="w-3.5 h-3.5" />
            </button>
          )}

          <AnimatePresence>
            {showReactionPicker && (
              <motion.div
                ref={reactionPickerRef}
                initial={{ opacity: 0, scale: 0.9, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 4 }}
                className={cn(
                  "absolute bottom-full mb-3 flex items-center gap-1 p-2 bg-surface-container-high border border-outline-variant/40 rounded-2xl shadow-2xl z-[100]",
                  isMe ? "right-0" : "left-0"
                )}
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => { onReact?.(messageId, emoji); setShowReactionPicker(false) }}
                    className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-surface-container-highest transition-all text-lg active:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isMenuOpen && (
              <motion.div 
                ref={menuRef}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                  "absolute bottom-full mb-2 w-36 bg-surface-container-high border border-outline-variant/40 rounded-xl shadow-2xl z-[100] p-1 overflow-hidden",
                  isMe ? "right-0" : "left-0"
                )}
              >
                <button onClick={() => { setShowReactionPicker(true); setIsMenuOpen(false) }} className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-on-surface/80 hover:bg-surface-container-high rounded-lg transition-all min-h-[44px]">
                  <SmilePlus className="w-3 h-3" /> React
                </button>
                <button onClick={copyToClipboard} className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-on-surface/80 hover:bg-surface-container-high rounded-lg transition-all min-h-[44px]">
                  <CopyIcon className="w-3 h-3" /> Copy text
                </button>
                {isMe && !message.audio_file && (
                  <button onClick={() => { setIsEditing(true); setIsMenuOpen(false) }} className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-on-surface/80 hover:bg-surface-container-high rounded-lg transition-all min-h-[44px]">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                )}
                <button onClick={onReply} className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-on-surface/80 hover:bg-surface-container-high rounded-lg transition-all min-h-[44px]">
                  <Reply className="w-3 h-3" /> Reply
                </button>
                {(isMe || message.is_owner) && (
                  <button onClick={() => { handleDelete(); setIsMenuOpen(false) }} className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-red-400 hover:bg-red-500/10 rounded-lg transition-all min-h-[44px]">
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
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit() }
                  if (e.key === 'Escape') setIsEditing(false)
                }}
                className="w-full bg-black/40 border border-primary/30 rounded-xl px-3 py-2 text-sm text-on-surface focus:outline-none min-h-[60px]"
              />
              <div className="flex justify-end gap-1.5">
                <button onClick={() => setIsEditing(false)} className="px-2.5 py-1 text-[10px] text-on-surface-variant/60 hover:text-on-surface/80 min-h-[44px]">Cancel</button>
                <button onClick={handleEdit} className="px-3 py-1 text-[10px] bg-primary-container text-on-surface rounded-lg hover:bg-primary min-h-[44px]">Save</button>
              </div>
            </div>
          ) : (message.audio_file || message.audio_data) ? (
            <AudioPlayer url={message.audio_data || message.audio_file} isMe={isMe} />
          ) : (
            <>
              {message.attachment && (
                <div className="mb-2 max-w-sm overflow-hidden rounded-xl border border-outline-variant/50">
                  {message.attachment_type === 'video' ? (
                    <video src={message.attachment} controls className="w-full h-auto max-h-[300px] object-contain bg-black/40" />
                  ) : (
                    <img
                      src={message.attachment}
                      alt="Attachment"
                      className="w-full h-auto max-h-[300px] object-contain bg-black/40 cursor-zoom-in active:scale-95 transition-transform"
                      onClick={() => setLightboxUrl(message.attachment)}
                    />
                  )}
                </div>
              )}
              {message.content && (
                <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/5">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({children}) => <h1 className="text-base font-bold text-on-surface mt-4 mb-2">{children}</h1>,
                      h2: ({children}) => <h2 className="text-sm font-bold text-on-surface mt-4 mb-2">{children}</h2>,
                      h3: ({children}) => <h3 className="text-[13px] font-bold text-on-surface mt-3 mb-1">{children}</h3>,
                      ul: ({children}) => <ul className="list-disc pl-4 space-y-1 mb-3">{children}</ul>,
                      ol: ({children}) => <ol className="list-decimal pl-4 space-y-1 mb-3">{children}</ol>,
                      li: ({children}) => <li className="text-[13px] text-on-surface/80 leading-normal">{children}</li>,
                      table: ({children}) => (
                        <div className="my-4 overflow-x-auto rounded-xl border border-outline-variant/25 bg-black/20">
                          <table className="w-full text-left border-collapse text-[12px]">{children}</table>
                        </div>
                      ),
                      thead: ({children}) => <thead className="bg-surface-container-high text-on-surface-variant font-semibold">{children}</thead>,
                      th: ({children}) => <th className="px-3 py-2 border-b border-outline-variant/25">{children}</th>,
                      td: ({children}) => <td className="px-3 py-2 border-b border-outline-variant/25 text-on-surface/80">{children}</td>,
                      p: ({children}) => <p className="mb-3 last:mb-0 text-[13px] text-on-surface/80 leading-relaxed">{children}</p>,
                    }}
                  >
                    {isAI ? message.content.split(/\bACTION\b/i)[0].trim() : message.content}
                  </ReactMarkdown>
                </div>
              )}
            </>
          )}

          {/* Existing reactions row */}
          {hasReactions && (
            <div className={cn("flex flex-wrap gap-1 mt-2", isAI ? "" : "")}>
              {Object.entries(reactions).map(([emoji, users]) => (
                <button
                  key={emoji}
                  onClick={() => onReact?.(messageId, emoji)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-all min-h-[28px]",
                    users.length > 0
                      ? "bg-primary/10 border-primary/20 hover:bg-primary/20"
                      : "bg-surface-container-high border-outline-variant/20 hover:bg-surface-container-highest"
                  )}
                >
                  <span>{emoji}</span>
                  <span className="text-[9px] font-medium text-on-surface-variant/70">{users.length}</span>
                </button>
              ))}
            </div>
          )}
          
          {message.pinned_resource_data && (
            <div 
              onClick={() => onViewResource(message.pinned_resource_data)}
              className="mt-3 p-3 bg-black/30 border border-outline-variant/25 rounded-xl flex items-center gap-3 hover:border-primary/20 transition-all cursor-pointer group/res min-h-[44px]"
            >
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-3.5 h-3.5 text-primary-container" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-medium text-on-surface truncate">{message.pinned_resource_data.title}</p>
                <p className="text-[10px] text-on-surface-variant/60 mt-0.5 capitalize">{message.pinned_resource_data.resource_type || 'Resource'}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-on-surface-variant/40 group-hover/res:text-primary-container transition-colors flex-shrink-0" />
            </div>
          )}

          {message.shared_assignment_data && (
            <div className="mt-3 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-medium text-on-surface truncate">{message.shared_assignment_data.title}</p>
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
                  className="flex items-center justify-center gap-1.5 py-2 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 rounded-lg text-[10px] font-medium text-on-surface-variant hover:text-on-surface transition-all min-h-[44px]"
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
                  className="flex items-center justify-center gap-1.5 py-2 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 rounded-lg text-[10px] font-medium text-on-surface-variant hover:text-on-surface transition-all min-h-[44px]"
                >
                  <CloudDownload className="w-3 h-3" /> Word
                </button>
              </div>
            </div>
          )}

          {message.is_optimistic && (
            <div className="absolute -bottom-4 right-0 flex items-center gap-1">
              <span className="text-[9px] text-on-surface-variant/40">Sending</span>
              <div className="flex gap-0.5">
                <span className="w-0.5 h-0.5 bg-on-surface-variant/40 rounded-full animate-bounce" />
                <span className="w-0.5 h-0.5 bg-on-surface-variant/40 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-0.5 h-0.5 bg-on-surface-variant/40 rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setLightboxUrl(null)}
          >
            <button className="absolute top-5 right-5 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all z-10 min-w-[44px] min-h-[44px] flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
              <X className="w-5 h-5 text-white" />
            </button>
            <motion.img
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              src={lightboxUrl}
              alt="Full size"
              className="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
