'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { libraryApi, paymentsApi } from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

const PaywallModal = dynamic(() => import('@/components/ui/PaywallModal'), { ssr: false })

function getMasteryBadge(mastery: number) {
  if (mastery >= 80) return { label: 'Mastered', color: 'text-primary', bg: 'bg-primary/10' }
  if (mastery >= 40) return { label: 'Learning', color: 'text-secondary', bg: 'bg-secondary/10' }
  return { label: 'New', color: 'text-on-surface-variant', bg: 'bg-surface-container-highest' }
}

const TYPE_ICON: Record<string, string> = { pdf: 'description', video: 'play_circle', slides: 'slideshow', code: 'code', other: 'article' }
const TYPE_COLOR: Record<string, string> = { pdf: 'text-primary', video: 'text-secondary', slides: 'text-tertiary', code: 'text-green-400', other: 'text-on-surface-variant' }

export default function LibraryPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showPaywall, setShowPaywall] = useState(false)
  const [textMode, setTextMode] = useState(false)
  const [pastedText, setPastedText] = useState('')
  const [pastedTitle, setPastedTitle] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: resourcesData, isLoading } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })

  const { data: subStatus, refetch: refetchSub } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => paymentsApi.getStatus().then(r => r.data),
    staleTime: 60000,
  })

  const resources = resourcesData?.results || []
  const filtered = resources.filter((r: any) =>
    !search ||
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    (r.subject || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const notesUsed = subStatus?.notes_used ?? 0
    const notesLimit = subStatus?.notes_limit ?? 5
    const isPremium = subStatus?.is_premium ?? false
    if (!isPremium && notesUsed >= notesLimit) { setShowPaywall(true); return }
    setUploading(true); setUploadProgress(0)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('title', file.name.replace(/\.[^/.]+$/, ''))
        await libraryApi.uploadResource(fd, (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        })
      }
      toast.success('Material uploaded! AI is processing…')
      queryClient.invalidateQueries({ queryKey: ['resources'] })
      refetchSub()
    } catch { toast.error('Upload failed. Please try again.') }
    finally { setUploading(false); setUploadProgress(0) }
  }, [subStatus, queryClient, refetchSub])

  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('title', pastedTitle || 'Pasted Text')
      fd.append('text_content', pastedText)
      await libraryApi.uploadResource(fd)
      toast.success('Text added to library!')
      queryClient.invalidateQueries({ queryKey: ['resources'] })
      setPastedText(''); setPastedTitle(''); setTextMode(false)
    } catch { toast.error('Failed to add text.') }
    finally { setUploading(false) }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFileUpload(e.dataTransfer.files)
  }, [handleFileUpload])

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-stack-md mb-stack-lg">
        <div>
          <h2 className="text-[32px] font-bold text-on-surface mb-base">My Library</h2>
          <p className="text-on-surface-variant text-[16px]">All your study materials in one place.</p>
        </div>
        <div className="relative w-full md:w-96">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            className="w-full bg-surface-container-high border border-outline-variant rounded-full py-4 pl-12 pr-stack-md text-on-surface text-[16px] focus:outline-none focus:border-secondary transition-all placeholder:text-on-surface-variant/60"
            placeholder="Search your materials..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Upload action buttons */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-stack-md mb-stack-lg">
        <div
          className="flex flex-col items-center justify-center p-stack-lg bg-surface-container-high rounded-[2rem] border-b-4 border-surface-container-highest btn-squishy cursor-pointer group"
          onClick={() => fileRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <div className="w-16 h-16 bg-primary-container text-on-primary-container rounded-full flex items-center justify-center mb-stack-sm shadow-lg group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>upload_file</span>
          </div>
          <span className="text-[18px] font-bold text-primary">Add File</span>
          <span className="text-[13px] text-on-surface-variant mt-1">PDF, Docs, Slides</span>
          {uploading && (
            <div className="mt-stack-sm w-full">
              <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="text-[11px] text-on-surface-variant text-center mt-1">{uploadProgress}%</p>
            </div>
          )}
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.pptx,.txt,.py,.js,.ts,.jpg,.jpeg,.png,.mp4" multiple onChange={e => handleFileUpload(e.target.files)} />
        </div>

        <button onClick={() => setTextMode(!textMode)} className="flex flex-col items-center justify-center p-stack-lg bg-surface-container-high rounded-[2rem] border-b-4 border-surface-container-highest btn-squishy group">
          <div className="w-16 h-16 bg-secondary-container text-on-secondary-container rounded-full flex items-center justify-center mb-stack-sm shadow-lg group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[32px]">edit_note</span>
          </div>
          <span className="text-[18px] font-bold text-secondary">Type Text</span>
          <span className="text-[13px] text-on-surface-variant mt-1">Notes &amp; Summaries</span>
        </button>

        <div className="flex flex-col items-center justify-center p-stack-lg bg-surface-container-high rounded-[2rem] border-b-4 border-surface-container-highest btn-squishy cursor-pointer group opacity-60">
          <div className="w-16 h-16 bg-tertiary-container text-on-tertiary-container rounded-full flex items-center justify-center mb-stack-sm shadow-lg group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
          </div>
          <span className="text-[18px] font-bold text-tertiary">Speak</span>
          <span className="text-[13px] text-on-surface-variant mt-1">Voice memos (coming soon)</span>
        </div>
      </section>

      {/* Text paste panel */}
      {textMode && (
        <div className="mb-stack-lg bg-surface-container-low rounded-[2rem] p-stack-md border border-outline-variant space-y-stack-sm">
          <h3 className="font-bold text-on-surface text-[18px]">Paste Your Text</h3>
          <input
            className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none focus:border-secondary transition-all"
            placeholder="Title (optional)"
            value={pastedTitle}
            onChange={e => setPastedTitle(e.target.value)}
          />
          <textarea
            className="w-full h-40 bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none focus:border-secondary transition-all resize-none"
            placeholder="Paste your study text here..."
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
          />
          <div className="flex gap-stack-sm">
            <button
              onClick={handlePasteSubmit}
              disabled={uploading}
              className="bg-primary text-on-primary font-bold px-stack-lg py-stack-sm rounded-[1rem] btn-3d hover:brightness-110 transition-all disabled:opacity-50"
            >
              {uploading ? 'Adding…' : 'Add to Library'}
            </button>
            <button onClick={() => setTextMode(false)} className="bg-surface-container-high text-on-surface-variant font-bold px-stack-md py-stack-sm rounded-[1rem] hover:bg-surface-container-highest transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Materials grid */}
      <section>
        <div className="flex items-center justify-between mb-stack-md">
          <h3 className="text-[16px] font-bold text-on-surface flex items-center gap-base">
            Recent Materials
            <span className="px-2 py-0.5 bg-surface-container-highest rounded-full text-[13px] font-bold text-primary">{resources.length} items</span>
          </h3>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-surface-container-low rounded-[1.5rem] p-stack-md border border-outline-variant/20 animate-pulse">
                <div className="w-10 h-10 bg-surface-container-high rounded-[1rem] mb-stack-sm" />
                <div className="h-5 bg-surface-container-high rounded w-3/4 mb-2" />
                <div className="h-4 bg-surface-container-high rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border-2 border-dashed border-outline-variant/30 rounded-[2rem] p-stack-lg text-center flex flex-col items-center gap-stack-md">
            <div className="w-20 h-20 bg-surface-container rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-[40px] text-on-surface-variant">menu_book</span>
            </div>
            <div>
              <p className="font-bold text-on-surface text-[18px] mb-base">{search ? 'No results found' : 'Library is empty'}</p>
              <p className="text-[14px] text-on-surface-variant mb-stack-md">
                {search ? 'Try a different search term.' : 'Upload your first material to unlock AI study tools.'}
              </p>
              {!search && (
                <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-base bg-primary text-on-primary text-[14px] font-bold px-stack-md py-2 rounded-[1rem] btn-3d hover:brightness-110 transition-all">
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Upload Now
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
            {/* Wide featured card for first item */}
            {filtered.slice(0, 1).map((r: any) => {
              const badge = getMasteryBadge(r.mastery ?? 0)
              return (
                <Link key={r.id} href={`/library/${r.id}`} className="md:col-span-2 bg-surface-container-high rounded-[1.5rem] border border-outline-variant overflow-hidden flex flex-col md:flex-row shadow-xl hover:border-primary/40 transition-all group">
                  <div className="w-full md:w-1/3 h-48 md:h-full relative bg-surface-container-highest flex items-center justify-center">
                    <span className={cn('material-symbols-outlined text-[64px]', TYPE_COLOR[r.resource_type] || TYPE_COLOR.other)} style={{ fontVariationSettings: "'FILL' 1" }}>
                      {TYPE_ICON[r.resource_type] || TYPE_ICON.other}
                    </span>
                    <div className="absolute bottom-3 left-3">
                      <span className="bg-primary text-on-primary text-[11px] font-bold px-3 py-1 rounded-full uppercase">Featured</span>
                    </div>
                  </div>
                  <div className="p-stack-md flex flex-col justify-center gap-base md:w-2/3">
                    <h4 className="text-[20px] font-bold text-on-surface group-hover:text-primary transition-colors">{r.title}</h4>
                    <p className="text-[14px] text-on-surface-variant line-clamp-2">{r.ai_summary || `${r.subject || r.resource_type} study material`}</p>
                    <div className="flex items-center gap-base">
                      <span className={cn('text-[12px] font-bold px-2 py-0.5 rounded-full', badge.color, badge.bg)}>{badge.label}</span>
                      {r.has_study_kit && <span className="text-[12px] font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Kit Ready</span>}
                    </div>
                    <button className="w-full bg-primary text-on-primary py-3 rounded-[1rem] font-bold btn-3d hover:brightness-110 transition-all text-[15px]">
                      Resume Study Path
                    </button>
                  </div>
                </Link>
              )
            })}

            {/* Regular cards */}
            {filtered.slice(1).map((r: any) => {
              const badge = getMasteryBadge(r.mastery ?? 0)
              return (
                <Link key={r.id} href={`/library/${r.id}`} className="bg-surface-container rounded-[1.5rem] p-stack-md border border-outline-variant hover:border-primary/40 transition-all flex flex-col gap-stack-sm group">
                  <div className="flex items-start justify-between">
                    <div className="p-3 bg-surface-container-high rounded-[1rem]">
                      <span className={cn('material-symbols-outlined text-[28px]', TYPE_COLOR[r.resource_type] || TYPE_COLOR.other)}>
                        {TYPE_ICON[r.resource_type] || TYPE_ICON.other}
                      </span>
                    </div>
                    <div className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold', badge.color, badge.bg)}>
                      <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      {badge.label}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[18px] font-bold text-on-surface mb-1 group-hover:text-primary transition-colors line-clamp-1">{r.title}</h4>
                    <p className="text-[13px] text-on-surface-variant line-clamp-2">{r.ai_summary || `${r.subject || r.resource_type} — tap to study`}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-[12px] text-on-surface-variant">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">more_vert</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {showPaywall && subStatus && (
        <PaywallModal
          onClose={() => setShowPaywall(false)}
          notesUsed={subStatus.notes_used}
          notesLimit={subStatus.notes_limit}
          onSuccess={() => { refetchSub(); setShowPaywall(false) }}
        />
      )}
    </div>
  )
}
