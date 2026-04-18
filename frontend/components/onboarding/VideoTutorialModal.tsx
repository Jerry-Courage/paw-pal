'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, X, Zap, Sparkles, BookOpen, Users, Brain, MousePointer2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import axios from 'axios'

interface Feature {
  icon: any
  title: string
  description: string
  color: string
}

const FEATURES: Feature[] = [
  {
    icon: BookOpen,
    title: 'Smart Study Library',
    description: 'Upload PDFs, YouTube links, or notes to generate instant study kits.',
    color: 'text-sky-500 bg-sky-500/10'
  },
  {
    icon: Sparkles,
    title: 'AI Personal Tutor',
    description: 'Chat with an AI that knows your specific materials inside and out.',
    color: 'text-violet-500 bg-violet-500/10'
  },
  {
    icon: Users,
    title: 'Collab Spaces',
    description: 'Study with friends in real-time with shared AI intelligence.',
    color: 'text-emerald-500 bg-emerald-500/10'
  },
  {
    icon: Zap,
    title: 'Spaced Repetition',
    description: 'Auto-generated flashcards scheduled to maximize your retention.',
    color: 'text-orange-500 bg-orange-500/10'
  }
]

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function VideoTutorialModal({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'video' | 'features'>('video')
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  // Fetch config from backend
  useEffect(() => {
    if (isOpen) {
      axios.get('/api/users/config/')
        .then((res: any) => {
          setVideoUrl(res.data.tutorial_video_url || 'https://www.youtube.com/embed/dQw4w9WgXcQ')
          setIsLoading(false)
        })
        .catch((err: any) => {
          console.error('Failed to fetch tutorial config:', err)
          setIsLoading(false)
        })
    }
  }, [isOpen])

  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const isLocalFile = videoUrl.toLowerCase().match(/\.(mp4|webm|ogg)$/) || videoUrl.includes('/media/system/videos/')

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20 dark:border-slate-800 flex flex-col md:flex-row h-[85vh] md:h-auto max-h-[800px]"
          >
            {/* Left side: Video / Feature List */}
            <div className="flex-1 p-6 md:p-8 flex flex-col min-w-0 h-full">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl">
                      <Brain className="w-6 h-6 text-primary" />
                    </div>
                    Mastering FlowState
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Quick guide to your new AI study space</p>
                </div>
                
                {/* Close for mobile */}
                <button onClick={onClose} className="md:hidden p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-2xl mb-6 self-start">
                <button
                  onClick={() => setActiveTab('video')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'video' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  <Play className="w-3.5 h-3.5" /> Walkthrough Video
                </button>
                <button
                  onClick={() => setActiveTab('features')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'features' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  <MousePointer2 className="w-3.5 h-3.5" /> Feature Glossary
                </button>
              </div>

              {activeTab === 'video' ? (
                <div className="flex-1 bg-slate-100 dark:bg-black rounded-3xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800 relative group flex items-center justify-center">
                  {isLoading ? (
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      <p className="text-sm font-bold text-slate-400">Loading Walkthrough...</p>
                    </div>
                  ) : isLocalFile ? (
                    <video
                      src={videoUrl}
                      controls
                      autoPlay
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <iframe
                      src={videoUrl}
                      className="w-full h-full aspect-video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  )}
                </div>
              ) : (
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto pr-2 custom-scrollbar">
                  {FEATURES.map((f, i) => (
                    <motion.div
                      key={f.title}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="p-5 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800/50 group hover:border-primary/30 transition-colors"
                    >
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", f.color)}>
                        <f.icon className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1">{f.title}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{f.description}</p>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Right side: Summary / Action */}
            <div className="w-full md:w-80 bg-slate-50 dark:bg-slate-800/30 p-8 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800">
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 block">Pro Tip</span>
                  <p className="text-xs text-slate-600 dark:text-slate-400 italic font-medium leading-relaxed">
                    "You can upload your first PDF in the Library to generate a study kit in seconds!"
                  </p>
                </div>

                <div className="space-y-4">
                  <h5 className="text-xs font-black uppercase tracking-widest text-slate-400 px-1">Quick Links</h5>
                  {[
                    { label: 'Community Support', icon: Users },
                    { label: 'Official Documentation', icon: BookOpen },
                  ].map((link) => (
                    <button key={link.label} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white dark:hover:bg-slate-800 text-sm font-bold text-slate-600 dark:text-slate-300 transition-all border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
                      <link.icon className="w-4 h-4 text-slate-400" />
                      {link.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <button
                  onClick={onClose}
                  className="w-full btn-primary py-4 rounded-2xl text-base shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  🚀 Start Learning
                </button>
                <p className="text-[10px] text-center text-slate-400 font-medium">
                  By continuing, you agree to our Terms of Service.
                </p>
              </div>
            </div>

            {/* Close for desktop */}
            <button
              onClick={onClose}
              className="hidden md:flex absolute top-4 right-4 p-2.5 rounded-full bg-white/50 dark:bg-slate-800/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 backdrop-blur-sm border border-white/20 dark:border-slate-700 transition-all hover:rotate-90"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
