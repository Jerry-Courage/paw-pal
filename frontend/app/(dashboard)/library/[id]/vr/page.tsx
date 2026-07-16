'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import { Loader2, ChevronLeft, Sparkles, AlertCircle } from 'lucide-react'
import Link from 'next/link'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'a-scene': any;
      'a-sky': any;
      'a-light': any;
      'a-entity': any;
      'a-octahedron': any;
      'a-sphere': any;
      'a-box': any;
      'a-cylinder': any;
      'a-ring': any;
      'a-plane': any;
      'a-text': any;
      'a-cursor': any;
    }
  }
}

// Pre-calculated semicircle layout coordinates centered around the user camera
// Spreads out 7 positions evenly to prevent any overlapping or crowding.
const SEMICIRCLE_POSITIONS = [
  '-2.0 1.5 -2.2', // Far Left
  '-1.3 1.5 -2.7', // Mid Left
  '-0.6 1.5 -3.1', // Inner Left
  '0.0 1.5 -3.3',  // Center
  '0.6 1.5 -3.1',  // Inner Right
  '1.3 1.5 -2.7',  // Mid Right
  '2.0 1.5 -2.2',  // Far Right
]

// Twinkling stars database coordinates
const STARS = [
  { x: -5, y: 4, z: -5 }, { x: 5, y: 3, z: -6 }, { x: -3, y: 6, z: -8 },
  { x: 2, y: 5, z: -7 }, { x: -6, y: 3, z: 2 }, { x: 6, y: 4, z: 3 },
  { x: -2, y: 5, z: 6 }, { x: 3, y: 6, z: 5 }, { x: 0, y: 7, z: -4 },
  { x: -4, y: 4, z: 4 }, { x: 4, y: 5, z: -2 }, { x: -1, y: 6, z: -3 },
  { x: 5, y: 6, z: 4 }, { x: -5, y: 5, z: -3 }, { x: 1, y: 4, z: -5 }
]

