'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { learningApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ConceptPanelProps {
  conceptId: string
  onClose: () => void
  onComplete: () => void
}

export default function ConceptPanel({ conceptId, onClose, onComplete }: ConceptPanelProps) {
  const [tab, setTab] = useState<'learn' | 'quiz' | 'review'>('learn')
  const [quizScore, setQuizScore] = useState<number | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [showSource, setShowSource] = useState(false)

  const { data: concept, isLoading } = useQuery({
    queryKey: ['concept', conceptId],
    queryFn: () => learningApi.getConcept(conceptId).then(r => r.data),
  })

  const { data: sourceCtx } = useQuery({
    queryKey: ['source-context', conceptId],
    queryFn: () => learningApi.getSourceContext(conceptId).then(r => r.data),
    enabled: showSource,
  })

  const completeMutation = useMutation({
    mutationFn: (score: number) => learningApi.completeConcept(conceptId, score),
    onSuccess: (res) => {
      toast.success(`+${res.data.xp_earned} XP! Concept completed.`)
      onComplete()
    },
    onError: () => toast.error('Failed to complete concept'),
  })

  const reviewMutation = useMutation({
    mutationFn: (score: number) => learningApi.reviewConcept(conceptId, score),
    onSuccess: (res) => {
      toast.success(`Review recorded. Next review in ${res.data.interval_days} day(s)`)
      setQuizScore(null)
      setQuizAnswers({})
      onComplete()
    },
  })

  const handleQuizSubmit = () => {
    if (!concept) return
    const totalQuestions = 5
    const correct = Object.values(quizAnswers).filter(a => a === 1).length
    const score = Math.round((correct / totalQuestions) * 100)
    setQuizScore(score)
  }

  const handleComplete = () => {
    if (quizScore !== null) {
      completeMutation.mutate(quizScore)
    }
  }

  const handleReview = () => {
    if (quizScore !== null) {
      reviewMutation.mutate(quizScore)
    }
  }

  if (isLoading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!concept) return null

  const STATUS_LABEL: Record<string, string> = {
    locked: 'Locked',
    current: 'In Progress',
    completed: 'Completed',
  }

  // Generate quiz questions from concept definitions
  const definitions = concept.key_definitions || []
  const quizQuestions = definitions.slice(0, 5).map((def: any, i: number) => ({
    question: def.term || def.definition || `Question ${i + 1}`,
    answer: def.definition || def.term || 'Answer',
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-surface rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/10">
          <div className="flex items-center justify-between mb-2">
            <span className={cn(
              'px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase',
              concept.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
              concept.status === 'current' ? 'bg-primary/20 text-primary' : 'bg-slate-500/20 text-slate-400'
            )}>
              {STATUS_LABEL[concept.status]}
            </span>
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <h2 className="text-xl font-black">{concept.title}</h2>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-on-surface-variant">
            <span>{concept.estimated_minutes} min</span>
            <span>·</span>
            <span className={concept.difficulty === 'hard' ? 'text-red-400' : concept.difficulty === 'easy' ? 'text-emerald-400' : 'text-amber-400'}>{concept.difficulty}</span>
            <span>·</span>
            <span>{concept.mastery}% mastery</span>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-outline-variant/10">
          {(['learn', 'quiz', 'review'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-all',
                tab === t ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'learn' && (
            <div className="space-y-4">
              {/* Summary */}
              {concept.summary ? (
                <div className="bg-surface-variant/30 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-on-surface-variant uppercase mb-2">Summary</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{concept.summary}</p>
                </div>
              ) : (
                <div className="bg-surface-variant/30 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-on-surface-variant uppercase mb-2">Summary</h3>
                  <p className="text-sm leading-relaxed text-on-surface-variant/60 italic">No summary generated yet. Use the Generate button to create study notes for this concept's source material.</p>
                </div>
              )}

              {/* Description */}
              {concept.description && (
                <div>
                  <h3 className="text-xs font-bold text-on-surface-variant uppercase mb-2">Why This Matters</h3>
                  <p className="text-sm leading-relaxed text-on-surface-variant whitespace-pre-wrap">{concept.description}</p>
                </div>
              )}

              {/* Key Definitions */}
              {definitions.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-on-surface-variant uppercase mb-2">Key Definitions</h3>
                  <div className="space-y-2">
                    {definitions.map((def: any, i: number) => (
                      <div key={i} className="bg-surface-variant/20 rounded-lg p-3 border-l-2 border-primary/40">
                        <p className="text-xs font-bold text-primary">{def.term || def.name || `Term ${i + 1}`}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">{def.definition || def.value || ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Source Citation */}
              {concept.source_resource_title && (
                <button
                  onClick={() => setShowSource(!showSource)}
                  className="w-full text-left bg-surface-variant/10 rounded-xl p-3 border border-outline-variant/10 hover:border-primary/30 transition-all"
                >
                  <div className="flex items-center gap-2 text-[10px] text-on-surface-variant">
                    <span className="material-symbols-outlined text-[12px]">menu_book</span>
                    Source: {concept.source_resource_title}
                    {concept.source_page && ` · Page ${concept.source_page}`}
                    {concept.source_section && ` · ${concept.source_section}`}
                  </div>
                  {showSource && sourceCtx && (
                    <div className="mt-3 text-xs text-on-surface-variant border-t border-outline-variant/10 pt-3">
                      {sourceCtx.notes_section?.content?.slice(0, 500) || 'No additional context available'}
                    </div>
                  )}
                </button>
              )}
            </div>
          )}

          {tab === 'quiz' && (
            <div className="space-y-4">
              <p className="text-xs text-on-surface-variant">Test your understanding of this concept.</p>

              {quizQuestions.length === 0 ? (
                <div className="text-center py-8">
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2">quiz</span>
                  <p className="text-sm text-on-surface-variant">No quiz questions available yet. Review the concept first.</p>
                </div>
              ) : (
                <>
                  {quizQuestions.map((q: any, i: number) => (
                    <div key={i} className="bg-surface-variant/20 rounded-xl p-4">
                      <p className="text-sm font-bold mb-3">{i + 1}. {q.question}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setQuizAnswers(prev => ({ ...prev, [i]: 1 }))}
                          className={cn(
                            'flex-1 py-2 rounded-lg text-xs font-bold border transition-all',
                            quizAnswers[i] === 1 ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-outline-variant/20'
                          )}
                        >
                          Got it
                        </button>
                        <button
                          onClick={() => setQuizAnswers(prev => ({ ...prev, [i]: 0 }))}
                          className={cn(
                            'flex-1 py-2 rounded-lg text-xs font-bold border transition-all',
                            quizAnswers[i] === 0 ? 'bg-red-500/20 border-red-500 text-red-400' : 'border-outline-variant/20'
                          )}
                        >
                          Need review
                        </button>
                      </div>
                    </div>
                  ))}

                  {quizScore === null ? (
                    <button
                      onClick={handleQuizSubmit}
                      disabled={Object.keys(quizAnswers).length < quizQuestions.length}
                      className="w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-50"
                    >
                      Submit Quiz
                    </button>
                  ) : (
                    <div className="text-center space-y-3">
                      <div className={cn(
                        'text-4xl font-black',
                        quizScore >= 70 ? 'text-emerald-400' : 'text-amber-400'
                      )}>
                        {quizScore}%
                      </div>
                      <p className="text-sm text-on-surface-variant">
                        {quizScore >= 70 ? 'Great job! You passed.' : 'Keep studying, you\'ll get there!'}
                      </p>
                      {concept.status !== 'completed' && (
                        <button
                          onClick={handleComplete}
                          disabled={completeMutation.isPending}
                          className="w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm"
                        >
                          {completeMutation.isPending ? 'Completing…' : 'Complete Concept'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'review' && (
            <div className="space-y-4">
              <p className="text-xs text-on-surface-variant">Spaced repetition review — concepts you haven't seen in a while.</p>

              <div className="bg-surface-variant/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold">Current Mastery</span>
                  <span className="text-sm font-black text-primary">{concept.mastery}%</span>
                </div>
                <div className="h-2 bg-surface-variant rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full" style={{ width: `${concept.mastery}%` }} />
                </div>
              </div>

              <div className="bg-surface-variant/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[16px] text-amber-400">schedule</span>
                  <span className="text-xs font-bold">Review Schedule</span>
                </div>
                <p className="text-xs text-on-surface-variant">
                  {concept.reviews?.length > 0
                    ? `Last reviewed ${concept.reviews[concept.reviews.length - 1]?.last_reviewed ? new Date(concept.reviews[concept.reviews.length - 1].last_reviewed).toLocaleDateString() : 'never'}`
                    : 'Not yet reviewed'}
                </p>
              </div>

              {/* Quick Review Quiz */}
              <div className="bg-surface-variant/20 rounded-xl p-4">
                <p className="text-xs font-bold mb-3">Quick Self-Assessment</p>
                <div className="flex gap-2">
                  {[
                    { label: 'Again', score: 20, color: 'bg-red-500/20 text-red-400 border-red-500/30' },
                    { label: 'Hard', score: 40, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
                    { label: 'Good', score: 70, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
                    { label: 'Easy', score: 90, color: 'bg-primary/20 text-primary border-primary/30' },
                  ].map(opt => (
                    <button
                      key={opt.label}
                      onClick={() => reviewMutation.mutate(opt.score)}
                      disabled={reviewMutation.isPending}
                      className={cn('flex-1 py-2.5 rounded-lg text-xs font-bold border', opt.color)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {concept.reviews?.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-on-surface-variant uppercase mb-2">Review History</h3>
                  <div className="space-y-1">
                    {concept.reviews.slice(-5).reverse().map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-[10px] py-1.5 border-b border-outline-variant/5">
                        <span className="text-on-surface-variant">{new Date(r.last_reviewed).toLocaleDateString()}</span>
                        <span className={cn('font-bold', r.last_score >= 70 ? 'text-emerald-400' : r.last_score >= 50 ? 'text-amber-400' : 'text-red-400')}>
                          {r.last_score}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {concept.status !== 'completed' && tab === 'learn' && (
          <div className="px-5 py-3 border-t border-outline-variant/10">
            <button
              onClick={() => setTab('quiz')}
              className="w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm"
            >
              Take Quiz to Complete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
