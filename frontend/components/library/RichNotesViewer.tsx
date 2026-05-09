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
import { X, BookOpen, ChevronRight } from 'lucide-react'

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

  const handleImageClick = (src: string) => {
    setZoomedImage(src)
  }

  const cleanTitle = (title: string) => {
    if (!title) return ''
    // Strip markdown bold/italic markers from titles
    return title.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/, '').trim()
  }

  const cleanContent = (text: string) => {
    if (!text) return ''
    return text.replace(/ACTION:\s*\{.*?\}/gi, '').trim()
  }

  const toggleSection = (idx: number) => {
    setExpandedSections(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  // Color palette for section accents
  const sectionColors = [
    { bg: 'from-blue-500 to-indigo-600', light: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', border: 'border-blue-500/20', dot: 'bg-blue-500' },
    { bg: 'from-violet-500 to-purple-600', light: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', border: 'border-violet-500/20', dot: 'bg-violet-500' },
    { bg: 'from-emerald-500 to-teal-600', light: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-500' },
    { bg: 'from-orange-500 to-amber-600', light: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', border: 'border-orange-500/20', dot: 'bg-orange-500' },
    { bg: 'from-pink-500 to-rose-600', light: 'bg-pink-500/10 text-pink-600 dark:text-pink-400', border: 'border-pink-500/20', dot: 'bg-pink-500' },
    { bg: 'from-cyan-500 to-sky-600', light: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400', border: 'border-cyan-500/20', dot: 'bg-cyan-500' },
    { bg: 'from-fuchsia-500 to-pink-600', light: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400', border: 'border-fuchsia-500/20', dot: 'bg-fuchsia-500' },
    { bg: 'from-lime-500 to-green-600', light: 'bg-lime-500/10 text-lime-600 dark:text-lime-400', border: 'border-lime-500/20', dot: 'bg-lime-500' },
  ]

  return (
    <div className={cn(
      "relative pb-24 max-w-3xl mx-auto px-4 sm:px-6 pt-5 pb-8",
    )}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-px w-6 bg-orange-500/40" />
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-500/60">
            {isMathMode ? "Logical Derivation" : "Study Kit"}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-4 leading-tight">
          {notes.overview?.title || 'Study Material'}
        </h1>
        {notes.overview?.summary && (
          <div className="p-4 rounded-2xl bg-white/3 border-l-2 border-orange-500/40">
            <p className="text-sm text-slate-400 leading-relaxed">
              {cleanTitle(notes.overview.summary).split('.').slice(0, 3).join('.').trim() + '.'}
            </p>
          </div>
        )}
      </div>

      {/* Table of Contents */}
      {notes.sections?.length > 4 && (
        <div className="mb-8 p-4 rounded-2xl bg-white/3">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Contents</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {notes.sections.map((section: any, idx: number) => {
              const color = sectionColors[idx % sectionColors.length]
              return (
                <button
                  key={idx}
                  onClick={() => document.getElementById(`section-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 transition-all text-left group"
                >
                  <div className={cn("w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black text-white bg-gradient-to-br shrink-0", color.bg)}>
                    {idx + 1}
                  </div>
                  <span className="text-xs font-medium text-slate-500 group-hover:text-slate-300 transition-colors truncate">
                    {cleanTitle(section.title)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {notes.sections?.map((section: any, idx: number) => {
          const color = sectionColors[idx % sectionColors.length]
          const isExpanded = expandedSections[idx] !== false

          return (
            <div
              key={idx}
              id={`section-${idx}`}
              className="rounded-2xl bg-[#1a1a1a] overflow-hidden scroll-mt-4"
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection(idx)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/3 transition-colors"
              >
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm text-white shrink-0 bg-gradient-to-br",
                  color.bg
                )}>
                  {section.icon || (idx + 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-black text-white leading-tight truncate">
                    {cleanTitle(section.title)}
                  </h2>
                </div>
                <ChevronRight className={cn(
                  "w-4 h-4 text-slate-600 shrink-0 transition-transform duration-200",
                  isExpanded ? "rotate-90" : "rotate-0"
                )} />
              </button>

              {/* Section Content */}
              {isExpanded && (
                <div className="px-4 pb-5 border-t border-white/5">
                  <div className="pt-4 prose-ai">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        table: ({ children }) => (
                          <div className="w-full overflow-x-auto my-4 rounded-xl border border-white/8">
                            <table className="min-w-full border-collapse">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-white/5">{children}</thead>,
                        th: ({ children }) => (
                          <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-white/8">{children}</th>
                        ),
                        td: ({ children }) => (
                          <td className="px-3 py-2.5 text-xs text-slate-400 border-b border-white/5 font-medium">{children}</td>
                        ),
                        h1: ({ children }) => <h1 className="text-xl font-black mb-4 text-white">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-lg font-black mb-3 text-white">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-base font-black mb-2 text-white">{children}</h3>,
                        h4: ({ children }) => <h4 className="text-sm font-bold mb-2 text-slate-200">{children}</h4>,
                        p: ({ children }) => (
                          <p className="mb-4 leading-relaxed text-slate-400 text-sm last:mb-0">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-black text-white">{children}</strong>
                        ),
                        em: ({ children }) => (
                          <em className="text-orange-400 not-italic font-bold">{children}</em>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="my-4 pl-4 border-l-2 border-orange-500/40 bg-white/3 rounded-r-xl py-3 pr-4">
                            <div className="text-slate-400 text-sm leading-relaxed">{children}</div>
                          </blockquote>
                        ),
                        ul: ({ children }) => <ul className="list-none pl-0 mb-4 space-y-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-none pl-0 mb-4 space-y-2">{children}</ol>,
                        li: ({ children }) => (
                          <li className="flex gap-2.5 text-slate-400 text-sm leading-relaxed">
                            <div className={cn("mt-2 w-1.5 h-1.5 rounded-full shrink-0", color.dot)} />
                            <span className="flex-1">{children}</span>
                          </li>
                        ),
                        a: ({ children, href }) => (
                          <a href={href} className="text-orange-400 hover:text-orange-300 underline underline-offset-2 transition-colors" target="_blank" rel="noopener noreferrer">
                            {children}
                          </a>
                        ),
                        hr: () => <div className="my-4 h-px bg-white/5" />,
                        img: ({ src, alt }: any) => {
                          // Skip text placeholders like "Illustration on page 1"
                          if (!src || src.startsWith('Illustration') || src.startsWith('illustration') || !src.includes('/')) {
                            return alt ? (
                              <div className="my-3 px-3 py-2 bg-white/3 border border-white/5 rounded-xl flex items-center gap-2">
                                <span className="text-lg">🖼️</span>
                                <p className="text-xs text-slate-500 italic">{cleanContent(alt || src)}</p>
                              </div>
                            ) : null
                          }
                          const fullUrl = src?.startsWith('http') ? src : `${API_BASE?.replace(/\/api\/?$/, '')}${src}`
                          return (
                            <div className="my-4 rounded-xl overflow-hidden cursor-pointer" onClick={() => handleImageClick(fullUrl)}>
                              <img src={fullUrl} alt={alt} className="w-full h-auto rounded-xl" />
                              {alt && <p className="text-[11px] text-slate-600 mt-2 italic">{cleanContent(alt)}</p>}
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
                              <div className="my-4 py-4 px-4 bg-[#111] rounded-xl overflow-x-auto text-white">
                                <div dangerouslySetInnerHTML={{ __html: katex.renderToString(cleanedCode.replace(/\\\\/g, '\\'), { displayMode: true, throwOnError: false, trust: true }) }} />
                              </div>
                            )
                          }
                          if (inline) {
                            return <code className="px-1.5 py-0.5 rounded bg-white/8 font-mono text-xs text-orange-400" {...props}>{children}</code>
                          }
                          return <code className="px-1.5 py-0.5 rounded bg-white/8 font-mono text-xs text-orange-400" {...props}>{children}</code>
                        },
                      }}
                    >
                      {cleanContent(section.content)}
                    </ReactMarkdown>

                    {/* PDF Extracted Diagrams */}
                    {section.images?.length > 0 && (
                      <div className="mt-4 space-y-4">
                        {section.images.map((img: any, i: number) => {
                          const mediaBase = API_BASE?.replace(/\/api\/?$/, '')?.replace(/\/$/, '')
                          const fullUrl = img.url?.startsWith('http') ? img.url : `${mediaBase}${img.url}`
                          return (
                            <div key={i} className="rounded-xl overflow-hidden cursor-pointer" onClick={() => handleImageClick(fullUrl)}>
                              <img src={fullUrl} alt={img.caption} className="w-full h-auto rounded-xl" />
                              {img.caption && <p className="text-[11px] text-slate-600 mt-1.5 italic">{cleanContent(img.caption)}</p>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Image Zoom Lightbox */}
      {zoomedImage && (
        <div className="image-zoom-overlay" onClick={() => setZoomedImage(null)}>
          <button className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all" onClick={() => setZoomedImage(null)}>
            <X className="w-6 h-6" />
          </button>
          <img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-full rounded-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
