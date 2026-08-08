'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
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
  /** Called when model loads */
  onLoaded?: () => void
  /** Called on load error */
  onError?: (error: Error) => void
  /** Whether the model is selectable */
  selectable?: boolean
  /** Called when model is clicked */
  onSelect?: () => void
  /** Whether this model is currently selected */
  selected?: boolean
}

function Model({
  url,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  onLoaded,
  onError,
  selectable = false,
  onSelect,
  selected = false,
}: ModelViewerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { scene } = useGLTF(url)
  const [hovered, setHovered] = useState(false)

  // Clone scene to avoid conflicts if same model is used multiple times
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true)
    return clone
  }, [scene])

  // Center and scale the model
  useEffect(() => {
    if (!groupRef.current) return

    const box = new THREE.Box3().setFromObject(groupRef.current)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const targetSize = 2 // Target max dimension in world units
    const autoScale = targetSize / maxDim

    // Center the model at its pivot
    groupRef.current.position.set(
      position[0] - center.x * autoScale * scale,
      position[1] - center.y * autoScale * scale + size.y * autoScale * scale * 0.5,
      position[2] - center.z * autoScale * scale
    )

    onLoaded?.()
  }, [clonedScene]) // eslint-disable-line react-hooks/exhaustive-deps

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
      {/* Selection/hover highlight */}
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

// Pre-load is not possible without knowing the URL at build time.
// useGLTF loads on-demand and caches internally.

export default function ModelViewer({
  url,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  onLoaded,
  onError,
  selectable = false,
  onSelect,
  selected = false,
}: ModelViewerProps) {
  const [loadError, setLoadError] = useState<Error | null>(null)

  // Error boundary for GLTF loading
  if (loadError) {
    return (
      <mesh position={position}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#ff4444" wireframe />
      </mesh>
    )
  }

  try {
    return (
      <Model
        url={url}
        position={position}
        rotation={rotation}
        scale={scale}
        onLoaded={onLoaded}
        onError={(err) => {
          setLoadError(err)
          onError?.(err)
        }}
        selectable={selectable}
        onSelect={onSelect}
        selected={selected}
      />
    )
  } catch {
    // Fallback if useGLTF throws synchronously
    return (
      <mesh position={position}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#ff4444" wireframe />
      </mesh>
    )
  }
}
