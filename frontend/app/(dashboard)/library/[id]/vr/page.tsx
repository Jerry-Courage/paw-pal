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
      'a-sphere': any;
      'a-box': any;
      'a-cylinder': any;
      'a-torus': any;
      'a-ring': any;
      'a-plane': any;
      'a-text': any;
      'a-cursor': any;
    }
  }
}

// Rich biology color palette — maps to vibrant node colours
const NODE_COLORS = [
  '#f43f5e', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ec4899', '#3b82f6', '#a3e635',
]

// Semicircle positions — close to camera, spread at eye level
// These are hand-tuned for a dramatic, immersive feel
const SEMICIRCLE_POSITIONS = [
  { x: -2.4, y: 1.6, z: -2.0 },
  { x: -1.5, y: 1.6, z: -2.6 },
  { x: -0.6, y: 1.6, z: -2.9 },
  { x:  0.0, y: 1.6, z: -3.0 },
  { x:  0.6, y: 1.6, z: -2.9 },
  { x:  1.5, y: 1.6, z: -2.6 },
  { x:  2.4, y: 1.6, z: -2.0 },
]

export default function VRPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  const [aframeLoaded, setAframeLoaded] = useState(false)
  const [scriptError, setScriptError] = useState(false)

  const { data: resource, isLoading: isResourceLoading } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
    enabled: !!resourceId,
  })

  const [shouldRefresh, setShouldRefresh] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { data: vrLayout, isLoading: isLayoutLoading, refetch: refetchLayout } = useQuery({
    queryKey: ['vr-layout', resourceId, shouldRefresh],
    queryFn: () => libraryApi.getVRLayout(resourceId, shouldRefresh).then(r => r.data),
    enabled: !!resourceId,
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setShouldRefresh(true)
    setTimeout(async () => {
      await refetchLayout()
      setShouldRefresh(false)
      setIsRefreshing(false)
    }, 100)
  }


  useEffect(() => {
    const scriptId = 'aframe-cdn-script'
    if (document.getElementById(scriptId)) { setAframeLoaded(true); return }
    const script = document.createElement('script')
    script.id = scriptId
    script.src = 'https://aframe.io/releases/1.4.2/aframe.min.js'
    script.async = true
    script.onload = () => setAframeLoaded(true)
    script.onerror = () => setScriptError(true)
    document.head.appendChild(script)
  }, [])

  // Register hover component once A-Frame is ready
  useEffect(() => {
    if (!aframeLoaded || !(window as any).AFRAME) return
    const AFRAME = (window as any).AFRAME

    if (!AFRAME.components['node-hover']) {
      AFRAME.registerComponent('node-hover', {
        schema: { label: { type: 'string', default: '' }, desc: { type: 'string', default: '' } },
        init: function () {
          const el = this.el
          const { label, desc } = this.data
          el.addEventListener('mouseenter', () => {
            el.setAttribute('animation__scale', 'property: scale; to: 1.2 1.2 1.2; dur: 200; easing: easeOutQuad')
            const t = document.querySelector('#info-title')
            const d = document.querySelector('#info-desc')
            if (t) t.setAttribute('value', label)
            if (d) d.setAttribute('value', desc.slice(0, 160))
          })
          el.addEventListener('mouseleave', () => {
            el.setAttribute('animation__scale', 'property: scale; to: 1 1 1; dur: 200; easing: easeOutQuad')
          })
        },
      })
    }
  }, [aframeLoaded])

  if (isResourceLoading || isLayoutLoading || (!aframeLoaded && !scriptError)) {
    return (
      <div className="w-full h-screen bg-[#050507] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
        <div className="text-center">
          <p className="text-sm font-black text-white uppercase tracking-widest">Building VR Space...</p>
          <p className="text-[10px] text-slate-500 mt-1">AI is designing your 3D knowledge map</p>
        </div>
      </div>
    )
  }

  if (scriptError || !resource || !vrLayout?.nodes) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center p-6 space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500" />
        <div className="text-center">
          <h2 className="text-lg font-black text-white uppercase">VR Scene Failed</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">Could not build the 3D layout. Please try again.</p>
        </div>
        <Link href={`/library/${resourceId}`}
          className="px-5 py-2.5 rounded-xl bg-white text-black font-black text-xs uppercase tracking-widest">
          Return to Notes
        </Link>
      </div>
    )
  }

  const nodes = (vrLayout.nodes as any[]).map((node, idx) => ({
    ...node,
    pos: SEMICIRCLE_POSITIONS[idx % SEMICIRCLE_POSITIONS.length],
    color: node.color || NODE_COLORS[idx % NODE_COLORS.length],
  }))

  const edges = (vrLayout.edges as any[]) || []

  return (
    <div className="w-full h-screen relative bg-black select-none">

      {/* ── HUD ─────────────────────────────────────────────────────────── */}
      <div className="absolute top-5 left-5 z-50 pointer-events-auto flex items-center gap-3">
        <Link href={`/library/${resourceId}`}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 text-white hover:text-rose-400 text-xs font-bold uppercase tracking-widest transition-all">
          <ChevronLeft className="w-4 h-4" /> Back to Notes
        </Link>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 text-white hover:text-rose-400 disabled:opacity-50 text-xs font-bold uppercase tracking-widest transition-all"
        >
          {isRefreshing ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating...</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5 text-rose-400 animate-pulse" /> Regenerate Layout</>
          )}
        </button>
      </div>
      <div className="absolute top-5 right-5 z-50 hidden sm:flex items-center gap-2 pointer-events-none">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/50 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/[0.06] flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-rose-400" />
          {resource.subject || resource.title}
        </span>
      </div>

      {/* ── A-Frame Scene ───────────────────────────────────────────────── */}
      {/* @ts-ignore */}
      <a-scene embedded vr-mode-ui="enabled: true" renderer="antialias: true; colorManagement: true; physicallyCorrectLights: true">

        {/* Deep space dark sky */}
        {/* @ts-ignore */}
        <a-sky color="#04030a"></a-sky>

        {/* Lights — bright enough to see everything */}
        {/* @ts-ignore */}
        <a-light type="ambient" color="#ffffff" intensity="1.2"></a-light>
        {/* @ts-ignore */}
        <a-light type="directional" color="#ffffff" intensity="1.5" position="3 5 2"></a-light>
        {/* @ts-ignore */}
        <a-light type="point" color="#f43f5e" intensity="1.0" position="0 3 -2"></a-light>

        {/* ── Starfield ── */}
        {Array.from({ length: 40 }).map((_, i) => {
          const px = (Math.random() - 0.5) * 16
          const py = Math.random() * 6 + 1
          const pz = -(Math.random() * 10 + 3)
          return (
            // @ts-ignore
            <a-sphere
              key={`star-${i}`}
              position={`${px} ${py} ${pz}`}
              radius="0.025"
              material={`shader: flat; color: #ffffff; opacity: ${0.3 + Math.random() * 0.5}`}
              animation={`property: scale; to: ${0.3 + Math.random() * 0.5} ${0.3 + Math.random() * 0.5} ${0.3 + Math.random() * 0.5}; dir: alternate; loop: true; dur: ${800 + Math.floor(Math.random() * 1400)}; easing: easeInOutSine`}
            ></a-sphere>
          )
        })}

        {/* ── Ground deck ── */}
        {/* @ts-ignore */}
        <a-ring radius-inner="0.01" radius-outer="4" color="#0a0010" material="shader: flat; opacity: 0.9" rotation="-90 0 0" position="0 0.01 -1.5"></a-ring>
        {[0.8, 1.6, 2.4, 3.2].map((r, i) => (
          // @ts-ignore
          <a-ring
            key={`ring-${i}`}
            radius-inner={r - 0.015}
            radius-outer={r}
            material={`shader: flat; color: #f43f5e; opacity: ${0.15 - i * 0.03}`}
            rotation="-90 0 0"
            position="0 0.02 -1.5"
          ></a-ring>
        ))}

        {/* ── Node entities ── */}
        {nodes.map((node: any, idx: number) => {
          const { pos, color } = node
          const label = (node.label || 'Node').slice(0, 28)
          const desc = (node.description || '').slice(0, 160)

          // Pick geometry based on type
          const type = (node.type || 'default').toLowerCase()

          return (
            // @ts-ignore
            <a-entity
              key={node.id || idx}
              position={`${pos.x} ${pos.y} ${pos.z}`}
              node-hover={`label: ${label}; desc: ${desc}`}
            >
              {/* Glowing pedestal ring flat-shaded so always visible */}
              {/* @ts-ignore */}
              <a-ring
                radius-inner="0.30"
                radius-outer="0.34"
                rotation="90 0 0"
                position="0 -0.60 0"
                material={`shader: flat; color: ${color}; opacity: 0.85`}
                animation="property: scale; to: 1.12 1.12 1.12; dir: alternate; loop: true; dur: 1400; easing: easeInOutSine"
              ></a-ring>
              {/* Thin stem from pedestal to object */}
              {/* @ts-ignore */}
              <a-cylinder
                radius="0.018"
                height="0.55"
                position="0 -0.32 0"
                material={`shader: flat; color: ${color}; opacity: 0.35`}
              ></a-cylinder>

              {/* ── Shape by type ── */}
              {(type.includes('organ') || type.includes('cell') || type.includes('nucl')) ? (
                // Biology cell: sphere with orbital ring
                // @ts-ignore
                <a-entity animation="property: rotation; to: 0 360 0; loop: true; dur: 9000; easing: linear">
                  {/* @ts-ignore */}
                  <a-sphere
                    radius="0.28"
                    material={`color: ${color}; roughness: 0.3; metalness: 0.1; emissive: ${color}; emissiveIntensity: 0.4`}
                  ></a-sphere>
                  {/* @ts-ignore */}
                  <a-torus radius="0.38" radius-tubular="0.012"
                    rotation="80 0 0"
                    material={`shader: flat; color: ${color}; opacity: 0.7`}
                  ></a-torus>
                </a-entity>
              ) : (type.includes('enzyme') || type.includes('acid') || type.includes('chem')) ? (
                // Chemical/Enzyme: two interlocked rings
                // @ts-ignore
                <a-entity animation="property: rotation; to: 360 180 0; loop: true; dur: 7000; easing: linear">
                  {/* @ts-ignore */}
                  <a-torus radius="0.22" radius-tubular="0.04"
                    rotation="0 0 0"
                    material={`color: ${color}; emissive: ${color}; emissiveIntensity: 0.5; roughness: 0.2; metalness: 0.6`}
                  ></a-torus>
                  {/* @ts-ignore */}
                  <a-torus radius="0.22" radius-tubular="0.04"
                    rotation="90 0 0"
                    material={`color: ${color}; emissive: ${color}; emissiveIntensity: 0.5; roughness: 0.2; metalness: 0.6`}
                  ></a-torus>
                </a-entity>
              ) : (type.includes('vessel') || type.includes('tube') || type.includes('duct') || type.includes('intestin')) ? (
                // Tube/Vessel: cylinder
                // @ts-ignore
                <a-entity animation="property: rotation; to: 0 360 0; loop: true; dur: 10000; easing: linear">
                  {/* @ts-ignore */}
                  <a-cylinder
                    radius="0.18"
                    height="0.5"
                    material={`color: ${color}; emissive: ${color}; emissiveIntensity: 0.3; roughness: 0.4; metalness: 0.2`}
                  ></a-cylinder>
                  {/* @ts-ignore */}
                  <a-ring radius-inner="0.20" radius-outer="0.22" rotation="90 0 0" position="0 0.18 0"
                    material={`shader: flat; color: #ffffff; opacity: 0.5`}></a-ring>
                  {/* @ts-ignore */}
                  <a-ring radius-inner="0.20" radius-outer="0.22" rotation="90 0 0" position="0 -0.18 0"
                    material={`shader: flat; color: #ffffff; opacity: 0.5`}></a-ring>
                </a-entity>
              ) : (type.includes('muscle') || type.includes('stomach') || type.includes('organ')) ? (
                // Organ: rounded box
                // @ts-ignore
                <a-entity animation="property: scale; to: 1.1 1.1 1.1; dir: alternate; loop: true; dur: 1200; easing: easeInOutSine">
                  {/* @ts-ignore */}
                  <a-box width="0.45" height="0.38" depth="0.32"
                    material={`color: ${color}; emissive: ${color}; emissiveIntensity: 0.35; roughness: 0.5; metalness: 0.1`}
                  ></a-box>
                </a-entity>
              ) : (
                // Default: glowing sphere
                // @ts-ignore
                <a-entity animation="property: rotation; to: 0 360 0; loop: true; dur: 11000; easing: linear">
                  {/* @ts-ignore */}
                  <a-sphere
                    radius="0.25"
                    material={`color: ${color}; emissive: ${color}; emissiveIntensity: 0.45; roughness: 0.2; metalness: 0.5`}
                  ></a-sphere>
                  {/* Equatorial glow ring */}
                  {/* @ts-ignore */}
                  <a-torus radius="0.30" radius-tubular="0.010"
                    material={`shader: flat; color: ${color}; opacity: 0.6`}
                    rotation="90 0 0"
                  ></a-torus>
                </a-entity>
              )}

              {/* Node label — big, bright, always readable */}
              {/* @ts-ignore */}
              <a-text
                value={label}
                position="0 0.70 0"
                align="center"
                width="2.2"
                color="#ffffff"
                wrap-count="18"
              ></a-text>
            </a-entity>
          )
        })}

        {/* ── Connection lines ── */}
        {edges.map((edge: any, idx: number) => {
          const from = nodes.find((n: any) => n.id === edge.from)
          const to   = nodes.find((n: any) => n.id === edge.to)
          if (!from || !to) return null
          const { x: x1, y: y1, z: z1 } = from.pos
          const { x: x2, y: y2, z: z2 } = to.pos
          return (
            // @ts-ignore
            <a-entity key={`edge-${idx}`}
              line={`start: ${x1} ${y1} ${z1}; end: ${x2} ${y2} ${z2}; color: #ffffff; opacity: 0.18`}
            ></a-entity>
          )
        })}

        {/* ── Info panel — appears at bottom of view ── */}
        {/* @ts-ignore */}
        <a-plane
          position="0 0.6 -2.2"
          rotation="-15 0 0"
          width="3.2"
          height="0.95"
          material="shader: flat; color: #060410; opacity: 0.92"
        >
          {/* @ts-ignore */}
          <a-text id="info-title"
            value={resource.title}
            align="center"
            width="3.0"
            color="#f43f5e"
            position="0 0.24 0.01"
          ></a-text>
          {/* @ts-ignore */}
          <a-text id="info-desc"
            value="Gaze at any concept node to see details"
            align="center"
            width="2.8"
            color="#94a3b8"
            wrap-count="52"
            position="0 -0.12 0.01"
          ></a-text>
        </a-plane>

        {/* ── Camera + gaze cursor ── */}
        {/* @ts-ignore */}
        <a-entity camera look-controls wasd-controls position="0 1.6 0.5">
          {/* @ts-ignore */}
          <a-cursor
            fuse="true"
            fuse-timeout="1200"
            color="#f43f5e"
            scale="0.7 0.7 0.7"
            animation__fusing="property: scale; startEvents: fusing; easing: easeInQuad; dur: 1200; from: 0.7 0.7 0.7; to: 0.15 0.15 0.15"
            animation__leave="property: scale; startEvents: mouseleave; easing: easeOutQuad; dur: 400; to: 0.7 0.7 0.7"
          ></a-cursor>
        </a-entity>

      {/* @ts-ignore */}
      </a-scene>
    </div>
  )
}
