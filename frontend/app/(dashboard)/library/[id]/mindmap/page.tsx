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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center max-w-sm px-6">
          <div className="w-20 h-20 bg-violet-500/10 border border-violet-500/20 rounded-[2rem] flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-violet-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tighter">Building Neural Web</h2>
            <p className="text-slate-400 mt-2 text-sm">Mapping concepts and connections from your material...</p>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!mapData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Could not load mind map.</p>
          <button onClick={handleRegenerate} className="px-6 py-3 bg-violet-500 text-white font-black rounded-2xl hover:bg-violet-400 transition-all">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-white/5 flex-shrink-0 sticky top-0 z-20 bg-slate-950/90 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Link href={`/library/${resourceId}`} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Neural Mind Map</p>
            <h1 className="text-sm font-black text-white truncate max-w-xs">{resource?.title}</h1>
          </div>
        </div>
        <button
          onClick={handleRegenerate}
          className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all"
          title="Regenerate"
        >
          <RotateCcw className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Map canvas */}
      <div className="flex-1 overflow-auto bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:28px_28px]">
        <div className="relative w-full max-w-7xl mx-auto py-16 px-4 sm:px-10">

          {/* Central hub */}
          <div className="flex justify-center mb-20 relative z-20">
            <div className="group relative">
              <div className="absolute -inset-6 bg-violet-500/10 rounded-[3rem] blur-2xl opacity-60 animate-pulse" />
              <div className="relative px-10 py-6 bg-slate-900 border-2 border-violet-500/40 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/40 -mt-12">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="text-[9px] font-black text-violet-400/60 uppercase tracking-[0.4em]">Central Matrix</div>
                <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tighter text-center uppercase">
                  {mapData.center}
                </h1>
              </div>
            </div>
          </div>

          {/* Branches */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-16 relative z-10 justify-items-center">
            {mapData.branches?.map((branch, i) => {
              const colorClass = BRANCH_COLORS[i % BRANCH_COLORS.length]
              const Icon = BRANCH_ICONS[i % BRANCH_ICONS.length]
              return (
                <div
                  key={i}
                  className="w-full max-w-sm animate-in slide-in-from-bottom-8 duration-700"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {/* Branch header */}
                  <div className="relative mb-6">
                    <div className="absolute -top-16 left-1/2 w-px h-16 bg-gradient-to-b from-transparent to-violet-500/20 hidden lg:block" />
                    <div className={cn('p-5 rounded-[2rem] border-2 shadow-lg bg-slate-900 relative overflow-hidden', colorClass)}>
                      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-current/10 flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[8px] font-black uppercase tracking-[0.2em] opacity-50 mb-0.5">Focus Branch</div>
                          <h3 className="font-black text-sm uppercase tracking-tight truncate leading-none">{branch.topic}</h3>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Subtopics */}
                  <div className="space-y-3 pl-8 relative">
                    <div className="absolute left-4 top-0 bottom-4 w-px bg-gradient-to-b from-slate-700 to-transparent" />
                    {branch.subtopics?.map((sub, j) => (
                      <div
                        key={j}
                        className="relative pl-6 animate-in slide-in-from-left-4 duration-500"
                        style={{ animationDelay: `${(i * 80) + (j * 40)}ms` }}
                      >
                        <div className="absolute left-[-16px] top-4 w-4 h-px bg-slate-700" />
                        <div className="px-4 py-3 bg-slate-800/60 border border-white/5 rounded-2xl text-xs font-bold text-slate-300 hover:border-violet-500/20 hover:bg-slate-800 transition-all hover:translate-x-1 cursor-default">
                          {sub}
                        </div>
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
