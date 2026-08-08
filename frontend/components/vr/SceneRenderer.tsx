'use client'

import { useCallback, useState, useMemo, Component, ReactNode } from 'react'
import type { XRStore } from '@react-three/xr'
import FlowStateCanvas from './FlowStateCanvas'
import ModelViewer from './ModelViewer'
import InteractiveObject from './InteractiveObject'
import type { ObjectSelectEvent } from './InteractiveObject'
import type { SceneSpec, SceneObject } from '@/lib/vr/sceneSpec'
import { generateSceneSpec, type VRNode } from '@/lib/vr/sceneGenerator'

// Re-export for backward compatibility
export type { VRConceptNode } from './SceneRenderer.types'

export interface SceneRendererProps {
  /** SceneSpec — the typed scene specification */
  scene?: SceneSpec | null
  /** Legacy: concept nodes (will be converted to SceneSpec internally) */
  concepts?: Array<{
    id: string
    title: string
    description?: string
    sketchfab_keyword?: string
    model_url?: string
    position?: [number, number, number]
  }>
  /** Currently selected concept/object ID */
  selectedConceptId?: string | null
  /** Called when a concept is selected */
  onConceptSelect?: (conceptId: string) => void
  /** Called when an object is selected (new structured event) */
  onObjectSelect?: (event: ObjectSelectEvent) => void
  /** ID of the currently highlighted object (learning path step) */
  highlightedObjectId?: string | null
  /** XR store — when provided, enables WebXR */
  xrStore?: XRStore | null
  /** Resource title for display */
  resourceTitle?: string
  /** Resource ID for SceneSpec generation from legacy concepts */
  resourceId?: string
}

/** Placeholder shown when an asset cannot be resolved */
function AssetPlaceholder({ object }: { object: SceneObject }) {
  return (
    <group position={[object.position.x, object.position.y, object.position.z]}>
      <mesh>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial
          color={object.color || '#6366f1'}
          emissive={object.color || '#6366f1'}
          emissiveIntensity={0.4}
          transparent
          opacity={0.7}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.14, 0]}>
        <ringGeometry args={[0.18, 0.2, 32]} />
        <meshBasicMaterial color={object.color || '#6366f1'} transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

/**
 * Error boundary that catches ModelViewer load failures.
 * Falls back to InteractiveObject placeholder — keeps the scene alive.
 * Does NOT unmount the Canvas or sibling objects.
 */
class ModelLoadErrorBoundary extends Component<
  {
    children: ReactNode
    fallback: ReactNode
  },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    // Log in dev only — do not crash the scene
    if (process.env.NODE_ENV === 'development') {
      console.warn('[SceneRenderer] Model load failed, using placeholder:', error.message)
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

export default function SceneRenderer({
  scene: sceneSpec,
  concepts,
  selectedConceptId,
  onConceptSelect,
  onObjectSelect,
  highlightedObjectId,
  xrStore = null,
  resourceTitle = '',
  resourceId = '',
}: SceneRendererProps) {
  const [canvasError, setCanvasError] = useState(false)

  // If no SceneSpec provided, generate one from legacy concepts
  const scene: SceneSpec | null = useMemo(() => {
    if (sceneSpec) return sceneSpec
    if (concepts && concepts.length > 0) {
      const vrNodes: VRNode[] = concepts.map((c) => ({
        id: c.id,
        label: c.title,
        description: c.description || '',
        color: '#6366f1',
        sketchfab_keyword: c.sketchfab_keyword,
      }))
      return generateSceneSpec({
        resourceId: resourceId || 'unknown',
        title: resourceTitle || 'Untitled Scene',
        nodes: vrNodes,
      })
    }
    return null
  }, [sceneSpec, concepts, resourceId, resourceTitle])

  const handleConceptClick = useCallback(
    (conceptId: string) => {
      onConceptSelect?.(conceptId)
    },
    [onConceptSelect]
  )

  const handleObjectSelect = useCallback(
    (event: ObjectSelectEvent) => {
      onObjectSelect?.(event)
      onConceptSelect?.(event.conceptId)
    },
    [onObjectSelect, onConceptSelect]
  )

  if (canvasError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0a0014]">
        <p className="text-violet-300/60 text-sm">3D scene could not load.</p>
      </div>
    )
  }

  if (!scene) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0a0014]">
        <p className="text-violet-300/40 text-sm">No scene data available.</p>
      </div>
    )
  }

  const env = scene.environment

  return (
    <FlowStateCanvas
      onError={() => setCanvasError(true)}
      cameraPosition={[0, 2, 5]}
      fov={50}
      xrStore={xrStore}
    >
      {scene.objects.map((obj) => (
        <SceneObjectRenderer
          key={obj.id}
          object={obj}
          selected={obj.conceptId === selectedConceptId}
          highlighted={obj.id === highlightedObjectId || obj.conceptId === highlightedObjectId}
          onSelect={() => handleConceptClick(obj.conceptId)}
          onObjectSelect={handleObjectSelect}
        />
      ))}
    </FlowStateCanvas>
  )
}

/** Renders a single SceneObject — resolves asset or shows placeholder */
function SceneObjectRenderer({
  object,
  selected,
  highlighted,
  onSelect,
  onObjectSelect,
}: {
  object: SceneObject
  selected: boolean
  highlighted: boolean
  onSelect: () => void
  onObjectSelect: (event: ObjectSelectEvent) => void
}) {
  const position: [number, number, number] = [
    object.position.x,
    object.position.y,
    object.position.z,
  ]

  // Build the InteractiveObject fallback for when model loading fails
  const interactiveFallback = object.interactive ? (
    <InteractiveObject
      position={position}
      size={0.25}
      color={object.color || '#6366f1'}
      selected={selected}
      highlighted={highlighted}
      onClick={onSelect}
      onObjectSelect={onObjectSelect}
      label={object.label}
      conceptId={object.conceptId}
      assetId={object.assetId}
      showLabel={selected || highlighted}
      shape="sphere"
    />
  ) : (
    <AssetPlaceholder object={object} />
  )

  // If asset resolved → load GLB with error boundary
  if (object.asset.modelUrl && object.type === 'model') {
    return (
      <ModelLoadErrorBoundary fallback={interactiveFallback}>
        <ModelViewer
          key={object.asset.modelUrl}
          url={object.asset.modelUrl}
          position={position}
          scale={object.scale}
          selectable={object.interactive}
          onSelect={onSelect}
          selected={selected}
        />
      </ModelLoadErrorBoundary>
    )
  }

  // If no asset → interactive placeholder
  if (object.interactive) {
    return (
      <InteractiveObject
        position={position}
        size={0.25}
        color={object.color || '#6366f1'}
        selected={selected}
        highlighted={highlighted}
        onClick={onSelect}
        onObjectSelect={onObjectSelect}
        label={object.label}
        conceptId={object.conceptId}
        assetId={object.assetId}
        showLabel={selected || highlighted}
        shape="sphere"
      />
    )
  }

  // Non-interactive object without asset
  return <AssetPlaceholder object={object} />
}
