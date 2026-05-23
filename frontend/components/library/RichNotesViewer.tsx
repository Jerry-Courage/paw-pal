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
    return text
      .replace(/ACTION:\s*\{.*?\}/gi, '')
      // Unescape literal \n\n that AI returns as escaped strings
      .replace(/\\n\\n/g, '\n\n')
      .replace(/\\n/g, '\n')
      // Fix **Key Question:** and similar bold markers that appear inline
      .replace(/\*\*(Key Question:|Memory Trick:|Quick Summary:|Deep Dive:)\*\*/g, '\n\n**$1**')
      .trim()
  }

  const toggleSection = (idx: number) => {
    setExpandedSections(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  // Color palette for section accents
  const sectionColors = [
    { bg: 'from-blue-500 to-indigo-600', light: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', border: 'border-blue-500/20', dot: 'bg-blue-500', text: 'text-blue-400' },
    { bg: 'from-violet-500 to-purple-600', light: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', border: 'border-violet-500/20', dot: 'bg-violet-500', text: 'text-violet-400' },
    { bg: 'from-emerald-500 to-teal-600', light: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-500', text: 'text-emerald-400' },
    { bg: 'from-orange-500 to-amber-600', light: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', border: 'border-orange-500/20', dot: 'bg-orange-500', text: 'text-orange-400' },
    { bg: 'from-pink-500 to-rose-600', light: 'bg-pink-500/10 text-pink-600 dark:text-pink-400', border: 'border-pink-500/20', dot: 'bg-pink-500', text: 'text-rose-400' },
    { bg: 'from-cyan-500 to-sky-600', light: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400', border: 'border-cyan-500/20', dot: 'bg-cyan-500', text: 'text-cyan-400' },
    { bg: 'from-fuchsia-500 to-pink-600', light: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400', border: 'border-fuchsia-500/20', dot: 'bg-fuchsia-500', text: 'text-fuchsia-400' },
    { bg: 'from-lime-500 to-green-600', light: 'bg-lime-500/10 text-lime-600 dark:text-lime-400', border: 'border-lime-500/20', dot: 'bg-lime-500', text: 'text-lime-400' },
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
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 border-l-4 border-orange-500 shadow-md">
            <p className="text-sm text-slate-300 leading-[1.8] font-medium">
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

          // Custom Markdown components mapped to active section color theme
          const markdownComponents = {
            table: ({ children }: any) => (
              <div className="w-full overflow-x-auto my-6 rounded-2xl border border-white/10 bg-white/[0.01] backdrop-blur-sm shadow-xl">
                <table className="min-w-full border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }: any) => <thead className="bg-white/[0.03]">{children}</thead>,
            th: ({ children }: any) => (
              <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 border-b border-white/10">{children}</th>
            ),
            td: ({ children }: any) => (
              <td className="px-4 py-3.5 text-xs text-slate-300 border-b border-white/5 font-medium leading-normal">{children}</td>
            ),
            tr: ({ children }: any) => (
              <tr className="hover:bg-white/[0.01] transition-colors">{children}</tr>
            ),
            h1: ({ children }: any) => <h1 className="text-2xl font-black mb-5 text-white tracking-tight mt-6 leading-tight">{children}</h1>,
            h2: ({ children }: any) => <h2 className="text-xl font-black mb-4 text-white tracking-tight mt-5 leading-tight">{children}</h2>,
            h3: ({ children }: any) => <h3 className="text-lg font-black mb-3 text-white tracking-tight mt-4 leading-tight">{children}</h3>,
            h4: ({ children }: any) => <h4 className="text-sm font-black mb-2 text-slate-200 uppercase tracking-wider">{children}</h4>,
            p: ({ children }: any) => (
              <p className="mb-5 leading-[1.8] text-slate-300 text-[14px] font-medium last:mb-0">{children}</p>
            ),
            strong: ({ children }: any) => {
              const text = String(children || '')
              const isHeaderLabel = ['Key Question:', 'Deep Dive:', 'Memory Trick:', 'Quick Summary:'].some(label => text.trim().startsWith(label))
              if (isHeaderLabel) {
                return (
                  <strong className={cn("block text-xs font-black uppercase tracking-wider mb-2", color.text)}>
                    {text}
                  </strong>
                )
              }
              return (
                <strong className={cn("font-black text-white px-0.5 rounded", color.text)}>{children}</strong>
              )
            },
            em: ({ children }: any) => (
              <em className="text-orange-400 not-italic font-bold bg-orange-500/5 px-1 py-0.5 rounded">{children}</em>
            ),
            blockquote: ({ children }: any) => (
              <blockquote className="my-6 pl-5 border-l-4 border-orange-500 bg-orange-500/[0.03] rounded-r-2xl py-4 pr-5 shadow-inner">
                <div className="text-slate-300 text-[14px] italic font-medium leading-[1.8]">{children}</div>
              </blockquote>
            ),
            ul: ({ children }: any) => <ul className="list-none pl-0 mb-5 space-y-4">{children}</ul>,
            ol: ({ children }: any) => <ol className="list-none pl-0 mb-5 space-y-4">{children}</ol>,
            li: ({ children }: any) => (
              <li className="flex gap-3 text-slate-300 text-[14px] leading-[1.8] font-medium">
                <div className={cn("mt-2.5 w-1.5 h-1.5 rounded-full shrink-0 shadow-sm", color.dot)} />
                <span className="flex-1">{children}</span>
              </li>
            ),
            a: ({ children, href }: any) => (
              <a href={href} className="text-orange-400 hover:text-orange-300 underline underline-offset-4 transition-colors font-bold" target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            hr: () => <div className="my-6 h-px bg-white/5" />,
            img: ({ src, alt }: any) => {
              if (!src || src.startsWith('Illustration') || src.startsWith('illustration') || !src.includes('/')) {
                return alt ? (
                  <div className="my-4 px-4 py-3 bg-white/3 border border-white/5 rounded-2xl flex items-center gap-2">
                    <span className="text-lg">🖼️</span>
                    <p className="text-xs text-slate-500 italic font-medium">{cleanContent(alt || src)}</p>
                  </div>
                ) : null
              }
              const fullUrl = src?.startsWith('http') ? src : `${API_BASE?.replace(/\/api\/?$/, '')}${src}`
              return (
                <div 
                  className="group relative my-6 rounded-2xl overflow-hidden bg-white/[0.02] border border-white/5 p-2 hover:border-orange-500/30 transition-all duration-300 shadow-xl cursor-pointer" 
                  onClick={() => handleImageClick(fullUrl)}
                >
                  <img src={fullUrl} alt={alt} className="w-full h-auto rounded-xl group-hover:scale-[1.01] transition-transform duration-500" />
                  {alt && (
                    <p className="text-[11px] text-slate-400 mt-2 px-1 font-medium leading-relaxed italic text-center">
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
                  <div className="my-6 py-5 px-5 bg-black/60 rounded-2xl border border-white/5 overflow-x-auto text-white shadow-inner">
                    <div dangerouslySetInnerHTML={{ __html: katex.renderToString(cleanedCode.replace(/\\\\/g, '\\'), { displayMode: true, throwOnError: false, trust: true }) }} />
                  </div>
                )
              }
              if (inline) {
                return <code className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 font-mono text-[13px] text-orange-400 font-semibold" {...props}>{children}</code>
              }
              return <code className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 font-mono text-[13px] text-orange-400 font-semibold" {...props}>{children}</code>
            },
          }

          return (
            <div
              key={idx}
              id={`section-${idx}`}
              className="rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-md hover:border-white/10 transition-all duration-300 overflow-hidden shadow-lg shadow-black/20 scroll-mt-4"
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection(idx)}
                className="w-full flex items-center gap-4 px-6 py-4.5 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm text-white shrink-0 bg-gradient-to-br shadow-md shadow-black/10",
                  color.bg
                )}>
                  {section.icon || (idx + 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-black text-white tracking-tight leading-tight truncate">
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
                <div className="px-6 pb-6 lg:px-8 lg:pb-8 border-t border-white/5 bg-[#141414]/30">
                  {section.images?.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6">
                      {/* Left Column: Markdown text & tables */}
                      <div className="lg:col-span-7 xl:col-span-8 min-w-0">
                        <div className="prose-ai">
                          <ReactMarkdown
                            remarkPlugins={[remarkMath, remarkGfm]}
                            rehypePlugins={[rehypeKatex]}
                            components={markdownComponents}
                          >
                            {cleanContent(section.content)}
                          </ReactMarkdown>
                        </div>
                      </div>

                      {/* Right Column: Visual reference guide */}
                      <div className="lg:col-span-5 xl:col-span-4 space-y-5 lg:border-l lg:border-white/5 lg:pl-6">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Visual References
                          </span>
                        </div>
                        
                        <div className="space-y-4">
                          {section.images.map((img: any, i: number) => {
                            const mediaBase = API_BASE?.replace(/\/api\/?$/, '')?.replace(/\/$/, '')
                            const fullUrl = !img.url ? '' :
                              (img.url.startsWith('data:') || img.url.startsWith('blob:') || img.url.startsWith('http'))
                                ? img.url
                                : `${mediaBase}${img.url.startsWith('/') ? '' : '/'}${img.url}`
                            return (
                              <div 
                                key={i} 
                                className="group relative rounded-2xl overflow-hidden bg-white/[0.02] border border-white/5 p-2 hover:border-orange-500/30 transition-all duration-300 shadow-lg cursor-pointer"
                                onClick={() => handleImageClick(fullUrl)}
                              >
                                <div className="relative aspect-auto rounded-xl overflow-hidden bg-black/40">
                                  <img 
                                    src={fullUrl} 
                                    alt={img.caption} 
                                    className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-500" 
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center p-3">
                                    <span className="text-[10px] font-bold text-white bg-orange-500/90 px-2.5 py-1 rounded-lg backdrop-blur-sm">
                                      Click to Expand
                                    </span>
                                  </div>
                                </div>
                                {img.caption && (
                                  <p className="text-[11px] text-slate-400 mt-2 px-1 font-medium leading-relaxed italic text-center">
                                    {cleanContent(img.caption)}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Full width markdown if no images */
                    <div className="pt-6 max-w-3xl mx-auto prose-ai">
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
