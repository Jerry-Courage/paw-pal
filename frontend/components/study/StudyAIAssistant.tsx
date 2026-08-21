'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { aiApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { normalizeForRendering } from '@/lib/mathFormatting'

interface Message {
  role: 'user' | 'ai'
  text: string
}

interface StudyAIAssistantProps {
  resourceId: number
  sectionContent: string
  sectionTitle: string
}

export default function StudyAIAssistant({ resourceId, sectionContent, sectionTitle }: StudyAIAssistantProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectionChip, setSelectionChip] = useState<{ text: string; x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const selectedTextRef = useRef('')

  // ── Text selection listener ─────────────────────────────────────────
  useEffect(() => {
    const handleSelection = () => {
      const sel = window.getSelection()
      const text = sel?.toString().trim() || ''
      if (text.length < 5 || open) {
        setSelectionChip(null)
        return
      }
      // Get position near the end of the selection
      const range = sel?.getRangeAt(0)
      if (!range) return
      const rect = range.getBoundingClientRect()
      setSelectionChip({
        text,
        x: Math.min(rect.right, window.innerWidth - 160),
        y: rect.top + window.scrollY - 48,
      })
    }

    document.addEventListener('selectionchange', handleSelection)
    document.addEventListener('mouseup', () => setTimeout(handleSelection, 10))
    document.addEventListener('touchend', () => setTimeout(handleSelection, 10))
    return () => {
      document.removeEventListener('selectionchange', handleSelection)
    }
  }, [open])

  // ── Scroll to bottom on new messages ────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Explain selected text ───────────────────────────────────────────
  const explainSelection = useCallback(async (text: string) => {
    setSelectionChip(null)
    window.getSelection()?.removeAllRanges()
    setOpen(true)
    setMessages(prev => [...prev, { role: 'user', text: `Explain: "${text.slice(0, 200)}${text.length > 200 ? '...' : ''}"` }])
    setLoading(true)
    try {
      const { data } = await aiApi.explainText(text, sectionContent.slice(0, 3000))
      setMessages(prev => [...prev, { role: 'ai', text: data.explanation || "I couldn't generate an explanation. Try rephrasing." }])
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Failed to get explanation. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }, [sectionContent])

  // ── Send a follow-up question ───────────────────────────────────────
  const sendQuestion = useCallback(async () => {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)
    try {
      const { data } = await aiApi.quickAsk(
        `You are tutoring a student studying "${sectionTitle}". Be concise (under 100 words). Use markdown.\n\nStudent question: ${q}`,
        resourceId,
      )
      setMessages(prev => [...prev, { role: 'ai', text: data.answer || "I'm not sure. Try asking differently." }])
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Failed to get answer. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, resourceId, sectionTitle])

  // ── Clear chat ──────────────────────────────────────────────────────
  const clearChat = () => { setMessages([]); setInput('') }

  // ── Keyboard handling ───────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendQuestion()
    }
  }

  return (
    <>
      {/* ── Selection "Explain this" chip ──────────────────────────── */}
      {selectionChip && (
        <button
          onClick={() => explainSelection(selectionChip.text)}
          className="fixed z-[60] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-on-primary text-[12px] font-bold shadow-lg shadow-primary/30 active:scale-95 transition-transform"
          style={{ left: selectionChip.x, top: selectionChip.y }}
        >
          <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
          Explain this
        </button>
      )}

      {/* ── Floating AI button ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed z-[55] w-12 h-12 rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all duration-200",
          open
            ? "bg-surface-container-high text-on-surface border border-outline-variant/40 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-5"
            : "bg-primary text-on-primary shadow-primary/30 bottom-5 left-5"
        )}
      >
        <span className="material-symbols-outlined text-[22px]" style={open ? {} : { fontVariationSettings: "'FILL' 1" }}>
          {open ? 'close' : 'auto_awesome'}
        </span>
      </button>

      {/* ── Slide-up / Full-screen panel ───────────────────────────── */}
      <div
        ref={panelRef}
        className={cn(
          "fixed z-[100] bg-surface-container-low transition-transform duration-300 ease-out flex flex-col shadow-2xl",
          // Mobile: full screen overlay when open
          "inset-0 rounded-none border-0",
          // Desktop (xl+): left sidebar
          "xl:inset-auto xl:left-0 xl:top-0 xl:bottom-0 xl:w-80 xl:border-r xl:border-outline-variant/30 xl:rounded-none",
          open
            ? "translate-y-0 xl:translate-x-0"
            : "translate-y-full xl:-translate-x-full"
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 shrink-0 bg-surface-container">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-on-surface">FlowAI Study Helper</p>
              <p className="text-[11px] text-on-surface-variant truncate max-w-[220px] sm:max-w-md">{sectionTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button onClick={clearChat} className="p-2 rounded-xl hover:bg-surface-container-high text-on-surface-variant" title="Clear chat">
                <span className="material-symbols-outlined text-[18px]">delete_outline</span>
              </button>
            )}
            {/* Visible close button for mobile full screen */}
            <button
              onClick={() => setOpen(false)}
              className="p-2.5 rounded-xl bg-surface-container-high text-on-surface hover:bg-surface-container-highest active:scale-95 transition-all flex items-center justify-center border border-outline-variant/30"
              aria-label="Close assistant"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-primary/50 text-[24px]">chat_bubble_outline</span>
              </div>
              <p className="text-[13px] text-on-surface-variant font-medium mb-1">Ask about anything</p>
              <p className="text-[11px] text-on-surface-variant/60 max-w-[200px]">
                Highlight text in the lesson and tap &quot;Explain this&quot;, or type a question below.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                msg.role === 'user'
                  ? "bg-primary/15 text-on-surface border border-primary/20 rounded-br-md"
                  : "bg-surface-container-high text-on-surface border border-outline-variant/20 rounded-bl-md"
              )}>
                {msg.role === 'ai' ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {normalizeForRendering(msg.text)}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="font-medium">{msg.text}</p>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-surface-container-high border border-outline-variant/20 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick action chips */}
        {messages.length === 0 && !loading && (
          <div className="px-4 pb-2 flex flex-wrap gap-2 shrink-0">
            {["Simplify this", "Give an example", "Key takeaway"].map((chip) => (
              <button
                key={chip}
                onClick={() => { setInput(`In one sentence: ${chip.toLowerCase()} for this section`); inputRef.current?.focus() }}
                className="px-3 py-1.5 rounded-full bg-surface-container-high border border-outline-variant/20 text-[11px] font-semibold text-on-surface-variant hover:text-on-surface hover:border-primary/30 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-3 pb-3 pt-1 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
          <div className="flex items-end gap-2 bg-surface-container-high rounded-2xl border border-outline-variant/30 px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              rows={1}
              className="flex-1 bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant/50 resize-none outline-none max-h-20 scrollbar-hide"
              style={{ minHeight: '20px' }}
            />
            <button
              onClick={sendQuestion}
              disabled={!input.trim() || loading}
              className="p-1.5 rounded-lg bg-primary text-on-primary disabled:opacity-30 disabled:pointer-events-none transition-opacity shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
