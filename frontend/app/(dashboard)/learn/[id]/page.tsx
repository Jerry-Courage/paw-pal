'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { learningApi, libraryApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import ConceptPanel from '@/components/learning/ConceptPanel'
import FlowMascot from '@/components/learning/FlowMascot'

export default function RoadmapPage({ params }: { params: { id: string } }) {
  const pathId = params.id
  const qc = useQueryClient()
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [selectedRes, setSelectedRes] = useState<number[]>([])
  const [justCompleted, setJustCompleted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLDivElement>(null)

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

  // Scroll to current concept on load
  useEffect(() => {
    if (currentRef.current) {
      setTimeout(() => {
        currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
    }
  }, [roadmap])

  const nodes = roadmap?.nodes || []
  const currentNodeIdx = nodes.findIndex((n: any) => n.status === 'current')
  const currentNode = currentNodeIdx >= 0 ? nodes[currentNodeIdx] : null

  // Mascot mood based on state
  const mascotMood = useMemo(() => {
    if (justCompleted) return 'celebrating'
    if (!currentNode) return 'idle'
    return 'idle'
  }, [justCompleted, currentNode])

  // Build winding path positions
  const pathLayout = useMemo(() => {
    if (nodes.length === 0) return []

    // Create a winding path: left-center-right-center-left pattern
    const positions = [
      { x: 50, side: 'center' },   // 0: center
      { x: 25, side: 'left' },     // 1: left
      { x: 75, side: 'right' },    // 2: right
      { x: 50, side: 'center' },   // 3: center
      { x: 25, side: 'left' },     // 4: left
      { x: 75, side: 'right' },    // 5: right
      { x: 50, side: 'center' },   // 6: center
      { x: 25, side: 'left' },     // 7: left
      { x: 75, side: 'right' },    // 8: right
      { x: 50, side: 'center' },   // 9: center
    ]

    return nodes.map((node: any, i: number) => {
      const pos = positions[i % positions.length]
      const isEven = pos.side === 'left' || (pos.side === 'center' && i % 4 < 2)
      return {
        ...node,
        x: pos.x,
        y: i * 110 + 140,
        side: pos.side,
        isLeft: pos.side === 'left',
      }
    })
  }, [nodes])

  const totalHeight = pathLayout.length > 0 ? pathLayout[pathLayout.length - 1].y + 120 : 400

  const DIFFICULTY_COLORS: Record<string, string> = {
    easy: '#22c55e',
    medium: '#f59e0b',
    hard: '#ef4444',
  }

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <FlowMascot mood="thinking" size={100} />
        <p className="text-on-surface-variant text-sm">Loading your roadmap...</p>
      </div>
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
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">
                    <span className="material-symbols-outlined text-[12px]">bolt</span>
                    {analytics.total_xp} XP
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold">
                    <span className="material-symbols-outlined text-[12px]">local_fire_department</span>
                    {analytics.average_mastery}%
                  </span>
                  {analytics.reviews_due > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold animate-pulse">
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
              <div className="h-2 bg-surface-variant rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-primary via-amber-400 to-primary rounded-full transition-all duration-700 relative"
                  style={{ width: `${path.mastery_percent}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shine" />
                </div>
              </div>
              <div className="flex justify-between text-[9px] text-on-surface-variant mt-1">
                <span>{path.concepts_completed}/{path.total_concepts} concepts</span>
                <span className="font-bold text-primary">{path.mastery_percent}%</span>
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
                    <p className="text-[10px] text-on-surface-variant">{(res.ai_concepts || []).filter((c: any) => c.title || c.name).length || (res.ai_notes_json?.sections?.length || 0)} concepts</p>
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

      {/* Duolingo-Style Winding Path */}
      <div className="max-w-4xl mx-auto px-4 py-6 pt-8 overflow-hidden" ref={scrollRef}>
        {pathLayout.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FlowMascot mood="thinking" size={140} />
            <h2 className="text-xl font-black mt-6 mb-2">Your roadmap awaits!</h2>
            <p className="text-sm text-on-surface-variant max-w-sm mb-6">
              Generate concepts from your study materials to build a personalized learning path.
            </p>
            <button
              onClick={() => setShowGenerate(true)}
              className="px-6 py-3 rounded-full bg-gradient-to-r from-primary to-amber-500 text-white font-bold text-sm shadow-lg shadow-primary/30 hover:scale-105 transition-transform"
            >
              <span className="material-symbols-outlined text-[16px] mr-1.5 align-middle">auto_awesome</span>
              Generate Concepts
            </button>
          </div>
        ) : (
          <div className="relative" style={{ minHeight: totalHeight + 60 }}>
            {/* Path line SVG */}
            <svg
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              viewBox={`0 0 100 ${totalHeight}`}
              preserveAspectRatio="none"
              style={{ zIndex: 0 }}
            >
              <defs>
                <linearGradient id="pathGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#FF8C42" stopOpacity="0.3" />
                  <stop offset={`${(currentNodeIdx / Math.max(nodes.length - 1, 1)) * 100}%`} stopColor="#FF8C42" stopOpacity="0.6" />
                  <stop offset={`${(currentNodeIdx / Math.max(nodes.length - 1, 1)) * 100 + 5}%`} stopColor="#4A3728" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#4A3728" stopOpacity="0.1" />
                </linearGradient>
              </defs>
              <path
                d={pathLayout.map((n: any, i: number) => {
                  const prev = pathLayout[i - 1]
                  if (!prev) return `M ${n.x} ${n.y}`
                  const cpx1 = prev.x
                  const cpy1 = prev.y + 40
                  const cpx2 = n.x
                  const cpy2 = n.y - 40
                  return `C ${cpx1} ${cpy1} ${cpx2} ${cpy2} ${n.x} ${n.y}`
                }).join(' ')}
                fill="none"
                stroke="url(#pathGradient)"
                strokeWidth="0.8"
                strokeDasharray="3 2"
              />
            </svg>

            {/* Nodes */}
            {pathLayout.map((node: any, i: number) => {
              const isCurrent = node.status === 'current'
              const isCompleted = node.status === 'completed'
              const isLocked = node.status === 'locked'
              const isLeft = node.isLeft

              return (
                <div
                  key={node.id}
                  ref={isCurrent ? currentRef : undefined}
                  className="absolute"
                  style={{
                    left: `${node.x}%`,
                    top: node.y,
                    transform: 'translate(-50%, -50%)',
                    zIndex: isCurrent ? 20 : 10,
                  }}
                >
                  {/* Mascot on current node */}
                  {isCurrent && (
                    <div className="absolute -top-[100px] left-1/2 -translate-x-1/2 z-30">
                      <FlowMascot mood={mascotMood} size={80} />
                    </div>
                  )}

                  {/* Connection dot to path */}
                  <div className={cn(
                    'absolute left-1/2 -translate-x-1/2 w-1 h-6',
                    isCompleted ? 'bg-emerald-500/40' : isCurrent ? 'bg-primary/40' : 'bg-slate-700/30',
                    isLeft ? 'bottom-full' : 'top-full'
                  )} />

                  {/* Main node */}
                  <button
                    onClick={() => !isLocked && setSelectedConcept(node.id)}
                    disabled={isLocked}
                    className={cn(
                      'relative flex flex-col items-center gap-1.5 group transition-all duration-300',
                      isLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                      isCurrent && 'scale-110'
                    )}
                  >
                    {/* Glow ring for current */}
                    {isCurrent && (
                      <div className="absolute -inset-3 rounded-full bg-primary/20 animate-pulse" />
                    )}

                    {/* Node circle */}
                    <div className={cn(
                      'relative w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] rounded-full border-4 flex items-center justify-center transition-all duration-300',
                      isCompleted && 'border-emerald-500 bg-emerald-500/15',
                      isCurrent && 'border-primary bg-primary/15 shadow-xl shadow-primary/30',
                      isLocked && 'border-slate-700 bg-slate-800/50',
                      !isLocked && 'group-hover:scale-110 group-hover:shadow-lg'
                    )}>
                      {/* Difficulty ring */}
                      <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <circle
                          cx="50%" cy="50%" r="46%"
                          fill="none"
                          stroke={DIFFICULTY_COLORS[node.difficulty] || '#f59e0b'}
                          strokeWidth="2"
                          strokeDasharray={`${(node.mastery / 100) * 283} 283`}
                          opacity="0.5"
                        />
                      </svg>

                      {/* Icon */}
                      <span className={cn(
                        'material-symbols-outlined text-2xl sm:text-3xl',
                        isCompleted && 'text-emerald-400',
                        isCurrent && 'text-primary',
                        isLocked && 'text-slate-600'
                      )}>
                        {isCompleted ? 'check_circle' : isCurrent ? 'play_arrow' : 'lock'}
                      </span>

                      {/* XP badge */}
                      {node.xp_earned > 0 && (
                        <div className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[8px] font-black shadow-lg">
                          +{node.xp_earned}
                        </div>
                      )}

                      {/* Review due badge */}
                      {node.reviews_due > 0 && (
                        <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center animate-bounce">
                          <span className="text-[8px] font-bold text-white">{node.reviews_due}</span>
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <div className={cn(
                      'text-center max-w-[100px] sm:max-w-[120px]',
                      isLeft ? 'text-right' : 'text-left'
                    )}>
                      <p className={cn(
                        'text-[10px] sm:text-xs font-bold leading-tight line-clamp-2',
                        isCompleted && 'text-emerald-400',
                        isCurrent && 'text-primary',
                        isLocked && 'text-slate-600'
                      )}>
                        {node.title}
                      </p>
                      <div className="flex items-center gap-1 text-[8px] text-on-surface-variant mt-0.5"
                        style={{ justifyContent: isLeft ? 'flex-end' : 'flex-start' }}
                      >
                        <span style={{ color: DIFFICULTY_COLORS[node.difficulty] }}>{node.difficulty}</span>
                        <span>·</span>
                        <span>{node.estimated_minutes}m</span>
                      </div>
                    </div>

                    {/* Step number */}
                    <div className={cn(
                      'absolute w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black',
                      isCompleted ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-primary text-white' : 'bg-slate-700 text-slate-400',
                      isLeft ? '-right-2' : '-left-2',
                      'top-0'
                    )}>
                      {i + 1}
                    </div>
                  </button>
                </div>
              )
            })}

            {/* Bottom mascot */}
            {nodes.length > 0 && (
              <div className="absolute left-1/2 -translate-x-1/2" style={{ top: totalHeight - 40 }}>
                <FlowMascot
                  mood={path?.mastery_percent >= 100 ? 'celebrating' : path?.mastery_percent >= 50 ? 'happy' : 'idle'}
                  size={60}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Concept Detail Panel */}
      {selectedConcept && (
        <ConceptPanel
          conceptId={selectedConcept}
          onClose={() => setSelectedConcept(null)}
          onComplete={() => {
            setJustCompleted(true)
            qc.invalidateQueries({ queryKey: ['learning-path', pathId] })
            qc.invalidateQueries({ queryKey: ['roadmap', pathId] })
            qc.invalidateQueries({ queryKey: ['path-analytics', pathId] })
            setSelectedConcept(null)
            setTimeout(() => setJustCompleted(false), 2000)
          }}
        />
      )}
    </div>
  )
}
