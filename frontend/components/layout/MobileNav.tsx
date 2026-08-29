'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import FlowSoundControl from '@/components/ui/FlowSoundControl'

const ALL_BOTTOM_ITEMS = [
  { href: '/dashboard',   icon: 'home',           label: 'Home' },
  { href: '/learn',       icon: 'route',          label: 'Journey' },
  { href: '/ai',          icon: 'flare',          label: 'Flow' },
  { href: '/settings',    icon: 'person',         label: 'You' },
]

const ALL_DRAWER_ITEMS = [
  { href: '/library',     icon: 'menu_book',       label: 'Sources' },
  { href: '/assignments', icon: 'edit_document',   label: 'Assignments' },
  { href: '/groups',      icon: 'bolt',            label: 'Battle' },
  { href: '/workspace',   icon: 'group_work',      label: 'Collab' },
  { href: '/marketplace', icon: 'storefront',      label: 'Marketplace' },
  { href: '/library',     icon: 'view_in_ar',      label: 'VR' },
  { href: '/settings',    icon: 'settings',        label: 'Settings', utility: true },
  { href: '/upgrade',     icon: 'workspace_premium', label: 'Subscription', utility: true },
]

const FULL_VIEWPORT_PREFIXES = ['/workspace/', '/library/', '/groups']

export default function MobileNav() {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const BOTTOM_ITEMS = ALL_BOTTOM_ITEMS
  const DRAWER_ITEMS = ALL_DRAWER_ITEMS

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
          <div className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[2rem] border-t border-white/[.08] bg-background-elevated shadow-[0_-24px_80px_rgba(0,0,0,.55)] md:hidden animate-in slide-in-from-bottom duration-250">
            <div className="flex items-center justify-between px-stack-md pb-stack-md border-b border-outline-variant/20 mobile-drawer-header-safe">
              <div className="flex items-center gap-2">
                <img src="/images/logo-icon.png" alt="FlowState" className="w-8 h-8 rounded-[0.5rem] object-contain" />
                <span className="text-[22px] font-bold text-primary">FlowState</span>
              </div>
              <button
                type="button"
                aria-label="Close Explore"
                onClick={() => setDrawerOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface-hover"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>
            <nav className="flex-1 px-stack-sm py-stack-md space-y-base overflow-y-auto"><p className="px-stack-sm text-[10px] font-black uppercase tracking-[.2em] text-flow-orange">Explore FlowState</p>
              {DRAWER_ITEMS.map((item, index) => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'flex items-center gap-base px-stack-sm py-[10px] rounded-[1rem] font-semibold text-[14px] transition-all',
                      item.utility && !DRAWER_ITEMS[index - 1]?.utility && 'mt-3 border-t border-white/[.08] pt-4',
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
              <div className="mb-3"><p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Sound</p><FlowSoundControl /></div>
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
