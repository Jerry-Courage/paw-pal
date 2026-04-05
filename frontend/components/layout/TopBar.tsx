'use client'

import { useSession } from 'next-auth/react'
import { Menu, Zap } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import ThemeToggle from '@/components/ui/ThemeToggle'
import SearchBar from '@/components/layout/SearchBar'
import NotificationsPanel from '@/components/layout/NotificationsPanel'
import Link from 'next/link'

interface Props {
  onMenuClick?: () => void
}

export default function TopBar({ onMenuClick }: Props) {
  const { data: session } = useSession()
  const name = session?.user?.name || session?.user?.email || 'User'

  return (
    <header className="h-16 glass-panel border-b-0 sticky top-0 z-[40] flex items-center px-4 md:px-6 gap-3 flex-shrink-0">
      {/* Mobile: hamburger + logo */}
      <div className="flex items-center gap-3 md:hidden">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-xl text-slate-600 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/50 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-lg text-slate-900 dark:text-white tracking-tight">FlowState</span>
        </Link>
      </div>

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
