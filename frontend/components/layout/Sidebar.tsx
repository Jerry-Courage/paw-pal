'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Calendar, BookOpen, Users, Sparkles,
  Settings, LogOut, Zap, FileText, Layers, Phone, LayoutGrid,
  ChevronLeft, Brain
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { groupsApi } from '@/lib/api'

interface SidebarProps {
  onToggle?: () => void
  isOpen?: boolean
}

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/planner', icon: Calendar, label: 'Planner' },
  { href: '/library', icon: BookOpen, label: 'Library' },
  { href: '/assignments', icon: FileText, label: 'Assignments' },
  { href: '/workspace', icon: LayoutGrid, label: 'Collab Space' },
  { href: '/tutor-call', icon: Phone, label: 'Talk to a Tutor' },
  { href: '/community', icon: Users, label: 'Community' },
  { href: '/ai', icon: Sparkles, label: 'AI Assistant' },
]

const GROUP_COLORS = ['bg-emerald-400', 'bg-sky-400', 'bg-violet-400', 'bg-orange-400', 'bg-pink-400']

export default function Sidebar({ onToggle, isOpen = true }: SidebarProps) {
  const pathname = usePathname()

  const { data } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.getGroups('my').then((r) => r.data),
  })
  const groups = data?.results || []

  return (
    <aside className="w-64 bg-slate-50/80 dark:bg-slate-900/60 backdrop-blur-3xl border-r border-slate-200/50 dark:border-slate-800/50 flex flex-col h-full flex-shrink-0 relative overflow-hidden transition-all duration-300">
      {/* Dynamic Toggle Button - Fixed for Focus */}
      {/* Sidebar Toggle - Only 'Hide' version on Sidebar */}
      {onToggle && isOpen && (
        <button 
          onClick={onToggle}
          className="absolute -right-3 top-20 w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-primary transition-all z-20 shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:shadow-primary/30 active:scale-90 border-primary/20"
          title="Hide Sidebar"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Nav */}
      <nav className={cn(
        "flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar transition-opacity duration-300",
        !isOpen && "opacity-0"
      )}>
        <div className="flex flex-col items-center py-6 mb-8 gap-4 px-2">
          <Link href="/dashboard" className="group relative">
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-violet-600 to-indigo-700 p-[2px] shadow-[0_0_30px_rgba(139,92,246,0.3)] group-hover:scale-110 transition-transform duration-500">
               <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center overflow-hidden">
                  <Brain className="w-9 h-9 text-primary group-hover:animate-pulse transition-all" />
                  {/* Subtle Shimmer for High-Fidelity */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
               </div>
            </div>
          </Link>
          <div className="flex flex-col items-center pointer-events-none">
            <span className="text-xl font-black tracking-[0.4em] bg-gradient-to-r from-primary via-indigo-400 to-primary bg-[length:200%_auto] bg-clip-text text-transparent animate-shine uppercase">
              Flow
            </span>
            <span className="text-[10px] font-black tracking-[0.6em] text-slate-500 -mt-1 uppercase opacity-80">
              State
            </span>
          </div>
        </div>
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
                active
                  ? 'bg-primary text-white shadow-md shadow-primary/30 dark:bg-primary/20 dark:text-primary dark:shadow-none'
                  : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-100'
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}

        {/* My Groups */}
        {groups.length > 0 && (
          <div className="pt-5">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-600 px-3 mb-2 tracking-wider">MY GROUPS</p>
            {groups.map((g: any, i: number) => (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${GROUP_COLORS[i % GROUP_COLORS.length]}`} />
                <span className="truncate">{g.name}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/50 space-y-1">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/50 transition-all"
        >
          <Settings className="w-4 h-4" /> Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 w-full transition-all"
        >
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>
    </aside>
  )
}
