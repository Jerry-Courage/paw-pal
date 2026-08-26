'use client'

import { FormEvent, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { FileImage, FileText, Link2, NotebookPen, Play, Replace, Trash2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

export type IntakeMode = 'file' | 'link' | 'text'

export interface MaterialDraft {
  mode: IntakeMode
  title: string
  type: 'document' | 'image' | 'video' | 'link' | 'text' | 'slides'
  file?: File
  url?: string
  text?: string
  size?: number
}

const MAX_FILE_SIZE = 50 * 1024 * 1024
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.py,.js,.ts,.jpg,.jpeg,.png,.heic,.heif'

function fileKind(file: File): MaterialDraft['type'] {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'heic', 'heif'].includes(ext || '')) return 'image'
  if (['ppt', 'pptx'].includes(ext || '')) return 'slides'
  if (['txt', 'md'].includes(ext || '')) return 'text'
  return 'document'
}

export function readableSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function MaterialObject({ material, onRemove, className }: { material: MaterialDraft; onRemove?: () => void; className?: string }) {
  const Icon = material.type === 'video' ? Play : material.type === 'link' ? Link2 : material.type === 'image' ? FileImage : material.type === 'text' ? NotebookPen : FileText
  return (
    <motion.div layout initial={{ opacity: 0, y: 24, rotate: -5, scale: .9 }} animate={{ opacity: 1, y: 0, rotate: -1, scale: 1 }}
      className={cn('relative flex min-h-36 w-full max-w-md items-center gap-5 bg-[#F6EFE5] p-5 text-flow-void shadow-[10px_12px_0_rgba(0,0,0,.28)]', className)}
      style={{ clipPath: 'polygon(2% 0,100% 4%,96% 100%,0 94%)' }}>
      <span className="grid h-16 w-14 shrink-0 place-items-center bg-flow-orange text-flow-void shadow-[5px_5px_0_#8f3600]"><Icon className="h-7 w-7" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-black">{material.title}</span>
        <span className="mt-1 block text-xs font-bold uppercase tracking-widest text-flow-void/55">{material.type}{material.size ? ` · ${readableSize(material.size)}` : ''}</span>
        {material.url && <span className="mt-2 block truncate text-xs text-flow-void/50">{material.url}</span>}
      </span>
      {onRemove && <button type="button" onClick={onRemove} aria-label="Remove material" className="absolute right-3 top-3 rounded-full p-2 text-flow-void/50 hover:bg-black/10 hover:text-flow-void focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-orange"><Trash2 className="h-4 w-4" /></button>}
      <span className="absolute -bottom-2 left-12 h-4 w-20 rotate-2 bg-flow-violet/35" aria-hidden="true" />
    </motion.div>
  )
}

