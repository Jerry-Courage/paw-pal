'use client'

import { Canvas } from '@react-three/fiber'
import { Suspense, forwardRef, useImperativeHandle, useState } from 'react'
import type { XRStore } from '@react-three/xr'
import { XR, XROrigin } from '@react-three/xr'
import SceneEnvironment from './SceneEnvironment'
import VRLoadingScreen from './VRLoadingScreen'
import VRFallback from './VRFallback'

export interface FlowStateCanvasProps {
  children?: React.ReactNode
  className?: string
  onCreated?: () => void
  onError?: (error: Error) => void
  /** Show shadows (default: false for performance) */
  shadows?: boolean
  /** Camera FOV (default: 50) */
  fov?: number
  /** Camera initial position */
  cameraPosition?: [number, number, number]
  /** XR store — when provided, scene is wrapped with XR provider */
  xrStore?: XRStore | null
}

export interface FlowStateCanvasHandle {
  /** Force re-render the canvas */
  reset: () => void
}

const FlowStateCanvas = forwardRef<FlowStateCanvasHandle, FlowStateCanvasProps>(
  function FlowStateCanvas(
    {
      children,
      className = '',
      onCreated,
      onError,
      shadows = false,
      fov = 50,
      cameraPosition = [0, 1.5, 4],
      xrStore = null,
    },
    ref
  ) {
    const [key, setKey] = useState(0)
    const [hasError, setHasError] = useState(false)

    useImperativeHandle(ref, () => ({
      reset: () => {
        setHasError(false)
        setKey((k) => k + 1)
      },
    }))

    if (hasError) {
      return <VRFallback onRetry={() => { setHasError(false); setKey((k) => k + 1) }} />
    }

    const sceneContent = (
      <Suspense fallback={null}>
        <SceneEnvironment />
        {children}
      </Suspense>
    )

    return (
      <div className={`relative w-full h-full bg-[#0a0014] ${className}`}>
        <Canvas
          key={key}
          shadows={shadows}
          camera={{ position: cameraPosition, fov, near: 0.1, far: 1000 }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'default',
            failIfMajorPerformanceCaveat: false,
          }}
          dpr={[1, 1.5]}
          onCreated={(state) => {
            state.gl.setClearColor('#0a0014')
            onCreated?.()
          }}
          onError={() => {
            setHasError(true)
            onError?.(new Error('WebGL initialization failed'))
          }}
        >
          {xrStore ? (
            <XR store={xrStore}>
              <XROrigin position={[0, 0, 0]} />
              {sceneContent}
            </XR>
          ) : (
            sceneContent
          )}
        </Canvas>
        <VRLoadingScreen />
      </div>
    )
  }
)

export default FlowStateCanvas
