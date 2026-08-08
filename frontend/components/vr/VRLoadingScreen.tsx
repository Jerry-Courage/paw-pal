'use client'

import { useProgress } from '@react-three/drei'

export default function VRLoadingScreen() {
  const { progress, active } = useProgress()

  if (!active) return null

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0014]/90 backdrop-blur-sm pointer-events-none">
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-violet-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-500 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-violet-300">
            Loading 3D Scene
          </p>
          <p className="text-xs text-violet-400/60 mt-1">
            {Math.round(progress)}%
          </p>
        </div>
      </div>
    </div>
  )
}
