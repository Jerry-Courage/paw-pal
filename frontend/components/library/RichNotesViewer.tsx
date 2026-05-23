'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils'
import DigitalBlackboard from './DigitalBlackboard'
import { API_BASE } from '@/lib/api'
import { X, BookOpen, ChevronDown, Maximize2 } from 'lucide-react'

interface RichNotesViewerProps {
  notes: any
  isEditing: boolean
  setIsEditing: (v: boolean) => void
  isMathMode?: boolean
  onSave: (notes: any) => void
  onOpenMath?: (prob: string) => void
}

export default function RichNotesViewer({ 
  notes, 
  isEditing, 
  setIsEditing, 
  isMathMode,
  onSave,
  onOpenMath
}: RichNotesViewerProps) {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({})

  if (!notes) return null

  const handleImageClick = (src: string) => setZoomedImage(src)

  const cleanTitle = (title: string) => {
    if (!title) return ''
    return title.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/, '').trim()
  }

  const cleanContent = (text: string) => {
    if (!text) return ''
    return text
      .replace(/ACTION:\s*\{.*?\}/gi, '')
      .replace(/\\n\\n/g, '\n\n')
      .replace(/\\n/g, '\n')
      .replace(/\*\*(Key Question:|Memory Trick:|Quick Summary:|Deep Dive:)\*\*/g, '\n\n**$1**')
      .trim()
  }

  const toggleSection = (idx: number) => {
    setExpandedSections(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  // Accent colors per section
  const sectionColors = [
    { grad: 'from-blue-500 to-indigo-600',    dot: 'bg-blue-500',    text: 'text-blue-400',    label: 'bg-blue-500/10 text-blue-400',    border: 'border-blue-500/30'    },
    { grad: 'from-violet-500 to-purple-600',  dot: 'bg-violet-500',  text: 'text-violet-400',  label: 'bg-violet-500/10 text-violet-400',  border: 'border-violet-500/30'  },
    { grad: 'from-emerald-500 to-teal-600',   dot: 'bg-emerald-500', text: 'text-emerald-400', label: 'bg-emerald-500/10 text-emerald-400', border: 'border-emerald-500/30' },
    { grad: 'from-orange-500 to-amber-500',   dot: 'bg-orange-500',  text: 'text-orange-400',  label: 'bg-orange-500/10 text-orange-400',  border: 'border-orange-500/30'  },
    { grad: 'from-pink-500 to-rose-600',      dot: 'bg-pink-500',    text: 'text-pink-400',    label: 'bg-pink-500/10 text-pink-400',    border: 'border-pink-500/30'    },
    { grad: 'from-cyan-500 to-sky-600',       dot: 'bg-cyan-500',    text: 'text-cyan-400',    label: 'bg-cyan-500/10 text-cyan-400',    border: 'border-cyan-500/30'    },
    { grad: 'from-fuchsia-500 to-pink-600',   dot: 'bg-fuchsia-500', text: 'text-fuchsia-400', label: 'bg-fuchsia-500/10 text-fuchsia-400', border: 'border-fuchsia-500/30' },
    { grad: 'from-lime-500 to-green-600',     dot: 'bg-lime-500',    text: 'text-lime-400',    label: 'bg-lime-500/10 text-lime-400',    border: 'border-lime-500/30'    },
  ]

  return (
    <div className="relative max-w-4xl mx-auto px-4 sm:px-8 pt-8 pb-32">

      {/* ── Document Header ─────────────────────────────────── */}
      <div className="mb-12">
        <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.35em] text-orange-500/70 mb-4">
          <span className="w-4 h-px bg-orange-500/50" />
          {isMathMode ? 'Logical Derivation' : 'Study Notes'}
        </span>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-[1.15] mb-6">
          {notes.overview?.title || 'Study Material'}
        </h1>

        {notes.overview?.summary && (
          <div className="relative pl-5 border-l-2 border-orange-500/50">
            <p className="text-base sm:text-lg text-slate-300 leading-[1.9] font-normal">
              {cleanTitle(notes.overview.summary).split('.').slice(0, 3).join('.').trim() + '.'}
            </p>
          </div>
        )}
      </div>

      {/* ── Table of Contents ───────────────────────────────── */}
      {notes.sections?.length > 3 && (
        <div className="mb-12 p-6 rounded-2xl bg-[#141414] border border-white/[0.06]">
          <div className="flex items-center gap-2.5 mb-5">
            <BookOpen className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">Table of Contents</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {notes.sections.map((section: any, idx: number) => {
              const color = sectionColors[idx % sectionColors.length]
              return (
                <button
                  key={idx}
                  onClick={() => document.getElementById(`section-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left group"
                >
                  <div className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black text-white bg-gradient-to-br shrink-0",
                    color.grad
                  )}>
                    {idx + 1}
                  </div>
                  <span className="text-sm font-medium text-slate-500 group-hover:text-slate-200 transition-colors truncate leading-snug">
                    {cleanTitle(section.title)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Sections ────────────────────────────────────────── */}
      <div className="space-y-5">
        {notes.sections?.map((section: any, idx: number) => {
          const color = sectionColors[idx % sectionColors.length]
          const isExpanded = expandedSections[idx] !== false

          const markdownComponents = {
            table: ({ children }: any) => (
              <div className="w-full overflow-x-auto my-8 rounded-2xl border border-white/10 shadow-xl">
                <table className="min-w-full border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }: any) => <thead className="bg-white/[0.04]">{children}</thead>,
            th: ({ children }: any) => (
              <th className="px-5 py-3.5 text-left text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 border-b border-white/10">{children}</th>
            ),
            td: ({ children }: any) => (
              <td className="px-5 py-4 text-sm text-slate-300 border-b border-white/5 leading-relaxed">{children}</td>
            ),
            tr: ({ children }: any) => (
              <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>
            ),
            h1: ({ children }: any) => (
              <h1 className="text-2xl font-black mb-5 text-white tracking-tight mt-8 leading-tight first:mt-0">{children}</h1>
            ),
            h2: ({ children }: any) => (
              <h2 className="text-xl font-black mb-4 text-white tracking-tight mt-7 leading-tight first:mt-0">{children}</h2>
            ),
            h3: ({ children }: any) => (
              <h3 className="text-lg font-bold mb-3 text-white mt-6 leading-snug first:mt-0">{children}</h3>
            ),
            h4: ({ children }: any) => (
              <h4 className={cn("text-xs font-black mb-3 uppercase tracking-[0.2em] mt-5 first:mt-0", color.text)}>{children}</h4>
            ),
            p: ({ children }: any) => (
              <p className="mb-5 leading-[1.9] text-slate-300 text-base last:mb-0">{children}</p>
            ),
            strong: ({ children }: any) => {
              const text = String(children || '')
              const isLabel = ['Key Question:', 'Deep Dive:', 'Memory Trick:', 'Quick Summary:'].some(l => text.trim().startsWith(l))
              if (isLabel) {
                return (
                  <strong className={cn("block text-[11px] font-black uppercase tracking-[0.2em] mb-2 mt-6 first:mt-0", color.text)}>
                    {text}
                  </strong>
                )
              }
              return <strong className="font-bold text-white">{children}</strong>
            },
            em: ({ children }: any) => (
              <em className="text-orange-300 not-italic font-medium">{children}</em>
            ),
            blockquote: ({ children }: any) => (
              <blockquote className="my-7 pl-6 border-l-[3px] border-orange-500/60 py-1">
                <div className="text-slate-300 text-base italic leading-[1.9]">{children}</div>
              </blockquote>
            ),
            ul: ({ children }: any) => <ul className="list-none pl-0 mb-6 space-y-3">{children}</ul>,
            ol: ({ children }: any) => <ol className="list-none pl-0 mb-6 space-y-3 counter-reset-item">{children}</ol>,
            li: ({ children }: any) => (
              <li className="flex gap-3.5 text-slate-300 text-base leading-[1.8]">
                <div className={cn("mt-[0.6em] w-1.5 h-1.5 rounded-full shrink-0", color.dot)} />
                <span className="flex-1">{children}</span>
              </li>
            ),
            a: ({ children, href }: any) => (
              <a href={href} className="text-orange-400 hover:text-orange-300 underline underline-offset-4 transition-colors font-medium" target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            hr: () => <div className="my-8 h-px bg-white/[0.06]" />,
            img: ({ src, alt }: any) => {
              if (!src || src.startsWith('Illustration') || !src.includes('/')) {
                return alt ? (
                  <div className="my-5 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl flex items-center gap-2">
                    <span className="text-lg">🖼️</span>
                    <p className="text-sm text-slate-500 italic">{cleanContent(alt || src)}</p>
                  </div>
                ) : null
              }
              const fullUrl = src?.startsWith('http') ? src : `${API_BASE?.replace(/\/api\/?$/, '')}${src}`
              return (
                <div
                  className="group relative my-7 rounded-2xl overflow-hidden bg-white/[0.02] border border-white/[0.06] hover:border-white/15 transition-all duration-300 cursor-pointer"
                  onClick={() => handleImageClick(fullUrl)}
                >
                  <img src={fullUrl} alt={alt} className="w-full h-auto" />
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="p-1.5 bg-black/60 rounded-lg backdrop-blur-sm">
                      <Maximize2 className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>
                  {alt && (
                    <p className="text-xs text-slate-500 px-4 py-2.5 border-t border-white/5 italic text-center">
                      {cleanContent(alt)}
                    </p>
                  )}
                </div>
              )
            },
            code: ({ node, inline, className, children, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || '')
              const content = Array.isArray(children) ? children.join('') : String(children || '')
              const cleanedCode = content.replace(/\n$/, '')
              const isMathBlock = match?.[1] === 'math' || (!inline && (cleanedCode.includes('\\') || cleanedCode.includes('_') || cleanedCode.includes('^')))

              if (isMathBlock) {
                return (
                  <div className="my-7 py-6 px-6 bg-black/50 rounded-2xl border border-white/[0.06] overflow-x-auto text-white">
                    <div dangerouslySetInnerHTML={{ __html: katex.renderToString(cleanedCode.replace(/\\\\/g, '\\'), { displayMode: true, throwOnError: false, trust: true }) }} />
                  </div>
                )
              }
              if (inline) {
                return <code className="px-1.5 py-0.5 rounded-md bg-white/[0.06] font-mono text-sm text-orange-300" {...props}>{children}</code>
              }
              return (
                <div className="my-6 rounded-2xl bg-black/50 border border-white/[0.06] overflow-x-auto">
                  <pre className="p-5">
                    <code className="font-mono text-sm text-slate-300 leading-relaxed" {...props}>{children}</code>
                  </pre>
                </div>
              )
            },
          }

          return (
            <div
              key={idx}
              id={`section-${idx}`}
              className="rounded-2xl border border-white/[0.06] bg-[#111] overflow-hidden scroll-mt-6 transition-all duration-200 hover:border-white/10"
            >
              {/* Section Header — always visible */}
              <button
                onClick={() => toggleSection(idx)}
                className="w-full flex items-center gap-4 px-6 py-5 text-left group"
              >
                {/* Numbered badge */}
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white shrink-0 bg-gradient-to-br",
                  color.grad
                )}>
                  {section.icon || (idx + 1)}
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-white leading-snug">
                    {cleanTitle(section.title)}
                  </h2>
                  {/* Teaser — first ~80 chars of content when collapsed */}
                  {!isExpanded && section.content && (
                    <p className="text-sm text-slate-500 mt-0.5 truncate leading-relaxed">
                      {cleanContent(section.content).replace(/\*\*/g, '').replace(/#+\s/g, '').substring(0, 90)}…
                    </p>
                  )}
                </div>

                <ChevronDown className={cn(
                  "w-4 h-4 text-slate-600 shrink-0 transition-transform duration-300",
                  isExpanded ? "rotate-180" : "rotate-0"
                )} />
              </button>

              {/* Section Body */}
              {isExpanded && (
                <div className="border-t border-white/[0.05]">
                  {section.images?.length > 0 ? (
                    /* Two-column layout when images exist */
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_300px] gap-0">
                      {/* Text column */}
                      <div className="px-6 py-7 sm:px-8 sm:py-8 min-w-0">
                        <ReactMarkdown
                          remarkPlugins={[remarkMath, remarkGfm]}
                          rehypePlugins={[rehypeKatex]}
                          components={markdownComponents}
                        >
                          {cleanContent(section.content)}
                        </ReactMarkdown>
                      </div>

                      {/* Image sidebar */}
                      <div className="lg:border-l border-white/[0.05] px-5 py-7 space-y-5 bg-white/[0.01]">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={cn("w-1.5 h-1.5 rounded-full", color.dot)} />
                          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
                            Visual References
                          </span>
                        </div>
                        {section.images.map((img: any, i: number) => {
                          const mediaBase = API_BASE?.replace(/\/api\/?$/, '')?.replace(/\/$/, '')
                          const fullUrl = !img.url ? '' :
                            (img.url.startsWith('data:') || img.url.startsWith('blob:') || img.url.startsWith('http'))
                              ? img.url
                              : `${mediaBase}${img.url.startsWith('/') ? '' : '/'}${img.url}`
                          return (
                            <div
                              key={i}
                              className="group relative rounded-xl overflow-hidden border border-white/[0.06] hover:border-white/15 transition-all cursor-pointer bg-black/20"
                              onClick={() => handleImageClick(fullUrl)}
                            >
                              <img
                                src={fullUrl}
                                alt={img.caption}
                                className="w-full h-auto object-cover"
                              />
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="p-1 bg-black/60 rounded-md backdrop-blur-sm">
                                  <Maximize2 className="w-3 h-3 text-white" />
                                </div>
                              </div>
                              {img.caption && (
                                <p className="text-[11px] text-slate-500 px-3 py-2 border-t border-white/5 italic leading-snug">
                                  {cleanContent(img.caption)}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    /* Full-width when no images */
                    <div className="px-6 py-7 sm:px-8 sm:py-8">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                        components={markdownComponents}
                      >
                        {cleanContent(section.content)}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Image Lightbox ──────────────────────────────────── */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
          onClick={() => setZoomedImage(null)}
        >
          <button
            className="absolute top-5 right-5 p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
            onClick={() => setZoomedImage(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={zoomedImage}
            alt="Zoomed"
            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
