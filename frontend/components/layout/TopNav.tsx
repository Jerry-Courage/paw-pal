'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  Brain, LayoutDashboard, Calendar, BookOpen, FileText,
  LayoutGrid, Sparkles, Zap, Settings, LogOut,
  Menu, X, Bell, Search, ChevronDown
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/utils'
import NotificationsPanel from '@/components/layout/NotificationsPanel'
import SearchBar from '@/components/layout/SearchBar'
import { useQuery } from '@tanstack/react-query'
import { workspaceApi } from '@/lib/api'

const NAV_ITEMS = [
  { href: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/library',     icon: BookOpen,        label: 'Library' },
  { href: '/planner',     icon: Calendar,        label: 'Planner' },
  { href: '/assignments', icon: FileText,        label: 'Assignments' },
  { href: '/workspace',   icon: LayoutGrid,      label: 'Collab' },
  { href: '/ai',          icon: Sparkles,        label: 'AI' },
]

export default function TopNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const name = session?.user?.name || session?.user?.email || 'User'

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.getAll().then(r => r.data),
    staleTime: 30000,
    enabled: !!session,
  })
  const workspaces = Array.isArray(workspacesData) ? workspacesData : workspacesData?.results || []
  const totalUnread = workspaces.reduce((sum: number, ws: any) => sum + (ws.unread_count || 0), 0)

  const isAssignmentDetail = pathname.includes('/assignments/') && pathname.split('/').length > 2
  if (isAssignmentDetail) return null

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0f0f0f]/90 backdrop-blur-2xl">
        {/* Safe area spacer */}
        <div style={{ height: 'env(safe-area-inset-top)' }} />
        
        {/* Actual nav content */}
        <div className="h-14 flex items-center px-4 md:px-6 gap-3">

          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 mr-3 group">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center overflow-hidden p-0.5 group-hover:bg-orange-500/20 group-hover:border-orange-500/40 transition-all shadow-lg shadow-orange-500/20">
              <img src="/images/logo-icon.png" alt="Flow State" className="w-full h-full object-contain" />
            </div>
            <span className="text-base font-black text-white uppercase tracking-widest hidden sm:block">
              Flow <span className="text-orange-500">State</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1">
            {NAV_ITEMS.map(item => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              const showBadge = item.href === '/workspace' && totalUnread > 0
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap group',
                    active
                      ? 'text-white bg-white/5'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'
                  )}
                >
                  <item.icon className={cn('w-3.5 h-3.5 transition-colors', active ? 'text-orange-400' : '')} />
                  {item.label}
                  {showBadge && (
                    <span className="ml-0.5 px-1.5 py-0.5 bg-orange-500 text-white text-[9px] font-black rounded-full min-w-[16px] text-center leading-none shadow-lg shadow-orange-500/30">
                      {totalUnread > 9 ? '9+' : totalUnread}
                    </span>
                  )}
                  {/* Glowing active indicator */}
                  {active && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-gradient-to-r from-orange-500 to-amber-400 rounded-full shadow-sm shadow-orange-500/60" />
                  )}
                </Link>
              )
            })}
            <div className="ml-3">
              <SearchBar />
            </div>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <NotificationsPanel />

            {/* User avatar + dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-1.5 py-1 rounded-xl hover:bg-white/5 transition-all">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0 ring-2 ring-orange-500/20 group-hover:ring-orange-500/50 transition-all shadow-md shadow-orange-500/20">
                  {getInitials(name)}
                </div>
                <ChevronDown className="w-3 h-3 text-slate-600 hidden md:block group-hover:text-slate-400 transition-colors" />
              </button>

              {/* Dropdown */}
              <div className="absolute right-0 top-full mt-2 w-52 bg-[#161616] border border-white/[0.06] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-150 animate-in fade-in slide-in-from-top-2">
                <div className="px-4 py-3.5 border-b border-white/5 bg-white/[0.01]">
                  <p className="text-xs font-black text-white truncate">{name}</p>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">{session?.user?.email}</p>
                </div>
                <div className="p-1">
                  <Link href="/settings" className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                    <Settings className="w-3.5 h-3.5" /> Settings
                  </Link>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/5 transition-all w-full"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Log out
                  </button>
                </div>
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
        </div>

        {/* Gradient divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed top-0 left-0 h-full w-72 bg-[#111] border-r border-white/[0.06] z-[70] flex flex-col md:hidden animate-in slide-in-from-left duration-250">
            {/* Drawer header */}
            <div
              className="flex items-center justify-between px-5 border-b border-white/[0.06]"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)', paddingBottom: '16px' }}
            >
              <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center overflow-hidden shadow-lg shadow-orange-500/10">
                  <img src="/images/logo-icon.png" alt="Flow State" className="w-full h-full object-contain" />
                </div>
                <span className="text-base font-black text-white uppercase tracking-tight">
                  Flow <span className="text-orange-500">State</span>
                </span>
              </Link>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer nav */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {NAV_ITEMS.map(item => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                const showBadge = item.href === '/workspace' && totalUnread > 0
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all relative overflow-hidden',
                      active
                        ? 'bg-orange-500/10 text-white border-l-2 border-orange-500'
                        : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                    )}
                  >
                    <item.icon className={cn('w-4 h-4 shrink-0', active ? 'text-orange-400' : '')} />
                    <span className="flex-1">{item.label}</span>
                    {showBadge && (
                      <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[9px] font-black rounded-full min-w-[18px] text-center shadow-lg shadow-orange-500/30">
                        {totalUnread > 9 ? '9+' : totalUnread}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* Drawer footer */}
            <div className="px-3 py-4 border-t border-white/[0.06] space-y-0.5">
              <Link
                href="/settings"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all"
              >
                <Settings className="w-4 h-4" /> Settings
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/5 w-full transition-all"
              >
                <LogOut className="w-4 h-4" /> Log out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
