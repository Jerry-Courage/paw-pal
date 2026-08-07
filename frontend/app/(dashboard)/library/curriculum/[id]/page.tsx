'use client'

import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useMemo, useEffect } from 'react'
import { getSubjectById, SHS_YEAR_LABELS, getTopicKey } from '@/lib/curriculum'
import type { SHSYear } from '@/lib/curriculum'
import { cn } from '@/lib/utils'
import { ArrowLeft, ExternalLink, BookOpen, ChevronRight, X, Sparkles, CheckCircle, Loader2 } from 'lucide-react'

interface CurriculumResource {
  id: number
  title: string
  curriculum_topic_id: string
  status: string
  has_study_kit: boolean
}

export default function CurriculumSubjectPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const subjectId = params.id as string
  const subject = getSubjectById(subjectId)
  const initialYear = (searchParams.get('year') as SHSYear | null) || null
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState<SHSYear | 'all'>(initialYear || 'all')
  const [existingKits, setExistingKits] = useState<Record<string, CurriculumResource>>({})
  const [loadingKit, setLoadingKit] = useState<string | null>(null)

  // Fetch existing resources for this subject
  useEffect(() => {
    if (!subject) return
    const fetchKits = async () => {
      try {
        const res = await fetch(`/api/library/resources/?subject=${subjectId}&is_public=true&limit=200`)
        if (res.ok) {
          const data = await res.json()
          const kits: Record<string, CurriculumResource> = {}
          const resources = data.results || data || []
          for (const r of resources) {
            if (r.curriculum_topic_id) {
              const key = getTopicKey(subjectId, r.curriculum_topic_id)
              kits[key] = r
            }
          }
          setExistingKits(kits)
        }
      } catch (err) {
        console.error('Failed to fetch curriculum kits:', err)
      }
    }
    fetchKits()
  }, [subject, subjectId])

  const filteredTopics = useMemo(() => {
    if (!subject) return []
    return yearFilter === 'all' ? subject.topics : subject.topics.filter(t => t.year === yearFilter)
  }, [subject, yearFilter])

  if (!subject) {
    return (
      <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-6xl mx-auto">
        <div className="text-center py-20">
          <p className="text-on-surface-variant text-lg">Subject not found.</p>
          <Link href="/library" className="text-primary font-bold mt-4 inline-block hover:underline">Back to Library</Link>
        </div>
      </div>
    )
  }

  const activeTopicData = subject.topics.find(t => t.id === activeTopic)
  const activeTopicKey = activeTopic ? getTopicKey(subjectId, activeTopic) : null
  const activeKit = activeTopicKey ? existingKits[activeTopicKey] : null

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-stack-lg">
        <Link href="/library" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors mb-4 text-sm font-bold">
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={cn("w-14 h-14 rounded-2xl border flex items-center justify-center shrink-0", subject.color)}>
              <span className="material-symbols-outlined text-[28px]">{subject.icon}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-black text-on-surface">{subject.name}</h1>
                <span className="text-xs font-bold text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">{subject.code}</span>
              </div>
              <p className="text-on-surface-variant text-sm mt-0.5">{subject.description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Topics list */}
        <div className="lg:col-span-1 space-y-2">
          {/* Year filter tabs */}
          <div className="flex items-center gap-1 bg-surface-container rounded-full p-1 mb-3">
            {(['all', 'shs1', 'shs2', 'shs3'] as const).map((y) => (
              <button
                key={y}
                onClick={() => { setYearFilter(y); setActiveTopic(null) }}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded-full text-[11px] font-bold transition-all',
                  yearFilter === y
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                )}
              >
                {y === 'all' ? 'All' : SHS_YEAR_LABELS[y]}
              </button>
            ))}
          </div>

          <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 px-1">Topics ({filteredTopics.length})</h3>
          {filteredTopics.map((topic) => {
            const topicKey = getTopicKey(subjectId, topic.id)
            const kit = existingKits[topicKey]
            const hasKit = kit && (kit.has_study_kit || kit.status === 'ready')
            const isProcessing = kit && kit.status === 'processing'

            return (
              <button
                key={topic.id}
                onClick={() => setActiveTopic(activeTopic === topic.id ? null : topic.id)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border transition-all",
                  activeTopic === topic.id
                    ? "bg-primary/10 border-primary/30"
                    : "bg-surface-container border-outline-variant/30 hover:border-outline-variant"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm font-bold truncate", activeTopic === topic.id ? 'text-primary' : 'text-on-surface')}>
                        {topic.title}
                      </p>
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant shrink-0">
                        {SHS_YEAR_LABELS[topic.year]}
                      </span>
                      {hasKit && (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      )}
                      {isProcessing && (
                        <Loader2 className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-spin" />
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{topic.description}</p>
                  </div>
                  <ChevronRight className={cn("w-4 h-4 shrink-0 transition-transform", activeTopic === topic.id ? 'rotate-90 text-primary' : 'text-on-surface-variant')} />
                </div>
              </button>
            )
          })}
        </div>

        {/* Content viewer */}
        <div className="lg:col-span-2">
          {activeTopicData ? (
            <div className="bg-surface-container rounded-2xl border border-outline-variant/30 overflow-hidden">
              {/* Topic header */}
              <div className="flex items-center justify-between p-4 border-b border-outline-variant/20">
                <div>
                  <p className="text-sm font-bold text-on-surface">{activeTopicData.title}</p>
                  <p className="text-xs text-on-surface-variant">{subject.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {activeKit && (activeKit.has_study_kit || activeKit.status === 'ready') ? (
                    <Link
                      href={`/library/${activeKit.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-primary px-3 py-1.5 rounded-full hover:bg-primary/80 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" /> Open Kit
                    </Link>
                  ) : activeKit && activeKit.status === 'processing' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-500/10 px-3 py-1.5 rounded-full">
                      <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                    </span>
                  ) : activeTopicData.naccaUrl ? (
                    <a
                      href={activeTopicData.naccaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> NaCCA Source
                    </a>
                  ) : null}
                  <button
                    onClick={() => setActiveTopic(null)}
                    className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Embedded viewer or kit view */}
              <div className="relative bg-[#0a0a0c] min-h-[500px]">
                {activeKit && (activeKit.has_study_kit || activeKit.status === 'ready') ? (
                  <div className="flex flex-col items-center justify-center h-[500px] text-center px-8">
                    <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mb-4">
                      <Sparkles className="w-8 h-8 text-green-500" />
                    </div>
                    <p className="text-on-surface font-bold text-lg mb-1">Study Kit Ready</p>
                    <p className="text-sm text-on-surface-variant/60 mb-4">This topic has a generated study kit with notes, flashcards, and quizzes.</p>
                    <Link
                      href={`/library/${activeKit.id}`}
                      className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-full font-bold text-sm hover:bg-primary/80 transition-colors"
                    >
                      <Sparkles className="w-4 h-4" /> Open Study Kit
                    </Link>
                  </div>
                ) : activeKit && activeKit.status === 'processing' ? (
                  <div className="flex flex-col items-center justify-center h-[500px] text-center px-8">
                    <Loader2 className="w-12 h-12 text-amber-500 animate-spin mb-4" />
                    <p className="text-on-surface font-bold text-lg mb-1">Generating Study Kit</p>
                    <p className="text-sm text-on-surface-variant/60">This topic is being processed. Check back soon.</p>
                  </div>
                ) : activeTopicData.naccaUrl ? (
                  <iframe
                    src={activeTopicData.naccaUrl}
                    className="w-full h-[600px] border-0"
                    title={activeTopicData.title}
                    sandbox="allow-scripts allow-same-origin allow-forms"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-[500px] text-center px-8">
                    <BookOpen className="w-12 h-12 text-on-surface-variant/30 mb-4" />
                    <p className="text-on-surface-variant font-bold mb-1">Content coming soon</p>
                    <p className="text-sm text-on-surface-variant/60">This topic will be available once we pull in the NaCCA curriculum content.</p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="p-4 border-t border-outline-variant/20">
                <p className="text-sm text-on-surface-variant">{activeTopicData.description}</p>
              </div>
            </div>
          ) : (
            <div className="bg-surface-container rounded-2xl border border-dashed border-outline-variant/30 flex flex-col items-center justify-center min-h-[400px] text-center px-8">
              <BookOpen className="w-16 h-16 text-on-surface-variant/20 mb-4" />
              <p className="text-on-surface-variant font-bold text-lg mb-1">Select a topic</p>
              <p className="text-sm text-on-surface-variant/60 max-w-sm">Choose a topic from the left to view its curriculum content. Content is pulled directly from the NaCCA official syllabus.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
