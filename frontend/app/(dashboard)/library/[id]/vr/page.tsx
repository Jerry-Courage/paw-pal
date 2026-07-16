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

// Rich biology color palette
const NODE_COLORS = [
  '#f43f5e', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ec4899', '#3b82f6', '#a3e635',
]

// ── Realistic Composite 3D Organ Models ──
function renderOrganModel(label: string, color: string) {
  const clean = label.toLowerCase();
  
  // 1. Teeth: Jaw arch and individual teeth
  if (clean.includes('teeth') || clean.includes('tooth')) {
    return (
      // @ts-ignore
      <a-entity position="0 0.1 0" rotation="20 0 0">
        {/* Jaw arch base */}
        {/* @ts-ignore */}
        <a-torus radius="0.18" radius-tubular="0.02" arc="180" rotation="90 0 0" position="0 -0.04 0" color="#e2e8f0"></a-torus>
        {/* Teeth cylinders */}
        {/* @ts-ignore */}
        <a-cylinder radius="0.02" height="0.06" position="-0.13 -0.02 0.04" color="#ffffff"></a-cylinder>
        {/* @ts-ignore */}
        <a-cylinder radius="0.02" height="0.06" position="-0.08 -0.02 0.10" color="#ffffff"></a-cylinder>
        {/* @ts-ignore */}
        <a-cylinder radius="0.022" height="0.07" position="0 -0.02 0.12" color="#ffffff"></a-cylinder>
        {/* @ts-ignore */}
        <a-cylinder radius="0.02" height="0.06" position="0.08 -0.02 0.10" color="#ffffff"></a-cylinder>
        {/* @ts-ignore */}
        <a-cylinder radius="0.02" height="0.06" position="0.13 -0.02 0.04" color="#ffffff"></a-cylinder>
      </a-entity>
    );
  }
  
  // 2. Tongue: Realistic pink tongue with groove
  if (clean.includes('tongue')) {
    return (
      // @ts-ignore
      <a-entity position="0 0.05 0" rotation="25 0 0">
        {/* Main flat tongue body */}
        {/* @ts-ignore */}
        <a-box width="0.28" height="0.06" depth="0.40" color="#fda4af" roughness="0.8" position="0 0 0"></a-box>
        {/* Median sulcus line */}
        {/* @ts-ignore */}
        <a-box width="0.015" height="0.068" depth="0.38" color="#f43f5e" position="0 0.002 0"></a-box>
        {/* Tongue base */}
        {/* @ts-ignore */}
        <a-sphere radius="0.13" scale="1 0.4 1" position="0 -0.02 -0.08" color="#f43f5e"></a-sphere>
      </a-entity>
    );
  }
  
  // 3. Stomach: Curved J-shape organ
  if (clean.includes('stomach')) {
    return (
      // @ts-ignore
      <a-entity position="0 0.08 0" rotation="0 0 20">
        {/* Main stomach body */}
        {/* @ts-ignore */}
        <a-sphere radius="0.22" scale="1.3 0.9 0.75" color="#f43f5e" position="0 0 0" roughness="0.6"></a-sphere>
        {/* Esophageal entrance */}
        {/* @ts-ignore */}
        <a-cylinder radius="0.06" height="0.16" position="-0.10 0.16 0" rotation="0 0 -25" color="#fda4af"></a-cylinder>
        {/* Duodenal exit */}
        {/* @ts-ignore */}
        <a-cylinder radius="0.05" height="0.20" position="0.15 -0.11 0" rotation="0 0 65" color="#e11d48"></a-cylinder>
      </a-entity>
    );
  }
  
  // 4. Liver: Dark-red wedge bi-lobed organ with green gallbladder peaking underneath
  if (clean.includes('liver')) {
    return (
      // @ts-ignore
      <a-entity position="0 0.08 0" rotation="0 15 -10">
        {/* Large Right Lobe */}
        {/* @ts-ignore */}
        <a-sphere radius="0.28" scale="1.2 0.65 0.75" position="0.06 0 0" color="#7f1d1d" roughness="0.7"></a-sphere>
        {/* Smaller Left Lobe */}
        {/* @ts-ignore */}
        <a-sphere radius="0.18" scale="1.1 0.55 0.65" position="-0.13 0.04 0.04" color="#991b1b" roughness="0.7"></a-sphere>
        {/* Gallbladder */}
        {/* @ts-ignore */}
        <a-sphere radius="0.05" scale="0.7 1.1 0.7" position="0.06 -0.15 0.08" color="#166534" roughness="0.5"></a-sphere>
      </a-entity>
    );
  }
  
  // 5. Pancreas: Elongated orange gland
  if (clean.includes('pancreas')) {
    return (
      // @ts-ignore
      <a-entity position="0 0.05 0" rotation="0 0 -15">
        {/* Head of pancreas */}
        {/* @ts-ignore */}
        <a-sphere radius="0.10" position="-0.11 0 0" color="#ea580c" roughness="0.9"></a-sphere>
        {/* Body and tail of pancreas */}
        {/* @ts-ignore */}
        <a-cylinder radius="0.06" height="0.32" position="0.03 0 0" rotation="0 0 90" color="#f97316" roughness="0.9"></a-cylinder>
        {/* Lobular textured surface details */}
        {/* @ts-ignore */}
        <a-sphere radius="0.03" position="-0.06 0.04 0.04" color="#ea580c"></a-sphere>
        {/* @ts-ignore */}
        <a-sphere radius="0.03" position="0.03 -0.03 0.04" color="#f97316"></a-sphere>
        {/* @ts-ignore */}
        <a-sphere radius="0.03" position="0.09 0.02 0.03" color="#f97316"></a-sphere>
      </a-entity>
    );
  }
  
  // 6. Salivary Glands: Grape-like cluster representation
  if (clean.includes('salivary') || clean.includes('gland')) {
    return (
      // @ts-ignore
      <a-entity position="0 0.05 0">
        {/* Central duct */}
        {/* @ts-ignore */}
        <a-cylinder radius="0.015" height="0.22" color="#f43f5e" rotation="45 0 0"></a-cylinder>
        {/* Clusters of glandular cells */}
        {/* @ts-ignore */}
        <a-sphere radius="0.06" position="-0.06 0.06 0" color="#fb7185" roughness="0.8"></a-sphere>
        {/* @ts-ignore */}
        <a-sphere radius="0.07" position="0.04 0.04 0.04" color="#fda4af" roughness="0.8"></a-sphere>
        {/* @ts-ignore */}
        <a-sphere radius="0.06" position="-0.02 -0.06 0.04" color="#fb7185" roughness="0.8"></a-sphere>
        {/* @ts-ignore */}
        <a-sphere radius="0.06" position="0.06 -0.03 -0.03" color="#f43f5e" roughness="0.8"></a-sphere>
      </a-entity>
    );
  }
  
  // 7. Esophagus / Throat: Muscular pink cylinder tube
  if (clean.includes('esophagus') || clean.includes('throat') || clean.includes('vessel') || clean.includes('duct') || clean.includes('pharynx')) {
    return (
      // @ts-ignore
      <a-entity position="0 0.08 0">
        {/* Tube body */}
        {/* @ts-ignore */}
        <a-cylinder radius="0.065" height="0.50" color="#fda4af" roughness="0.9"></a-cylinder>
        {/* External muscular rings */}
        {/* @ts-ignore */}
        <a-torus radius="0.07" radius-tubular="0.007" position="0 0.14 0" rotation="90 0 0" color="#f43f5e" opacity="0.8"></a-torus>
        {/* @ts-ignore */}
        <a-torus radius="0.07" radius-tubular="0.007" position="0 0 0" rotation="90 0 0" color="#f43f5e" opacity="0.8"></a-torus>
        {/* @ts-ignore */}
        <a-torus radius="0.07" radius-tubular="0.007" position="0 -0.14 0" rotation="90 0 0" color="#f43f5e" opacity="0.8"></a-torus>
      </a-entity>
    );
  }
  
  // 8. Intestines: Convoluted winding loops
  if (clean.includes('intestine') || clean.includes('colon') || clean.includes('rectum')) {
    return (
      // @ts-ignore
      <a-entity position="0 0.05 0">
        {/* Winding loops */}
        {/* @ts-ignore */}
        <a-torus radius="0.15" radius-tubular="0.038" position="-0.05 0.06 0" rotation="20 40 10" color="#f43f5e" roughness="0.7"></a-torus>
        {/* @ts-ignore */}
        <a-torus radius="0.15" radius-tubular="0.038" position="0.05 -0.06 0" rotation="-20 -40 -10" color="#f43f5e" roughness="0.7"></a-torus>
        {/* @ts-ignore */}
        <a-torus radius="0.13" radius-tubular="0.032" position="0 0 0.06" rotation="90 0 0" color="#fda4af" roughness="0.7"></a-torus>
      </a-entity>
    );
  }

  // 9. Default / process node: molecular break-down nutrient diagram
  return (
    // @ts-ignore
    <a-entity animation="property: rotation; to: 360 360 0; loop: true; dur: 12000; easing: linear">
      {/* Central node */}
      {/* @ts-ignore */}
      <a-sphere radius="0.14" color={color} material="roughness: 0.2; metalness: 0.8"></a-sphere>
      {/* Surrounding particles */}
      {/* @ts-ignore */}
      <a-sphere radius="0.055" position="-0.18 0.11 0.08" color="#ffffff" material="shader: flat"></a-sphere>
      {/* @ts-ignore */}
      <a-sphere radius="0.055" position="0.18 -0.11 0.08" color="#ffffff" material="shader: flat"></a-sphere>
      {/* @ts-ignore */}
      <a-sphere radius="0.055" position="0.07 -0.16 -0.10" color="#ffffff" material="shader: flat"></a-sphere>
      {/* Connecting sticks */}
      {/* @ts-ignore */}
      <a-cylinder radius="0.007" height="0.24" position="-0.09 0.05 0.04" rotation="45 45 0" color="#a1a1aa"></a-cylinder>
      {/* @ts-ignore */}
      <a-cylinder radius="0.007" height="0.24" position="0.09 -0.05 0.04" rotation="45 45 0" color="#a1a1aa"></a-cylinder>
    </a-entity>
  );
}

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

  // Register hover and billboard components once A-Frame is ready
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
            if (d) d.setAttribute('value', desc)
          })
          el.addEventListener('mouseleave', () => {
            el.setAttribute('animation__scale', 'property: scale; to: 1 1 1; dur: 200; easing: easeOutQuad')
          })
        },
      })
    }

    if (!AFRAME.components['look-at-camera']) {
      AFRAME.registerComponent('look-at-camera', {
        tick: function () {
          const cameraEl = document.querySelector('[camera]') as any
          if (!cameraEl) return
          const THREE = (window as any).THREE || AFRAME.THREE
          const cameraPosition = new THREE.Vector3()
          cameraEl.object3D.getWorldPosition(cameraPosition)
          ;(this.el as any).object3D.lookAt(cameraPosition)
        }
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

  // Calculate layout dynamically to prevent ANY overlaps
  const nodesRaw = vrLayout.nodes as any[]
  const count = nodesRaw.length
  const radius = 3.6
  const centerZ = -1.5 // Center pivot point
  
  // Calculate dynamic angle spread based on node count
  const startAngle = -Math.PI / 1.5 // approx -120 deg
  const endAngle = Math.PI / 1.5     // approx 120 deg
  const angleStep = count > 1 ? (endAngle - startAngle) / (count - 1) : 0

  const positionedNodes = nodesRaw.map((node, idx) => {
    const angle = startAngle + idx * angleStep
    // Circular coordinates around the viewer
    const x = Math.sin(angle) * radius
    const z = centerZ - Math.cos(angle) * (radius * 0.8)
    
    // Stagger heights vertically: upper (1.75m) and lower (1.25m) to prevent label/model overcrowding
    const y = idx % 2 === 0 ? 1.70 : 1.25

    return {
      ...node,
      pos: { x, y, z },
      color: node.color || NODE_COLORS[idx % NODE_COLORS.length],
      index: idx
    }
  })

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
              radius="0.02"
              material={`shader: flat; color: #ffffff; opacity: ${0.3 + Math.random() * 0.5}`}
              animation={`property: scale; to: ${0.3 + Math.random() * 0.5} ${0.3 + Math.random() * 0.5} ${0.3 + Math.random() * 0.5}; dir: alternate; loop: true; dur: ${800 + Math.floor(Math.random() * 1400)}; easing: easeInOutSine`}
            ></a-sphere>
          )
        })}

        {/* ── Ground deck ── */}
        {/* @ts-ignore */}
        <a-ring radius-inner="0.01" radius-outer="4.5" color="#0a0010" material="shader: flat; opacity: 0.9" rotation="-90 0 0" position="0 0.01 -1.5"></a-ring>
        {[0.8, 1.6, 2.4, 3.2, 4.0].map((r, i) => (
          // @ts-ignore
          <a-ring
            key={`ring-${i}`}
            radius-inner={r - 0.015}
            radius-outer={r}
            material={`shader: flat; color: #f43f5e; opacity: ${0.15 - i * 0.025}`}
            rotation="-90 0 0"
            position="0 0.02 -1.5"
          ></a-ring>
        ))}

        {/* ── Node entities ── */}
        {positionedNodes.map((node: any, idx: number) => {
          const { pos, color } = node
          const label = (node.label || 'Node').slice(0, 24)
          const desc = (node.description || '').slice(0, 160)

          // Compact staggered label offset relative to individual organ height
          const labelY = 0.55

          return (
            // @ts-ignore
            <a-entity
              key={node.id || idx}
              position={`${pos.x} ${pos.y} ${pos.z}`}
              node-hover={`label: ${label}; desc: ${desc}`}
            >
              {/* Invisible raycast target sphere for reliable desktop gaze hover detection */}
              {/* @ts-ignore */}
              <a-sphere
                class="raycastable"
                radius="0.45"
                material="visible: false; transparent: true"
              ></a-sphere>

              {/* Glowing pedestal ring */}
              {/* @ts-ignore */}
              <a-ring
                radius-inner="0.30"
                radius-outer="0.34"
                rotation="90 0 0"
                position="0 -0.60 0"
                material={`shader: flat; color: ${color}; opacity: 0.85`}
                animation="property: scale; to: 1.12 1.12 1.12; dir: alternate; loop: true; dur: 1400; easing: easeInOutSine"
              ></a-ring>
              
              {/* Thin pedestal connector stem */}
              {/* @ts-ignore */}
              <a-cylinder
                radius="0.018"
                height="0.55"
                position="0 -0.32 0"
                material={`shader: flat; color: ${color}; opacity: 0.35`}
              ></a-cylinder>

              {/* ── Render Realistic Composite Model ── */}
              {renderOrganModel(label, color)}

              {/* Billboarded Label Tag with a clean dark backing card */}
              {/* @ts-ignore */}
              <a-entity look-at-camera position={`0 ${labelY} 0`}>
                {/* @ts-ignore */}
                <a-plane
                  width="0.8"
                  height="0.22"
                  material="shader: flat; color: #07060a; transparent: true; opacity: 0.8"
                >
                  {/* @ts-ignore */}
                  <a-text
                    value={label}
                    align="center"
                    width="1.3"
                    color="#ffffff"
                    wrap-count="12"
                    position="0 0 0.01"
                  ></a-text>
                </a-plane>
              </a-entity>
            </a-entity>
          )
        })}

        {/* ── Connection lines ── */}
        {edges.map((edge: any, idx: number) => {
          const from = positionedNodes.find((n: any) => n.id === edge.from)
          const to   = positionedNodes.find((n: any) => n.id === edge.to)
          if (!from || !to) return null
          const { x: x1, y: y1, z: z1 } = from.pos
          const { x: x2, y: y2, z: z2 } = to.pos
          return (
            // @ts-ignore
            <a-entity key={`edge-${idx}`}>
              {/* @ts-ignore */}
              <a-entity
                line={`start: ${x1} ${y1} ${z1}; end: ${x2} ${y2} ${z2}; color: ${edge.color || '#f43f5e'}; opacity: 0.35`}
              ></a-entity>
            </a-entity>
          )
        })}

        {/* ── Info panel — billboarded at bottom of view ── */}
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
            raycaster="objects: .raycastable"
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
