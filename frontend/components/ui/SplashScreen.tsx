'use client'

import FlowLoader from '@/components/ui/FlowLoader'

export default function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[9999] bg-[#0B0C1A]">
      <FlowLoader state="waiting" message="Finding where you left off." className="h-full" />
    </div>
  )
}
