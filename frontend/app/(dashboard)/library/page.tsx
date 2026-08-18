'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
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
  const [linkMode, setLinkMode] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: resourcesData, isLoading } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
    // Poll every 3s while any resource is still processing so the card
    // updates automatically without the user needing to refresh the page.
    refetchInterval: (data: any) => {
      const items = data?.results || (Array.isArray(data) ? data : [])
      const hasProcessing = items.some((r: any) =>
        r.status === 'processing' || r.status === 'generating' || r.status === 'vectorizing'
      )
      return hasProcessing ? 3000 : false
    },
  })

  const { data: subStatus, refetch: refetchSub } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => paymentsApi.getStatus().then(r => r.data),
    staleTime: 60000,
  })

  const resources = resourcesData?.results || []

  const progressQueries = useQueries({
    queries: resources.map((r: any) => ({
      queryKey: ['progress', r.id],
      queryFn: () => libraryApi.getProgress(r.id).then(res => res.data),
      staleTime: 30000,
      enabled: !!r.id,
    })),
  })

  const progressMap = new Map<number, any>()
  resources.forEach((r: any, i: number) => {
    if (progressQueries[i]?.data) progressMap.set(r.id, progressQueries[i].data)
  })

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
      toast.success("Upload successful! This will take a while to process. Check back in after a while — we will send you a reminder when your study kit is ready!", { duration: 6000 })
      queryClient.invalidateQueries({ queryKey: ['resources'] })
      refetchSub()
    } catch (err: any) {
      const status = err?.response?.status
      const data   = err?.response?.data
      if (status === 402 || data?.error === 'free_limit_reached') {
        setShowPaywall(true)
      } else if (status === 413 || data?.error?.toLowerCase?.()?.includes('too large')) {
        toast.error(data?.error || 'File is too large.')
      } else if (!status) {
        // No response — likely a network timeout after the upload already completed on the server
        // Refresh the list rather than showing a false error
        toast.info('Upload may have completed — refreshing your library…')
        queryClient.invalidateQueries({ queryKey: ['resources'] })
      } else {
        toast.error(data?.error || data?.detail || 'Upload failed. Please try again.')
      }
    }
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

  const handleLinkSubmit = async () => {
    if (!linkUrl.trim()) return
    const notesUsed = subStatus?.notes_used ?? 0
    const notesLimit = subStatus?.notes_limit ?? 5
    const isPremium = subStatus?.is_premium ?? false
    if (!isPremium && notesUsed >= notesLimit) { setShowPaywall(true); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('url', linkUrl.trim())
      fd.append('title', linkUrl.trim())
      await libraryApi.uploadResource(fd)
      toast.success("Link added! Generating study kit — we'll notify you when it's ready.", { duration: 6000 })
      queryClient.invalidateQueries({ queryKey: ['resources'] })
      refetchSub()
      setLinkUrl(''); setLinkMode(false)
    } catch (err: any) {
      const status = err?.response?.status
      const data = err?.response?.data
      if (status === 402 || data?.error === 'free_limit_reached') {
        setShowPaywall(true)
      } else {
        toast.error(data?.error || data?.detail || 'Failed to add link.')
      }
    }
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
      <section className="grid grid-cols-2 md:grid-cols-4 gap-stack-md mb-stack-lg">
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

        <button onClick={() => { setLinkMode(!linkMode); setTextMode(false) }} className="flex flex-col items-center justify-center p-stack-lg bg-surface-container-high rounded-[2rem] border-b-4 border-surface-container-highest btn-squishy group">
          <div className="w-16 h-16 bg-tertiary-container text-on-tertiary-container rounded-full flex items-center justify-center mb-stack-sm shadow-lg group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>link</span>
          </div>
          <span className="text-[18px] font-bold text-tertiary">Paste Link</span>
          <span className="text-[13px] text-on-surface-variant mt-1">YouTube &amp; Web Articles</span>
        </button>

        <div className="flex flex-col items-center justify-center p-stack-lg bg-surface-container-high rounded-[2rem] border-b-4 border-surface-container-highest btn-squishy cursor-pointer group opacity-50">
          <div className="w-16 h-16 bg-surface-container-highest text-on-surface-variant rounded-full flex items-center justify-center mb-stack-sm shadow-lg group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[32px]">mic</span>
          </div>
          <span className="text-[18px] font-bold text-on-surface-variant">Speak</span>
          <span className="text-[13px] text-on-surface-variant mt-1">Voice memos (soon)</span>
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

      {/* Link paste panel */}
      {linkMode && (
        <div className="mb-stack-lg bg-surface-container-low rounded-[2rem] p-stack-md border border-tertiary/20 space-y-stack-sm">
          <div className="flex items-center gap-base">
            <span className="material-symbols-outlined text-tertiary text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>link</span>
            <h3 className="font-bold text-on-surface text-[18px]">Paste a Link</h3>
          </div>
          <p className="text-[13px] text-on-surface-variant">
            Paste a YouTube video URL or any web article link. We'll extract the content and generate a study kit.
          </p>
          <input
            className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none focus:border-tertiary transition-all"
            placeholder="https://youtube.com/watch?v=... or https://example.com/article"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleLinkSubmit() }}
          />
          <div className="flex gap-stack-sm">
            <button
              onClick={handleLinkSubmit}
              disabled={uploading || !linkUrl.trim()}
              className="bg-tertiary text-on-tertiary font-bold px-stack-lg py-stack-sm rounded-[1rem] btn-3d hover:brightness-110 transition-all disabled:opacity-50"
            >
              {uploading ? 'Adding…' : 'Generate Study Kit'}
            </button>
            <button onClick={() => { setLinkMode(false); setLinkUrl('') }} className="bg-surface-container-high text-on-surface-variant font-bold px-stack-md py-stack-sm rounded-[1rem] hover:bg-surface-container-highest transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Materials grid */}
      <section>
        <div className="flex items-center justify-between mb-stack-md">
          <h3 className="text-[16px] font-bold text-on-surface flex items-center gap-2">
            Recent Materials
            {resources.length > 0 && (
              <span className="px-2 py-0.5 bg-surface-container-highest rounded-full text-[12px] font-bold text-on-surface-variant">
                {resources.length} {resources.length === 1 ? 'item' : 'items'}
              </span>
            )}
          </h3>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-surface-container rounded-[1.5rem] p-5 border border-outline-variant/20 animate-pulse">
                <div className="w-10 h-10 bg-surface-container-high rounded-[1rem] mb-4" />
                <div className="h-4 bg-surface-container-high rounded w-3/4 mb-2" />
                <div className="h-3 bg-surface-container-high rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border-2 border-dashed border-outline-variant/30 rounded-[2rem] py-16 text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-[36px] text-on-surface-variant/40">menu_book</span>
            </div>
            <div>
              <p className="font-bold text-on-surface text-[16px] mb-1">{search ? 'No results found' : 'Library is empty'}</p>
              <p className="text-[13px] text-on-surface-variant">
                {search ? 'Try a different search term.' : 'Upload your first material to unlock AI study tools.'}
              </p>
            </div>
            {!search && (
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 bg-primary-container text-on-primary-container text-[14px] font-bold px-5 py-2.5 rounded-full shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                Upload Now
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((r: any) => {
              const progress = progressMap.get(r.id)
              const mastery = progress?.mastery ?? 0
              const badge = getMasteryBadge(mastery)
              const typeIcon = TYPE_ICON[r.resource_type] || TYPE_ICON.other
              const typeColor = TYPE_COLOR[r.resource_type] || TYPE_COLOR.other
              const date = r.created_at
                ? new Date(r.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
                : ''

              return (
                <Link
                  key={r.id}
                  href={`/library/${r.id}`}
                  className="group flex flex-col bg-surface-container rounded-[1.5rem] border border-outline-variant/30 hover:border-outline-variant hover:bg-surface-container-high transition-all overflow-hidden"
                >
                  {/* Top color band with icon */}
                  <div className="relative h-28 bg-surface-container-high flex items-center justify-center border-b border-outline-variant/20">
                    <span
                      className={cn('material-symbols-outlined text-[52px] opacity-60 group-hover:opacity-90 transition-opacity', typeColor)}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {typeIcon}
                    </span>
                    {/* Status badge top-right */}
                    {r.has_study_kit && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 bg-green-500/15 text-green-400 border border-green-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        Kit Ready
                      </div>
                    )}
                    {!r.has_study_kit && r.status === 'processing' && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 bg-secondary/15 text-secondary border border-secondary/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        <span className="material-symbols-outlined text-[12px] animate-spin">autorenew</span>
                        Processing
                      </div>
                    )}
                    {!r.has_study_kit && r.status === 'failed' && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 bg-error/15 text-error border border-error/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        <span className="material-symbols-outlined text-[12px]">error</span>
                        Failed
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    {/* Type label */}
                    <span className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">
                      {r.resource_type || 'Document'}
                    </span>

                    {/* Title */}
                    <h4 className="text-[15px] font-bold text-on-surface group-hover:text-primary transition-colors leading-snug line-clamp-2">
                      {r.title}
                    </h4>

                    {/* Summary */}
                    {r.ai_summary && (
                      <p className="text-[12px] text-on-surface-variant line-clamp-2 leading-relaxed">
                        {r.ai_summary}
                      </p>
                    )}
                    {/* Processing status text */}
                    {!r.has_study_kit && r.status === 'processing' && r.status_text && (
                      <p className="text-[11px] text-secondary/80 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px] animate-spin">autorenew</span>
                        {r.status_text}
                      </p>
                    )}
                    {/* Failed state — reprocess button */}
                    {r.status === 'failed' && !r.has_study_kit && (
                      <button
                        onClick={async (e) => {
                          e.preventDefault()
                          try {
                            await libraryApi.reprocessResource(r.id)
                            toast.success('Reprocessing started!')
                            queryClient.invalidateQueries({ queryKey: ['resources'] })
                          } catch { toast.error('Could not start reprocessing.') }
                        }}
                        className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                      >
                        <span className="material-symbols-outlined text-[12px]">refresh</span>
                        Reprocess
                      </button>
                    )}

                    {/* Footer */}
                    <div className="mt-auto pt-2 flex items-center justify-between">
                      {/* Mastery */}
                      <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', badge.color, badge.bg)}>
                        {badge.label}
                      </span>
                      {/* Date */}
                      {date && (
                        <span className="text-[11px] text-on-surface-variant/50">{date}</span>
                      )}
                    </div>
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
