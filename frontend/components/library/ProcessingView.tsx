'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  Brain, BookOpen, Zap, CheckCircle2,
  Clock, FileText, Layers, HelpCircle, Radio, Map, Wand2
} from 'lucide-react'

// ── Stage definitions ────────────────────────────────────────────────────────
const STAGES = [
  { id: 'ingest',    label: 'Reading your material',     icon: FileText,   range: [0, 20],  color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { id: 'analyze',   label: 'Analyzing content',          icon: Brain,      range: [20, 40], color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  { id: 'sections',  label: 'Building study sections',    icon: BookOpen,   range: [40, 75], color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  { id: 'features',  label: 'Generating tools',           icon: Sparkles,   range: [75, 95], color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { id: 'done',      label: 'Finalizing your kit',        icon: Zap,        range: [95, 100],color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
]

const FEATURE_ICONS: Record<string, any> = {
  flashcards: Layers,
  quiz:       HelpCircle,
  podcast:    Radio,
  mindmap:    Map,
  practice:   Wand2,
}

// ── Rotating tips ────────────────────────────────────────────────────────────
const TIPS = [
  { emoji: '🧠', text: 'FlowAI reads your entire document before writing a single word — that\'s why it\'s so accurate.' },
  { emoji: '🎯', text: 'Your flashcards are spaced-repetition ready — the algorithm schedules reviews at the perfect time.' },
  { emoji: '🎙️', text: 'The podcast is a real two-host conversation, not just text-to-speech.' },
  { emoji: '📊', text: 'Mind maps are generated from the actual structure of your content, not a template.' },
  { emoji: '✍️', text: 'Written test questions are calibrated to your academic level — undergrad by default.' },
  { emoji: '🔍', text: 'FlowAI extracts images and diagrams from PDFs and links them to the relevant sections.' },
  { emoji: '⚡', text: 'Once generated, all your tools load instantly — no waiting next time.' },
  { emoji: '💬', text: 'You can ask FlowAI anything about this material once your kit is ready.' },
  { emoji: '🔄', text: 'Multiple AI models work in parallel on different chunks of your content.' },
  { emoji: '📝', text: 'Each section has a Key Question, detailed explanation, and exam tips built in.' },
]

// ── Elapsed time formatter ───────────────────────────────────────────────────
function useElapsed(startedAt: number) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(t)
  }, [startedAt])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

// ── Particle dots animation ──────────────────────────────────────────────────
function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-orange-500/20 animate-float"
          style={{
            left: `${10 + (i * 7.5) % 80}%`,
            top: `${15 + (i * 13) % 70}%`,
            animationDelay: `${i * 0.4}s`,
            animationDuration: `${3 + (i % 3)}s`,
          }}
        />
      ))}
    </div>
  )
}

// ── Main ProcessingView ──────────────────────────────────────────────────────
interface Props {
  resource: any
  compact?: boolean  // for library card view
}

