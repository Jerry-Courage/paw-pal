'use client'

import { Html } from '@react-three/drei'
import type { SceneSpec } from '@/lib/vr/sceneSpec'

interface VRSpatialPanelProps {
  object: {
    objectId: string
    conceptId: string
    assetId: string | null
    label: string
  }
  scene: SceneSpec | null | undefined
  learningPathIndex: number
  totalPathSteps: number
  exploredCount: number
  totalConcepts: number
  onNext?: () => void
  onPrev?: () => void
}

/**
 * Spatial concept panel rendered inside the 3D scene for VR.
 * Uses Drei's Html component which renders as DOM overlay in XR mode.
 * Shows concept name, description, path step, and explored progress.
 */
export default function VRSpatialPanel({
  object,
  scene,
  learningPathIndex,
  totalPathSteps,
  exploredCount,
  totalConcepts,
  onNext,
  onPrev,
}: VRSpatialPanelProps) {
  const sceneObject = scene?.objects.find(
    (o) => o.id === object.objectId || o.conceptId === object.conceptId
  )

  const description = sceneObject?.description || 'No description available.'
  const pathStep = learningPathIndex >= 0 ? learningPathIndex + 1 : -1

  return (
    <Html
      position={[0, 1.8, -1.5]}
      center
      distanceFactor={3}
      style={{ pointerEvents: 'none' }}
      zIndexRange={[10, 0]}
    >
      <div
        className="w-[280px] bg-black/90 border border-violet-500/40 rounded-xl p-4 text-white backdrop-blur-md"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-violet-200 truncate pr-2">
            {object.label}
          </h3>
          {pathStep > 0 && (
            <span className="text-[10px] bg-violet-600/30 text-violet-300 px-2 py-0.5 rounded-full whitespace-nowrap">
              Step {pathStep} / {totalPathSteps}
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
          {description.length > 150 ? description.slice(0, 150) + '...' : description}
        </p>

        {/* Progress */}
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-3">
          <span>{exploredCount} / {totalConcepts} explored</span>
        </div>

        {/* Navigation */}
        {(onPrev || onNext) && (
          <div className="flex gap-2">
            {onPrev && (
              <button
                onClick={onPrev}
                className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] text-white transition-colors"
              >
                Prev
              </button>
            )}
            {onNext && (
              <button
                onClick={onNext}
                className="flex-1 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-[11px] text-white font-medium transition-colors"
              >
                Next
              </button>
            )}
          </div>
        )}
      </div>
    </Html>
  )
}
