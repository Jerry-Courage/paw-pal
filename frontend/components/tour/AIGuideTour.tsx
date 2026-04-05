'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sparkles, X, ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from 'next-auth/react'

export interface TourStep {
  targetId: string
  title: string
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

const DASHBOARD_STEPS: TourStep[] = [
  {
    targetId: 'tour-welcome',
    title: "Hey there! I'm FlowAI! ✨",
    content: "I'm your personal study buddy. Let me give you a quick 30-second grand tour of your new workspace so you can start crushing your goals!",
    position: 'bottom',
  },
  {
    targetId: 'tour-quick-actions',
    title: "Your Command Center 🚀",
    content: "Need to start a timer, upload a confusing PDF, or instantly ask me a question? These Quick Actions are your best friends.",
    position: 'bottom',
  },
  {
    targetId: 'tour-active-session',
    title: "Stay in the Zone 🎧",
    content: "When you start a study session, it'll show up right here so you can pause, resume, or track your focus time seamlessly.",
    position: 'bottom',
  },
  {
    targetId: 'tour-analytics',
    title: "Watch yourself Grow 🌱",
    content: "This is my favorite part! I'll track your daily streaks, study hours, and flashcard progress here so you can literally see yourself getting smarter.",
    position: 'left',
  }
]

export default function AIGuideTour() {
  const { status } = useSession()
  const pathname = usePathname()
  const [isActive, setIsActive] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [isClient, setIsClient] = useState(false)

  // Ensure hydration match
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Check if tour should run
  useEffect(() => {
    if (status === 'authenticated' && pathname === '/dashboard') {
      const searchParams = new URLSearchParams(window.location.search)
      if (searchParams.get('reset_tour') === '1') {
        localStorage.removeItem('flowstate_tour_completed')
        // Clean URL without reloading
        window.history.replaceState(null, '', '/dashboard')
      }

      const tourCompleted = localStorage.getItem('flowstate_tour_completed')
      if (!tourCompleted) {
        setIsActive(true)
      }
    }
  }, [status, pathname])

  useEffect(() => {
    if (!isActive) return

    const updatePosition = () => {
      const step = DASHBOARD_STEPS[currentStepIndex]
      
      // Cleanup previous styles just in case
      DASHBOARD_STEPS.forEach(s => {
        const el = document.getElementById(s.targetId)
        if (el) el.classList.remove('tour-target-active')
      })

      const el = document.getElementById(step.targetId)
      if (el) {
        // Add relative/z-index to the target element to elevate it above the backdrop
        el.classList.add('tour-target-active')
        
        // Scroll target into view
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        
        // Slight delay to calculate after scroll
        setTimeout(() => {
          setTargetRect(el.getBoundingClientRect())
        }, 100)
      } else {
        setTargetRect(null)
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      
      // Cleanup classes on unmount
      DASHBOARD_STEPS.forEach(step => {
        const el = document.getElementById(step.targetId)
        if (el) el.classList.remove('tour-target-active')
      })
    }
  }, [isActive, currentStepIndex])

  if (!isClient || !isActive) return null

  const currentStep = DASHBOARD_STEPS[currentStepIndex]

  const nextStep = () => {
    if (currentStepIndex < DASHBOARD_STEPS.length - 1) {
      setCurrentStepIndex(i => i + 1)
    } else {
      endTour()
    }
  }

  const prevStep = () => {
    if (currentStepIndex > 0) setCurrentStepIndex(i => i - 1)
  }

  const endTour = () => {
    localStorage.setItem('flowstate_tour_completed', 'true')
    // Reset active elements
    DASHBOARD_STEPS.forEach(step => {
      const el = document.getElementById(step.targetId)
      if (el) el.classList.remove('tour-target-active')
    })
    setIsActive(false)
  }

  // Calculate popover positioning safely
  let top = '50%', left = '50%', transform = 'translate(-50%, -50%)'

  if (targetRect) {
    const pad = 24
    if (currentStep.position === 'bottom') {
      top = `${targetRect.bottom + pad}px`
      // Center horizontally relative to target, bounded by screen width
      const rawLeft = targetRect.left + (targetRect.width / 2)
      left = `${Math.min(Math.max(rawLeft, 170), window.innerWidth - 170)}px`
      transform = 'translateX(-50%)'
    } else if (currentStep.position === 'left') {
      // Show on left side
      left = `${targetRect.left - pad}px`
      top = `${targetRect.top + targetRect.height / 2}px`
      transform = 'translate(-100%, -50%)'
      
      // Fallback for mobile if out of bounds (switch to bottom)
      if (targetRect.left < 340) {
        top = `${targetRect.bottom + pad}px`
        left = `${targetRect.left + (targetRect.width / 2)}px`
        transform = 'translateX(-50%)'
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Dim backdrop */}
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[3px] pointer-events-auto transition-opacity duration-300" />
      
      {/* Target cut-out highlight handled by `tour-target-active` class in globals.css */}

      {/* Floating Dialog */}
      <div 
        className="absolute w-[340px] glass-card rounded-2xl shadow-2xl border-primary/30 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] pointer-events-auto"
        style={{
          top, left, transform
        }}
      >
        <div className="bg-gradient-to-r from-primary to-violet-500 p-5 text-white relative flex-shrink-0">
          <button 
            onClick={endTour}
            className="absolute top-3 right-3 p-1.5 bg-black/10 hover:bg-black/20 rounded-full transition-colors active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-3 pr-6">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0 animate-pulse-slow">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                Step {currentStepIndex + 1} of {DASHBOARD_STEPS.length}
              </p>
              <h3 className="font-extrabold text-white text-[19px] leading-tight mt-0.5">
                {currentStep.title}
              </h3>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
          <p className="text-slate-600 dark:text-slate-300 text-[15px] leading-relaxed mb-6 font-medium">
            {currentStep.content}
          </p>

          <div className="flex items-center justify-between mt-2">
            <button
               onClick={prevStep}
               className={cn("text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors uppercase tracking-widest px-2 py-1", currentStepIndex === 0 && "invisible")}
            >
              Back
            </button>
            
            <button 
              onClick={nextStep}
              className="px-5 py-2.5 bg-primary hover:bg-primary-600 text-white rounded-xl text-sm font-bold shadow-md shadow-primary/30 transition-all active:scale-95 flex items-center gap-2"
            >
              {currentStepIndex === DASHBOARD_STEPS.length - 1 ? (
                <>Let's Go! <Check className="w-4 h-4" /></>
              ) : (
                <>Next <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