export default function ProcessingView({ resource, compact = false }: Props) {
  const [tipIdx, setTipIdx] = useState(0)
  const [tipVisible, setTipVisible] = useState(true)
  const startedAt = useRef(Date.now()).current
  const elapsed = useElapsed(startedAt)

  const progress = Math.max(resource.processing_progress || 0, 2)
  const statusText = resource.status_text || 'Initializing...'

  // Rotate tips every 6s with fade
  useEffect(() => {
    const t = setInterval(() => {
      setTipVisible(false)
      setTimeout(() => {
        setTipIdx(i => (i + 1) % TIPS.length)
        setTipVisible(true)
      }, 400)
    }, 6000)
    return () => clearInterval(t)
  }, [])

  // Current stage — use findLast polyfill (not all browsers support it)
  const currentStage = [...STAGES].reverse().find(s => progress >= s.range[0]) || STAGES[0]
  const currentStageIdx = STAGES.indexOf(currentStage)
  const StageIcon = currentStage.icon

  const tip = TIPS[tipIdx]
  const selectedFeatures: string[] = resource.selected_features || ['flashcards', 'quiz', 'podcast', 'mindmap', 'practice']

  // ── COMPACT (library card) ───────────────────────────────────────────────
  if (compact) {
    return (
      <div className="space-y-3">
        {/* Animated icon + stage */}
        <div className="flex items-center gap-2.5">
          <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', currentStage.bg, currentStage.border, 'border')}>
            <StageIcon className={cn('w-4 h-4', currentStage.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={cn('text-[10px] font-black uppercase tracking-widest', currentStage.color)}>
                {currentStage.label}
              </span>
              <span className="text-[9px] text-slate-600 font-medium">{elapsed}</span>
            </div>
            <p className="text-[10px] text-slate-500 truncate italic">{statusText}</p>
          </div>
        </div>

        {/* Progress bar with glow */}
        <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700 relative', 
              progress < 40 ? 'bg-sky-500' : progress < 75 ? 'bg-orange-500' : 'bg-emerald-500'
            )}
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-0 bottom-0 w-4 bg-white/40 blur-sm rounded-full" />
          </div>
        </div>

        {/* Stage dots */}
        <div className="flex items-center gap-1">
          {STAGES.map((s, i) => (
            <div key={s.id} className={cn(
              'flex-1 h-0.5 rounded-full transition-all duration-500',
              i < currentStageIdx ? 'bg-emerald-500' :
              i === currentStageIdx ? (progress < 40 ? 'bg-sky-500' : progress < 75 ? 'bg-orange-500' : 'bg-emerald-500') :
              'bg-white/8'
            )} />
          ))}
        </div>
      </div>
    )
  }

  // ── FULL (resource detail page) ──────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12 relative">
      <Particles />

      <div className="w-full max-w-lg space-y-8 relative z-10">

        {/* ── Hero orb ── */}
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            {/* Outer pulse rings */}
            <div className="absolute inset-0 rounded-full bg-orange-500/10 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute -inset-3 rounded-full bg-orange-500/5 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
            {/* Main orb */}
            <div className="relative w-20 h-20 rounded-[2rem] bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 flex items-center justify-center">
              <StageIcon className={cn('w-9 h-9 transition-all duration-500', currentStage.color)} />
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-black text-white tracking-tight">Building Your Study Kit</h2>
            <p className="text-slate-500 mt-1 text-sm">This takes about 5–8 minutes. You can leave and come back.</p>
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={cn('text-xs font-black uppercase tracking-widest', currentStage.color)}>
              {currentStage.label}
            </span>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-slate-600" />
              <span className="text-xs text-slate-600 font-medium tabular-nums">{elapsed}</span>
              <span className="text-xs font-black text-white">{progress}%</span>
            </div>
          </div>
          <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 relative"
              style={{
                width: `${progress}%`,
                background: progress < 40
                  ? 'linear-gradient(90deg, #38bdf8, #818cf8)'
                  : progress < 75
                  ? 'linear-gradient(90deg, #f97316, #fbbf24)'
                  : 'linear-gradient(90deg, #34d399, #10b981)',
              }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-6 bg-white/30 blur-sm" />
            </div>
          </div>
          <p className="text-xs text-slate-500 italic text-center">{statusText}</p>
        </div>

        {/* ── Stage timeline ── */}
        <div className="bg-[#111] border border-white/5 rounded-2xl p-4 space-y-1">
          {STAGES.map((stage, i) => {
            const isDone = i < currentStageIdx
            const isActive = i === currentStageIdx
            const Icon = stage.icon
            return (
              <div key={stage.id} className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-500',
                isActive ? cn(stage.bg, 'border', stage.border) : 'opacity-40'
              )}>
                <div className={cn(
                  'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all',
                  isDone ? 'bg-emerald-500/20' : isActive ? stage.bg : 'bg-white/5'
                )}>
                  {isDone
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    : <Icon className={cn('w-3.5 h-3.5', isActive ? stage.color : 'text-slate-600')} />
                  }
                </div>
                <span className={cn(
                  'text-xs font-bold flex-1',
                  isDone ? 'text-emerald-400 line-through decoration-emerald-500/40' :
                  isActive ? 'text-white' : 'text-slate-600'
                )}>
                  {stage.label}
                </span>
                {isActive && (
                  <div className="flex gap-0.5">
                    {[0,1,2].map(j => (
                      <span key={j} className={cn('w-1 h-1 rounded-full animate-bounce', stage.color.replace('text-', 'bg-'))}
                        style={{ animationDelay: `${j * 0.15}s` }} />
                    ))}
                  </div>
                )}
                {isDone && (
                  <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Done</span>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Features being generated ── */}
        {selectedFeatures.length > 0 && progress >= 75 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Generating your tools</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {selectedFeatures.filter(f => f !== 'notes').map(f => {
                const Icon = FEATURE_ICONS[f] || BookOpen
                return (
                  <div key={f} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/8 rounded-xl">
                    <Icon className="w-3 h-3 text-orange-400" />
                    <span className="text-[10px] font-black text-slate-400 capitalize">{f}</span>
                    <div className="flex gap-0.5 ml-1">
                      {[0,1,2].map(j => (
                        <span key={j} className="w-0.5 h-0.5 rounded-full bg-orange-500 animate-pulse"
                          style={{ animationDelay: `${j * 0.2}s` }} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Rotating tip ── */}
        <div className={cn(
          'bg-[#111] border border-white/5 rounded-2xl p-4 transition-opacity duration-400',
          tipVisible ? 'opacity-100' : 'opacity-0'
        )}>
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0 mt-0.5">{tip.emoji}</span>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Did you know?</p>
              <p className="text-xs text-slate-400 leading-relaxed">{tip.text}</p>
            </div>
          </div>
          {/* Tip progress dots */}
          <div className="flex gap-1 mt-3 justify-center">
            {TIPS.map((_, i) => (
              <div key={i} className={cn(
                'h-0.5 rounded-full transition-all duration-300',
                i === tipIdx ? 'w-4 bg-orange-500' : 'w-1 bg-white/10'
              )} />
            ))}
          </div>
        </div>

        {/* ── Leave notice ── */}
        <p className="text-center text-[11px] text-slate-600 font-medium">
          🔔 You'll see a notification when your kit is ready — feel free to explore other materials.
        </p>
      </div>
    </div>
  )
}
