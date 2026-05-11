'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'

const OnboardingWizard = dynamic(() => import('@/components/onboarding/OnboardingWizard'), { ssr: false })

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d0d]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Full-viewport pages: no padding, just offset for TopNav
  const isFullViewport = pathname.startsWith('/workspace/')

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <TopNav />
      <main className={cn(
        isFullViewport
          ? 'fixed inset-0 overflow-hidden'
          : 'px-4 md:px-6 pb-20 md:pb-8'
      )}
        style={isFullViewport
          ? { top: 'calc(56px + env(safe-area-inset-top))' }
          : { paddingTop: 'calc(56px + env(safe-area-inset-top))' }
        }
      >
        {children}
      </main>
    </div>
  )
}
