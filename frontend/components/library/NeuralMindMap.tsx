'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Sparkles, Brain, Cpu, Database, Network, ZoomIn, ZoomOut, Maximize2, Layers } from 'lucide-react'

interface MindMapData {
  center: string
  branches: { topic: string; subtopics: string[] }[]
}

interface NeuralMindMapProps {
  data: MindMapData
}

const BRANCH_COLORS = [
  '#c084fc', // purple
  '#34d399', // emerald
  '#fbbf24', // amber
  '#38bdf8', // sky
  '#f43f5e', // rose
  '#6366f1', // indigo
  '#2dd4bf', // teal
  '#fb923c', // orange
]

const BRANCH_ICONS = [Cpu, Network, Database, Brain]

export default function NeuralMindMap({ data }: NeuralMindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Interaction states
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.8) // zoom slightly out initially to show whole map
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  // Collapse/Expand state for main branches
  const [collapsedBranches, setCollapsedBranches] = useState<Record<number, boolean>>({})

  // Center/Reset canvas view
  const handleResetView = () => {
    setPan({ x: 0, y: 0 })
    setZoom(0.8)
  }

  // Zoom handlers
  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.2, 3))
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.2, 0.3))

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.clickable-node')) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  const handleMouseUp = () => setIsDragging(false)

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.clickable-node')) return
    setIsDragging(true)
    setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    setPan({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y })
  }

  const handleTouchEnd = () => setIsDragging(false)

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = 1.08
    if (e.deltaY < 0) {
      setZoom(prev => Math.min(prev * zoomFactor, 3))
    } else {
      setZoom(prev => Math.max(prev / zoomFactor, 0.3))
    }
  }

  // Double click reset
  const handleDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.clickable-node')) return
    handleResetView()
  }

  // Compute Layout Positions
  const branches = useMemo(() => {
    if (!data || !data.branches) return []
    const count = data.branches.length
    const angleStep = (2 * Math.PI) / count
    
    return data.branches.map((b, i) => {
      const angle = i * angleStep
      // Spread layout wider horizontally to fit typical screens
      const bx = Math.cos(angle) * 380
      const by = Math.sin(angle) * 260
      
      const side = bx >= 0 ? 1 : -1
      const subtopicsCount = b.subtopics?.length || 0
      const subtopicSpacing = 56
      const totalHeight = (subtopicsCount - 1) * subtopicSpacing
      
      const subtopicList = (b.subtopics || []).map((sub, j) => {
        // Position subtopics stacked vertically on the outer side of the parent node
        const sx = bx + side * 220
        const sy = by - totalHeight / 2 + j * subtopicSpacing
        return { text: sub, x: sx, y: sy }
      })
      
      return {
        topic: b.topic,
        x: bx,
        y: by,
        side,
        subtopics: subtopicList,
        color: BRANCH_COLORS[i % BRANCH_COLORS.length],
        Icon: BRANCH_ICONS[i % BRANCH_ICONS.length]
      }
    })
  }, [data])

  const toggleBranch = (idx: number) => {
    setCollapsedBranches(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }))
  }

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
      onDoubleClick={handleDoubleClick}
      className={cn(
        "relative w-full h-full overflow-hidden select-none touch-none bg-[#0a0a0a]",
        isDragging ? "cursor-grabbing" : "cursor-grab"
      )}
    >
      {/* Floating Canvas Controls (Mobile Friendly Sizing) */}
      <div className="absolute bottom-6 right-6 z-50 flex items-center gap-2 p-1.5 bg-[#151515]/90 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-md">
        <button 
          onClick={handleZoomIn}
          className="p-2.5 rounded-xl hover:bg-white/5 active:scale-95 text-slate-400 hover:text-white transition-all"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button 
          onClick={handleZoomOut}
          className="p-2.5 rounded-xl hover:bg-white/5 active:scale-95 text-slate-400 hover:text-white transition-all"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button 
          onClick={handleResetView}
          className="p-2.5 rounded-xl hover:bg-white/5 active:scale-95 text-slate-400 hover:text-white transition-all"
          title="Center View"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>

      {/* Grid Pattern Background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-5 transition-all duration-75 ease-out"
        style={{
          backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center'
        }}
      />

      {/* SVG Neural pulse stylesheet */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes neuralPulse {
          to {
            stroke-dashoffset: -40;
          }
        }
        .neural-pulse {
          stroke-dasharray: 6, 14;
          animation: neuralPulse 1.5s linear infinite;
        }
      `}} />

      {/* Canvas Layer */}
      <div 
        className="absolute w-0 h-0 transition-transform duration-75 ease-out"
        style={{
          transform: `translate(calc(50vw + ${pan.x}px), calc(50vh + ${pan.y}px)) scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        {/* SVG Neural Connections */}
        <svg className="absolute overflow-visible pointer-events-none z-0">
          <defs>
            {/* Soft shadows for nodes */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="15" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Render paths */}
          {branches.map((branch, i) => {
            const isCollapsed = collapsedBranches[i]
            
            // 1. Center to Branch Bezier Curve
            const pathCenterToBranch = `M 0 0 C ${branch.x * 0.4} 0, ${branch.x * 0.6} ${branch.y}, ${branch.x} ${branch.y}`
            
            return (
              <g key={i}>
                {/* Background glowing line */}
                <path 
                  d={pathCenterToBranch} 
                  stroke={branch.color} 
                  strokeWidth="3.5" 
                  fill="none" 
                  className="opacity-20"
                />
                {/* Animated dash pulse */}
                <path 
                  d={pathCenterToBranch} 
                  stroke={branch.color} 
                  strokeWidth="2" 
                  fill="none" 
                  className="neural-pulse opacity-70"
                />

                {/* 2. Branch to Subtopics Curves */}
                {!isCollapsed && branch.subtopics.map((sub, j) => {
                  const startX = branch.x + (branch.side * 100)
                  const startY = branch.y
                  const endX = sub.x - (branch.side * 90)
                  const endY = sub.y
                  
                  const pathBranchToSub = `M ${startX} ${startY} C ${startX + branch.side * 60} ${startY}, ${endX - branch.side * 60} ${endY}, ${endX} ${endY}`
                  
                  return (
                    <g key={j}>
                      <path 
                        d={pathBranchToSub} 
                        stroke={branch.color} 
                        strokeWidth="2" 
                        fill="none" 
                        className="opacity-15"
                      />
                      <path 
                        d={pathBranchToSub} 
                        stroke={branch.color} 
                        strokeWidth="1.5" 
                        fill="none" 
                        className="neural-pulse opacity-45"
                        style={{ animationDelay: `${j * 0.1}s` }}
                      />
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>

        {/* Central Hub Node */}
        <div className="absolute transform -translate-x-1/2 -translate-y-1/2 z-30">
          <div className="relative group clickable-node">
            <div className="absolute -inset-4 bg-orange-500/20 rounded-[2.5rem] blur-xl opacity-70 animate-pulse pointer-events-none" />
            <div className="relative px-8 py-5 bg-[#141414] border-2 border-orange-500 rounded-[2rem] shadow-2xl flex flex-col items-center gap-1.5 min-w-[200px] border-glow hover:scale-105 transition-transform duration-300">
              <div className="w-10 h-10 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30 -mt-10">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-[9px] font-black text-orange-500/80 uppercase tracking-[0.25em] leading-none mb-1">
                Central Concept
              </span>
              <h2 className="text-base sm:text-lg font-black text-white leading-tight tracking-tight text-center max-w-[240px]">
                {data.center}
              </h2>
            </div>
          </div>
        </div>

        {/* Primary Branch Nodes */}
        {branches.map((branch, i) => {
          const isCollapsed = collapsedBranches[i]
          const Icon = branch.Icon
          
          return (
            <div 
              key={i} 
              className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20"
              style={{ left: branch.x, top: branch.y }}
            >
              <div 
                onClick={() => toggleBranch(i)}
                className="clickable-node cursor-pointer group active:scale-95 transition-transform duration-150"
              >
                <div 
                  className={cn(
                    "relative px-5 py-4 bg-[#141414] border rounded-2xl flex items-center gap-3.5 min-w-[200px] max-w-[240px] shadow-xl hover:-translate-y-0.5 transition-all duration-300",
                    isCollapsed ? "opacity-60 border-white/5" : "border-white/10"
                  )}
                  style={{ 
                    borderColor: !isCollapsed ? `${branch.color}35` : undefined,
                    boxShadow: !isCollapsed ? `0 10px 30px -10px ${branch.color}15` : undefined
                  }}
                >
                  {/* Left accent strip */}
                  <div 
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl transition-colors duration-300"
                    style={{ backgroundColor: branch.color }}
                  />

                  {/* Icon */}
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:rotate-6"
                    style={{ 
                      backgroundColor: `${branch.color}10`,
                      color: branch.color
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1 pr-1.5">
                    <span className="text-[7.5px] font-bold uppercase tracking-widest block opacity-40 leading-none mb-1">
                      Focus Branch
                    </span>
                    <h3 className="font-black text-xs text-white leading-tight truncate">
                      {branch.topic}
                    </h3>
                  </div>

                  {/* Branch item count indicator */}
                  {branch.subtopics.length > 0 && (
                    <div 
                      className={cn(
                        "w-5 h-5 rounded-full border text-[9px] font-black flex items-center justify-center shrink-0 transition-colors duration-300",
                        isCollapsed 
                          ? "bg-white/5 border-white/10 text-slate-500" 
                          : "border-white/5 text-slate-400"
                      )}
                      style={{ 
                        color: !isCollapsed ? branch.color : undefined,
                        borderColor: !isCollapsed ? `${branch.color}20` : undefined
                      }}
                    >
                      {branch.subtopics.length}
                    </div>
                  )}
                </div>
              </div>

              {/* Subtopic Leaf Nodes */}
              {!isCollapsed && branch.subtopics.map((sub, j) => (
                <div 
                  key={j} 
                  className="absolute transform -translate-y-1/2 z-10 animate-in fade-in zoom-in-95 duration-300"
                  style={{ 
                    left: sub.x - branch.x, 
                    top: sub.y - branch.y 
                  }}
                >
                  <div 
                    className="px-4 py-3 bg-[#111111]/80 backdrop-blur-md border border-white/5 rounded-xl text-[11px] font-bold text-slate-300 hover:text-white hover:border-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 min-w-[150px] max-w-[180px] truncate"
                    style={{ 
                      boxShadow: '0 4px 20px -5px rgba(0,0,0,0.5)',
                      borderLeft: `2.5px solid ${branch.color}`
                    }}
                  >
                    {sub.text}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
