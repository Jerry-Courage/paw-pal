'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import Link from 'next/link'
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
  const [regenerating, setRegenerating] = useState(false)

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  useEffect(() => {
    const load = async () => {
      try {
        const res = await libraryApi.getResource(resourceId)
        const existing = res.data.ai_notes_json?.mind_map
        if (existing?.center && existing?.branches?.length) {
          setMapData(existing); setLoading(false); return
        }
        const gen = await libraryApi.generateMindMap(resourceId)
        setMapData(gen.data)
      } catch { toast.error('Failed to generate mind map.') }
      finally { setLoading(false) }
    }
    load()
  }, [resourceId])

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const gen = await libraryApi.generateMindMap(resourceId)
      setMapData(gen.data)
      toast.success('Mind map regenerated!')
    } catch { toast.error('Failed to regenerate mind map.') }
    finally { setRegenerating(false) }
  }

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center max-w-xs px-6">
        <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-[1.5rem] flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-[32px] animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>hub</span>
        </div>
        <div>
          <h2 className="text-[22px] font-bold text-on-surface tracking-tight">Building Mind Map</h2>
          <p className="text-on-surface-variant mt-2 text-[14px]">Mapping concepts and connections…</p>
        </div>
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )

  if (!mapData) return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-6">
      <span className="material-symbols-outlined text-on-surface-variant/30 text-[64px]">hub</span>
      <p className="text-on-surface-variant text-[15px]">Could not load mind map.</p>
      <button onClick={handleRegenerate}
        className="px-6 py-3 bg-primary-container text-on-primary-container font-bold rounded-full shadow-[0_4px_0_0_#763300] hover:brightness-110 transition-all">
        Try Again
      </button>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 sm:px-5 py-2 sm:py-3">
        {/* Left: back + title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link href={`/library/${resourceId}`}
            className="p-2 rounded-[1rem] bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high transition-all shrink-0">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <div className="bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant/30 rounded-[1rem] px-3 sm:px-4 py-2 min-w-0">
            <p className="text-[12px] sm:text-[13px] font-bold text-on-surface leading-tight truncate max-w-[120px] sm:max-w-[240px]">{resource?.title || '…'}</p>
            <p className="text-[10px] sm:text-[11px] text-on-surface-variant">AI-Generated Mind Map</p>
          </div>
        </div>

        {/* Right: regenerate + share */}
        <div className="flex items-center gap-2">
          <button onClick={handleRegenerate} disabled={regenerating}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant/30 rounded-full text-on-surface text-[12px] sm:text-[13px] font-bold hover:bg-surface-container-high transition-all disabled:opacity-50">
            <span className={`material-symbols-outlined text-[16px] ${regenerating ? 'animate-spin' : ''}`} style={{ fontVariationSettings: "'FILL' 1" }}>
              {regenerating ? 'autorenew' : 'auto_fix_high'}
            </span>
            <span className="hidden sm:inline">{regenerating ? 'Generating…' : 'Regenerate'}</span>
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied!') }}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-secondary-container text-on-secondary-container rounded-full text-[12px] sm:text-[13px] font-bold hover:brightness-110 transition-all">
            <span className="material-symbols-outlined text-[16px]">share</span>
            <span className="hidden sm:inline">Share Map</span>
          </button>
        </div>
      </header>

      {/* ── Map canvas ─────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        <NeuralMindMap data={mapData} resourceTitle={resource?.subject || resource?.title || ''} resourceId={resourceId} />
      </div>
    </div>
  )
}
