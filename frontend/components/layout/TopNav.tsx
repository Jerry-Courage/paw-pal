'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  Brain, LayoutDashboard, Calendar, BookOpen, FileText,
  LayoutGrid, Users, Sparkles, Settings, LogOut,
  Menu, X, Bell, Search, ChevronDown
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/utils'
import NotificationsPanel from '@/components/layout/NotificationsPanel'
import SearchBar from '@/components/layout/SearchBar'

const NAV_ITEMS = [
  { href: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/library',     icon: BookOpen,        label: 'Library' },
  { href: '/planner',     icon: Calendar,        label: 'Planner' },
  { href: '/assignments', icon: FileText,        label: 'Assignments' },
  { href: '/workspace',   icon: LayoutGrid,      label: 'Collab' },
  { href: '/community',   icon: Users,           label: 'Community' },
  { href: '/ai',          icon: Sparkles,        label: 'AI' },
]

export default function TopNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const name = session?.user?.name || session?.user?.email || 'User'

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#111]/95 backdrop-blur-xl border-b border-white/5 flex items-center px-4 md:px-6 gap-4"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 mr-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <span className="text-sm font-black text-white uppercase tracking-tight hidden sm:block">
            Flow<span className="text-orange-500">State</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  active
                    ? 'bg-orange-500/10 text-orange-400'
                    : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <div className="hidden md:block">
            <SearchBar />
          </div>
          <NotificationsPanel />
          <div className="relative group">
            <button className="flex items-center gap-2 p-1 rounded-xl hover:bg-white/5 transition-all">
              <div className="w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-black">
                {getInitials(name)}
              </div>
              <ChevronDown className="w-3 h-3 text-slate-500 hidden md:block" />
            </button>
            {/* Dropdown */}
            <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a] border border-white/8 rounded-2xl shadow-2xl overflow-hidden opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-xs font-black text-white truncate">{name}</p>
                <p className="text-[10px] text-slate-600 truncate">{session?.user?.email}</p>
              </div>
              <Link href="/settings" className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                <Settings className="w-3.5 h-3.5" /> Settings
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-all w-full"
              >
                <LogOut className="w-3.5 h-3.5" /> Log out
              </button>
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60] md:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed top-0 left-0 h-full w-72 bg-[#111] border-r border-white/5 z-[70] flex flex-col md:hidden animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <Link href="/dashboard" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                  <Brain className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <span className="text-sm font-black text-white uppercase tracking-tight">
                  Flow<span className="text-orange-500">State</span>
                </span>
              </Link>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {NAV_ITEMS.map(item => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                      active ? 'bg-orange-500/10 text-orange-400' : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <div className="px-3 py-4 border-t border-white/5 space-y-0.5">
              <Link href="/settings" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all">
                <Settings className="w-4 h-4" /> Settings
              </Link>
              <button onClick={() => signOut({ callbackUrl: '/login' })} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/5 w-full transition-all">
                <LogOut className="w-4 h-4" /> Log out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
