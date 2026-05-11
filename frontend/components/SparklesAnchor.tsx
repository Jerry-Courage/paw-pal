'use client'
// Ensures Sparkles from lucide-react stays in the shared layout bundle.
// Without this, webpack tree-shakes Sparkles from shared chunks causing
// ReferenceError at runtime when other components reference it.
import { Sparkles } from 'lucide-react'

export default function SparklesAnchor() {
  // Render with opacity-0 so it's invisible but present in the DOM
  // This prevents webpack from tree-shaking the Sparkles import
  return (
    <span className="opacity-0 pointer-events-none absolute w-0 h-0 overflow-hidden" aria-hidden="true">
      <Sparkles className="w-0 h-0" />
    </span>
  )
}
