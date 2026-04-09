'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Calendar, BookOpen, Users, Sparkles,
  Settings, LogOut, Zap, FileText, Layers, Phone
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { groupsApi } from '@/lib/api'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/planner', icon: Calendar, label: 'Planner' },
  { href: '/library', icon: BookOpen, label: 'Library' },
  { href: '/assignments', icon: FileText, label: 'Assignments' },
  { href: '/workspace', icon: Layers, label: 'Workspace' },
  { href: '/tutor-call', icon: Phone, label: 'Talk to a Tutor' },
  { href: '/community', icon: Users, label: 'Community' },
  { href: '/ai', icon: Sparkles, label: 'AI Assistant' },
]

const GROUP_COLORS = ['bg-emerald-400', 'bg-sky-400', 'bg-violet-400', 'bg-orange-400', 'bg-pink-400']

export default function Sidebar() {
  const pathname = usePathname()

  const { data } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.getGroups('my').then((r) => r.data),
  })
  const groups = data?.results || []

  return (
    <aside className="w-56 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-800/50 flex flex-col h-full flex-shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-slate-200/50 dark:border-slate-800/50">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-lg text-slate-900 dark:text-white tracking-tight">FlowState</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
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
