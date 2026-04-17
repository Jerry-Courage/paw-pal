'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { ACTIONS, EVENTS, STATUS, Step, CallBackProps } from 'react-joyride'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { PremiumTooltip } from './PremiumTooltip'
import { TOUR_STEPS, TourType } from '@/config/onboarding-steps'
import axios from 'axios'

// DYNAMIC IMPORT: Force Joyride to only load in the browser to avoid "undefined" element errors
const Joyride = dynamic(() => import('react-joyride').then(mod => mod.Joyride), { ssr: false })

interface TourContextType {
  runTour: (tourId: TourType) => void
  isTourRunning: boolean
}

const TourContext = createContext<TourContextType | undefined>(undefined)

export const TourProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: session, update: updateSession } = useSession()
  const pathname = usePathname()
  
  const [run, setRun] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [currentTourId, setCurrentTourId] = useState<TourType | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  
  // DEDUPLICATION SHIELD: Prevent multiple redundant API calls for the same tour
  const completedToursRef = React.useRef<Set<string>>(new Set())

  // Hydration Shield
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Mark tour as completed on backend
  const completeTour = async (tourId: string) => {
    if (completedToursRef.current.has(tourId)) return
    
    try {
      completedToursRef.current.add(tourId)
      await axios.post('/api/users/onboarding/update/', { tour_id: tourId })
      
      // Update local session so we don't trigger it again
      if (session?.user && updateSession) {
        await updateSession()
      }
    } catch (err) {
      completedToursRef.current.delete(tourId) // Allow retry on failure
      console.error('[Tour] Failed to update onboarding status:', err)
    }
  }

  const runTour = useCallback((tourId: TourType) => {
    if (TOUR_STEPS[tourId]) {
      setSteps(TOUR_STEPS[tourId])
      setCurrentTourId(tourId)
      setRun(true)
    }
  }, [])

  // Auto-trigger tours based on path
  useEffect(() => {
    if (!session?.user || !isMounted || run) return

    const onboardingStatus = (session.user as any).onboarding_status || {}
    
    // Unified Tour Trigger Logic
    const triggerTour = (path: string, tourId: TourType, statusKey: string) => {
      if (pathname === path && !onboardingStatus[statusKey]) {
        const timer = setTimeout(() => runTour(tourId), 1500)
        return () => clearTimeout(timer)
      }
    }

    const triggers = [
      { path: '/dashboard', id: 'welcome' as TourType, key: 'welcome' },
      { path: '/library', id: 'library' as TourType, key: 'library' },
      { path: '/planner', id: 'planner' as TourType, key: 'planner' },
      { path: '/workspace', id: 'workspace' as TourType, key: 'workspace' },
      { path: '/community', id: 'community' as TourType, key: 'community' },
      { path: '/assignments', id: 'assignments' as TourType, key: 'assignments' },
    ]

    const activeTrigger = triggers.find(t => t.path === pathname)
    if (activeTrigger) {
      return triggerTour(activeTrigger.path, activeTrigger.id, activeTrigger.key)
    }
  }, [pathname, session, runTour, isMounted])

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, type, action } = data

    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
      setRun(false)
      if (currentTourId) {
        completeTour(currentTourId)
      }
    }
  }

  return (
    <TourContext.Provider value={{ runTour, isTourRunning: run }}>
      {children}
      {isMounted && (
        <Joyride
          steps={steps}
          run={run}
          continuous
          showProgress
          showSkipButton
          disableOverlayClose
          disableScrolling={false}
          scrollToFirstStep
          tooltipComponent={PremiumTooltip}
          callback={handleJoyrideCallback}
          styles={{
            options: {
              zIndex: 10000,
              primaryColor: '#0ea5e9',
            },
            overlay: {
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(2px)',
            },
          }}
        />
      )}
    </TourContext.Provider>
  )
}

export const useTour = () => {
  const context = useContext(TourContext)
  if (!context) throw new Error('useTour must be used within TourProvider')
  return context
}
