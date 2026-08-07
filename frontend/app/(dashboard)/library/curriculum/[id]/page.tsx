'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { getSubjectById } from '@/lib/curriculum'
import { cn } from '@/lib/utils'
import { ArrowLeft, ExternalLink, BookOpen, ChevronRight, X } from 'lucide-react'

export default function CurriculumSubjectPage() {
  const params = useParams()
  const subjectId = params.id as string
  const subject = getSubjectById(subjectId)
  const [activeTopic, setActiveTopic] = useState<string | null>(null)

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
          <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 px-1">Topics ({subject.topics.length})</h3>
          {subject.topics.map((topic) => (
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
                  <p className={cn("text-sm font-bold truncate", activeTopic === topic.id ? 'text-primary' : 'text-on-surface')}>
                    {topic.title}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{topic.description}</p>
                </div>
                <ChevronRight className={cn("w-4 h-4 shrink-0 transition-transform", activeTopic === topic.id ? 'rotate-90 text-primary' : 'text-on-surface-variant')} />
              </div>
            </button>
          ))}
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
                  {activeTopicData.naccaUrl && (
                    <a
                      href={activeTopicData.naccaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> NaCCA Source
                    </a>
                  )}
                  <button
                    onClick={() => setActiveTopic(null)}
                    className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Embedded viewer */}
              <div className="relative bg-[#0a0a0c] min-h-[500px]">
                {activeTopicData.naccaUrl ? (
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
