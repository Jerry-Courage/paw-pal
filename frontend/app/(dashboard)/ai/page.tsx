'use client'

import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { aiApi, libraryApi } from '@/lib/api'
import {
  Sparkles, Send, Plus, Loader2, Paperclip, X,
  Network, GitBranch, Menu, BarChart2, Wand2,
  MessageSquare, Copy, Check, Download, Trash2,
  Image as ImageIcon, GitMerge, Maximize2,
  Video, Mic, MicOff, Volume2, VolumeX, Zap,
  Lightbulb, Brain, Calculator, BookOpen, RefreshCw
} from 'lucide-react'
import { timeAgo, cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { normalizeForRendering } from '@/lib/mathFormatting'
import dynamic from 'next/dynamic'
const CameraVisionModal = dynamic(() => import('@/components/ai/CameraVisionModal'), { ssr: false })

// â”€â”€â”€ LIGHTBOX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Lightbox({ src, type, onClose }: { src: string; type: 'image' | 'svg'; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-surface-container-highest hover:bg-white/20 flex items-center justify-center transition-all"
      >
        <X className="w-5 h-5 text-on-surface" />
      </button>
      <div
        className="max-w-[95vw] max-h-[90vh] overflow-auto rounded-2xl bg-surface-container-low border border-outline-variant/50"
        onClick={e => e.stopPropagation()}
      >
        {type === 'image' ? (
          <img src={src} alt="preview" className="max-w-full max-h-[85vh] object-contain" />
        ) : (
          <div className="p-6 [&_svg]:max-w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: src }} />
        )}
      </div>
    </div>
  )
}


// â”€â”€â”€ TYPES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type Message = {
  id?: string | number
  role: 'user' | 'assistant'
  content: string
  image?: string
  diagram?: string
  is_streaming?: boolean
  // what the AI is currently doing (for loading indicator)
  pending_action?: 'diagram' | 'image' | null
  file?: File // Store original file for regeneration
}

const SUGGESTIONS = [
  { icon: 'psychology', text: 'Explain backpropagation in simple terms' },
  { icon: 'hub', text: 'Draw a roadmap for learning machine learning' },
  { icon: 'functions', text: 'What are the key concepts in linear algebra?' },
  { icon: 'eco', text: 'Help me understand the Krebs cycle' },
  { icon: 'code', text: 'Explain Big O notation with examples' },
]

// â”€â”€â”€ MERMAID RENDERER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MermaidChart({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [rawCode, setRawCode] = useState<string>('')
  const [lightboxSvg, setLightboxSvg] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setError(null)
    setSvg('')

    // The chart prop is already clean mermaid code (e.g. "graph LR\nA-->B")
    // Just strip any accidental markdown fences if present
    let clean = chart
      .replace(/^```(?:mermaid)?\s*/im, '')
      .replace(/\s*```\s*$/im, '')
      .trim()

    // Fix |text|> arrow syntax
    clean = clean.replace(/\|([^|]+)\|>/g, '|$1|')
    // Strip over-quoted labels: A["text"] is fine, but A[""text""] is not
    clean = clean.replace(/\[""/g, '["').replace(/""\]/g, '"]')

    if (!clean || clean.length < 5) {
      setError('Empty diagram â€” ask Flow AI to regenerate it.')
      return
    }
    setRawCode(clean)

    import('mermaid').then(async (mod) => {
      const mermaid = mod.default
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          darkMode: true,
          securityLevel: 'loose',
          fontFamily: 'Outfit, Inter, system-ui, sans-serif',
          suppressErrorRendering: true,
          themeVariables: {
            background: '#0d0d0d',
            primaryColor: '#f97316',
            primaryTextColor: '#f1f5f9',
            primaryBorderColor: '#f97316',
            lineColor: '#475569',
            secondaryColor: '#1a1a1a',
            tertiaryColor: '#1f1f1f',
            edgeLabelBackground: '#1a1a1a',
            clusterBkg: '#1a1a1a',
            titleColor: '#f1f5f9',
            nodeTextColor: '#f1f5f9',
            fontFamily: 'Outfit, Inter, system-ui, sans-serif',
          },
        })
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        const { svg: rendered } = await mermaid.render(id, clean)
        setSvg(rendered)
      } catch (err: any) {
        // Fallback: strip lines that commonly cause parse errors
        try {
          const stripped = clean
            .split('\n')
            .filter(l => {
              const t = l.trim()
              return !t.startsWith('classDef') &&
                     !t.startsWith('%%') &&
                     !t.startsWith('class ') &&
                     !t.startsWith('style ') &&
                     !t.startsWith('linkStyle ')
            })
            .join('\n')
            .trim()
          if (stripped && stripped.length > 5) {
            const id2 = `mermaid-fb-${Math.random().toString(36).substr(2, 9)}`
            const { svg: rendered2 } = await mermaid.render(id2, stripped)
            setSvg(rendered2)
            return
          }
        } catch (e2: any) {
          // both attempts failed
        }
        setError('Diagram syntax error â€” ask Flow AI to regenerate it.')
        document.querySelectorAll('[id^="dmermaid-"]').forEach(el => el.remove())
      }
    })

    return () => { document.querySelectorAll('[id^="dmermaid-"]').forEach(el => el.remove()) }
  }, [chart])

  if (error) return (
    <div className="p-4 bg-red-500/8 border border-red-500/20 rounded-2xl space-y-2">
      <p className="text-sm font-bold text-red-400">{error}</p>
      <details>
        <summary className="text-[10px] text-on-surface-variant/40 cursor-pointer hover:text-on-surface-variant select-none">Show raw code</summary>
        <pre className="mt-2 text-[10px] font-mono text-on-surface-variant/60 overflow-x-auto whitespace-pre-wrap break-all bg-black/20 p-3 rounded-xl">{rawCode}</pre>
      </details>
    </div>
  )

  if (!svg) return (
    <div className="p-5 flex items-center gap-2.5 bg-surface-container-low border border-outline-variant/25 rounded-2xl">
      <GitMerge className="w-4 h-4 text-violet-400 animate-pulse shrink-0" />
      <span className="text-xs text-on-surface-variant font-medium">Rendering diagram...</span>
    </div>
  )

  return (
    <div className="rounded-2xl border border-outline-variant/40 overflow-hidden bg-background my-2">
      <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant/25 bg-surface-container-low">
        <div className="flex items-center gap-2">
          <GitMerge className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Diagram</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLightboxSvg(svg)}
            className="text-[10px] text-on-surface-variant/40 hover:text-primary transition-colors font-medium flex items-center gap-1"
          >
            <Maximize2 className="w-3 h-3" /> Expand
          </button>
          <button
            onClick={() => {
              const el = containerRef.current?.querySelector('svg')
              if (el) {
                const blob = new Blob([new XMLSerializer().serializeToString(el)], { type: 'image/svg+xml' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = 'diagram.svg'; a.click()
                URL.revokeObjectURL(url)
                toast.success('Diagram downloaded')
              }
            }}
            className="text-[10px] text-on-surface-variant/40 hover:text-primary transition-colors font-medium flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> SVG
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="overflow-x-auto p-4 [&_svg]:max-w-full [&_svg]:h-auto cursor-zoom-in"
        dangerouslySetInnerHTML={{ __html: svg }}
        onClick={() => setLightboxSvg(svg)}
      />
      {lightboxSvg && <Lightbox src={lightboxSvg} type="svg" onClose={() => setLightboxSvg(null)} />}
    </div>
  )
}

