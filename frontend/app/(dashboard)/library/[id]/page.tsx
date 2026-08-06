'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { useStudyTimer } from '@/hooks/useStudyTimer'

const MusicGeneratorModal = dynamic(() => import('@/components/library/MusicGeneratorModal'), { ssr: false })
const ProcessingView = dynamic(() => import('@/components/library/ProcessingView'), { ssr: false })
const ConfirmationModal = dynamic(() => import('@/components/ui/ConfirmationModal'), { ssr: false })

const STUDY_TOOLS = [
  {
    id: 'study',
    name: 'Study Mode',
    desc: 'Guided reading with AI assistance.',
    icon: 'menu_book',
    color: 'text-primary',
    bg: 'bg-primary/15',
    href: (id: number) => `/library/${id}/study`,
  },
  {
    id: 'flashcards',
    name: 'Flashcards',
    desc: 'Auto-generate cards from your material.',
    icon: 'style',
    color: 'text-tertiary',
    bg: 'bg-tertiary/15',
    href: (id: number) => `/library/${id}/flashcards`,
  },
  {
    id: 'quiz',
    name: 'Quiz',
    desc: 'Test your knowledge with AI exam.',
    icon: 'quiz',
    color: 'text-secondary',
    bg: 'bg-secondary/15',
    href: (id: number) => `/library/${id}/quiz`,
  },
  {
    id: 'mindmap',
    name: 'Mind Map',
    desc: 'Visualise connections automatically.',
    icon: 'hub',
    color: 'text-secondary',
    bg: 'bg-secondary/15',
    href: (id: number) => `/library/${id}/mindmap`,
  },
  {
    id: 'podcast',
    name: 'Podcast',
    desc: 'Listen to an AI summary audio.',
    icon: 'podcasts',
    color: 'text-pink-400',
    bg: 'bg-pink-400/15',
    href: (id: number) => `/library/${id}/podcast`,
  },
  {
    id: 'examprep',
    name: 'Learning Techniques',
    desc: 'Feynman, Active Recall & voice AI.',
    icon: 'psychology',
    color: 'text-violet-400',
    bg: 'bg-violet-400/15',
    href: (id: number) => `/library/${id}/examprep`,
  },
  {
    id: 'practice',
    name: 'Practice',
    desc: 'Repetition drills for mastery.',
    icon: 'edit_note',
    color: 'text-green-400',
    bg: 'bg-green-400/15',
    href: (id: number) => `/library/${id}/practice`,
  },
  {
    id: 'solver',
    name: 'Solver',
    desc: 'Solve equations and problems.',
    icon: 'calculate',
    color: 'text-secondary',
    bg: 'bg-secondary/15',
    href: (id: number) => `/library/${id}/solver`,
  },
  {
    id: 'vr',
    name: 'VR',
    desc: '3D immersive learning mode.',
    icon: 'view_in_ar',
    color: 'text-tertiary',
    bg: 'bg-tertiary/15',
    href: (id: number) => `/library/${id}/vr`,
  },
]

