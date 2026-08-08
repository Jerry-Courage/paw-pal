'use client'

import { X, BookOpen, Brain, HelpCircle } from 'lucide-react'
import type { SceneSpec } from '@/lib/vr/sceneSpec'

interface ConceptDetailPanelProps {
  object: {
    objectId: string
    conceptId: string
    assetId: string | null
    label: string
  }
  scene: SceneSpec | null | undefined
  /** Current position in the learning path (-1 if not in path) */
  learningPathIndex?: number
  /** Total steps in learning path */
  totalPathSteps?: number
  onClose: () => void
  onAskFlowState: () => void
}

export default function ConceptDetailPanel({
  object,
  scene,
  learningPathIndex = -1,
  totalPathSteps = 0,
  onClose,
  onAskFlowState,
}: ConceptDetailPanelProps) {
  // Find the full object data from the scene
  const sceneObject = scene?.objects.find(
    (o) => o.id === object.objectId || o.conceptId === object.conceptId
  )

  const description = sceneObject?.description || 'No description available.'
  const isModel = object.assetId !== null

  // Find learning objective related to this concept
  const learningObjective = scene?.learningObjectives?.find(
    (lo) =>
      lo.toLowerCase().includes(object.label.toLowerCase()) ||
      object.label.toLowerCase().includes(lo.split(':')[0]?.toLowerCase() || '')
  )

  // Find interaction for this object
  const interaction = scene?.interactions?.find(
    (ix) => ix.objectId === object.objectId
  )

  // Check if this object is in the learning path
  const pathIndex = learningPathIndex >= 0
    ? learningPathIndex
    : scene?.learningPath?.indexOf(object.objectId) ?? -1
  const pathTotal = totalPathSteps > 0
    ? totalPathSteps
    : scene?.learningPath?.length ?? 0

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="mx-auto max-w-lg pointer-events-auto">
        <div className="mx-4 mb-4 rounded-2xl bg-black/90 backdrop-blur-xl border border-violet-500/20 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-violet-500/10">
            <div className="flex items-center gap-2">
              {isModel ? (
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-violet-400" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-indigo-400" />
                </div>
              )}
              <div>
                <h3 className="text-sm font-bold text-white">{object.label}</h3>
                {pathIndex >= 0 && (
                  <p className="text-[10px] text-violet-400/60">
                    Step {pathIndex + 1} of {pathTotal} in learning path
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-3 space-y-3">
            {/* Description */}
            <p className="text-xs text-slate-300 leading-relaxed">{description}</p>

            {/* Learning objective */}
            {learningObjective && (
              <div className="bg-violet-500/10 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">
                  Learning Objective
                </p>
                <p className="text-[11px] text-violet-200/80 leading-relaxed">
                  {learningObjective}
                </p>
              </div>
            )}

            {/* Interaction info */}
            {interaction && (
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <HelpCircle className="w-3 h-3" />
                <span>
                  Interaction: <span className="text-slate-400">{interaction.type}</span>
                  {' → '}
                  <span className="text-slate-400">{interaction.action}</span>
                </span>
              </div>
            )}

            {/* Asset info */}
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span>
                {isModel ? (
                  <>3D Model: <span className="text-violet-400">{object.assetId}</span></>
                ) : (
                  <span className="text-slate-600">No 3D model — concept node only</span>
                )}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 pb-3 flex gap-2">
            <button
              onClick={onAskFlowState}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
            >
              <Brain className="w-3.5 h-3.5" />
              Ask FlowState
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
