'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { aiApi, libraryApi } from '@/lib/api'
import {
  Sparkles, Send, Plus, Loader2, Image, Paperclip, X,
  ChevronRight, BookOpen, Network, GitBranch, Menu,
  BarChart2, Clock, Wand2, MessageSquare, Eye,
  Copy, Check, Download, RefreshCw, Zap, Brain, Trash2
} from 'lucide-react'
import { timeAgo, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Message = {
  role: 'user' | 'assistant'
  content: string
  image?: string   // base64 preview for user-uploaded images
  diagram?: string // mermaid code
  is_streaming?: boolean // true while chunking
}

const DIAGRAM_TYPES = [
  { id: 'auto',      label: 'Auto',      icon: Wand2,       desc: 'AI picks the best type' },
  { id: 'flowchart', label: 'Flowchart', icon: GitBranch,   desc: 'Processes & workflows' },
  { id: 'mindmap',   label: 'Mind Map',  icon: Network,     desc: 'Concepts & ideas' },
  { id: 'sequence',  label: 'Sequence',  icon: BarChart2,   desc: 'System interactions' },
]

const SUGGESTIONS = [
  { icon: '🧠', text: 'Explain backpropagation in simple terms' },
  { icon: '📝', text: 'Generate 5 quiz questions on thermodynamics' },
  { icon: '🔢', text: 'What are the key concepts in linear algebra?' },
  { icon: '🌿', text: 'Help me understand the Krebs cycle' },
  { icon: '💻', text: 'Explain Big O notation with examples' },
]

// ─── MERMAID RENDERER ────────────────────────────────────────────────────────
function MermaidChart({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setError(null)
    setSvg('')
    
    // Clean the chart code
    let cleanChart = chart.replace(/^```mermaid\n?/, '').replace(/\n?```$/, '').trim()
    if (cleanChart.startsWith('mermaid')) cleanChart = cleanChart.substring(7).trim()
    
    // Frontend sanitization as extra defense
    cleanChart = cleanChart
      .replace(/\|([^|]+)\|>/g, '|$1|')        // Fix |text|> arrows
      .replace(/-->\|([^|]+)\|>/g, '-->|$1|')   // Fix -->|text|> arrows
    
    if (!cleanChart || cleanChart.length < 5) {
      setError('Empty or invalid diagram code.')
      return
    }
    
    import('mermaid').then(async (mermaid) => {
      try {
        mermaid.default.initialize({ 
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'strict',
          fontFamily: 'Inter, system-ui, sans-serif',
          suppressErrorRendering: true
        })
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        const { svg: renderedSvg } = await mermaid.default.render(id, cleanChart)
        setSvg(renderedSvg)
      } catch (err: any) {
        console.error('Mermaid render error:', err)
        setError('Diagram syntax error. Try asking FlowAI to regenerate it.')
        // Clean up any error elements mermaid injected into the DOM
        document.querySelectorAll('[id^="dmermaid-"]').forEach(el => el.remove())
        document.querySelectorAll('.mermaid-error').forEach(el => el.remove())
      }
    })
    
    return () => {
      // Cleanup on unmount
      document.querySelectorAll('[id^="dmermaid-"]').forEach(el => el.remove())
    }
  }, [chart])

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl flex flex-col items-center gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 text-red-500 flex items-center justify-center">
          <Paperclip className="w-5 h-5" />
        </div>
        <div className="text-sm font-bold text-red-600 dark:text-red-400">{error}</div>
        <div className="text-[10px] font-mono opacity-50 max-w-full overflow-hidden truncate px-4">{chart.substring(0, 50)}...</div>
      </div>
    )
  }

  if (!svg) return <div className="p-8 text-center animate-pulse text-slate-400 font-bold tracking-widest text-xs uppercase">Rendering diagram...</div>
  return <div ref={containerRef} className="overflow-x-auto p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner" dangerouslySetInnerHTML={{ __html: svg }} />
}

