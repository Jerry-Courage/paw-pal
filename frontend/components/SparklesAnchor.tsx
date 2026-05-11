'use client'
// This component exists solely to ensure Sparkles from lucide-react
// is included in the client bundle. It renders nothing visible.
import { Sparkles } from 'lucide-react'
export default function SparklesAnchor() {
  return <span style={{ display: 'none' }} aria-hidden><Sparkles size={0} /></span>
}
