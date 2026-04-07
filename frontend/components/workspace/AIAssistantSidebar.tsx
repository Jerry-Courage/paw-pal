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
      // Broadcast via socket
      sendMessage({
        type: 'chat_message',
        content: msg,
        created_at: new Date().toISOString()
      })
      
      setMsg('')
      qc.invalidateQueries({ queryKey: ['workspace-messages', workspaceId] })
      if (res.data?.ai_message) {
        setTimeout(() => qc.invalidateQueries({ queryKey: ['workspace-messages', workspaceId] }), 500)
      }
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
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-100 dark:border-gray-800 transition-all duration-500 animate-in slide-in-from-right-2">
      {/* AI Header */}
      <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center shadow-lg shadow-violet-200 dark:shadow-none">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">FlowAI Expert</h3>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest">Active Assistant</span>
              </div>
            </div>
          </div>
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <History className="w-4 h-4" />
          </button>
        </div>

        {/* Action Pills */}
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s.action} onClick={() => handleAction(s.action)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-[10px] font-bold text-gray-600 dark:text-gray-400 hover:border-violet-300 hover:text-violet-600 transition-all shadow-sm">
              <s.icon className="w-3 h-3" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {messages?.map((m: any) => (
          <div key={m.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 mb-2">
               <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shadow-sm",
                 m.is_ai ? "bg-gradient-to-br from-violet-400 to-sky-400" : "bg-sky-500")}>
                 {m.is_ai ? <Sparkles className="w-3 h-3" /> : m.author_name[0]}
               </div>
               <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{m.is_ai ? 'FlowAI' : m.author_name}</span>
               <span className="text-[10px] text-gray-300 dark:text-gray-600 ml-auto">{format(new Date(m.created_at), 'HH:mm')}</span>
            </div>
            <div className={cn(
              "px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm",
              m.is_ai ? "bg-violet-50 dark:bg-violet-950/20 text-gray-800 dark:text-gray-200 border-l-4 border-violet-500 prose prose-sm dark:prose-invert max-w-none" : 
              "bg-gray-50/50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-800"
            )}>
              {m.is_ai ? (
                <>
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                  <button onClick={() => onInsertToCanvas(m.content)}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-1.5 rounded-xl bg-white dark:bg-gray-800 border border-violet-200 dark:border-violet-900/50 text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 transition-all shadow-sm">
                    <Plus className="w-3.5 h-3.5" /> Insert into Workspace
                  </button>
                </>
              ) : m.content}
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="flex items-center gap-3 px-4 py-3 bg-violet-50/50 dark:bg-violet-950/10 rounded-2xl border border-dashed border-violet-200 dark:border-violet-900/50 animate-pulse transition-all">
             <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
             <span className="text-[11px] font-bold text-violet-400 uppercase tracking-widest">Expert Thinking...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="relative group">
          <textarea
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMutation.mutate(msg))}
            placeholder="Ask FlowAI for help..."
            className="w-full pl-4 pr-12 py-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-transparent focus:border-violet-400 dark:focus:border-violet-500 text-[13px] outline-none transition-all resize-none shadow-inner min-h-[50px] max-h-[150px]"
          />
          <button 
            disabled={!msg.trim() || sendMutation.isPending}
            onClick={() => sendMutation.mutate(msg)}
            className="absolute right-3 bottom-3 p-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-all disabled:bg-gray-200 dark:disabled:bg-gray-700 shadow-lg shadow-violet-200 dark:shadow-none">
            {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-2 font-medium">FlowAI is aware of all linked sources & canvas content.</p>
      </div>
    </div>
  )
}
