'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import {
  ArrowLeft, Loader2, X, RotateCcw, BookOpen,
  HelpCircle, Map, Wand2, Radio, Calculator, Layers,
  Send, Sparkles, Brain, MessageSquare, ChevronDown,
  FileText, Music2, Trash2, MoreVertical, Mic,
  Star, Zap, Eye
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { aiApi } from '@/lib/api'
import ReactMarkdown from 'react-markdown'
import { useStudyTimer } from '@/hooks/useStudyTimer'
import { normalizeReadableMath } from '@/lib/mathFormatting'

const PDFViewer = dynamic(() => import('@/components/library/PDFViewer'), { ssr: false })
const MusicGeneratorModal = dynamic(() => import('@/components/library/MusicGeneratorModal'), { ssr: false })
const RichNotesViewer = dynamic(() => import('@/components/library/RichNotesViewer'), { ssr: false })
const ProcessingView = dynamic(() => import('@/components/library/ProcessingView'), { ssr: false })
const StudyPath = dynamic(() => import('@/components/library/StudyPath'), { ssr: false })
const ConfirmationModal = dynamic(() => import('@/components/ui/ConfirmationModal'), { ssr: false })

// ── Quick-access tool pill config ────────────────────────────────────────────
const QUICK_TOOLS = [
  { id: 'quiz',       label: 'Quiz',       icon: HelpCircle, color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  href: (id: number) => `/library/${id}/quiz` },
  { id: 'flashcards', label: 'Flashcards', icon: Layers,     color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  href: (id: number) => `/library/${id}/flashcards` },
  { id: 'mindmap',    label: 'Mind Map',   icon: Map,        color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     href: (id: number) => `/library/${id}/mindmap` },
  { id: 'practice',   label: 'Practice',   icon: Wand2,      color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', href: (id: number) => `/library/${id}/practice` },
  { id: 'podcast',    label: 'Podcast',    icon: Radio,      color: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/20',    href: (id: number) => `/library/${id}/podcast` },
  { id: 'examprep',   label: 'Exam Prep',  icon: Brain,      color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   href: (id: number) => `/library/${id}/examprep` },
  { id: 'solver',     label: 'Math',       icon: Calculator, color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',    href: (id: number) => `/library/${id}/solver` },
]

// ── Inline AI Chat panel ──────────────────────────────────────────────────────
function AIChat({ resourceId, resourceTitle, onClose }: { resourceId: number; resourceTitle: string; onClose: () => void }) {
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <span className="text-xs font-black text-white uppercase tracking-widest">Ask FlowAI</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-600 hover:text-white hover:bg-white/5 transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-orange-400/60" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-400">Ask anything</p>
              <p className="text-[11px] text-slate-600 max-w-[160px] leading-relaxed">Summarize, explain, quiz me — FlowAI knows this material.</p>
            </div>
            {['Summarize this', 'Quiz me', 'Key concepts?'].map(q => (
              <button key={q} onClick={() => { setInput(q); inputRef.current?.focus() }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/15 hover:bg-orange-500/15 transition-all">
                {q}
              </button>
            ))}
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
              <div className={cn(
                'max-w-[88%] rounded-2xl px-3 py-2.5 text-xs leading-relaxed',
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white rounded-tr-sm'
                  : 'bg-white/[0.04] border border-white/[0.06] text-slate-300 rounded-tl-sm'
              )}>
                {msg.role === 'user'
                  ? <p className="whitespace-pre-wrap">{msg.content}</p>
                  : <ReactMarkdown className="prose prose-invert prose-xs max-w-none">{normalizeReadableMath(msg.content)}</ReactMarkdown>}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex gap-1.5 px-3 py-2.5 bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-tl-sm w-fit">
            {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-orange-400/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/5 shrink-0 space-y-2">
        <div className="flex items-end gap-2 bg-white/[0.03] border border-white/[0.06] rounded-2xl px-3 py-2 focus-within:border-orange-500/30 focus-within:bg-white/[0.05] transition-all">
          <textarea
            ref={inputRef} rows={1} value={input}
            onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px' }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask me anything..."
            className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-600 resize-none focus:outline-none max-h-[100px] py-0.5"
          />
          <button onClick={handleSend} disabled={sending || !input.trim()}
            className="p-1.5 rounded-xl bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-30 disabled:pointer-events-none transition-all shrink-0">
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          </button>
        </div>
        <button onClick={() => { setMessages([]); setSessionId(null) }}
          className="w-full text-[10px] text-slate-700 hover:text-slate-500 transition-colors font-medium flex items-center justify-center gap-1">
          <RotateCcw className="w-2.5 h-2.5" /> Reset chat
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ResourcePage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const router = useRouter()
  const [activeTool, setActiveTool] = useState('notes')
  const [notesViewKey, setNotesViewKey] = useState(0)
  const [showChat, setShowChat] = useState(false)
  const [showStudyPath, setShowStudyPath] = useState(false)
  const [showMusic, setShowMusic] = useState(false)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const qc = useQueryClient()

  useStudyTimer(true)

  const { data: resource, isLoading, refetch } = useQuery({
    queryKey: ['resource', id],
    queryFn: () => libraryApi.getResource(id).then(r => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as any
      const isFullyReady = (data?.status === 'ready' && data?.has_study_kit === true) || data?.status === 'failed'
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
    onError: (err: any) => {
      let msg = 'Delete failed.'
      if (err.response) {
        if (typeof err.response.data === 'object' && err.response.data !== null) {
          msg = err.response.data.error || err.response.data.detail || msg
        } else {
          msg = `Delete failed: Server returned status ${err.response.status}`
        }
      } else if (err.request) {
        msg = 'Delete failed: No response received from server.'
      } else {
        msg = `Delete failed: ${err.message}`
      }
      toast.error(msg)
    }
  })

  if (isLoading) return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#080809] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-orange-500/20 to-amber-500/10 rounded-3xl flex items-center justify-center animate-pulse border border-orange-500/20">
          <Sparkles className="w-6 h-6 text-orange-400" />
        </div>
        <p className="text-[11px] text-slate-600 uppercase tracking-[0.2em] font-black">Loading resource...</p>
      </div>
    </div>
  )

  if (!resource) return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#080809] flex flex-col items-center justify-center gap-4">
      <X className="w-8 h-8 text-rose-500" />
      <h1 className="text-lg font-black text-white">Resource Not Found</h1>
      <Link href="/library" className="text-sm text-orange-400 hover:text-orange-300 transition-colors">← Back to Library</Link>
    </div>
  )

  const hasNotes = resource.has_study_kit && resource.ai_notes_json && Object.keys(resource.ai_notes_json).length > 0
  const resourceTypeLabel = resource.resource_type === 'pdf' ? 'PDF' : resource.resource_type === 'video' ? 'Video' : 'Material'

  return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#080809] flex flex-col overflow-hidden">

      {/* ── Ambient background glows ──────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 [top:var(--nav-height)] overflow-hidden z-0">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-orange-500/[0.04] blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-72 h-72 rounded-full bg-violet-500/[0.04] blur-3xl" />
      </div>

      {/* ── Top header bar ────────────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] bg-[#080809]/80 backdrop-blur-md shrink-0">
        <Link href="/library" className="p-2 -ml-1 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-all">
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-orange-400/70 uppercase tracking-widest truncate">{resourceTypeLabel}</p>
          <h1 className="text-sm font-black text-white leading-tight truncate">{resource.title}</h1>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* AI Chat toggle */}
          <button
            onClick={() => setShowChat(v => !v)}
            className={cn(
              'p-2 rounded-xl transition-all',
              showChat ? 'bg-orange-500/15 text-orange-400' : 'text-slate-500 hover:text-white hover:bg-white/5'
            )}
            title="Ask FlowAI"
          >
            <MessageSquare className="w-4 h-4" />
          </button>

          {/* Study path toggle */}
          {hasNotes && (
            <button
              onClick={() => setShowStudyPath(v => !v)}
              className={cn(
                'hidden sm:flex p-2 rounded-xl transition-all',
                showStudyPath ? 'bg-orange-500/15 text-orange-400' : 'text-slate-500 hover:text-white hover:bg-white/5'
              )}
              title="Study Path"
            >
              <Star className="w-4 h-4" />
            </button>
          )}

          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-all"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-[#111116] border border-white/[0.08] rounded-2xl shadow-2xl z-40 overflow-hidden py-1">
                  <button onClick={() => { refetch(); setShowMoreMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                    <RotateCcw className="w-3.5 h-3.5" /> Refresh
                  </button>
                  <button onClick={() => { setShowMusic(true); setShowMoreMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                    <Music2 className="w-3.5 h-3.5" /> Study Music
                  </button>
                  {resource.resource_type === 'pdf' && (
                    <button onClick={() => { setActiveTool('content'); setShowMoreMenu(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                      <Eye className="w-3.5 h-3.5" /> View Source
                    </button>
                  )}
                  <div className="h-px bg-white/5 mx-2 my-1" />
                  <button onClick={() => { setShowConfirmDelete(true); setShowMoreMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-all">
                    <Trash2 className="w-3.5 h-3.5" /> Delete resource
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Main body ─────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">

        {/* ── LEFT: Study Path (desktop sidebar) ───────────────────────── */}
        <div className={cn(
          'hidden lg:flex flex-col shrink-0 border-r border-white/[0.05] overflow-y-auto scrollbar-hide bg-[#080809] transition-all',
          hasNotes ? 'w-60' : 'w-0 border-r-0 overflow-hidden'
        )}>
          {hasNotes && (
            <StudyPath
              resourceId={id}
              onStepClick={(step) => {
                if (step === 'notes') {
                  setActiveTool('notes')
                  setNotesViewKey(prev => prev + 1)
                  toast.info("You're now in Understand — the study path is ready.", { duration: 2200 })
                } else {
                  router.push(`/library/${id}/${step}`)
                }
              }}
            />
          )}
        </div>

        {/* ── CENTER: Content area ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Quick tool pills — visible on desktop, hidden on mobile */}
          {hasNotes && (
            <div className="hidden lg:block shrink-0 px-4 py-2.5 border-b border-white/[0.04] bg-[#080809]/60">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
                {QUICK_TOOLS.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => router.push(tool.href(id))}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wide whitespace-nowrap transition-all hover:opacity-90 active:scale-95',
                      tool.color, tool.bg, tool.border
                    )}
                  >
                    <tool.icon className="w-3 h-3" />
                    {tool.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide pb-24 lg:pb-4">
            {activeTool === 'notes' && (
              !hasNotes ? (
                <ProcessingView resource={resource} onDelete={() => setShowConfirmDelete(true)} />
              ) : (
                <RichNotesViewer
                  key={notesViewKey}
                  resourceId={id}
                  notes={resource.ai_notes_json}
                  isEditing={isEditingNotes}
                  setIsEditing={setIsEditingNotes}
                  isMathMode={isMathMode}
                  onSave={(updated) => { saveNotesMutation.mutate(updated); setIsEditingNotes(false) }}
                  onOpenMath={() => router.push(`/library/${id}/solver`)}
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

        {/* ── RIGHT: AI Chat panel (desktop) ────────────────────────────── */}
        <div className={cn(
          'hidden lg:flex flex-col shrink-0 border-l border-white/[0.05] transition-all duration-300 bg-[#080809]',
          showChat ? 'w-72' : 'w-0 border-l-0 overflow-hidden'
        )}>
          {showChat && (
            <AIChat resourceId={id} resourceTitle={resource.title} onClose={() => setShowChat(false)} />
          )}
        </div>
      </div>

      {/* ── Mobile: bottom floating AI chat sheet ─────────────────────────── */}
      {showChat && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowChat(false)} />
          <div className="relative bg-[#0e0e12] border-t border-white/[0.08] rounded-t-3xl flex flex-col shadow-2xl" style={{ height: '70vh' }}>
            {/* Drag handle */}
            <div className="flex items-center justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/10" />
            </div>
            <AIChat resourceId={id} resourceTitle={resource.title} onClose={() => setShowChat(false)} />
          </div>
        </div>
      )}

      {/* ── Mobile: bottom floating nav bar ──────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 pt-2 bg-gradient-to-t from-[#080809] via-[#080809]/95 to-transparent">
        <div className="bg-[#111116]/95 border border-white/[0.08] rounded-2xl backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="flex overflow-x-auto scrollbar-hide px-2 py-2 gap-1">

            {/* Notes */}
            <button
              onClick={() => setActiveTool('notes')}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[56px] transition-all',
                activeTool === 'notes' ? 'bg-orange-500/15 text-orange-400' : 'text-slate-600 hover:text-slate-300'
              )}
            >
              <BookOpen className="w-4 h-4" />
              <span className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap">Notes</span>
            </button>

            {/* Quick tools */}
            {QUICK_TOOLS.slice(0, 5).map(tool => (
              <button
                key={tool.id}
                onClick={() => router.push(tool.href(id))}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[56px] text-slate-600 hover:text-slate-300 transition-all"
              >
                <tool.icon className="w-4 h-4" />
                <span className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap">{tool.label}</span>
              </button>
            ))}

            {/* AI Chat */}
            <button
              onClick={() => setShowChat(v => !v)}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[56px] transition-all',
                showChat ? 'bg-orange-500/15 text-orange-400' : 'text-slate-600 hover:text-slate-300'
              )}
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap">AI</span>
            </button>

            {/* Study Path (mobile) */}
            {hasNotes && (
              <button
                onClick={() => setShowStudyPath(v => !v)}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[56px] transition-all',
                  showStudyPath ? 'bg-orange-500/15 text-orange-400' : 'text-slate-600 hover:text-slate-300'
                )}
              >
                <Star className="w-4 h-4" />
                <span className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap">Path</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile: Study Path bottom sheet ──────────────────────────────── */}
      {showStudyPath && hasNotes && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowStudyPath(false)} />
          <div className="relative bg-[#0e0e12] border-t border-white/[0.08] rounded-t-3xl overflow-y-auto scrollbar-hide shadow-2xl" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center justify-center pt-3 pb-1 sticky top-0 bg-[#0e0e12] z-10">
              <div className="w-10 h-1 rounded-full bg-white/10" />
            </div>
            <StudyPath
              resourceId={id}
              onStepClick={(step) => {
                setShowStudyPath(false)
                if (step === 'notes') {
                  setActiveTool('notes')
                  setNotesViewKey(prev => prev + 1)
                } else {
                  router.push(`/library/${id}/${step}`)
                }
              }}
            />
          </div>
        </div>
      )}

      {showMusic && <MusicGeneratorModal resourceId={id} onClose={() => setShowMusic(false)} />}

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
