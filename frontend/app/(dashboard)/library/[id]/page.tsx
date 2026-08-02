'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'

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
  { id: 'quiz',       label: 'Quiz',       icon: 'quiz',            color: 'text-primary',    bg: 'bg-primary/10',    border: 'border-primary/20',    href: (id: number) => `/library/${id}/quiz` },
  { id: 'flashcards', label: 'Flashcards', icon: 'style',           color: 'text-tertiary',   bg: 'bg-tertiary/10',   border: 'border-tertiary/20',   href: (id: number) => `/library/${id}/flashcards` },
  { id: 'mindmap',    label: 'Mind Map',   icon: 'hub',             color: 'text-secondary',  bg: 'bg-secondary/10',  border: 'border-secondary/20',  href: (id: number) => `/library/${id}/mindmap` },
  { id: 'practice',   label: 'Practice',   icon: 'edit_note',       color: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/20',  href: (id: number) => `/library/${id}/practice` },
  { id: 'podcast',    label: 'Podcast',    icon: 'podcasts',        color: 'text-pink-400',   bg: 'bg-pink-400/10',   border: 'border-pink-400/20',   href: (id: number) => `/library/${id}/podcast` },
  { id: 'examprep',   label: 'Exam Prep',  icon: 'school',          color: 'text-primary',    bg: 'bg-primary/10',    border: 'border-primary/20',    href: (id: number) => `/library/${id}/examprep` },
  { id: 'solver',     label: 'Math',       icon: 'calculate',       color: 'text-secondary',  bg: 'bg-secondary/10',  border: 'border-secondary/20',  href: (id: number) => `/library/${id}/solver` },
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/25 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[16px]">auto_awesome</span>
          </div>
          <span className="text-xs font-black text-on-surface uppercase tracking-widest">Ask FlowAI</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
            <div className="w-14 h-14 rounded-3xl bg-primary/10 border border-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary/60 text-[28px]">auto_awesome</span>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-on-surface-variant">Ask anything</p>
              <p className="text-[11px] text-on-surface-variant/60 max-w-[160px] leading-relaxed">Summarize, explain, quiz me — FlowAI knows this material.</p>
            </div>
            {['Summarize this', 'Quiz me', 'Key concepts?'].map(q => (
              <button key={q} onClick={() => { setInput(q); inputRef.current?.focus() }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-bold text-primary bg-primary/10 border border-primary/15 hover:bg-primary/15 transition-all">
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
                  ? 'bg-primary-container text-on-primary-container rounded-tr-sm'
                  : 'bg-surface-container border border-outline-variant/20 text-on-surface/80 rounded-tl-sm'
              )}>
                {msg.role === 'user'
                  ? <p className="whitespace-pre-wrap">{msg.content}</p>
                  : <ReactMarkdown className="prose prose-invert prose-xs max-w-none">{normalizeReadableMath(msg.content)}</ReactMarkdown>}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex gap-1.5 px-3 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-2xl rounded-tl-sm w-fit">
            {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-outline-variant/25 shrink-0 space-y-2">
        <div className="flex items-end gap-2 bg-surface-container-low border border-outline-variant/20 rounded-2xl px-3 py-2 focus-within:border-secondary/50 focus-within:bg-surface-container-low/80 transition-all">
          <textarea
            ref={inputRef} rows={1} value={input}
            onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px' }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask me anything..."
            className="flex-1 bg-transparent text-xs text-on-surface placeholder:text-on-surface-variant/40 resize-none focus:outline-none max-h-[100px] py-0.5"
          />
          <button onClick={handleSend} disabled={sending || !input.trim()}
            className="p-1.5 rounded-xl bg-primary-container text-white hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none transition-all shrink-0">
            {sending ? <span className="material-symbols-outlined text-[14px] animate-spin">autorenew</span> : <span className="material-symbols-outlined text-[14px]">send</span>}
          </button>
        </div>
        <button onClick={() => { setMessages([]); setSessionId(null) }}
          className="w-full text-[10px] text-on-surface-variant/40 hover:text-on-surface-variant/60 transition-colors font-medium flex items-center justify-center gap-1">
          <span className="material-symbols-outlined text-[16px]">refresh</span> Reset chat
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
    <div className="fixed inset-0 md:left-64 mt-14 md:mt-0 bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 bg-primary/15 rounded-3xl flex items-center justify-center animate-pulse border border-primary/20">
          <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
        </div>
        <p className="text-[11px] text-on-surface-variant/60 uppercase tracking-[0.2em] font-black">Loading resource...</p>
      </div>
    </div>
  )

  if (!resource) return (
    <div className="fixed inset-0 md:left-64 mt-14 md:mt-0 bg-background flex flex-col items-center justify-center gap-4">
      <span className="material-symbols-outlined text-error text-[40px]">error</span>
      <h1 className="text-lg font-black text-on-surface">Resource Not Found</h1>
      <Link href="/library" className="text-sm text-primary hover:text-primary/80 transition-colors">← Back to Library</Link>
    </div>
  )

  const hasNotes = resource.has_study_kit && resource.ai_notes_json && Object.keys(resource.ai_notes_json).length > 0
  const resourceTypeLabel = resource.resource_type === 'pdf' ? 'PDF' : resource.resource_type === 'video' ? 'Video' : 'Material'

  return (
    <div className="fixed inset-0 md:left-64 mt-14 md:mt-0 bg-background flex flex-col overflow-hidden">

      {/* ── Ambient background glows ──────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 md:left-64 mt-14 md:mt-0 overflow-hidden z-0">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-72 h-72 rounded-full bg-tertiary/5 blur-3xl" />
      </div>

      {/* ── Top header bar ────────────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-3 border-b border-outline-variant/25 bg-background/80 backdrop-blur-md shrink-0">
        <Link href="/library" className="p-2 -ml-1 rounded-xl text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-primary/70 uppercase tracking-widest truncate">{resourceTypeLabel}</p>
          <h1 className="text-sm font-black text-on-surface leading-tight truncate">{resource.title}</h1>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* AI Chat toggle */}
          <button
            onClick={() => setShowChat(v => !v)}
            className={cn(
              'p-2 rounded-xl transition-all',
              showChat ? 'bg-primary/15 text-primary' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high'
            )}
            title="Ask FlowAI"
          >
            <span className="material-symbols-outlined text-[20px]">chat</span>
          </button>

          {/* Study path toggle */}
          {hasNotes && (
            <button
              onClick={() => setShowStudyPath(v => !v)}
              className={cn(
                'hidden sm:flex p-2 rounded-xl transition-all',
                showStudyPath ? 'bg-primary/15 text-primary' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high'
              )}
              title="Study Path"
            >
              <span className="material-symbols-outlined text-[20px]">stars</span>
            </button>
          )}

          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              className="p-2 rounded-xl text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">more_vert</span>
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-surface-container-low border border-outline-variant/40 rounded-2xl shadow-2xl z-40 overflow-hidden py-1">
                  <button onClick={() => { refetch(); setShowMoreMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all">
                    <span className="material-symbols-outlined text-[16px]">refresh</span> Refresh
                  </button>
                  <button onClick={() => { setShowMusic(true); setShowMoreMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all">
                    <span className="material-symbols-outlined text-[16px]">music_note</span> Study Music
                  </button>
                  {resource.resource_type === 'pdf' && (
                    <button onClick={() => { setActiveTool('content'); setShowMoreMenu(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all">
                      <span className="material-symbols-outlined text-[16px]">visibility</span> View Source
                    </button>
                  )}
                  <div className="h-px bg-outline-variant/30 mx-2 my-1" />
                  <button onClick={() => { setShowConfirmDelete(true); setShowMoreMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-error hover:bg-error-container/10 transition-all">
                    <span className="material-symbols-outlined text-[16px]">delete</span> Delete resource
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
          'hidden lg:flex flex-col shrink-0 border-r border-outline-variant/25 overflow-y-auto scrollbar-hide bg-background transition-all',
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
            <div className="hidden lg:block shrink-0 px-4 py-2.5 border-b border-outline-variant/20 bg-background/60">
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
                    <span className="material-symbols-outlined text-[14px]">{tool.icon}</span>
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
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-on-surface-variant/40">
                    <span className="material-symbols-outlined text-on-surface-variant/30 text-[40px]">menu_book</span>
                    <p className="text-sm">Preview not available</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: AI Chat panel (desktop) ────────────────────────────── */}
        <div className={cn(
          'hidden lg:flex flex-col shrink-0 border-l border-outline-variant/25 transition-all duration-300 bg-background',
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
          <div className="relative bg-surface-container-low border-t border-outline-variant/40 rounded-t-3xl flex flex-col shadow-2xl" style={{ height: '70vh' }}>
            {/* Drag handle */}
            <div className="flex items-center justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-outline-variant/30" />
            </div>
            <AIChat resourceId={id} resourceTitle={resource.title} onClose={() => setShowChat(false)} />
          </div>
        </div>
      )}

      {/* ── Mobile: bottom floating nav bar ──────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background/95 to-transparent">
        <div className="bg-surface-container-low/95 border border-outline-variant/40 rounded-2xl backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="flex overflow-x-auto scrollbar-hide px-2 py-2 gap-1">

            {/* Notes */}
            <button
              onClick={() => setActiveTool('notes')}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[56px] transition-all',
                activeTool === 'notes' ? 'bg-primary/15 text-primary' : 'text-on-surface-variant/40 hover:text-on-surface/80'
              )}
            >
              <span className="material-symbols-outlined text-[20px]">menu_book</span>
              <span className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap">Notes</span>
            </button>

            {/* Quick tools */}
            {QUICK_TOOLS.slice(0, 5).map(tool => (
              <button
                key={tool.id}
                onClick={() => router.push(tool.href(id))}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[56px] text-on-surface-variant/40 hover:text-on-surface/80 transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">{tool.icon}</span>
                <span className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap">{tool.label}</span>
              </button>
            ))}

            {/* AI Chat */}
            <button
              onClick={() => setShowChat(v => !v)}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[56px] transition-all',
                showChat ? 'bg-primary/15 text-primary' : 'text-on-surface-variant/40 hover:text-on-surface/80'
              )}
            >
              <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
              <span className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap">AI</span>
            </button>

            {/* Study Path (mobile) */}
            {hasNotes && (
              <button
                onClick={() => setShowStudyPath(v => !v)}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[56px] transition-all',
                  showStudyPath ? 'bg-primary/15 text-primary' : 'text-on-surface-variant/40 hover:text-on-surface/80'
                )}
              >
                <span className="material-symbols-outlined text-[20px]">stars</span>
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
          <div className="relative bg-surface-container-low border-t border-outline-variant/40 rounded-t-3xl overflow-y-auto scrollbar-hide shadow-2xl" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center justify-center pt-3 pb-1 sticky top-0 bg-surface-container-low z-10">
              <div className="w-10 h-1 rounded-full bg-outline-variant/30" />
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
