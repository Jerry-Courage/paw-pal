'use client'

import { Sparkles, Search } from 'lucide-react'

export default function CommunityHeader() {
  return (
    <div className="mb-6 pb-4 border-b border-white/5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            Student <span className="text-orange-400">Nexus</span>
            <Sparkles className="w-4 h-4 text-orange-400 animate-pulse" />
          </h1>
          <p className="text-slate-500 text-sm">Connect, collaborate, and conquer your goals together.</p>
        </div>
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
          <input
            type="text"
            placeholder="Search discussions, rooms, or events..."
            className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/8 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/30 transition-all"
          />
        </div>
      </div>
    </div>
  )
}
