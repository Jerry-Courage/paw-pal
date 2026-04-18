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
const GlobalAgentAssistant = dynamic(() => import('@/components/ai/GlobalAgentAssistant'), { ssr: false })

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
      const onboarded = localStorage.getItem('flowstate_onboarded')
      const tutorialSeen = localStorage.getItem('flowstate_tutorial_seen')
      
      if (!onboarded) {
        setShowOnboarding(true)
      } else if (!tutorialSeen) {
        setShowTutorial(true)
      }
    }
  }, [status, router])

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">
            {status === 'loading' ? 'Initializing Neural Link...' : 'Redirecting to Login...'}
          </p>
        </div>
      </div>
    )
  }

  const isStudio = pathname.startsWith('/workspace/')

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      
      {/* Desktop sidebar — hidden on mobile, collapsible on desktop */}
      <div className={cn(
        "hidden md:flex transition-all duration-300",
        desktopSidebarOpen ? "w-64" : "w-0 overflow-hidden"
      )}>
        <Sidebar onToggle={() => setDesktopSidebarOpen(!desktopSidebarOpen)} isOpen={desktopSidebarOpen} />
      </div>

      {/* Mobile sidebar drawer */}
      <MobileSidebar open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
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

      <GlobalAgentAssistant />

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
