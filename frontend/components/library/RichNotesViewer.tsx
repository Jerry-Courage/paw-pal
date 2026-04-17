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
import { X, ZoomIn, Maximize2 } from 'lucide-react'

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

  if (!notes) return null

  const handleImageClick = (src: string) => {
    setZoomedImage(src)
  }

  const cleanContent = (text: string) => {
    if (!text) return ''
    return text.replace(/ACTION:\s*\{.*?\}/gi, '').trim()
  }

  return (
    <div className={cn(
      "relative pb-32",
      isMathMode ? "study-matrix-canvas" : "canvas-standard"
    )}>
      {/* Subject Header */}
      <div className={cn(
        "mb-16 animate-in fade-in slide-in-from-top-4 duration-700",
        !isMathMode && "text-center sm:text-left"
      )}>
        <div className="flex items-center gap-3 mb-4 justify-center sm:justify-start">
          <div className="h-px w-8 bg-primary/30" />
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/60">
            {isMathMode ? "Logical Derivation" : "Comprehensive Study Kit"}
          </span>
        </div>
        <h1 className={cn(
          "font-black tracking-tighter text-slate-800 dark:text-white mb-6 leading-[0.9]",
          isMathMode ? "text-5xl lg:text-7xl" : "text-4xl sm:text-6xl lg:text-8xl"
        )}>
          {notes.overview?.title || 'Study Material'}
        </h1>
        <p className={cn(
          "text-lg sm:text-xl text-slate-500 font-medium max-w-3xl leading-relaxed mx-auto sm:mx-0",
          !isMathMode && "opacity-80"
        )}>
          {notes.overview?.summary}
        </p>
      </div>

      <div className="space-y-16 sm:space-y-24">
        {notes.sections?.map((section: any, idx: number) => (
          <div key={idx} className={cn(
            "group/card transition-all duration-700",
            isMathMode ? "glass-narrative-card" : "standard-reading-card"
          )}>
            {/* Section Header */}
            <div className="flex items-start gap-6 mb-10">
              <div className={cn(
                "w-14 h-14 rounded-3xl flex items-center justify-center font-black text-2xl shadow-xl transition-all duration-500 shrink-0",
                isMathMode 
                  ? "bg-primary text-white scale-110 shadow-primary/20 group-hover/card:rotate-6" 
                  : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 group-hover/card:bg-primary group-hover/card:text-white group-hover/card:scale-105"
              )}>
                {section.icon || (idx + 1)}
              </div>
              <div className="pt-1">
                <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white uppercase leading-none mb-2">
                  {section.title}
                </h2>
                <div className={cn(
                  "h-1.5 rounded-full transition-all duration-700",
                  isMathMode 
                    ? "bg-primary w-16 group-hover/card:w-32" 
                    : "bg-slate-200 dark:bg-slate-800 w-8 group-hover/card:bg-primary group-hover/card:w-24"
                )} />
              </div>
            </div>

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
                <div className="w-full overflow-x-auto my-8 rounded-[2rem] shadow-2xl border border-slate-200/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm px-1">
                  <table className="min-w-full border-collapse">{children}</table>
                </div>
              ),
              h1: ({ children }) => <h1 className="text-3xl sm:text-5xl font-black mb-8 leading-tight">{children}</h1>,
              h2: ({ children }) => <h2 className="text-2xl sm:text-4xl font-black mb-6 leading-tight">{children}</h2>,
              h3: ({ children }) => <h3 className="text-xl sm:text-2xl font-black mb-4">{children}</h3>,
              p: ({ children }) => <p className="mb-10 leading-[1.85] text-slate-700 dark:text-slate-300 text-base sm:text-[17px] font-medium tracking-tight last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-none pl-0 mb-12 space-y-5">{children}</ul>,
              li: ({ children }) => (
                <li className="flex gap-4 text-slate-700 dark:text-slate-300 text-base sm:text-lg font-medium group/li leading-relaxed">
                  <div className="mt-[10px] w-2.5 h-2.5 rounded-full border-2 border-primary/20 bg-primary shadow-[0_0_10px_rgba(14,165,233,0.3)] shrink-0 group-hover:scale-125 transition-all duration-300" />
                  <span className="flex-1">{children}</span>
                </li>
              ),
              a: ({ children, href }) => (
                <a 
                  href={href} 
                  className="text-sky-600 dark:text-sky-400 font-bold border-b-2 border-sky-600/20 hover:border-sky-600 hover:text-sky-700 transition-all px-0.5"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
              
              // In-Text Image Support
              img: ({ src, alt }: any) => {
                const fullUrl = src?.startsWith('http') ? src : `${API_BASE?.replace(/\/api\/?$/, '')}${src}`
                return (
                  <div className="diagram-container group/img relative -mx-4 sm:mx-0">
                    <img 
                      src={fullUrl} 
                      alt={alt} 
                      className="diagram-image" 
                      onClick={() => handleImageClick(fullUrl)}
                    />
                    <button 
                      onClick={() => handleImageClick(fullUrl)}
                      className="absolute top-4 right-4 p-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl opacity-0 group-hover/img:opacity-100 transition-all shadow-xl"
                    >
                      <Maximize2 className="w-5 h-5 text-primary" />
                    </button>
                    {alt && (
                      <div className="mt-6 text-center px-4 max-w-2xl mx-auto">
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
                const cleanContent = content.replace(/\n$/, '')
                
                const isMath = match?.[1] === 'math' || (!inline && (cleanContent.includes('\\') || cleanContent.includes('_') || cleanContent.includes('^')))

                if (isMath) {
                  return (
                    <div className="math-block-container my-12 py-10 px-6 sm:px-12 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center text-slate-900 dark:text-white overflow-x-auto scrollbar-hide shadow-inner group/math relative w-full">
                      <div 
                        className="katex-display-wrapper"
                        dangerouslySetInnerHTML={{ 
                          __html: katex.renderToString(cleanContent.replace(/\\\\/g, '\\'), { 
                            displayMode: true, 
                            throwOnError: false,
                            trust: true 
                          }) 
                        }} 
                      />
                      <div className="absolute top-4 right-6 opacity-0 group-hover/math:opacity-100 transition-all duration-300 transform translate-y-2 group-hover/math:translate-y-0">
                         <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                           <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                           <span className="text-[10px] font-black uppercase tracking-widest text-primary">Intelligent Formula</span>
                         </div>
                      </div>
                    </div>
                  )
                }
                
                if (inline && (cleanContent.startsWith('\\') || (cleanContent.includes('_') && cleanContent.length < 20))) {
                   return (
                    <span 
                      className="font-bold text-slate-900 dark:text-white mx-1"
                      dangerouslySetInnerHTML={{ 
                        __html: katex.renderToString(cleanContent.replace(/\\\\/g, '\\'), { 
                          displayMode: false, 
                          throwOnError: false 
                        }) 
                      }} 
                    />
                  )
                }

                return (
                  <code className={cn("px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-mono text-sm", className)} {...props}>
                    {children}
                  </code>
                )
              },
            }}
          >
            {cleanContent(section.content)}
          </ReactMarkdown>

          {/* PDF Extracted Diagrams (Archive Block) */}
          {section.images?.length > 0 && (
            <div className="mt-16 space-y-12">
              {section.images.map((img: any, i: number) => {
                const mediaBase = API_BASE?.replace(/\/api\/?$/, '')?.replace(/\/$/, '')
                const fullUrl = img.url?.startsWith('http') ? img.url : `${mediaBase}${img.url}`
                  
                return (
                  <div key={i} className="diagram-container group/diagram relative -mx-4 sm:mx-0">
                    <img 
                      src={fullUrl} 
                      alt={img.caption} 
                      className="diagram-image" 
                      onClick={() => handleImageClick(fullUrl)}
                    />
                    <button 
                      onClick={() => handleImageClick(fullUrl)}
                      className="absolute top-6 right-6 p-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-3xl opacity-0 group-hover/diagram:opacity-100 transition-all shadow-2xl hover:scale-110 active:scale-95"
                    >
                      <Maximize2 className="w-6 h-6 text-primary" />
                    </button>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-between w-full gap-4">
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
        ))}
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
