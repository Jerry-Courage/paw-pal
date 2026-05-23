'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import { ArrowLeft, Sparkles, Loader2, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import NeuralMindMap from '@/components/library/NeuralMindMap'
import { useStudyTimer } from '@/hooks/useStudyTimer'

interface MindMapData {
  center: string
  branches: { topic: string; subtopics: string[] }[]
}

export default function MindMapPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  useStudyTimer(true)
  const [mapData, setMapData] = useState<MindMapData | null>(null)
  const [loading, setLoading] = useState(true)

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  // Try to load from ai_notes_json first, then generate
  useEffect(() => {
    const load = async () => {
      try {
        const res = await libraryApi.getResource(resourceId)
        const existing = res.data.ai_notes_json?.mind_map
        if (existing?.center && existing?.branches?.length) {
          setMapData(existing)
          setLoading(false)
          return
        }
        // Generate fresh
        const gen = await libraryApi.generateMindMap(resourceId)
        setMapData(gen.data)
      } catch {
        toast.error('Failed to generate mind map.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [resourceId])

  const handleRegenerate = async () => {
    setLoading(true)
    try {
      const gen = await libraryApi.generateMindMap(resourceId)
      setMapData(gen.data)
    } catch {
      toast.error('Failed to regenerate mind map.')
    } finally {
      setLoading(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 text-center max-w-xs px-6">
          <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-orange-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Building Mind Map</h2>
            <p className="text-slate-500 mt-1.5 text-sm">Mapping concepts and connections...</p>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!mapData) {
    return (
      <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-500 text-sm">Could not load mind map.</p>
          <button onClick={handleRegenerate} className="px-6 py-3 bg-orange-500 text-white font-black text-sm rounded-2xl hover:bg-orange-400 transition-all">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 [top:var(--nav-height)] bg-[#0d0d0d] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0 bg-[#0d0d0d] z-20">
        <div className="flex items-center gap-3">
          <Link href={`/library/${resourceId}`} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Mind Map</p>
            <h1 className="text-xs font-black text-slate-400 truncate max-w-[200px]">{resource?.title}</h1>
          </div>
        </div>
        <button onClick={handleRegenerate} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all" title="Regenerate">
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      {/* Map canvas */}
      <div className="flex-1 relative bg-[#090909]">
        <NeuralMindMap data={mapData} />
      </div>
    </div>
  )
}
