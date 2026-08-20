'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { learningApi, libraryApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import ConceptPanel from '@/components/learning/ConceptPanel'

export default function RoadmapPage({ params }: { params: { id: string } }) {
  const pathId = params.id
  const qc = useQueryClient()
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [selectedRes, setSelectedRes] = useState<number[]>([])

  const { data: path, isLoading } = useQuery({
    queryKey: ['learning-path', pathId],
    queryFn: () => learningApi.getPath(pathId).then(r => r.data),
  })

  const { data: roadmap } = useQuery({
    queryKey: ['roadmap', pathId],
    queryFn: () => learningApi.getRoadmap(pathId).then(r => r.data),
    enabled: !!path,
  })

  const { data: resources } = useQuery({
    queryKey: ['library'],
    queryFn: () => libraryApi.getResources().then(r => Array.isArray(r.data) ? r.data : r.data?.results || []),
  })

  const { data: analytics } = useQuery({
    queryKey: ['path-analytics', pathId],
    queryFn: () => learningApi.getAnalytics(pathId).then(r => r.data),
    enabled: !!path,
  })

  const generateMutation = useMutation({
    mutationFn: (resIds: number[]) => learningApi.generateConcepts(pathId, resIds),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['learning-path', pathId] })
      qc.invalidateQueries({ queryKey: ['roadmap', pathId] })
      setShowGenerate(false)
      toast.success(`Generated ${res.data.concept_count} concepts!`)
    },
    onError: () => toast.error('Failed to generate concepts'),
  })

  // Layout: arrange nodes in a winding path like Duolingo
  const layoutNodes = useMemo(() => {
    if (!roadmap?.nodes) return []
    const nodes = roadmap.nodes
    const COLS = 3
    return nodes.map((node: any, i: number) => {
      const row = Math.floor(i / COLS)
      const colInRow = i % COLS
      const isEvenRow = row % 2 === 0
      // Wind left-to-right on even rows, right-to-left on odd rows
      const col = isEvenRow ? colInRow : (COLS - 1 - colInRow)
      // Alternate vertical offset for visual variety
      const yOffset = (col % 2 === 0) ? 0 : 40
      return { ...node, row, col, x: col, y: row * 2 + (col % 2), yOffset }
    })
  }, [roadmap])

  const maxRow = layoutNodes.length > 0 ? Math.max(...layoutNodes.map((n: any) => n.y)) : 0

  const STATUS_STYLE: Record<string, { ring: string; bg: string; icon: string; glow: string }> = {
    locked:   { ring: 'border-slate-600', bg: 'bg-slate-800', icon: 'lock', glow: '' },
    current:  { ring: 'border-primary', bg: 'bg-primary/20', icon: 'play_arrow', glow: 'shadow-lg shadow-primary/30 animate-pulse' },
    completed:{ ring: 'border-emerald-500', bg: 'bg-emerald-500/20', icon: 'check_circle', glow: '' },
  }

  const DIFFICULTY_COLORS: Record<string, string> = {
    easy: 'text-emerald-400',
    medium: 'text-amber-400',
    hard: 'text-red-400',
  }

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-outline-variant/10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/learn" className="text-on-surface-variant hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined">arrow_back</span>
              </Link>
              <div>
                <h1 className="font-black text-lg leading-tight">{path?.title}</h1>
                <div className="flex items-center gap-2 text-[10px] text-on-surface-variant">
                  {path?.subject && <span>{path.subject}</span>}
                  {path?.start_date && path?.deadline && (
                    <span>{new Date(path.start_date).toLocaleDateString()} → {new Date(path.deadline).toLocaleDateString()}</span>
                  )}
                  {!path?.start_date && path?.deadline && (
                    <span>Due: {new Date(path.deadline).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {analytics && (
                <div className="hidden sm:flex items-center gap-3 text-[10px] mr-3">
                  <span className="text-on-surface-variant">{analytics.total_xp} XP</span>
                  <span className="text-on-surface-variant">{analytics.average_mastery}% mastery</span>
                  {analytics.reviews_due > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">
                      {analytics.reviews_due} due
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={() => setShowGenerate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20 transition-all"
              >
                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                Generate
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          {path && (
            <div className="mt-2">
              <div className="h-1.5 bg-surface-variant rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary via-secondary to-primary rounded-full transition-all duration-700"
                  style={{ width: `${path.mastery_percent}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-on-surface-variant mt-1">
                <span>{path.concepts_completed}/{path.total_concepts} concepts</span>
                <span>{path.mastery_percent}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setShowGenerate(false)}>
          <div className="bg-surface rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-black mb-2">Generate Concepts</h2>
            <p className="text-sm text-on-surface-variant mb-4">Select resources to extract concepts from</p>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {resources?.map((res: any) => (
                <label key={res.id} className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                  selectedRes.includes(res.id) ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:border-outline-variant/40'
                )}>
                  <input
                    type="checkbox"
                    checked={selectedRes.includes(res.id)}
                    onChange={e => setSelectedRes(prev => e.target.checked ? [...prev, res.id] : prev.filter(id => id !== res.id))}
                    className="accent-primary"
                  />
                  <div>
                    <p className="text-sm font-bold">{res.title}</p>
                    <p className="text-[10px] text-on-surface-variant">{res.ai_concepts?.length || 0} concepts</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowGenerate(false)} className="flex-1 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-bold">Cancel</button>
              <button
                onClick={() => generateMutation.mutate(selectedRes)}
                disabled={selectedRes.length === 0 || generateMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-50"
              >
                {generateMutation.isPending ? 'Generating…' : `Generate (${selectedRes.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duolingo-Style Roadmap */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {layoutNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant/30 mb-4">route</span>
            <h2 className="text-xl font-bold mb-2">No concepts yet</h2>
            <p className="text-sm text-on-surface-variant max-w-sm mb-6">
              Generate concepts from your study materials to build your learning roadmap.
            </p>
            <button onClick={() => setShowGenerate(true)} className="px-6 py-3 rounded-full bg-primary text-on-primary font-bold text-sm">
              Generate Concepts
            </button>
          </div>
        ) : (
          <div className="relative flex flex-col items-center gap-2">
            {/* Connection lines are done via CSS */}
            {Array.from({ length: Math.ceil(layoutNodes.length / 3) }).map((_, rowIdx) => {
              const rowNodes = layoutNodes.filter((n: any) => Math.floor(layoutNodes.indexOf(n) / 3) === rowIdx)
              const isEvenRow = rowIdx % 2 === 0
              return (
                <div key={rowIdx} className={cn('flex items-center gap-6 sm:gap-10', isEvenRow ? 'flex-row' : 'flex-row-reverse')}>
                  {rowNodes.map((node: any) => {
                    const style = STATUS_STYLE[node.status] || STATUS_STYLE.locked
                    return (
                      <button
                        key={node.id}
                        onClick={() => node.status !== 'locked' && setSelectedConcept(node.id)}
                        disabled={node.status === 'locked'}
                        className={cn(
                          'relative flex flex-col items-center gap-1 group',
                          node.status === 'locked' && 'opacity-40 cursor-not-allowed'
                        )}
                      >
                        {/* Node circle */}
                        <div className={cn(
                          'w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-3 flex items-center justify-center transition-all',
                          style.ring, style.bg, style.glow,
                          node.status !== 'locked' && 'hover:scale-110 cursor-pointer'
                        )}>
                          <span className={cn('material-symbols-outlined text-2xl sm:text-3xl', node.status === 'completed' ? 'text-emerald-400' : node.status === 'current' ? 'text-primary' : 'text-slate-500')}>
                            {style.icon}
                          </span>
                        </div>

                        {/* Mastery ring */}
                        {node.status === 'completed' && (
                          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[12px] text-white">check</span>
                          </div>
                        )}

                        {/* Label */}
                        <p className="text-[10px] sm:text-xs font-bold text-center max-w-[80px] sm:max-w-[100px] leading-tight mt-1 line-clamp-2">
                          {node.title}
                        </p>

                        {/* Meta */}
                        <div className="flex items-center gap-1.5 text-[8px] text-on-surface-variant">
                          <span className={DIFFICULTY_COLORS[node.difficulty] || 'text-amber-400'}>{node.difficulty}</span>
                          <span>·</span>
                          <span>{node.xp_earned}XP</span>
                        </div>

                        {/* Reviews due badge */}
                        {node.reviews_due > 0 && (
                          <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                            <span className="text-[8px] font-bold text-white">{node.reviews_due}</span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Concept Detail Panel */}
      {selectedConcept && (
        <ConceptPanel
          conceptId={selectedConcept}
          onClose={() => setSelectedConcept(null)}
          onComplete={() => {
            qc.invalidateQueries({ queryKey: ['learning-path', pathId] })
            qc.invalidateQueries({ queryKey: ['roadmap', pathId] })
            qc.invalidateQueries({ queryKey: ['path-analytics', pathId] })
            setSelectedConcept(null)
          }}
        />
      )}
    </div>
  )
}
