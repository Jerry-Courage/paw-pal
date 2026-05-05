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
const VideoTutorialModal = dynamic(() => import('@/components/onboarding/VideoTutorialModal'), { ssr: false })

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
      return
    }
    if (status === 'authenticated') {
      // Check server-side onboarding status first, fall back to localStorage
      // This prevents re-showing onboarding after cache clear or PWA reinstall
      const serverOnboarded = (session?.user as any)?.onboarding_status?.completed
      const localOnboarded = localStorage.getItem('flowstate_onboarded')
      const tutorialSeen = localStorage.getItem('flowstate_tutorial_seen')

      if (!serverOnboarded && !localOnboarded) {
        setShowOnboarding(true)
      } else if (!tutorialSeen) {
        setShowTutorial(true)
      }
    }
  }, [status, router, session])

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d0d]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">
            {status === 'loading' ? 'Loading...' : 'Redirecting...'}
          </p>
        </div>
      </div>
    )
  }

  const isStudio = pathname.startsWith('/workspace/')

  return (
    <div className="flex h-screen bg-[#0d0d0d] overflow-hidden">
      
      {/* Desktop sidebar */}
      <div className={cn(
        "hidden md:flex transition-all duration-300",
        desktopSidebarOpen ? "w-64" : "w-0 overflow-hidden"
      )}>
        <Sidebar onToggle={() => setDesktopSidebarOpen(!desktopSidebarOpen)} isOpen={desktopSidebarOpen} />
      </div>

      {/* Mobile sidebar drawer */}
      <MobileSidebar open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-16">
        <TopBar 
          onMenuClick={() => setMobileSidebarOpen(true)} 
          isSidebarOpen={desktopSidebarOpen}
          onToggleSidebar={() => setDesktopSidebarOpen(!desktopSidebarOpen)}
        />
        <main className={cn(
          "flex-1 relative overflow-x-hidden",
          isStudio ? "overflow-hidden" : "overflow-y-auto p-4 md:p-6 pb-20 md:pb-6"
        )}>
          {children}
        </main>
      </div>

      <MobileNav />

      {showOnboarding && (
        <OnboardingWizard onComplete={() => {
          setShowOnboarding(false)
          setShowTutorial(true)
        }} />
      )}

      {showTutorial && (
        <VideoTutorialModal 
          isOpen={showTutorial} 
          onClose={() => {
            localStorage.setItem('flowstate_tutorial_seen', 'true')
            setShowTutorial(false)
          }} 
        />
      )}
    </div>
  )
}
