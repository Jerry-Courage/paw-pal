'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { authApi, paymentsApi, workspaceApi } from '@/lib/api'
import { cn, getInitials } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard',   icon: 'home',            label: 'Home' },
  { href: '/library',     icon: 'menu_book',       label: 'My Library' },
  { href: '/planner',     icon: 'calendar_today',  label: 'Planner' },
  { href: '/assignments', icon: 'edit_document',   label: 'Assignments' },
  { href: '/workspace',   icon: 'group_work',      label: 'Collab Space' },
  { href: '/ai',          icon: 'smart_toy',       label: 'AI Assistant' },
  { href: '/groups',      icon: 'group',           label: 'Study Groups' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const name = session?.user?.name || session?.user?.email || 'Student'
  const email = session?.user?.email || ''

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

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col bg-surface-container-low rounded-r-[1rem] shadow-lg z-40 hidden md:flex">
      {/* Brand */}
      <div className="p-stack-md pt-stack-lg mb-base">
        <Link href="/dashboard">
          <h1 className="text-[22px] font-bold text-primary leading-none">FlowState</h1>
        </Link>
      </div>

      {/* User info */}
      <div className="flex items-center gap-base px-stack-md mb-stack-md">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-sm shrink-0 overflow-hidden">
          {(session?.user as any)?.avatar ? (
            <img src={(session?.user as any).avatar} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span>{getInitials(name)}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-on-surface truncate">Welcome back!</p>
          <p className="text-[11px] text-on-surface-variant truncate">{name}</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-base px-stack-sm flex-1 overflow-y-auto scrollbar-hide">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          const showBadge = item.href === '/workspace' && totalUnread > 0

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-base px-stack-sm py-[10px] rounded-[1rem] font-[600] text-[14px] transition-all relative',
                active
                  ? 'bg-primary-container text-on-primary-container shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              )}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
              {showBadge && (
                <span className="ml-auto bg-primary text-on-primary text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-stack-md mt-auto space-y-stack-sm">
        {/* Free tier usage bar */}
        {!isPremium && (
          <div className="bg-surface-container rounded-[1rem] p-stack-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Study Kits</span>
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
            className="flex items-center gap-base px-stack-sm py-[10px] rounded-[1rem] bg-secondary-container text-on-secondary-container font-bold text-[13px] hover:brightness-110 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              workspace_premium
            </span>
            Go Premium
          </Link>
        )}

        {isPremium && (
          <div className="flex items-center gap-base px-stack-sm py-[10px] rounded-[1rem] bg-primary/10 text-primary text-[13px] font-bold">
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              workspace_premium
            </span>
            Premium Active
          </div>
        )}

        {/* Settings + Logout */}
        <div className="flex items-center justify-between">
          <Link
            href="/settings"
            className="flex items-center gap-base px-stack-sm py-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high transition-all text-[13px] font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">settings</span>
            Settings
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="p-2 rounded-[1rem] text-on-surface-variant hover:bg-surface-container-high hover:text-error transition-all"
            title="Log out"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