// â”€â”€â”€ RICH MARKDOWN RENDERER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Intercepts ```mermaid blocks AND bare diagram type blocks (graph, flowchart, etc.)
// and renders them as MermaidChart instead of plain code blocks

const MERMAID_STARTERS = [
  'graph ', 'graph\n', 'flowchart ', 'flowchart\n',
  'sequenceDiagram', 'classDiagram', 'erDiagram',
  'stateDiagram', 'gantt', 'pie ', 'pie\n',
  'mindmap', 'timeline', 'gitGraph', 'journey',
  'quadrantChart', 'requirementDiagram', 'C4Context',
]

function isMermaidCode(lang: string | undefined, code: string): boolean {
  if (lang === 'mermaid') return true
  if (!lang || lang === '') {
    // Check if the code content looks like mermaid
    const trimmed = code.trim()
    return MERMAID_STARTERS.some(s => trimmed.startsWith(s))
  }
  // Also catch when lang IS the diagram type (e.g. ```graph LR)
  const langLower = (lang || '').toLowerCase()
  return ['graph', 'flowchart', 'sequencediagram', 'classdiagram', 'erdiagram',
    'statediagram', 'gantt', 'pie', 'mindmap', 'timeline', 'gitgraph'].includes(langLower)
}

function RichContent({ content }: { content: string }) {
  const CALLOUT_STYLES: Record<string, { icon: string; bg: string; border: string; label: string }> = {
    NOTE: { icon: '💡', bg: 'bg-sky-500/5', border: 'border-sky-500/20', label: 'Note' },
    TIP: { icon: '🔥', bg: 'bg-amber-500/5', border: 'border-amber-500/20', label: 'Tip' },
    IMPORTANT: { icon: '⚡', bg: 'bg-purple-500/5', border: 'border-purple-500/20', label: 'Important' },
    WARNING: { icon: '⚠️', bg: 'bg-red-500/5', border: 'border-red-500/20', label: 'Warning' },
    FORMULA: { icon: '🧮', bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', label: 'Formula' },
    KEY: { icon: '🗝️', bg: 'bg-primary/5', border: 'border-primary/20', label: 'Key Concept' },
    EXAMPLE: { icon: '📝', bg: 'bg-violet-500/5', border: 'border-violet-500/20', label: 'Example' },
    SUMMARY: { icon: '📊', bg: 'bg-pink-500/5', border: 'border-pink-500/20', label: 'Summary' },
  }
  const processCallouts = (text: string) => {
    return text.replace(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|FORMULA|KEY|EXAMPLE|SUMMARY)\]\s*\n((?:>.*\n?)*)/gm,
      (_match: string, type: string, body: string) => {
        const style = CALLOUT_STYLES[type] || CALLOUT_STYLES.NOTE
        const cleanBody = body.replace(/^>\s?/gm, '').trim()
        return `<div class="${style.bg} ${style.border} border rounded-xl p-4 my-3"><div class="flex items-center gap-2 mb-2"><span class="text-sm">${style.icon}</span><span class="text-xs font-black uppercase tracking-widest text-on-surface/60">${style.label}</span></div><div class="text-sm text-on-surface/80 leading-relaxed">${cleanBody}</div></div>`
      }
    )
  }
  // Split content into text segments and mermaid blocks (```mermaid ... ```)
  const parts: Array<{ type: 'text' | 'mermaid'; content: string }> = []
  // Match ```mermaid, ```graph LR, ```flowchart TD, etc. â€” capture the FULL first line as part of code
  const mermaidRegex = /```(mermaid|graph(?:\s+\w+)?|flowchart(?:\s+\w+)?|sequenceDiagram|classDiagram|erDiagram|stateDiagram(?:-v2)?|gantt|pie(?:\s+title)?|mindmap|timeline|gitGraph|journey|quadrantChart|requirementDiagram)([^\n]*)\n([\s\S]*?)```/gi
  let lastIndex = 0
  let match

  while ((match = mermaidRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    // Reconstruct: lang + rest of first line + newline + body
    // e.g. lang='graph', rest=' LR', body='A-->B\n...'
    const lang = match[1]
    const restOfFirstLine = match[2] || ''
    const body = match[3] || ''
    const fullCode = `${lang}${restOfFirstLine}\n${body}`.trim()
    parts.push({ type: 'mermaid', content: fullCode })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) })
  }

  // If no mermaid blocks found, just render as markdown
  if (parts.length === 0) parts.push({ type: 'text', content })

  return (
    <div className="space-y-3">
      {parts.map((part, i) =>
        part.type === 'mermaid' ? (
          <MermaidChart key={i} chart={part.content} />
        ) : (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              h1: ({ children }) => <h1 className="text-2xl font-black text-on-surface mt-8 mb-4 tracking-tight border-b border-outline-variant/20 pb-3">{children}</h1>,
              h2: ({ children }) => <h2 className="text-xl font-black text-on-surface mt-7 mb-3 tracking-tight">{children}</h2>,
              h3: ({ children }) => <h3 className="text-lg font-bold text-on-surface mt-5 mb-2">{children}</h3>,
              h4: ({ children }) => <h4 className="text-base font-bold text-on-surface mt-4 mb-2 text-on-surface/80">{children}</h4>,
              p: ({ children }) => <p className="text-on-surface/90 leading-[1.8] mb-4 last:mb-0 text-[16px]">{children}</p>,
              ul: ({ children }) => <ul className="my-3 space-y-2.5 pl-1">{children}</ul>,
              ol: ({ children }) => <ol className="my-3 space-y-2.5 pl-1 counter-[ol]">{children}</ol>,
              li: ({ children }) => (
                <li className="flex gap-3 items-start text-on-surface/90 mb-1 last:mb-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 shrink-0 opacity-60" />
                  <span className="flex-1 leading-[1.8] text-[16px]">{children}</span>
                </li>
              ),
              strong: ({ children }) => <strong className="font-bold text-on-surface">{children}</strong>,
              em: ({ children }) => <em className="italic text-on-surface/80">{children}</em>,
              blockquote: ({ children }) => (
                <blockquote className="my-4 pl-4 border-l-2 border-primary/40 text-on-surface/70 italic">{children}</blockquote>
              ),
              code: ({ className, children, ...props }: any) => {
                const lang = className?.replace('language-', '') || ''
                const codeStr = String(children).replace(/\n$/, '')
                if (isMermaidCode(lang, codeStr)) {
                  return <MermaidChart chart={lang ? `${lang}\n${codeStr}` : codeStr} />
                }
                const isInline = !className
                if (isInline) return (
                  <code className="px-1.5 py-0.5 bg-primary/10 text-primary rounded-md text-[0.85em] font-mono font-medium">{children}</code>
                )
                return (
                  <div className="my-4 rounded-xl overflow-hidden border border-outline-variant/30">
                    <div className="flex items-center justify-between px-4 py-2 bg-surface-container-high/80 border-b border-outline-variant/20">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-400/60" />
                        <span className="w-2 h-2 rounded-full bg-yellow-400/60" />
                        <span className="w-2 h-2 rounded-full bg-emerald-400/60" />
                        <span className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-widest ml-2">
                          {lang || 'code'}
                        </span>
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(codeStr); toast.success('Copied') }}
                        className="text-[10px] text-on-surface-variant/40 hover:text-primary transition-colors flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                    <pre className="p-4 overflow-x-auto bg-[#0a0a0a]">
                      <code className="text-sm font-mono text-on-surface/80 leading-relaxed">{children}</code>
                    </pre>
                  </div>
                )
              },
              pre: ({ children }) => <>{children}</>,
              table: ({ children }) => (
                <div className="my-4 overflow-x-auto rounded-xl border border-outline-variant/30">
                  <table className="w-full text-sm">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-surface-container-high/60 border-b border-outline-variant/30">{children}</thead>,
              th: ({ children }) => <th className="px-4 py-2.5 text-left text-xs font-bold text-on-surface/70 uppercase tracking-wider">{children}</th>,
              td: ({ children }) => <td className="px-4 py-2.5 text-on-surface/80 border-t border-outline-variant/20">{children}</td>,
              hr: () => <hr className="my-6 border-outline-variant/30" />,
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noopener noreferrer"
                  className="text-primary underline decoration-orange-400/30 underline-offset-2 hover:decoration-orange-400 transition-all">
                  {children}
                </a>
              ),
            }}
          >
            {normalizeForRendering(processCallouts(part.content))}
          </ReactMarkdown>
        )
      )}
    </div>
  )
}

