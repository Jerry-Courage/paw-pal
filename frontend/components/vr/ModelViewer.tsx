'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

export interface ModelViewerProps {
  /** URL of the GLB/GLTF model */
  url: string
  /** Position in world space */
  position?: [number, number, number]
  /** Rotation in radians [x, y, z] */
  rotation?: [number, number, number]
  /** Uniform scale */
  scale?: number
  /** Called when model loads successfully */
  onLoaded?: () => void
  /** Whether the model is selectable */
  selectable?: boolean
  /** Called when model is clicked */
  onSelect?: () => void
  /** Whether this model is currently selected */
  selected?: boolean
}

/**
 * Pure model renderer — no error boundary.
 * Errors propagate to parent (SceneObjectRenderer) which catches
 * and falls back to InteractiveObject placeholder.
 */
function Model({
  url,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  onLoaded,
  selectable = false,
  onSelect,
  selected = false,
}: ModelViewerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { scene } = useGLTF(url)
  const [hovered, setHovered] = useState(false)

  const clonedScene = useMemo(() => scene.clone(true), [scene])

  useEffect(() => {
    if (!groupRef.current) return

    const box = new THREE.Box3().setFromObject(groupRef.current)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const targetSize = 2
    const autoScale = targetSize / maxDim

    groupRef.current.position.set(
      position[0] - center.x * autoScale * scale,
      position[1] - center.y * autoScale * scale + size.y * autoScale * scale * 0.5,
      position[2] - center.z * autoScale * scale
    )

    onLoaded?.()
  }, [clonedScene])

  return (
    <group
      ref={groupRef}
      rotation={rotation}
      scale={scale}
      onPointerOver={(e) => {
        if (!selectable) return
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={(e) => {
        if (!selectable) return
        e.stopPropagation()
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
      onClick={(e) => {
        if (!selectable || !onSelect) return
        e.stopPropagation()
        onSelect()
      }}
    >
      <primitive object={clonedScene} />
      {(selected || hovered) && (
        <mesh>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial
            color={selected ? '#7c3aed' : '#a78bfa'}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
    </group>
  )
}

export default function ModelViewer({
  url,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  onLoaded,
  selectable = false,
  onSelect,
  selected = false,
}: ModelViewerProps) {
  const isValidUrl = useMemo(() => {
    if (!url || typeof url !== 'string') return false
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }, [url])

  if (!isValidUrl) {
    // Invalid URL — throw to trigger parent ErrorBoundary
    throw new Error(`Invalid model URL: ${url}`)
  }

  return (
    <Model
      url={url}
      position={position}
      rotation={rotation}
      scale={scale}
      onLoaded={onLoaded}
      selectable={selectable}
      onSelect={onSelect}
      selected={selected}
    />
  )
}
