'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  BookOpen, Layers, HelpCircle, Wand2, Brain,
  CheckCircle2, Lock, ChevronRight, Zap, Star
} from 'lucide-react'
import { toast } from 'sonner'

const STEPS = [
  {
    id: 'notes',
    label: 'Understand',
    sublabel: 'Read AI notes',
    icon: BookOpen,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    xp: 50,
  },
  {
    id: 'flashcards',
    label: 'Recall',
    sublabel: 'Review flashcards',
    icon: Layers,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    xp: 75,
  },
  {
    id: 'quiz',
    label: 'Test',
    sublabel: 'Take MCQ quiz',
    icon: HelpCircle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    xp: 100,
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
  },
  {
    id: 'examprep',
    label: 'Master',
    sublabel: 'Live AI session',
    icon: Brain,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/30',
    xp: 150,
  },
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
  // If progress hasn't loaded yet, treat first step as next so buttons always show
  const nextStep = progress?.next_step ?? 'notes'

  const handleStart = (step: string) => {
    // Mark notes as complete when they click Start (they've seen the notes)
    if (step === 'notes' && !completedSteps.notes) {
      completeMutation.mutate({ step: 'notes', score: 100 })
    }
    if (onStepClick) {
      onStepClick(step)
    } else {
      router.push(STEP_HREFS[step](resourceId))
    }
  }

  const handleJump = (step: string) => {
    if (onStepClick) {
      onStepClick(step)
    } else {
      router.push(STEP_HREFS[step](resourceId))
    }
  }

  return (
    <div className="px-4 py-5 space-y-4">
      {/* Mastery header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Star className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Study Path</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black text-slate-500">Mastery</span>
          <span className={cn(
            'text-xs font-black',
            mastery >= 80 ? 'text-emerald-400' :
            mastery >= 50 ? 'text-orange-400' : 'text-slate-400'
          )}>{mastery}%</span>
        </div>
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
      <div className="space-y-2">
        {STEPS.map((step, idx) => {
          const isDone = !!completedSteps[step.id]
          const isNext = step.id === nextStep
          const score = progress?.step_scores?.[step.id]
          const Icon = step.icon

          return (
            <div
              key={step.id}
              className={cn(
                'relative flex items-center gap-3 p-3 rounded-2xl border transition-all',
                isDone
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : isNext
                  ? cn(step.border, step.bg)
                  : 'border-white/5 bg-white/[0.02]'
              )}
            >
              {/* Step icon */}
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
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'text-xs font-black',
                    isDone ? 'text-emerald-400' : isNext ? 'text-white' : 'text-slate-500'
                  )}>
                    {step.label}
                  </span>
                  {isDone && score !== undefined && (
                    <span className="text-[9px] text-emerald-500 font-bold">{score}%</span>
                  )}
                  {!isDone && (
                    <span className="text-[9px] font-black text-slate-700 flex items-center gap-0.5">
                      <Zap className="w-2.5 h-2.5" />{step.xp} XP
                    </span>
                  )}
                </div>
                <p className={cn(
                  'text-[10px]',
                  isDone ? 'text-emerald-600' : isNext ? 'text-slate-400' : 'text-slate-700'
                )}>
                  {step.sublabel}
                </p>
              </div>

              {/* Actions — always show something clickable */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isDone ? (
                  <button
                    onClick={() => handleJump(step.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 hover:opacity-80 transition-all"
                  >
                    Redo
                  </button>
                ) : isNext ? (
                  <button
                    onClick={() => handleStart(step.id)}
                    className={cn(
                      'flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all active:scale-95',
                      step.color, step.bg, 'border', step.border,
                      'hover:opacity-80'
                    )}
                  >
                    Start <ChevronRight className="w-3 h-3" />
                  </button>
                ) : (
                  // Not done, not next — show "Jump in" so it's always clickable
                  <button
                    onClick={() => handleJump(step.id)}
                    className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors font-bold px-2 py-1 rounded-lg hover:bg-white/5 active:scale-95"
                  >
                    Jump in
                  </button>
                )}
              </div>

              {/* Connector line to next */}
              {idx < STEPS.length - 1 && (
                <div className={cn(
                  'absolute left-7 -bottom-2.5 w-0.5 h-2.5',
                  isDone ? 'bg-emerald-500/30' : 'bg-white/5'
                )} />
              )}
            </div>
          )
        })}
      </div>

      {/* All done */}
      {mastery >= 100 && (
        <div className="text-center py-3 px-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
          <p className="text-xs font-black text-emerald-400">🎓 Material mastered!</p>
        </div>
      )}
    </div>
  )
}
