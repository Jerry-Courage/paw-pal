'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, BookOpen, Users, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/library',   icon: BookOpen,        label: 'Library' },
  { href: '/planner',   icon: Calendar,        label: 'Planner' },
  { href: '/ai',        icon: Zap,             label: 'AI' },
  { href: '/community', icon: Users,           label: 'Community' },
]

export default function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#111]/95 backdrop-blur-xl border-t border-white/5 flex md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {navItems.map(item => {
        const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all',
              active ? 'text-orange-400' : 'text-slate-600 hover:text-slate-400'
            )}
          >
            {active && <div className="absolute top-0 w-6 h-0.5 bg-orange-500 rounded-b-full" />}
            <item.icon className={cn('w-5 h-5', active && 'stroke-[2.5]')} />
            <span className="text-[10px] font-bold">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