export default function ResourcePage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const router = useRouter()
  const qc = useQueryClient()
  const [showMusic, setShowMusic] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  useStudyTimer(true)

  const { data: resource, isLoading } = useQuery({
    queryKey: ['resource', id],
    queryFn: () => libraryApi.getResource(id).then(r => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as any
      const isReady = (data?.status === 'ready' && data?.has_study_kit === true) || data?.status === 'failed'
      return isReady ? false : 4000
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => libraryApi.deleteResource(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      toast.success('Resource deleted.')
      router.push('/library')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || err.response?.data?.detail || 'Delete failed.')
    },
  })

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
        <p className="text-on-surface-variant text-sm">Loading resource…</p>
      </div>
    </div>
  )

  if (!resource) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <span className="material-symbols-outlined text-error text-[48px]">error</span>
      <p className="text-on-surface font-bold text-lg">Resource not found</p>
      <Link href="/library" className="text-primary hover:underline text-sm">← Back to Library</Link>
    </div>
  )

  const isProcessing = !resource.has_study_kit || resource.status === 'processing'
  const uploadDate = resource.created_at
    ? new Date(resource.created_at).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''
  const fileSize = resource.file_size
    ? resource.file_size < 1024 * 1024
      ? `${(resource.file_size / 1024).toFixed(1)} KB`
      : `${(resource.file_size / (1024 * 1024)).toFixed(1)} MB`
    : ''

  return (
    <div className="min-h-screen bg-background text-on-surface font-sans">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">

        {/* ── Breadcrumb ─────────────────────────────────────────── */}
        <nav className="flex items-center gap-2 text-[13px] text-on-surface-variant mb-6">
          <Link href="/library" className="hover:text-primary transition-colors">Library</Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-on-surface font-medium truncate max-w-xs">{resource.title}</span>
        </nav>

        {/* ── Resource Header ────────────────────────────────────── */}
        <div className="flex items-start gap-4 mb-8">
          {/* File type icon */}
          <div className="w-14 h-14 rounded-[1.25rem] bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <span
              className="material-symbols-outlined text-primary text-[28px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {resource.resource_type === 'video' ? 'play_circle' :
               resource.resource_type === 'slides' ? 'slideshow' :
               resource.resource_type === 'code' ? 'code' : 'description'}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Tags */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[12px] font-bold bg-surface-container-high text-on-surface-variant px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {resource.resource_type?.toUpperCase() || 'PDF'}
              </span>
              {resource.subject && (
                <span className="text-[12px] font-bold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
                  {resource.subject}
                </span>
              )}
            </div>

            <h1 className="text-[22px] sm:text-[28px] md:text-[32px] font-bold text-on-surface leading-tight mb-1">
              {resource.title}
            </h1>

            <p className="text-[13px] text-on-surface-variant">
              {uploadDate && `Uploaded on ${uploadDate}`}
              {fileSize && ` • ${fileSize}`}
            </p>
          </div>

          {/* Action buttons — icon only on mobile, full on desktop */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const newTitle = prompt('New title:', resource.title)
                if (newTitle && newTitle.trim() && newTitle !== resource.title) {
                  libraryApi.updateResource(id, { title: newTitle.trim() }).then(() => {
                    qc.invalidateQueries({ queryKey: ['resource', id] })
                    toast.success('Renamed!')
                  }).catch(() => toast.error('Rename failed.'))
                }
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 bg-surface-container-high border border-outline-variant rounded-[1rem] text-[13px] font-semibold text-on-surface hover:bg-surface-container-highest transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              <span className="hidden sm:inline">Rename</span>
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href)
                toast.success('Link copied!')
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 bg-surface-container-high border border-outline-variant rounded-[1rem] text-[13px] font-semibold text-on-surface hover:bg-surface-container-highest transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">share</span>
              <span className="hidden sm:inline">Share</span>
            </button>
            <button
              onClick={() => setShowConfirmDelete(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 bg-error-container/20 border border-error/30 rounded-[1rem] text-[13px] font-semibold text-error hover:bg-error-container/30 transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>

        {/* ── Main 2-column layout ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

          {/* LEFT: Preview ──────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="bg-surface-container rounded-[1.5rem] border border-outline-variant/30 overflow-hidden">
              {/* Preview label */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/20">
                <div className="flex items-center gap-2 text-[12px] text-on-surface-variant font-semibold uppercase tracking-widest">
                  <span className="material-symbols-outlined text-[16px]">preview</span>
                  {isProcessing ? 'Processing…' : resource.title}
                </div>
              </div>

              {/* Preview content */}
              <div className="h-[480px] overflow-hidden">
                {resource.resource_type === 'video' && resource.url ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${
                      resource.url.includes('v=')
                        ? resource.url.split('v=')[1]?.split('&')[0]
                        : resource.url.split('youtu.be/')[1]?.split('?')[0]
                    }`}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : isProcessing ? (
                  <div className="h-full">
                    <ProcessingView resource={resource} onDelete={() => setShowConfirmDelete(true)} />
                  </div>
                ) : (
                  <div className="h-full flex flex-col p-6 overflow-y-auto text-left space-y-4">
                    <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 p-3 rounded-2xl shrink-0">
                      <span className="material-symbols-outlined text-primary text-[24px] shrink-0">description</span>
                      <div className="text-[12px] text-on-surface-variant">
                        <span className="font-bold text-on-surface">Your AI study kit is ready!</span> Use the tools below to study, quiz, and master this material.
                      </div>
                    </div>
                    {resource.ai_summary && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-black text-primary uppercase tracking-wider">AI Summary</p>
                        <p className="text-[13px] text-on-surface leading-relaxed">{resource.ai_summary}</p>
                      </div>
                    )}
                    {resource.ai_notes_json?.sections?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-black text-primary uppercase tracking-wider">Study Notes Sections</p>
                        {resource.ai_notes_json.sections.map((sec: any, idx: number) => (
                          <div key={idx} className="bg-surface-container-high p-3 rounded-xl border border-outline-variant/20">
                            <p className="text-[13px] font-bold text-on-surface">{idx + 1}. {sec.title}</p>
                            {sec.plain_english && <p className="text-[12px] text-on-surface-variant mt-1 line-clamp-2">{sec.plain_english}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Start Study Session CTA */}
            <button
              onClick={() => router.push(`/library/${id}/study`)}
              className="w-full py-4 bg-primary-container text-on-primary-container font-bold text-[16px] rounded-[1.5rem] shadow-[0_6px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
              Start Study Session
            </button>
          </div>

          {/* RIGHT: AI Study Tools grid ─────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-primary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              <h2 className="text-[20px] font-bold text-on-surface">AI Study Tools</h2>
            </div>

            {isProcessing ? (
              <div className="bg-surface-container rounded-[1.5rem] border border-outline-variant/30 p-8 text-center">
                <div className="w-12 h-12 rounded-full border-2 border-primary-container border-t-transparent animate-spin mx-auto mb-4" />
                <p className="font-bold text-on-surface mb-1">Generating your study kit…</p>
                <p className="text-[13px] text-on-surface-variant">AI is processing your material. Tools will unlock shortly.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {STUDY_TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => router.push(tool.href(id))}
                    className="group flex flex-col items-center text-center p-4 bg-surface-container rounded-[1.5rem] border border-outline-variant/30 hover:border-outline-variant hover:bg-surface-container-high transition-all active:scale-95 gap-3"
                  >
                    {/* Icon */}
                    <div className={cn('w-12 h-12 rounded-[1rem] flex items-center justify-center transition-transform group-hover:scale-110', tool.bg)}>
                      <span
                        className={cn('material-symbols-outlined text-[26px]', tool.color)}
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        {tool.icon}
                      </span>
                    </div>

                    {/* Name */}
                    <div>
                      <p className="text-[13px] font-bold text-on-surface leading-tight mb-1">{tool.name}</p>
                      <p className="text-[11px] text-on-surface-variant leading-snug">{tool.desc}</p>
                    </div>

                    {/* Launch button */}
                    <span className="w-full mt-auto text-[12px] font-bold bg-surface-container-high text-on-surface-variant group-hover:bg-primary-container group-hover:text-on-primary-container rounded-[0.75rem] py-1.5 transition-all">
                      Launch
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Summary (if available) ──────────────────────────────── */}
      {resource.ai_summary && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 pb-12">
          <div className="bg-surface-container rounded-[1.5rem] border border-outline-variant/30 p-6 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>summarize</span>
              <h3 className="font-bold text-on-surface text-[15px]">AI Summary</h3>
            </div>
            <p className="text-[14px] text-on-surface-variant leading-relaxed">{resource.ai_summary}</p>
          </div>
        </div>
      )}

      {showMusic && <MusicGeneratorModal resourceId={id} onClose={() => setShowMusic(false)} />}

      {showConfirmDelete && (
        <ConfirmationModal
          isOpen={showConfirmDelete}
          title="Delete Resource"
          message={`Are you sure you want to delete "${resource.title}"? This cannot be undone.`}
          confirmText="Delete"
          type="danger"
          onConfirm={() => deleteMutation.mutate()}
          onClose={() => setShowConfirmDelete(false)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
