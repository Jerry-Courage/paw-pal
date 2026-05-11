'use client'

import { Loader2, Sparkles } from 'lucide-react'

export default function Loading() {
  return (
    <div className="w-full h-[60vh] flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse"></div>
        <div className="relative w-24 h-24 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center shadow-2xl">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
        <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-violet-500 animate-sparkle" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">Syncing your workspace...</h3>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading your AI study companions</p>
      </div>
      
      {/* Skeleton Mockup */}
      <div className="w-full max-w-4xl mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 opacity-20 filter blur-[1px]">
        <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-3xl"></div>
        <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-3xl"></div>
        <div className="h-48 col-span-full bg-slate-200 dark:bg-slate-800 rounded-3xl"></div>
      </div>
    </div>
  )
}