export default function MaterialIntake({ material, onChange, error }: { material: MaterialDraft | null; onChange: (material: MaterialDraft | null) => void; error?: string }) {
  const [mode, setMode] = useState<IntakeMode>('file')
  const [url, setUrl] = useState('')
  const [textValue, setTextValue] = useState('')
  const [title, setTitle] = useState('')
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const reduceMotion = useReducedMotion()

  const acceptFile = (file?: File) => {
    if (!file) return
    if (file.size > MAX_FILE_SIZE) { setLocalError('That file is over 50 MB. Choose a smaller version.'); return }
    setLocalError('')
    onChange({ mode: 'file', title: file.name.replace(/\.[^.]+$/, ''), type: fileKind(file), file, size: file.size })
  }

  const acceptUrl = (event: FormEvent) => {
    event.preventDefault()
    try {
      const parsed = new URL(url)
      const video = /youtube\.com|youtu\.be/i.test(parsed.hostname)
      setLocalError('')
      onChange({ mode: 'link', title: title.trim() || parsed.hostname.replace(/^www\./, ''), type: video ? 'video' : 'link', url: parsed.toString() })
    } catch { setLocalError('That link does not look complete yet.') }
  }

  const acceptText = (event: FormEvent) => {
    event.preventDefault()
    if (textValue.trim().length < 40) { setLocalError('Give Flow at least 40 characters to work with.'); return }
    setLocalError('')
    const finalTitle = title.trim() || textValue.trim().split(/\n/)[0].slice(0, 70) || 'My study notes'
    onChange({ mode: 'text', title: finalTitle, type: 'text', text: textValue.trim(), size: new Blob([textValue]).size })
  }

  if (material) return (
    <div className="space-y-5">
      <p className="text-xs font-black uppercase tracking-[.2em] text-flow-success">Flow has it</p>
      <MaterialObject material={material} onRemove={() => onChange(null)} />
      <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-2 text-sm font-bold text-flow-muted hover:text-flow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-orange"><Replace className="h-4 w-4" />Choose something else</button>
    </div>
  )

  return (
    <div onDragEnter={event => { event.preventDefault(); setDragging(true) }} onDragOver={event => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]) }}>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Material type">
        {([
          ['file', 'A document', Upload], ['link', 'A link', Link2], ['text', 'Some text', NotebookPen],
        ] as const).map(([id, label, Icon]) => <motion.button whileTap={reduceMotion ? undefined : { scale: .94 }} key={id} role="tab" aria-selected={mode === id} type="button" onClick={() => setMode(id)}
          className={cn('inline-flex items-center gap-2 px-4 py-2.5 text-sm font-black outline-none transition focus-visible:ring-2 focus-visible:ring-flow-orange', mode === id ? 'bg-flow-orange text-flow-void shadow-[0_4px_0_#8f3600]' : 'bg-flow-raised text-flow-muted hover:text-flow-ink')}>
          <Icon className="h-4 w-4" />{label}
        </motion.button>)}
      </div>

      <div className={cn('mt-7 max-w-2xl transition', dragging && 'translate-x-4')}>
        {mode === 'file' && <div>
          <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={event => acceptFile(event.target.files?.[0])} />
          <button type="button" onClick={() => inputRef.current?.click()} className="group flex w-full items-center gap-5 border-y-2 border-white/15 py-7 text-left outline-none transition hover:border-flow-orange focus-visible:border-flow-orange">
            <span className="grid h-16 w-14 shrink-0 -rotate-3 place-items-center bg-[#F6EFE5] text-flow-void shadow-[5px_6px_0_rgba(0,0,0,.4)] transition group-hover:rotate-1 group-hover:-translate-y-1"><FileText className="h-7 w-7" /></span>
            <span><span className="block text-lg font-black">Hand Flow a file</span><span className="mt-1 block text-sm text-flow-muted">PDF, Word, slides, text, code, or an image</span></span>
            <ArrowMark />
          </button>
          <p className="mt-3 text-xs text-flow-muted/70">You can also drop it anywhere here on desktop. Maximum 50 MB in this experience.</p>
        </div>}

        {mode === 'link' && <form onSubmit={acceptUrl} className="space-y-5 border-y-2 border-white/15 py-6">
          <label className="block"><span className="text-xs font-black uppercase tracking-widest text-flow-muted">Link</span><input type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://..." className="mt-2 w-full border-b border-white/20 bg-transparent py-3 text-lg font-bold outline-none focus:border-flow-orange" /></label>
          <label className="block"><span className="text-xs font-black uppercase tracking-widest text-flow-muted">A useful title <span className="normal-case tracking-normal">(optional)</span></span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="What should we call it?" className="mt-2 w-full border-b border-white/20 bg-transparent py-3 text-base font-bold outline-none focus:border-flow-orange" /></label>
          <button className="bg-flow-orange px-5 py-3 font-black text-flow-void shadow-[0_5px_0_#8f3600] active:translate-y-1 active:shadow-none">Hand it over</button>
        </form>}

        {mode === 'text' && <form onSubmit={acceptText} className="space-y-4 border-y-2 border-white/15 py-6">
          <label className="block"><span className="text-xs font-black uppercase tracking-widest text-flow-muted">Title <span className="normal-case tracking-normal">(optional)</span></span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="Lecture notes, chapter 4..." className="mt-2 w-full border-b border-white/20 bg-transparent py-3 text-base font-bold outline-none focus:border-flow-orange" /></label>
          <label className="block"><span className="sr-only">Paste study text</span><textarea required minLength={40} value={textValue} onChange={event => setTextValue(event.target.value)} placeholder="Paste the material here..." rows={6} className="w-full resize-y bg-flow-raised p-4 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-flow-orange" /></label>
          <button className="bg-flow-orange px-5 py-3 font-black text-flow-void shadow-[0_5px_0_#8f3600] active:translate-y-1 active:shadow-none">Hand it over</button>
        </form>}
      </div>
      {(error || localError) && <p role="alert" className="mt-4 max-w-xl text-sm font-bold text-rose-300">{error || localError}</p>}
    </div>
  )
}

function ArrowMark() { return <span aria-hidden="true" className="ml-auto text-3xl font-light text-flow-orange transition group-hover:translate-x-1">→</span> }
