'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  Sparkles, Send, BookOpen, HelpCircle, 
  MessageSquare, Wand2, X, Loader2,
  ChevronRight, PanelBottomOpen, ChevronDown, Radio, Mic2, Calculator, Phone
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { aiApi } from '@/lib/api'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

interface StudyCompanionSidebarProps {
  resourceId: number
  resourceTitle: string
  hasNotes?: boolean
  onOpenQuiz: () => void
  onOpenFlashcards: () => void
  onOpenMindMap: () => void
  onOpenPractice: () => void
  onOpenMusic: () => void
  onOpenPodcast?: () => void
  onOpenMath?: () => void
  isGenerating?: string | null 
  hideTools?: boolean
  isHUD?: boolean
  currentTheme?: string
  onThemeChange?: (theme: string) => void
}

export default function StudyCompanionSidebar({ 
  resourceId, 
  resourceTitle,
  hasNotes,
  onOpenQuiz, 
  onOpenFlashcards,
  onOpenMindMap,
  onOpenPractice,
  onOpenMusic,
  onOpenPodcast,
  onOpenMath,
  isGenerating,
  hideTools,
  isHUD,
  currentTheme,
  onThemeChange
}: StudyCompanionSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([])
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
      let currentSessionId = sessionId
      if (!currentSessionId) {
        const sessionRes = await aiApi.createSession({
          title: `Study: ${resourceTitle}`,
          context_type: 'resource',
          resource: resourceId
        })
        currentSessionId = sessionRes.data.id
        setSessionId(currentSessionId)
      }
      const res = await aiApi.sendMessage(currentSessionId!, userMsg)
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.content }])
    } catch (error: any) {
      toast.error("FlowAI is currently busy. Try again soon.")
      setMessages(prev => prev.slice(0, -1))
      setInput(userMsg)
    } finally {
      setSending(false)
    }
  }

  const ToolCard = ({ icon: Icon, title, desc, onClick, color, id, badge }: any) => {
    return (
      <button 
        onClick={onClick}
        disabled={!!isGenerating}
        className={cn(
          "group relative overflow-hidden p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 transition-all text-left hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/30 active:scale-95",
          isGenerating === id ? "ring-2 ring-primary border-transparent" : "",
          isGenerating && isGenerating !== id ? "opacity-40 grayscale" : ""
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <div className={cn("p-2 rounded-xl transition-transform group-hover:rotate-6 shadow-sm", color)}>
            <Icon className="w-4 h-4" />
          </div>
          {badge && <span className="text-[7px] font-black uppercase tracking-widest text-primary/60 bg-primary/5 px-1.5 py-0.5 rounded-full">{badge}</span>}
          {isGenerating === id && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
        </div>
        <div className="font-black text-[11px] text-slate-800 dark:text-slate-100 truncate tracking-tight uppercase">{title}</div>
        <p className="text-[9px] text-slate-500 mt-1 leading-none opacity-60 truncate font-medium">{desc}</p>
        
        {/* Background Glow */}
        <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-primary/5 blur-2xl rounded-full group-hover:bg-primary/10 transition-colors" />
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.05)] dark:shadow-none overflow-hidden relative transition-all duration-700 w-full">
      
      {!hideTools && (
        <div className="p-4 flex-shrink-0 bg-slate-50/30 dark:bg-slate-900 border-b border-slate-100 dark:border-white/5 transition-all">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <ToolCard id="quiz" icon={HelpCircle} title="Quiz" desc="Mastery MCQ" onClick={onOpenQuiz} color="bg-orange-500/10 text-orange-500" badge="ACTIVE" />
            <ToolCard id="flashcards" icon={BookOpen} title="Flash" desc="Recall Boost" onClick={onOpenFlashcards} color="bg-sky-500/10 text-sky-500" />
            <ToolCard id="mindmap" icon={Sparkles} title="Map" desc="Neural Web" onClick={onOpenMindMap} color="bg-violet-500/10 text-violet-500" />
            <ToolCard id="podcast" icon={Radio} title="Podcast" desc="FlowCast AI" onClick={onOpenPodcast} color="bg-pink-500/10 text-pink-500" badge="AI" />
            <ToolCard id="tutor" icon={Phone} title="Tutor" desc="Live Call" onClick={() => window.location.href = '/tutor-call'} color="bg-indigo-500/10 text-indigo-500" badge="LIVE" />
            <ToolCard id="math" icon={Calculator} title="Solver" desc="Step Logic" onClick={onOpenMath} color="bg-indigo-500/10 text-indigo-500" badge="PRO" />
            <ToolCard id="practice" icon={Wand2} title="Drill" desc="Mock Exam" onClick={onOpenPractice} color="bg-emerald-500/10 text-emerald-500" />
            <ToolCard id="music" icon={Mic2} title="Focus" desc="Alpha Wave" onClick={onOpenMusic} color="bg-rose-500/10 text-rose-500" badge="Lofi" />
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-8 scrollbar-hide bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="relative">
              <div className="w-24 h-24 bg-gradient-to-br from-primary via-violet-500 to-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-primary/30 transform rotate-6 animate-pulse">
                <Sparkles className="w-12 h-12 text-white" />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-lg border border-slate-100 dark:border-slate-700">
                <MessageSquare className="w-4 h-4 text-primary" />
              </div>
            </div>
            <div>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-[0.9]">Hey, I'm FlowAI</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 leading-relaxed max-w-[200px] mx-auto font-medium opacity-80">
                Synchronizing with your notes to provide deep insights.
              </p>
            </div>
            {hasNotes && (
              <div className="w-full space-y-3 bg-white/50 dark:bg-slate-950/40 p-4 rounded-3xl border border-slate-100 dark:border-white/5 backdrop-blur-md">
                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Cognitive Sync Active
                </div>
                <div className="flex flex-col gap-2 mt-4">
                  {['Explain core concepts', 'Key diagrams?', 'High-yield questions'].map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-[11px] text-left px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white transition-all font-black uppercase tracking-tight shadow-sm border border-slate-100 dark:border-white/5"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn(
              "flex gap-4 animate-in slide-in-from-bottom-4 duration-500",
              msg.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}>
              <div className={cn(
                "flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-110",
                msg.role === 'user' ? "bg-slate-100 dark:bg-slate-800" : "bg-gradient-to-br from-primary to-violet-600 text-white"
              )}>
                {msg.role === 'user' ? <span className="text-[10px] font-black">ME</span> : <Sparkles className="w-5 h-5" />}
              </div>
              <div className={cn(
                "max-w-[85%] rounded-[1.5rem] px-5 py-4 text-sm shadow-xl",
                msg.role === 'user' 
                  ? "bg-primary text-white rounded-tr-none font-medium" 
                  : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none prose prose-slate dark:prose-invert max-w-none prose-sm font-medium border border-slate-100 dark:border-white/5"
              )}>
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                ) : (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex gap-4 animate-pulse">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="h-14 w-32 bg-slate-100 dark:bg-slate-800 rounded-[1.5rem] flex items-center justify-center gap-2 border border-slate-100 dark:border-white/5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      <div className="p-5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-white/5 relative z-10">
        <div className="relative group focus-within:ring-4 ring-primary/20 transition-all bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] p-3 border-2 border-slate-100 dark:border-white/5">
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Ask FlowAI..."
              className="flex-1 bg-transparent border-0 focus:ring-0 text-sm max-h-[150px] resize-none py-2 px-1 font-medium placeholder:text-slate-400"
            />
            <button 
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className={cn(
                "p-3 rounded-2xl transition-all shadow-lg active:scale-90",
                input.trim() ? "bg-primary text-white hover:shadow-primary/30" : "bg-slate-200 dark:bg-slate-700 text-slate-400"
              )}
            >
              {sending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* THEME SELECTOR - Extended View */}
      {!hideTools && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-white/5 bg-slate-50/20 flex items-center justify-between">
           <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aesthetic</span>
           <div className="flex gap-2">
              {[
                { id: 'theme-slate', color: 'bg-slate-500' },
                { id: 'theme-indigo', color: 'bg-indigo-500' },
                { id: 'theme-rose', color: 'bg-rose-500' },
                { id: 'theme-emerald', color: 'bg-emerald-500' },
                { id: 'theme-amber', color: 'bg-amber-500' },
              ].map(t => (
                <button 
                  key={t.id}
                  onClick={() => onThemeChange?.(t.id)}
                  className={cn(
                    "w-3 h-3 rounded-full transition-all hover:scale-125 border border-white/20",
                    t.color,
                    currentTheme === t.id ? "ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-900 scale-110" : "opacity-40"
                  )}
                />
              ))}
           </div>
        </div>
      )}
    </div>
  )
}
