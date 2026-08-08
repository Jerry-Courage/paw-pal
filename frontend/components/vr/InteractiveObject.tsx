'use client'

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

export interface ObjectSelectEvent {
  objectId: string
  conceptId: string
  assetId: string | null
  label: string
}

export interface InteractiveObjectProps {
  /** Position in world space */
  position?: [number, number, number]
  /** Size of the clickable area */
  size?: number
  /** Color when not selected */
  color?: string
  /** Color when selected */
  selectedColor?: string
  /** Color when hovered */
  hoverColor?: string
  /** Called when clicked */
  onClick?: () => void
  /** Structured selection event (new educational interface) */
  onObjectSelect?: (event: ObjectSelectEvent) => void
  /** Whether this object is currently selected */
  selected?: boolean
  /** Label for accessibility */
  label?: string
  /** Educational metadata */
  conceptId?: string
  assetId?: string | null
  /** Show floating label above object */
  showLabel?: boolean
  /** Highlighted (current step in learning path) — pulsing glow ring */
  highlighted?: boolean
  /** Shape type */
  shape?: 'sphere' | 'box' | 'cylinder'
  children?: React.ReactNode
}

export default function InteractiveObject({
  position = [0, 0.5, 0],
  size = 0.3,
  color = '#4f46e5',
  selectedColor = '#7c3aed',
  hoverColor = '#818cf8',
  onClick,
  onObjectSelect,
  selected = false,
  label = 'Interactive Object',
  conceptId = '',
  assetId = null,
  showLabel = false,
  highlighted = false,
  shape = 'sphere',
  children,
}: InteractiveObjectProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  // Subtle animation
  useFrame((state) => {
    if (!meshRef.current) return
    const t = state.clock.getElapsedTime()

    // Gentle float when selected
    if (selected) {
      meshRef.current.position.y = position[1] + Math.sin(t * 2) * 0.05
    }

    // Scale pulse on hover
    if (hovered && !selected) {
      const pulse = 1 + Math.sin(t * 4) * 0.05
      meshRef.current.scale.setScalar(pulse)
    } else {
      meshRef.current.scale.setScalar(1)
    }
  })

  const handleClick = () => {
    onClick?.()
    onObjectSelect?.({
      objectId: label,
      conceptId,
      assetId,
      label,
    })
  }

  const currentColor = selected ? selectedColor : hovered ? hoverColor : color

  const geometry = (() => {
    switch (shape) {
      case 'box':
        return <boxGeometry args={[size, size, size]} />
      case 'cylinder':
        return <cylinderGeometry args={[size * 0.5, size * 0.5, size, 16]} />
      default:
        return <sphereGeometry args={[size * 0.5, 16, 16]} />
    }
  })()

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          handleClick()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={(e) => {
          e.stopPropagation()
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
      >
        {geometry}
        <meshStandardMaterial
          color={currentColor}
          emissive={selected ? selectedColor : hovered ? hoverColor : '#000000'}
          emissiveIntensity={selected ? 0.3 : hovered ? 0.2 : 0}
          metalness={0.2}
          roughness={0.6}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Selection ring */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -size * 0.5 + 0.01, 0]}>
          <ringGeometry args={[size * 0.6, size * 0.7, 32]} />
          <meshBasicMaterial color={selectedColor} transparent opacity={0.6} />
        </mesh>
      )}
      {/* Highlighted ring (current path step) — pulsing glow */}
      {highlighted && !selected && (
        <HighlightRing size={size} />
      )}
      {/* Floating label */}
      {(showLabel || (hovered && !selected)) && (
        <Html
          position={[0, size * 0.7, 0]}
          center
          distanceFactor={5}
          style={{ pointerEvents: 'none' }}
        >
          <div className="px-2 py-1 rounded-lg bg-black/80 border border-violet-500/30 text-violet-200 text-[10px] font-bold whitespace-nowrap backdrop-blur-sm">
            {label}
          </div>
        </Html>
      )}
      {children}
    </group>
  )
}

/** Pulsing highlight ring for the current learning path step */
function HighlightRing({ size }: { size: number }) {
  const ringRef = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!ringRef.current) return
    const t = state.clock.getElapsedTime()
    const scale = 1 + Math.sin(t * 3) * 0.15
    ringRef.current.scale.setScalar(scale)
    const mat = ringRef.current.material as THREE.MeshBasicMaterial
    mat.opacity = 0.3 + Math.sin(t * 3) * 0.2
  })
  return (
    <mesh
      ref={ringRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -size * 0.5 + 0.01, 0]}
    >
      <ringGeometry args={[size * 0.8, size * 0.9, 32]} />
      <meshBasicMaterial
        color="#facc15"
        transparent
        opacity={0.4}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
