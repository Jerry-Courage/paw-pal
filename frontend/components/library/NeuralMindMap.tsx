'use client'

import React, { useState, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'

interface MindMapData {
  center: string
  branches: { topic: string; subtopics: string[] }[]
}

interface NeuralMindMapProps {
  data: MindMapData
  resourceTitle?: string
}

// Node color palette — matches reference (oranges, purples, blues, greys)
const NODE_COLORS = [
  { bg: '#c084fc', text: '#1a0033', glow: 'rgba(192,132,252,0.4)' }, // purple
  { bg: '#fb923c', text: '#3d1200', glow: 'rgba(251,146,60,0.4)' },  // orange
  { bg: '#6366f1', text: '#ffffff', glow: 'rgba(99,102,241,0.4)' },  // indigo
  { bg: '#4ade80', text: '#052e16', glow: 'rgba(74,222,128,0.4)' },  // green
  { bg: '#f472b6', text: '#3d0022', glow: 'rgba(244,114,182,0.4)' }, // pink
  { bg: '#38bdf8', text: '#0c1a3d', glow: 'rgba(56,189,248,0.4)' },  // sky
  { bg: '#fbbf24', text: '#3d1f00', glow: 'rgba(251,191,36,0.4)' },  // amber
  { bg: '#64748b', text: '#f1f5f9', glow: 'rgba(100,116,139,0.35)' }, // slate
]

const BRANCH_ICONS = [
  'public', 'science', 'hub', 'calculate',
  'biotech', 'history_edu', 'language', 'psychology',
]

export default function NeuralMindMap({ data, resourceTitle }: NeuralMindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.85)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [selectedNode, setSelectedNode] = useState<{ type: 'center' | 'branch' | 'sub'; idx?: number; sidx?: number } | null>(null)
  const [showGuide, setShowGuide] = useState(true)

  const handleResetView = () => { setPan({ x: 0, y: 0 }); setZoom(0.85) }
  const handleZoomIn = () => setZoom(p => Math.min(p * 1.2, 3))
  const handleZoomOut = () => setZoom(p => Math.max(p / 1.2, 0.25))

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.node-click')) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }
  const handleMouseUp = () => setIsDragging(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.node-click')) return
    setIsDragging(true)
    setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y })
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    setPan({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y })
  }
  const handleTouchEnd = () => setIsDragging(false)

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const f = 1.08
    setZoom(p => e.deltaY < 0 ? Math.min(p * f, 3) : Math.max(p / f, 0.25))
  }

  // Compute layout — radial with circular nodes
  const branches = useMemo(() => {
    if (!data?.branches) return []
    const count = data.branches.length
    const angleStep = (2 * Math.PI) / count
    const R = 280 // center-to-branch radius

    return data.branches.map((b, i) => {
      const angle = i * angleStep - Math.PI / 2 // start from top
      const bx = Math.cos(angle) * R
      const by = Math.sin(angle) * R

      const side = bx >= 0 ? 1 : -1
      const subtopicSpacing = 70
      const subCount = b.subtopics?.length || 0
      const totalH = (subCount - 1) * subtopicSpacing

      const subtopics = (b.subtopics || []).map((sub, j) => {
        const subR = R + 190
        const spread = (subCount > 1 ? (j / (subCount - 1) - 0.5) : 0) * 1.2
        const subAngle = angle + spread
        return {
          text: sub,
          x: Math.cos(subAngle) * subR,
          y: Math.sin(subAngle) * subR,
        }
      })

      return {
        topic: b.topic,
        x: bx, y: by,
        side,
        subtopics,
        color: NODE_COLORS[i % NODE_COLORS.length],
        icon: BRANCH_ICONS[i % BRANCH_ICONS.length],
      }
    })
  }, [data])

  // Selected node label for detail panel
  const selectedLabel = useMemo(() => {
    if (!selectedNode) return null
    if (selectedNode.type === 'center') return { title: data.center, detail: `Central concept of this mind map` }
    if (selectedNode.type === 'branch' && selectedNode.idx !== undefined) {
      const b = data.branches[selectedNode.idx]
      return { title: b.topic, detail: b.subtopics?.join(' · ') || '' }
    }
    if (selectedNode.type === 'sub' && selectedNode.idx !== undefined && selectedNode.sidx !== undefined) {
      return { title: data.branches[selectedNode.idx]?.subtopics?.[selectedNode.sidx] || '', detail: `Part of ${data.branches[selectedNode.idx]?.topic}` }
    }
    return null
  }, [selectedNode, data])

  const centerNodeRadius = 90
  const branchNodeRadius = 60
  const subNodeRadius = 42

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      className={cn(
        'relative w-full h-full overflow-hidden select-none touch-none',
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
      style={{ background: '#0e0e10' }}
    >
      {/* Dot-grid background — matches reference */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          transform: `translate(${pan.x % 28}px, ${pan.y % 28}px)`,
        }}
      />

      {/* Animated pulse keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes edgePulse { to { stroke-dashoffset: -40; } }
        .edge-pulse { stroke-dasharray: 6 14; animation: edgePulse 1.8s linear infinite; }
        @keyframes nodeFloat { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-4px); } }
        .node-float { animation: nodeFloat 4s ease-in-out infinite; }
      `}} />

      {/* Canvas transform layer */}
      <div
        className="absolute w-0 h-0"
        style={{
          transform: `translate(calc(50vw + ${pan.x}px), calc(50vh + ${pan.y}px)) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {/* SVG connections */}
        <svg className="absolute overflow-visible pointer-events-none" style={{ zIndex: 1 }}>
          {branches.map((branch, i) => {
            const angle = Math.atan2(branch.y, branch.x)

            // Center node edge → branch
            const cx0 = Math.cos(angle) * (centerNodeRadius - 5)
            const cy0 = Math.sin(angle) * (centerNodeRadius - 5)
            const cx1 = branch.x - Math.cos(angle) * (branchNodeRadius - 5)
            const cy1 = branch.y - Math.sin(angle) * (branchNodeRadius - 5)

            const midX = (cx0 + cx1) / 2
            const midY = (cy0 + cy1) / 2

            return (
              <g key={i}>
                {/* Center → branch glow line */}
                <line x1={cx0} y1={cy0} x2={cx1} y2={cy1}
                  stroke={branch.color.bg} strokeWidth="3" opacity="0.18" />
                {/* Animated pulse */}
                <line x1={cx0} y1={cy0} x2={cx1} y2={cy1}
                  stroke={branch.color.bg} strokeWidth="2" opacity="0.7"
                  className="edge-pulse" />

                {/* Branch → subtopics */}
                {branch.subtopics.map((sub, j) => {
                  const subAngle = Math.atan2(sub.y - branch.y, sub.x - branch.x)
                  const sx0 = branch.x + Math.cos(subAngle) * (branchNodeRadius - 5)
                  const sy0 = branch.y + Math.sin(subAngle) * (branchNodeRadius - 5)
                  const sx1 = sub.x - Math.cos(subAngle) * (subNodeRadius - 4)
                  const sy1 = sub.y - Math.sin(subAngle) * (subNodeRadius - 4)
                  return (
                    <g key={j}>
                      <line x1={sx0} y1={sy0} x2={sx1} y2={sy1}
                        stroke={branch.color.bg} strokeWidth="2" opacity="0.15" />
                      <line x1={sx0} y1={sy0} x2={sx1} y2={sy1}
                        stroke={branch.color.bg} strokeWidth="1.5" opacity="0.5"
                        className="edge-pulse" style={{ animationDelay: `${j * 0.2}s` }} />
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>

        {/* Center node */}
        <div
          className="absolute node-click node-float"
          style={{ transform: 'translate(-50%, -50%)', zIndex: 20 }}
          onClick={() => setSelectedNode({ type: 'center' })}
        >
          <div style={{ position: 'relative', width: centerNodeRadius * 2, height: centerNodeRadius * 2 }}>
            {/* Glow ring */}
            <div style={{
              position: 'absolute', inset: -8,
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(255,138,61,0.3) 0%, transparent 70%)`,
              animation: 'nodeFloat 3s ease-in-out infinite',
            }} />
            {/* Circle */}
            <div
              className="cursor-pointer"
              style={{
                width: centerNodeRadius * 2, height: centerNodeRadius * 2,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #ff8a3d 0%, #ffb68d 100%)',
                boxShadow: '0 0 40px rgba(255,138,61,0.5), 0 8px 32px rgba(0,0,0,0.4)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                border: selectedNode?.type === 'center' ? '3px solid white' : '2px solid rgba(255,255,255,0.2)',
                transition: 'transform 0.2s',
              }}
            >
              <span className="material-symbols-outlined text-[22px] mb-1 text-on-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}>wb_sunny</span>
              <span style={{
                fontSize: '11px', fontWeight: 900, textAlign: 'center',
                color: '#3d1200', lineHeight: 1.2, padding: '0 10px',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {data.center}
              </span>
            </div>
          </div>
        </div>

        {/* Branch nodes + subtopics */}
        {branches.map((branch, i) => (
          <g key={i}>
            {/* Branch circle node */}
            <div
              className="absolute node-click node-float"
              style={{ left: branch.x, top: branch.y, transform: 'translate(-50%,-50%)', zIndex: 15, animationDelay: `${i * 0.4}s` }}
              onClick={() => setSelectedNode({ type: 'branch', idx: i })}
            >
              <div style={{ position: 'relative', width: branchNodeRadius * 2, height: branchNodeRadius * 2 }}>
                {/* Glow */}
                <div style={{
                  position: 'absolute', inset: -6, borderRadius: '50%',
                  background: `radial-gradient(circle, ${branch.color.glow} 0%, transparent 70%)`,
                }} />
                {/* Circle */}
                <div
                  className="cursor-pointer"
                  style={{
                    width: branchNodeRadius * 2, height: branchNodeRadius * 2, borderRadius: '50%',
                    background: branch.color.bg,
                    boxShadow: `0 0 24px ${branch.color.glow}, 0 6px 20px rgba(0,0,0,0.4)`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    border: selectedNode?.type === 'branch' && selectedNode.idx === i
                      ? '3px solid white' : '2px solid rgba(255,255,255,0.15)',
                    transition: 'transform 0.15s',
                    cursor: 'pointer',
                  }}
                >
                  <span className="material-symbols-outlined text-[18px] mb-0.5" style={{ color: branch.color.text, fontVariationSettings: "'FILL' 1" }}>
                    {branch.icon}
                  </span>
                  <span style={{
                    fontSize: '10px', fontWeight: 800, textAlign: 'center',
                    color: branch.color.text, lineHeight: 1.2, padding: '0 6px',
                  }}>
                    {branch.topic}
                  </span>
                </div>
              </div>
            </div>

            {/* Subtopic nodes */}
            {branch.subtopics.map((sub, j) => (
              <div
                key={j}
                className="absolute node-click"
                style={{ left: sub.x, top: sub.y, transform: 'translate(-50%,-50%)', zIndex: 10 }}
                onClick={() => setSelectedNode({ type: 'sub', idx: i, sidx: j })}
              >
                <div style={{ position: 'relative', width: subNodeRadius * 2, height: subNodeRadius * 2 }}>
                  <div
                    className="cursor-pointer"
                    style={{
                      width: subNodeRadius * 2, height: subNodeRadius * 2, borderRadius: '50%',
                      background: '#1e2022',
                      boxShadow: `0 0 12px ${branch.color.glow}, 0 4px 12px rgba(0,0,0,0.5)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: selectedNode?.type === 'sub' && selectedNode.idx === i && selectedNode.sidx === j
                        ? `2px solid ${branch.color.bg}` : `1.5px solid ${branch.color.bg}50`,
                      transition: 'transform 0.15s',
                    }}
                  >
                    <span style={{
                      fontSize: '9px', fontWeight: 700, textAlign: 'center',
                      color: '#e2e2e5', lineHeight: 1.2, padding: '0 6px',
                    }}>
                      {sub.text}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </g>
        ))}
      </div>

      {/* ── Zoom controls — bottom left ─────────────────────────────── */}
      <div className="absolute bottom-6 left-6 z-50 flex items-center gap-1 p-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant/30 rounded-full shadow-xl">
        <button onClick={handleZoomOut}
          className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[18px]">remove</span>
        </button>
        <span className="text-[12px] font-bold text-on-surface-variant w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={handleZoomIn}
          className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[18px]">add</span>
        </button>
        <div className="w-px h-5 bg-outline-variant/40 mx-1" />
        <button onClick={handleResetView}
          className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[18px]">fit_screen</span>
        </button>
      </div>

      {/* ── Node detail popup ─────────────────────────────────────────── */}
      {selectedNode && selectedLabel && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-xs w-full px-4">
          <div className="bg-surface-container-low/95 backdrop-blur-sm border border-outline-variant/40 rounded-[1.5rem] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-on-surface text-[15px] leading-tight">{selectedLabel.title}</p>
                {selectedLabel.detail && (
                  <p className="text-on-surface-variant text-[12px] mt-1 line-clamp-2">{selectedLabel.detail}</p>
                )}
              </div>
              <button onClick={() => setSelectedNode(null)}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-all shrink-0">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Study Guide panel — bottom right ─────────────────────────── */}
      {showGuide && !selectedNode && (
        <div className="absolute bottom-6 right-6 z-50 w-72">
          <div className="bg-surface-container-low/95 backdrop-blur-sm border border-outline-variant/40 rounded-[1.5rem] p-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-[0.75rem] bg-primary/15 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>menu_book</span>
              </div>
              <p className="font-bold text-on-surface text-[14px]">Study Guide</p>
            </div>
            <p className="text-on-surface-variant text-[13px] leading-relaxed">
              This mind map was generated from your material. Tap any node to see more details. Drag to pan · Scroll to zoom.
            </p>
            <button onClick={() => setShowGuide(false)}
              className="mt-3 w-full py-2 rounded-[1rem] bg-surface-container-high text-on-surface-variant text-[12px] font-bold hover:bg-surface-container-highest transition-all">
              Hide Help
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
