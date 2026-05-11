'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { 
  Database, PencilRuler, GraduationCap, 
  ChevronRight, Library, Sparkles, 
  Zap, Trophy 
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface StageNavigatorProps {
  currentStage: 'ingest' | 'synthesize' | 'master'
  onStageChange: (stage: 'ingest' | 'synthesize' | 'master') => void
}

const stages = [
  { 
    id: 'ingest', 
    label: 'Sources', 
    icon: Library, 
    desc: 'Connect intelligence nodes',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10'
  },
  { 
    id: 'synthesize', 
    label: 'Drafting', 
    icon: Sparkles, 
    desc: 'Neural synthesis process',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10'
  },
  { 
    id: 'master', 
    label: 'Mastery', 
    icon: GraduationCap, 
    desc: 'Knowledge transformation',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10'
  },
]

export default function StageNavigator({ currentStage, onStageChange }: StageNavigatorProps) {
  return (
    <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-[2rem] border border-white/10 backdrop-blur-xl shadow-2xl">
      {stages.map((stage, index) => {
        const isActive = currentStage === stage.id
        const isPast = stages.findIndex(s => s.id === currentStage) > index
        
        return (
          <div key={stage.id} className="flex items-center">
            <button
              onClick={() => onStageChange(stage.id as any)}
              className={cn(
                "group relative flex items-center gap-3 px-5 py-2.5 rounded-2xl transition-all duration-500",
                isActive ? "bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.15)]" : "hover:bg-white/5"
              )}
            >
              {isActive && (
                <motion.div 
                  layoutId="stage-glow"
                  className={cn("absolute inset-0 rounded-2xl blur-lg opacity-20", stage.color)}
                />
              )}
              
              <div className={cn(
                "p-2 rounded-xl transition-all duration-500",
                isActive ? "bg-black text-white" : "bg-white/5 text-white/20 group-hover:text-white/60"
              )}>
                <stage.icon className="w-4 h-4" />
              </div>

              <div className="flex flex-col items-start">
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-[0.2em]",
                  isActive ? "text-black" : "text-white/40"
                )}>
                  {stage.label}
                </span>
                {isActive && (
                  <motion.span 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[8px] font-bold text-black/40 uppercase tracking-tighter"
                  >
                    {stage.desc}
                  </motion.span>
                )}
              </div>
            </button>
            
            {index < stages.length - 1 && (
              <div className="mx-2 text-white/5">
                <ChevronRight className={cn(
                  "w-4 h-4 transition-colors",
                  isPast ? "text-violet-500/40" : ""
                )} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
