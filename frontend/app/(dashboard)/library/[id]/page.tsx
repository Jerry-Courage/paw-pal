'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import {
  ArrowLeft, Sparkles, Loader2, X, RotateCcw, BookOpen,
  HelpCircle, Map, Wand2, Radio, Calculator, Layers,
  MoreHorizontal, PanelRight, PanelRightClose, Plus
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { useSearchParams } from 'next/navigation'

import RichNotesViewer from '@/components/library/RichNotesViewer'
import MusicGeneratorModal from '@/components/library/MusicGeneratorModal'
import ExpandableMobileHUD from '@/components/ui/ExpandableMobileHUD'

// Lazy-load heavy components
const PDFViewer = dynamic(() => import('@/components/library/PDFViewer'), { ssr: false })

// ── Tool definitions ──────────────────────────────────────────────
const TOOLS = [
  { id: 'notes',     label: 'Notes',           icon: BookOpen,   href: (id: number) => `/library/${id}` },
  { id: 'quiz',      label: 'Multiple Choice', icon: HelpCircle, href: (id: number) => `/library/${id}/quiz` },
  { id: 'flashcards',label: 'Flashcards',      icon: Layers,     href: (id: number) => `/library/${id}/flashcards` },
  { id: 'podcast',   label: 'Podcast',         icon: Radio,      href: (id: number) => `/library/${id}/podcast` },
  { id: 'practice',  label: 'Written Test',    icon: Wand2,      href: (id: number) => `/library/${id}/practice` },
  { id: 'mindmap',   label: 'Mind Map',        icon: Map,        href: (id: number) => `/library/${id}/mindmap` },
  { id: 'solver',    label: 'Math Solver',     icon: Calculator, href: (id: number) => `/library/${id}/solver` },
  { id: 'content',   label: 'Content',         icon: BookOpen,   href: null },
]

// ── Inline AI Chat ────────────────────────────────────────────────
import { useRef } from 'react'
import { aiApi } from '@/lib/api'
import ReactMarkdown from 'react-markdown'

