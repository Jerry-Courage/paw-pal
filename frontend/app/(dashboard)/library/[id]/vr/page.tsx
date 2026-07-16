'use client'

import { useEffect, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import { Loader2, ChevronLeft, Sparkles, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'a-scene': any;
      'a-sky': any;
      'a-light': any;
      'a-entity': any;
      'a-octahedron': any;
      'a-plane': any;
      'a-text': any;
      'a-cursor': any;
    }
  }
}

export default function VRPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  const [aframeLoaded, setAframeLoaded] = useState(false)
  const [scriptError, setScriptError] = useState(false)

  // ── Fetch Study Kit ──
  const { data: resource, isLoading: isResourceLoading } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
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
      // Clean up A-Frame dynamic styles and viewport tags if navigating away
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
            // Animate scale on hover
            el.setAttribute('animation', {
              property: 'scale',
              to: '1.1 1.1 1.1',
              dur: 150,
              easing: 'easeOutQuad'
            })
            // Highlight color
            el.setAttribute('color', '#f43f5e')

            // Update details dashboard in the VR space
            const detailBoard = document.querySelector('#detail-board')
            const detailTitle = document.querySelector('#detail-title')
            const detailText = document.querySelector('#detail-text')

            if (detailBoard) {
              detailBoard.setAttribute('visible', 'true')
            }
            if (detailTitle) {
              detailTitle.setAttribute('value', data.title)
            }
            if (detailText) {
              // Wrap text roughly for A-Frame text component
              const formattedContent = data.content.length > 140 
                ? data.content.slice(0, 137) + '...' 
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
            el.setAttribute('color', '#18181b')
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

  if (isResourceLoading || (!aframeLoaded && !scriptError)) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
        <div className="text-center">
          <p className="text-sm font-black text-white uppercase tracking-widest">Constructing VR Space...</p>
          <p className="text-[10px] text-slate-500 mt-1">Loading WebXR renderer and custom topic assets</p>
        </div>
      </div>
    )
  }

  if (scriptError || !resource) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center p-6 space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500" />
        <div className="text-center">
          <h2 className="text-lg font-black text-white uppercase">VR Mode Unavailable</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-normal">
            We couldn't initialize WebXR. Ensure you have network connectivity and a browser supporting WebGL.
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

  const notes = resource.ai_notes_json || {}
  const sections = (notes.sections || []).slice(0, 4) // Show top 4 key concepts
  
  // Sourcing VR Skybox & Models
  const subject = resource.subject || resource.title
  const skyboxPrompt = `equirectangular 360 panorama of ${subject}, detailed scientific visualization, 8k resolution, virtual reality workspace`
  const skyboxUrl = notes.vr_skybox_url || `https://image.pollinations.ai/prompt/${encodeURIComponent(skyboxPrompt)}?width=1024&height=512&enhance=false`
  const modelUrl = notes.vr_model_url || null

  // Card Positions in semicircle (angles: -45, -15, 15, 45 degrees)
  const cardCoordinates = [
    { x: -1.8, y: 1.5, z: -2.0, ry: 45 },
    { x: -0.7, y: 1.7, z: -2.3, ry: 15 },
    { x: 0.7, y: 1.7, z: -2.3, ry: -15 },
    { x: 1.8, y: 1.5, z: -2.0, ry: -45 }
  ]

  return (
    <div className="w-full h-screen relative bg-black select-none">
      
      {/* ── Standard 2D HUD Controls Overlay ── */}
      <div className="absolute top-6 left-6 z-[100] pointer-events-auto">
        <Link
          href={`/library/${resourceId}`}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/[0.06] text-white hover:text-rose-400 hover:border-rose-500/20 text-xs font-bold uppercase tracking-widest transition-all duration-200"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Notes
        </Link>
      </div>

      <div className="absolute top-6 right-6 z-[100] hidden sm:flex flex-col items-end pointer-events-none">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/50 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/[0.04] flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-rose-400" /> Topic: {resource.subject || 'General'}
        </span>
      </div>

      {/* ── A-Frame WebXR Canvas ── */}
      {/* @ts-ignore */}
      <a-scene embedded vr-mode-ui="enabled: true">
        
        {/* Skybox Background */}
        {/* @ts-ignore */}
        <a-sky src={skyboxUrl} rotation="0 -90 0"></a-sky>

        {/* Ambient Lights */}
        {/* @ts-ignore */}
        <a-light type="ambient" intensity="0.6" color="#ffffff"></a-light>
        {/* @ts-ignore */}
        <a-light type="directional" intensity="0.8" position="2 4 3" color="#ffffff"></a-light>

        {/* ── 3D Object Render ── */}
        {modelUrl ? (
          /* GLB Model Loader if matched */
          // @ts-ignore
          <a-entity
            gltf-model={modelUrl}
            position="0 1.3 -3.0"
            scale="1.3 1.3 1.3"
            animation="property: rotation; to: 0 360 0; loop: true; dur: 20000; easing: linear"
          ></a-entity>
        ) : (
          /* Elegant holographic polygon representing theoretical concepts */
          // @ts-ignore
          <a-octahedron
            position="0 1.4 -2.8"
            radius="0.75"
            color="#f43f5e"
            material="wireframe: true; metalness: 0.9; roughness: 0.1; opacity: 0.8"
            animation="property: rotation; to: 360 360 0; loop: true; dur: 12000; easing: linear"
          ></a-octahedron>
        )}

        {/* ── Floating Interactive Concept Cards ── */}
        {sections.map((sec: any, idx: number) => {
          const coord = cardCoordinates[idx] || cardCoordinates[0]
          return (
            // @ts-ignore
            <a-plane
              key={idx}
              position={`${coord.x} ${coord.y} ${coord.z}`}
              rotation={`0 ${coord.ry} 0`}
              width="1.0"
              height="0.5"
              color="#18181b"
              opacity="0.9"
              material="roughness: 0.8; metalness: 0.2"
              interactive-panel={`title: ${sec.title}; content: ${sec.content}`}
            >
              {/* @ts-ignore */}
              <a-text
                value={sec.title}
                align="center"
                width="0.9"
                color="#ffffff"
                position="0 0 0.02"
                font="klykov"
              ></a-text>
            </a-plane>
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
          color="#09090b"
          opacity="0.95"
          material="roughness: 0.9; metalness: 0.3; strokeColor: #f43f5e; strokeWidth: 2"
        >
          {/* @ts-ignore */}
          <a-text
            id="detail-title"
            value={resource.title}
            align="center"
            width="2.2"
            color="#f43f5e"
            position="0 0.25 0.02"
            font="klykov"
          ></a-text>
          {/* @ts-ignore */}
          <a-text
            id="detail-text"
            value="Gaze at any floating card to load details"
            align="center"
            width="2.0"
            color="#94a3b8"
            position="0 -0.1 0.02"
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
