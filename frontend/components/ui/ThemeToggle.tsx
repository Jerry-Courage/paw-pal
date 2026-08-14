'use client'

import { useTheme } from 'next-themes'
import { Palette } from 'lucide-react'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-8 h-8" />

  return (
    <Link
      href="/marketplace?tab=themes"
      className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all flex items-center gap-1.5"
      title="Customize Themes in Marketplace"
    >
      <Palette className="w-4 h-4 text-orange-400" />
      <span className="hidden md:inline text-xs font-bold text-slate-300">Themes</span>
    </Link>
  )
}
