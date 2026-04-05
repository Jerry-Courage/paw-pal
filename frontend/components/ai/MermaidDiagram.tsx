'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, Download } from 'lucide-react'

interface Props {
  code: string
  className?: string
}

export default function MermaidDiagram({ code, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    if (!code || !ref.current) return
    setLoading(true)
    setError('')

    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: 'Inter, sans-serif',
        suppressErrorRendering: true,
      })

      mermaid.render(idRef.current, code)
        .then(({ svg }) => {
          if (ref.current) {
            ref.current.innerHTML = svg
            setLoading(false)
          }
        })
        .catch((e) => {
          setError('Could not render diagram. The syntax may be invalid.')
          setLoading(false)
          const errorElement = document.getElementById(idRef.current);
          if (errorElement) errorElement.remove();
        })
    })
  }, [code])

  const downloadSVG = () => {
    const svg = ref.current?.querySelector('svg')
    if (!svg) return
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'diagram.svg'; a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return (
    <div className="flex items-center gap-2 text-red-500 text-xs bg-red-50 dark:bg-red-950/30 rounded-xl p-3">
      <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
    </div>
  )

  return (
    <div className={className}>
      {loading && (
        <div className="flex items-center gap-2 text-sky-500 text-xs p-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Rendering diagram...
        </div>
      )}
      <div ref={ref} className="overflow-x-auto" />
      {!loading && !error && (
        <button onClick={downloadSVG}
          className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 hover:text-sky-500 transition-colors">
          <Download className="w-3 h-3" /> Download SVG
        </button>
      )}
    </div>
  )
}
