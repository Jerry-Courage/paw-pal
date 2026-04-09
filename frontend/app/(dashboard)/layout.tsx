'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import MobileNav from '@/components/layout/MobileNav'
import MobileSidebar from '@/components/layout/MobileSidebar'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'

const OnboardingWizard = dynamic(() => import('@/components/onboarding/OnboardingWizard'), { ssr: false })
const AIGuideTour = dynamic(() => import('@/components/tour/AIGuideTour'), { ssr: false })
const GlobalAgentAssistant = dynamic(() => import('@/components/ai/GlobalAgentAssistant'), { ssr: false })

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
      return
    }
    if (status === 'authenticated') {
      const onboarded = localStorage.getItem('flowstate_onboarded')
      if (!onboarded) setShowOnboarding(true)
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading FlowState...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <AIGuideTour />
      
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar drawer */}
      <MobileSidebar open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar onMenuClick={() => setMobileSidebarOpen(true)} />
        {/* pb-16 on mobile to account for bottom nav */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 relative">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />

      <GlobalAgentAssistant />

      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
  )
}
