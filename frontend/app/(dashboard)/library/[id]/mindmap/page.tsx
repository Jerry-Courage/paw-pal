'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import { ArrowLeft, Sparkles, Loader2, RotateCcw, Brain, Cpu, Database, Network } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const BRANCH_COLORS = [
  'text-violet-400 border-violet-500/30 bg-violet-500/5',
  'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  'text-amber-400 border-amber-500/30 bg-amber-500/5',
  'text-sky-400 border-sky-500/30 bg-sky-500/5',
  'text-rose-400 border-rose-500/30 bg-rose-500/5',
  'text-indigo-400 border-indigo-500/30 bg-indigo-500/5',
  'text-teal-400 border-teal-500/30 bg-teal-500/5',
  'text-orange-400 border-orange-500/30 bg-orange-500/5',
]
const BRANCH_ICONS = [Cpu, Network, Database, Brain]

interface MindMapData {
  center: string
  branches: { topic: string; subtopics: string[] }[]
}

export default function MindMapPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
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
      <div className="flex-1 overflow-auto bg-[#0d0d0d] scrollbar-hide">
        <div className="relative w-full max-w-7xl mx-auto py-10 px-4 sm:px-8">
          {/* Central hub */}
          <div className="flex justify-center mb-16 relative z-20">
            <div className="relative px-8 py-5 bg-[#1a1a1a] border border-orange-500/30 rounded-3xl shadow-xl flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30 -mt-10">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="text-[9px] font-black text-orange-500/60 uppercase tracking-widest">Central Topic</div>
              <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight text-center">{mapData.center}</h1>
            </div>
          </div>

          {/* Branches */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 relative z-10">
            {mapData.branches?.map((branch, i) => {
              const colorClass = BRANCH_COLORS[i % BRANCH_COLORS.length]
              const Icon = BRANCH_ICONS[i % BRANCH_ICONS.length]
              return (
                <div key={i} className="w-full animate-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className={cn('p-4 rounded-2xl border bg-[#1a1a1a] mb-3', colorClass)}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-current/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <h3 className="font-black text-sm truncate">{branch.topic}</h3>
                    </div>
                  </div>
                  <div className="space-y-2 pl-4 border-l border-white/8">
                    {branch.subtopics?.map((sub, j) => (
                      <div key={j} className="px-3 py-2 bg-[#1a1a1a] border border-white/5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:border-orange-500/20 transition-all cursor-default">
                        {sub}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