export default function VRPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  const [aframeLoaded, setAframeLoaded] = useState(false)
  const [scriptError, setScriptError] = useState(false)

  // ── Fetch Study Resource ──
  const { data: resource, isLoading: isResourceLoading } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
    enabled: !!resourceId
  })

  // ── Fetch AI-generated VR layout ──
  const { data: vrLayout, isLoading: isLayoutLoading } = useQuery({
    queryKey: ['vr-layout', resourceId],
    queryFn: () => libraryApi.getVRLayout(resourceId).then(r => r.data),
    enabled: !!resourceId
  })

  // ── Dynamically load A-Frame script ──
  useEffect(() => {
    const scriptId = 'aframe-cdn-script'
    let script = document.getElementById(scriptId) as HTMLScriptElement

    if (script) {
      setAframeLoaded(true)
      return
    }

    script = document.createElement('script')
    script.id = scriptId
    script.src = 'https://aframe.io/releases/1.4.2/aframe.min.js'
    script.async = true
    script.onload = () => {
      setAframeLoaded(true)
    }
    script.onerror = () => {
      setScriptError(true)
    }
    document.head.appendChild(script)

    return () => {
      try {
        const styleNodes = document.querySelectorAll('style[data-aframe-canvas-container]')
        styleNodes.forEach(node => node.remove())
        const aframeCanvas = document.querySelector('.a-canvas')
        if (aframeCanvas) aframeCanvas.remove()
      } catch (e) {}
    }
  }, [])

  // ── Register A-Frame Hover Component ──
  useEffect(() => {
    if (!aframeLoaded || !(window as any).AFRAME) return
    const AFRAME = (window as any).AFRAME

    if (!AFRAME.components['interactive-panel']) {
      AFRAME.registerComponent('interactive-panel', {
        schema: {
          title: { type: 'string', default: '' },
          content: { type: 'string', default: '' }
        },
        init: function() {
          const el = this.el
          const data = this.data

          el.addEventListener('mouseenter', () => {
            el.setAttribute('animation', {
              property: 'scale',
              to: '1.15 1.15 1.15',
              dur: 150,
              easing: 'easeOutQuad'
            })

            const detailBoard = document.querySelector('#detail-board')
            const detailTitle = document.querySelector('#detail-title')
            const detailText = document.querySelector('#detail-text')

            if (detailBoard) detailBoard.setAttribute('visible', 'true')
            if (detailTitle) detailTitle.setAttribute('value', data.title)
            if (detailText) {
              const formattedContent = data.content.length > 150 
                ? data.content.slice(0, 147) + '...' 
                : data.content
              detailText.setAttribute('value', formattedContent)
            }
          })

          el.addEventListener('mouseleave', () => {
            el.setAttribute('animation', {
              property: 'scale',
              to: '1 1 1 1',
              dur: 150,
              easing: 'easeOutQuad'
            })
          })
        }
      })
    }

    if (!AFRAME.components['exit-trigger']) {
      AFRAME.registerComponent('exit-trigger', {
        init: function() {
          const el = this.el
          el.addEventListener('mouseenter', () => {
            window.history.back()
          })
        }
      })
    }
  }, [aframeLoaded])

  if (isResourceLoading || isLayoutLoading || (!aframeLoaded && !scriptError)) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
        <div className="text-center">
          <p className="text-sm font-black text-white uppercase tracking-widest">Constructing VR Space...</p>
          <p className="text-[10px] text-slate-500 mt-1">AI is analyzing notes and designing the 3D topology</p>
        </div>
      </div>
    )
  }

  if (scriptError || !resource || !vrLayout || !vrLayout.nodes) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center p-6 space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500" />
        <div className="text-center">
          <h2 className="text-lg font-black text-white uppercase">VR Generation Failed</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-normal">
            We couldn't compile the 3D visual scene layout for this topic. Please try again.
          </p>
        </div>
        <Link 
          href={`/library/${resourceId}`}
          className="px-5 py-2.5 rounded-xl bg-white text-black font-black text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all"
        >
          Return to Notes
        </Link>
      </div>
    )
  }

  // Map AI layout nodes to semicircle layout to prevent overlapping
  const nodes = (vrLayout.nodes || []).map((node: any, idx: number) => ({
    ...node,
    assignedPosition: SEMICIRCLE_POSITIONS[idx % SEMICIRCLE_POSITIONS.length],
    index: idx
  }))

  const edges = vrLayout.edges || []

  // Helpers to get connection vector coordinates
  const getNodeById = (id: string) => nodes.find((n: any) => n.id === id)

  return (
    <div className="w-full h-screen relative bg-black select-none">
      
      {/* HUD Controls */}
      <div className="absolute top-6 left-6 z-[100] pointer-events-auto">
        <Link
          href={`/library/${resourceId}`}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/[0.06] text-white hover:text-rose-400 hover:border-rose-500/20 text-xs font-bold uppercase tracking-widest transition-all duration-200"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Notes
        </Link>
      </div>

      <div className="absolute top-6 right-6 z-[100] hidden sm:flex flex-col items-end pointer-events-none">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/50 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/[0.04] flex items-center gap-1.5 animate-pulse">
          <Sparkles className="w-3.5 h-3.5 text-rose-400" /> Topic: {resource.subject || 'General'}
        </span>
      </div>

      {/* A-Frame scene */}
      {/* @ts-ignore */}
      <a-scene embedded vr-mode-ui="enabled: true">
        
        {/* Solid deep space background — completely CORS safe */}
        {/* @ts-ignore */}
        <a-sky color="#030006"></a-sky>

        {/* Twinkling Space Stars details */}
        {STARS.map((s, i) => (
          // @ts-ignore
          <a-sphere
            key={i}
            position={`${s.x} ${s.y} ${s.z}`}
            radius="0.03"
            color="#ffffff"
            material="shader: flat"
            animation="property: scale; to: 0.1 0.1 0.1; dir: alternate; loop: true; dur: 1200; easing: easeInOutQuad"
          ></a-sphere>
        ))}

        {/* Floor grid / concentric glowing rings deck */}
        {/* @ts-ignore */}
        <a-ring radius-inner="0" radius-outer="5" color="#010003" rotation="-90 0 0" position="0 -0.5 0"></a-ring>
        {/* @ts-ignore */}
        <a-ring radius-inner="1" radius-outer="1.01" color="#f43f5e" opacity="0.15" rotation="-90 0 0" position="0 -0.49 0" material="shader: flat"></a-ring>
        {/* @ts-ignore */}
        <a-ring radius-inner="2" radius-outer="2.01" color="#f43f5e" opacity="0.1" rotation="-90 0 0" position="0 -0.49 0" material="shader: flat"></a-ring>
        {/* @ts-ignore */}
        <a-ring radius-inner="3" radius-outer="3.01" color="#f43f5e" opacity="0.05" rotation="-90 0 0" position="0 -0.49 0" material="shader: flat"></a-ring>

        {/* Ambient Lights */}
        {/* @ts-ignore */}
        <a-light type="ambient" intensity="0.5" color="#ffffff"></a-light>
        {/* @ts-ignore */}
        <a-light type="directional" intensity="0.8" position="2 4 3" color="#ffffff"></a-light>

        {/* ── Render AI layout nodes ── */}
        {nodes.map((node: any) => {
          return (
            // @ts-ignore
            <a-entity 
              key={node.id} 
              position={node.assignedPosition}
              interactive-panel={`title: ${node.label}; content: ${node.description || ''}`}
            >
              {/* Glowing Hologram pedestal/ring */}
              {/* @ts-ignore */}
              <a-ring
                radius-inner="0.28"
                radius-outer="0.3"
                rotation="90 0 0"
                position="0 -0.45 0"
                color={node.color || '#f43f5e'}
                opacity="0.8"
                material="shader: flat"
                animation="property: scale; to: 1.1 1.1 1.1; dir: alternate; loop: true; dur: 1500; easing: easeInOutQuad"
              ></a-ring>

              {/* Procedural Holographic Geometry — CORS safe & instantly loads */}
              {node.type === 'server' ? (
                // Server stack primitive representation
                // @ts-ignore
                <a-entity position="0 0.1 0" animation="property: rotation; to: 0 360 0; loop: true; dur: 8000; easing: linear">
                  {/* @ts-ignore */}
                  <a-box width="0.3" height="0.08" depth="0.3" color={node.color || '#f43f5e'} material="roughness: 0.2; metalness: 0.8" position="0 0.12 0"></a-box>
                  {/* @ts-ignore */}
                  <a-box width="0.3" height="0.08" depth="0.3" color={node.color || '#f43f5e'} material="roughness: 0.2; metalness: 0.8" position="0 0 0"></a-box>
                  {/* @ts-ignore */}
                  <a-box width="0.3" height="0.08" depth="0.3" color={node.color || '#f43f5e'} material="roughness: 0.2; metalness: 0.8" position="0 -0.12 0"></a-box>
                </a-entity>
              ) : node.type === 'database' ? (
                // Cylinder database primitive representation
                // @ts-ignore
                <a-entity position="0 0.1 0" animation="property: rotation; to: 0 360 0; loop: true; dur: 8000; easing: linear">
                  {/* @ts-ignore */}
                  <a-cylinder radius="0.16" height="0.3" color={node.color || '#3b82f6'} material="roughness: 0.2; metalness: 0.8"></a-cylinder>
                  {/* @ts-ignore */}
                  <a-ring radius-inner="0.18" radius-outer="0.2" rotation="90 0 0" position="0 0.08 0" color="#ffffff" opacity="0.8" material="shader: flat"></a-ring>
                  {/* @ts-ignore */}
                  <a-ring radius-inner="0.18" radius-outer="0.2" rotation="90 0 0" position="0 -0.08 0" color="#ffffff" opacity="0.8" material="shader: flat"></a-ring>
                </a-entity>
              ) : node.type === 'client_device' ? (
                // Screen device primitive representation
                // @ts-ignore
                <a-entity position="0 0.1 0" animation="property: rotation; to: 0 360 0; loop: true; dur: 12000; easing: linear">
                  {/* @ts-ignore */}
                  <a-box width="0.35" height="0.22" depth="0.03" color={node.color || '#10b981'} material="roughness: 0.1; metalness: 0.9"></a-box>
                  {/* @ts-ignore */}
                  <a-cylinder radius="0.02" height="0.1" position="0 -0.12 0" color="#a1a1aa"></a-cylinder>
                  {/* @ts-ignore */}
                  <a-box width="0.18" height="0.02" depth="0.12" position="0 -0.17 0" color="#a1a1aa"></a-box>
                </a-entity>
              ) : node.type === 'organelle' || node.type === 'nucleus' ? (
                // Biology Organelle / Nucleus orbitals representation
                // @ts-ignore
                <a-entity position="0 0.1 0" animation="property: rotation; to: 360 360 0; loop: true; dur: 10000; easing: linear">
                  {/* @ts-ignore */}
                  <a-sphere radius="0.12" color={node.color || '#a855f7'} material="roughness: 0.3; metalness: 0.7"></a-sphere>
                  {/* @ts-ignore */}
                  <a-ring radius-inner="0.2" radius-outer="0.22" rotation="45 45 0" color={node.color || '#a855f7'} opacity="0.8" material="shader: flat"></a-ring>
                  {/* @ts-ignore */}
                  <a-ring radius-inner="0.2" radius-outer="0.22" rotation="-45 45 0" color={node.color || '#a855f7'} opacity="0.8" material="shader: flat"></a-ring>
                </a-entity>
              ) : node.type === 'heart' ? (
                // Heart beat pulsating primitive representation
                // @ts-ignore
                <a-entity position="0 0.1 0" animation="property: scale; to: 1.25 1.25 1.25; dir: alternate; loop: true; dur: 850; easing: easeInOutQuad">
                  {/* @ts-ignore */}
                  <a-octahedron radius="0.18" color={node.color || '#ef4444'} material="roughness: 0.2; metalness: 0.8"></a-octahedron>
                </a-entity>
              ) : (
                // Standard default generic floating sphere
                // @ts-ignore
                <a-entity position="0 0.1 0" animation="property: rotation; to: 360 0 360; loop: true; dur: 10000; easing: linear">
                  {/* @ts-ignore */}
                  <a-sphere
                    radius="0.15"
                    color={node.color || '#e2e8f0'}
                    material="roughness: 0.2; metalness: 0.8"
                  ></a-sphere>
                </a-entity>
              )}

              {/* Floating label above the model */}
              {/* @ts-ignore */}
              <a-text
                value={node.label}
                position="0 0.5 0"
                align="center"
                width="1.8"
                color="#ffffff"
                font="klykov"
              ></a-text>
            </a-entity>
          )
        })}

        {/* ── Render layout connection edges ── */}
        {edges.map((edge: any, idx: number) => {
          const fromNode = getNodeById(edge.from)
          const toNode = getNodeById(edge.to)

          if (!fromNode || !toNode) return null

          // Parse position coordinates "x y z" from semicircle assignment
          const [x1, y1, z1] = fromNode.assignedPosition.split(' ').map(Number)
          const [x2, y2, z2] = toNode.assignedPosition.split(' ').map(Number)

          // Calculate connection label position (midpoint of the vector, slightly raised)
          const midX = (x1 + x2) / 2
          const midY = (y1 + y2) / 2 + 0.12
          const midZ = (z1 + z2) / 2

          return (
            // @ts-ignore
            <a-entity key={idx}>
              {/* glowing connection line */}
              {/* @ts-ignore */}
              <a-entity
                line={`start: ${x1} ${y1} ${z1}; end: ${x2} ${y2} ${z2}; color: ${edge.color || '#a1a1aa'}; opacity: 0.35`}
              ></a-entity>
              
              {/* edge label card */}
              {/* @ts-ignore */}
              <a-text
                value={edge.label || ''}
                position={`${midX} ${midY} ${midZ}`}
                align="center"
                width="1.3"
                color="#94a3b8"
                font="klykov"
              ></a-text>
            </a-entity>
          )
        })}

        {/* ── Central Details Board ── */}
        {/* @ts-ignore */}
        <a-plane
          id="detail-board"
          position="0 0.5 -2.4"
          rotation="-20 0 0"
          width="2.5"
          height="0.9"
          color="#0a0a0d"
          material="shader: flat; transparent: true; opacity: 0.9"
        >
          {/* @ts-ignore */}
          <a-text
            id="detail-title"
            value={resource.title}
            align="center"
            width="2.2"
            color="#f43f5e"
            position="0 0.22 0.02"
            font="klykov"
          ></a-text>
          {/* @ts-ignore */}
          <a-text
            id="detail-text"
            value="Gaze at any floating hologram node to explore concepts"
            align="center"
            width="2.0"
            color="#94a3b8"
            position="0 -0.12 0.02"
            font="klykov"
          ></a-text>
        </a-plane>

        {/* ── Exit Sign (Gaze back for VR headsets) ── */}
        {/* @ts-ignore */}
        <a-plane
          position="0 2.2 2.0"
          rotation="0 180 0"
          width="0.8"
          height="0.3"
          color="#b91c1c"
          opacity="0.85"
          exit-trigger=""
        >
          {/* @ts-ignore */}
          <a-text
            value="GAZE TO EXIT"
            align="center"
            width="1.8"
            color="#ffffff"
            position="0 0 0.02"
            font="klykov"
          ></a-text>
        </a-plane>

        {/* ── Camera with Gaze Cursor ── */}
        {/* @ts-ignore */}
        <a-entity camera look-controls position="0 1.6 0">
          {/* @ts-ignore */}
          <a-cursor
            fuse="true"
            fuse-timeout="1500"
            color="#f43f5e"
            scale="0.6 0.6 0.6"
            animation__fusing="property: scale; startEvents: fusing; easing: easeInQuad; dur: 1500; from: 0.6 0.6 0.6; to: 0.1 0.1 0.1"
            animation__mouseleave="property: scale; startEvents: mouseleave; easing: easeOutQuad; dur: 500; to: 0.6 0.6 0.6"
          ></a-cursor>
        </a-entity>

      {/* @ts-ignore */}
      </a-scene>
    </div>
  )
}
