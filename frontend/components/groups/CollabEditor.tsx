'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi, aiApi } from '@/lib/api'
import { useSession } from 'next-auth/react'
import {
  Bold, Italic, List, Sparkles, Plus, Check, FileText,
  Save, Users, Loader2, X, Heading1, Heading2, Code,
  Quote, Link2, Image, Pin, MoreHorizontal, Hash,
  ChevronDown, Trash2, Eye, Lightbulb
} from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo, getInitials, cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

interface Props { groupId: number }

const EMOJIS = ['📄', '📝', '🧠', '💡', '🔬', '📊', '🎯', '📚', '⚡', '🌟']

export default function CollabEditor({ groupId }: Props) {
  const { data: session } = useSession()
  const qc = useQueryClient()
  const [activeDocId, setActiveDocId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [emoji, setEmoji] = useState('📄')
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null)
  const [showAiPanel, setShowAiPanel] = useState(true)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const saveTimer = useRef<NodeJS.Timeout>()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: docsData } = useQuery({
    queryKey: ['group-docs', groupId],
    queryFn: () => groupsApi.getDocuments(groupId).then((r) => r.data),
  })

  const { data: tasksData } = useQuery({
    queryKey: ['group-tasks', groupId],
    queryFn: () => groupsApi.getTasks(groupId).then((r) => r.data),
  })

  const { data: activeDocData } = useQuery({
    queryKey: ['group-doc-active', groupId, activeDocId],
    queryFn: () => activeDocId
      ? groupsApi.getDocuments(groupId).then((r) =>
          r.data.results?.find((d: any) => d.id === activeDocId)
        )
      : null,
    enabled: !!activeDocId,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (activeDocData && !isDirty) {
      setContent(activeDocData.content || '')
      setTitle(activeDocData.title || '')
      setEmoji(activeDocData.emoji || '📄')
    }
  }, [activeDocData, isDirty])

  const docs = docsData?.results || []
  const tasks = tasksData?.results || []

  const createDoc = useMutation({
    mutationFn: (data?: any) => groupsApi.createDocument(groupId, {
      title: data?.title || 'Untitled Document',
      content: data?.content || '',
      emoji: data?.emoji || '📄',
      group: groupId,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['group-docs', groupId] })
      loadDoc(res.data)
    },
  })

  const saveDoc = useMutation({
    mutationFn: () => groupsApi.updateDocument(groupId, activeDocId!, { title, content, emoji }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-docs', groupId] })
      setIsDirty(false)
      setSaving(false)
    },
    onError: () => { setSaving(false); toast.error('Failed to save.') },
  })

  const deleteDoc = useMutation({
    mutationFn: (docId: number) => groupsApi.updateDocument(groupId, docId, { title: '[Deleted]' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-docs', groupId] })
      setActiveDocId(null)
      setContent('')
      setTitle('')
    },
  })

  const toggleTask = useMutation({
    mutationFn: (task: any) => groupsApi.updateTask(groupId, task.id, { is_completed: !task.is_completed }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-tasks', groupId] }),
  })

  const addTask = useMutation({
    mutationFn: (title: string) => groupsApi.createTask(groupId, { title, group: groupId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-tasks', groupId] }),
  })

  const loadDoc = (doc: any) => {
    setActiveDocId(doc.id)
    setTitle(doc.title)
    setContent(doc.content || '')
    setEmoji(doc.emoji || '📄')
    setIsDirty(false)
    setAiSuggestion(null)
    setViewMode('edit')
  }

  const handleContentChange = (val: string) => {
    setContent(val)
    setIsDirty(true)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (activeDocId) {
        setSaving(true)
        saveDoc.mutate()
      }
    }, 1500)
  }

  const getAiSuggestion = async () => {
    if (!content.trim()) return
    const lastLines = content.split('\n').filter(Boolean).slice(-3).join(' ')
    try {
      const res = await aiApi.quickAsk(
        `Continue this text naturally in 1-2 sentences: "${lastLines}". Reply with ONLY the continuation.`
      )
      setAiSuggestion(res.data.answer)
    } catch {
      toast.error('AI suggestion failed.')
    }
  }

  const insertFormat = (prefix: string, suffix = '', placeholder = '') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = content.slice(start, end) || placeholder
    const newContent = content.slice(0, start) + prefix + selected + suffix + content.slice(end)
    handleContentChange(newContent)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
    }, 0)
  }

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const newContent = content.slice(0, start) + text + content.slice(start)
    handleContentChange(newContent)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + text.length, start + text.length) }, 0)
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length
  const charCount = content.length

  return (
    <div className="grid grid-cols-4 gap-4 h-[680px]">
      {/* Left sidebar */}
      <div className="card flex flex-col overflow-hidden">
        {/* New doc button */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={() => createDoc.mutate(undefined)}
            disabled={createDoc.isPending}
            className="btn-primary w-full text-xs flex items-center justify-center gap-1.5 py-2"
          >
            <Plus className="w-3.5 h-3.5" /> New Document
          </button>
        </div>

        {/* Doc list */}
        <div className="flex-1 overflow-y-auto p-2">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-600 px-2 mb-2 tracking-wider">DOCUMENTS</p>
          {docs.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No documents yet</p>
          )}
          {docs.map((d: any) => (
            <button
              key={d.id}
              onClick={() => loadDoc(d)}
              className={cn(
                'w-full text-left px-2 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors group',
                activeDocId === d.id
                  ? 'bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              )}
            >
              <span className="text-base flex-shrink-0">{d.emoji || '📄'}</span>
              <span className="truncate flex-1">{d.title}</span>
              {d.is_pinned && <Pin className="w-3 h-3 flex-shrink-0 text-sky-400" />}
            </button>
          ))}
        </div>

        {/* Tasks */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-3 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-600 mb-2 tracking-wider">SHARED TASKS</p>
          <TaskList tasks={tasks} onToggle={(t) => toggleTask.mutate(t)} onAdd={(t) => addTask.mutate(t)} />
        </div>
      </div>

      {/* Main editor */}
      <div className={cn('flex flex-col overflow-hidden card', showAiPanel ? 'col-span-2' : 'col-span-3')}>
        {activeDocId ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 flex-wrap">
              {/* Formatting */}
              <div className="flex items-center gap-0.5">
                <ToolbarBtn icon={Heading1} onClick={() => insertAtCursor('\n# ')} title="Heading 1" />
                <ToolbarBtn icon={Heading2} onClick={() => insertAtCursor('\n## ')} title="Heading 2" />
                <ToolbarBtn icon={Bold} onClick={() => insertFormat('**', '**', 'bold text')} title="Bold" />
                <ToolbarBtn icon={Italic} onClick={() => insertFormat('*', '*', 'italic text')} title="Italic" />
                <ToolbarBtn icon={Code} onClick={() => insertFormat('`', '`', 'code')} title="Inline code" />
                <ToolbarBtn icon={Quote} onClick={() => insertAtCursor('\n> ')} title="Quote" />
                <ToolbarBtn icon={List} onClick={() => insertAtCursor('\n- ')} title="List" />
                <ToolbarBtn icon={Hash} onClick={() => insertAtCursor('\n- [ ] ')} title="Checklist" />
              </div>

              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

              {/* AI */}
              <button
                onClick={getAiSuggestion}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 text-xs font-medium hover:bg-sky-100 dark:hover:bg-sky-900 transition-colors"
              >
                <Sparkles className="w-3 h-3" /> AI Continue
              </button>

              <div className="ml-auto flex items-center gap-2">
                {/* View toggle */}
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                  <button onClick={() => setViewMode('edit')} className={cn('px-2 py-1 rounded-md text-xs transition-colors', viewMode === 'edit' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-400')}>Edit</button>
                  <button onClick={() => setViewMode('preview')} className={cn('px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1', viewMode === 'preview' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-400')}>
                    <Eye className="w-3 h-3" /> Preview
                  </button>
                </div>

                {/* AI panel toggle */}
                <button onClick={() => setShowAiPanel(!showAiPanel)} className={cn('p-1.5 rounded-lg text-xs transition-colors', showAiPanel ? 'bg-sky-50 dark:bg-sky-950 text-sky-500' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800')}>
                  <Sparkles className="w-3.5 h-3.5" />
                </button>

                {/* Save status */}
                <div className="text-xs text-gray-400 flex items-center gap-1">
                  {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving</> : isDirty ? <><Save className="w-3 h-3" /> Unsaved</> : <><Check className="w-3 h-3 text-emerald-500" /> Saved</>}
                </div>

                {/* More options */}
                <button className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Doc title */}
            <div className="px-6 pt-5 pb-2 flex items-center gap-3 flex-shrink-0">
              <div className="relative">
                <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="text-3xl hover:scale-110 transition-transform">
                  {emoji}
                </button>
                {showEmojiPicker && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-2 shadow-xl z-10 flex flex-wrap gap-1 w-48">
                    {EMOJIS.map((e) => (
                      <button key={e} onClick={() => { setEmoji(e); setShowEmojiPicker(false); setIsDirty(true) }} className="text-xl hover:scale-125 transition-transform p-1">{e}</button>
                    ))}
                  </div>
                )}
              </div>
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); setIsDirty(true) }}
                placeholder="Untitled Document"
                className="text-2xl font-bold border-0 outline-none flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-700"
              />
            </div>

            {/* AI suggestion banner */}
            {aiSuggestion && (
              <div className="mx-6 mb-3 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-xl p-3 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                  <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">AI SUGGESTION</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 italic mb-3">"{aiSuggestion}"</p>
                <div className="flex gap-2">
                  <button onClick={() => setAiSuggestion(null)} className="btn-secondary text-xs py-1 px-3">Ignore</button>
                  <button onClick={() => { handleContentChange(content + ' ' + aiSuggestion); setAiSuggestion(null) }} className="btn-primary text-xs py-1 px-3 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Accept (Tab)
                  </button>
                </div>
              </div>
            )}

            {/* Editor / Preview */}
            <div className="flex-1 overflow-hidden">
              {viewMode === 'edit' ? (
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && aiSuggestion) { e.preventDefault(); handleContentChange(content + ' ' + aiSuggestion); setAiSuggestion(null) }
                    if (e.key === 'Tab' && !aiSuggestion) { e.preventDefault(); insertAtCursor('  ') }
                  }}
                  placeholder="Start writing... (Markdown supported)"
                  className="w-full h-full px-6 py-2 resize-none border-0 outline-none bg-transparent text-sm leading-relaxed text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-700"
                />
              ) : (
                <div className="px-6 py-2 overflow-y-auto h-full">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{content || '*Nothing to preview yet...*'}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>

            {/* Footer stats */}
            <div className="px-6 py-2 border-t border-gray-50 dark:border-gray-800 flex items-center gap-4 text-xs text-gray-400 flex-shrink-0">
              <span>{wordCount} words</span>
              <span>{charCount} characters</span>
              <span className="ml-auto">Markdown supported</span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="text-6xl mb-4">📝</div>
            <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">No document selected</p>
            <p className="text-sm text-gray-400 dark:text-gray-600 mb-4">Select a document or create a new one to start writing</p>
            <button onClick={() => createDoc.mutate(undefined)} className="btn-primary text-sm">New Document</button>
          </div>
        )}
      </div>

      {/* AI Panel */}
      {showAiPanel && (
        <div className="card flex flex-col overflow-hidden">
          <AISidePanel groupId={groupId} docContent={content} docTitle={title} onClose={() => setShowAiPanel(false)} />
        </div>
      )}
    </div>
  )
}

function ToolbarBtn({ icon: Icon, onClick, title }: { icon: any; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  )
}

function TaskList({ tasks, onToggle, onAdd }: { tasks: any[]; onToggle: (t: any) => void; onAdd: (title: string) => void }) {
  const [newTask, setNewTask] = useState('')
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {tasks.map((t: any) => (
        <div key={t.id} className="flex items-center gap-2 py-1">
          <button
            onClick={() => onToggle(t)}
            className={cn('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors', t.is_completed ? 'bg-sky-500 border-sky-500' : 'border-gray-300 dark:border-gray-600 hover:border-sky-400')}
          >
            {t.is_completed && <Check className="w-2.5 h-2.5 text-white" />}
          </button>
          <span className={cn('text-xs flex-1 truncate', t.is_completed ? 'line-through text-gray-400' : 'text-gray-600 dark:text-gray-400')}>{t.title}</span>
        </div>
      ))}
      {adding ? (
        <div className="flex items-center gap-1 mt-1">
          <input
            autoFocus
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTask.trim()) { onAdd(newTask.trim()); setNewTask(''); setAdding(false) }
              if (e.key === 'Escape') { setAdding(false); setNewTask('') }
            }}
            placeholder="Task name..."
            className="input text-xs py-1 flex-1"
          />
          <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-gray-400 hover:text-sky-500 flex items-center gap-1 mt-1 transition-colors">
          <Plus className="w-3 h-3" /> Add Task
        </button>
      )}
    </div>
  )
}

