'use client'
// Ensures Sparkles from lucide-react stays in the shared layout bundle.
import { Sparkles } from 'lucide-react'

export default function SparklesAnchor() {
  return (
    <span className="opacity-0 pointer-events-none absolute w-0 h-0 overflow-hidden" aria-hidden="true">
      <Sparkles className="w-0 h-0" />
    </span>
  )
}