// â”€â”€â”€ THINKING INDICATOR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ThinkingIndicator({ action }: { action?: 'diagram' | 'image' | null }) {
  const states = action === 'diagram'
    ? { icon: GitMerge, color: 'text-violet-400', bg: 'bg-violet-500/5', border: 'border-violet-500/10', label: 'Drafting diagram...' }
    : action === 'image'
    ? { icon: ImageIcon, color: 'text-pink-400', bg: 'bg-pink-500/5', border: 'border-pink-500/10', label: 'Synthesizing image...' }
    : { icon: Sparkles, color: 'text-primary', bg: 'bg-primary-container/5', border: 'border-orange-500/10', label: 'Processing...' }

  const Icon = states.icon

  return (
    <div className="flex items-start gap-4">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-surface-container-high border border-outline-variant/25')}>
        <Icon className={cn('w-4 h-4', states.color, 'animate-pulse')} />
      </div>
      <div className={cn('px-5 py-3.5 rounded-2xl rounded-tl-none border backdrop-blur-md', states.bg, states.border)}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {[0,1,2].map(i => (
              <span key={i} className={cn('w-1.5 h-1.5 rounded-full animate-bounce', states.color.replace('text-', 'bg-'))}
                style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
          <span className={cn('text-[11px] font-bold tracking-wider uppercase opacity-80', states.color)}>{states.label}</span>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ MESSAGE COMPONENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MessageBubble({ msg, index, isLast, onRegenerate }: { msg: Message; index: number; isLast?: boolean; onRegenerate?: (index: number) => void }) {
  const [copied, setCopied] = useState(false)
  const [imgLightbox, setImgLightbox] = useState<string | null>(null)
  const isUser = msg.role === 'user'

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied')
  }

  const downloadImage = (e: React.MouseEvent, url: string) => {
    e.stopPropagation()
    const link = document.createElement('a')
    link.href = url
    link.download = `generated-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className={cn('flex gap-4 group w-full', isUser ? 'justify-end' : 'justify-start')}>
      {/* Content Area */}
      <div className={cn(
        'flex flex-col min-w-0',
        isUser ? 'items-end max-w-[85%] sm:max-w-[75%]' : 'items-start flex-1 max-w-full'
      )}>
        {isUser ? (
          /* User: clean right-aligned text, no bubble */
          <div className="text-on-surface/90">
            <p className="text-[16px] leading-[1.8] whitespace-pre-wrap">{msg.content}</p>
            {msg.image && (
              <div className="mt-3 rounded-2xl overflow-hidden border border-outline-variant/30 max-w-sm">
                <img src={msg.image} alt="attachment" className="max-w-full h-auto max-h-64 object-contain" />
              </div>
            )}
          </div>
        ) : (
          /* AI: ChatGPT-style — clean, no bubble, full width */
          <div className="w-full">
            {/* Main content — no bubble, just structured text */}
            <div className="text-[16px] leading-relaxed w-full">
              <RichContent content={msg.content} />
            </div>

            {/* AI-generated image */}
            {msg.image && (
              <div 
                className="mt-4 rounded-2xl overflow-hidden border border-outline-variant/50 cursor-zoom-in relative group/img shadow-2xl transition-transform hover:scale-[1.01] active:scale-[0.99] max-w-lg"
                onClick={() => setImgLightbox(msg.image!)}
              >
                <img src={msg.image} alt="generated" className="max-w-full h-auto" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
                  <div className="flex items-center justify-between gap-2 translate-y-4 group-hover/img:translate-y-0 transition-transform duration-300">
                    <button 
                      onClick={(e) => downloadImage(e, msg.image!)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-highest backdrop-blur-md border border-outline-variant/50 rounded-xl text-[10px] font-bold text-on-surface hover:bg-white/20 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" /> DOWNLOAD
                    </button>
                    <div className="p-2 bg-surface-container-highest backdrop-blur-md border border-outline-variant/50 rounded-xl">
                      <Maximize2 className="w-4 h-4 text-on-surface" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Standalone diagram */}
            {msg.diagram && (
              <div className="mt-4 animate-fade-in">
                <MermaidChart chart={msg.diagram} />
              </div>
            )}
          </div>
        )}

        {/* Actions row — only for AI messages */}
        {!isUser && (
          <div className="flex items-center gap-3 pl-0 mt-2">
            <button
              onClick={handleCopy}
              className="group/copy flex items-center gap-1.5 text-on-surface-variant/60 hover:text-primary transition-colors text-[10px] font-black uppercase tracking-widest"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 group-hover/copy:scale-110 transition-transform" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {isLast && onRegenerate && (
              <>
                <div className="h-1 w-1 rounded-full bg-surface-container-highest" />
                <button 
                  onClick={() => onRegenerate(index)}
                  className="group/regen flex items-center gap-1.5 text-on-surface-variant/60 hover:text-primary transition-colors text-[10px] font-black uppercase tracking-widest"
                >
                  <RefreshCw className="w-3 h-3 group-hover/regen:rotate-12 transition-transform" />
                  Regenerate
                </button>
              </>
            )}
            <div className="h-1 w-1 rounded-full bg-surface-container-highest" />
            <button
              onClick={() => {
                const u = new SpeechSynthesisUtterance(msg.content.replace(/[*_#`>\[\]!]/g, '').slice(0, 3000))
                u.rate = 0.95
                window.speechSynthesis.cancel()
                window.speechSynthesis.speak(u)
                toast.success('Reading aloud...')
              }}
              className="flex items-center gap-1.5 text-on-surface-variant/60 hover:text-emerald-400 transition-colors text-[10px] font-black uppercase tracking-widest"
            >
              <Volume2 className="w-3 h-3" /> Read Aloud
            </button>
            <div className="h-1 w-1 rounded-full bg-surface-container-highest" />
            <button
              onClick={() => {
                window.speechSynthesis.cancel()
                toast.success('Stopped reading')
              }}
              className="flex items-center gap-1.5 text-on-surface-variant/60 hover:text-red-400 transition-colors text-[10px] font-black uppercase tracking-widest"
            >
              <VolumeX className="w-3 h-3" /> Stop
            </button>
          </div>
        )}
      </div>
      {imgLightbox && <Lightbox src={imgLightbox} type="image" onClose={() => setImgLightbox(null)} />}
    </div>
  )
}

