'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import MobileNav from '@/components/layout/MobileNav'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { registerPushNotifications, checkNotificationPermission } from '@/lib/push-notifications'
import { getAuthToken, API_BASE } from '@/lib/api'

import SplashScreen from '@/components/ui/SplashScreen'
const OnboardingWizard = dynamic(() => import('@/components/onboarding/OnboardingWizard'), { ssr: false })
const PaywallModal = dynamic(() => import('@/components/ui/PaywallModal'), { ssr: false })

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
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showPostOnboardingPaywall, setShowPostOnboardingPaywall] = useState(false)
  const [subStatus, setSubStatus] = useState<any>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  // Onboarding
  useEffect(() => {
    if (status !== 'authenticated' || !session) return
    const onboardedLocal = localStorage.getItem('flowstate_onboarded') === 'true'
    const onboardedServer = (session.user as any).onboarded
    if (!onboardedLocal && !onboardedServer) {
      setShowOnboarding(true)
    }
  }, [status, session])

  // Push notifications
  useEffect(() => {
    if (status !== 'authenticated') return
    const permission = checkNotificationPermission()
    if (permission === 'default') {
      const timer = setTimeout(() => { registerPushNotifications() }, 3000)
      return () => clearTimeout(timer)
    }
  }, [status])

  const handleOnboardingComplete = useCallback(async () => {
    setShowOnboarding(false)
    // Fetch subscription status and show paywall if not premium
    try {
      const token = await getAuthToken()
      const res = await fetch(`${API_BASE}/api/payments/status/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setSubStatus(data)
      if (!data.is_premium) {
        setShowPostOnboardingPaywall(true)
      }
    } catch {
      // If we can't check, still show paywall (safe default)
      setShowPostOnboardingPaywall(true)
    }
  }, [])

  if (status === 'loading' || status === 'unauthenticated') {
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
  const hideNav = pathname === '/groups' || pathname.startsWith('/groups/') || pathname === '/dashboard/personalised' || shouldFullViewport

  return (
    <div className="min-h-screen bg-background text-on-surface font-sans">
      {!hideNav && <Sidebar />}
      {!hideNav && <MobileNav />}

      <main
        className={cn(
          !hideNav && 'md:ml-[68px]',
          hideNav
            ? 'fixed inset-0'
            : shouldFullViewport
            ? 'fixed inset-0 md:left-[68px] overflow-hidden z-30'
            : 'min-h-screen main-safe-top md:pt-6 [padding-bottom:calc(7rem+env(safe-area-inset-bottom))] md:pb-8'
        )}
      >
        {children}
      </main>

      {showOnboarding && (
        <OnboardingWizard onComplete={handleOnboardingComplete} />
      )}

      {showPostOnboardingPaywall && subStatus && (
        <PaywallModal
          onClose={() => setShowPostOnboardingPaywall(false)}
          notesUsed={subStatus.notes_used}
          notesLimit={subStatus.notes_limit}
          onSuccess={() => {
            setSubStatus((prev: any) => prev ? { ...prev, is_premium: true } : prev)
            setShowPostOnboardingPaywall(false)
          }}
        />
      )}
    </div>
  )
}
