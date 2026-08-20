'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { paymentsApi, workspaceApi } from '@/lib/api'
import { cn, getInitials } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard',   icon: 'home',            label: 'Home' },
  { href: '/library',     icon: 'menu_book',       label: 'My Library' },
  { href: '/learn',       icon: 'school',          label: 'Learn' },
  { href: '/assignments', icon: 'edit_document',   label: 'Assignments' },
  { href: '/workspace',   icon: 'group_work',      label: 'Collab Space' },
  { href: '/ai',          icon: 'smart_toy',       label: 'AI Assistant' },
  { href: '/groups',      icon: 'bolt',            label: 'Quiz Battle' },
  { href: '/rankings',    icon: 'leaderboard',     label: 'Rankings' },
  { href: '/marketplace', icon: 'storefront',      label: 'Marketplace' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [expanded, setExpanded] = useState(false)
  const leaveTimer = useRef<NodeJS.Timeout | null>(null)
  const name = session?.user?.name || session?.user?.email || 'Student'

  const { data: subStatus } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => paymentsApi.getStatus().then(r => r.data),
    staleTime: 60000,
    enabled: !!session,
  })

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.getAll().then(r => r.data),
    staleTime: 30000,
    enabled: !!session,
  })

  const workspaces = Array.isArray(workspacesData) ? workspacesData : workspacesData?.results || []
  const totalUnread = workspaces.reduce((sum: number, ws: any) => sum + (ws.unread_count || 0), 0)
  const notesUsed = subStatus?.notes_used ?? 0
  const notesLimit = subStatus?.notes_limit ?? 5
  const isPremium = subStatus?.is_premium ?? false

  const handleMouseEnter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    setExpanded(true)
  }

  const handleMouseLeave = () => {
    leaveTimer.current = setTimeout(() => setExpanded(false), 300)
  }

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'fixed left-0 top-0 h-screen flex flex-col bg-surface-container-low shadow-lg z-40 hidden md:flex',
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
          const showBadge = item.href === '/workspace' && totalUnread > 0

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

              {/* Unread badge */}
              {showBadge && expanded && (
                <span className="ml-auto bg-primary text-on-primary text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}

              {/* Dot badge when collapsed */}
              {showBadge && !expanded && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── Bottom section ──────────────────────────── */}
      <div className="px-[10px] pb-4 mt-auto space-y-2 shrink-0">

        {/* Free tier usage — only when expanded */}
        {!isPremium && expanded && (
          <div className="bg-surface-container rounded-[1rem] p-3 overflow-hidden">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Study Kits</span>
              <span className="text-[11px] font-bold text-primary">{notesUsed}/{notesLimit}</span>
            </div>
            <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(100, (notesUsed / notesLimit) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Go Premium */}
        {!isPremium && (
          <Link
            href="/upgrade"
            title={!expanded ? 'Go Premium' : undefined}
            className={cn(
              'flex items-center gap-3 px-[10px] py-[10px] rounded-[1rem] bg-secondary-container text-on-secondary-container font-bold text-[13px] hover:brightness-110 transition-all overflow-hidden whitespace-nowrap',
            )}
          >
            <span className="material-symbols-outlined text-[20px] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
              workspace_premium
            </span>
            <span className={cn('transition-all duration-200', expanded ? 'opacity-100' : 'opacity-0 w-0')}>
              Go Premium
            </span>
          </Link>
        )}

        {isPremium && (
          <div
            title={!expanded ? 'Premium Active' : undefined}
            className="flex items-center gap-3 px-[10px] py-[10px] rounded-[1rem] bg-primary/10 text-primary text-[13px] font-bold overflow-hidden whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[18px] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
              workspace_premium
            </span>
            <span className={cn('transition-all duration-200', expanded ? 'opacity-100' : 'opacity-0 w-0')}>
              Premium Active
            </span>
          </div>
        )}

        {/* Settings + Logout */}
        <div className="flex items-center justify-between gap-1">
          <Link
            href="/settings"
            title={!expanded ? 'Settings' : undefined}
            className={cn(
              'flex items-center gap-3 px-[10px] py-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all text-[13px] font-semibold overflow-hidden whitespace-nowrap',
              expanded ? 'flex-1' : ''
            )}
          >
            <span className="material-symbols-outlined text-[18px] shrink-0">settings</span>
            <span className={cn('transition-all duration-200', expanded ? 'opacity-100' : 'opacity-0 w-0')}>
              Settings
            </span>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login?loggedOut=true' })}
            className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high hover:text-error transition-all shrink-0"
            title="Log out"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
