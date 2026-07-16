'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, getAuthToken, API_BASE } from '@/lib/api'
import { Loader2, ChevronLeft, Sparkles, AlertCircle, Mic, MicOff, Volume2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

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

// Gemini Native Audio helper
function base64ToPcmFloat(b64: string): Float32Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const int16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768
  return float32
}

// ── Realistic Composite 3D Organ Models ──
function renderOrganModel(label: string, color: string) {
  const clean = label.toLowerCase();
  
  if (clean.includes('teeth') || clean.includes('tooth') || clean.includes('mouth')) {
    return (
      // @ts-ignore
      <a-entity position="0.75 0.35 -2.0" rotation="20 0 0" scale="1.2 1.2 1.2">
        {/* @ts-ignore */}
        <a-torus radius="0.18" radius-tubular="0.02" arc="180" rotation="90 0 0" position="0 -0.04 0" color="#e2e8f0"></a-torus>
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
  
  if (clean.includes('tongue')) {
    return (
      // @ts-ignore
      <a-entity position="0.75 0.35 -2.0" rotation="25 0 0" scale="1.2 1.2 1.2">
        {/* @ts-ignore */}
        <a-box width="0.28" height="0.06" depth="0.40" color="#fda4af" roughness="0.8" position="0 0 0"></a-box>
        {/* @ts-ignore */}
        <a-box width="0.015" height="0.068" depth="0.38" color="#f43f5e" position="0 0.002 0"></a-box>
        {/* @ts-ignore */}
        <a-sphere radius="0.13" scale="1 0.4 1" position="0 -0.02 -0.08" color="#f43f5e"></a-sphere>
      </a-entity>
    );
  }
  
  if (clean.includes('stomach')) {
    return (
      // @ts-ignore
      <a-entity position="0.75 0.38 -2.0" rotation="0 0 20" scale="1.2 1.2 1.2">
        {/* @ts-ignore */}
        <a-sphere radius="0.22" scale="1.3 0.9 0.75" color="#f43f5e" position="0 0 0" roughness="0.6"></a-sphere>
        {/* @ts-ignore */}
        <a-cylinder radius="0.06" height="0.16" position="-0.10 0.16 0" rotation="0 0 -25" color="#fda4af"></a-cylinder>
        {/* @ts-ignore */}
        <a-cylinder radius="0.05" height="0.20" position="0.15 -0.11 0" rotation="0 0 65" color="#e11d48"></a-cylinder>
      </a-entity>
    );
  }
  
  if (clean.includes('liver')) {
    return (
      // @ts-ignore
      <a-entity position="0.75 0.38 -2.0" rotation="0 15 -10" scale="1.2 1.2 1.2">
        {/* @ts-ignore */}
        <a-sphere radius="0.28" scale="1.2 0.65 0.75" position="0.06 0 0" color="#7f1d1d" roughness="0.7"></a-sphere>
        {/* @ts-ignore */}
        <a-sphere radius="0.18" scale="1.1 0.55 0.65" position="-0.13 0.04 0.04" color="#991b1b" roughness="0.7"></a-sphere>
        {/* @ts-ignore */}
        <a-sphere radius="0.05" scale="0.7 1.1 0.7" position="0.06 -0.15 0.08" color="#166534" roughness="0.5"></a-sphere>
      </a-entity>
    );
  }
  
  if (clean.includes('pancreas')) {
    return (
      // @ts-ignore
      <a-entity position="0.75 0.35 -2.0" rotation="0 0 -15" scale="1.2 1.2 1.2">
        {/* @ts-ignore */}
        <a-sphere radius="0.10" position="-0.11 0 0" color="#ea580c" roughness="0.9"></a-sphere>
        {/* @ts-ignore */}
        <a-cylinder radius="0.06" height="0.32" position="0.03 0 0" rotation="0 0 90" color="#f97316" roughness="0.9"></a-cylinder>
        {/* @ts-ignore */}
        <a-sphere radius="0.03" position="-0.06 0.04 0.04" color="#ea580c"></a-sphere>
        {/* @ts-ignore */}
        <a-sphere radius="0.03" position="0.03 -0.03 0.04" color="#f97316"></a-sphere>
        {/* @ts-ignore */}
        <a-sphere radius="0.03" position="0.09 0.02 0.03" color="#f97316"></a-sphere>
      </a-entity>
    );
  }
  
  if (clean.includes('salivary') || clean.includes('gland')) {
    return (
      // @ts-ignore
      <a-entity position="0.75 0.35 -2.0" scale="1.2 1.2 1.2">
        {/* @ts-ignore */}
        <a-cylinder radius="0.015" height="0.22" color="#f43f5e" rotation="45 0 0"></a-cylinder>
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
  
  if (clean.includes('esophagus') || clean.includes('throat') || clean.includes('vessel') || clean.includes('pharynx')) {
    return (
      // @ts-ignore
      <a-entity position="0.75 0.38 -2.0" scale="1.2 1.2 1.2">
        {/* @ts-ignore */}
        <a-cylinder radius="0.065" height="0.50" color="#fda4af" roughness="0.9"></a-cylinder>
        {/* @ts-ignore */}
        <a-torus radius="0.07" radius-tubular="0.007" position="0 0.14 0" rotation="90 0 0" color="#f43f5e" opacity="0.8"></a-torus>
        {/* @ts-ignore */}
        <a-torus radius="0.07" radius-tubular="0.007" position="0 0 0" rotation="90 0 0" color="#f43f5e" opacity="0.8"></a-torus>
        {/* @ts-ignore */}
        <a-torus radius="0.07" radius-tubular="0.007" position="0 -0.14 0" rotation="90 0 0" color="#f43f5e" opacity="0.8"></a-torus>
      </a-entity>
    );
  }
  
  if (clean.includes('intestine') || clean.includes('colon') || clean.includes('rectum')) {
    return (
      // @ts-ignore
      <a-entity position="0.75 0.35 -2.0" scale="1.2 1.2 1.2">
        {/* @ts-ignore */}
        <a-torus radius="0.15" radius-tubular="0.038" position="-0.05 0.06 0" rotation="20 40 10" color="#f43f5e" roughness="0.7"></a-torus>
        {/* @ts-ignore */}
        <a-torus radius="0.15" radius-tubular="0.038" position="0.05 -0.06 0" rotation="-20 -40 -10" color="#f43f5e" roughness="0.7"></a-torus>
        {/* @ts-ignore */}
        <a-torus radius="0.13" radius-tubular="0.032" position="0 0 0.06" rotation="90 0 0" color="#fda4af" roughness="0.7"></a-torus>
      </a-entity>
    );
  }

  // Default projection node (molecule)
  return (
    // @ts-ignore
    <a-entity position="0.75 0.35 -2.0" animation="property: rotation; to: 360 360 0; loop: true; dur: 12000; easing: linear">
      {/* @ts-ignore */}
      <a-sphere radius="0.14" color={color} material="roughness: 0.2; metalness: 0.8"></a-sphere>
      {/* @ts-ignore */}
      <a-sphere radius="0.055" position="-0.18 0.11 0.08" color="#ffffff" material="shader: flat"></a-sphere>
      {/* @ts-ignore */}
      <a-sphere radius="0.055" position="0.18 -0.11 0.08" color="#ffffff" material="shader: flat"></a-sphere>
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

  // AI voice states
  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [isMicAvailable, setIsMicAvailable] = useState(true)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [activeModel, setActiveModel] = useState<string>('Digestion')
  const [tutorText, setTutorText] = useState<string>('Hello! Welcome to the Holographic VR Classroom. Gaze at any menu concept on the left to begin.')

  // Refs for audio context
  const wsRef = useRef<WebSocket | null>(null)
  const micAudioCtxRef = useRef<AudioContext | null>(null)
  const playAudioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isMicMutedRef = useRef(false)
  const nextPlayTimeRef = useRef(0)
  const isSpeakingTimeoutRef = useRef<any>(null)
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])

  useEffect(() => {
    isMicMutedRef.current = isMicMuted
  }, [isMicMuted])

  // fetch notes data
  const { data: resource, isLoading: isResourceLoading } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
    enabled: !!resourceId,
  })

  const { data: vrLayout } = useQuery({
    queryKey: ['vr-layout', resourceId],
    queryFn: () => libraryApi.getVRLayout(resourceId).then(r => r.data),
    enabled: !!resourceId,
  })

  // Dynamic menu concepts parsed from VR layout
  const concepts = (vrLayout?.nodes || []).map((node: any) => ({
    id: node.id,
    label: node.label,
    description: node.description || ''
  })).slice(0, 6)

  // ── Audio Playout helpers ──
  const stopAudioPlayout = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop() } catch (e) {}
    })
    activeSourcesRef.current = []
    if (playAudioCtxRef.current) {
      nextPlayTimeRef.current = playAudioCtxRef.current.currentTime
    }
    setIsAiSpeaking(false)
    clearTimeout(isSpeakingTimeoutRef.current)
  }, [])

  const playAudioChunk = useCallback((pcm: Float32Array) => {
    const ctx = playAudioCtxRef.current || new AudioContext({ sampleRate: 24000 })
    playAudioCtxRef.current = ctx

    const buffer = ctx.createBuffer(1, pcm.length, 24000)
    buffer.copyToChannel(pcm as any, 0)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current)
    source.start(startAt)
    nextPlayTimeRef.current = startAt + buffer.duration

    activeSourcesRef.current.push(source)
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(src => src !== source)
    }

    setIsAiSpeaking(true)
    clearTimeout(isSpeakingTimeoutRef.current)
    isSpeakingTimeoutRef.current = setTimeout(() => {
      setIsAiSpeaking(false)
    }, (nextPlayTimeRef.current - ctx.currentTime) * 1000 + 500)
  }, [])

  // ── Mic capture ──
  const activateMicProcessor = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext({ sampleRate: 16000 })
      micAudioCtxRef.current = ctx

      const resumeCtx = () => {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      }
      const resumeInterval = setInterval(() => {
        if (!processorRef.current) { clearInterval(resumeInterval); return }
        resumeCtx()
      }, 500)

      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(2048, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        if (isMicMutedRef.current) return
        if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return }
        
        const float32 = e.inputBuffer.getChannelData(0).slice()
        const pcm16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
        }
        const bytes = new Uint8Array(pcm16.buffer)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        const b64 = btoa(binary)
        wsRef.current.send(JSON.stringify({ type: 'audio', data: b64 }))
      }

      source.connect(processor)
      const silentGain = ctx.createGain()
      silentGain.gain.value = 0
      processor.connect(silentGain)
      silentGain.connect(ctx.destination)
    } catch (e) {
      console.error('Failed to configure mic', e)
    }
  }

  const stopMic = () => {
    processorRef.current?.disconnect()
    processorRef.current = null
    if (micAudioCtxRef.current) {
      void micAudioCtxRef.current.close().catch(() => {})
      micAudioCtxRef.current = null
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  // ── Establish Gemini WebSocket Session ──
  useEffect(() => {
    const initVoiceSession = async () => {
      if (!resource) return
      
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: { ideal: 16000 },
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          }
        })
        streamRef.current = micStream
        setIsMicAvailable(true)
      } catch (e) {
        setIsMicAvailable(false)
        toast.warning('Mic unavailable — gaze menu interaction will still trigger voice teachings.')
      }

      try {
        const token = await getAuthToken()
        const backendHost = (API_BASE || '').replace(/^https?:\/\//, '').replace(/\/api$/, '')
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${backendHost}/ws/examprep/${resourceId}/?token=${token}`

        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          // Preload content
          const kit = resource.ai_notes_json || {}
          const sections = (kit.sections || []).slice(0, 10)
          const context = sections.map((s: any) => `${s.title}: ${s.content?.slice(0, 300)}`).join('\n\n')

          ws.send(JSON.stringify({
            type: 'start',
            technique: 'vr_tutor',
            resource_title: resource.title,
            resource_context: context,
            voice: 'Aoede'
          }))
        }

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data)

          if (msg.type === 'ready') {
            if (streamRef.current) {
              activateMicProcessor(streamRef.current)
            }
          } else if (msg.type === 'audio') {
            const pcm = base64ToPcmFloat(msg.data)
            playAudioChunk(pcm)
          } else if (msg.type === 'interrupted') {
            stopAudioPlayout()
          } else if (msg.type === 'transcript_ai') {
            setTutorText(prev => {
              // Extract organ keywords from accumulated AI transcript to automatically update projected 3D visual
              const text = msg.text.toLowerCase()
              if (text.includes('stomach')) setActiveModel('Stomach')
              else if (text.includes('liver')) setActiveModel('Liver')
              else if (text.includes('pancreas')) setActiveModel('Pancreas')
              else if (text.includes('salivary')) setActiveModel('Salivary Glands')
              else if (text.includes('teeth')) setActiveModel('Teeth')
              else if (text.includes('tongue')) setActiveModel('Tongue')
              else if (text.includes('intestine')) setActiveModel('Intestines')
              
              if (prev.startsWith('Hello! Welcome') || prev.length > 200) {
                return msg.text
              }
              return prev + msg.text
            })
          }
        }
      } catch (e) {
        toast.error('Failed to establish classroom audio proxy.')
      }
    }

    if (resource) {
      initVoiceSession()
    }

    return () => {
      if (wsRef.current) wsRef.current.close()
      stopMic()
      stopAudioPlayout()
    }
  }, [resource])

  // ── Load A-Frame ──
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

  // ── Register custom components ──
  useEffect(() => {
    if (!aframeLoaded || !(window as any).AFRAME) return
    const AFRAME = (window as any).AFRAME

    // Custom menu gaze triggers
    if (!AFRAME.components['menu-trigger']) {
      AFRAME.registerComponent('menu-trigger', {
        schema: { 
          label: { type: 'string', default: '' },
          desc: { type: 'string', default: '' } 
        },
        init: function () {
          const el = this.el
          const { label, desc } = this.data

          el.addEventListener('mouseenter', () => {
            el.setAttribute('material', 'color: #f43f5e; opacity: 0.95')
            el.setAttribute('scale', '1.08 1.08 1')
          })

          el.addEventListener('mouseleave', () => {
            el.setAttribute('material', 'color: #0c0a12; opacity: 0.85')
            el.setAttribute('scale', '1 1 1')
          })

          el.addEventListener('click', () => {
            setActiveModel(label)
            setTutorText(`Teaching about the ${label}...`)
            
            // Send request turns to Gemini Live Voice
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'text_message',
                text: `Briefly explain the functions and importance of the ${label} in 2 sentences.`
              }))
            }
          })
        }
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

  if (isResourceLoading || (!aframeLoaded && !scriptError)) {
    return (
      <div className="w-full h-screen bg-[#050507] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
        <div className="text-center">
          <p className="text-sm font-black text-white uppercase tracking-widest">Entering Holographic Room...</p>
          <p className="text-[10px] text-slate-500 mt-1">Initializing AI Classroom and Avatar Deck</p>
        </div>
      </div>
    )
  }

  if (scriptError || !resource) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center p-6 space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500" />
        <div className="text-center">
          <h2 className="text-lg font-black text-white uppercase">VR Classroom Failed</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">Tutor engine could not launch. Please try again.</p>
        </div>
        <Link href={`/library/${resourceId}`}
          className="px-5 py-2.5 rounded-xl bg-white text-black font-black text-xs uppercase tracking-widest">
          Return to Notes
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full h-screen relative bg-black select-none">
      
      {/* ── HUD controls ── */}
      <div className="absolute top-5 left-5 z-50 pointer-events-auto flex items-center gap-3">
        <Link href={`/library/${resourceId}`}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 text-white hover:text-rose-400 text-xs font-bold uppercase tracking-widest transition-all">
          <ChevronLeft className="w-4 h-4" /> Back to Notes
        </Link>
        <button
          onClick={() => setIsMicMuted(m => !m)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 text-white hover:text-rose-400 disabled:opacity-50 text-xs font-bold uppercase tracking-widest transition-all"
        >
          {isMicMuted ? (
            <><MicOff className="w-3.5 h-3.5 text-rose-500" /> Mic Muted</>
          ) : (
            <><Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> Mic Active</>
          )}
        </button>
      </div>

      <div className="absolute top-5 right-5 z-50 flex items-center gap-2 pointer-events-none">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/50 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/[0.06] flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-rose-400" />
          Live Voice Classroom
        </span>
      </div>

      {/* ── A-Frame Scene ── */}
      {/* @ts-ignore */}
      <a-scene embedded vr-mode-ui="enabled: true" renderer="antialias: true; colorManagement: true; physicallyCorrectLights: true">
        
        {/* Skybox */}
        {/* @ts-ignore */}
        <a-sky color="#030206"></a-sky>

        {/* Dynamic stars */}
        {Array.from({ length: 30 }).map((_, i) => {
          const px = (Math.random() - 0.5) * 12
          const py = Math.random() * 5 + 1.5
          const pz = -(Math.random() * 8 + 2)
          return (
            // @ts-ignore
            <a-sphere
              key={`star-${i}`}
              position={`${px} ${py} ${pz}`}
              radius="0.015"
              material="shader: flat; color: #ffffff; opacity: 0.6"
            ></a-sphere>
          )
        })}

        {/* Ambient Lights */}
        {/* @ts-ignore */}
        <a-light type="ambient" color="#ffffff" intensity="1.1"></a-light>
        {/* @ts-ignore */}
        <a-light type="directional" color="#ffffff" intensity="1.3" position="2 4 1"></a-light>
        {/* @ts-ignore */}
        <a-light type="point" color="#a855f7" intensity="1.2" position="0 2 -2"></a-light>

        {/* Floor circles */}
        {/* @ts-ignore */}
        <a-ring radius-inner="0" radius-outer="4" color="#080512" rotation="-90 0 0" position="0 -0.5 -1"></a-ring>
        {/* @ts-ignore */}
        <a-ring radius-inner="2" radius-outer="2.02" color="#a855f7" opacity="0.2" rotation="-90 0 0" position="0 -0.49 -1" material="shader: flat"></a-ring>

        {/* ── LEFT PANEL: Gaze Interactive Concept Menu ── */}
        {/* @ts-ignore */}
        <a-entity position="-0.85 0.5 -1.6" rotation="0 25 0">
          {/* Menu Backing plate */}
          {/* @ts-ignore */}
          <a-plane
            width="0.8"
            height="1.0"
            material="shader: flat; color: #07050e; transparent: true; opacity: 0.85; side: double"
          >
            {/* Title */}
            {/* @ts-ignore */}
            <a-text
              value="CONCEPTS MENU"
              align="center"
              width="1.8"
              color="#a855f7"
              position="0 0.4 0.01"
              font="klykov"
            ></a-text>

            {/* Menu List of concepts */}
            {concepts.map((concept: any, idx: number) => {
              const buttonY = 0.22 - idx * 0.125
              return (
                // @ts-ignore
                <a-plane
                  key={concept.id}
                  class="raycastable"
                  width="0.7"
                  height="0.09"
                  position={`0 ${buttonY} 0.02`}
                  material="shader: flat; color: #0c0a12; transparent: true; opacity: 0.85"
                  menu-trigger={`label: ${concept.label}; desc: ${concept.description}`}
                >
                  {/* @ts-ignore */}
                  <a-text
                    value={concept.label}
                    align="center"
                    width="1.6"
                    color="#ffffff"
                    position="0 0 0.01"
                  ></a-text>
                </a-plane>
              )
            })}
          </a-plane>
        </a-entity>

        {/* ── CENTER: Futuristic Holographic Tutor Avatar ── */}
        {/* @ts-ignore */}
        <a-entity
          position="0 0.25 -2.2"
          animation="property: position; to: 0 0.35 -2.2; dir: alternate; loop: true; dur: 2200; easing: easeInOutSine"
        >
          {/* Head (glowing glass sphere) */}
          {/* @ts-ignore */}
          <a-sphere radius="0.13" color="#a855f7" material="roughness: 0.1; metalness: 0.9; opacity: 0.8"></a-sphere>
          
          {/* Glowing Eyes */}
          {/* @ts-ignore */}
          <a-sphere radius="0.025" position="-0.04 0.02 0.11" color="#06b6d4" material="shader: flat"></a-sphere>
          {/* @ts-ignore */}
          <a-sphere radius="0.025" position="0.04 0.02 0.11" color="#06b6d4" material="shader: flat"></a-sphere>

          {/* Neck ring */}
          {/* @ts-ignore */}
          <a-torus radius="0.09" radius-tubular="0.015" rotation="90 0 0" position="0 -0.16 0" color="#06b6d4" material="shader: flat; opacity: 0.8"></a-torus>

          {/* Torso */}
          {/* @ts-ignore */}
          <a-cylinder radius="0.15" height="0.32" position="0 -0.34 0" color="#1e1b4b" material="roughness: 0.2; metalness: 0.8"></a-cylinder>

          {/* Glowing vocal core in chest - pulses rapidly when talking */}
          {/* @ts-ignore */}
          <a-sphere
            radius="0.05"
            position="0 -0.3 0.12"
            color="#a855f7"
            material="shader: flat"
            animation={isAiSpeaking ? "property: scale; to: 1.4 1.4 1.4; dir: alternate; loop: true; dur: 150" : "property: scale; to: 1.05 1.05 1.05; dir: alternate; loop: true; dur: 1500; easing: easeInOutSine"}
          ></a-sphere>

          {/* Floating Base Platform */}
          {/* @ts-ignore */}
          <a-cone radius-bottom="0.18" radius-top="0.02" height="0.25" position="0 -0.62 0" color="#1e1b4b" rotation="180 0 0"></a-cone>
          {/* @ts-ignore */}
          <a-ring radius-inner="0" radius-outer="0.24" color="#06b6d4" rotation="-90 0 0" position="0 -0.74 0" material="shader: flat; opacity: 0.5"></a-ring>
        </a-entity>

        {/* ── RIGHT PANEL: Holographic Projector Display Stage ── */}
        {/* Base Ring on the floor */}
        {/* @ts-ignore */}
        <a-ring radius-inner="0" radius-outer="0.4" color="#06b6d4" rotation="-90 0 0" position="0.75 -0.49 -2.0" material="shader: flat; opacity: 0.85"></a-ring>
        {/* Light beam cylinder */}
        {/* @ts-ignore */}
        <a-cylinder radius="0.4" height="1.6" position="0.75 0.3 -2.0" material="shader: flat; transparent: true; opacity: 0.08; color: #06b6d4; side: double"></a-cylinder>

        {/* Dynamic projected anatomical 3D structure */}
        {renderOrganModel(activeModel, '#06b6d4')}

        {/* Concept label card floating right above the projection stage */}
        {/* @ts-ignore */}
        <a-entity look-at-camera position="0.75 0.95 -2.0">
          {/* @ts-ignore */}
          <a-plane width="0.7" height="0.16" material="shader: flat; color: #07050e; transparent: true; opacity: 0.85">
            {/* @ts-ignore */}
            <a-text value={activeModel} align="center" width="1.8" color="#a855f7" font="klykov"></a-text>
          </a-plane>
        </a-entity>

        {/* ── BOTTOM PANEL: Large Translucent Dialogue/Transcript Board ── */}
        {/* @ts-ignore */}
        <a-plane
          position="0 0.65 -1.7"
          rotation="-12 0 0"
          width="2.6"
          height="0.75"
          material="shader: flat; color: #05040a; transparent: true; opacity: 0.9"
        >
          {/* Status / Speaker title */}
          {/* @ts-ignore */}
          <a-text
            value={isAiSpeaking ? "TUTOR SPEAKING..." : "TUTOR LISTENING / AWAITING SELECTION..."}
            align="center"
            width="1.6"
            color="#06b6d4"
            position="0 0.26 0.01"
            font="klykov"
          ></a-text>

          {/* Subtitles text body */}
          {/* @ts-ignore */}
          <a-text
            value={tutorText}
            align="center"
            width="2.3"
            color="#ffffff"
            position="0 -0.06 0.01"
            wrap-count="45"
          ></a-text>
        </a-plane>

        {/* ── Camera + raycasting gaze cursor ── */}
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
