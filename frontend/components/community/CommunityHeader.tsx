'use client'

import { Sparkles, Search } from 'lucide-react'
import { motion } from 'framer-motion'

export default function CommunityHeader() {
  return (
    <div className="mb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-1"
        >
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Student <span className="sparkle-text">Nexus</span>
            <Sparkles className="w-5 h-5 text-sky-500 animate-pulse" />
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Connect, collaborate, and conquer your goals together.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="relative group md:w-80"
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search discussions, rooms, or events..."
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
          />
        </motion.div>
      </div>
    </div>
  )
}
