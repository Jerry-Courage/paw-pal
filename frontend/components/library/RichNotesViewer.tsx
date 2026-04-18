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
import { X, ZoomIn, Maximize2, BookOpen, Lightbulb, ChevronRight } from 'lucide-react'

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
      "relative pb-32",
      isMathMode ? "study-matrix-canvas" : "canvas-standard"
    )}>
      {/* Subject Header */}
      <div className={cn(
        "mb-12 sm:mb-16 animate-in fade-in slide-in-from-top-4 duration-700",
        !isMathMode && "text-center sm:text-left"
      )}>
        <div className="flex items-center gap-3 mb-4 justify-center sm:justify-start">
          <div className="h-px w-8 bg-primary/30" />
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/60">
            {isMathMode ? "Logical Derivation" : "Comprehensive Study Kit"}
          </span>
        </div>
        <h1 className={cn(
          "font-black tracking-tighter text-slate-800 dark:text-white mb-4 leading-[0.9]",
          isMathMode ? "text-4xl lg:text-6xl" : "text-3xl sm:text-5xl lg:text-7xl"
        )}>
          {notes.overview?.title || 'Study Material'}
        </h1>
        {notes.overview?.summary && (
          <div className="mt-6 p-5 sm:p-6 rounded-2xl bg-primary/5 border border-primary/10 max-w-3xl mx-auto sm:mx-0">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                {notes.overview.summary}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Table of Contents */}
      {notes.sections?.length > 3 && (
        <div className="mb-12 p-5 sm:p-6 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">Quick Navigation</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {notes.sections.map((section: any, idx: number) => {
              const color = sectionColors[idx % sectionColors.length]
              return (
                <button
                  key={idx}
                  onClick={() => document.getElementById(`section-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="group flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all text-left"
                >
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white bg-gradient-to-br", color.bg)}>
                    {idx + 1}
                  </div>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-primary transition-colors truncate">
                    {section.title}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 ml-auto shrink-0 group-hover:text-primary transition-colors" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-8 sm:space-y-12">
        {notes.sections?.map((section: any, idx: number) => {
          const color = sectionColors[idx % sectionColors.length]
          const isExpanded = expandedSections[idx] !== false // default: expanded
          
          return (
            <div 
              key={idx} 
              id={`section-${idx}`}
              className={cn(
                "group/card transition-all duration-500 scroll-mt-8",
                "bg-white/80 dark:bg-slate-900/50 backdrop-blur-sm rounded-3xl border border-slate-200/60 dark:border-white/5",
                "shadow-sm hover:shadow-lg hover:shadow-primary/5",
                "overflow-hidden"
              )}
            >
              {/* Section Header — clickable to collapse/expand */}
              <button
                onClick={() => toggleSection(idx)}
                className="w-full flex items-center gap-4 sm:gap-5 p-5 sm:p-7 text-left hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className={cn(
                  "w-11 h-11 sm:w-13 sm:h-13 rounded-2xl flex items-center justify-center font-black text-lg sm:text-xl text-white shadow-lg shrink-0 bg-gradient-to-br transition-transform group-hover/card:scale-105",
                  color.bg
                )}>
                  {section.icon || (idx + 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white leading-tight truncate">
                    {section.title}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={cn("w-2 h-2 rounded-full", color.dot)} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Section {idx + 1} of {notes.sections.length}
                    </span>
                  </div>
                </div>
                <ChevronRight className={cn(
                  "w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0 transition-transform duration-300",
                  isExpanded ? "rotate-90" : "rotate-0"
                )} />
              </button>

              {/* Section Content */}
              {isExpanded && (
                <div className="px-5 sm:px-7 pb-6 sm:pb-8 animate-in fade-in duration-300">
                  {/* Accent bar */}
                  <div className={cn("h-px w-full mb-6", color.border, "bg-current opacity-10")} />

                  {/* Content Rendering Engine */}
                  <div className={cn(
                    "prose-ai max-w-none relative z-10", 
                    isEditing ? "hidden" : "block"
                  )}>
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        table: ({ children }) => (
                          <div className="w-full overflow-x-auto my-6 rounded-2xl shadow-lg border border-slate-200/50 dark:border-white/10 bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm">
                            <table className="min-w-full border-collapse">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-slate-50 dark:bg-slate-800/80">{children}</thead>
                        ),
                        th: ({ children }) => (
                          <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">{children}</th>
                        ),
                        td: ({ children }) => (
                          <td className="px-4 py-3.5 text-sm text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-white/5 font-medium">{children}</td>
                        ),
                        h1: ({ children }) => <h1 className="text-2xl sm:text-4xl font-black mb-6 leading-tight text-slate-900 dark:text-white">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-xl sm:text-3xl font-black mb-5 leading-tight text-slate-900 dark:text-white">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-lg sm:text-xl font-black mb-3 text-slate-800 dark:text-slate-100">{children}</h3>,
                        h4: ({ children }) => <h4 className="text-base sm:text-lg font-bold mb-3 text-slate-700 dark:text-slate-200">{children}</h4>,
                        p: ({ children }) => (
                          <p className="mb-5 leading-[1.9] text-slate-600 dark:text-slate-300 text-[15px] sm:text-base font-medium last:mb-0">
                            {children}
                          </p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-black text-slate-900 dark:text-white">{children}</strong>
                        ),
                        em: ({ children }) => (
                          <em className="text-primary font-semibold not-italic">{children}</em>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="my-6 pl-5 border-l-4 border-primary/30 bg-primary/5 rounded-r-2xl py-4 pr-5">
                            <div className="text-slate-700 dark:text-slate-300 font-medium italic">{children}</div>
                          </blockquote>
                        ),
                        ul: ({ children }) => <ul className="list-none pl-0 mb-6 space-y-3">{children}</ul>,
                        ol: ({ children }) => <ol className="list-none pl-0 mb-6 space-y-3 counter-reset-list">{children}</ol>,
                        li: ({ children }) => (
                          <li className="flex gap-3 text-slate-600 dark:text-slate-300 text-[15px] sm:text-base font-medium group/li leading-relaxed">
                            <div className={cn("mt-[9px] w-2 h-2 rounded-full shrink-0 transition-all duration-300 group-hover/li:scale-150", sectionColors[0].dot)} />
                            <span className="flex-1">{children}</span>
                          </li>
                        ),
                        a: ({ children, href }) => (
                          <a 
                            href={href} 
                            className="text-primary font-bold border-b-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all px-0.5 rounded-sm"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ),
                        hr: () => (
                          <div className="my-8 flex items-center gap-4">
                            <div className="h-px flex-1 bg-slate-200 dark:bg-white/5" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
                            <div className="h-px flex-1 bg-slate-200 dark:bg-white/5" />
                          </div>
                        ),
                        
                        // In-Text Image Support
                        img: ({ src, alt }: any) => {
                          const fullUrl = src?.startsWith('http') ? src : `${API_BASE?.replace(/\/api\/?$/, '')}${src}`
                          return (
                            <div className="diagram-container group/img relative my-6 -mx-2 sm:mx-0">
                              <img 
                                src={fullUrl} 
                                alt={alt} 
                                className="diagram-image rounded-2xl" 
                                onClick={() => handleImageClick(fullUrl)}
                              />
                              <button 
                                onClick={() => handleImageClick(fullUrl)}
                                className="absolute top-4 right-4 p-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl opacity-0 group-hover/img:opacity-100 transition-all shadow-xl"
                              >
                                <Maximize2 className="w-5 h-5 text-primary" />
                              </button>
                              {alt && (
                                <div className="mt-4 text-center px-4 max-w-2xl mx-auto">
                                  <p className="text-sm italic text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                                    <span className="font-black text-primary uppercase tracking-widest text-[10px] mr-2 not-italic">Figure:</span>
                                    {cleanContent(alt)}
                                  </p>
                                </div>
                              )}
                            </div>
                          )
                        },

                        // Code Block Interceptor
                        code: ({ node, inline, className, children, ...props }: any) => {
                          const match = /language-(\w+)/.exec(className || '')
                          const content = Array.isArray(children) ? children.join('') : String(children || '')
                          const cleanedCode = content.replace(/\n$/, '')
                          
                          const isMath = match?.[1] === 'math' || (!inline && (cleanedCode.includes('\\') || cleanedCode.includes('_') || cleanedCode.includes('^')))

                          if (isMath) {
                            return (
                              <div className="math-block-container my-8 py-8 px-5 sm:px-10 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center text-slate-900 dark:text-white overflow-x-auto scrollbar-hide shadow-inner group/math relative w-full">
                                <div 
                                  className="katex-display-wrapper"
                                  dangerouslySetInnerHTML={{ 
                                    __html: katex.renderToString(cleanedCode.replace(/\\\\/g, '\\'), { 
                                      displayMode: true, 
                                      throwOnError: false,
                                      trust: true 
                                    }) 
                                  }} 
                                />
                                <div className="absolute top-3 right-4 opacity-0 group-hover/math:opacity-100 transition-all duration-300">
                                   <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 rounded-full border border-primary/20">
                                     <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                     <span className="text-[9px] font-black uppercase tracking-widest text-primary">Formula</span>
                                   </div>
                                </div>
                              </div>
                            )
                          }
                          
                          if (inline && (cleanedCode.startsWith('\\') || (cleanedCode.includes('_') && cleanedCode.length < 20))) {
                             return (
                              <span 
                                className="font-bold text-slate-900 dark:text-white mx-1"
                                dangerouslySetInnerHTML={{ 
                                  __html: katex.renderToString(cleanedCode.replace(/\\\\/g, '\\'), { 
                                    displayMode: false, 
                                    throwOnError: false 
                                  }) 
                                }} 
                              />
                            )
                          }

                          return (
                            <code className={cn("px-1.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-sm text-primary", className)} {...props}>
                              {children}
                            </code>
                          )
                        },
                      }}
                    >
                      {cleanContent(section.content)}
                    </ReactMarkdown>

                    {/* PDF Extracted Diagrams */}
                    {section.images?.length > 0 && (
                      <div className="mt-10 space-y-8">
                        {section.images.map((img: any, i: number) => {
                          const mediaBase = API_BASE?.replace(/\/api\/?$/, '')?.replace(/\/$/, '')
                          const fullUrl = img.url?.startsWith('http') ? img.url : `${mediaBase}${img.url}`
                            
                          return (
                            <div key={i} className="diagram-container group/diagram relative -mx-2 sm:mx-0">
                              <img 
                                src={fullUrl} 
                                alt={img.caption} 
                                className="diagram-image rounded-2xl" 
                                onClick={() => handleImageClick(fullUrl)}
                              />
                              <button 
                                onClick={() => handleImageClick(fullUrl)}
                                className="absolute top-4 right-4 p-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl opacity-0 group-hover/diagram:opacity-100 transition-all shadow-xl hover:scale-110 active:scale-95"
                              >
                                <Maximize2 className="w-5 h-5 text-primary" />
                              </button>
                              <div className="mt-5 flex flex-col sm:flex-row items-center justify-between w-full gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                  <p className="text-sm italic text-slate-500 dark:text-slate-400 font-medium">
                                    <span className="font-black text-primary uppercase tracking-widest text-[10px] mr-2 not-italic">Figure {i+1}:</span>
                                    {cleanContent(img.caption)}
                                  </p>
                                </div>
                                <div className="hidden sm:block h-px flex-1 mx-6 bg-slate-100 dark:bg-white/5" />
                                <span className="text-[10px] font-bold text-primary px-3 py-1 bg-primary/5 rounded-full uppercase tracking-tighter shrink-0">SOURCE P{img.page}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                      
                  {/* Edit Mode placeholder */}
                  {isEditing && (
                    <div className="p-8 bg-slate-50 dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-center text-slate-400">
                      Editing logic managed by parent...
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
        <div 
          className="image-zoom-overlay"
          onClick={() => setZoomedImage(null)}
        >
          <button 
            className="absolute top-8 right-8 p-4 bg-white/10 hover:bg-white/20 text-white rounded-3xl backdrop-blur-xl transition-all hover:rotate-90"
            onClick={() => setZoomedImage(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img 
            src={zoomedImage} 
            alt="Zoomed Diagram" 
            className="max-w-full max-h-full rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-500"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
