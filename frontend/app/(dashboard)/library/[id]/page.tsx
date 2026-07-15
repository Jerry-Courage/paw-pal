'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import {
  ArrowLeft, Loader2, X, RotateCcw, BookOpen,
  HelpCircle, Map, Wand2, Radio, Calculator, Layers,
  PanelRight, PanelRightClose, Plus, Send, Sparkles, Brain, Trash2
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { useRef } from 'react'
import { aiApi } from '@/lib/api'
import ReactMarkdown from 'react-markdown'
import { useStudyTimer } from '@/hooks/useStudyTimer'
import { normalizeReadableMath } from '@/lib/mathFormatting'

const PDFViewer = dynamic(() => import('@/components/library/PDFViewer'), { ssr: false })
const MusicGeneratorModal = dynamic(() => import('@/components/library/MusicGeneratorModal'), { ssr: false })
const ExpandableMobileHUD = dynamic(() => import('@/components/ui/ExpandableMobileHUD'), { ssr: false })
const RichNotesViewer = dynamic(() => import('@/components/library/RichNotesViewer'), { ssr: false })
const ProcessingView = dynamic(() => import('@/components/library/ProcessingView'), { ssr: false })
const StudyPath = dynamic(() => import('@/components/library/StudyPath'), { ssr: false })
const ConfirmationModal = dynamic(() => import('@/components/ui/ConfirmationModal'), { ssr: false })
const TOOLS = [
  { id: 'notes',      label: 'Notes',           icon: BookOpen,   href: (id: number) => `/library/${id}` },
  { id: 'quiz',       label: 'Multiple Choice', icon: HelpCircle, href: (id: number) => `/library/${id}/quiz` },
  { id: 'flashcards', label: 'Flashcards',      icon: Layers,     href: (id: number) => `/library/${id}/flashcards` },
  { id: 'podcast',    label: 'Podcast',         icon: Radio,      href: (id: number) => `/library/${id}/podcast` },
  { id: 'practice',   label: 'Written Test',    icon: Wand2,      href: (id: number) => `/library/${id}/practice` },
  { id: 'mindmap',    label: 'Mind Map',        icon: Map,        href: (id: number) => `/library/${id}/mindmap` },
  { id: 'examprep',   label: 'Exam Prep',       icon: Brain,      href: (id: number) => `/library/${id}/examprep` },
  { id: 'solver',     label: 'Math Solver',     icon: Calculator, href: (id: number) => `/library/${id}/solver` },
  { id: 'content',    label: 'Content',         icon: BookOpen,   href: null },
]

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
      <div className="px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <span className="text-xs font-black text-white uppercase tracking-widest">Ask FlowAI</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <div className="w-10 h-10 rounded-2xl bg-white/3 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-slate-600" />
            </div>
            <p className="text-xs text-slate-600 font-medium max-w-[160px] leading-relaxed">Ask anything about this material</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
              <div className={cn(
                'max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                msg.role === 'user'
                  ? 'bg-orange-500 text-white rounded-tr-none'
                  : 'bg-white/5 text-slate-300 rounded-tl-none'
              )}>
                {msg.role === 'user'
                  ? <p className="whitespace-pre-wrap">{msg.content}</p>
                  : <ReactMarkdown className="prose prose-invert prose-xs max-w-none">{normalizeReadableMath(msg.content)}</ReactMarkdown>}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex gap-1.5 px-3 py-2.5 bg-white/5 rounded-2xl rounded-tl-none w-fit">
            {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-white/5 shrink-0">
        <div className="flex items-end gap-2 bg-white/5 rounded-xl px-3 py-2 focus-within:bg-white/8 transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask me anything..."
            className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-600 resize-none focus:outline-none max-h-[100px] py-0.5"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="p-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-30 disabled:pointer-events-none transition-all shrink-0"
          >
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          </button>
        </div>
        <button
          onClick={() => { setMessages([]); setSessionId(null) }}
          className="mt-1.5 w-full text-[10px] text-slate-700 hover:text-slate-500 transition-colors font-medium flex items-center justify-center gap-1"
        >
          <RotateCcw className="w-2.5 h-2.5" /> Reset chat
        </button>
      </div>
    </div>
  )
}

