'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  BookOpen, Layers, HelpCircle, Wand2, Brain,
  CheckCircle2, ChevronRight, Zap, Star,
  Map, Radio, Calculator, FileText
} from 'lucide-react'
import { toast } from 'sonner'

const STEPS = [
  {
    id: 'notes',
    label: 'Understand',
    sublabel: 'Notes + Mind Map',
    icon: BookOpen,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    xp: 50,
    // Extra tool shown inside this step
    extra: { label: 'Mind Map', icon: Map, href: (id: number) => `/library/${id}/mindmap` },
  },
  {
    id: 'flashcards',
    label: 'Recall',
    sublabel: 'Spaced repetition',
    icon: Layers,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    xp: 75,
    extra: null,
  },
  {
    id: 'quiz',
    label: 'Test',
    sublabel: 'MCQ quiz',
    icon: HelpCircle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    xp: 100,
    extra: null,
  },
  {
    id: 'practice',
    label: 'Apply',
    sublabel: 'Written practice',
    icon: Wand2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    xp: 100,
    extra: null,
  },
  {
    id: 'examprep',
    label: 'Master',
    sublabel: 'Live AI session + exam',
    icon: Brain,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/30',
    xp: 150,
    extra: null,
  },
]

const BONUS_TOOLS = [
  { id: 'podcast',  label: 'Podcast',     icon: Radio,      href: (id: number) => `/library/${id}/podcast`,  xp: 25 },
  { id: 'solver',   label: 'Math Solver', icon: Calculator, href: (id: number) => `/library/${id}/solver`,   xp: 0  },
  { id: 'content',  label: 'Source File', icon: FileText,   href: null,                                       xp: 0  },
]

const STEP_HREFS: Record<string, (id: number) => string> = {
  notes:     (id) => `/library/${id}`,
  flashcards:(id) => `/library/${id}/flashcards`,
  quiz:      (id) => `/library/${id}/quiz`,
  practice:  (id) => `/library/${id}/practice`,
  examprep:  (id) => `/library/${id}/examprep`,
}

interface Props {
  resourceId: number
  onStepClick?: (step: string) => void
}

