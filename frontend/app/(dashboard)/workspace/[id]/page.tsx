'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceApi, libraryApi } from '@/lib/api'
import {
  Sparkles, Send, Users, CheckSquare, History, Download,
  ChevronDown, X, Plus, Loader2, ArrowLeft, Copy, Check,
  FileText, File, FileDown, Trash2, Pencil, MessageSquare,
  Wand2, AlignLeft, Eye, RotateCcw, Paperclip, Upload,
  BookOpen, Image, Presentation, Link2, ExternalLink
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { getInitials } from '@/lib/utils'

type Panel = 'chat' | 'tasks' | 'files' | 'members' | 'history'
type EditorMode = 'edit' | 'preview' | 'split'

const AI_ACTIONS = [
  { id: 'generate_outline', icon: AlignLeft, label: 'Generate Outline', desc: 'Build a doc structure from your assignment' },
  { id: 'review', icon: Eye, label: 'Review Document', desc: 'Get structured AI feedback' },
  { id: 'generate_slides', icon: Presentation, label: 'Slides Outline', desc: 'Create a PowerPoint-ready outline' },
]

export default function WorkspaceDetailPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const qc = useQueryClient()
  const [panel, setPanel] = useState<Panel>('chat')
  const [showPanel, setShowPanel] = useState(true)
  const [editorMode, setEditorMode] = useState<EditorMode>('split')
  const [docContent, setDocContent] = useState('')
  const [saveTimer, setSaveTimer] = useState<NodeJS.Timeout>()
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const isEditingRef = useRef(false)

  const { data: ws } = useQuery({
    queryKey: ['workspace', id],
    queryFn: () => workspaceApi.get(id).then(r => r.data),
  })

  const { data: docData } = useQuery({
    queryKey: ['workspace-doc', id],
    queryFn: () => workspaceApi.getDocument(id).then(r => r.data),
    refetchInterval: 3000,
  })

  useEffect(() => {
    if (docData?.content !== undefined && !isEditingRef.current) {
      setDocContent(docData.content)
    }
  }, [docData?.content])

  const saveMutation = useMutation({
    mutationFn: (content: string) => workspaceApi.updateDocument(id, content),
    onSuccess: () => { setSaving(false); setLastSaved(new Date()) },
    onError: () => setSaving(false),
  })

  const handleDocChange = (value: string) => {
    setDocContent(value)
    isEditingRef.current = true
    setSaving(true)
    if (saveTimer) clearTimeout(saveTimer)
    const t = setTimeout(() => {
      saveMutation.mutate(value)
      setTimeout(() => { isEditingRef.current = false }, 2000)
    }, 1500)
    setSaveTimer(t)
  }

  const handleExport = async (fmt: string) => {
    setExportOpen(false)
    try {
      const res = await workspaceApi.export(id, fmt)
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url; a.download = `${ws?.name?.replace(/\s+/g, '_') || 'workspace'}.${fmt}`; a.click()
      URL.revokeObjectURL(url)
      toast.success(`Downloaded as .${fmt}`)
    } catch { toast.error('Export failed.') }
  }

  const copyInviteCode = () => {
    if (ws?.invite_code) {
      navigator.clipboard.writeText(ws.invite_code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
      toast.success('Invite code copied!')
    }
  }

  const insertAIResult = (text: string) => {
    const ta = editorRef.current
    if (!ta) {
      handleDocChange(docContent + '\n\n' + text)
      return
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const newContent = docContent.slice(0, start) + '\n\n' + text + '\n\n' + docContent.slice(end)
    handleDocChange(newContent)
    
    // Defer focus and cursor placement to after React render
    setTimeout(() => {
      ta.focus()
      const newCursorPos = start + text.length + 4 // +4 for the newlines
      ta.setSelectionRange(newCursorPos, newCursorPos)
      ta.scrollTo({
        top: ta.scrollHeight,
        behavior: 'smooth'
      })
    }, 100)
  }

  if (!ws) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
    </div>
  )

  return (
    <div className="flex flex-col h-full min-h-0 -m-4 md:-m-6">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <Link href="/workspace" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-gray-900 dark:text-white truncate text-sm">{ws.name}</h1>
            {ws.subject && <span className="hidden sm:block text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{ws.subject}</span>}
            {ws.assignment_title && (
              <span className="hidden md:flex items-center gap-1 text-xs text-violet-500 bg-violet-50 dark:bg-violet-950/30 px-2 py-0.5 rounded-full">
                <FileText className="w-3 h-3" />{ws.assignment_title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ws.member_count}</span>
            {saving ? (
              <span className="text-sky-500 flex items-center gap-1 font-medium"><Loader2 className="w-3 h-3 animate-spin" />Saving...</span>
            ) : (
              <div className="flex items-center gap-2 group/save">
                {lastSaved ? <span>Saved {format(lastSaved, 'HH:mm')}</span> : null}
                <button 
                  onClick={() => saveMutation.mutate(docContent)}
                  disabled={saveMutation.isPending}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-sky-500 transition-colors"
                  title="Save now"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Editor mode toggle — desktop only */}
        <div className="hidden md:flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {(['edit', 'split', 'preview'] as EditorMode[]).map(m => (
            <button key={m} onClick={() => setEditorMode(m)}
              className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-all capitalize',
                editorMode === m ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')}>
              {m}
            </button>
          ))}
        </div>
        {/* Mobile: just edit/preview toggle */}
        <div className="flex md:hidden items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {(['edit', 'preview'] as EditorMode[]).map(m => (
            <button key={m} onClick={() => setEditorMode(m)}
              className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-all capitalize',
                editorMode === m ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500')}>
              {m}
            </button>
          ))}
        </div>

        {/* Invite code */}
        <button onClick={copyInviteCode}
          className="hidden sm:flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-2.5 py-1.5 rounded-lg transition-colors font-mono">
          {codeCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          {ws.invite_code}
        </button>

        {/* Export */}
        <div className="relative">
          <button onClick={() => setExportOpen(!exportOpen)}
            className="btn-secondary flex items-center gap-1.5 text-xs h-8 px-2.5">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-xl z-20 w-48 overflow-hidden">
                {[
                  { fmt: 'pptx', icon: Presentation, label: 'PowerPoint (.pptx)', color: 'text-orange-500' },
                  { fmt: 'pdf', icon: FileDown, label: 'PDF Document', color: 'text-red-500' },
                  { fmt: 'docx', icon: File, label: 'Word Document', color: 'text-blue-500' },
                  { fmt: 'txt', icon: FileText, label: 'Plain Text', color: 'text-gray-500' },
                ].map(({ fmt, icon: Icon, label, color }) => (
                  <button key={fmt} onClick={() => handleExport(fmt)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                    <Icon className={cn('w-4 h-4', color)} /> {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Toggle panel */}
        <button onClick={() => setShowPanel(!showPanel)}
          className={cn('p-2 rounded-lg transition-colors flex-shrink-0',
            showPanel ? 'bg-violet-100 dark:bg-violet-950/50 text-violet-600' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800')}>
          <Sparkles className="w-4 h-4" />
        </button>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Editor area */}
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          {/* Write pane */}
          {(editorMode === 'edit' || editorMode === 'split') && (
            <div className={cn('flex flex-col min-h-0', editorMode === 'split' ? 'w-1/2 border-r border-gray-100 dark:border-gray-800' : 'flex-1')}>
              <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex-shrink-0">
                <Pencil className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-400">Markdown Editor</span>
              </div>
              <textarea
                ref={editorRef}
                value={docContent}
                onChange={e => handleDocChange(e.target.value)}
                placeholder={`# ${ws.name}\n\nStart writing...\n\nTips:\n# Heading 1\n## Heading 2\n- Bullet point\n**bold** *italic*\n\nOr use FlowAI → to generate content →`}
                className="flex-1 w-full p-5 resize-none border-0 outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-mono text-sm leading-relaxed"
                spellCheck
              />
            </div>
          )}

          {/* Preview pane */}
          {(editorMode === 'preview' || editorMode === 'split') && (
            <div className={cn('flex flex-col min-h-0 overflow-hidden', editorMode === 'split' ? 'w-1/2' : 'flex-1')}>
              <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex-shrink-0">
                <Eye className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-400">Preview</span>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {docContent ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{docContent}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-gray-700">
                    <Eye className="w-10 h-10 mb-2" />
                    <p className="text-sm">Preview will appear here</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right panel — desktop sidebar, mobile bottom sheet */}
        {showPanel && (
          <>
            {/* Desktop */}
            <div className="hidden md:flex w-72 xl:w-80 flex-shrink-0 border-l border-gray-100 dark:border-gray-800 flex-col min-h-0 bg-white dark:bg-gray-900">
              <PanelContent panel={panel} setPanel={setPanel} wsId={id} onInsert={insertAIResult} inviteCode={ws.invite_code} onCopy={copyInviteCode} onRestore={handleDocChange} />
            </div>
            {/* Mobile bottom sheet */}
            <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setShowPanel(false)} />
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl flex flex-col" style={{ height: '75vh' }}>
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
              </div>
              <PanelContent panel={panel} setPanel={setPanel} wsId={id} onInsert={insertAIResult} inviteCode={ws.invite_code} onCopy={copyInviteCode} onRestore={handleDocChange} />
            </div>
          </>
        )}
        {/* Mobile FAB to open panel */}
        {!showPanel && (
          <button onClick={() => setShowPanel(true)}
            className="md:hidden fixed bottom-6 right-4 z-30 w-14 h-14 bg-violet-500 hover:bg-violet-600 text-white rounded-full shadow-xl shadow-violet-200 dark:shadow-violet-900 flex items-center justify-center transition-all active:scale-95">
            <Sparkles className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── PANEL CONTENT (shared between desktop sidebar and mobile sheet) ─────────
function PanelContent({ panel, setPanel, wsId, onInsert, inviteCode, onCopy, onRestore }: {
  panel: Panel; setPanel: (p: Panel) => void; wsId: number
  onInsert: (t: string) => void; inviteCode: string; onCopy: () => void; onRestore: (c: string) => void
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        {([
          { id: 'chat', icon: MessageSquare, label: 'AI' },
          { id: 'files', icon: Paperclip, label: 'Files' },
          { id: 'tasks', icon: CheckSquare, label: 'Tasks' },
          { id: 'members', icon: Users, label: 'Team' },
          { id: 'history', icon: History, label: 'History' },
        ] as { id: Panel; icon: any; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setPanel(t.id)}
            className={cn('flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors border-b-2',
              panel === t.id ? 'border-violet-500 text-violet-600 dark:text-violet-400' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300')}>
            <t.icon className="w-3.5 h-3.5" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {panel === 'chat' && <ChatPanel wsId={wsId} onInsert={onInsert} />}
        {panel === 'files' && <FilesPanel wsId={wsId} />}
        {panel === 'tasks' && <TasksPanel wsId={wsId} />}
        {panel === 'members' && <MembersPanel wsId={wsId} inviteCode={inviteCode} onCopy={onCopy} />}
        {panel === 'history' && <HistoryPanel wsId={wsId} onRestore={onRestore} />}
      </div>
    </div>
  )
}

// ─── CHAT / AI PANEL ─────────────────────────────────────────────────────────
function ChatPanel({ wsId, onInsert }: { wsId: number; onInsert: (t: string) => void }) {
  const [msg, setMsg] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [writingSection, setWritingSection] = useState(false)
  const [sectionTitle, setSectionTitle] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['workspace-messages', wsId],
    queryFn: () => workspaceApi.getMessages(wsId).then(r => r.data),
    refetchInterval: 3000,
  })
  const messages: any[] = data || []

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  const sendMutation = useMutation({
    mutationFn: (content: string) => workspaceApi.sendMessage(wsId, content),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['workspace-messages', wsId] })
      setMsg('')
      // If AI replied immediately, invalidate again after short delay to ensure it shows
      if (res.data?.ai_message) {
        setTimeout(() => qc.invalidateQueries({ queryKey: ['workspace-messages', wsId] }), 500)
      }
    },
  })

  const aiAction = async (action: string, text?: string) => {
    setAiLoading(true); setShowActions(false); setWritingSection(false)
    try {
      const res = await workspaceApi.aiAssist(wsId, action, text ? { text } : {})
      qc.invalidateQueries({ queryKey: ['workspace-messages', wsId] })
      if (['generate_outline', 'write_section', 'improve', 'expand', 'simplify', 'generate_slides'].includes(action)) {
        onInsert(res.data.result)
        toast.success('Inserted into document!')
      }
    } catch { toast.error('AI unavailable.') }
    finally { setAiLoading(false) }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* AI Quick Actions */}
      <div className="p-2.5 border-b border-gray-50 dark:border-gray-800 flex-shrink-0 space-y-1.5">
        <button onClick={() => setShowActions(!showActions)}
          className="w-full flex items-center justify-between text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 rounded-xl px-3 py-2 hover:bg-violet-100 dark:hover:bg-violet-950/50 transition-colors">
          <span className="flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" /> FlowAI Actions</span>
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showActions && 'rotate-180')} />
        </button>

        {showActions && (
          <div className="space-y-0.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-1.5">
            {AI_ACTIONS.map(a => (
              <button key={a.id} onClick={() => aiAction(a.id)} disabled={aiLoading}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-colors text-left">
                <a.icon className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{a.label}</div>
                  <div className="text-xs text-gray-400 truncate">{a.desc}</div>
                </div>
              </button>
            ))}
            {/* Write section */}
            {!writingSection ? (
              <button onClick={() => setWritingSection(true)}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-colors text-left">
                <Pencil className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                <div>
                  <div className="text-xs font-medium text-gray-800 dark:text-gray-200">Write a Section</div>
                  <div className="text-xs text-gray-400">AI writes a full section</div>
                </div>
              </button>
            ) : (
              <div className="p-2 space-y-1.5">
                <input value={sectionTitle} onChange={e => setSectionTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sectionTitle.trim() && aiAction('write_section', sectionTitle)}
                  placeholder="Section title..." className="input text-xs" autoFocus />
                <div className="flex gap-1.5">
                  <button onClick={() => setWritingSection(false)} className="btn-secondary flex-1 text-xs py-1">Cancel</button>
                  <button onClick={() => aiAction('write_section', sectionTitle)} disabled={!sectionTitle.trim() || aiLoading}
                    className="btn-primary flex-1 text-xs py-1 flex items-center justify-center gap-1">
                    {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Write
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.length === 0 && !aiLoading && (
          <div className="text-center py-10 text-gray-400">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-800">
              <Sparkles className="w-8 h-8 opacity-20" />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest">Workspace Chat</p>
            <p className="text-[11px] mt-1.5 opacity-60">Team discussion + @FlowAI assistance</p>
          </div>
        )}
        {messages.map((m: any) => {
          const isAI = m.is_ai
          return (
            <div key={m.id} className={cn(
              'flex gap-2.5 w-full animate-fade-in-up',
              isAI ? 'flex-row' : 'flex-row' // Team chat stays left-aligned or you can alternate
            )}>
              <div className="flex-shrink-0 mt-0.5">
                <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm',
                  isAI ? 'bg-gradient-to-br from-violet-400 to-sky-500' : 'bg-sky-500')}>
                  {isAI ? <Sparkles className="w-3.5 h-3.5" /> : m.author_initials}
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 px-0.5">
                  <span className="text-[11px] font-black tracking-widest uppercase text-slate-400 dark:text-slate-500">{m.author_name}</span>
                  {isAI && <div className="w-1 h-1 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                  <span className="text-[10px] text-slate-300 dark:text-slate-600 ml-auto">{format(new Date(m.created_at), 'HH:mm')}</span>
                </div>
                
                <div className={cn(
                  'inline-block px-3 py-2 rounded-2xl text-[13px] shadow-sm ring-1 ring-slate-100 dark:ring-slate-800 w-full',
                  isAI ? 'bg-white dark:bg-slate-900 border-l-4 border-l-violet-500 prose prose-slate dark:prose-invert max-w-none prose-ai' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                )}>
                  {isAI ? (
                    <>
                      <ReactMarkdown
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            return !inline ? (
                              <div className="relative my-2 group/code">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(String(children).replace(/\n$/, ''))
                                    toast.success('Code copied')
                                  }}
                                  className="absolute top-2 right-2 p-1 bg-white/10 hover:bg-white/20 rounded shadow-sm opacity-0 group-hover/code:opacity-100 transition-opacity"
                                >
                                  <Copy className="w-3 h-3 text-slate-400" />
                                </button>
                                <pre className="p-3 text-[11px] bg-slate-900 rounded-xl overflow-x-auto scrollbar-hide" {...props}>
                                  <code>{children}</code>
                                </pre>
                              </div>
                            ) : (
                              <code className={className} {...props}>{children}</code>
                            )
                          }
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                      <button onClick={() => { onInsert(m.content); toast.success('Inserted into editor') }}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/30 dark:hover:bg-violet-900/50 text-[11px] font-bold text-violet-600 dark:text-violet-400 transition-all border border-violet-100 dark:border-violet-800/50">
                        <Plus className="w-3.5 h-3.5" /> Insert into document
                      </button>
                    </>
                  ) : (
                    <p className="leading-relaxed">{m.content}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {aiLoading && (
          <div className="flex gap-2.5 justify-start animate-pulse">
            <div className="w-7 h-7 bg-gradient-to-br from-violet-400 to-sky-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl rounded-tl-sm px-4 py-2 flex items-center gap-2 shadow-sm">
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2].map(j => (
                  <div key={j} className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: `${j * 0.15}s` }} />
                ))}
              </div>
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">FlowAI thinking</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-2.5 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex gap-1.5">
          <input value={msg} onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && msg.trim() && sendMutation.mutate(msg)}
            placeholder="Message or @FlowAI..." className="input flex-1 text-xs" />
          <button onClick={() => sendMutation.mutate(msg)} disabled={!msg.trim() || sendMutation.isPending}
            className="btn-primary p-2 flex-shrink-0"><Send className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>
  )
}

// ─── FILES PANEL ─────────────────────────────────────────────────────────────
function FilesPanel({ wsId }: { wsId: number }) {
  const [dragging, setDragging] = useState(false)
  const [showLinkResource, setShowLinkResource] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['workspace-files', wsId],
    queryFn: () => workspaceApi.getFiles(wsId).then(r => r.data),
  })
  const uploaded: any[] = data?.uploaded || []
  const linked: any[] = data?.linked_resources || []

  const { data: libraryData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
    enabled: showLinkResource,
  })
  const libraryResources: any[] = libraryData?.results || []

  const uploadMutation = useMutation({
    mutationFn: (file: File) => workspaceApi.uploadFile(wsId, file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspace-files', wsId] }); toast.success('File uploaded!') },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Upload failed.'),
  })

  const linkMutation = useMutation({
    mutationFn: (resource_id: number) => workspaceApi.linkResource(wsId, resource_id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspace-files', wsId] }); setShowLinkResource(false); toast.success('Resource linked!') },
  })

  const deleteMutation = useMutation({
    mutationFn: (file_id: number) => workspaceApi.deleteFile(wsId, file_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-files', wsId] }),
  })

  const unlinkMutation = useMutation({
    mutationFn: (resource_id: number) => workspaceApi.unlinkResource(wsId, resource_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-files', wsId] }),
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadMutation.mutate(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  const fileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return '📄'
    if (['doc', 'docx'].includes(ext || '')) return '📝'
    if (['png', 'jpg', 'jpeg', 'gif'].includes(ext || '')) return '🖼️'
    return '📎'
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* Drop zone */}
      <div className="p-3 flex-shrink-0">
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all',
            dragging ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30' :
            uploadMutation.isPending ? 'border-sky-300 bg-sky-50 dark:bg-sky-950/20' :
            'border-gray-200 dark:border-gray-700 hover:border-violet-300 hover:bg-violet-50/50 dark:hover:bg-violet-950/10'
          )}>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" className="hidden" onChange={handleFileChange} />
          {uploadMutation.isPending ? (
            <div className="flex flex-col items-center gap-1.5">
              <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
              <p className="text-xs text-sky-500">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Upload className="w-6 h-6 text-gray-400" />
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Drop files or click to upload</p>
              <p className="text-xs text-gray-400">PDF, Word, Images · max 20MB</p>
            </div>
          )}
        </div>

        <button onClick={() => setShowLinkResource(!showLinkResource)}
          className="w-full mt-2 flex items-center justify-center gap-2 text-xs text-violet-500 hover:text-violet-600 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50 rounded-xl py-2 transition-colors font-medium">
          <Link2 className="w-3.5 h-3.5" /> Link from Library
        </button>

        {showLinkResource && (
          <div className="mt-2 bg-gray-50 dark:bg-gray-800 rounded-xl p-2 space-y-1 max-h-40 overflow-y-auto">
            {libraryResources.filter(r => !linked.find((l: any) => l.id === r.id)).map((r: any) => (
              <button key={r.id} onClick={() => linkMutation.mutate(r.id)}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors text-left">
                <span className="text-sm">{r.resource_type === 'pdf' ? '📄' : '🎥'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{r.title}</div>
                  <div className="text-xs text-gray-400 capitalize">{r.resource_type}</div>
                </div>
                <Plus className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
              </button>
            ))}
            {libraryResources.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No resources in library</p>}
          </div>
        )}
      </div>

      {/* Uploaded files */}
      {uploaded.length > 0 && (
        <div className="px-3 pb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Uploaded Files</p>
          <div className="space-y-1.5">
            {uploaded.map((f: any) => (
              <div key={f.id} className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 group">
                <span className="text-base flex-shrink-0">{fileIcon(f.name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{f.name}</div>
                  <div className="text-xs text-gray-400">{formatSize(f.file_size)} · {f.uploaded_by_name}</div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {f.file_url && (
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                      className="p-1 text-gray-400 hover:text-sky-500 rounded transition-colors">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button onClick={() => deleteMutation.mutate(f.id)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked library resources */}
      {linked.length > 0 && (
        <div className="px-3 pb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Linked Resources</p>
          <div className="space-y-1.5">
            {linked.map((r: any) => (
              <div key={r.id} className="flex items-center gap-2.5 bg-violet-50 dark:bg-violet-950/20 rounded-xl px-3 py-2 group">
                <span className="text-base flex-shrink-0">{r.type === 'pdf' ? '📄' : '🎥'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{r.title}</div>
                  <div className="text-xs text-violet-400 capitalize">{r.type} · {r.subject || 'Library'}</div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link href={`/library/${r.id}`}
                    className="p-1 text-gray-400 hover:text-sky-500 rounded transition-colors">
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                  <button onClick={() => unlinkMutation.mutate(r.id)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {uploaded.length === 0 && linked.length === 0 && !isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6">
          <Paperclip className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-xs text-center">No files yet. Upload PDFs or link resources from your library — FlowAI will read them.</p>
        </div>
      )}
    </div>
  )
}

// ─── TASKS PANEL ─────────────────────────────────────────────────────────────
function TasksPanel({ wsId }: { wsId: number }) {
  const [newTask, setNewTask] = useState('')
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['workspace-tasks', wsId],
    queryFn: () => workspaceApi.getTasks(wsId).then(r => r.data),
  })
  const tasks: any[] = data || []

  const createMutation = useMutation({
    mutationFn: () => workspaceApi.createTask(wsId, { title: newTask }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspace-tasks', wsId] }); setNewTask('') },
  })

  const updateMutation = useMutation({
    mutationFn: ({ taskId, data }: any) => workspaceApi.updateTask(wsId, taskId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-tasks', wsId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (taskId: number) => workspaceApi.deleteTask(wsId, taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-tasks', wsId] }),
  })

  const COLS = [
    { id: 'todo', label: 'To Do', color: 'text-gray-500' },
    { id: 'in_progress', label: 'In Progress', color: 'text-sky-500' },
    { id: 'done', label: 'Done', color: 'text-emerald-500' },
  ]
  const nextStatus = (s: string) => s === 'todo' ? 'in_progress' : s === 'in_progress' ? 'done' : 'todo'

  return (
    <div className="flex flex-col flex-1 min-h-0 p-3 space-y-3 overflow-y-auto">
      <div className="flex gap-1.5">
        <input value={newTask} onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && newTask.trim() && createMutation.mutate()}
          placeholder="Add a task..." className="input flex-1 text-xs" />
        <button onClick={() => createMutation.mutate()} disabled={!newTask.trim()}
          className="btn-primary p-2 flex-shrink-0"><Plus className="w-3.5 h-3.5" /></button>
      </div>
      {COLS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.id)
        return (
          <div key={col.id}>
            <div className={cn('text-xs font-semibold mb-1.5 flex items-center gap-1.5', col.color)}>
              {col.label}
              <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-full px-1.5 text-xs">{colTasks.length}</span>
            </div>
            <div className="space-y-1">
              {colTasks.map(task => (
                <div key={task.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-2.5 py-2 group">
                  <button onClick={() => updateMutation.mutate({ taskId: task.id, data: { status: nextStatus(task.status) } })}
                    className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                      task.status === 'done' ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 dark:border-gray-600 hover:border-sky-400')}>
                    {task.status === 'done' && <Check className="w-2.5 h-2.5 text-white" />}
                  </button>
                  <span className={cn('flex-1 text-xs', task.status === 'done' && 'line-through text-gray-400')}>{task.title}</span>
                  <button onClick={() => deleteMutation.mutate(task.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {colTasks.length === 0 && <div className="text-xs text-gray-300 dark:text-gray-700 text-center py-1.5">Empty</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── MEMBERS PANEL ───────────────────────────────────────────────────────────
function MembersPanel({ wsId, inviteCode, onCopy }: { wsId: number; inviteCode: string; onCopy: () => void }) {
  const { data } = useQuery({
    queryKey: ['workspace-members', wsId],
    queryFn: () => workspaceApi.getMembers(wsId).then(r => r.data),
    refetchInterval: 10000,
  })
  const members: any[] = data || []
  const isRecent = (date: string) => Date.now() - new Date(date).getTime() < 5 * 60 * 1000

  return (
    <div className="flex flex-col flex-1 min-h-0 p-3 space-y-4 overflow-y-auto">
      <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3">
        <p className="text-xs font-medium text-violet-700 dark:text-violet-300 mb-2">Invite teammates</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono font-bold text-violet-600 dark:text-violet-400 bg-white dark:bg-gray-900 rounded-lg px-3 py-1.5 text-center tracking-widest">
            {inviteCode}
          </code>
          <button onClick={onCopy} className="btn-primary p-2 flex-shrink-0"><Copy className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="space-y-2">
        {members.map((m: any) => (
          <div key={m.id} className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                {getInitials(m.user?.first_name || m.user?.username || 'U')}
              </div>
              {isRecent(m.last_seen) && (
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white dark:border-gray-900" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">
                {m.user?.first_name ? `${m.user.first_name} ${m.user.last_name || ''}`.trim() : m.user?.username}
              </div>
              <div className="text-xs text-gray-400 capitalize">{m.role}</div>
            </div>
            {isRecent(m.last_seen) && <span className="text-xs text-emerald-500 flex-shrink-0">Online</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── HISTORY PANEL ───────────────────────────────────────────────────────────
function HistoryPanel({ wsId, onRestore }: { wsId: number; onRestore: (content: string) => void }) {
  const { data } = useQuery({
    queryKey: ['workspace-versions', wsId],
    queryFn: () => workspaceApi.getVersions(wsId).then(r => r.data),
  })
  const versions: any[] = data || []
  const qc = useQueryClient()

  const restoreMutation = useMutation({
    mutationFn: (version_id: number) => workspaceApi.restoreVersion(wsId, version_id),
    onSuccess: (res) => {
      onRestore(res.data.content)
      qc.invalidateQueries({ queryKey: ['workspace-doc', wsId] })
      toast.success('Version restored!')
    },
  })

  return (
    <div className="flex flex-col flex-1 min-h-0 p-3 overflow-y-auto">
      <p className="text-xs text-gray-400 mb-3">Snapshots saved every 10 edits.</p>
      {versions.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <History className="w-7 h-7 mx-auto mb-2 opacity-30" />
          <p className="text-xs">No snapshots yet.</p>
        </div>
      ) : versions.map((v: any) => (
        <div key={v.id} className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl p-2.5 mb-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium">Version {v.version}</div>
            <div className="text-xs text-gray-400">{v.saved_by_name} · {format(new Date(v.created_at), 'MMM d, HH:mm')}</div>
          </div>
          <button onClick={() => restoreMutation.mutate(v.id)}
            className="text-xs text-sky-500 hover:text-sky-600 font-medium flex items-center gap-1 flex-shrink-0">
            <RotateCcw className="w-3 h-3" /> Restore
          </button>
        </div>
      ))}
    </div>
  )
}