export default function ResourcePage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const router = useRouter()
  const [activeTool, setActiveTool] = useState('notes')
  const [notesViewKey, setNotesViewKey] = useState(0)
  const [showChat, setShowChat] = useState(true)
  const [showStudyIntro, setShowStudyIntro] = useState(true)
  const [showMusic, setShowMusic] = useState(false)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const qc = useQueryClient()

  // Track time spent studying this resource — logs to /auth/log-study/ on leave
  useStudyTimer(true)

  const { data: resource, isLoading, refetch } = useQuery({
    queryKey: ['resource', id],
    queryFn: () => libraryApi.getResource(id).then(r => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as any
      // Keep polling until BOTH status is ready AND has_study_kit is true
      // This prevents the "says ready but still building" race condition
      const isFullyReady = data?.status === 'ready' && data?.has_study_kit === true
      return isFullyReady ? false : 4000
    }
  })

  const isMathMode = useMemo(() => {
    if (!resource?.title) return false
    return ['math', 'calculus', 'ebs301', 'algebra', 'physics', 'stats', 'geometry', 'matrix']
      .some(kw => resource.title.toLowerCase().includes(kw))
  }, [resource?.title])

  const saveNotesMutation = useMutation({
    mutationFn: (updatedNotes: any) => libraryApi.updateResource(id, { ai_notes_json: updatedNotes }),
    onSuccess: () => { toast.success('Notes saved!'); qc.invalidateQueries({ queryKey: ['resource', id] }) }
  })

  const deleteMutation = useMutation({
    mutationFn: () => libraryApi.deleteResource(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      toast.success('Resource deleted.')
      router.push('/library')
    },
    onError: () => {
      toast.error('Delete failed.')
    }
  })

  if (isLoading) return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 bg-orange-500/10 rounded-2xl flex items-center justify-center animate-pulse">
          <Sparkles className="w-5 h-5 text-orange-400" />
        </div>
        <p className="text-xs text-slate-600 uppercase tracking-widest font-black">Loading...</p>
      </div>
    </div>
  )

  if (!resource) return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col items-center justify-center gap-4">
      <X className="w-8 h-8 text-rose-500" />
      <h1 className="text-lg font-black text-white">Resource Not Found</h1>
      <Link href="/library" className="text-sm text-orange-400 hover:text-orange-300 transition-colors">← Back to Library</Link>
    </div>
  )

  const hasNotes = resource.has_study_kit && resource.ai_notes_json && Object.keys(resource.ai_notes_json).length > 0
  const selectedFeatures: string[] = resource.selected_features || []
  const visibleTools = TOOLS.filter(t => {
    if (t.id === 'notes' || t.id === 'content') return true
    if (!selectedFeatures.length) return true
    return selectedFeatures.includes(t.id)
  })

  return (
    <div className="fixed inset-0 [top:var(--nav-height)] flex bg-[#0d0d0d] overflow-hidden">

      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-56 shrink-0 bg-[#0d0d0d] border-r border-white/5 overflow-y-auto">
        {/* Back link + title */}
        <div className="px-3 pt-4 pb-2 border-b border-white/5">
          <Link href="/library" className="flex items-center gap-1.5 text-slate-600 hover:text-white transition-colors text-xs font-bold mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Library
          </Link>
          <p className="text-[11px] font-black text-white leading-snug line-clamp-2 opacity-70">{resource.title}</p>
        </div>

        {/* Study Path */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {hasNotes ? (
            <StudyPath
              resourceId={id}
              onStepClick={(step) => {
                if (step === 'notes') {
                  setActiveTool('notes')
                  setNotesViewKey(prev => prev + 1)
                  setShowStudyIntro(false)
                  toast.info('You’re now in Understand — the study path is ready.', { duration: 2200 })
                } else {
                  router.push(`/library/${id}/${step}`)
                }
              }}
            />
          ) : (
            /* Fallback plain nav while kit is still generating */
            <nav className="px-2 py-2 space-y-0.5">
              {TOOLS.slice(0, 3).map(tool => {
                const isActive = activeTool === tool.id
                const Icon = tool.icon
                return (
                  <button
                    key={tool.id}
                    onClick={() => {
                      if (tool.href) {
                        const href = tool.href(id)
                        if (href === `/library/${id}`) setActiveTool('notes')
                        else router.push(href)
                      } else {
                        setActiveTool(tool.id)
                      }
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all',
                      isActive ? 'bg-orange-500/10 text-orange-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs font-bold truncate">{tool.label}</span>
                  </button>
                )
              })}
            </nav>
          )}
        </div>
      </div>

      {/* ── Center: content ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Slim top bar — no title duplication */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0 bg-[#0d0d0d]">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/library" className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="text-xs text-slate-500 font-medium truncate hidden sm:block">{resource.title}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => refetch()} className="p-1.5 rounded-lg text-slate-600 hover:text-white hover:bg-white/5 transition-all" title="Refresh">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowChat(v => !v)} className="hidden lg:flex p-1.5 rounded-lg text-slate-600 hover:text-white hover:bg-white/5 transition-all" title="Toggle chat">
              {showChat ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto bg-[#0d0d0d] scrollbar-hide scroll-pt-4">
          {activeTool === 'notes' && (
            !hasNotes ? (
              <ProcessingView resource={resource} onDelete={() => setShowConfirmDelete(true)} />
            ) : (
              <RichNotesViewer
                key={notesViewKey}
                notes={resource.ai_notes_json}
                isEditing={isEditingNotes}
                setIsEditing={setIsEditingNotes}
                isMathMode={isMathMode}
                onSave={(updated) => { saveNotesMutation.mutate(updated); setIsEditingNotes(false) }}
                onOpenMath={(prob) => router.push(`/library/${id}/solver`)}
              />
            )
          )}

          {activeTool === 'content' && (
            <div className="h-full">
              {resource.resource_type === 'pdf' && resource.file_url ? (
                <PDFViewer fileUrl={resource.file_url} title={resource.title} />
              ) : resource.resource_type === 'video' && resource.url ? (
                <div className="h-full flex flex-col p-4 gap-3">
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
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                  <BookOpen className="w-8 h-8 opacity-30" />
                  <p className="text-sm">Preview not available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: AI Chat ────────────────────────────────────────── */}
      {showChat && (
        <div className="hidden lg:flex flex-col w-64 shrink-0">
          <AIChat resourceId={id} resourceTitle={resource.title} hasNotes={hasNotes} />
        </div>
      )}

      {showMusic && <MusicGeneratorModal resourceId={id} onClose={() => setShowMusic(false)} />}

      <ExpandableMobileHUD
        resourceId={id}
        onOpenQuiz={() => router.push(`/library/${id}/quiz`)}
        onOpenMindmap={() => router.push(`/library/${id}/mindmap`)}
        onOpenMusic={() => setShowMusic(true)}
        onOpenPodcast={() => router.push(`/library/${id}/podcast`)}
        onOpenFlashcards={() => router.push(`/library/${id}/flashcards`)}
        onOpenPractice={() => router.push(`/library/${id}/practice`)}
        onOpenChat={() => router.push(`/ai?resource=${id}`)}
        onOpenMath={() => router.push(`/library/${id}/solver`)}
      />

      {showConfirmDelete && (
        <ConfirmationModal
          isOpen={showConfirmDelete}
          title="Delete Resource"
          message={`Are you sure you want to delete "${resource.title}"? This cannot be undone.`}
          confirmText="Delete"
          type="danger"
          onConfirm={() => deleteMutation.mutate()}
          onClose={() => setShowConfirmDelete(false)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
