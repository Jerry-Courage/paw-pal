'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils'
import { API_BASE } from '@/lib/api'
import { X, Maximize2 } from 'lucide-react'

interface RichNotesViewerProps {
  notes: any
  isEditing: boolean
  setIsEditing: (v: boolean) => void
  isMathMode?: boolean
  onSave: (notes: any) => void
  onOpenMath?: (prob: string) => void
}

// Accent colors — one per section, used only for the section number + title underline
const ACCENT = [
  'text-blue-400   border-blue-400',
  'text-violet-400 border-violet-400',
  'text-emerald-400 border-emerald-400',
  'text-orange-400 border-orange-400',
  'text-pink-400   border-pink-400',
  'text-cyan-400   border-cyan-400',
  'text-fuchsia-400 border-fuchsia-400',
  'text-lime-400   border-lime-400',
]

export default function RichNotesViewer({
  notes,
  isEditing,
  setIsEditing,
  isMathMode,
  onSave,
  onOpenMath,
}: RichNotesViewerProps) {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)

  if (!notes) return null

  const cleanTitle = (t: string) =>
    (t || '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/, '').trim()

  const cleanContent = (text: string) => {
    if (!text) return ''
    return text
      .replace(/ACTION:\s*\{.*?\}/gi, '')
      .replace(/\\n\\n/g, '\n\n')
      .replace(/\\n/g, '\n')
      .replace(/\*\*(Key Question:|Memory Trick:|Quick Summary:|Deep Dive:)\*\*/g, '\n\n**$1**')
      .trim()
  }

  const resolveUrl = (url: string) => {
    if (!url) return ''
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) return url
    const base = API_BASE?.replace(/\/api\/?$/, '')?.replace(/\/$/, '') || ''
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`
  }

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-8 pb-32 text-[#e2e2e2]">

      {/* ── Document title ─────────────────────────────────── */}
      <div className="mb-10 pb-6 border-b border-white/[0.08]">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-orange-400/70 mb-3">
          {isMathMode ? 'Logical Derivation' : 'Study Notes'}
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white leading-snug mb-4">
          {notes.overview?.title || 'Study Material'}
        </h1>
        {notes.overview?.summary && (
          <p className="text-[15px] text-slate-400 leading-[1.85]">
            {cleanTitle(notes.overview.summary).split('.').slice(0, 3).join('.').trim() + '.'}
          </p>
        )}
      </div>

      {/* ── Sections — continuous document flow ────────────── */}
      <div>
        {notes.sections?.map((section: any, idx: number) => {
          const accentClass = ACCENT[idx % ACCENT.length]
          // Split into color parts for targeted use
          const accentText  = accentClass.split(' ')[0]   // e.g. text-blue-400
          const accentBorder = accentClass.split(' ')[1]  // e.g. border-blue-400

          // Inline images for this section
          const images: any[] = section.images || []

          // Build markdown component map — scoped to this section's accent
          const md: any = {
            // ── Tables ──
            table: ({ children }: any) => (
              <div className="my-6 overflow-x-auto rounded-xl border border-white/[0.08]">
                <table className="min-w-full border-collapse text-sm">{children}</table>
              </div>
            ),
            thead: ({ children }: any) => <thead className="bg-white/[0.04] text-slate-400">{children}</thead>,
            th: ({ children }: any) => (
              <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider border-b border-white/[0.08]">{children}</th>
            ),
            td: ({ children }: any) => (
              <td className="px-4 py-3 text-[14px] text-slate-300 border-b border-white/[0.05] leading-relaxed">{children}</td>
            ),
            tr: ({ children }: any) => <tr className="hover:bg-white/[0.02]">{children}</tr>,

            // ── Headings ──
            h1: ({ children }: any) => (
              <h1 className="text-xl font-bold text-white mt-8 mb-3 first:mt-0 leading-snug">{children}</h1>
            ),
            h2: ({ children }: any) => (
              <h2 className="text-lg font-bold text-white mt-7 mb-2.5 first:mt-0 leading-snug">{children}</h2>
            ),
            h3: ({ children }: any) => (
              <h3 className="text-base font-semibold text-slate-200 mt-5 mb-2 first:mt-0">{children}</h3>
            ),
            h4: ({ children }: any) => (
              <h4 className={cn('text-[11px] font-black uppercase tracking-[0.2em] mt-5 mb-2 first:mt-0', accentText)}>
                {children}
              </h4>
            ),

            // ── Paragraph ──
            p: ({ children }: any) => (
              <p className="mb-4 text-[15px] leading-[1.85] text-slate-300 last:mb-0">{children}</p>
            ),

            // ── Bold — key terms highlighted like a textbook ──
            strong: ({ children }: any) => {
              const text = String(children || '')
              const isLabel = ['Key Question:', 'Deep Dive:', 'Memory Trick:', 'Quick Summary:'].some(l =>
                text.trim().startsWith(l)
              )
              if (isLabel) {
                return (
                  <strong className={cn('block text-[11px] font-black uppercase tracking-[0.2em] mb-1.5 mt-5 first:mt-0', accentText)}>
                    {text}
                  </strong>
                )
              }
              // Textbook-style: bold + subtle color highlight
              return (
                <strong className={cn('font-bold', accentText)}>{children}</strong>
              )
            },

            // ── Italic ──
            em: ({ children }: any) => (
              <em className="not-italic text-slate-200 font-medium">{children}</em>
            ),

            // ── Blockquote ──
            blockquote: ({ children }: any) => (
              <blockquote className={cn('my-5 pl-4 border-l-[3px] py-0.5', accentBorder)}>
                <div className="text-[15px] text-slate-400 italic leading-[1.85]">{children}</div>
              </blockquote>
            ),

            // ── Lists — textbook bullet hierarchy ──
            ul: ({ children }: any) => (
              <ul className="mb-4 space-y-1.5 pl-0">{children}</ul>
            ),
            ol: ({ children }: any) => (
              <ol className="mb-4 space-y-1.5 pl-0 list-none counter-reset-[item]">{children}</ol>
            ),
            li: ({ children }: any) => (
              <li className="flex gap-2.5 text-[15px] text-slate-300 leading-[1.8]">
                {/* Solid bullet dot matching accent */}
                <span className={cn('mt-[0.55em] w-[5px] h-[5px] rounded-full shrink-0 opacity-80',
                  accentText.replace('text-', 'bg-')
                )} />
                <span className="flex-1">{children}</span>
              </li>
            ),

            // ── Links ──
            a: ({ children, href }: any) => (
              <a
                href={href}
                className={cn('underline underline-offset-3 font-medium transition-opacity hover:opacity-70', accentText)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),

            // ── Divider ──
            hr: () => <div className="my-7 h-px bg-white/[0.07]" />,

            // ── Inline images in markdown body ──
            img: ({ src, alt }: any) => {
              if (!src || src.startsWith('Illustration') || !src.includes('/')) {
                return alt ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-500 italic">
                    🖼️ {cleanContent(alt || src)}
                  </span>
                ) : null
              }
              const url = src.startsWith('http') ? src : `${API_BASE?.replace(/\/api\/?$/, '')}${src}`
              return (
                <span
                  className="block float-right ml-5 mb-3 w-[45%] max-w-[220px] cursor-zoom-in group"
                  onClick={() => setZoomedImage(url)}
                >
                  <img src={url} alt={alt} className="w-full h-auto rounded-lg border border-white/[0.08] group-hover:border-white/20 transition-all" />
                  {alt && <span className="block text-[11px] text-slate-500 italic mt-1 text-center leading-snug">{cleanContent(alt)}</span>}
                </span>
              )
            },

            // ── Code ──
            code: ({ node, inline, className, children, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || '')
              const content = Array.isArray(children) ? children.join('') : String(children || '')
              const cleanedCode = content.replace(/\n$/, '')
              const isMathBlock =
                match?.[1] === 'math' ||
                (!inline && (cleanedCode.includes('\\') || cleanedCode.includes('_') || cleanedCode.includes('^')))

              if (isMathBlock) {
                return (
                  <div className="my-6 py-5 px-5 bg-black/40 rounded-xl border border-white/[0.06] overflow-x-auto">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: katex.renderToString(cleanedCode.replace(/\\\\/g, '\\'), {
                          displayMode: true,
                          throwOnError: false,
                          trust: true,
                        }),
                      }}
                    />
                  </div>
                )
              }
              if (inline) {
                return (
                  <code className="px-1.5 py-0.5 rounded bg-white/[0.07] font-mono text-[13px] text-orange-300" {...props}>
                    {children}
                  </code>
                )
              }
              return (
                <div className="my-5 rounded-xl bg-black/40 border border-white/[0.06] overflow-x-auto">
                  <pre className="p-4">
                    <code className="font-mono text-[13px] text-slate-300 leading-relaxed" {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              )
            },
          }

          return (
            <div key={idx} id={`section-${idx}`} className="mb-12 scroll-mt-4">

              {/* ── Section heading — textbook style ── */}
              <div className="flex items-baseline gap-3 mb-5">
                {/* Large section number */}
                <span className={cn('text-4xl font-black leading-none shrink-0 tabular-nums', accentText)}>
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <h2 className={cn(
                    'text-lg sm:text-xl font-bold text-white leading-snug pb-1.5 border-b-2',
                    accentBorder
                  )}>
                    {cleanTitle(section.title)}
                  </h2>
                </div>
              </div>

              {/* ── Section body ── */}
              {/* If images exist, float them right inside the text flow */}
              <div className="clearfix">
                {/* Floating image(s) — first image floats right, rest stack below it */}
                {images.length > 0 && (
                  <div className="float-right ml-6 mb-4 space-y-3 w-[42%] max-w-[240px] hidden sm:block">
                    {images.slice(0, 2).map((img: any, i: number) => {
                      const url = resolveUrl(img.url)
                      if (!url) return null
                      return (
                        <div
                          key={i}
                          className="group cursor-zoom-in rounded-xl overflow-hidden border border-white/[0.08] hover:border-white/20 transition-all bg-black/20"
                          onClick={() => setZoomedImage(url)}
                        >
                          <img src={url} alt={img.caption} className="w-full h-auto object-cover" />
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="p-1 bg-black/60 rounded backdrop-blur-sm">
                              <Maximize2 className="w-3 h-3 text-white" />
                            </div>
                          </div>
                          {img.caption && (
                            <p className="text-[11px] text-slate-500 px-2.5 py-1.5 italic leading-snug border-t border-white/[0.05] text-center">
                              {cleanContent(img.caption)}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Main text */}
                <ReactMarkdown
                  remarkPlugins={[remarkMath, remarkGfm]}
                  rehypePlugins={[rehypeKatex]}
                  components={md}
                >
                  {cleanContent(section.content)}
                </ReactMarkdown>

                {/* Mobile images — shown below text on small screens */}
                {images.length > 0 && (
                  <div className="sm:hidden mt-5 space-y-3">
                    {images.slice(0, 2).map((img: any, i: number) => {
                      const url = resolveUrl(img.url)
                      if (!url) return null
                      return (
                        <div
                          key={i}
                          className="rounded-xl overflow-hidden border border-white/[0.08] cursor-zoom-in"
                          onClick={() => setZoomedImage(url)}
                        >
                          <img src={url} alt={img.caption} className="w-full h-auto" />
                          {img.caption && (
                            <p className="text-[11px] text-slate-500 px-3 py-2 italic text-center border-t border-white/[0.05]">
                              {cleanContent(img.caption)}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Extra images (3+) shown below on all screens */}
                {images.length > 2 && (
                  <div className="mt-5 grid grid-cols-2 gap-3 clear-both">
                    {images.slice(2).map((img: any, i: number) => {
                      const url = resolveUrl(img.url)
                      if (!url) return null
                      return (
                        <div
                          key={i}
                          className="rounded-xl overflow-hidden border border-white/[0.08] cursor-zoom-in"
                          onClick={() => setZoomedImage(url)}
                        >
                          <img src={url} alt={img.caption} className="w-full h-auto" />
                          {img.caption && (
                            <p className="text-[11px] text-slate-500 px-2 py-1.5 italic text-center border-t border-white/[0.05]">
                              {cleanContent(img.caption)}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Section divider */}
              {idx < (notes.sections?.length ?? 0) - 1 && (
                <div className="mt-10 h-px bg-white/[0.06]" />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Image lightbox ─────────────────────────────────── */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[200] bg-black/92 backdrop-blur-md flex items-center justify-center p-4 sm:p-10"
          onClick={() => setZoomedImage(null)}
        >
          <button
            className="absolute top-5 right-5 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
            onClick={() => setZoomedImage(null)}
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={zoomedImage}
            alt="Full size"
            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
