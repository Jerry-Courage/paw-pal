'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import {
  ArrowLeft, Brain, FileText, Map, HelpCircle, Play,
  BookOpen, Sparkles, ChevronDown, ExternalLink, Search
} from 'lucide-react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'
import RichNotesRenderer from '@/components/library/RichNotesRenderer'
import PracticeTest from '@/components/library/PracticeTest'

const CATS = [
  { key: 'flashcards', label: 'Flashcards', icon: BookOpen, color: 'bg-sky-50 dark:bg-sky-950 text-sky-500', border: 'border-sky-400' },
  { key: 'concepts', label: 'Key Concepts', icon: Brain, color: 'bg-violet-50 dark:bg-violet-950 text-violet-500', border: 'border-violet-400' },
  { key: 'study_notes', label: 'Study Notes', icon: FileText, color: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-500', border: 'border-emerald-400' },
  { key: 'mind_map', label: 'Mind Maps', icon: Map, color: 'bg-orange-50 dark:bg-orange-950 text-orange-500', border: 'border-orange-400' },
  { key: 'practice_questions', label: 'Practice', icon: HelpCircle, color: 'bg-pink-50 dark:bg-pink-950 text-pink-500', border: 'border-pink-400' },
  { key: 'chapters', label: 'Chapters', icon: Play, color: 'bg-amber-50 dark:bg-amber-950 text-amber-500', border: 'border-amber-400' },
] as const

type CatKey = typeof CATS[number]['key']

export default function SavesPage() {
  const [cat, setCat] = useState<CatKey>('flashcards')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const { data: resData, isLoading } = useQuery({
    queryKey: ['resources-all'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })
  const { data: fcData } = useQuery({
    queryKey: ['flashcards'],
    queryFn: () => libraryApi.getFlashcards().then(r => r.data),
  })

  const resources: any[] = resData?.results || []
  const flashcards: any[] = fcData?.results || []

  const getCount = (key: CatKey) => {
    if (key === 'flashcards') return flashcards.length
    return resources.filter(r => (r.ai_concepts || []).some((c: any) => key in c)).length
  }

  const getItems = (key: CatKey) => {
    if (key === 'flashcards') return []
    return resources
      .map(r => { const m = (r.ai_concepts || []).find((c: any) => key in c); return m ? { resource: r, content: m[key] } : null })
      .filter(Boolean)
  }

  const activeCat = CATS.find(c => c.key === cat)!
  const allItems = getItems(cat)
  const items = search
    ? allItems.filter((item: any) => item.resource.title.toLowerCase().includes(search.toLowerCase()))
    : allItems

  const filteredFlashcards = search
    ? flashcards.filter(fc => fc.question.toLowerCase().includes(search.toLowerCase()) || fc.answer.toLowerCase().includes(search.toLowerCase()))
    : flashcards

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Link href="/library" className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-sky-500 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Library
          </Link>
          <span className="text-gray-300 dark:text-gray-700">/</span>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">My Saves</h1>
        </div>
        <div className="sm:ml-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setExpanded(null) }}
            placeholder="Search saves..."
            className="input pl-9 w-full sm:w-52 text-sm"
          />
        </div>
      </div>

      {/* Category pills — horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-5">
        {CATS.map(c => {
          const count = getCount(c.key)
          return (
            <button
              key={c.key}
              onClick={() => { setCat(c.key); setExpanded(null) }}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 border',
                cat === c.key
                  ? 'bg-sky-500 text-white border-sky-500 shadow-sm shadow-sky-200 dark:shadow-sky-900'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              )}
            >
              <div className={cn('w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0', cat === c.key ? 'bg-white/20' : c.color)}>
                <c.icon className="w-3 h-3" />
              </div>
              {c.label}
              {count > 0 && (
                <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium min-w-[20px] text-center',
                  cat === c.key ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content area */}
      {cat === 'flashcards' ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filteredFlashcards.length} {filteredFlashcards.length === 1 ? 'card' : 'cards'}
            </p>
            {filteredFlashcards.length > 0 && (
              <Link href="/library/flashcards" className="btn-primary text-sm">Review All →</Link>
            )}
          </div>
          {filteredFlashcards.length === 0 ? (
            <Empty label="No flashcards yet" sub="Generate flashcards from any resource in your library" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredFlashcards.map((fc: any) => (
                <div key={fc.id} className="card p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug flex-1">{fc.question}</p>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium', {
                      'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400': fc.difficulty === 'hard',
                      'bg-yellow-100 dark:bg-yellow-950 text-yellow-600 dark:text-yellow-400': fc.difficulty === 'medium',
                      'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400': fc.difficulty === 'easy',
                    })}>{fc.difficulty}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{fc.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {items.length} {items.length === 1 ? 'resource' : 'resources'} with saved {activeCat.label.toLowerCase()}
          </p>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <Empty
              label={`No ${activeCat.label.toLowerCase()} saved yet`}
              sub={`Open a resource, generate ${activeCat.label.toLowerCase()}, then click "Save to My Saves"`}
            />
          ) : (
            <div className="space-y-3">
              {items.map((item: any, idx: number) => (
                <div key={idx} className={cn('card overflow-hidden border-l-4', activeCat.border)}>
                  <button
                    onClick={() => setExpanded(expanded === idx ? null : idx)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                  >
                    <span className="text-xl flex-shrink-0">
                      {item.resource.resource_type === 'pdf' ? '📄' : item.resource.resource_type === 'video' ? '🎥' : '💻'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-white truncate">{item.resource.title}</div>
                      {item.resource.subject && <div className="text-xs text-gray-400 mt-0.5">{item.resource.subject}</div>}
                    </div>
                    <Link
                      href={`/library/${item.resource.id}`}
                      onClick={e => e.stopPropagation()}
                      className="hidden sm:flex items-center gap-1 text-xs text-sky-500 hover:underline flex-shrink-0 mr-2"
                    >
                      <ExternalLink className="w-3 h-3" /> Open
                    </Link>
                    <ChevronDown className={cn('w-4 h-4 text-gray-400 flex-shrink-0 transition-transform', expanded === idx && 'rotate-180')} />
                  </button>
                  {expanded === idx && (
                    <div className="border-t border-gray-100 dark:border-gray-800 p-4">
                      <div className="flex items-center justify-between mb-3 sm:hidden">
                        <Link href={`/library/${item.resource.id}`} className="flex items-center gap-1 text-xs text-sky-500 hover:underline">
                          <ExternalLink className="w-3 h-3" /> Open resource
                        </Link>
                      </div>
                      <SavedContent catKey={cat} content={item.content} resourceId={item.resource.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Empty({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="card p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
        <Sparkles className="w-6 h-6 text-gray-300 dark:text-gray-600" />
      </div>
      <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-5 max-w-xs mx-auto">{sub}</p>
      <Link href="/library" className="btn-primary text-sm">Go to Library</Link>
    </div>
  )
}

function SavedContent({ catKey, content, resourceId }: any) {
  if (catKey === 'concepts' && Array.isArray(content)) return (
    <div className="space-y-2">
      {content.map((c: any, i: number) => (
        <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{c.concept}</span>
            <span className={cn('text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium', {
              'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400': c.importance === 'high',
              'bg-yellow-100 dark:bg-yellow-950 text-yellow-600 dark:text-yellow-400': c.importance === 'medium',
              'bg-gray-100 dark:bg-gray-700 text-gray-500': c.importance === 'low',
            })}>{c.importance}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{c.definition}</p>
        </div>
      ))}
    </div>
  )

  if (catKey === 'study_notes' && typeof content === 'string') return (
    <div className="py-1">
      <RichNotesRenderer data={content} />
    </div>
  )

  if (catKey === 'mind_map' && content?.center) return (
    <div>
      <div className="flex justify-center mb-4">
        <span className="bg-sky-500 text-white rounded-2xl px-5 py-2 font-bold text-sm shadow-lg shadow-sky-200 dark:shadow-sky-900">{content.center}</span>
      </div>
      <div className="space-y-2">
        {content.branches?.map((b: any, i: number) => (
          <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border-l-4 border-sky-400">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">{b.topic}</div>
            <div className="flex flex-wrap gap-1.5">
              {b.subtopics?.map((s: string, j: number) => (
                <span key={j} className="text-xs bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-600">{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (catKey === 'practice_questions' && Array.isArray(content)) return (
    <PracticeTest
      questions={content}
      resourceId={resourceId}
      isSaved={true}
    />
  )

  if (catKey === 'chapters' && Array.isArray(content)) return (
    <div className="space-y-2">
      {content.map((ch: any, i: number) => (
        <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="w-6 h-6 bg-sky-100 dark:bg-sky-900 rounded-lg flex items-center justify-center text-xs font-bold text-sky-600 dark:text-sky-400 flex-shrink-0">{ch.chapter}</span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-1">{ch.title}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">{ch.start_time_estimate}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed ml-8">{ch.summary}</p>
        </div>
      ))}
    </div>
  )

  return <p className="text-sm text-gray-400">No content.</p>
}
