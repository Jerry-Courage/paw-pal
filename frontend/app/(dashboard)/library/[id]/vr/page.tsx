'use client'

import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, getAuthToken, API_BASE } from '@/lib/api'
import type { SceneSpec } from '@/lib/vr/sceneSpec'
import { createXRStore } from '@react-three/xr'
import { Loader2, ChevronLeft, ChevronRight, Sparkles, Mic, MicOff, Volume2, VolumeX, X, BookOpen, Brain, HelpCircle, CheckCircle2, Circle, Navigation, Glasses } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

// XR store — module level so it persists across renders
const xrStore = createXRStore({
  controller: true,
  hand: false,
  gaze: false,
  emulate: false,
  frameRate: 'high',
  foveation: 0.5,
  domOverlay: true,
  offerSession: false,
})

interface VRNode {
  id: string
  label: string
  description: string
  color: string
  sketchfab_keyword?: string
}

interface VRLayout {
  nodes: VRNode[]
}

interface SketchfabResult {
  found: boolean
  uid?: string
  embed_url?: string
}

async function fetchSketchfabModel(keyword: string): Promise<SketchfabResult> {
  const token = await getAuthToken()
  const res = await fetch(
    `${API_BASE}/library/sketchfab-model/?q=${encodeURIComponent(keyword)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return { found: false }
  return res.json()
}

// Lazy-load the 3D scene renderer (client-only, SSR-safe)
const SceneRenderer = lazy(() => import('@/components/vr/SceneRenderer'))
const ConceptDetailPanel = lazy(() => import('@/components/vr/ConceptDetailPanel'))
const EnterVRButton = lazy(() => import('@/components/vr/EnterVRButton'))
const VRSpatialPanel = lazy(() => import('@/components/vr/VRSpatialPanel'))

export default function VRPage({ params }: { params: { id: string } }) {
  const resourceId = params.id
  const [activeNode, setActiveNode] = useState<VRNode | null>(null)
  const [modelUrl, setModelUrl] = useState<string | null>(null)
  const [loadingModel, setLoadingModel] = useState(false)
  const [sessionActive, setSessionActive] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [transcript, setTranscript] = useState('Tap a concept to begin...')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [vrMode, setVrMode] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [nodeIndex, setNodeIndex] = useState(0)
  const [r3fFailed, setR3fFailed] = useState(false)
  const [selectedObject, setSelectedObject] = useState<{
    objectId: string
    conceptId: string
    assetId: string | null
    label: string
  } | null>(null)
  // Guided learning path state
  const [learningPathIndex, setLearningPathIndex] = useState(-1)
  const [guidedMode, setGuidedMode] = useState(false)
  // Explored state — set of concept IDs the student has selected
  const [exploredSet, setExploredSet] = useState<Set<string>>(new Set())

  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const nextPlayTimeRef = useRef(0)
  const speakingTimerRef = useRef<any>(null)
  const resumeIntervalRef = useRef<any>(null)

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(Number(resourceId)).then(r => r.data),
  })

  // Fetch AI-generated SceneSpec (or null if not generated yet)
  const { data: sceneData, isLoading: sceneLoading } = useQuery<SceneSpec>({
    queryKey: ['scene', resourceId],
    queryFn: async () => {
      const token = await getAuthToken()
      const res = await fetch(`${API_BASE}/library/resources/${resourceId}/scene/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      return res.json()
    },
    enabled: !!resourceId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const { data: vrLayout, isLoading, refetch: refetchLayout } = useQuery<VRLayout>({
    queryKey: ['vr-layout', resourceId],
    queryFn: async () => {
      const token = await getAuthToken()
      const res = await fetch(`${API_BASE}/library/resources/${resourceId}/vr-layout/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('VR layout unavailable')
      return res.json()
    },
    enabled: !!resourceId,
    retry: false,
  })

  const refreshLayout = async () => {
    const token = await getAuthToken()
    await fetch(`${API_BASE}/library/resources/${resourceId}/vr-layout/?refresh=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    setActiveNode(null)
    setModelUrl(null)
    refetchLayout()
    toast.success('Regenerating VR concepts...')
  }
  const loadModel = useCallback(async (node: VRNode) => {
    setActiveNode(node)
    setModelUrl(null)
    setLoadingModel(true)
    try {
      const result = await fetchSketchfabModel(node.sketchfab_keyword || node.label)
      if (result.found && result.embed_url) setModelUrl(result.embed_url)
    } catch { /* no model found */ }
    finally { setLoadingModel(false) }
  }, [])

  // ── Guided Learning Path ─────────────────────────────────────────────
  const learningPath = sceneData?.learningPath || []
  const totalPathSteps = learningPath.length

  // ── Explored State ───────────────────────────────────────────────────
  const markExplored = useCallback((conceptId: string) => {
    setExploredSet(prev => {
      const next = new Set(prev)
      next.add(conceptId)
      return next
    })
  }, [])

  // Auto-load first node
  useEffect(() => {
    if (vrLayout?.nodes?.length && !activeNode) {
      loadModel(vrLayout.nodes[0])
    }
  }, [vrLayout, activeNode, loadModel])

  // Play AI audio
  const playAudioChunk = useCallback((b64: string) => {
    if (isMuted) return
    const ctx = audioCtxRef.current || new AudioContext()
    audioCtxRef.current = ctx
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const i16 = new Int16Array(bytes.buffer)
    const f32 = new Float32Array(i16.length)
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768
    const buf = ctx.createBuffer(1, f32.length, 24000)
    buf.copyToChannel(f32, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current)
    src.start(startAt)
    nextPlayTimeRef.current = startAt + buf.duration
    setIsSpeaking(true)
    clearTimeout(speakingTimerRef.current)
    speakingTimerRef.current = setTimeout(() => setIsSpeaking(false),
      (nextPlayTimeRef.current - ctx.currentTime) * 1000 + 500)
  }, [isMuted])

  // Connect WebSocket AI tutor
  const startSession = useCallback(async () => {
    if (sessionActive || isConnecting) return
    setIsConnecting(true)
    let micStream: MediaStream | null = null
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = micStream
    } catch {
      toast.error('Mic access needed for AI tutor')
      setIsConnecting(false)
      return
    }
    try {
      const token = await getAuthToken()
      const backendHost = (API_BASE || '').replace(/^https?:\/\//, '').replace(/\/api\/?$/, '')
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${backendHost}/ws/vr/${resourceId}/?token=${token}`)
      wsRef.current = ws

      ws.onopen = () => {
        const kit = resource?.ai_notes_json || {}
        const sections = (kit.sections || []).slice(0, 8)
        const context = sections.map((s: any) => `${s.title}: ${s.content?.slice(0, 200)}`).join('\n')
        ws.send(JSON.stringify({
          type: 'start',
          resource_title: resource?.title || '',
          resource_context: context,
          current_concept: activeNode?.label || '',
        }))
      }

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'ready') { setSessionActive(true); setIsConnecting(false) }
        if (msg.type === 'audio') playAudioChunk(msg.data)
        if (msg.type === 'transcript') setTranscript(msg.text)
        if (msg.type === 'error') { toast.error(msg.message); setIsConnecting(false) }
      }
      ws.onclose = () => { setSessionActive(false); setIsConnecting(false) }
      ws.onerror = () => { toast.error('AI tutor connection failed'); setIsConnecting(false) }

      // Mic processor
      const ctx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = ctx
      const src = ctx.createMediaStreamSource(micStream)
      const proc = ctx.createScriptProcessor(2048, 1, 1)
      processorRef.current = proc
      const resumeCtx = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}) }
      resumeIntervalRef.current = setInterval(resumeCtx, 500)
      proc.onaudioprocess = (ev) => {
        if (isMicMuted || ws.readyState !== WebSocket.OPEN) return
        if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return }
        const f32 = ev.inputBuffer.getChannelData(0)
        const i16 = new Int16Array(f32.length)
        for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768))
        const bytes = new Uint8Array(i16.buffer)
        let bin = ''
        for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
        ws.send(JSON.stringify({ type: 'audio', data: btoa(bin) }))
      }
      const silentGain = ctx.createGain()
      silentGain.gain.value = 0
      src.connect(proc)
      proc.connect(silentGain)
      silentGain.connect(ctx.destination)
    } catch (err) {
      toast.error('Failed to start AI session')
      setIsConnecting(false)
    }
  }, [sessionActive, isConnecting, resourceId, resource, activeNode, isMicMuted, playAudioChunk])

  const endSession = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'end' }))
    wsRef.current?.close()
    processorRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())
    clearInterval(resumeIntervalRef.current)
    setSessionActive(false)
    setTranscript('Session ended. Tap a concept to continue.')
  }, [])

  useEffect(() => () => { endSession() }, [endSession])

  // Notify AI when concept changes
  useEffect(() => {
    if (activeNode && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'concept_changed',
        concept: activeNode.label,
        description: activeNode.description,
      }))
    }
  }, [activeNode])

  // Navigate concepts
  const nodes = vrLayout?.nodes || []
  const goNext = () => {
    if (!nodes.length) return
    const next = (nodeIndex + 1) % nodes.length
    setNodeIndex(next)
    loadModel(nodes[next])
  }
  const goPrev = () => {
    if (!nodes.length) return
    const prev = (nodeIndex - 1 + nodes.length) % nodes.length
    setNodeIndex(prev)
    loadModel(nodes[prev])
  }

  // ── Guided Learning Path (after nodes declaration) ────────────────────
  const navigatePath = useCallback((direction: 'prev' | 'next') => {
    if (totalPathSteps === 0) return
    const currentIndex = learningPathIndex
    let newIndex: number
    if (direction === 'next') {
      newIndex = currentIndex < totalPathSteps - 1 ? currentIndex + 1 : currentIndex
    } else {
      newIndex = currentIndex > 0 ? currentIndex - 1 : 0
    }
    setLearningPathIndex(newIndex)
    const objectId = learningPath[newIndex]
    const sceneObj = sceneData?.objects.find(o => o.id === objectId)
    if (sceneObj) {
      setSelectedObject({
        objectId: sceneObj.id,
        conceptId: sceneObj.conceptId,
        assetId: sceneObj.assetId,
        label: sceneObj.label,
      })
      const idx = nodes.findIndex(n => n.id === sceneObj.conceptId)
      if (idx >= 0) {
        setNodeIndex(idx)
        loadModel(nodes[idx])
      }
    }
  }, [learningPathIndex, totalPathSteps, learningPath, sceneData, nodes, loadModel])

  const exploredCount = exploredSet.size
  const totalConcepts = sceneData?.objects?.length || nodes.length

  if (isLoading) return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
    </div>
  )

  // ── VR MODE (Google Cardboard stereo split-screen) ──────────────────────────
  if (vrMode) return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      {/* Stereo split: left eye | right eye */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        {/* Divider line */}
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: '#111', zIndex: 10 }} />

        {[0, 1].map((eye) => (
          <div key={eye} style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {modelUrl ? (
              <iframe
                src={modelUrl + '&ui_vr=0&autostart=1&ui_infos=0&ui_watermark=0&ui_stop=0&camera=0'}
                style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                allow="autoplay; fullscreen; xr-spatial-tracking"
              />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: 'radial-gradient(ellipse at 40% 40%, #1e1b4b 0%, #050816 70%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 16,
              }}>
                <div style={{ position: 'relative', width: 120, height: 120 }}>
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: `2px solid ${activeNode?.color || '#6366f1'}40`,
                    animation: 'spin 4s linear infinite',
                  }} />
                  <div style={{
                    position: 'absolute', inset: 16, borderRadius: '50%',
                    border: `2px solid ${activeNode?.color || '#6366f1'}60`,
                    animation: 'spin 3s linear infinite reverse',
                  }} />
                  <div style={{
                    position: 'absolute', inset: 32, borderRadius: '50%',
                    background: `radial-gradient(circle, ${activeNode?.color || '#6366f1'}80, ${activeNode?.color || '#6366f1'}20)`,
                    animation: 'pulse 2s ease-in-out infinite',
                  }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700, margin: 0 }}>{activeNode?.label}</p>
                  <p style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>Searching for 3D model...</p>
                </div>
              </div>
            )}

            <div style={{
              position: 'absolute', bottom: 80, left: 0, right: 0,
              textAlign: 'center', padding: '0 20px',
            }}>
              <div style={{
                display: 'inline-block',
                background: 'rgba(0,0,0,0.7)',
                border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: 12,
                padding: '8px 20px',
                color: '#e2e8f0',
                fontSize: 16,
                fontWeight: 600,
              }}>
                {activeNode?.label || 'Loading...'}
              </div>
            </div>

            {isSpeaking && (
              <div style={{
                position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', gap: 3, alignItems: 'flex-end', height: 20,
              }}>
                {[0.4,0.8,1,0.6,0.9,0.5].map((h, i) => (
                  <div key={i} style={{
                    width: 3, background: '#6366f1', borderRadius: 2,
                    height: `${h * 100}%`,
                    animation: `wave ${0.4 + i * 0.08}s ease-in-out infinite alternate`,
                  }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 12, zIndex: 20, alignItems: 'center',
      }}>
        <button onClick={goPrev} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
        <button onClick={() => setIsMicMuted(m => !m)} style={{ width: 44, height: 44, borderRadius: '50%', background: isMicMuted ? 'rgba(244,63,94,0.8)' : 'rgba(16,185,129,0.8)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button onClick={() => setVrMode(false)} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} />
        </button>
        <button onClick={() => setIsMuted(m => !m)} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button onClick={goNext} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
      </div>

      <style>{`
        @keyframes wave { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }
      `}</style>
    </div>
  )

  // ── NORMAL VIEW (pre-VR setup + concept browser + 3D canvas) ────────────────
  return (
    <div className="fixed inset-0 bg-[#050816] flex flex-col overflow-hidden">
      <style>{`
        @keyframes wave { from { transform: scaleY(0.3); } to { transform: scaleY(1); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        @keyframes glow { 0%,100% { box-shadow:0 0 10px rgba(99,102,241,0.3); } 50% { box-shadow:0 0 30px rgba(99,102,241,0.7); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-indigo-500/20 bg-black/60 backdrop-blur shrink-0 tool-header-safe">
        <Link href={`/library/${resourceId}`} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-indigo-300 text-xs font-black uppercase tracking-widest">VR Classroom</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshLayout} className="text-slate-600 hover:text-slate-400 text-xs transition-colors" title="Regenerate concepts">
            ↺ Refresh
          </button>
          <div className="text-slate-500 text-xs max-w-48 truncate">{resource?.title}</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* Left: Concept list */}
        <div className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-indigo-500/15 flex flex-col bg-black/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-indigo-500/10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Concepts</p>
              <button onClick={refreshLayout}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-black transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-indigo-500/10">
                ↺ Refresh
              </button>
            </div>
            {/* AI tutor card */}
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-3 mb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg shrink-0"
                  style={{ animation: isSpeaking ? 'glow 1.5s ease-in-out infinite' : 'none' }}>
                  🤖
                </div>
                <div>
                  <p className="text-xs font-black text-white">AI Tutor</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${sessionActive ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className={`text-[10px] font-medium ${sessionActive ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {isConnecting ? 'Connecting...' : sessionActive ? 'Live' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
              {/* Waveform */}
              {isSpeaking && (
                <div className="flex items-end gap-0.5 h-5 mb-2">
                  {[0.3,0.7,1,0.5,0.9,0.4,0.8,0.6,1,0.7].map((h, i) => (
                    <div key={i} className="flex-1 bg-indigo-400 rounded-sm"
                      style={{ height: `${h*100}%`, animation: `wave ${0.3+i*0.07}s ease-in-out ${i*0.05}s infinite alternate` }} />
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-300 leading-relaxed bg-black/30 rounded-xl px-3 py-2 min-h-[40px]">
                {transcript}
              </p>
              <div className="flex gap-2 mt-2">
                {!sessionActive ? (
                  <button onClick={startSession} disabled={isConnecting}
                    className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-[11px] font-black hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center justify-center gap-1">
                    {isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {isConnecting ? 'Connecting...' : 'Start Tutor'}
                  </button>
                ) : (
                  <>
                    <button onClick={() => setIsMicMuted(m => !m)}
                      className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 ${isMicMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                      {isMicMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                      {isMicMuted ? 'Muted' : 'Live'}
                    </button>
                    <button onClick={endSession}
                      className="px-3 py-2 rounded-xl bg-red-500/15 text-red-400 border border-red-500/25 text-[11px] font-black hover:bg-red-500/25 transition-all">
                      End
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Concept buttons */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {nodes.map((node, i) => (
              <button key={node.id} onClick={() => { setNodeIndex(i); loadModel(node) }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                  activeNode?.id === node.id
                    ? 'border-indigo-500/50 bg-indigo-500/15'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/5'
                }`}
                style={{ borderLeft: `3px solid ${node.color}` }}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: node.color }} />
                <span className="text-xs font-bold text-slate-200 truncate">{node.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Center: 3D canvas + VR launch */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* 3D Canvas area */}
          <div className="flex-1 relative">
            {r3fFailed ? (
              /* Fallback: Sketchfab iframe or concept display */
              <div className="absolute inset-0 flex items-center justify-center p-4">
                {!loadingModel && modelUrl && (
                  <div className="w-full h-full min-h-64 rounded-2xl overflow-hidden border border-indigo-500/20 shadow-2xl">
                    <iframe key={modelUrl} src={modelUrl} className="w-full h-full" style={{ border: 'none' }}
                      allow="autoplay; fullscreen; xr-spatial-tracking" allowFullScreen
                      onError={() => setModelUrl(null)}
                    />
                  </div>
                )}
                {!loadingModel && !modelUrl && activeNode && (
                  <div className="flex flex-col items-center gap-5 text-center px-6">
                    <div className="w-32 h-32 rounded-full flex items-center justify-center"
                      style={{ background: `radial-gradient(circle, ${activeNode.color}30, transparent)`, border: `2px solid ${activeNode.color}60` }}>
                      <div className="w-14 h-14 rounded-full" style={{ background: activeNode.color + '60' }} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white mb-2">{activeNode.label}</h3>
                      <p className="text-slate-400 text-sm leading-relaxed max-w-sm">{activeNode.description}</p>
                      <p className="text-slate-600 text-xs mt-4">No 3D model found for this concept yet.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Primary: R3F 3D Canvas */
              <div className="absolute inset-0">
                <Suspense fallback={
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0014]">
                    <Loader2 className="w-8 h-8 text-violet-400 animate-spin mb-3" />
                    <p className="text-violet-300/60 text-sm">Loading 3D engine...</p>
                  </div>
                }>
                  <SceneRenderer
                    scene={sceneData || null}
                    concepts={nodes.map(n => ({
                      id: n.id,
                      title: n.label,
                      description: n.description,
                      sketchfab_keyword: n.sketchfab_keyword,
                    }))}
                    selectedConceptId={activeNode?.id || selectedObject?.conceptId || null}
                    onConceptSelect={(id) => {
                      const idx = nodes.findIndex(n => n.id === id)
                      if (idx >= 0) {
                        setNodeIndex(idx)
                        loadModel(nodes[idx])
                      }
                      // Also update selected object from scene data
                      if (sceneData) {
                        const obj = sceneData.objects.find(o => o.conceptId === id)
                        if (obj) {
                          setSelectedObject({
                            objectId: obj.id,
                            conceptId: obj.conceptId,
                            assetId: obj.assetId,
                            label: obj.label,
                          })
                        }
                      }
                      markExplored(id)
                    }}
                    onObjectSelect={(event) => {
                      setSelectedObject(event)
                      const idx = nodes.findIndex(n => n.id === event.conceptId)
                      if (idx >= 0) {
                        setNodeIndex(idx)
                        loadModel(nodes[idx])
                      }
                      markExplored(event.conceptId)
                      // Sync guided path index if this object is in the path
                      const pathIdx = learningPath.indexOf(event.objectId)
                      if (pathIdx >= 0) setLearningPathIndex(pathIdx)
                    }}
                    resourceTitle={resource?.title}
                    resourceId={resourceId}
                    highlightedObjectId={guidedMode && learningPathIndex >= 0 ? learningPath[learningPathIndex] : null}
                    xrStore={xrStore}
                  >
                    {/* VRSpatialPanel must be INSIDE Canvas (uses drei Html) */}
                    {selectedObject && (
                      <VRSpatialPanel
                        object={selectedObject}
                        scene={sceneData}
                        learningPathIndex={learningPathIndex}
                        totalPathSteps={totalPathSteps}
                        exploredCount={exploredCount}
                        totalConcepts={totalConcepts}
                        onNext={guidedMode ? () => navigatePath('next') : undefined}
                        onPrev={guidedMode ? () => navigatePath('prev') : undefined}
                      />
                    )}
                  </SceneRenderer>
                </Suspense>
              </div>
            )}

            {/* R3F error fallback trigger */}
            {!r3fFailed && (
              <div className="hidden" data-r3f-fallback />
            )}

            {/* Interactive concept detail panel */}
            {selectedObject && (
              <ConceptDetailPanel
                object={selectedObject}
                scene={sceneData}
                learningPathIndex={learningPathIndex}
                totalPathSteps={totalPathSteps}
                onClose={() => setSelectedObject(null)}
                onAskFlowState={() => {
                  // Wire to voice tutor concept_changed
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                      type: 'concept_changed',
                      concept: selectedObject.label,
                      description: sceneData?.objects.find(o => o.id === selectedObject.objectId)?.description || '',
                    }))
                    toast.success('AI Tutor now focusing on this concept')
                  } else {
                    toast('Start the AI tutor to ask about this concept', { icon: '💡' })
                  }
                }}
              />
            )}
          </div>

          {/* Progress + Controls bar */}
          <div className="px-5 py-3 border-t border-indigo-500/15 bg-black/50 shrink-0">
            {/* Progress bar */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: totalConcepts > 0 ? `${(exploredCount / totalConcepts) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">
                {exploredCount}/{totalConcepts} explored
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              {/* Left: current concept info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-white font-black text-sm truncate">{activeNode?.label || 'Select a concept'}</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {guidedMode && learningPathIndex >= 0 && totalPathSteps > 0
                      ? `Step ${learningPathIndex + 1} / ${totalPathSteps}`
                      : `${nodes.length} concepts in this lesson`}
                  </p>
                </div>
              </div>

              {/* Center: guided learning controls */}
              {guidedMode && totalPathSteps > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigatePath('prev')}
                    disabled={learningPathIndex <= 0}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-300" />
                  </button>
                  <div className="flex gap-1">
                    {learningPath.map((_, i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          i === learningPathIndex
                            ? 'bg-violet-400'
                            : i < learningPathIndex
                              ? 'bg-violet-600'
                              : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => navigatePath('next')}
                    disabled={learningPathIndex >= totalPathSteps - 1}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </button>
                </div>
              )}

              {/* Right: buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {totalPathSteps > 0 && (
                  <button
                    onClick={() => {
                      setGuidedMode(!guidedMode)
                      if (!guidedMode && learningPathIndex < 0) {
                        setLearningPathIndex(0)
                        // Select first in path
                        const firstId = learningPath[0]
                        const obj = sceneData?.objects.find(o => o.id === firstId)
                        if (obj) {
                          setSelectedObject({
                            objectId: obj.id,
                            conceptId: obj.conceptId,
                            assetId: obj.assetId,
                            label: obj.label,
                          })
                        }
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${
                      guidedMode
                        ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    <Navigation className="w-3 h-3" />
                    {guidedMode ? 'Guided' : 'Guide'}
                  </button>
                )}
                {!r3fFailed && (
                  <span className="hidden sm:inline text-[10px] font-black text-violet-400 uppercase tracking-wider bg-violet-500/10 px-2 py-1 rounded-lg border border-violet-500/20">
                    3D
                  </span>
                )}
                <Suspense fallback={
                  <button disabled className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-sm text-white opacity-50 bg-violet-600">
                    <Glasses className="w-4 h-4" /> VR
                  </button>
                }>
                  <EnterVRButton xrStore={xrStore} />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
