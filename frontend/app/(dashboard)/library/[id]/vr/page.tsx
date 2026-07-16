'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, getAuthToken, API_BASE } from '@/lib/api'
import { Loader2, ChevronLeft, Sparkles, AlertCircle, Mic, MicOff } from 'lucide-react'
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
      'a-camera': any;
      'a-circle': any;
      'a-cone': any;
    }
  }
}

// Rich biology color palette
const NODE_COLORS = [
  '#f43f5e', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ec4899', '#3b82f6', '#a3e635',
]

function base64ToPcmFloat(base64: string): Float32Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

// ── Realistic Composite 3D Organ Models ──
function renderOrganModel(label: string, color: string, posStr: string) {
  const clean = label.toLowerCase();
  
  // 1. Teeth: Jaw arch and individual teeth
  if (clean.includes('teeth') || clean.includes('tooth') || clean.includes('mouth')) {
    return (
      // @ts-ignore
      <a-entity position={posStr} rotation="20 0 0" scale="1.2 1.2 1.2">
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
  
  // 2. Tongue: Realistic pink tongue with groove
  if (clean.includes('tongue')) {
    return (
      // @ts-ignore
      <a-entity position={posStr} rotation="25 0 0" scale="1.2 1.2 1.2">
        {/* @ts-ignore */}
        <a-box width="0.28" height="0.06" depth="0.40" color="#fda4af" roughness="0.8" position="0 0 0"></a-box>
        {/* @ts-ignore */}
        <a-box width="0.015" height="0.068" depth="0.38" color="#f43f5e" position="0 0.002 0"></a-box>
        {/* @ts-ignore */}
        <a-sphere radius="0.13" scale="1 0.4 1" position="0 -0.02 -0.08" color="#f43f5e"></a-sphere>
      </a-entity>
    );
  }
  
  // 3. Stomach: Curved J-shape organ
  if (clean.includes('stomach')) {
    return (
      // @ts-ignore
      <a-entity position={posStr} rotation="0 0 20" scale="1.2 1.2 1.2">
        {/* @ts-ignore */}
        <a-sphere radius="0.22" scale="1.3 0.9 0.75" color="#f43f5e" position="0 0 0" roughness="0.6"></a-sphere>
        {/* @ts-ignore */}
        <a-cylinder radius="0.06" height="0.16" position="-0.10 0.16 0" rotation="0 0 -25" color="#fda4af"></a-cylinder>
        {/* @ts-ignore */}
        <a-cylinder radius="0.05" height="0.20" position="0.15 -0.11 0" rotation="0 0 65" color="#e11d48"></a-cylinder>
      </a-entity>
    );
  }
  
  // 4. Liver: Dark-red wedge bi-lobed organ with green gallbladder peaking underneath
  if (clean.includes('liver')) {
    return (
      // @ts-ignore
      <a-entity position={posStr} rotation="0 15 -10" scale="1.2 1.2 1.2">
        {/* @ts-ignore */}
        <a-sphere radius="0.28" scale="1.2 0.65 0.75" position="0.06 0 0" color="#7f1d1d" roughness="0.7"></a-sphere>
        {/* @ts-ignore */}
        <a-sphere radius="0.18" scale="1.1 0.55 0.65" position="-0.13 0.04 0.04" color="#991b1b" roughness="0.7"></a-sphere>
        {/* @ts-ignore */}
        <a-sphere radius="0.05" scale="0.7 1.1 0.7" position="0.06 -0.15 0.08" color="#166534" roughness="0.5"></a-sphere>
      </a-entity>
    );
  }
  
  // 5. Pancreas: Elongated orange gland
  if (clean.includes('pancreas')) {
    return (
      // @ts-ignore
      <a-entity position={posStr} rotation="0 0 -15" scale="1.2 1.2 1.2">
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
  
  // 6. Salivary Glands: Grape-like cluster representation
  if (clean.includes('salivary') || clean.includes('gland')) {
    return (
      // @ts-ignore
      <a-entity position={posStr} scale="1.2 1.2 1.2">
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
  
  // 7. Esophagus / Throat: Muscular pink cylinder tube
  if (clean.includes('esophagus') || clean.includes('throat') || clean.includes('vessel') || clean.includes('pharynx')) {
    return (
      // @ts-ignore
      <a-entity position={posStr} scale="1.2 1.2 1.2">
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
  
  // 8. Intestines: Convoluted winding loops
  if (clean.includes('intestine') || clean.includes('colon') || clean.includes('rectum')) {
    return (
      // @ts-ignore
      <a-entity position={posStr} scale="1.2 1.2 1.2">
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
    <a-entity position={posStr} animation="property: rotation; to: 360 360 0; loop: true; dur: 12000; easing: linear">
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

  // Interactivity HUD states
  const [isHandRaised, setIsHandRaised] = useState(false)
  const [showNotesOverlay, setShowNotesOverlay] = useState(false)

  // Bridge React callbacks to window so A-Frame components can trigger them
  useEffect(() => {
    (window as any).toggleMic = () => setIsMicMuted(m => !m);
    (window as any).toggleHand = () => setIsHandRaised(h => !h);
    (window as any).toggleNotes = () => setShowNotesOverlay(n => !n);
    (window as any).triggerAsk = () => {
      setTutorText("AI Tutor, can you give me a summary of this concept?");
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'text_message',
          text: 'I have a question about this topic. Can you explain how it works and give me a quick quiz question?'
        }));
      }
    };
    return () => {
      delete (window as any).toggleMic;
      delete (window as any).toggleHand;
      delete (window as any).toggleNotes;
      delete (window as any).triggerAsk;
    }
  }, [isMicMuted, isHandRaised, showNotesOverlay])

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
          const { label } = this.data

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

    if (!AFRAME.components['console-btn']) {
      AFRAME.registerComponent('console-btn', {
        schema: {
          action: { type: 'string', default: '' }
        },
        init: function () {
          const el = this.el
          const action = this.data.action

          el.addEventListener('mouseenter', () => {
            el.setAttribute('material', 'color: #06b6d4; opacity: 0.95')
            el.setAttribute('scale', '1.08 1.08 1')
          })

          el.addEventListener('mouseleave', () => {
            el.setAttribute('material', 'color: #07050e; opacity: 0.85')
            el.setAttribute('scale', '1 1 1')
          })

          el.addEventListener('click', () => {
            if (action === 'mic' && (window as any).toggleMic) {
              (window as any).toggleMic()
            } else if (action === 'hand' && (window as any).toggleHand) {
              (window as any).toggleHand()
            } else if (action === 'notes' && (window as any).toggleNotes) {
              (window as any).toggleNotes()
            } else if (action === 'ask' && (window as any).triggerAsk) {
              (window as any).triggerAsk()
            }
          })
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
        
        {/* ── SCENIC WINDOW BACKDROP (Nature environment outside) ── */}
        {/* @ts-ignore */}
        <a-sky src="https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=2000&q=80" crossorigin="anonymous" material="opacity: 0.45; color: #1e293b"></a-sky>

        {/* ── COCKPIT ENCLOSURE ARCHITECTURE ── */}
        {/* Floor */}
        {/* @ts-ignore */}
        <a-plane width="16" height="16" color="#050409" rotation="-90 0 0" position="0 -0.5 0" material="roughness: 0.6; metalness: 0.9"></a-plane>
        
        {/* Floor concentric glowing ring pathways */}
        {/* @ts-ignore */}
        <a-ring radius-inner="1.3" radius-outer="1.32" color="#06b6d4" rotation="-90 0 0" position="0 -0.49 -3" opacity="0.6" material="shader: flat"></a-ring>
        {/* @ts-ignore */}
        <a-ring radius-inner="2.6" radius-outer="2.63" color="#a855f7" rotation="-90 0 0" position="0 -0.49 -3" opacity="0.4" material="shader: flat"></a-ring>

        {/* Curved front metallic walls & pillars */}
        {/* @ts-ignore */}
        <a-box width="0.3" height="6" depth="0.3" position="-5.5 2.5 -4" color="#0f172a" material="roughness: 0.3; metalness: 0.8"></a-box>
        {/* @ts-ignore */}
        <a-box width="0.3" height="6" depth="0.3" position="5.5 2.5 -4" color="#0f172a" material="roughness: 0.3; metalness: 0.8"></a-box>
        {/* @ts-ignore */}
        <a-box width="0.3" height="6" depth="0.3" position="-3.5 2.5 -5" color="#0f172a" material="roughness: 0.3; metalness: 0.8"></a-box>
        {/* @ts-ignore */}
        <a-box width="0.3" height="6" depth="0.3" position="3.5 2.5 -5" color="#0f172a" material="roughness: 0.3; metalness: 0.8"></a-box>

        {/* Ceiling arch */}
        {/* @ts-ignore */}
        <a-cylinder radius="0.08" height="11" position="0 4.5 -4.5" rotation="0 0 90" color="#1e293b" material="roughness: 0.4; metalness: 0.8"></a-cylinder>

        {/* Lighting system */}
        {/* @ts-ignore */}
        <a-light type="ambient" color="#ffffff" intensity="1.2"></a-light>
        {/* @ts-ignore */}
        <a-light type="directional" color="#ffffff" intensity="1.3" position="2 4 1"></a-light>
        {/* @ts-ignore */}
        <a-light type="point" color="#06b6d4" intensity="1.0" position="0 3.2 -2.5"></a-light>

        {/* ── CENTERSTAGE TUTOR PODIUM ── */}
        {/* @ts-ignore */}
        <a-cylinder radius="0.55" height="0.08" position="0 -0.46 -3.2" color="#0e1726" material="roughness: 0.4; metalness: 0.9"></a-cylinder>
        {/* @ts-ignore */}
        <a-ring radius-inner="0.53" radius-outer="0.55" position="0 -0.41 -3.2" rotation="-90 0 0" color="#06b6d4" material="shader: flat"></a-ring>

        {/* ── AI TUTOR AVATAR (Futuristic Sleek Humanoid Robot) ── */}
        {/* @ts-ignore */}
        <a-entity
          position="0 0.8 -3.2"
          animation="property: position; to: 0 0.9 -3.2; dir: alternate; loop: true; dur: 2400; easing: easeInOutSine"
        >
          {/* Head - Sleek white sphere with dark glass visor */}
          {/* @ts-ignore */}
          <a-sphere radius="0.12" color="#f8fafc" material="roughness: 0.2; metalness: 0.3"></a-sphere>
          {/* Visor */}
          {/* @ts-ignore */}
          <a-box width="0.15" height="0.05" depth="0.14" position="0 0 0.05" color="#090514" material="roughness: 0.1"></a-box>
          {/* Glowing Eyes */}
          {/* @ts-ignore */}
          <a-sphere radius="0.012" position="-0.03 0 0.12" color="#06b6d4" material="shader: flat"></a-sphere>
          {/* @ts-ignore */}
          <a-sphere radius="0.012" position="0.03 0 0.12" color="#06b6d4" material="shader: flat"></a-sphere>

          {/* Torso - Capsule jumpsuit aesthetic */}
          {/* @ts-ignore */}
          <a-cylinder radius="0.13" height="0.38" position="0 -0.38 0" color="#f8fafc" material="roughness: 0.2; metalness: 0.4"></a-cylinder>
          {/* Glowing blue accent rings */}
          {/* @ts-ignore */}
          <a-cylinder radius="0.135" height="0.02" position="0 -0.28 0" color="#06b6d4" material="shader: flat"></a-cylinder>
          {/* @ts-ignore */}
          <a-cylinder radius="0.135" height="0.02" position="0 -0.46 0" color="#06b6d4" material="shader: flat"></a-cylinder>
          
          {/* "AI" logo badge on chest */}
          {/* @ts-ignore */}
          <a-text value="AI" width="1.2" color="#06b6d4" position="0 -0.34 0.14" align="center" font="klykov"></a-text>

          {/* Glowing vocal core in chest - pulses in sync with speech */}
          {/* @ts-ignore */}
          <a-sphere
            radius="0.035"
            position="0 -0.36 0.135"
            color="#06b6d4"
            material="shader: flat"
            animation={isAiSpeaking ? "property: scale; to: 1.4 1.4 1.4; dir: alternate; loop: true; dur: 120" : "property: scale; to: 1.0 1.0 1.0; dir: alternate; loop: true; dur: 1500; easing: easeInOutSine"}
          ></a-sphere>

          {/* Left arm */}
          {/* @ts-ignore */}
          <a-cylinder radius="0.02" height="0.18" position="-0.17 -0.3 0" rotation="30 0 -20" color="#f8fafc"></a-cylinder>
          {/* @ts-ignore */}
          <a-cylinder radius="0.018" height="0.18" position="-0.22 -0.42 0.05" rotation="60 0 -10" color="#f8fafc"></a-cylinder>

          {/* Right arm gesturing to screen */}
          {/* @ts-ignore */}
          <a-cylinder radius="0.02" height="0.18" position="0.17 -0.3 0.05" rotation="-20 40 40" color="#f8fafc"></a-cylinder>
          {/* @ts-ignore */}
          <a-cylinder radius="0.018" height="0.20" position="0.28 -0.22 0.18" rotation="-40 60 20" color="#f8fafc"></a-cylinder>

          {/* Base connector */}
          {/* @ts-ignore */}
          <a-cone radius-bottom="0.15" radius-top="0.02" height="0.20" position="0 -0.66 0" color="#0f172a" rotation="180 0 0"></a-cone>
        </a-entity>


        {/* ── MAIN CURVED HOLOGRAPHIC SMARTBOARD (Floating behind the tutor) ── */}
        {/* @ts-ignore */}
        <a-entity position="0 1.8 -3.8">
          {/* Glass backing board */}
          {/* @ts-ignore */}
          <a-plane
            width="4.4"
            height="2.0"
            material="shader: flat; color: #080f1e; transparent: true; opacity: 0.85; side: double"
          >
            {/* Board glowing border */}
            {/* @ts-ignore */}
            <a-ring radius-inner="2.38" radius-outer="2.4" scale="1 0.45 1" color="#06b6d4" opacity="0.6" material="shader: flat"></a-ring>

            {/* Smartboard Header */}
            {/* @ts-ignore */}
            <a-text
              value="TODAY'S TOPIC"
              align="left"
              width="2.2"
              color="#06b6d4"
              position="-2.0 0.8 0.01"
              font="klykov"
            ></a-text>

            {/* Topic title */}
            {/* @ts-ignore */}
            <a-text
              value={resource.title}
              align="left"
              width="3.8"
              color="#f43f5e"
              position="-2.0 0.5 0.01"
              font="klykov"
            ></a-text>

            {/* Lecture subtitle text */}
            {/* @ts-ignore */}
            <a-text
              value={tutorText.length > 180 ? tutorText.slice(0, 180) + '...' : tutorText}
              align="left"
              width="2.6"
              color="#ffffff"
              position="-2.0 -0.1 0.01"
              wrap-count="36"
            ></a-text>

            {/* Status bar */}
            {/* @ts-ignore */}
            <a-text
              value={isAiSpeaking ? "• AI TUTOR ONLINE & LECTURING" : "• LISTENING FOR QUESTIONS..."}
              align="left"
              width="1.8"
              color={isAiSpeaking ? "#a855f7" : "#10b981"}
              position="-2.0 -0.75 0.01"
              font="klykov"
            ></a-text>

            {/* Concept select helper */}
            {/* @ts-ignore */}
            <a-text
              value="Gaze select on left panel to change topic"
              align="left"
              width="1.4"
              color="#64748b"
              position="-2.0 -0.88 0.01"
            ></a-text>
          </a-plane>

          {/* Integrated 3D Hologram Projection Field (Right side of the Smartboard) */}
          {/* @ts-ignore */}
          <a-entity position="1.1 0 0.1">
            {/* Projection base ring */}
            {/* @ts-ignore */}
            <a-ring radius-inner="0.32" radius-outer="0.34" rotation="90 0 0" position="0 -0.75 0" color="#06b6d4" opacity="0.8" material="shader: flat"></a-ring>
            
            {/* Light beam cylinder */}
            {/* @ts-ignore */}
            <a-cylinder radius="0.32" height="1.3" position="0 -0.1 0" material="shader: flat; transparent: true; opacity: 0.06; color: #06b6d4; side: double"></a-cylinder>

            {/* Dynamic projected 3D organ model */}
            {renderOrganModel(activeModel, '#06b6d4', '0 -0.1 0')}

            {/* Floating label above the projected model */}
            {/* @ts-ignore */}
            <a-entity look-at-camera position="0 0.65 0">
              {/* @ts-ignore */}
              <a-plane width="0.65" height="0.14" material="shader: flat; color: #05030a; transparent: true; opacity: 0.85">
                {/* @ts-ignore */}
                <a-text value={activeModel} align="center" width="1.8" color="#06b6d4" font="klykov"></a-text>
              </a-plane>
            </a-entity>
          </a-entity>
        </a-entity>


        {/* ── LEFT HUD PANEL: AI Tutor profile deck ── */}
        {/* @ts-ignore */}
        <a-entity position="-2.2 1.4 -2.8" rotation="0 25 0">
          {/* HUD Backing */}
          {/* @ts-ignore */}
          <a-plane width="1.0" height="1.4" material="shader: flat; color: #020205; transparent: true; opacity: 0.85; side: double">
            {/* Trim */}
            {/* @ts-ignore */}
            <a-ring radius-inner="0.7" radius-outer="0.71" scale="1 1.4 1" color="#06b6d4" opacity="0.3" material="shader: flat"></a-ring>

            {/* Profile Avatar icon representation */}
            {/* @ts-ignore */}
            <a-circle radius="0.08" position="-0.3 0.5 0.01" color="#1e293b">
              {/* @ts-ignore */}
              <a-text value="T" width="1.2" color="#06b6d4" align="center"></a-text>
            </a-circle>
            
            {/* Profile Header */}
            {/* @ts-ignore */}
            <a-text value="AI TUTOR" width="2.4" color="#06b6d4" position="-0.12 0.5 0.01" font="klykov"></a-text>
            {/* @ts-ignore */}
            <a-text value="Online" width="1.8" color="#10b981" position="-0.12 0.38 0.01"></a-text>
            {/* @ts-ignore */}
            <a-sphere radius="0.01" position="-0.18 0.38 0.015" color="#10b981"></a-sphere>

            {/* Quick profile bio/status */}
            {/* @ts-ignore */}
            <a-text 
              value="Hello! I am your visual anatomical assistant. Speak to me or select concepts to project 3D details on the holographic Smartboard." 
              width="1.7" 
              color="#94a3b8" 
              position="-0.4 0.05 0.01" 
              wrap-count="24"
            ></a-text>

            {/* Glowing Soundwave Visualizer (6 bars pulsing dynamically when AI talks) */}
            {/* @ts-ignore */}
            <a-box width="0.02" height="0.1" depth="0.02" position="-0.2 -0.45 0.01" color="#06b6d4" animation={isAiSpeaking ? "property: scale; to: 1 3 1; dir: alternate; loop: true; dur: 200" : ""} pointer-events="none"></a-box>
            {/* @ts-ignore */}
            <a-box width="0.02" height="0.1" depth="0.02" position="-0.12 -0.45 0.01" color="#06b6d4" animation={isAiSpeaking ? "property: scale; to: 1 4.5 1; dir: alternate; loop: true; dur: 250" : ""} pointer-events="none"></a-box>
            {/* @ts-ignore */}
            <a-box width="0.02" height="0.1" depth="0.02" position="-0.04 -0.45 0.01" color="#06b6d4" animation={isAiSpeaking ? "property: scale; to: 1 2 1; dir: alternate; loop: true; dur: 180" : ""} pointer-events="none"></a-box>
            {/* @ts-ignore */}
            <a-box width="0.02" height="0.1" depth="0.02" position="0.04 -0.45 0.01" color="#06b6d4" animation={isAiSpeaking ? "property: scale; to: 1 3.5 1; dir: alternate; loop: true; dur: 220" : ""} pointer-events="none"></a-box>
            {/* @ts-ignore */}
            <a-box width="0.02" height="0.1" depth="0.02" position="0.12 -0.45 0.01" color="#06b6d4" animation={isAiSpeaking ? "property: scale; to: 1 4 1; dir: alternate; loop: true; dur: 260" : ""} pointer-events="none"></a-box>
            {/* @ts-ignore */}
            <a-box width="0.02" height="0.1" depth="0.02" position="0.2 -0.45 0.01" color="#06b6d4" animation={isAiSpeaking ? "property: scale; to: 1 2.5 1; dir: alternate; loop: true; dur: 200" : ""} pointer-events="none"></a-box>
          </a-plane>
        </a-entity>


        {/* ── RIGHT HUD PANEL: Classroom / Peers Online List ── */}
        {/* @ts-ignore */}
        <a-entity position="2.2 1.4 -2.8" rotation="0 -25 0">
          {/* HUD Backing */}
          {/* @ts-ignore */}
          <a-plane width="1.0" height="1.4" material="shader: flat; color: #020205; transparent: true; opacity: 0.85; side: double">
            {/* Trim */}
            {/* @ts-ignore */}
            <a-ring radius-inner="0.7" radius-outer="0.71" scale="1 1.4 1" color="#06b6d4" opacity="0.3" material="shader: flat"></a-ring>

            {/* Header */}
            {/* @ts-ignore */}
            <a-text value="CLASSROOM" width="2.4" color="#06b6d4" position="0 0.55 0.01" align="center" font="klykov"></a-text>
            {/* @ts-ignore */}
            <a-text value="12 Students Online" width="1.6" color="#10b981" position="0 0.42 0.01" align="center"></a-text>

            {/* Peer rows */}
            {/* Alex */}
            {/* @ts-ignore */}
            <a-circle radius="0.02" position="-0.3 0.24 0.01" color="#1e293b"></a-circle>
            {/* @ts-ignore */}
            <a-text value="Alex" width="1.8" color="#ffffff" position="-0.2 0.24 0.01"></a-text>
            {/* @ts-ignore */}
            <a-sphere radius="0.01" position="0.3 0.24 0.015" color="#10b981"></a-sphere>

            {/* Sam */}
            {/* @ts-ignore */}
            <a-circle radius="0.02" position="-0.3 0.12 0.01" color="#1e293b"></a-circle>
            {/* @ts-ignore */}
            <a-text value="Sam" width="1.8" color="#ffffff" position="-0.2 0.12 0.01"></a-text>
            {/* @ts-ignore */}
            <a-sphere radius="0.01" position="0.3 0.12 0.015" color="#10b981"></a-sphere>

            {/* Taylor */}
            {/* @ts-ignore */}
            <a-circle radius="0.02" position="-0.3 0.0 0.01" color="#1e293b"></a-circle>
            {/* @ts-ignore */}
            <a-text value="Taylor" width="1.8" color="#ffffff" position="-0.2 0.0 0.01"></a-text>
            {/* @ts-ignore */}
            <a-sphere radius="0.01" position="0.3 0.0 0.015" color="#10b981"></a-sphere>

            {/* Jordan */}
            {/* @ts-ignore */}
            <a-circle radius="0.02" position="-0.3 -0.12 0.01" color="#1e293b"></a-circle>
            {/* @ts-ignore */}
            <a-text value="Jordan" width="1.8" color="#ffffff" position="-0.2 -0.12 0.01"></a-text>
            {/* @ts-ignore */}
            <a-sphere radius="0.01" position="0.3 -0.12 0.015" color="#10b981"></a-sphere>

            {/* Riley */}
            {/* @ts-ignore */}
            <a-circle radius="0.02" position="-0.3 -0.24 0.01" color="#1e293b"></a-circle>
            {/* @ts-ignore */}
            <a-text value="Riley" width="1.8" color="#ffffff" position="-0.2 -0.24 0.01"></a-text>
            {/* @ts-ignore */}
            <a-sphere radius="0.01" position="0.3 -0.24 0.015" color="#10b981"></a-sphere>

            {/* +6 more label */}
            {/* @ts-ignore */}
            <a-text value="+ 7 more online" width="1.6" color="#06b6d4" position="0 -0.42 0.01" align="center"></a-text>
          </a-plane>
        </a-entity>


        {/* ── LOWER LEFT HUD: Lesson Progress Card ── */}
        {/* @ts-ignore */}
        <a-entity position="-1.8 0.55 -2.2" rotation="-15 20 0">
          {/* Backing */}
          {/* @ts-ignore */}
          <a-plane width="0.75" height="0.5" material="shader: flat; color: #020205; transparent: true; opacity: 0.85; side: double">
            {/* Trim */}
            {/* @ts-ignore */}
            <a-ring radius-inner="0.3" radius-outer="0.31" scale="1 0.66 1" color="#06b6d4" opacity="0.3" material="shader: flat"></a-ring>

            {/* Header */}
            {/* @ts-ignore */}
            <a-text value="LESSON PROGRESS" width="1.6" color="#06b6d4" position="0 0.18 0.01" align="center" font="klykov"></a-text>

            {/* Progress Circular Dial Ring */}
            {/* @ts-ignore */}
            <a-ring radius-inner="0.1" radius-outer="0.12" position="-0.16 -0.06 0.01" color="#1e293b" material="shader: flat"></a-ring>
            {/* @ts-ignore */}
            <a-ring radius-inner="0.1" radius-outer="0.125" theta-length="162" position="-0.16 -0.06 0.015" color="#06b6d4" material="shader: flat"></a-ring>
            {/* Progress text */}
            {/* @ts-ignore */}
            <a-text value="45%" width="2.2" color="#ffffff" position="-0.16 -0.06 0.02" align="center" font="klykov"></a-text>

            {/* Side Progress Status */}
            {/* @ts-ignore */}
            <a-text value="Completed" width="1.6" color="#94a3b8" position="0.18 -0.04 0.01" align="center"></a-text>
            {/* @ts-ignore */}
            <a-text value="Keep it up!" width="1.4" color="#10b981" position="0.18 -0.15 0.01" align="center"></a-text>
          </a-plane>
        </a-entity>


        {/* ── LOWER RIGHT HUD: Next Up Topic Deck ── */}
        {/* @ts-ignore */}
        <a-entity position="1.8 0.55 -2.2" rotation="-15 -20 0">
          {/* Backing */}
          {/* @ts-ignore */}
          <a-plane width="0.75" height="0.5" material="shader: flat; color: #020205; transparent: true; opacity: 0.85; side: double">
            {/* Trim */}
            {/* @ts-ignore */}
            <a-ring radius-inner="0.3" radius-outer="0.31" scale="1 0.66 1" color="#06b6d4" opacity="0.3" material="shader: flat"></a-ring>

            {/* Header */}
            {/* @ts-ignore */}
            <a-text value="NEXT UP" width="1.6" color="#06b6d4" position="0 0.18 0.01" align="center" font="klykov"></a-text>

            {/* Topic item */}
            {/* @ts-ignore */}
            <a-text value="DNA & Genes" width="1.8" color="#ffffff" position="0 -0.04 0.01" align="center" font="klykov"></a-text>
            {/* @ts-ignore */}
            <a-text value="15 min duration" width="1.4" color="#64748b" position="0 -0.16 0.01" align="center"></a-text>

            {/* Decorative rotating DNA model inside a small project space */}
            {/* @ts-ignore */}
            <a-entity position="0 0.08 0.015" animation="property: rotation; to: 0 360 0; loop: true; dur: 8000; easing: linear">
              {/* @ts-ignore */}
              <a-sphere radius="0.015" position="-0.15 0 0" color="#a855f7"></a-sphere>
              {/* @ts-ignore */}
              <a-sphere radius="0.015" position="-0.08 0.03 0.03" color="#06b6d4"></a-sphere>
              {/* @ts-ignore */}
              <a-sphere radius="0.015" position="0 0.05 0.05" color="#a855f7"></a-sphere>
              {/* @ts-ignore */}
              <a-sphere radius="0.015" position="0.08 0.03 0.03" color="#06b6d4"></a-sphere>
              {/* @ts-ignore */}
              <a-sphere radius="0.015" position="0.15 0 0" color="#a855f7"></a-sphere>
              {/* @ts-ignore */}
              <a-cylinder radius="0.002" height="0.35" rotation="0 0 90" color="#ffffff" opacity="0.3"></a-cylinder>
            </a-entity>
          </a-plane>
        </a-entity>


        {/* ── CONCEPTS SELECT MENU: Curving on the left side ── */}
        {/* @ts-ignore */}
        <a-entity position="-1.7 0.6 -2.4" rotation="0 20 0">
          {/* Menu Backing plate */}
          {/* @ts-ignore */}
          <a-plane
            width="0.8"
            height="1.0"
            material="shader: flat; color: #020205; transparent: true; opacity: 0.85; side: double"
          >
            {/* Border */}
            {/* @ts-ignore */}
            <a-ring radius-inner="0.5" radius-outer="0.51" scale="1 1.25 1" color="#06b6d4" opacity="0.4" material="shader: flat"></a-ring>

            {/* Title */}
            {/* @ts-ignore */}
            <a-text
              value="LESSON CONCEPTS"
              align="center"
              width="1.8"
              color="#06b6d4"
              position="0 0.4 0.01"
              font="klykov"
            ></a-text>

            {/* Menu List of concepts */}
            {concepts.map((concept: any, idx: number) => {
              const buttonY = 0.22 - idx * 0.12
              const isSelected = activeModel === concept.label
              return (
                // @ts-ignore
                <a-plane
                  key={concept.id}
                  class="raycastable"
                  width="0.7"
                  height="0.09"
                  position={`0 ${buttonY} 0.02`}
                  material={`shader: flat; color: ${isSelected ? '#f43f5e' : '#0c0a12'}; transparent: true; opacity: 0.90`}
                  menu-trigger={`label: ${concept.label}; desc: ${concept.description}`}
                >
                  {/* Glowing active indicator */}
                  {isSelected && (
                    // @ts-ignore
                    <a-sphere radius="0.012" position="-0.30 0 0.01" color="#ffffff" material="shader: flat"></a-sphere>
                  )}
                  {/* @ts-ignore */}
                  <a-text
                    value={concept.label}
                    align="center"
                    width="1.5"
                    color="#ffffff"
                    position="0 0 0.01"
                  ></a-text>
                </a-plane>
              )
            })}
          </a-plane>
        </a-entity>


        {/* ── COCKPIT BOTTOM CONSOLE / DASHBOARD (Curving in front of user) ── */}
        {/* @ts-ignore */}
        <a-entity position="0 -0.42 -1.2" rotation="-38 0 0">
          {/* Curved Desk backing panel */}
          {/* @ts-ignore */}
          <a-plane
            width="1.45"
            height="0.36"
            material="shader: flat; color: #020205; transparent: true; opacity: 0.92; side: double"
          >
            {/* Glowing neon ring runner */}
            {/* @ts-ignore */}
            <a-ring radius-inner="0.72" radius-outer="0.73" scale="1 0.25 1" color="#06b6d4" opacity="0.6" material="shader: flat"></a-ring>

            {/* Center Glowing dial core */}
            {/* @ts-ignore */}
            <a-sphere
              radius="0.07"
              position="0 0 0.03"
              color="#06b6d4"
              material="shader: flat; opacity: 0.9"
              animation="property: scale; to: 1.1 1.1 1.1; dir: alternate; loop: true; dur: 2000; easing: easeInOutSine"
            ></a-sphere>
            {/* @ts-ignore */}
            <a-ring radius-inner="0.085" radius-outer="0.10" position="0 0 0.035" color="#a855f7" opacity="0.8" material="shader: flat"></a-ring>

            {/* ── Left Console Controls ── */}
            {/* Mic Toggle button */}
            {/* @ts-ignore */}
            <a-plane
              class="raycastable"
              width="0.22"
              height="0.18"
              position="-0.38 0 0.02"
              material="shader: flat; color: #07050e; transparent: true; opacity: 0.85"
              console-btn="action: mic"
            >
              {/* @ts-ignore */}
              <a-sphere radius="0.012" position="-0.07 0.04 0.02" color={isMicMuted ? "#f43f5e" : "#10b981"} material="shader: flat"></a-sphere>
              {/* @ts-ignore */}
              <a-text value="Mic" width="1.8" color="#ffffff" position="0.01 0.04 0.02" align="center" font="klykov"></a-text>
              {/* @ts-ignore */}
              <a-text value={isMicMuted ? "MUTED" : "ACTIVE"} width="1.4" color={isMicMuted ? "#f43f5e" : "#10b981"} position="0 -0.05 0.02" align="center"></a-text>
            </a-plane>

            {/* Raise Hand button */}
            {/* @ts-ignore */}
            <a-plane
              class="raycastable"
              width="0.22"
              height="0.18"
              position="-0.15 0 0.02"
              material="shader: flat; color: #07050e; transparent: true; opacity: 0.85"
              console-btn="action: hand"
            >
              {/* @ts-ignore */}
              <a-sphere radius="0.012" position="-0.08 0.04 0.02" color={isHandRaised ? "#a855f7" : "#64748b"} material="shader: flat"></a-sphere>
              {/* @ts-ignore */}
              <a-text value="Hand" width="1.8" color="#ffffff" position="0.01 0.04 0.02" align="center" font="klykov"></a-text>
              {/* @ts-ignore */}
              <a-text value={isHandRaised ? "RAISED" : "OFF"} width="1.4" color={isHandRaised ? "#a855f7" : "#64748b"} position="0 -0.05 0.02" align="center"></a-text>
            </a-plane>

            {/* ── Right Console Controls ── */}
            {/* Ask AI button */}
            {/* @ts-ignore */}
            <a-plane
              class="raycastable"
              width="0.22"
              height="0.18"
              position="0.15 0 0.02"
              material="shader: flat; color: #07050e; transparent: true; opacity: 0.85"
              console-btn="action: ask"
            >
              {/* @ts-ignore */}
              <a-sphere radius="0.012" position="-0.08 0.04 0.02" color="#06b6d4" material="shader: flat"></a-sphere>
              {/* @ts-ignore */}
              <a-text value="Ask AI" width="1.8" color="#ffffff" position="0.01 0.04 0.02" align="center" font="klykov"></a-text>
              {/* @ts-ignore */}
              <a-text value="TRIGGER" width="1.4" color="#06b6d4" position="0 -0.05 0.02" align="center"></a-text>
            </a-plane>

            {/* Study Notes Toggle button */}
            {/* @ts-ignore */}
            <a-plane
              class="raycastable"
              width="0.22"
              height="0.18"
              position="0.38 0 0.02"
              material="shader: flat; color: #07050e; transparent: true; opacity: 0.85"
              console-btn="action: notes"
            >
              {/* @ts-ignore */}
              <a-sphere radius="0.012" position="-0.08 0.04 0.02" color={showNotesOverlay ? "#a855f7" : "#64748b"} material="shader: flat"></a-sphere>
              {/* @ts-ignore */}
              <a-text value="Notes" width="1.8" color="#ffffff" position="0.01 0.04 0.02" align="center" font="klykov"></a-text>
              {/* @ts-ignore */}
              <a-text value={showNotesOverlay ? "OPEN" : "CLOSED"} width="1.4" color={showNotesOverlay ? "#a855f7" : "#64748b"} position="0 -0.05 0.02" align="center"></a-text>
            </a-plane>
          </a-plane>
        </a-entity>


        {/* ── FLOATING NOTES OVERLAY BOARD (Materializes in front when Notes is clicked) ── */}
        {showNotesOverlay && (
          // @ts-ignore
          <a-entity look-at-camera position="0 1.6 -1.8">
            {/* Overlay card */}
            {/* @ts-ignore */}
            <a-plane width="1.5" height="1.1" material="shader: flat; color: #020106; transparent: false; side: double">
              {/* Glowing outline */}
              {/* @ts-ignore */}
              <a-ring radius-inner="0.65" radius-outer="0.66" scale="1 1.45 1" color="#a855f7" opacity="0.8" material="shader: flat"></a-ring>
              
              {/* Header */}
              {/* @ts-ignore */}
              <a-text value="STUDY NOTES TEXTBOOK" align="center" width="2.0" color="#a855f7" position="0 0.45 0.01" font="klykov"></a-text>
              {/* @ts-ignore */}
              <a-text value={resource.title} align="center" width="1.8" color="#06b6d4" position="0 0.35 0.01" font="klykov"></a-text>

              {/* Notes content (Truncated to fit layout beautifully) */}
              {/* @ts-ignore */}
              <a-text
                value={resource.content ? resource.content.slice(0, 360) + '...' : 'No notes written for this kit. Speak to the AI tutor to write notes!'}
                align="left"
                width="1.35"
                color="#ffffff"
                position="-0.65 0.02 0.01"
                wrap-count="28"
              ></a-text>

              {/* Close Button */}
              {/* @ts-ignore */}
              <a-plane
                class="raycastable"
                width="0.30"
                height="0.11"
                position="0 -0.42 0.02"
                material="shader: flat; color: #f43f5e"
                console-btn="action: notes"
              >
                {/* @ts-ignore */}
                <a-text value="CLOSE NOTES" align="center" width="1.6" color="#ffffff" position="0 0 0.01"></a-text>
              </a-plane>
            </a-plane>
          </a-entity>
        )}


        {/* ── VR First-Person Camera with center locked Cursor ── */}
        {/* @ts-ignore */}
        <a-camera look-controls wasd-controls position="0 1.6 0.5">
          {/* @ts-ignore */}
          <a-cursor
            raycaster="objects: .raycastable"
            fuse="true"
            fuse-timeout="1200"
            color="#f43f5e"
            scale="0.6 0.6 0.6"
            animation__fusing="property: scale; startEvents: fusing; easing: easeInQuad; dur: 1200; from: 0.6 0.6 0.6; to: 0.15 0.15 0.15"
            animation__leave="property: scale; startEvents: mouseleave; easing: easeOutQuad; dur: 400; to: 0.6 0.6 0.6"
          ></a-cursor>
        </a-camera>

      {/* @ts-ignore */}
      </a-scene>
    </div>
  )
}