// ─── TYPEWRITER EFFECT ───────────────────────────────────────────────────────
function Typewriter({ text, speed = 10, onComplete }: { text: string, speed?: number, onComplete?: () => void }) {
  const [displayedText, setDisplayedText] = useState('')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text[index])
        setIndex(prev => prev + 1)
      }, speed)
      return () => clearTimeout(timeout)
    } else if (onComplete) {
      onComplete()
    }
  }, [index, text, speed, onComplete])

  return (
    <div className="prose prose-slate dark:prose-invert prose-sm sm:prose-base max-w-none leading-relaxed">
      <ReactMarkdown
        components={{
          ul: ({ children }) => <ul className="space-y-4 my-4 list-none pl-0">{children}</ul>,
          li: ({ children }) => (
            <li className="flex gap-3 items-start group">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0 group-hover:scale-125 transition-transform shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
              <span className="text-slate-700 dark:text-slate-200">{children}</span>
            </li>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary font-black underline decoration-primary/30 underline-offset-4 hover:decoration-primary transition-all">
              {children}
            </a>
          )
        }}
      >
        {displayedText + (index < text.length ? '▊' : '')}
      </ReactMarkdown>
    </div>
  )
}

// ─── MESSAGE COMPONENT ───────────────────────────────────────────────────────
function MessageBubble({ msg, index, isLast, isNew }: { msg: Message, index: number, isLast: boolean, isNew?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [typingComplete, setTypingComplete] = useState(!isNew || msg.is_streaming)
  const isUser = msg.role === 'user'

  // PREVENT "BLACK BOX" SYNDROME: 
  // If the message is assistant, empty, and streaming, show nothing here.
  // The external "Thinking..." indicator handles the initial feedback.
  if (!isUser && !msg.content && !msg.image && !msg.diagram && msg.is_streaming) {
    return null;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied to clipboard')
  }

  const handleDownload = async () => {
    if (msg.image) {
      try {
        const downloadAction = async () => {
          const response = await fetch(msg.image!);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `flowai-image-${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        };

        toast.promise(downloadAction(), {
          loading: 'Preparing download...',
          success: 'Image downloaded!',
          error: 'Download failed. Try right-clicking the image.'
        });
      } catch (err) {
        // Fallback for base64 or simpler cases
        const link = document.createElement('a');
        link.href = msg.image;
        link.download = `flowai-image-${Date.now()}.png`;
        link.click();
      }
    } else if (msg.diagram) {
      // Find the specific SVG associated with this message index/content
      // We look for any SVG inside the current message bubble container
      const container = document.getElementById(`msg-${index}`);
      const svg = container?.querySelector('svg');
      
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `flowai-diagram-${Date.now()}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Diagram downloaded as SVG');
      } else {
        toast.error('Could not find diagram to download');
      }
    }
  }

  return (
    <div id={`msg-${index}`} className={cn('flex flex-col gap-3 group/msg', isUser ? 'items-end' : 'items-start')}>
      <div className={cn('flex items-center gap-2 mb-1', isUser ? 'flex-row-reverse' : 'flex-row')}>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm',
          isUser ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400')}>
          {isUser ? 'ME' : 'AI'}
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{isUser ? 'You' : 'FlowAI'}</span>
      </div>

      <div className={cn('max-w-[85%] sm:max-w-[75%] rounded-[1.5rem] p-4 sm:p-5 shadow-sm relative group',
        isUser 
          ? 'bg-slate-900 text-slate-100 rounded-tr-none' 
          : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-none')}>
        
        {msg.image && (
          <div className="mb-4 rounded-xl overflow-hidden border border-white/10 shadow-lg">
            <img src={msg.image} alt="uploaded" className="max-w-full h-auto" />
          </div>
        )}

        <div className="prose prose-slate dark:prose-invert prose-sm sm:prose-base max-w-none leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              ul: ({ children }) => <ul className="space-y-4 my-4 list-none pl-0">{children}</ul>,
              li: ({ children }) => (
                <li className="flex gap-3 items-start group">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0 group-hover:scale-125 transition-transform shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                  <span className="text-slate-700 dark:text-slate-200 font-medium">{children}</span>
                </li>
              ),
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary font-black underline decoration-primary/30 underline-offset-4 hover:decoration-primary transition-all">
                  {children}
                </a>
              )
            }}
          >
            {msg.content + (msg.is_streaming ? '▊' : '')}
          </ReactMarkdown>
        </div>

        {(typingComplete || isUser) && msg.diagram && (
          <div className="mt-6">
            <MermaidChart chart={msg.diagram} />
          </div>
        )}

        {!isUser && (
          <div className="absolute -right-12 top-0 flex flex-col gap-1 transition-opacity opacity-0 group-hover:opacity-100">
            <button onClick={handleCopy} className="p-2.5 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 text-slate-400 hover:text-primary transition-all active:scale-95" title="Copy text">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            {(msg.image || msg.diagram) && (
              <button onClick={handleDownload} className="p-2.5 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 text-slate-400 hover:text-emerald-500 transition-all active:scale-95" title="Download visual">
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MAIN CHAT ───────────────────────────────────────────────────────────────
function AIChat() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [sending, setSending] = useState(false)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [contextType, setContextType] = useState<'global' | 'resource'>('global')
  const [selectedResource, setSelectedResource] = useState<number | null>(null)
  const [activeSession, setActiveSession] = useState<any>(null)

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch historic data
  const { data: sessions = [] } = useQuery({ 
    queryKey: ['ai-sessions'], 
    queryFn: () => aiApi.getSessions().then(res => Array.isArray(res.data) ? res.data : (res.data.results || [])) 
  })
  const { data: resources = [] } = useQuery({ 
    queryKey: ['resources-library'], 
    queryFn: () => libraryApi.getResources().then(res => Array.isArray(res.data) ? res.data : (res.data.results || [])) 
  })

  useEffect(() => {
    const q = searchParams.get('q')
    if (q) { setInput(q); textareaRef.current?.focus() }
  }, [searchParams])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const startNew = () => {
    setMessages([])
    setActiveSession(null)
    setInput('')
    setAttachedFile(null)
    setFilePreview(null)
    toast.info('New chat started')
  }

  const loadSession = (session: any) => {
    // Clear current state first to prevent flash of old content
    setMessages([])
    setAttachedFile(null)
    setFilePreview(null)
    
    // Map backend fields (diagram_code, image) to frontend state (diagram, image)
    const mappedMessages = (session.messages || []).map((m: any) => ({
      role: m.role,
      content: m.content || '',
      diagram: m.diagram_code || m.diagram || undefined,
      image: m.image || undefined
    }))
    setMessages(mappedMessages)
    setActiveSession(session)
    setSidebarOpen(false)
  }

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation() // Prevent loading the session when clicking delete
    try {
      await aiApi.deleteSession(sessionId)
      queryClient.invalidateQueries({ queryKey: ['ai-sessions'] })
      if (activeSession?.id === sessionId) {
        startNew()
      }
      toast.success('Chat deleted successfully')
    } catch (err) {
      toast.error('Failed to delete chat')
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAttachedFile(file)
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => setFilePreview(reader.result as string)
        reader.readAsDataURL(file)
      } else {
        setFilePreview(null)
      }
    }
  }

  const removeFile = () => {
    setAttachedFile(null)
    setFilePreview(null)
  }

  const handleSend = async () => {
    if ((!input.trim() && !attachedFile) || sending) return
    
    const userMsg: Message = { role: 'user', content: input }
    if (filePreview) userMsg.image = filePreview
    
    setMessages(prev => [...prev, userMsg])
    const currentInput = input
    setInput('')
    setSending(true)
    
    try {
      let activeId = activeSession?.id;

      // Ensure we have a session for files if one doesn't exist
      if (attachedFile && !activeId) {
        const sessRes = await aiApi.createSession({ 
          title: currentInput.slice(0, 30) || 'Image Analysis',
          context_type: contextType,
          resource_id: selectedResource 
        });
        activeId = sessRes.data.id;
        setActiveSession(sessRes.data);
        queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
      }

      if (attachedFile) {
        // VISION: Still uses standard blocking API for now
        const responseRes = await aiApi.sendVisionMessage(activeId || 0, currentInput, attachedFile);
        const response = responseRes.data;
        const assistantMsgId = response.id;
        
        const assistantMsg: Message = { 
          role: 'assistant', 
          content: response.reply || response.content || '',
          diagram: response.diagram_code,
          image: response.image
        };
        
        setMessages(prev => [...prev, assistantMsg]);

        // Check for actions in vision mode too
        if (assistantMsg.content.includes('ACTION:')) {
           const parts = assistantMsg.content.split('ACTION:');
           try {
             const action = JSON.parse(parts[1].trim());
             if (action.tool === 'generate_image') {
               aiApi.generateImage(action.parameters.prompt, assistantMsgId).then(res => {
                 setMessages(prev => {
                   const updated = [...prev];
                   updated[updated.length - 1].image = res.data.url;
                   return updated;
                 });
               });
             } else if (action.tool === 'generate_diagram') {
               aiApi.generateDiagram(action.parameters.description || action.parameters.prompt, action.parameters.type || 'auto', assistantMsgId).then(res => {
                 setMessages(prev => {
                   const updated = [...prev];
                   updated[updated.length - 1].diagram = res.data.mermaid;
                   return updated;
                 });
               });
             }
           } catch(e) {}
        }
      } else {
        // CHAT: Stable Atomic Protocol (Production Standard)
        const placeholder: Message = { role: 'assistant', content: '', is_streaming: true };
        setMessages(prev => [...prev, placeholder]);

        const data = await aiApi.askAgent(
          currentInput,
          contextType === 'resource' ? `resource_id:${selectedResource}` : '',
          messages.map(m => ({ role: m.role, content: m.content })),
          false, // tutor mode
          activeId // session_id
        );

        if (data.reply) {
          if (data.session_id && !activeSession) {
            const newSession = { id: data.session_id, title: currentInput.slice(0, 30) || 'New Chat' };
            setActiveSession(newSession);
          }

          setMessages(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.role === 'assistant') {
              // Replace placeholder with final atomic message
              updated[lastIdx] = {
                role: 'assistant',
                content: data.reply,
                image: data.message?.image,
                diagram: data.message?.diagram,
                is_streaming: false
              };
            }
            return updated;
          });

          queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
        }
      }

      if (!activeSession) queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
    } catch (err) {
      console.error('AI Error:', err);
      toast.error('Intelligence Signal Interrupted');
    } finally {
      setSending(false)
      removeFile()
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-[calc(100vh-140px)] md:h-[calc(100vh-80px)] -m-4 md:-m-6 bg-slate-50 dark:bg-slate-950 relative overflow-hidden text-slate-800 dark:text-slate-200">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        'flex-shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 ease-out z-50 shadow-2xl lg:shadow-none overflow-hidden',
        'absolute lg:relative h-full top-0 left-0',
        sidebarOpen 
          ? 'w-[280px] md:w-[320px] translate-x-0 opacity-100' 
          : 'w-[280px] md:w-[320px] -translate-x-full lg:translate-x-0 lg:w-0 lg:border-r-0 lg:opacity-0 lg:pointer-events-none'
      )}>
        <div className="p-4 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 lg:border-transparent flex-shrink-0">
          <button onClick={startNew}
            className="w-full btn-primary py-3 flex-shrink-0 whitespace-nowrap">
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
          </div>

          {/* Document Selector (When in Resource Mode) */}
          {contextType === 'resource' && (
            <div className="px-4 pb-4 animate-fade-in-down">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-3 px-1 tracking-widest uppercase">Target Document</p>
              {resources.length === 0 ? (
                <div className="p-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50">
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">No documents found</p>
                   <p className="text-[9px] text-slate-400 mt-1">Upload a PDF to your library first</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                  {resources.map((res: any) => (
                    <button 
                      key={res.id} 
                      onClick={() => {
                        setSelectedResource(res.id);
                        toast.success(`Context set to: ${res.title}`);
                      }}
                      className={cn('w-full text-left p-2.5 rounded-xl transition-all flex items-center gap-3 group',
                        selectedResource === res.id 
                          ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm' 
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 border border-transparent'
                      )}
                    >
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-xs shadow-sm shadow-black/5',
                        selectedResource === res.id ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800'
                      )}>
                        {res.resource_type === 'video' ? '📺' : res.resource_type === 'pdf' ? '📄' : '📝'}
                      </div>
                      <span className="text-xs font-bold truncate flex-1">{res.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="px-4 pb-4">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-3 px-1 tracking-widest uppercase">AI Tools</p>
            <div className="space-y-1.5">
              <button 
                onClick={() => {
                  setInput('Generate a diagram for: ')
                  setSidebarOpen(false)
                  setTimeout(() => textareaRef.current?.focus(), 100)
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/20 text-violet-500 flex items-center justify-center"><Network className="w-4 h-4" /></div> Generate Diagram
              </button>
              <button 
                onClick={() => {
                  setInput('Generate an image showing: ')
                  setSidebarOpen(false)
                  setTimeout(() => textareaRef.current?.focus(), 100)
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-pink-50 dark:hover:bg-pink-500/10 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-500/20 text-pink-500 flex items-center justify-center"><Wand2 className="w-4 h-4" /></div> Generate Image
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
                    className={cn('w-full text-left px-3 py-3 rounded-xl transition-all group flex items-start gap-3 relative',
                      activeSession?.id === s.id
                        ? 'bg-primary/10 text-primary shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800')}>
                    <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-50" />
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="font-bold text-sm truncate">{s.title || 'Untitled Session'}</div>
                      <div className="text-slate-400 dark:text-slate-500 text-[10px] font-bold mt-1 uppercase tracking-wider">{timeAgo(s.updated_at)}</div>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
        <div className="flex items-center gap-3 px-4 md:px-6 py-3 md:py-4 glass-panel border-b border-slate-200 dark:border-slate-800 z-[50] sticky top-0 flex-shrink-0 shadow-sm">
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-primary hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-900 bg-white transition-all shadow-lg shadow-primary/5 active:scale-95">
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
            <Brain className="w-5 h-5 text-white" />
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
            <div className="ml-auto flex items-center gap-3 max-w-[50%]">
              <div className="hidden lg:flex text-[10px] font-black bg-white dark:bg-slate-800 text-slate-500 border border-slate-100 dark:border-slate-700 px-3 py-1.5 rounded-full uppercase tracking-wider truncate shadow-sm">
                {activeSession?.title || 'Current Thread'}
              </div>
              <button 
                onClick={startNew} 
                className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-xl text-primary bg-white dark:bg-slate-900 border border-primary/20 hover:bg-primary/5 dark:hover:bg-primary/10 transition-all font-black text-xs shadow-md shadow-primary/5 active:scale-95" 
                title="New chat"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Chat</span>
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
              <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">Hi, I'm FlowAI</h1>
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
            <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-fade-in">
              {messages.map((msg, i) => (
                <MessageBubble 
                  key={i} 
                  msg={msg} 
                  index={i}
                  isLast={i === messages.length - 1} 
                  isNew={!sending && i === messages.length - 1} 
                />
              ))}
              {sending && (
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Thinking...</span>
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
                  <input type="file" ref={fileRef} onChange={handleFile} className="hidden" accept="image/*,.pdf,.txt,.doc,.docx" />
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
            <div className="flex items-center justify-center md:justify-center gap-4 mt-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest flex-wrap pr-16 md:pr-0">
              <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> High-Speed Inference</span>
              <span className="hidden sm:flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Context Aware</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AIPage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <AIChat />
    </Suspense>
  )
}