export default function StudyPath({ resourceId, onStepClick }: Props) {
  const router = useRouter()
  const qc = useQueryClient()
  const [showStudyPath, setShowStudyPath] = useState(false)

  const { data: progress } = useQuery({
    queryKey: ['progress', resourceId],
    queryFn: () => libraryApi.getProgress(resourceId).then(r => r.data),
    staleTime: 10000,
  })

  const completeMutation = useMutation({
    mutationFn: ({ step, score }: { step: string; score: number }) =>
      libraryApi.completeStep(resourceId, step, score),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['progress', resourceId] })
      const xp = res.data.xp_gained
      if (xp > 0) {
        toast.success(`+${xp} XP earned! 🎉`, { duration: 2000 })
      }
    },
  })

  const completedSteps = progress?.completed_steps || {}
  const mastery = progress?.mastery || 0
  // Default to notes as next step while progress is loading
  const nextStep = progress?.next_step ?? 'notes'
  const hasStarted = Object.keys(completedSteps).length > 0

  const navigate = (href: string | null, stepId?: string) => {
    if (stepId && onStepClick) {
      onStepClick(stepId)
      return
    }
    if (href) router.push(href)
  }

  const completeAndNavigate = async (step: string) => {
    const targetHref = STEP_HREFS[step](resourceId)

    if (onStepClick) {
      onStepClick(step)
    } else if (targetHref) {
      router.push(targetHref)
    }

    if (!completedSteps[step]) {
      try {
        await completeMutation.mutateAsync({ step, score: 100 })
      } catch (error) {
        console.error('Failed to save study progress:', error)
        toast.error('Your study path opened. XP will sync when the connection is back.', { duration: 2500 })
      }
    }
  }

  const handleJump = (step: string) => {
    void completeAndNavigate(step)
  }

  if (!showStudyPath) {
    return (
      <div className="px-3 py-4 sm:px-4 sm:py-5">
        <div className="rounded-3xl border border-orange-500/20 bg-orange-500/10 p-4 text-center space-y-3">
          <p className="text-[10px] uppercase tracking-[0.22em] font-black text-orange-300">Ready to master this material?</p>
          <h2 className="text-sm font-black text-white leading-relaxed">Start with a focused study path to understand, recall, and apply what you learned.</h2>
          <button
            onClick={() => setShowStudyPath(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-black shadow-lg shadow-orange-500/15 transition hover:bg-orange-400"
          >
            Show study path
          </button>
          <button
            onClick={() => router.push(`/library/${resourceId}/examprep`)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-500/30 bg-transparent px-4 py-2 text-[11px] font-black uppercase tracking-widest text-orange-400 transition hover:bg-orange-500/10"
          >
            <Star className="w-3 h-3 fill-current" /> Attempt Mastery
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 py-4 space-y-3 sm:px-4 sm:py-5 sm:space-y-4">
      <button
        onClick={() => router.push(`/library/${resourceId}/examprep`)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-600 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-black shadow-lg shadow-orange-500/15 transition hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
      >
        <Star className="w-3.5 h-3.5 fill-current" /> Attempt Mastery
      </button>

      {!hasStarted ? (
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-3 text-[11px] text-slate-300">
          Start with notes, then the next step will unlock automatically once you finish it.
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[11px] text-emerald-300">
          {nextStep === 'notes'
            ? 'You are back at the start. Pick a step to continue.'
            : `Next up: ${STEPS.find(s => s.id === nextStep)?.label || 'your next step'}`}
        </div>
      )}

      {/* Mastery header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Star className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Study Path</span>
        </div>
        <span className={cn(
          'text-xs font-black',
          mastery >= 80 ? 'text-emerald-400' :
          mastery >= 50 ? 'text-orange-400' : 'text-slate-400'
        )}>{mastery}%</span>
      </div>

      {/* Mastery bar */}
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${mastery}%`,
            background: mastery >= 80
              ? 'linear-gradient(90deg, #34d399, #10b981)'
              : mastery >= 50
              ? 'linear-gradient(90deg, #f97316, #fbbf24)'
              : 'linear-gradient(90deg, #38bdf8, #818cf8)',
          }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-1.5">
        {STEPS.map((step, idx) => {
          const isDone = !!completedSteps[step.id]
          const isNext = step.id === nextStep
          const score = progress?.step_scores?.[step.id]
          const Icon = step.icon

          return (
            <div key={step.id}>
              <div
                className={cn(
                  'relative flex items-center gap-3 p-3 rounded-2xl border transition-all',
                  isDone
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : isNext
                    ? cn(step.border, step.bg)
                    : 'border-white/5 bg-white/[0.02]'
                )}
              >
                {/* Icon */}
                <div className={cn(
                  'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                  isDone ? 'bg-emerald-500/20' : isNext ? step.bg : 'bg-white/5'
                )}>
                  {isDone
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    : <Icon className={cn('w-4 h-4', isNext ? step.color : 'text-slate-600')} />
                  }
                </div>

                {/* Labels */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn(
                      'text-xs font-black',
                      isDone ? 'text-emerald-400' : isNext ? 'text-white' : 'text-slate-500'
                    )}>
                      {step.label}
                    </span>
                    {isDone && score !== undefined && (
                      <span className="text-[9px] text-emerald-500 font-bold">{score}%</span>
                    )}
                    {!isDone && step.xp > 0 && (
                      <span className="text-[9px] font-black text-slate-700 flex items-center gap-0.5">
                        <Zap className="w-2.5 h-2.5" />{step.xp}
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    'text-[10px] leading-relaxed',
                    isDone ? 'text-emerald-600' : isNext ? 'text-slate-400' : 'text-slate-700'
                  )}>
                    {step.sublabel}
                  </p>
                </div>

                {/* Action button */}
                <div className="shrink-0">
                  {isDone ? (
                    <button
                      onClick={() => handleJump(step.id)}
                      className="px-2.5 py-1.5 rounded-xl text-[10px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 hover:opacity-80 transition-all active:scale-95"
                    >
                      Redo
                    </button>
                  ) : isNext ? (
                    <button
                      onClick={() => handleJump(step.id)}
                      className={cn(
                        'flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all active:scale-95',
                        step.color, step.bg, 'border', step.border, 'hover:opacity-80'
                      )}
                    >
                      Start <ChevronRight className="w-3 h-3" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleJump(step.id)}
                      className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors font-bold px-2 py-1 rounded-lg hover:bg-white/5 active:scale-95"
                    >
                      Jump in
                    </button>
                  )}
                </div>

                {/* Connector to next step */}
                {idx < STEPS.length - 1 && (
                  <div className={cn(
                    'absolute left-7 -bottom-2 w-0.5 h-2',
                    isDone ? 'bg-emerald-500/30' : 'bg-white/5'
                  )} />
                )}
              </div>

              {/* Extra tool inside step (e.g. Mind Map inside Understand) */}
              {step.extra && (
                <button
                  onClick={() => navigate(step.extra!.href(resourceId))}
                  className="ml-6 mt-1 flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all w-fit"
                >
                  <step.extra.icon className="w-3 h-3" />
                  {step.extra.label}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1 h-px bg-white/5" />
        <span className="text-[9px] text-slate-700 font-black uppercase tracking-widest">Bonus Tools</span>
        <div className="flex-1 h-px bg-white/5" />
      </div>

      {/* Bonus tools */}
      <div className="space-y-1">
        {BONUS_TOOLS.map(tool => {
          const Icon = tool.icon
          return (
            <button
              key={tool.id}
              onClick={() => {
                if (tool.id === 'content' && onStepClick) {
                  onStepClick('content')
                } else if (tool.href) {
                  navigate(tool.href(resourceId))
                }
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-white/5 bg-white/[0.02] text-slate-500 hover:text-slate-300 hover:border-white/10 hover:bg-white/5 transition-all active:scale-95 text-left"
            >
              <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold">{tool.label}</span>
              {tool.xp > 0 && (
                <span className="ml-auto text-[9px] text-slate-700 flex items-center gap-0.5 font-black">
                  <Zap className="w-2.5 h-2.5" />{tool.xp} XP
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* All done */}
      {mastery >= 100 && (
        <div className="text-center py-3 px-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mt-2">
          <p className="text-xs font-black text-emerald-400">🎓 Material mastered!</p>
        </div>
      )}
    </div>
  )
}
