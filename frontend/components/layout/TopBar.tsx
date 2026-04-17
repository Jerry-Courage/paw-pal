'use client'

import { useSession } from 'next-auth/react'
import { Menu, Zap, ChevronRight, Brain } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import ThemeToggle from '@/components/ui/ThemeToggle'
import SearchBar from '@/components/layout/SearchBar'
import NotificationsPanel from '@/components/layout/NotificationsPanel'
import Link from 'next/link'

interface Props {
  onMenuClick?: () => void
  onToggleSidebar?: () => void
  isSidebarOpen?: boolean
}

export default function TopBar({ onMenuClick, onToggleSidebar, isSidebarOpen }: Props) {
  const { data: session } = useSession()
  const name = session?.user?.name || session?.user?.email || 'User'

  return (
    <header className="h-16 glass-panel border-b-0 sticky top-0 z-[40] flex items-center px-4 md:px-6 gap-3 flex-shrink-0">
      {/* Mobile: hamburger + Techy Logo */}
      <div className="flex items-center gap-3 md:hidden">
        <button
          onClick={onMenuClick}
          className="p-2.5 rounded-xl text-slate-600 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/50 transition-colors bg-white/5 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800/50 shadow-sm"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/dashboard" className="group flex items-center gap-2">
          {/* New Premium Brain Icon for Mobile */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary via-violet-600 to-indigo-700 p-[1.5px] shadow-lg shadow-primary/20">
            <div className="w-full h-full bg-slate-950 rounded-[6.5px] flex items-center justify-center">
              <Brain className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black tracking-[0.3em] bg-gradient-to-r from-primary via-violet-500 to-primary bg-[length:200%_auto] bg-clip-text text-transparent uppercase leading-tight">
              Flow
            </span>
            <span className="text-[7px] font-black tracking-[0.4em] text-slate-500 uppercase leading-none opacity-80">
              State
            </span>
          </div>
        </Link>
      </div>

      {/* Desktop Toggle (When sidebar is hidden) */}
      {!isSidebarOpen && (
        <button 
          onClick={onToggleSidebar}
          className="hidden md:flex p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-primary bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all shadow-lg shadow-primary/5 active:scale-95 group"
          title="Open Sidebar"
        >
          <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      <SearchBar />

      <div className="flex items-center gap-2 flex-shrink-0">
        <ThemeToggle />
        <NotificationsPanel />
        <div className="w-9 h-9 bg-gradient-to-br from-primary to-violet-500 shadow-md rounded-full flex items-center justify-center text-white text-xs font-bold cursor-pointer flex-shrink-0 transform hover:scale-105 transition-transform">
          {getInitials(name)}
        </div>
      </div>
    </header>
  )
}