function AISidePanel({ groupId, docContent, docTitle, onClose }: { groupId: number; docContent: string; docTitle: string; onClose: () => void }) {
  const [aiLoading, setAiLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])

  const generateSummary = async () => {
    if (!docContent.trim()) { toast.error('Write something first!'); return }
    setAiLoading(true)
    try {
      const res = await aiApi.quickAsk(`Summarize the key points from this document in 3-4 bullet points:\n\n${docContent.slice(0, 2000)}`)
      setSummary(res.data.answer)
    } catch { toast.error('Failed.') }
    finally { setAiLoading(false) }
  }

  const generateSuggestions = async () => {
    if (!docContent.trim()) return
    setAiLoading(true)
    try {
      const res = await aiApi.quickAsk(
        `Based on this document about "${docTitle}", suggest 3 follow-up topics or questions the group should explore. Return as a JSON array of strings.`
      )
      try {
        const parsed = JSON.parse(res.data.answer.replace(/```json\n?|\n?```/g, ''))
        setSuggestions(Array.isArray(parsed) ? parsed : [])
      } catch { setSuggestions([res.data.answer]) }
    } catch { toast.error('Failed.') }
    finally { setAiLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sky-500" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">AI INSIGHTS</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* FlowAI status */}
        <div className="bg-sky-50 dark:bg-sky-950/50 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-sky-500 rounded-full flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">FlowAI</div>
              <div className="text-xs text-sky-500">OBSERVING...</div>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {docContent ? `Tracking ${docContent.split(/\s+/).filter(Boolean).length} words in your document.` : 'Start writing to get AI insights.'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={generateSummary} disabled={aiLoading} className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 flex items-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <Sparkles className="w-3 h-3 text-sky-500" /> Summarize
            </button>
            <button onClick={generateSuggestions} disabled={aiLoading} className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 flex items-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <Lightbulb className="w-3 h-3 text-amber-500" /> Suggest Topics
            </button>
          </div>
        </div>

        {aiLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
          </div>
        )}

        {summary && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">SUMMARY</div>
            <div className="prose prose-xs dark:prose-invert max-w-none">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">SUGGESTED TOPICS</div>
            <ul className="space-y-1.5">
              {suggestions.map((s, i) => (
                <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                  <span className="text-sky-400 mt-0.5">→</span> {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Active members */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">ACTIVE MEMBERS</div>
          {[
            { name: 'You', status: 'Editing', color: 'bg-sky-400', isMe: true },
            { name: 'Sarah M.', status: 'Viewing', color: 'bg-emerald-400' },
            { name: 'James W.', status: 'Idle', color: 'bg-violet-400' },
          ].map((m) => (
            <div key={m.name} className="flex items-center gap-2 py-1.5">
              <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0', m.color)}>
                {getInitials(m.name)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{m.name}</div>
                <div className="text-xs text-gray-400">{m.status}</div>
              </div>
              {m.isMe && <div className="w-2 h-2 bg-emerald-400 rounded-full ml-auto flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
