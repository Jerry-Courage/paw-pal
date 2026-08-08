'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'

export interface VRFallbackProps {
  message?: string
  onRetry?: () => void
}

export default function VRFallback({
  message = '3D rendering is not available in your browser.',
  onRetry,
}: VRFallbackProps) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0014]">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center px-4">
        <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-violet-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-violet-200">
            3D Unavailable
          </h3>
          <p className="text-sm text-violet-300/60 mt-2">
            {message}
          </p>
          <p className="text-xs text-violet-400/40 mt-2">
            Try enabling hardware acceleration in your browser settings.
          </p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        )}
      </div>
    </div>
  )
}
