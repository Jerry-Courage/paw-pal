'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Volume2, VolumeX, Play, Pause } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Story {
  id: number
  author: any
  media_file: string
  media_type: 'image' | 'video' | 'text'
  text_content: string
  created_at: string
  workspace_name?: string
}

export default function StoryViewer({ 
  username, 
  stories, 
  onClose,
  initialIndex = 0 
}: { 
  username: string
  stories: Story[]
  onClose: () => void
  initialIndex?: number
}) {
  const [index, setIndex] = useState(initialIndex)
  const [progress, setProgress] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  const currentStoryArr = stories || []
  const currentStory = currentStoryArr[index]
  const isVideo = currentStory?.media_type === 'video'
  const duration = isVideo ? 15000 : 5000 // 5s for images, up to 15s for video

  // --- 1. Progress Timer ---
  useEffect(() => {
    if (isPaused) return

    const interval = 50 
    const step = (interval / duration) * 100

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100 // Cap at 100
        return prev + step
      })
    }, interval)

    return () => clearInterval(timer)
  }, [index, isPaused, duration])

  // --- 2. Auto-advance Trigger ---
  useEffect(() => {
    if (progress >= 100) {
      handleNext()
    }
  }, [progress])

  const handleNext = () => {
    if (index < currentStoryArr.length - 1) {
      setIndex(prev => prev + 1)
      setProgress(0)
    } else {
      onClose()
    }
  }

  const handlePrev = () => {
    if (index > 0) {
      setIndex(prev => prev - 1)
      setProgress(0)
    }
  }

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed inset-0 z-[100] bg-black sm:bg-black/95 flex items-center justify-center sm:p-4"
      >
        {/* Progress Bars Container */}
        <div className="absolute top-0 left-0 w-full z-20 flex gap-1 p-4">
          {currentStoryArr.map((_, i) => (
            <div key={i} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white transition-all duration-300"
                style={{ 
                  width: i === index ? `${progress}%` : i < index ? '100%' : '0%' 
                }}
              />
            </div>
          ))}
        </div>

        {/* Header (Author Info) */}
        <div className="absolute top-8 left-4 right-4 z-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-white/20">
              {currentStory?.author.avatar ? (
                <img src={currentStory.author.avatar} alt={username} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-black text-white">{getInitials(currentStory?.author.full_name || username)}</span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black text-white drop-shadow-md">{currentStory?.author.full_name || username}</span>
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">{currentStory?.workspace_name || 'Public'}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Media Content */}
        <div 
          className="relative w-full h-full sm:aspect-[9/16] sm:max-h-[85vh] sm:rounded-3xl overflow-hidden bg-black shadow-2xl flex items-center justify-center"
          onMouseDown={() => setIsPaused(true)}
          onMouseUp={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          {isVideo ? (
            <video 
              ref={videoRef}
              src={currentStory.media_file} 
              autoPlay 
              playsInline 
              muted={isMuted}
              className="w-full h-full object-contain"
              onEnded={handleNext}
            />
          ) : currentStory?.media_file ? (
            <img src={currentStory.media_file} alt="Story" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-12">
              <p className="text-2xl font-black text-white text-center drop-shadow-xl">{currentStory?.text_content}</p>
            </div>
          )}

          {/* Overlay Text if media exists */}
          {currentStory?.media_file && currentStory?.text_content && (
            <div className="absolute bottom-20 left-4 right-4 text-center">
              <span className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-2xl text-white text-sm font-bold shadow-xl border border-white/10">
                {currentStory.text_content}
              </span>
            </div>
          )}
        </div>

        {/* Desktop Controls */}
        <div className="hidden sm:block">
          <button 
            onClick={handlePrev}
            className="absolute left-10 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
            style={{ opacity: index === 0 ? 0.3 : 1 }}
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button 
            onClick={handleNext}
            className="absolute right-10 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>

        {/* Mobile Tap Zones */}
        <div className="absolute inset-0 z-10 flex sm:hidden">
            <div className="w-[30%] h-full" onClick={handlePrev} />
            <div className="w-[40%] h-full" onClick={() => setIsPaused(!isPaused)} />
            <div className="w-[30%] h-full" onClick={handleNext} />
        </div>

        {/* Media Controls Overlay */}
        <div className="absolute bottom-8 right-6 z-20 flex items-center gap-4">
           {isVideo && (
             <button onClick={() => setIsMuted(!isMuted)} className="p-2 text-white/80 hover:text-white transition-colors">
               {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
             </button>
           )}
           <button onClick={() => setIsPaused(!isPaused)} className="p-2 text-white/80 hover:text-white transition-colors">
              {isPaused ? <Play className="w-6 h-6" fill="currentColor" /> : <Pause className="w-6 h-6" fill="currentColor" />}
           </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
