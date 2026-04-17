import { motion, AnimatePresence, useAnimationControls } from 'framer-motion'
import { useAudio } from '@/context/AudioContext'
import { Play, Pause, X, Radio, ArrowUpRight, GripVertical } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function FloatingMiniPlayer() {
  const { state, pause, resume, stop } = useAudio()
  const controls = useAnimationControls()
  
  // Persistence of position could be added here, but for now we'll just handle snapping
  const handleDragEnd = (event: any, info: any) => {
    const { x, y } = info.point
    const width = window.innerWidth
    const height = window.innerHeight

    // Snap positions (relative to the bottom-right origin or absolute? 
    // Framer motion drag usually works with offsets if not constrained.
    // Let's use simple logic: find nearest corner and animate there.)
    
    let targetX = info.offset.x
    let targetY = info.offset.y

    // Determine target based on screen quadrants
    if (x < width / 2) {
      targetX = - (width - 400) // Move towards left
    } else {
      targetX = 0 // Stay near right
    }

    if (y < height / 2) {
      targetY = - (height - 200) // Move towards top
    } else {
      targetY = 0 // Stay near bottom
    }

    controls.start({ 
      x: targetX, 
      y: targetY, 
      transition: { type: 'spring', stiffness: 200, damping: 25 } 
    })
  }

  // Show the mini-player if:
  // 1. There's an active session and the user hasn't explicitly stopped it
  // 2. OR there's an active resource with mini-player visible
  const isVisible = (state.sessionId && state.isMiniPlayerVisible) || 
                    (state.activeResourceId && state.isMiniPlayerVisible)
  
  if (!isVisible) return null

  return (
    <AnimatePresence mode="wait">
      <motion.div
        layout
        initial={{ y: 100, opacity: 0 }}
        animate={controls}
        exit={{ y: 100, opacity: 0 }}
        drag
        onDragEnd={handleDragEnd}
        dragElastic={0.1}
        dragMomentum={false}
        className={cn(
          "fixed z-[200] touch-none font-outfit",
          // Mobile: Fixed bar at bottom. Desktop: Floating draggable bubble.
          "bottom-0 left-0 right-0 sm:bottom-8 sm:right-8 sm:left-auto sm:w-[360px]"
        )}
      >
        <div className="mx-4 mb-20 sm:mx-0 sm:mb-0 bg-slate-950/80 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-3 relative overflow-hidden group">
          {/* Active Glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-violet-500/10 to-primary/10 animate-[shimmer_3s_infinite] pointer-events-none" />
          
          {/* Drag Handle (Desktop only) */}
          <div className="hidden sm:flex items-center justify-center p-1 text-slate-600 group-hover:text-slate-400 cursor-grab active:cursor-grabbing transition-colors">
            <GripVertical className="w-5 h-5" />
          </div>

          {/* Icon/Art */}
          <div className="relative w-14 h-14 shrink-0">
             <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
             <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-lg border border-white/10">
               <Radio className={cn("w-7 h-7 text-white", state.isPlaying && "animate-pulse")} />
             </div>
          </div>

          {/* Meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
               <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">FlowCast Live</span>
               {state.script.length > 0 && (
                 <span className="text-[9px] font-bold text-slate-500">
                   Segment {state.currentIndex + 1}/{state.totalChunks}
                 </span>
               )}
               {state.isPlaying && (
                 <div className="flex items-end gap-0.5 h-3">
                   <div className="w-0.5 bg-primary animate-[musicBar_1s_infinite]" />
                   <div className="w-0.5 bg-primary animate-[musicBar_1s_infinite_0.2s]" />
                   <div className="w-0.5 bg-primary animate-[musicBar_1s_infinite_0.4s]" />
                 </div>
               )}
            </div>
            <p className="text-sm font-black text-white truncate">{state.activeResourceTitle}</p>
            
            {/* Progress */}
            <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
               <motion.div 
                 className="h-full bg-gradient-to-r from-primary to-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]" 
                 initial={{ width: 0 }}
                 animate={{ width: `${state.playbackProgress}%` }}
               />
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/5">
            <button 
              onClick={(e) => { e.stopPropagation(); state.isPlaying ? pause() : resume(); }}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary text-white hover:bg-primary/80 transition-all active:scale-90 shadow-lg shadow-primary/20"
            >
              {state.isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
            <div className="flex flex-col gap-1">
              <Link 
                href={`/library/${state.activeResourceId}`}
                className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors"
                title="Open Resource"
              >
                <ArrowUpRight className="w-4 h-4" />
              </Link>
              <button 
                onClick={(e) => { e.stopPropagation(); stop(); }}
                className="p-1.5 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded-lg transition-colors"
                title="Stop Audio"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
