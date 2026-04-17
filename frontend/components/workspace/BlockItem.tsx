import { useState, useRef, useEffect } from 'react'
import { 
  GripVertical, Trash2, Wand2, Plus, Type, FileText, 
  Image as ImageIcon, HelpCircle, Layout, Save, X,
  ChevronUp, ChevronDown, Copy, Check, Brain, Loader2, Zap
} from 'lucide-react'
import { workspaceApi } from '@/lib/api'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion, AnimatePresence } from 'framer-motion'

interface BlockItemProps {
  block: any
  onUpdate: (data: any) => void
  onDelete: () => void
  onAddBelow: (type: string) => void
  isLast: boolean
  isReadOnly?: boolean
  sendMessage?: (msg: any) => void
  usersEditing?: string[]
  lockedBy?: { userId: number, userName: string }
  workspaceId: number
}

export default function BlockItem({ 
  block, onUpdate, onDelete, onAddBelow, isLast, isReadOnly, sendMessage, usersEditing = [], lockedBy, workspaceId 
}: BlockItemProps) {
  const [isGeneratingCards, setIsGeneratingCards] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.4 : 1,
  }

  const [isEditing, setIsEditing] = useState(false)
  const [content, setContent] = useState(block.content || '')
  const [saving, setSaving] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [isOtherUserEditing, setIsOtherUserEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setContent(block.content || '')
  }, [block.content])

  // Broadcast typing changes
  const handleContentChange = (val: string) => {
    setContent(val)
    if (sendMessage) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        sendMessage({
          type: 'block_update',
          block_id: block.id,
          content: val
        })
      }, 500)
    }
  }

  // Broadcast focus
  useEffect(() => {
    if (sendMessage) {
      sendMessage({
        type: 'presence_focus',
        block_id: isEditing ? block.id : null
      })
      
      // Request/Release Lock
      if (isEditing) {
        sendMessage({ type: 'block_lock', block_id: block.id })
      } else {
        sendMessage({ type: 'block_unlock', block_id: block.id })
      }
    }
  }, [isEditing, block.id, sendMessage])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate({ content })
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSave()
    }
    if (e.key === 'Escape') {
      setContent(block.content)
      setIsEditing(false)
    }
  }

  const handleGenerateFlashcards = async () => {
    setIsGeneratingCards(true)
    try {
      const { data } = await workspaceApi.aiAssist(workspaceId, 'generate_flashcards', { block_id: block.id })
      toast.success(data.result, { icon: '🤖' })
    } catch {
      toast.error('Failed to generate flashcards.')
    } finally {
      setIsGeneratingCards(false)
    }
  }

  const isLocked = lockedBy && lockedBy.userId !== parseInt(localStorage.getItem('userId') || '0')

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setShowMenu(false); }}
      className={cn(
        "group relative mb-8 bg-white/[0.03] backdrop-blur-md rounded-[2.5rem] border border-white/5 transition-all duration-500",
        isFocused ? "ring-2 ring-violet-500/30 border-violet-500/30 shadow-[0_0_50px_rgba(139,92,246,0.1)]" : "hover:border-white/10 hover:bg-white/[0.05]",
        block.is_ghost && "opacity-60 bg-transparent border-dashed border-violet-500/30 shadow-none hover:opacity-100",
        isLocked && "opacity-60 grayscale-[0.5]",
        isDragging && "opacity-50 scale-[0.98] blur-[2px] rotate-1"
      )}
    >
      {/* Solidify Ghost Button */}
      {block.is_ghost && !isReadOnly && (
        <div className="absolute -top-4 right-8 flex items-center gap-2 z-30 animate-in slide-in-from-top-2">
           <button 
             onClick={() => onUpdate({ is_ghost: false })}
             className="px-4 py-1.5 bg-violet-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-2xl hover:bg-violet-500 transition-all active:scale-95 flex items-center gap-2">
             <Zap className="w-3 h-3" /> Solidify Specimen
           </button>
           <button 
             onClick={onDelete}
             className="p-1.5 bg-white/10 text-white/40 hover:text-white rounded-full transition-all">
             <X className="w-3 h-3" />
           </button>
        </div>
      )}
      {/* Floating Contextual Toolbar */}
      <AnimatePresence>
        {(isHovered || isFocused) && !isReadOnly && !isLocked && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50">
            
            <div {...attributes} {...listeners} className="p-2 text-white/20 hover:text-white cursor-grab active:cursor-grabbing transition-colors">
              <GripVertical className="w-3.5 h-3.5" />
            </div>
            
            <div className="h-4 w-[1px] bg-white/10 mx-1" />

            <button onClick={handleGenerateFlashcards} disabled={isGeneratingCards}
              className="p-2 text-violet-400 hover:bg-violet-500/10 rounded-xl transition-all">
              {isGeneratingCards ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            </button>

            <button onClick={() => setShowMenu(!showMenu)}
              className={cn("p-2 rounded-xl transition-all", showMenu ? "text-sky-400 bg-sky-500/10" : "text-white/40 hover:text-white hover:bg-white/10")}>
              <Plus className="w-3.5 h-3.5" />
            </button>

            <button onClick={() => onAddBelow('text')}
              className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-[1px] bg-white/10 mx-1" />

            <button onClick={onDelete}
              className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collaboration HUD */}
      {usersEditing.length > 0 && (
        <div className="absolute -top-3 left-8 flex items-center gap-2 px-3 py-1 bg-violet-600 rounded-full text-[9px] font-black text-white uppercase tracking-[0.2em] animate-in fade-in slide-in-from-bottom-2 shadow-[0_0_20px_rgba(139,92,246,0.3)] z-10">
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          {usersEditing[0]} {usersEditing.length > 1 && `+${usersEditing.length - 1}`} RESEARCHING
        </div>
      )}

      {/* Block Body */}
      <div className="p-8 lg:p-10">
        {isEditing ? (
          <div className="space-y-4">
             <textarea
              ref={textareaRef}
              autoFocus
              className="w-full bg-transparent border-none focus:ring-0 text-white/90 text-sm lg:text-base leading-relaxed resize-none min-h-[120px] font-medium selection:bg-violet-500/30"
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => { handleSave(); setIsFocused(false); }}
              placeholder="Start drafting your neural specimen..."
            />
            <div className="flex items-center justify-between pt-4 border-t border-white/5">
              <span className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em]">Synapse Sync Ready</span>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-400 hover:text-white transition-all shadow-xl active:scale-95">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Synchronize
              </button>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => !isReadOnly && !isLocked && setIsEditing(true)}
            className="prose prose-invert max-w-none cursor-text min-h-[40px] relative">
            {content ? (
              <ReactMarkdown 
                className="text-white/70 text-sm lg:text-base leading-[1.8] font-medium"
                components={{
                  p: ({ children }) => <p className="mb-6 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="text-white font-black">{children}</strong>,
                  code: ({ children }) => <code className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-sky-400 text-[0.9em] font-mono">{children}</code>
                }}
              >
                {content}
              </ReactMarkdown>
            ) : (
              <span className="text-white/10 italic text-sm font-medium hover:text-white/20 transition-colors">Fragment empty. Click to initialize specimen...</span>
            )}
          </div>
        )}
      </div>

      {/* Locked Overlay */}
      {isLocked && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-20 rounded-[2.5rem] flex items-center justify-center">
           <motion.div 
             initial={{ scale: 0.9, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="flex items-center gap-3 px-4 py-2 bg-white text-black rounded-2xl shadow-2xl skew-x-[-2deg]">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest">{lockedBy.userName} HAS LOCKED THIS NODE</span>
           </motion.div>
        </div>
      )}

      {/* Add Block Dropdown */}
      <AnimatePresence>
        {showMenu && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute left-1/2 -translate-x-1/2 top-full mt-4 z-[60] w-64 bg-gray-900 border border-white/10 p-2 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
            <div className="px-3 py-2 text-[9px] font-black text-white/20 uppercase tracking-[0.3em] border-b border-white/5 mb-1">Neural Insertion</div>
            <div className="grid grid-cols-1 gap-1">
              {[
                { id: 'text', icon: Type, label: 'Text specimen', desc: 'Standard research' },
                { id: 'ai_note', icon: Wand2, label: 'FlowAI Note', desc: 'Synthesized summary' },
                { id: 'quiz', icon: HelpCircle, label: 'Logic Quiz', desc: 'Verification' },
              ].map(item => (
                <button key={item.id} onClick={() => { onAddBelow(item.id); setShowMenu(false) }}
                  className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-white/5 transition-all text-left group">
                  <div className="p-2 bg-white/5 text-white/40 group-hover:bg-violet-500/20 group-hover:text-violet-400 rounded-xl transition-all">
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-black text-white/80 group-hover:text-white uppercase tracking-wider">{item.label}</div>
                    <div className="text-[9px] text-white/20 font-bold">{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
