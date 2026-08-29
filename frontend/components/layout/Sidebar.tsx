'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import FlowSoundControl from '@/components/ui/FlowSoundControl'

const ALL_NAV_ITEMS = [
  { href: '/dashboard',   icon: 'home',            label: 'Home' },
  { href: '/learn',       icon: 'route',           label: 'Journey' },
  { href: '/ai',          icon: 'flare',           label: 'Flow' },
  { href: '/settings',    icon: 'person',          label: 'You' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [expanded, setExpanded] = useState(false)
  const [secondaryOpen, setSecondaryOpen] = useState(false)
  const leaveTimer = useRef<NodeJS.Timeout | null>(null)
  const name = session?.user?.name || session?.user?.email || 'Student'

  const NAV_ITEMS = ALL_NAV_ITEMS

  const handleMouseEnter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    setExpanded(true)
  }

  const handleMouseLeave = () => {
    leaveTimer.current = setTimeout(() => setExpanded(false), 300)
  }

  return (
    <aside
      data-expanded={expanded}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'peer/sidebar fixed left-0 top-0 h-screen flex flex-col border-r border-white/[.055] bg-background-elevated/95 shadow-[18px_0_50px_rgba(0,0,0,.12)] backdrop-blur-xl z-40 hidden md:flex',
        'transition-[width] duration-300 ease-in-out overflow-hidden',
        // Collapsed: icon-only (w-[68px]), Expanded: full width (w-64)
        expanded ? 'w-64 rounded-r-[1rem]' : 'w-[68px] rounded-r-[1rem]'
      )}
    >
      {/* ── Brand ───────────────────────────────────── */}
      <div className="flex items-center gap-3 px-[14px] pt-6 pb-4 shrink-0 overflow-hidden">
        <Link href="/dashboard" className="shrink-0">
          <img src="/images/logo-icon.png" alt="FlowState" className="w-10 h-10 rounded-[0.65rem] object-contain" />
        </Link>
        <div className={cn('min-w-0 transition-all duration-200', expanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 pointer-events-none')}>
          <Link href="/dashboard">
            <h1 className="text-[18px] font-bold text-primary leading-none whitespace-nowrap">FlowState</h1>
          </Link>
          <p className="text-[11px] text-on-surface-variant truncate whitespace-nowrap">{name}</p>
        </div>
      </div>

      {/* ── Nav links ───────────────────────────────── */}
      <nav className="flex flex-col gap-1 px-[10px] flex-1 overflow-y-auto scrollbar-hide">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!expanded ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 px-[10px] py-[10px] rounded-[1rem] font-semibold text-[14px] transition-all relative',
                'whitespace-nowrap overflow-hidden',
                active
                  ? 'bg-primary-container text-on-primary-container shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              )}
            >
              {/* Icon — always visible */}
              <span
                className="material-symbols-outlined text-[22px] shrink-0"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>

              {/* Label — only visible when expanded */}
              <span className={cn(
                'transition-all duration-200 flex-1',
                expanded ? 'opacity-100' : 'opacity-0 w-0'
              )}>
                {item.label}
              </span>

            </Link>
          )
        })}
      </nav>

      {/* ── Bottom section ──────────────────────────── */}
      <div className="px-[10px] pb-4 mt-auto space-y-2 shrink-0">
        <div className={cn('transition-opacity', expanded ? 'opacity-100' : 'opacity-80')}>
          <FlowSoundControl compact={!expanded} />
        </div>

        {/* Secondary destinations + logout */}
        <div className="flex items-center justify-between gap-1">
          <button
            onClick={() => setSecondaryOpen(true)}
            title={!expanded ? 'Explore' : undefined}
            className={cn(
              'flex items-center gap-3 px-[10px] py-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all text-[13px] font-semibold overflow-hidden whitespace-nowrap',
              expanded ? 'flex-1' : ''
            )}
          >
            <span className="material-symbols-outlined text-[18px] shrink-0">apps</span>
            <span className={cn('transition-all duration-200', expanded ? 'opacity-100' : 'opacity-0 w-0')}>
              Explore
            </span>
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/login?loggedOut=true' })}
            className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high hover:text-error transition-all shrink-0"
            title="Log out"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>
      </div>
      {secondaryOpen && <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" onClick={() => setSecondaryOpen(false)}><section role="dialog" aria-modal="true" aria-label="Explore FlowState" onClick={event => event.stopPropagation()} className="absolute bottom-4 left-[72px] w-72 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[1.25rem] border border-white/[.08] bg-background-elevated p-4 shadow-[0_20px_60px_rgba(0,0,0,.5)]"><button onClick={() => setSecondaryOpen(false)} aria-label="Close Explore" className="float-right grid h-9 w-9 place-items-center rounded-full text-on-surface-variant hover:bg-surface-hover hover:text-on-surface"><span className="material-symbols-outlined text-lg">close</span></button><p className="flow-eyebrow pt-2">Explore</p><div className="mt-3 grid gap-0.5">{[
        ['Sources', '/library', 'menu_book', 'Your learning material'], ['Assignments', '/assignments', 'edit_document', 'Work through coursework with Flow'], ['Battle', '/groups', 'bolt', 'Challenge friends'], ['Collab', '/workspace', 'group_work', 'Learn together'], ['Marketplace', '/marketplace', 'storefront', 'Spend FlowCoins'], ['VR', '/library', 'view_in_ar', 'Immersive learning from a Source'],
      ].map(([label, href, icon]) => <Link key={label} href={href} onClick={() => setSecondaryOpen(false)} className="group flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-hover hover:text-on-surface"><span className="material-symbols-outlined text-lg text-flow-orange">{icon}</span>{label}</Link>)}</div><div className="mt-2 border-t border-white/[.07] pt-2">{[['Settings', '/settings', 'settings'], ['Subscription', '/upgrade', 'workspace_premium']].map(([label, href, icon]) => <Link key={href} href={href} onClick={() => setSecondaryOpen(false)} className="flex min-h-10 items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-hover hover:text-on-surface"><span className="material-symbols-outlined text-base">{icon}</span>{label}</Link>)}</div></section></div>}
    </aside>
  )
}
