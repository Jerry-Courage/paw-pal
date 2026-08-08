'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export interface SceneEnvironmentProps {
  /** Show grid floor (default: true) */
  showGrid?: boolean
  /** Show fog (default: true) */
  showFog?: boolean
  /** Fog color (default: matches background) */
  fogColor?: string
  /** Fog near distance */
  fogNear?: number
  /** Fog far distance */
  fogFar?: number
  /** Ambient light intensity (default: 0.4) */
  ambientIntensity?: number
  /** Directional light intensity (default: 0.8) */
  directionalIntensity?: number
  /** Directional light position */
  directionalPosition?: [number, number, number]
}

export default function SceneEnvironment({
  showGrid = true,
  showFog = true,
  fogColor = '#0a0014',
  fogNear = 5,
  fogFar = 50,
  ambientIntensity = 0.4,
  directionalIntensity = 0.8,
  directionalPosition = [5, 8, 5],
}: SceneEnvironmentProps) {
  const lightRef = useRef<THREE.DirectionalLight>(null)

  return (
    <>
      {/* Ambient fill */}
      <ambientLight intensity={ambientIntensity} color="#c4b5fd" />

      {/* Key light */}
      <directionalLight
        ref={lightRef}
        position={directionalPosition}
        intensity={directionalIntensity}
        color="#ffffff"
        castShadow={false}
      />

      {/* Subtle rim/accent light from below */}
      <pointLight position={[0, -2, 0]} intensity={0.15} color="#7c3aed" distance={10} />

      {/* Fog */}
      {showFog && <fog attach="fog" args={[fogColor, fogNear, fogFar]} />}

      {/* Floor grid */}
      {showGrid && (
        <gridHelper
          args={[40, 40, '#1a1a2e', '#111122']}
          position={[0, 0, 0]}
        />
      )}

      {/* Floor plane (subtle reflective surface) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial
          color="#0d0d1a"
          metalness={0.3}
          roughness={0.8}
          transparent
          opacity={0.8}
        />
      </mesh>
    </>
  )
}
