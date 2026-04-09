import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceApi } from '@/lib/api'
import { 
  Sparkles, Send, Wand2, Plus, Loader2, 
  MessageSquare, History, Users, Settings,
  Zap, Lightbulb, Brain
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import { toast } from 'sonner'

interface AIAssistantSidebarProps {
  workspaceId: number
  onInsertToCanvas: (text: string) => void
  socket: {
    sendMessage: (msg: any) => void
  }
}

export default function AIAssistantSidebar({ workspaceId, onInsertToCanvas, socket }: AIAssistantSidebarProps) {
  const [msg, setMsg] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()
  const { sendMessage } = socket

  const { data: messages } = useQuery({
    queryKey: ['workspace-messages', workspaceId],
    queryFn: () => workspaceApi.getMessages(workspaceId).then(r => r.data),
  })

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages?.length])

  const sendMutation = useMutation({
    mutationFn: (content: string) => workspaceApi.sendMessage(workspaceId, content),
    onSuccess: (res) => {
      setMsg('')
      qc.invalidateQueries({ queryKey: ['workspace-messages', workspaceId] })
    },
  })

  const handleAction = async (action: string) => {
    setIsThinking(true)
    try {
      const res = await workspaceApi.aiAssist(workspaceId, action)
      qc.invalidateQueries({ queryKey: ['workspace-messages', workspaceId] })
      if (['generate_outline', 'write_section', 'review'].includes(action)) {
        onInsertToCanvas(res.data.result)
      }
    } catch {
      toast.error('FlowAI is currently busy.')
    } finally {
      setIsThinking(false)
    }
  }

  const SUGGESTIONS = [
    { label: 'Generate Outline', action: 'generate_outline', icon: Zap },
    { label: 'Review Content', action: 'review', icon: Lightbulb },
    { label: 'Slides Outline', action: 'generate_slides', icon: Brain },
  ]

  return (
    <div className={cn(
      "flex flex-col h-full bg-transparent overflow-hidden transition-all duration-700 relative",
      (isThinking || sendMutation.isPending) && "after:absolute after:inset-0 after:pointer-events-none after:border-t-2 after:border-violet-500/40 after:animate-pulse"
    )}>
      {/* HUD Header */}
      <div className="px-6 py-6 border-b border-white/5 bg-white/[0.02] backdrop-blur-md flex-shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-violet-600/30 blur-xl rounded-full animate-pulse" />
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-2xl relative z-10 border border-white/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <h3 className="font-black text-white text-sm uppercase tracking-widest">FlowAI Master</h3>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]" />
                <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest opacity-80">Cognitive Stream Active</span>
              </div>
            </div>
          </div>
          <button className="p-2.5 text-white/20 hover:text-white hover:bg-white/5 rounded-2xl transition-all">
            <History className="w-4 h-4" />
          </button>
        </div>

        {/* Neural Suggestion Matrix */}
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s.action} onClick={() => handleAction(s.action)}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black text-white/40 uppercase tracking-widest hover:border-violet-500/50 hover:text-violet-400 hover:bg-violet-500/10 transition-all shadow-xl group/s">
              <s.icon className="w-3 h-3 group-hover/s:scale-110 transition-transform" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Intelligence Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {messages?.map((m: any) => (
          <div key={m.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500 group/msg">
            <div className="flex items-center gap-3 mb-3">
               <div className={cn("w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-black text-white shadow-2xl border border-white/10",
                 m.is_ai ? "bg-gradient-to-br from-violet-600 to-indigo-700" : "bg-white/10")}>
                 {m.is_ai ? <Sparkles className="w-3.5 h-3.5" /> : (m.author_name?.[0] || 'U')}
               </div>
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{m.is_ai ? 'FlowAI Core' : m.author_name}</span>
               <span className="text-[10px] text-white/10 font-black ml-auto">{format(new Date(m.created_at), 'HH:mm')}</span>
            </div>
            <div className={cn(
              "relative px-5 py-4 rounded-[1.8rem] text-[13px] lg:text-sm leading-[1.8] shadow-2xl transition-all duration-500 border border-transparent",
              m.is_ai ? "bg-violet-500/5 text-white/90 border-violet-500/10 backdrop-blur-sm" : 
              "bg-white/[0.03] text-white/60 border-white/5"
            )}>
              {m.is_ai ? (
                <div className="prose prose-invert prose-sm max-w-none prose-p:mb-4 prose-p:last:mb-0 prose-strong:text-violet-400 prose-code:text-sky-400 prose-code:bg-white/5">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                  <button onClick={() => onInsertToCanvas(m.content)}
                    className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] hover:bg-violet-400 hover:text-white transition-all shadow-xl active:scale-95">
                    <Plus className="w-3.5 h-3.5" /> Inject Specimen
                  </button>
                </div>
              ) : m.content}
            </div>
          </div>
        ))}
        {(isThinking || sendMutation.isPending) && (
          <div className="flex items-center gap-4 px-6 py-4 bg-violet-600/10 rounded-[2rem] border border-dashed border-violet-500/30 animate-pulse">
             <div className="relative">
                <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                <div className="absolute inset-0 bg-violet-500 blur-lg rounded-full opacity-50" />
             </div>
             <span className="text-[11px] font-black text-violet-400 uppercase tracking-[0.3em]">Synthesizing Intelligence...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Command HUD */}
      <div className="p-6 border-t border-white/5 bg-white/[0.01] flex-shrink-0">
        <div className="relative group/input">
          <textarea
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMutation.mutate(msg))}
            placeholder="Initialize cognitive query..."
            className="w-full pl-6 pr-14 py-4 bg-white/5 rounded-[2rem] border-2 border-transparent focus:border-violet-500/40 text-[13px] text-white outline-none transition-all resize-none shadow-2xl min-h-[60px] max-h-[200px] selection:bg-violet-500/30"
          />
          <button 
            disabled={!msg.trim() || sendMutation.isPending}
            onClick={() => sendMutation.mutate(msg)}
            className="absolute right-3 bottom-3 p-3 bg-white text-black rounded-2xl hover:bg-violet-400 hover:text-white transition-all disabled:opacity-20 shadow-2xl active:scale-90 group">
            {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />}
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-4">
           <Zap className="w-2.5 h-2.5 text-violet-400/40" />
           <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.3em] text-center">Neural Link Context Locked</p>
        </div>
      </div>
    </div>
  )
}
