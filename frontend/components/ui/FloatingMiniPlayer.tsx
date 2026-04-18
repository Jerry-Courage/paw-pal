import { motion, AnimatePresence } from 'framer-motion'
import { useAudio } from '@/context/AudioContext'
import { Play, Pause, X, Radio, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function FloatingMiniPlayer() {
  const { state, pause, resume, stop } = useAudio()

  // Show the mini-player if there's an active podcast session
  const isVisible = !!(state.sessionId && state.isMiniPlayerVisible)

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="floating-mini-player"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={cn(
            "fixed z-[200] font-outfit",
            "bottom-6 left-4 right-4 sm:bottom-8 sm:right-8 sm:left-auto sm:w-[380px]"
          )}
        >
          <div className="bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-3 relative overflow-hidden group">
            {/* Active Glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-violet-500/10 to-primary/10 animate-[shimmer_3s_infinite] pointer-events-none" />

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
                   transition={{ duration: 0.3 }}
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
                  href={`/library/${state.activeResourceId}?podcast=open`}
                  className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors"
                  title="Open Podcast"
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
      )}
    </AnimatePresence>
  )
}
