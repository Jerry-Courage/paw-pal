'use client'

import { useState, useEffect, useCallback } from 'react'
import { Glasses, Loader2 } from 'lucide-react'
import type { XRStore } from '@react-three/xr'

interface EnterVRButtonProps {
  xrStore: XRStore
  className?: string
}

/**
 * Button to enter WebXR VR session.
 * Detects XR support, shows loading state, handles errors.
 * Hidden when XR is not available.
 */
export default function EnterVRButton({ xrStore, className = '' }: EnterVRButtonProps) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [entering, setEntering] = useState(false)

  useEffect(() => {
    if (!navigator.xr) {
      setSupported(false)
      return
    }
    navigator.xr.isSessionSupported('immersive-vr').then(setSupported).catch(() => setSupported(false))
  }, [])

  const handleEnterVR = useCallback(async () => {
    if (entering) return
    setEntering(true)
    try {
      await xrStore.enterVR()
    } catch {
      // Session failed to start — stay in desktop mode
    } finally {
      setEntering(false)
    }
  }, [xrStore, entering])

  // Don't render if XR support is unknown or not supported
  if (supported !== true) return null

  return (
    <button
      onClick={handleEnterVR}
      disabled={entering}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-all ${className}`}
    >
      {entering ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Glasses className="w-4 h-4" />
      )}
      {entering ? 'Entering VR...' : 'Enter VR'}
    </button>
  )
}
