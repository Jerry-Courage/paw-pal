'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import MobileNav from '@/components/layout/MobileNav'
import { cn } from '@/lib/utils'
import { authApi } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'

import SplashScreen from '@/components/ui/SplashScreen'
import FeedbackPopup from '@/components/ui/FeedbackPopup'

// Pages that need full-viewport (no padding/scroll)
const FULL_VIEWPORT_PREFIXES = [
  '/workspace/',
  '/library/',   // sub-tools: /library/[id]/mindmap, /vr, etc.
  '/groups',     // Quiz Battle — full-screen Kahoot-style experience
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const focusMainRef = useRef<HTMLElement>(null)
  const isJourneyFocus = /^\/learn\/[^/]+$/.test(pathname)
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.me().then(response => response.data),
    enabled: status === 'authenticated',
    staleTime: 0,
  })

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated' || profileLoading || !profile) return
    if (!profile.onboarding_status?.completed) router.replace('/onboarding')
  }, [status, profileLoading, profile, router])

  useEffect(() => {
    if (!isJourneyFocus) return
    const frame = requestAnimationFrame(() => focusMainRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [isJourneyFocus, pathname])

  // Push notifications — retry up to 3 times with backoff
  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    const attemptRegistration = async (attempt: number) => {
      if (cancelled) return
      try {
        const { registerPushNotifications } = await import('@/lib/push-notifications')
        const ok = await registerPushNotifications()
        if (ok || attempt >= 2) return
        await new Promise(r => setTimeout(r, 5000 * (attempt + 1)))
        if (!cancelled) attemptRegistration(attempt + 1)
      } catch { /* ignore */ }
    }
    const timer = setTimeout(() => attemptRegistration(0), 2000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [status])

  if (status === 'loading' || status === 'unauthenticated' || profileLoading || (profile && !profile.onboarding_status?.completed)) {
    return <SplashScreen />
  }

  // Check if this is a full-viewport page (e.g. assignment detail, workspace doc, mindmap, VR, Quiz Battle)
  const isFullViewport =
    pathname === '/groups' ||
    pathname.startsWith('/groups/') ||
    (FULL_VIEWPORT_PREFIXES.some(prefix => pathname.startsWith(prefix)) &&
    pathname.split('/').length > 3) ||
    // workspace/[id] pages (exactly 3 segments: /workspace/id)
    /^\/workspace\/[^/]+$/.test(pathname)

  // Assignment detail (not /new) gets full viewport
  const isAssignmentDetail = pathname.includes('/assignments/') && !pathname.endsWith('/new')

  const shouldFullViewport = isFullViewport || isAssignmentDetail

  // Hide sidebar + mobile nav entirely on full-viewport pages (study, flashcards, quiz, workspace, quiz battle, etc.)
  const hideNav = pathname === '/groups' || pathname.startsWith('/groups/') || pathname === '/dashboard/personalised' || shouldFullViewport || isJourneyFocus

  return (
    <div className="flow-v2 flow-app-canvas min-h-screen bg-background text-on-surface font-sans">
      {!hideNav && <Sidebar />}
      {!hideNav && <MobileNav />}

      <main
        ref={focusMainRef}
        tabIndex={isJourneyFocus ? 0 : undefined}
        autoFocus={isJourneyFocus}
        className={cn(
          !hideNav && 'md:ml-[68px]',
          hideNav
            ? isJourneyFocus
              ? 'fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-y-contain [scrollbar-gutter:stable] touch-pan-y focus:outline-none'
              : 'fixed inset-0'
            : shouldFullViewport
            ? 'fixed inset-0 md:left-[68px] overflow-hidden z-30'
            : 'min-h-screen main-safe-top md:pt-6 [padding-bottom:calc(7rem+env(safe-area-inset-bottom))] md:pb-8'
        )}
      >
        {children}
      </main>

      {session?.user?.name && (
        <FeedbackPopup userName={session.user.name} />
      )}
    </div>
  )
}
