'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, BookOpen, Users, Sparkles, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/planner', icon: Calendar, label: 'Planner' },
  { href: '/library', icon: BookOpen, label: 'Library' },
  { href: '/workspace', icon: Sparkles, label: 'Studios' },
  { href: '/ai', icon: Zap, label: 'AI' },
]

export default function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 glass-panel border-t border-slate-200/50 dark:border-slate-800/50 flex md:hidden safe-bottom">
      {navItems.map((item) => {
        const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all duration-300 relative',
              active ? 'text-primary transform -translate-y-1' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            )}
          >
            {active && (
              <div className="absolute top-0 w-8 h-1 bg-primary rounded-b-full shadow-[0_0_8px_rgba(14,165,233,0.8)]"></div>
            )}
            <item.icon className={cn('w-5 h-5', active && 'stroke-[2.5]')} />
            <span className="text-xs font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
