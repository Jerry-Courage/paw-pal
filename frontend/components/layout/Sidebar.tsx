'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard, Calendar, BookOpen, Sparkles,
  Settings, LogOut, FileText, LayoutGrid, ChevronLeft, Brain
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { groupsApi, workspaceApi } from '@/lib/api'

interface SidebarProps {
  onToggle?: () => void
  isOpen?: boolean
}

const navItems = [
  { href: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/planner',     icon: Calendar,        label: 'Planner' },
  { href: '/library',     icon: BookOpen,        label: 'Library' },
  { href: '/assignments', icon: FileText,        label: 'Assignments' },
  { href: '/workspace',   icon: LayoutGrid,      label: 'Collab Space' },
  { href: '/ai',          icon: Sparkles,        label: 'AI Assistant' },
]

const GROUP_COLORS = ['bg-emerald-400', 'bg-sky-400', 'bg-violet-400', 'bg-orange-400', 'bg-pink-400']

export default function Sidebar({ onToggle, isOpen = true }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.getGroups('my').then(r => r.data),
  })
  const groups = data?.results || []

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.getAll().then(r => r.data),
    refetchInterval: 30000, // Sync every 30s
  })
  const workspaces = Array.isArray(workspacesData) ? workspacesData : workspacesData?.results || []
  const totalUnreadWorkspaces = workspaces.reduce((sum: number, ws: any) => sum + (ws.unread_count || 0), 0)

  return (
    <aside className="w-64 bg-[#111] border-r border-white/5 flex flex-col h-full flex-shrink-0 relative overflow-hidden">
      {/* Collapse button */}
      {onToggle && isOpen && (
        <button
          onClick={onToggle}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all z-20 shadow-lg"
          title="Hide Sidebar"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Logo */}
      <div className="px-5 py-6 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center overflow-hidden group-hover:bg-orange-500/20 transition-all shadow-lg shadow-orange-500/5">
            <img src="/images/logo-icon.png" alt="Flow State" className="w-full h-full object-contain" />
          </div>
          <span className="text-base font-black text-white uppercase tracking-tight">
            Flow <span className="text-orange-500">State</span>
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
        {navItems.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                active
                  ? 'bg-orange-500/10 text-orange-400'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.href === '/workspace' && totalUnreadWorkspaces > 0 && (
                <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[9px] font-black rounded-full min-w-[18px] text-center shadow-lg shadow-orange-500/20">
                  {totalUnreadWorkspaces > 9 ? '9+' : totalUnreadWorkspaces}
                </span>
              )}
            </Link>
          )
        })}

        {/* Groups */}
        {groups.length > 0 && (
          <div className="pt-5">
            <p className="text-[10px] font-black text-slate-600 px-3 mb-2 tracking-widest uppercase">My Groups</p>
            {groups.map((g: any, i: number) => (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${GROUP_COLORS[i % GROUP_COLORS.length]}`} />
                <span className="truncate">{g.name}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-white/5 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all"
        >
          <Settings className="w-4 h-4" /> Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500/70 hover:text-red-400 hover:bg-red-500/5 w-full transition-all"
        >
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>
    </aside>
  )
}
