import { useState, useRef, useEffect } from 'react'
import { 
  GripVertical, Trash2, Wand2, Plus, Type, FileText, 
  Image as ImageIcon, HelpCircle, Layout, Save, X,
  ChevronUp, ChevronDown, Copy, Check, Brain
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
      const res = await workspaceApi.aiAssist(workspaceId, 'generate_flashcards', { block_id: block.id })
      toast.success(res.data.result)
    } catch {
      toast.error('Failed to generate flashcards.')
    } finally {
      setIsGeneratingCards(false)
    }
  }

  const isLocked = lockedBy && lockedBy.userId !== parseInt(localStorage.getItem('userId') || '0')

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300 transition-all",
        isDragging && "opacity-50 scale-[0.98] blur-[1px] rotate-1"
      )}>
      {/* Block Container */}
      <div className={cn(
        "relative rounded-2xl border-2 transition-all p-1",
        isEditing ? "border-violet-400 bg-white dark:bg-gray-900 shadow-lg shadow-violet-100 dark:shadow-none" : 
        usersEditing.length > 0 ? "border-sky-400 bg-sky-50/30 dark:bg-sky-950/20 shadow-sm shadow-sky-100 dark:shadow-none" :
        "border-transparent hover:border-gray-100 dark:hover:border-gray-800 bg-white/50 dark:bg-white/5",
        isLocked && "opacity-80 pointer-events-none"
      )}>
        
        {/* Presence Badge (Only when not locked by them) */}
        {usersEditing.length > 0 && !isEditing && !isLocked && (
          <div className="absolute -top-2.5 right-4 z-10 flex items-center gap-1.5 px-2 py-0.5 bg-sky-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm animate-in zoom-in-95 duration-200">
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            {usersEditing[0]} {usersEditing.length > 1 ? `+${usersEditing.length - 1}` : ''} View
          </div>
        )}

        {/* Lock Badge & Overlay */}
        {isLocked && (
          <div className="absolute inset-0 bg-white/40 dark:bg-black/20 z-20 rounded-2xl flex items-center justify-center backdrop-blur-[1px] animate-in fade-in duration-300">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg rotate-[-1deg]">
              <X className="w-3 h-3 text-red-500" />
              {lockedBy.userName} is editing
            </div>
          </div>
        )}
        
        {/* Drag Handle & Menu — Desktop Only */}
        {!isReadOnly && !isLocked && (
          <div className="absolute -left-10 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 items-center">
            <button 
              {...attributes} 
              {...listeners}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
            >
              <GripVertical className="w-4 h-4 shrink-0" />
            </button>
            <button onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 text-gray-400 hover:text-violet-500 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/30">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="px-4 py-3 min-h-[3rem]">
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full min-h-[100px] p-2 bg-transparent border-0 outline-none resize-none text-gray-800 dark:text-gray-200 font-sans leading-relaxed"
                autoFocus
                placeholder="Write something..."
              />
              <div className="flex items-center justify-end gap-2 border-t border-gray-50 dark:border-gray-800 pt-2">
                <span className="text-[10px] text-gray-400 mr-auto font-mono">CTRL + ENTER to save</span>
                <button onClick={() => { setContent(block.content); setIsEditing(false) }}
                  className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 transition-colors shadow-sm shadow-violet-200 dark:shadow-none">
                  {saving ? <Layout className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => !isReadOnly && setIsEditing(true)}
              className={cn(
                "prose prose-sm dark:prose-invert max-w-none cursor-text",
                !content && "text-gray-300 dark:text-gray-600 italic"
              )}
            >
              {content ? (
                <ReactMarkdown>{content}</ReactMarkdown>
              ) : (
                "Empty block. Click to write..."
              )}
            </div>
          )}
        </div>

        {/* Floating Actions */}
        {!isEditing && !isReadOnly && (
          <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100">
            <button 
              onClick={handleGenerateFlashcards}
              disabled={isGeneratingCards || !content}
              title="Generate Flashcards from this block"
              className="p-1.5 text-gray-400 hover:text-amber-500 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors disabled:opacity-50">
              {isGeneratingCards ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" /> : <Brain className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Add Block Menu */}
      {showMenu && !isReadOnly && (
        <div className="absolute left-0 top-full mt-2 z-30 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden min-w-[200px] animate-in zoom-in-95 duration-200">
          <div className="px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 dark:border-gray-800">
            Insert Block Below
          </div>
          <div className="p-1.5 grid grid-cols-1 gap-0.5">
            {[
              { id: 'text', icon: Type, label: 'Text Block', desc: 'Markdown supported' },
              { id: 'ai_note', icon: Wand2, label: 'FlowAI Note', desc: 'AI-generated summary' },
              { id: 'quiz', icon: HelpCircle, label: 'Practice Quiz', desc: 'In-line questions' },
              { id: 'image', icon: ImageIcon, label: 'Image', desc: 'Upload diagram or photo' },
            ].map(item => (
              <button key={item.id} onClick={() => { onAddBelow(item.id); setShowMenu(false) }}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors text-left group/item">
                <div className="p-2 bg-gray-50 dark:bg-gray-800 text-gray-400 group-hover/item:bg-violet-100 group-hover/item:text-violet-600 dark:group-hover/item:bg-violet-900/50 rounded-lg transition-colors">
                  <item.icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">{item.label}</div>
                  <div className="text-[10px] text-gray-400">{item.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
