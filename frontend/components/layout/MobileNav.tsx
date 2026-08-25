'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const BOTTOM_ITEMS = [
  { href: '/dashboard',   icon: 'home',           label: 'Home' },
  { href: '/library',     icon: 'menu_book',      label: 'Library' },
  { href: '/groups',      icon: 'bolt',           label: 'Quiz' },
  { href: '/rankings',    icon: 'leaderboard',    label: 'Rankings' },
  { href: '/learn',       icon: 'school',         label: 'Learn' },
]

const DRAWER_ITEMS = [
  { href: '/dashboard',   icon: 'home',            label: 'Home' },
  { href: '/library',     icon: 'menu_book',       label: 'My Library' },
  { href: '/learn',       icon: 'school',          label: 'Learn' },
  { href: '/assignments', icon: 'edit_document',   label: 'Assignments' },
  { href: '/workspace',   icon: 'group_work',      label: 'Collab Space' },
  { href: '/ai',          icon: 'smart_toy',       label: 'AI Assistant' },
  { href: '/dashboard/personalised', icon: 'headphones', label: 'Personal Tutor' },
  { href: '/groups',      icon: 'bolt',            label: 'Quiz Battle' },
  { href: '/rankings',    icon: 'leaderboard',     label: 'Rankings' },
  { href: '/marketplace', icon: 'storefront',      label: 'Marketplace' },
  { href: '/settings',    icon: 'settings',        label: 'Settings' },
  { href: '/upgrade',     icon: 'workspace_premium', label: 'Upgrade' },
]

const FULL_VIEWPORT_PREFIXES = ['/workspace/', '/library/', '/groups']

export default function MobileNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isFullViewport =
    pathname === '/groups' ||
    pathname.startsWith('/groups/') ||
    pathname === '/dashboard/personalised' ||
    (FULL_VIEWPORT_PREFIXES.some(prefix => pathname.startsWith(prefix)) &&
    pathname.split('/').length > 3) ||
    /^\/workspace\/[^/]+$/.test(pathname) ||
    (pathname.includes('/assignments/') && !pathname.endsWith('/new'))

  if (isFullViewport) return null

  return (
    <>
      {/* Top bar (mobile only) */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-surface-container-low shadow-sm flex justify-between items-center px-margin-mobile mobile-header-safe">
        <Link href="/dashboard" className="flex items-center gap-2">
          <img src="/images/logo-icon.png" alt="FlowState" className="w-8 h-8 rounded-[0.5rem] object-contain" />
          <span className="text-[18px] font-bold text-primary">FlowState</span>
        </Link>
        <div className="flex items-center gap-base">
          <Link href="/ai">
            <span className="material-symbols-outlined text-primary p-1">smart_toy</span>
          </Link>
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1"
          >
            <span className="material-symbols-outlined text-on-surface-variant">menu</span>
          </button>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-container-low border-t border-outline-variant/20 flex justify-around items-center pt-3 nav-safe-bottom">
        {BOTTOM_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-[2px]',
                active ? 'text-primary' : 'text-on-surface-variant'
              )}
            >
              <span
                className="material-symbols-outlined text-[24px]"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span className="text-[9px] font-bold">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="fixed top-0 left-0 h-full w-72 bg-surface-container-low z-[70] flex flex-col md:hidden animate-in slide-in-from-left duration-250">
            <div className="flex items-center justify-between px-stack-md pb-stack-md border-b border-outline-variant/20 mobile-drawer-header-safe">
              <div className="flex items-center gap-2">
                <img src="/images/logo-icon.png" alt="FlowState" className="w-8 h-8 rounded-[0.5rem] object-contain" />
                <span className="text-[22px] font-bold text-primary">FlowState</span>
              </div>
              <button onClick={() => setDrawerOpen(false)}>
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>
            <nav className="flex-1 px-stack-sm py-stack-md space-y-base overflow-y-auto">
              {DRAWER_ITEMS.map(item => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'flex items-center gap-base px-stack-sm py-[10px] rounded-[1rem] font-semibold text-[14px] transition-all',
                      active
                        ? 'bg-primary-container text-on-primary-container'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    )}
                  >
                    <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <div className="p-stack-md border-t border-outline-variant/20">
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-base px-stack-sm py-[10px] rounded-[1rem] text-error hover:bg-error-container/10 w-full font-semibold text-[14px] transition-all"
              >
                <span className="material-symbols-outlined text-[22px]">logout</span>
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