// â”€â”€â”€ MAIN CHAT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AIChat() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [sending, setSending] = useState(false)
  const [pendingAction, setPendingAction] = useState<'diagram' | 'image' | null>(null)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [contextType, setContextType] = useState<'global' | 'resource'>('global')
  const [selectedResource, setSelectedResource] = useState<number | null>(null)
  const [activeSession, setActiveSession] = useState<any>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [voiceDictating, setVoiceDictating] = useState(false)
  
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
    // Auto-set resource context when coming from library page
    const resourceParam = searchParams.get('resource')
    if (resourceParam) {
      const rid = parseInt(resourceParam)
      if (!isNaN(rid)) {
        setContextType('resource')
        setSelectedResource(rid)
        setSidebarOpen(true) // open sidebar so user sees the context is set
      }
    }
  }, [searchParams])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cleanup voice recognition on unmount
  useEffect(() => {
    return () => {
      ;(window as any)._voiceDictating = false
      if ((window as any)._voiceRecognition) {
        try { (window as any)._voiceRecognition.stop() } catch {}
        (window as any)._voiceRecognition = null
      }
    }
  }, [])

  const startNew = () => {
    setMessages([])
    setActiveSession(null)
    setInput('')
    setAttachedFile(null)
    setFilePreview(null)
    toast.info('New chat started')
  }

  const loadSession = async (session: any) => {
    setMessages([])
    setAttachedFile(null)
    setFilePreview(null)
    setActiveSession(session)
    setSidebarOpen(false)

    try {
      const res = await aiApi.getSession(session.id)
      const fullSession = res.data
      const mappedMessages = (fullSession.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content || '',
        diagram: m.diagram_code || m.diagram || undefined,
        image: m.image || undefined,
      }))
      setMessages(mappedMessages)
      setActiveSession(fullSession)
    } catch {
      const mappedMessages = (session.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content || '',
        diagram: m.diagram_code || m.diagram || undefined,
        image: m.image || undefined,
      }))
      setMessages(mappedMessages)
    }
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

  const handleRegenerate = async (index: number) => {
    if (sending) return
    const userMsg = messages[index - 1]
    if (!userMsg || userMsg.role !== 'user') return

    // Roll back messages
    const history = messages.slice(0, index - 1)
    setMessages(history)
    
    // Execute again
    await executeQuery(userMsg.content, userMsg.file, history)
  }

  const handleSend = async () => {
    if ((!input.trim() && !attachedFile) || sending) return
    const currentInput = input
    const currentFile = attachedFile
    const currentFilePreview = filePreview

    const userMsg: Message = { role: 'user', content: currentInput, file: currentFile || undefined }
    if (currentFilePreview) userMsg.image = currentFilePreview
    
    setMessages(prev => [...prev, userMsg])
    const history = [...messages]

    setInput('')
    removeFile()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    await executeQuery(currentInput, currentFile, history)
  }

  const executeQuery = async (query: string, file: File | null | undefined, history: Message[]) => {
    setSending(true)
    
    try {
      let activeId = activeSession?.id;

      // Ensure we have a session for files if one doesn't exist
      if (file && !activeId) {
        const sessRes = await aiApi.createSession({ 
          title: query.slice(0, 30) || 'Image Analysis',
          context_type: contextType,
          resource_id: selectedResource 
        });
        activeId = sessRes.data.id;
        setActiveSession(sessRes.data);
        queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
      }

      if (file) {
        // VISION
        const responseRes = await aiApi.sendVisionMessage(activeId || 0, query, file);
        const response = responseRes.data;
        const assistantMsgId = response.id;
        
        const assistantMsg: Message = { 
          role: 'assistant', 
          content: response.reply || response.content || '',
          diagram: response.diagram_code,
          image: response.image
        };
        
        setMessages(prev => [...prev, assistantMsg]);

        // Check for actions in vision mode
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
        // CHAT
        try {
          const wantsDiagram = /diagram|chart|flowchart|mindmap|roadmap|visuali[sz]e|draw|graph/i.test(query)
          const wantsImage = /image|pic|picture|photo|illustrat|draw|labelled|labeled|sketch|show.*me|what.*look like|generate|create|visuali[sz]e|depict/i.test(query)
          if (wantsDiagram) setPendingAction('diagram')
          else if (wantsImage) setPendingAction('image')

          setSending(true)

          const response = await aiApi.askAgent(
            query,
            contextType === 'resource' ? `resource_id:${selectedResource}` : '',
            false,
            undefined,
            history.map(m => ({ role: m.role, content: m.content })),
            false,
            activeSession?.id
          )

          if (response.data && response.data.reply) {
            const diagramCode =
              response.data.diagram ||
              response.data.message?.diagram ||
              response.data.message?.diagram_code ||
              (response.data.action?.tool === 'generate_diagram' ? response.data.execution_result : null) ||
              null

            const imageUrl =
              response.data.message?.image ||
              (response.data.action?.tool === 'generate_image' ? response.data.execution_result : null) ||
              null

            const assistantMsg: Message = {
              id: Date.now(),
              role: 'assistant',
              content: response.data.reply,
              image: imageUrl || undefined,
              diagram: diagramCode || undefined,
            }

            setMessages(prev => [...prev, assistantMsg])

            if (response.data.session_id) {
              if (!activeSession || activeSession.id !== response.data.session_id) {
                setActiveSession({ id: response.data.session_id, title: query.slice(0, 60) || 'New Chat' })
                queryClient.invalidateQueries({ queryKey: ['ai-sessions'] })
              }
            }

            // Background diagram/image generation
            if (wantsDiagram && !diagramCode) {
              setPendingAction('diagram')
              aiApi.generateDiagram(query, 'auto', response.data.message_id || assistantMsg.id).then(res => {
                if (res.data.mermaid) {
                  setMessages(prev => {
                    const updated = [...prev]
                    for (let i = updated.length - 1; i >= 0; i--) {
                      if (updated[i].role === 'assistant') { updated[i] = { ...updated[i], diagram: res.data.mermaid }; break }
                    }
                    return updated
                  })
                }
              }).catch(() => {}).finally(() => setPendingAction(null))
            } else if (wantsImage && !imageUrl) {
              setPendingAction('image')
              aiApi.generateImage(query, response.data.message_id || assistantMsg.id).then(res => {
                if (res.data.url) {
                  setMessages(prev => {
                    const updated = [...prev]
                    for (let i = updated.length - 1; i >= 0; i--) {
                      if (updated[i].role === 'assistant') { updated[i] = { ...updated[i], image: res.data.url }; break }
                    }
                    return updated
                  })
                }
              }).catch(() => {}).finally(() => setPendingAction(null))
            } else {
              setPendingAction(null)
            }
          }
        } catch (err: any) {
          console.error('Agent Error:', err)
          toast.error(err.message || 'Intelligence Signal Interrupted')
        }
      }

      if (!activeSession) queryClient.invalidateQueries({ queryKey: ['ai-sessions'] });
    } catch (err: any) {
      console.error('Failed to execute:', err);
      toast.error(err.message || 'Intelligence Signal Interrupted');
    } finally {
      setSending(false)
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="fixed inset-x-0 top-0 md:bottom-0 md:left-64 mt-14 md:mt-0 flex bg-background overflow-hidden text-on-surface" style={{ bottom: 'max(3.5rem, calc(3.5rem + env(safe-area-inset-bottom)))' }}>
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        'flex-shrink-0 bg-surface-container-low/95 border-r border-outline-variant/25 backdrop-blur-xl flex flex-col transition-all duration-300 ease-out z-50 overflow-hidden',
        'absolute lg:relative h-full top-0 left-0',
        sidebarOpen 
          ? 'w-[280px] md:w-[320px] translate-x-0 opacity-100' 
          : 'w-[280px] md:w-[320px] -translate-x-full lg:translate-x-0 lg:w-0 lg:border-r-0 lg:opacity-0 lg:pointer-events-none'
      )}>
        <div className="p-4 flex items-center gap-3 border-b border-outline-variant/25 flex-shrink-0">
          <button onClick={startNew}
            className="w-full bg-gradient-to-r from-primary-container to-primary-container hover:opacity-90 transition-all font-black text-xs uppercase tracking-wider rounded-xl py-3 flex items-center justify-center gap-2 flex-shrink-0 whitespace-nowrap cursor-pointer">
            <Plus className="w-4 h-4" /> New Chat
          </button>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2.5 rounded-xl border border-outline-variant/40 text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high active:scale-95 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* Context */}
          <div className="px-4 pb-4">
            <p className="text-[10px] font-bold text-on-surface-variant dark:text-on-surface-variant/60 mb-3 px-1 tracking-widest uppercase">Context</p>
            <div className="flex gap-2 p-1 bg-surface-container/30 border border-outline-variant/30 rounded-xl">
              {(['global', 'resource'] as const).map(t => (
                <button key={t} onClick={() => { setContextType(t); startNew() }}
                  className={cn('flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer',
                    contextType === t ? 'bg-primary/15 text-primary border border-primary/20' : 'text-on-surface-variant/60 hover:text-on-surface/80')}
                >
                  {t === 'global' ? 'Global' : 'Document'}
                </button>
              ))}
            </div>
          </div>

          {/* Document Selector (When in Resource Mode) */}
          {contextType === 'resource' && (
            <div className="px-4 pb-4 animate-fade-in-down">
              <p className="text-[10px] font-bold text-on-surface-variant dark:text-on-surface-variant/60 mb-3 px-1 tracking-widest uppercase">Target Document</p>
              {resources.length === 0 ? (
                <div className="p-4 text-center border border-dashed border-outline-variant/40 rounded-2xl bg-surface-container/30">
                   <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">No documents found</p>
                   <p className="text-[9px] text-on-surface-variant mt-1">Upload a PDF to your library first</p>
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
                      className={cn('w-full text-left p-2.5 rounded-xl transition-all flex items-center gap-3 group cursor-pointer border',
                        selectedResource === res.id 
                          ? 'bg-primary/15 text-primary border-primary/20' 
                          : 'bg-transparent hover:bg-surface-container-high text-on-surface-variant/60 border-transparent hover:text-on-surface/80'
                      )}
                    >
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-xs shadow-sm shadow-black/5',
                        selectedResource === res.id ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant/60'
                      )}>
                        {res.resource_type === 'video' ? 'ðŸ“º' : res.resource_type === 'pdf' ? 'ðŸ“„' : 'ðŸ“'}
                      </div>
                      <span className="text-xs font-bold truncate flex-1">{res.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="px-4 pb-4">
            <p className="text-[10px] font-bold text-on-surface-variant dark:text-on-surface-variant/60 mb-3 px-1 tracking-widest uppercase">AI Tools</p>
            <div className="space-y-1.5">
              <button 
                onClick={() => {
                  setInput('Generate a diagram for: ')
                  setSidebarOpen(false)
                  setTimeout(() => textareaRef.current?.focus(), 100)
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-violet-500/10 hover:text-violet-400 transition-all border border-transparent hover:border-violet-500/20 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 border border-violet-500/10"><Network className="w-4 h-4" /></div> Generate Diagram
              </button>
              <button 
                onClick={() => {
                  setInput('Generate an image showing: ')
                  setSidebarOpen(false)
                  setTimeout(() => textareaRef.current?.focus(), 100)
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-pink-500/10 hover:text-pink-400 transition-all border border-transparent hover:border-pink-500/20 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0 border border-pink-500/10"><Wand2 className="w-4 h-4" /></div> Generate Image
              </button>
            </div>
          </div>

          {/* Recent chats */}
          <div className="px-4 pb-6">
            <p className="text-[10px] font-bold text-on-surface-variant dark:text-on-surface-variant/60 mb-3 px-1 tracking-widest uppercase">Recent History</p>
            {sessions.length === 0 ? (
              <p className="text-xs text-on-surface-variant/40 text-center py-6 bg-white/3 border border-outline-variant/25 border-dashed rounded-2xl">No historic chats</p>
            ) : (
              <div className="space-y-1">
                {sessions.slice(0, 20).map((s: any) => (
                  <button key={s.id} onClick={() => loadSession(s)}
                    className={cn('w-full text-left px-3 py-3 rounded-xl transition-all group flex items-start gap-3 relative border cursor-pointer',
                      activeSession?.id === s.id
                        ? 'bg-primary/15 text-primary border-primary/20 shadow-sm shadow-orange-500/5'
                        : 'text-on-surface-variant/60 bg-transparent border-transparent hover:bg-surface-container-high hover:text-on-surface/80')}>
                    <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-50" />
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="font-bold text-sm truncate">{s.title || 'Untitled Session'}</div>
                      <div className="text-on-surface-variant dark:text-on-surface-variant/60 text-[10px] font-bold mt-1 uppercase tracking-wider">{timeAgo(s.updated_at)}</div>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-on-surface-variant hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
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
      <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full bg-background relative">
        
        {/* Dynamic ambient background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[10%] left-1/4 w-[350px] h-[350px] rounded-full blur-[100px] bg-primary-container/5 opacity-30" />
          <div className="absolute bottom-[20%] right-1/4 w-[400px] h-[400px] rounded-full blur-[120px] bg-indigo-500/5 opacity-20" />
        </div>

        {/* Slim toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-outline-variant/15 bg-background/90 backdrop-blur-md shrink-0 z-20">
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg text-on-surface-variant/50 hover:bg-surface-container-high hover:text-on-surface transition-all active:scale-95 cursor-pointer">
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            {activeSession && (
              <span className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider truncate max-w-[120px]">
                {activeSession.title || 'Current Thread'}
              </span>
            )}
            <button onClick={startNew}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-primary/80 hover:text-primary hover:bg-primary/5 transition-all font-bold text-[11px] active:scale-95 cursor-pointer">
              <Plus className="w-3 h-3" />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto w-full scrollbar-hide relative z-10">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center min-h-full px-4 py-6 sm:py-8 text-center max-w-2xl mx-auto">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-primary/10 border border-primary/20 rounded-[1.25rem] sm:rounded-[1.5rem] flex items-center justify-center mb-3 sm:mb-4 shadow-lg shadow-primary/10 animate-pulse">
                <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-on-surface mb-1.5 sm:mb-2 tracking-tight">Hi, I'm Flow AI</h1>
              <p className="text-on-surface-variant/60 text-xs sm:text-sm max-w-sm mb-6 sm:mb-8 leading-relaxed">
                Your brilliant AI study partner. Drop a PDF, paste an image, or just start asking questions below!
              </p>
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => setCameraOpen(true)}
                  className="flex items-center gap-2.5 px-5 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-sm font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Video className="w-4 h-4" />
                  Live Camera Vision
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 w-full max-w-xl">
                {SUGGESTIONS.map((s, i) => (
                  <button key={s.text} onClick={() => { setInput(s.text); textareaRef.current?.focus() }}
                    className={cn('flex items-start gap-2.5 p-3 sm:p-3.5 bg-surface-container/30 border border-outline-variant/30 rounded-xl sm:rounded-2xl text-left transition-all hover:border-primary/20 hover:bg-surface-container/40 hover:shadow-lg hover:shadow-orange-500/5 group cursor-pointer',
                      i === SUGGESTIONS.length - 1 && 'sm:col-span-2 lg:col-span-1'
                    )}>
                    <div className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 bg-surface-container-high rounded-xl sm:rounded-[1rem] flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-primary text-[16px] sm:text-[18px]">{s.icon}</span>
                    </div>
                    <span className="text-xs font-bold text-on-surface-variant group-hover:text-primary transition-colors leading-relaxed">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl px-3 sm:px-4 pt-8 pb-24 sm:pb-28 space-y-12 sm:space-y-20 animate-fade-in">
              {messages.map((msg, i) => (
                <MessageBubble 
                  key={i} 
                  msg={msg} 
                  index={i} 
                  isLast={i === messages.length - 1} 
                  onRegenerate={handleRegenerate}
                />
              ))}
              {sending && <ThinkingIndicator action={pendingAction} />}
              <div ref={bottomRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="px-3 sm:px-4 pt-3 pb-2 bg-background border-t border-outline-variant/15 flex-shrink-0 relative z-20"
          style={{ paddingBottom: 'max(0.5rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
        >
          <div className="max-w-3xl mx-auto">
            
            {/* Attached file preview */}
            {attachedFile && (
              <div className="flex items-center gap-3 mb-2 p-2.5 bg-surface-container/30 border border-outline-variant/25 rounded-xl animate-fade-in-up w-fit pr-10 relative">
                {filePreview ? (
                  <img src={filePreview} alt="preview" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Paperclip className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold text-on-surface max-w-[120px] sm:max-w-xs truncate">{attachedFile.name}</div>
                  <div className="text-[10px] text-on-surface-variant">{(attachedFile.size / 1024).toFixed(0)} KB</div>
                </div>
                <button onClick={removeFile} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-container-high rounded-full text-on-surface-variant/40 hover:text-on-surface transition-colors cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Input Wrapper */}
            <div className="relative bg-surface-container/40 border border-outline-variant/30 rounded-2xl p-1.5 focus-within:border-primary/30 transition-all duration-200">
              <div className="flex items-end gap-1.5">
                
                {/* Upload button */}
                <button onClick={() => fileRef.current?.click()}
                  className="p-2 text-on-surface-variant/40 hover:text-primary transition-colors rounded-xl shrink-0 mb-0.5 cursor-pointer" title="Upload">
                  <Plus className="w-4 h-4" />
                </button>
                <input type="file" ref={fileRef} onChange={handleFile} className="hidden" accept="image/*,.pdf,.txt,.doc,.docx" />

                {/* Voice Dictation Button */}
                <button
                  onClick={async () => {
                    if (voiceDictating) {
                      setVoiceDictating(false)
                      if ((window as any)._voiceRecognition) {
                        try { (window as any)._voiceRecognition.stop() } catch {}
                        (window as any)._voiceRecognition = null
                      }
                      toast.info('Dictation stopped')
                      return
                    }
                    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
                    if (!SpeechRecognition) {
                      toast.error('Speech recognition not supported in this browser')
                      return
                    }
                    // Request mic permission explicitly first
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                      stream.getTracks().forEach(t => t.stop())
                    } catch {
                      toast.error('Microphone permission denied. Please allow mic access in your browser settings.')
                      return
                    }
                    const recognition = new SpeechRecognition()
                    recognition.continuous = true
                    recognition.interimResults = true
                    recognition.lang = 'en-US'
                    recognition.maxAlternatives = 1
                    let finalTranscript = input || ''
                    recognition.onresult = (event: any) => {
                      let interimTranscript = ''
                      for (let i = event.resultIndex; i < event.results.length; i++) {
                        if (event.results[i].isFinal) {
                          finalTranscript += event.results[i][0].transcript + ' '
                          setInput(finalTranscript.trim())
                        } else {
                          interimTranscript += event.results[i][0].transcript
                        }
                      }
                      if (interimTranscript) setInput((finalTranscript + interimTranscript).trim())
                    }
                    recognition.onerror = (e: any) => {
                      if (e.error === 'no-speech' || e.error === 'aborted') return
                      if (e.error === 'not-allowed') {
                        toast.error('Microphone permission denied')
                      } else {
                        toast.error(`Voice error: ${e.error}`)
                      }
                      setVoiceDictating(false)
                    }
                    recognition.onend = () => {
                      // Auto-restart if still in dictation mode (mobile browsers kill it frequently)
                      if ((window as any)._voiceDictating && (window as any)._voiceRecognition) {
                        try {
                          setTimeout(() => {
                            if ((window as any)._voiceDictating) {
                              (window as any)._voiceRecognition.start()
                            }
                          }, 300)
                        } catch {
                          setVoiceDictating(false)
                        }
                      } else {
                        setVoiceDictating(false)
                      }
                    }
                    ;(window as any)._voiceRecognition = recognition
                    ;(window as any)._voiceDictating = true
                    try {
                      recognition.start()
                      setVoiceDictating(true)
                      toast.info('Listening... speak now')
                    } catch {
                      toast.error('Could not start speech recognition')
                      setVoiceDictating(false)
                      ;(window as any)._voiceDictating = false
                    }
                  }}
                  className={cn('p-2 transition-colors rounded-xl shrink-0 mb-0.5 cursor-pointer',
                    voiceDictating ? 'text-red-400 animate-pulse' : 'text-on-surface-variant/40 hover:text-primary'
                  )} title="Voice Dictation">
                  {voiceDictating ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {/* Camera Vision Button */}
                <button
                  onClick={() => setCameraOpen(true)}
                  className="p-2 text-on-surface-variant/40 hover:text-emerald-400 transition-colors rounded-xl shrink-0 mb-0.5 cursor-pointer" title="Live Camera Vision">
                  <Video className="w-4 h-4" />
                </button>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder={voiceDictating ? 'Listening...' : 'Ask Flow AI anything...'}
                  className="flex-1 bg-transparent border-0 outline-none resize-none text-[15px] text-on-surface placeholder-on-surface-variant/40 py-2 px-1 min-h-[36px] max-h-[120px]"
                  style={{ lineHeight: '1.5' }}
                  rows={1}
                />

                {/* Send Button */}
                <button onClick={handleSend}
                  disabled={sending || (!input.trim() && !attachedFile)}
                  className={cn('p-2 rounded-xl flex-shrink-0 transition-all duration-200 mb-0.5 cursor-pointer',
                    (input.trim() || attachedFile) && !sending
                      ? 'bg-primary-container text-on-surface hover:brightness-110'
                      : 'text-on-surface-variant/25 cursor-not-allowed')}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Vision Modal */}
      {cameraOpen && <CameraVisionModal onClose={() => setCameraOpen(false)} />}
    </div>
  )
}

export default function AIPage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary-container" /></div>}>
      <AIChat />
    </Suspense>
  )
}