function AIChat({ resourceId, resourceTitle, hasNotes }: { resourceId: number; resourceTitle: string; hasNotes: boolean }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const userMsg = input.trim()
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setSending(true)
    try {
      let sid = sessionId
      if (!sid) {
        const res = await aiApi.createSession({ title: `Study: ${resourceTitle}`, context_type: 'resource', resource: resourceId })
        sid = res.data.id
        setSessionId(sid)
      }
      const res = await aiApi.sendMessage(sid!, userMsg)
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.content }])
    } catch {
      toast.error('FlowAI is busy. Try again.')
      setMessages(prev => prev.slice(0, -1))
      setInput(userMsg)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#111] border-l border-white/5">
      {/* Chat / Content tabs */}
      <div className="flex border-b border-white/5 shrink-0">
        <button className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-white border-b-2 border-orange-500">Chat</button>
        <button className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors">Content</button>
        <button className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors">Notes</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 opacity-40">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-xs text-slate-500 font-medium">Here to help you learn</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
              <div className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2.5 text-xs leading-relaxed',
                msg.role === 'user'
                  ? 'bg-orange-500 text-white rounded-tr-none'
                  : 'bg-white/5 text-slate-300 rounded-tl-none border border-white/5'
              )}>
                {msg.role === 'user'
                  ? <p className="whitespace-pre-wrap">{msg.content}</p>
                  : <ReactMarkdown className="prose prose-invert prose-xs max-w-none">{msg.content}</ReactMarkdown>}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex gap-2">
            <div className="bg-white/5 border border-white/5 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1.5">
              {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/5 shrink-0">
        <div className="flex items-end gap-2 bg-white/5 border border-white/8 rounded-2xl px-3 py-2 focus-within:border-white/20 transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask me anything about the material..."
            className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-600 resize-none focus:outline-none max-h-[120px] py-1"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="p-2 rounded-xl bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-30 disabled:pointer-events-none transition-all shrink-0"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeft className="w-3.5 h-3.5 rotate-180" />}
          </button>
        </div>
        <button
          onClick={() => { setMessages([]); setSessionId(null) }}
          className="mt-2 w-full text-[10px] text-slate-600 hover:text-slate-400 transition-colors font-medium flex items-center justify-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> Reset chat
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────
export default function ResourcePage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTool, setActiveTool] = useState('notes')
  const [showChat, setShowChat] = useState(true)
  const [showMusic, setShowMusic] = useState(false)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [selectedProblem, setSelectedProblem] = useState('')
  const qc = useQueryClient()

  const { data: resource, isLoading, refetch } = useQuery({
    queryKey: ['resource', id],
    queryFn: () => libraryApi.getResource(id).then(r => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as any
      return (data?.status === 'processing' || !data?.has_study_kit) ? 5000 : false
    }
  })

  const isMathMode = useMemo(() => {
    if (!resource?.title) return false
    const mathKeywords = ['math', 'calculus', 'ebs301', 'algebra', 'physics', 'stats', 'geometry', 'matrix']
    return mathKeywords.some(kw => resource.title.toLowerCase().includes(kw))
  }, [resource?.title])

  const saveNotesMutation = useMutation({
    mutationFn: (updatedNotes: any) => libraryApi.updateResource(id, { ai_notes_json: updatedNotes }),
    onSuccess: () => {
      toast.success('Notes saved!')
      qc.invalidateQueries({ queryKey: ['resource', id] })
    }
  })

  if (isLoading) return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center animate-pulse">
          <Sparkles className="w-6 h-6 text-orange-400" />
        </div>
        <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Loading...</p>
      </div>
    </div>
  )

  if (!resource) return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center gap-4">
      <X className="w-10 h-10 text-rose-500" />
      <h1 className="text-xl font-black text-white">Resource Not Found</h1>
      <Link href="/library" className="text-sm text-orange-400 hover:text-orange-300 transition-colors">Back to Library</Link>
    </div>
  )

  const hasNotes = resource.has_study_kit && resource.ai_notes_json && Object.keys(resource.ai_notes_json).length > 0

  // Filter tools to only show ones that were selected during upload
  const selectedFeatures: string[] = resource.selected_features || []
  const visibleTools = TOOLS.filter(t => {
    if (t.id === 'notes' || t.id === 'content') return true
    if (!selectedFeatures.length) return true // show all if no selection recorded
    return selectedFeatures.includes(t.id)
  })

  return (
    <div className="flex h-[calc(100dvh-64px)] -m-4 md:-m-6 bg-[#0d0d0d] overflow-hidden">

      {/* ── Left sidebar: tool nav ────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-52 shrink-0 bg-[#111] border-r border-white/5 overflow-y-auto">
        {/* Back + title */}
        <div className="px-4 py-4 border-b border-white/5">
          <Link href="/library" className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors mb-3">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-bold">Library</span>
          </Link>
          <h2 className="text-xs font-black text-white leading-snug line-clamp-2">{resource.title}</h2>
        </div>

        {/* Tool nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {visibleTools.map(tool => {
            const isActive = activeTool === tool.id
            const Icon = tool.icon
            return (
              <button
                key={tool.id}
                onClick={() => {
                  if (tool.href) {
                    const href = tool.href(id)
                    if (href === `/library/${id}`) {
                      setActiveTool('notes')
                    } else {
                      router.push(href)
                    }
                  } else {
                    setActiveTool(tool.id)
                  }
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold truncate">{tool.label}</span>
              </button>
            )
          })}

          {/* Add method */}
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:text-slate-400 hover:bg-white/5 transition-all mt-2">
            <Plus className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold">Add Method</span>
          </button>
        </nav>

        {/* User avatar placeholder */}
        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center">
              <span className="text-[10px] font-black text-orange-400">U</span>
            </div>
            <span className="text-xs text-slate-500 font-medium truncate">You</span>
          </div>
        </div>
      </div>

      {/* ── Center: content area ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-[#111] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile back */}
            <Link href="/library" className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-sm font-black text-white truncate">{resource.title}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all"
              title="Refresh"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowChat(v => !v)}
              className="hidden lg:flex p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all"
              title="Toggle chat"
            >
              {showChat ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-[#0d0d0d]">
          {activeTool === 'notes' && (
            !hasNotes ? (
              <div className="flex flex-col items-center justify-center h-full p-12 text-center gap-6">
                <div className="w-20 h-20 bg-orange-500/10 rounded-[2rem] flex items-center justify-center animate-pulse">
                  <Sparkles className="w-10 h-10 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tighter">Generating Notes</h2>
                  <p className="text-slate-500 mt-2 text-sm">FlowAI is extracting concepts and building your study kit...</p>
                </div>
                {resource.processing_progress > 0 && (
                  <div className="w-full max-w-xs space-y-2">
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-700"
                        style={{ width: `${resource.processing_progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-600 italic">{resource.status_text}</p>
                  </div>
                )}
              </div>
            ) : (
              <RichNotesViewer
                notes={resource.ai_notes_json}
                isEditing={isEditingNotes}
                setIsEditing={setIsEditingNotes}
                isMathMode={isMathMode}
                onSave={(updated) => {
                  saveNotesMutation.mutate(updated)
                  setIsEditingNotes(false)
                }}
                onOpenMath={(prob) => {
                  setSelectedProblem(prob || '')
                  router.push(`/library/${id}/solver`)
                }}
              />
            )
          )}

          {activeTool === 'content' && (
            <div className="h-full">
              {resource.resource_type === 'pdf' && resource.file_url ? (
                <PDFViewer fileUrl={resource.file_url} title={resource.title} />
              ) : resource.resource_type === 'video' && resource.url ? (
                <div className="h-full flex flex-col p-6 gap-4">
                  <div className="flex-1 bg-black rounded-2xl overflow-hidden">
                    <iframe
                      src={`https://www.youtube.com/embed/${resource.url.includes('v=') ? resource.url.split('v=')[1].split('&')[0] : resource.url.split('youtu.be/')[1]?.split('?')[0]}`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600">
                  <BookOpen className="w-10 h-10 opacity-30" />
                  <p className="text-sm">Preview not available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: AI Chat ────────────────────────────────────────── */}
      {showChat && (
        <div className="hidden lg:flex flex-col w-72 shrink-0">
          <AIChat resourceId={id} resourceTitle={resource.title} hasNotes={hasNotes} />
        </div>
      )}

      {/* Music modal */}
      {showMusic && <MusicGeneratorModal resourceId={id} onClose={() => setShowMusic(false)} />}

      {/* Mobile HUD */}
      <ExpandableMobileHUD
        resourceId={id}
        onOpenQuiz={() => router.push(`/library/${id}/quiz`)}
        onOpenMindmap={() => router.push(`/library/${id}/mindmap`)}
        onOpenMusic={() => setShowMusic(true)}
        onOpenPodcast={() => router.push(`/library/${id}/podcast`)}
        onOpenFlashcards={() => router.push(`/library/${id}/flashcards`)}
        onOpenPractice={() => router.push(`/library/${id}/practice`)}
        onOpenChat={() => {}}
        onOpenMath={() => router.push(`/library/${id}/solver`)}
      />
    </div>
  )
}
