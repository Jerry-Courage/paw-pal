'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { aiApi, libraryApi } from '@/lib/api'
import {
  Sparkles, Send, Plus, Loader2, Image, Paperclip, X,
  ChevronRight, BookOpen, Network, GitBranch, Menu,
  BarChart2, Clock, Wand2, MessageSquare, Eye,
  Copy, Check, Download, RefreshCw, Zap
} from 'lucide-react'
import { timeAgo, cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Message = {
  role: 'user' | 'assistant'
  content: string
  image?: string   // base64 preview for user-uploaded images
  diagram?: string // mermaid code
}

const DIAGRAM_TYPES = [
  { id: 'auto',      label: 'Auto',      icon: Wand2,       desc: 'AI picks the best type' },
  { id: 'flowchart', label: 'Flowchart', icon: GitBranch,   desc: 'Processes & workflows' },
  { id: 'mindmap',   label: 'Mind Map',  icon: Network,     desc: 'Concepts & ideas' },
  { id: 'sequence',  label: 'Sequence',  icon: BarChart2,   desc: 'System interactions' },
  { id: 'class',     label: 'Class',     icon: BookOpen,    desc: 'OOP & system design' },
  { id: 'er',        label: 'ER',        icon: Eye,         desc: 'Database relationships' },
  { id: 'state',     label: 'State',     icon: RefreshCw,   desc: 'State machines' },
  { id: 'timeline',  label: 'Timeline',  icon: Clock,       desc: 'Events over time' },
  { id: 'gantt',     label: 'Gantt',     icon: Download,    desc: 'Project schedules' },
]

const SUGGESTIONS = [
  { icon: '🧠', text: 'Explain backpropagation in simple terms' },
  { icon: '📝', text: 'Generate 5 quiz questions on thermodynamics' },
  { icon: '🔢', text: 'What are the key concepts in linear algebra?' },
  { icon: '🌿', text: 'Help me understand the Krebs cycle' },
  { icon: '💻', text: 'Explain Big O notation with examples' },
]

// ─── MERMAID RENDERER ────────────────────────────────────────────────────────
function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    import('mermaid').then(m => {
      m.default.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose', suppressErrorRendering: true })
      const id = 'mermaid-' + Math.random().toString(36).slice(2);
      m.default.render(id, code)
        .then(({ svg: s }) => { if (!cancelled) setSvg(s) })
        .catch(() => { 
          if (!cancelled) setError(true)
          const errorElement = document.getElementById(id); 
          if (errorElement) errorElement.remove();
        })
    }).catch(() => setError(true))
    return () => { cancelled = true }
  }, [code])

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (error) return (
    <div className="bg-rose-50 dark:bg-rose-900/10 rounded-2xl p-4 border border-rose-100 dark:border-rose-900/30">
      <div className="flex items-center gap-2 text-rose-500 mb-2">
        <X className="w-4 h-4" />
        <p className="text-[10px] font-bold uppercase tracking-widest">Diagram Render Failed</p>
      </div>
      <pre className="text-xs text-rose-600/70 dark:text-rose-400/70 overflow-x-auto whitespace-pre-wrap font-mono p-3 bg-white/50 dark:bg-black/20 rounded-xl border border-rose-100/50 dark:border-rose-900/20">{code}</pre>
    </div>
  )

  if (!svg) return (
    <div className="flex items-center gap-2 text-xs font-medium text-slate-400 py-4 px-2">
      <Loader2 className="w-4 h-4 animate-spin text-primary" /> Rendering diagram...
    </div>
  )

  return (
    <div className="relative group">
      <div dangerouslySetInnerHTML={{ __html: svg }} className="max-w-full overflow-x-auto rounded-lg" />
      <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={copy} className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all text-slate-500 hover:text-slate-700 border border-slate-100 dark:border-slate-700">
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

// ─── MESSAGE BUBBLE ──────────────────────────────────────────────────────────
function MessageBubble({ msg, isLast }: { msg: Message; isLast: boolean }) {
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === 'user'

  const copy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Message copied')
  }

  return (
    <div className={cn(
      'flex gap-3 sm:gap-4 group w-full animate-fade-in-up',
      isUser ? 'flex-row-reverse' : 'flex-row'
    )}>
      {/* Avatar / Icon */}
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="text-xs font-bold text-slate-500 italic">User</span>
          </div>
        ) : (
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-primary to-violet-600 rounded-full flex items-center justify-center shadow-lg shadow-primary/20 transform group-hover:scale-110 transition-transform duration-300">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        )}
      </div>

      {/* Message Content Area */}
      <div className={cn('flex-1 min-w-0 max-w-[85%] sm:max-w-[75%] space-y-2', isUser ? 'text-right' : 'text-left')}>
        {!isUser && (
          <div className="flex items-center gap-2 mb-1 px-1">
            <span className="text-[11px] font-black tracking-widest uppercase text-slate-400 dark:text-slate-500">FlowAI</span>
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          </div>
        )}

        <div className="relative group/content">
          {/* User Preview Image */}
          {msg.image && (
            <div className="mb-3 inline-block group/img">
              <img src={msg.image} alt="uploaded" className="max-w-[200px] sm:max-w-xs rounded-2xl border-2 border-white dark:border-slate-800 shadow-xl ring-1 ring-slate-200 dark:ring-slate-700 transition-transform hover:scale-[1.02] duration-300" />
            </div>
          )}

          {/* Text Bubble */}
          {msg.content && (
            <div className={cn(
              'inline-block px-4 sm:px-6 py-3 sm:py-4 transition-all duration-300 shadow-md',
              isUser
                ? 'bg-gradient-to-br from-primary to-sky-600 text-white rounded-3xl rounded-tr-sm text-left'
                : 'glass-card text-slate-800 dark:text-slate-200 rounded-3xl rounded-tl-sm prose prose-slate dark:prose-invert max-w-none prose-ai'
            )}>
              {isUser ? (
                <p className="whitespace-pre-wrap leading-relaxed font-medium text-[15px]">{msg.content}</p>
              ) : (
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      return !inline ? (
                        <div className="relative my-4 group/code">
                          <div className="absolute top-3 right-4 flex items-center gap-2 z-10 opacity-0 group-hover/code:opacity-100 transition-opacity">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{match ? match[1] : 'code'}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(String(children).replace(/\n$/, ''))
                                toast.success('Code copied')
                              }}
                              className="p-1.5 bg-white/10 hover:bg-white/20 rounded-md backdrop-blur-sm transition-colors border border-white/10"
                            >
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                          </div>
                          <pre className={cn(className, "p-4 sm:p-5 pt-12 overflow-x-auto scrollbar-hide")} {...props}>
                            <code className="text-[13.5px] font-mono leading-relaxed">{children}</code>
                          </pre>
                        </div>
                      ) : (
                        <code className={className} {...props}>{children}</code>
                      )
                    }
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}

              {/* Quick Action Button - Floating */}
              {!isUser && (
                <div className="absolute -right-12 top-0 flex flex-col gap-2 opacity-0 group-hover/content:opacity-100 transition-opacity duration-300 translate-x-2 group-hover/content:translate-x-0">
                  <button onClick={copy} className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-90 transition-all text-slate-400 hover:text-primary">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Diagram Result */}
        {msg.diagram && (
          <div className="glass-card rounded-3xl rounded-tl-sm p-5 sm:p-6 shadow-2xl max-w-full overflow-hidden w-full border-t-4 border-t-violet-500 animate-in zoom-in-95 duration-500">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-violet-500">
                <div className="p-2 bg-violet-100 dark:bg-violet-950/50 rounded-lg"><Network className="w-4 h-4" /></div>
                System Visualization
              </div>
              <div className="flex gap-2">
                 <button onClick={() => { navigator.clipboard.writeText(msg.diagram!); toast.success('Mermaid code copied') }} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><Copy className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl p-4 border border-slate-100 dark:border-slate-800/50">
              <MermaidDiagram code={msg.diagram} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DIAGRAM MODAL ───────────────────────────────────────────────────────────
function DiagramModal({ onClose, onInsert }: { onClose: () => void; onInsert: (code: string) => void }) {
  const [desc, setDesc] = useState('')
  const [type, setType] = useState('auto')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const generate = async () => {
    if (!desc.trim()) return
    setLoading(true)
    setResult('')
    try {
      const res = await aiApi.generateDiagram(desc, type)
      setResult(res.data.mermaid)
    } catch { toast.error('Failed to generate diagram.') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col border border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <div>
            <h2 className="font-extrabold text-xl flex items-center gap-2"><Network className="w-6 h-6 text-violet-500" /> Generate Diagram</h2>
            <p className="text-sm text-slate-500 mt-1">Describe anything — FlowAI picks the best diagram type automatically</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Type selector */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {DIAGRAM_TYPES.map(dt => (
              <button key={dt.id} onClick={() => setType(dt.id)}
                className={cn('flex flex-col items-center gap-2 p-3 rounded-2xl border-2 font-bold transition-all',
                  type === dt.id
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 shadow-sm'
                    : 'border-slate-100 dark:border-slate-800 text-slate-500 hover:border-violet-200 dark:hover:border-violet-900')}>
                <dt.icon className="w-5 h-5" />
                <span className="text-xs">{dt.label}</span>
              </button>
            ))}
          </div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generate()}
            placeholder={type === 'auto'
              ? 'Describe anything — e.g. "System analysis for a library management system" or "How photosynthesis works"'
              : `Describe your ${type} diagram...`}
            className="input resize-none w-full text-base min-h-[100px]" />
          <button onClick={generate} disabled={!desc.trim() || loading}
            className="btn-primary w-full py-4 text-base">
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating Graph...</> : <><Wand2 className="w-5 h-5" /> Generate Diagram</>}
          </button>
          {result && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 overflow-x-auto border border-slate-200 dark:border-slate-800">
                <MermaidDiagram code={result} />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => { onInsert(result); onClose() }}
                  className="btn-primary flex-1">
                  <MessageSquare className="w-4 h-4" /> Insert into Chat
                </button>
                <button onClick={generate} disabled={loading}
                  className="btn-secondary">
                  <RefreshCw className="w-4 h-4" /> Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MAIN CHAT ───────────────────────────────────────────────────────────────
function AIChat() {
  const searchParams = useSearchParams()
  const [activeSession, setActiveSession] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [contextType, setContextType] = useState<'global' | 'resource'>('global')
  const [selectedResource, setSelectedResource] = useState<number | null>(null)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [showDiagram, setShowDiagram] = useState(false)
  const [showImageGen, setShowImageGen] = useState(false)
  
  // Responsive sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isClient, setIsClient] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const qc = useQueryClient()

  useEffect(() => {
    setIsClient(true)
    if (window.innerWidth >= 1024) {
      setSidebarOpen(true)
    }
  }, [])

  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ['ai-sessions'],
    queryFn: () => aiApi.getSessions().then(r => r.data),
  })
  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })

  const sessions: any[] = sessionsData?.results || []
  const resources: any[] = resourcesData?.results || []

  useEffect(() => {
    const q = searchParams.get('q')
    if (q) { setInput(q); textareaRef.current?.focus() }
  }, [searchParams])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const loadSession = async (session: any) => {
    if (window.innerWidth < 1024) setSidebarOpen(false) // auto close on mobile
    try {
      const res = await aiApi.getSession(session.id)
      setActiveSession(res.data)
      const msgs: Message[] = (res.data.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content,
      }))
      setMessages(msgs)
    } catch { toast.error('Failed to load session.') }
  }

  const startNew = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false)
    setActiveSession(null)
    setMessages([])
    setInput('')
    setAttachedFile(null)
    setFilePreview(null)
  }

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachedFile(file)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = ev => setFilePreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setFilePreview(null)
    }
    e.target.value = ''
  }

  const removeFile = () => { setAttachedFile(null); setFilePreview(null) }

  const handleSend = async () => {
    if ((!input.trim() && !attachedFile) || sending) return
    setSending(true)
    const controller = new AbortController()
    abortControllerRef.current = controller

    const userContent = input.trim()
    const file = attachedFile
    const preview = filePreview

    setInput('')
    setAttachedFile(null)
    setFilePreview(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const userMsg: Message = {
      role: 'user',
      content: userContent || (file ? `Attached: ${file.name}` : ''),
      image: preview || undefined,
    }
    setMessages(m => [...m, userMsg])

    try {
      let session = activeSession
      if (!session) {
        const title = userContent.slice(0, 50) || file?.name || 'New chat'
        const res = await aiApi.createSession({
          context_type: contextType,
          resource: contextType === 'resource' ? selectedResource : null,
          title,
        })
        session = res.data
        setActiveSession(session)
        refetchSessions()
      }

      let res
      if (file) {
        res = await aiApi.sendVisionMessage(session.id, userContent, file, { signal: controller.signal })
      } else {
        res = await aiApi.sendMessage(session.id, userContent, { signal: controller.signal })
      }

      setMessages(m => [...m, { role: 'assistant', content: res.data.content }])
    } catch (err: any) {
      const msg = err?.response?.status === 429 ? 'Rate limit reached. Please wait a moment.' : 'AI unavailable. Please try again.'
      toast.error(msg)
      setMessages(m => m.slice(0, -1))
      setInput(userContent)
    } finally {
      setSending(false)
      abortControllerRef.current = null
    }
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      toast.info('Generation stopped.')
    }
  }

  const insertDiagram = (code: string) => {
    setMessages(m => [...m, { role: 'assistant', content: '', diagram: code }])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Smooth auto-resize
    e.target.style.height = 'auto'
    const nextHeight = Math.min(e.target.scrollHeight, 160)
    e.target.style.height = nextHeight + 'px'
  }

  if (!isClient) return null

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-[calc(100vh-140px)] md:h-[calc(100vh-80px)] -m-4 md:-m-6 bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        'flex-shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 ease-out z-50 shadow-2xl lg:shadow-none',
        'absolute lg:relative h-full top-0 left-0',
        sidebarOpen ? 'w-[280px] md:w-[320px] translate-x-0' : 'w-[280px] md:w-[320px] -translate-x-full lg:translate-x-0 lg:w-0 lg:border-r-0'
      )}>
        <div className="p-4 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 lg:border-transparent flex-shrink-0">
          <button onClick={startNew}
            className="flex-1 btn-primary py-3">
            <Plus className="w-4 h-4" /> New Chat
          </button>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 bg-white dark:bg-slate-800 hover:bg-slate-50 active:scale-95 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* Context */}
          <div className="px-4 pb-4">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-3 px-1 tracking-widest uppercase">Context</p>
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl">
              {(['global', 'resource'] as const).map(t => (
                <button key={t} onClick={() => { setContextType(t); startNew() }}
                  className={cn('flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all',
                    contextType === t ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700')}
                >
                  {t === 'global' ? 'Global' : 'Document'}
                </button>
              ))}
            </div>
            {contextType === 'resource' && (
              <select value={selectedResource || ''} onChange={e => setSelectedResource(Number(e.target.value) || null)}
                className="input text-xs mt-3 w-full bg-slate-50 dark:bg-slate-900">
                <option value="">Select resource...</option>
                {resources.map((r: any) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            )}
          </div>

          {/* Tools */}
          <div className="px-4 pb-4">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-3 px-1 tracking-widest uppercase">AI Tools</p>
            <div className="space-y-1.5">
              <button onClick={() => setShowDiagram(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/20 text-violet-500 flex items-center justify-center"><Network className="w-4 h-4" /></div> Generate Diagram
              </button>
              <button onClick={() => setShowImageGen(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-pink-50 dark:hover:bg-pink-500/10 hover:text-pink-600 dark:hover:text-pink-400 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-500/20 text-pink-500 flex items-center justify-center"><Wand2 className="w-4 h-4" /></div> Generate Image
              </button>
              <button onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-primary transition-colors group/tool">
                 <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-500/20 text-primary flex items-center justify-center group-hover/tool:scale-110 transition-transform"><Paperclip className="w-4 h-4" /></div> Analyze File
              </button>
            </div>
          </div>

          {/* Recent chats */}
          <div className="px-4 pb-6">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-3 px-1 tracking-widest uppercase">Recent History</p>
            {sessions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 border-dashed rounded-2xl">No historic chats</p>
            ) : (
              <div className="space-y-1">
                {sessions.slice(0, 20).map((s: any) => (
                  <button key={s.id} onClick={() => loadSession(s)}
                    className={cn('w-full text-left px-3 py-3 rounded-xl transition-all group flex items-start gap-3',
                      activeSession?.id === s.id
                        ? 'bg-primary/10 text-primary shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800')}>
                    <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-50" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{s.title || 'Untitled Session'}</div>
                      <div className="text-slate-400 dark:text-slate-500 text-[10px] font-bold mt-1 uppercase tracking-wider">{timeAgo(s.updated_at)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full bg-slate-50 dark:bg-slate-950">
        
        {/* Header */}
        <div className="flex items-center gap-3 px-4 md:px-6 py-3 md:py-4 glass-panel border-b border-slate-200 dark:border-slate-800 z-10 sticky top-0 flex-shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-900 bg-white transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <div className="font-extrabold text-base text-slate-900 dark:text-white">FlowAI Assistant</div>
            <div className="text-[11px] font-bold text-emerald-500 flex items-center gap-1.5 tracking-wide uppercase">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Systems normal
            </div>
          </div>

          {activeSession && (
            <div className="ml-auto flex items-center gap-2 max-w-[50%]">
              <div className="hidden sm:flex text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-3 py-1.5 rounded-full uppercase tracking-wider truncate">
                {activeSession.title || 'Active Session'}
              </div>
              <button onClick={startNew} className="p-2.5 rounded-xl text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ml-1" title="New chat">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto w-full">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full px-4 sm:px-6 py-12 text-center animate-fade-in-up">
              <div className="w-24 h-24 bg-gradient-to-br from-primary to-violet-500 rounded-[2rem] flex items-center justify-center mb-6 shadow-2xl shadow-primary/30 rotate-3 hover:rotate-6 transition-transform">
                <Sparkles className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3">Hi, I'm FlowAI</h2>
              <p className="text-slate-500 dark:text-slate-400 text-base max-w-sm mb-10 leading-relaxed font-medium">
                Your brilliant AI study partner. Drop a PDF, paste an image, or just start asking questions below!
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
                {SUGGESTIONS.map((s, i) => (
                  <button key={s.text} onClick={() => { setInput(s.text); textareaRef.current?.focus() }}
                    className={cn('flex items-start gap-4 p-4 glass-card text-left transition-all group hover:border-primary/50', 
                      i === SUGGESTIONS.length - 1 && 'sm:col-span-2 lg:col-span-1'
                    )}>
                    <div className="text-2xl flex-shrink-0 bg-slate-100 dark:bg-slate-800 p-2 rounded-xl group-hover:scale-110 transition-transform">{s.icon}</div>
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-primary transition-colors leading-relaxed mt-0.5">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-fade-in pb-8">
              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} isLast={i === messages.length - 1} />
              ))}
              {sending && (
                <div className="flex gap-4 justify-start w-full">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary to-violet-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                    <Sparkles className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div className="glass-card rounded-3xl rounded-tl-sm px-5 py-4 flex items-center gap-3 shadow-md max-w-[200px]">
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-1.5 items-center">
                        {[0,1,2].map(i => (
                          <div key={i} className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                      <button onClick={handleStop}
                        className="text-[10px] font-bold text-rose-500 hover:text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors border border-rose-100 dark:border-rose-900/50">
                        <X className="w-3 h-3" /> Stop
                      </button>
                      {messages[messages.length-1]?.role === 'user' && (messages[messages.length-1].image || messages[messages.length-1].content.includes('[PDF:')) && (
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest animate-pulse">Analyzing content...</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 sm:p-6 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent dark:from-slate-950 dark:via-slate-950 pb-6 sm:pb-8 flex-shrink-0 relative z-20">
          <div className="max-w-4xl mx-auto">
            
            {/* Attached file preview */}
            {attachedFile && (
              <div className="flex items-center gap-3 mb-4 p-3 glass-card rounded-2xl border border-primary/20 shadow-lg shadow-primary/5 animate-fade-in-up w-fit pr-10 relative">
                {filePreview ? (
                  <img src={filePreview} alt="preview" className="w-12 h-12 rounded-xl object-cover shadow-sm" />
                ) : (
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Paperclip className="w-5 h-5 text-primary" />
                  </div>
                )}
                <div>
                  <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100 max-w-[150px] sm:max-w-xs truncate">{attachedFile.name}</div>
                  <div className="text-xs font-bold text-slate-400 mt-0.5">{(attachedFile.size / 1024).toFixed(0)} KB</div>
                </div>
                <button onClick={removeFile} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 hover:dark:bg-slate-700 rounded-full transition-colors text-slate-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Input Wrapper */}
            <div className="relative glass-card rounded-3xl p-2 shadow-2xl focus-within:ring-4 ring-primary/20 transition-all duration-300 bg-white/95 dark:bg-slate-900/95 border-2 border-slate-100 dark:border-slate-800">
              <div className="flex items-end gap-2">
                
                {/* Plus context menu (mobile friendly) */}
                <div className="flex bg-slate-50 dark:bg-slate-800 rounded-2xl p-1 shrink-0 mb-1 ml-1">
                  <button onClick={() => fileRef.current?.click()}
                    className="p-2 sm:p-2.5 text-slate-500 hover:text-primary transition-colors hover:bg-white dark:hover:bg-slate-700 rounded-xl" title="Upload">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask FlowAI anything..."
                  className="flex-1 bg-transparent border-0 outline-none resize-none text-[15px] sm:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 py-3 sm:py-4 px-2 min-h-[50px] sm:min-h-[56px] max-h-[160px]"
                  style={{ lineHeight: '1.5' }}
                  rows={1}
                />

                {/* Send Button */}
                <button onClick={handleSend}
                  disabled={sending || (!input.trim() && !attachedFile)}
                  className={cn('p-3 sm:p-4 rounded-2xl flex-shrink-0 transition-all duration-300 mb-1 mr-1',
                    (input.trim() || attachedFile) && !sending
                      ? 'bg-primary hover:bg-primary-600 text-white shadow-lg shadow-primary/30 hover:-translate-y-1'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed')}>
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 translate-x-0.5" />}
                </button>
              </div>
            </div>
            
            {/* Footer tags */}
            <div className="flex items-center justify-center gap-4 mt-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest flex-wrap">
              <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> High-Speed Inference</span>
              <span className="hidden sm:flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Context Aware</span>
            </div>
          </div>
        </div>
      </div>

      <input ref={fileRef} type="file" className="hidden"
        accept="image/*,.pdf,.txt,.md,.doc,.docx"
        onChange={handleFileAttach} />

      {showDiagram && <DiagramModal onClose={() => setShowDiagram(false)} onInsert={insertDiagram} />}
      {showImageGen && <ImageGenModal onClose={() => setShowImageGen(false)} onInsert={(url, prompt) => {
        setMessages(m => [...m, { role: 'assistant', content: `Here's the generated image for: **${prompt}**`, image: url }])
      }} />}
    </div>
  )
}

export default function AIPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[calc(100vh-100px)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-primary to-violet-500 rounded-xl flex items-center justify-center animate-pulse">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Workspace...</p>
        </div>
      </div>
    }>
      <AIChat />
    </Suspense>
  )
}

// ─── IMAGE GENERATION MODAL ──────────────────────────────────────────────────
function ImageGenModal({ onClose, onInsert }: { onClose: () => void; onInsert: (url: string, prompt: string) => void }) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ url: string; prompt: string } | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setResult(null)
    setImgLoaded(false)
    try {
      const res = await aiApi.generateImage(prompt)
      setResult({ url: res.data.url, prompt: res.data.prompt })
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Failed to generate image.') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col border border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <div>
            <h2 className="font-extrabold text-xl flex items-center gap-2">
              <Wand2 className="w-6 h-6 text-pink-500" /> Image Generation
            </h2>
            <p className="text-sm text-slate-500 mt-1">High-quality AI visual creation</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generate()}
            placeholder="Describe the image you want... e.g. 'A detailed diagram of the human heart with labeled parts'"
            className="input resize-none w-full text-base min-h-[100px]" />
          <button onClick={generate} disabled={!prompt.trim() || loading}
            className="btn-primary w-full py-4 text-base !bg-pink-500 hover:!bg-pink-600 shadow-pink-500/30">
            {loading
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating Magic...</>
              : <><Wand2 className="w-5 h-5" /> Generate Image</>}
          </button>

          {loading && (
            <div className="flex flex-col items-center gap-4 py-10 text-slate-500">
              <div className="w-20 h-20 bg-gradient-to-br from-pink-100 to-violet-100 dark:from-pink-900/30 dark:to-violet-900/30 rounded-3xl flex items-center justify-center shadow-inner">
                <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
              </div>
              <p className="text-sm font-bold uppercase tracking-widest text-pink-500">Creating Masterpiece...</p>
            </div>
          )}

          {result && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4">
              <div className="relative rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-800/50 min-h-[300px] flex items-center justify-center border border-slate-200 dark:border-slate-700 p-2">
                {!imgLoaded && <Loader2 className="w-8 h-8 text-slate-400 animate-spin absolute" />}
                <img
                  src={result.url}
                  alt={result.prompt}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onLoad={() => setImgLoaded(true)}
                  onError={() => { setImgLoaded(true); toast.error('Image failed to load due to a server block. Try a different prompt.') }}
                  className={cn('w-full rounded-xl transition-opacity duration-500 shadow-sm', imgLoaded ? 'opacity-100' : 'opacity-0')}
                />
              </div>
              {result.prompt !== prompt && (
                <p className="text-xs font-medium text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                  <span className="font-bold text-pink-500">Enhanced Prompt:</span> {result.prompt}
                </p>
              )}
              <div className="flex flex-col md:flex-row gap-3">
                <button onClick={() => { onInsert(result.url, prompt); onClose() }}
                  className="btn-primary flex-1 !bg-pink-500 hover:!bg-pink-600 shadow-pink-500/20">
                  <MessageSquare className="w-4 h-4" /> Insert into Chat
                </button>
                <div className="flex gap-3">
                  <a href={result.url} download target="_blank" rel="noopener noreferrer"
                    className="btn-secondary flex-1 md:flex-none">
                    <Download className="w-4 h-4" /> Save
                  </a>
                  <button onClick={generate} disabled={loading}
                    className="btn-secondary flex-1 md:flex-none">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
