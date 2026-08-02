'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import MobileNav from '@/components/layout/MobileNav'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { registerPushNotifications, checkNotificationPermission } from '@/lib/push-notifications'

import SplashScreen from '@/components/ui/SplashScreen'
const OnboardingWizard = dynamic(() => import('@/components/onboarding/OnboardingWizard'), { ssr: false })

// Pages that need full-viewport (no padding/scroll)
const FULL_VIEWPORT_PREFIXES = [
  '/workspace/',
  '/library/',   // sub-tools: /library/[id]/mindmap, /vr, etc.
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [showOnboarding, setShowOnboarding] = useState(false)

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

  if (status === 'loading' || status === 'unauthenticated') {
    return <SplashScreen />
  }

  // Check if this is a full-viewport page (e.g. assignment detail, workspace doc, mindmap, VR)
  const isFullViewport =
    (FULL_VIEWPORT_PREFIXES.some(prefix => pathname.startsWith(prefix)) &&
    pathname.split('/').length > 3) ||
    // workspace/[id] pages (exactly 3 segments: /workspace/id)
    /^\/workspace\/[^/]+$/.test(pathname)

  // Assignment detail (not /new) gets full viewport
  const isAssignmentDetail = pathname.includes('/assignments/') && !pathname.endsWith('/new')

  const shouldFullViewport = isFullViewport || isAssignmentDetail

  return (
    <div className="min-h-screen bg-background text-on-surface font-sans">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile top bar + bottom nav */}
      <MobileNav />

      {/* Main content area */}
      <main
        className={cn(
          'md:ml-64',
          shouldFullViewport
            ? 'fixed inset-0 md:left-64 overflow-hidden z-[60] pt-14 md:pt-0'
            : 'min-h-screen pt-14 md:pt-0 pb-24 md:pb-0'
        )}
      >
        {children}
      </main>

      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
  )
}
