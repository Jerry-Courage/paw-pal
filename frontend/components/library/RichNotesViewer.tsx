'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
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
                remarkPlugins={[remarkMath]}
                components={{
                  h1: ({ children }) => <h1 className="text-3xl sm:text-5xl font-black mb-8 leading-tight">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-2xl sm:text-4xl font-black mb-6 leading-tight">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-xl sm:text-2xl font-black mb-4">{children}</h3>,
                  p: ({ children }) => <p className="mb-8 leading-[1.8] text-slate-600 dark:text-slate-300 text-base sm:text-lg">{children}</p>,
                  ul: ({ children }) => <ul className="list-none pl-0 mb-10 space-y-4">{children}</ul>,
                  li: ({ children }) => (
                    <li className="flex gap-4 text-slate-600 dark:text-slate-300 text-base sm:text-lg font-medium group/li">
                      <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0 group-hover/li:bg-primary group-hover/li:scale-125 transition-all" />
                      <span>{children}</span>
                    </li>
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
                        {alt && <p className="mt-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] text-center">{alt}</p>}
                      </div>
                    )
                  },

                  // Smart Math Interceptor
                  math: ({ value, children }: any) => {
                    const latex = (value || (children as any)?.[0] || '').toString().trim()
                    if (!latex) return null
                    
                    if (isMathMode) {
                      const solveProblem = `Analyze the derivation and logical principles of this formula: ${latex}`
                      return (
                        <DigitalBlackboard onSolve={() => onOpenMath?.(solveProblem)} label="Proof / Formula">
                          <div dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { displayMode: true, throwOnError: false }) }} />
                        </DigitalBlackboard>
                      )
                    }

                    return (
                      <div className="my-12 py-10 px-6 sm:px-12 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-[2.5rem] flex justify-center text-slate-900 dark:text-white overflow-x-auto scrollbar-hide shadow-inner">
                        <div dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { displayMode: true, throwOnError: false }) }} />
                      </div>
                    )
                  },
                  inlineMath: ({ value, children }: any) => {
                    const latex = (value || (children as any)?.[0] || '').toString().trim()
                    if (!latex) return null

                    if (isMathMode) {
                      const solveProblem = `Explain the mathematical meaning of: ${latex}`
                      return (
                        <span 
                          className="text-phosphor font-black cursor-help hover:text-primary transition-colors inline-block mx-1 px-2 py-0.5 bg-primary/5 rounded-lg whitespace-nowrap" 
                          onClick={() => onOpenMath?.(solveProblem)}
                          dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { displayMode: false, throwOnError: false }) }} 
                        />
                      )
                    }

                    return (
                      <span 
                        className="font-bold text-slate-900 dark:text-white mx-1"
                        dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { displayMode: false, throwOnError: false }) }} 
                      />
                    )
                  }
                }}
              >
                {section.content}
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
                        <div className="mt-8 flex items-center justify-between w-full">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em]">
                              {img.caption || `Diagram Asset — Page ${img.page}`}
                            </p>
                          </div>
                          <div className="h-px flex-1 mx-6 bg-slate-100 dark:bg-white/5" />
                          <span className="text-[10px] font-bold text-primary px-3 py-1 bg-primary/5 rounded-full uppercase tracking-tighter">SOURCE P{img.page}</span>
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
