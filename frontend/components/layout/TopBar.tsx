'use client'

import { useSession } from 'next-auth/react'
import { Menu, Brain, ChevronRight } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import NotificationsPanel from '@/components/layout/NotificationsPanel'
import SearchBar from '@/components/layout/SearchBar'
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
    <header
      className="h-14 bg-[#111] border-b border-white/5 fixed top-0 left-0 right-0 z-40 flex items-center px-4 md:px-5 gap-3 flex-shrink-0"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Mobile: hamburger + logo */}
      <div className="flex items-center gap-3 md:hidden">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <span className="text-sm font-black text-white uppercase tracking-tight">
            Flow<span className="text-orange-500">State</span>
          </span>
        </Link>
      </div>

      {/* Desktop: show toggle when sidebar is hidden */}
      {!isSidebarOpen && (
        <button
          onClick={onToggleSidebar}
          className="hidden md:flex p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-all border border-white/8"
          title="Open Sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      <SearchBar />

      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
        <NotificationsPanel />
        <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-black cursor-pointer hover:bg-orange-400 transition-colors flex-shrink-0">
          {getInitials(name)}
        </div>
      </div>
    </header>
  )
}
