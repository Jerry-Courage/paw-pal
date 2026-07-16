'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, getAuthToken, API_BASE } from '@/lib/api'
import {
  Loader2, ChevronLeft, Sparkles, AlertCircle, Mic, MicOff,
  Hand, BookOpen, MessageCircle, X, Maximize2, RotateCcw, Volume2, VolumeX,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface VRNode {
  id: string
  label: string
  description: string
  color: string
  type: string
  sketchfab_keyword?: string
}

interface VREdge {
  from: string
  to: string
  label: string
  color: string
}

interface VRLayout {
  nodes: VRNode[]
  edges: VREdge[]
}

interface SketchfabResult {
  found: boolean
  uid?: string
  embed_url?: string
  keyword?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helper: fetch Sketchfab model for a keyword
// ─────────────────────────────────────────────────────────────────────────────
async function fetchSketchfabModel(keyword: string): Promise<SketchfabResult> {
  const token = getAuthToken()
  const res = await fetch(
    `${API_BASE}/library/sketchfab-model/?q=${encodeURIComponent(keyword)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return { found: false }
  return res.json()
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock peers for the classroom panel
// ─────────────────────────────────────────────────────────────────────────────
const PEERS = ['Alex', 'Sam', 'Taylor', 'Jordan', 'Riley']

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function VRClassroomPage({ params }: { params: { id: string } }) {
  const [activeNode, setActiveNode] = useState<VRNode | null>(null)
  const [sketchfabUrl, setSketchfabUrl] = useState<string | null>(null)
  const [loadingModel, setLoadingModel] = useState(false)
  const [modelExpanded, setModelExpanded] = useState(false)

  // AI tutor state
  const [sessionActive, setSessionActive] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [aiTranscript, setAiTranscript] = useState<string>('Click a concept below to start learning...')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isHandRaised, setIsHandRaised] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  // WebSocket / audio refs
  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resource data
  const { data: resource, isLoading: resourceLoading } = useQuery({
    queryKey: ['resource', params.id],
    queryFn: () => libraryApi.getResource(Number(params.id)).then(res => res.data),
  })

  const { data: vrLayout, isLoading: layoutLoading } = useQuery<VRLayout>({
    queryKey: ['vr-layout', params.id],
    queryFn: async () => {
      const token = getAuthToken()
      const res = await fetch(`${API_BASE}/library/resources/${params.id}/vr-layout/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load VR layout')
      return res.json()
    },
    enabled: !!params.id,
  })

  // ── Select concept ──────────────────────────────────────────────────────────
  const selectNode = useCallback(async (node: VRNode) => {
    setActiveNode(node)
    setSketchfabUrl(null)
    setLoadingModel(true)
    setModelExpanded(false)

    const keyword = node.sketchfab_keyword || node.label
    try {
      const result = await fetchSketchfabModel(keyword)
      if (result.found && result.embed_url) {
        setSketchfabUrl(result.embed_url)
      } else {
        setSketchfabUrl(null)
      }
    } catch {
      setSketchfabUrl(null)
    } finally {
      setLoadingModel(false)
    }
  }, [])

  // Auto-select first node once layout loads
  useEffect(() => {
    if (vrLayout?.nodes?.length && !activeNode) {
      selectNode(vrLayout.nodes[0])
    }
  }, [vrLayout, activeNode, selectNode])

  // ── WebSocket AI Tutor ──────────────────────────────────────────────────────
  function base64ToPcmFloat(b64: string): Float32Array {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const i16 = new Int16Array(bytes.buffer)
    const f32 = new Float32Array(i16.length)
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768.0
    return f32
  }

  const startSession = useCallback(async () => {
    if (sessionActive) return
    try {
      const token = getAuthToken()
      const wsUrl = `${API_BASE.replace(/^http/, 'ws')}/library/resources/${params.id}/vr-session/?token=${token}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 })

      ws.onopen = () => {
        setSessionActive(true)
        setAiTranscript('AI tutor connected! Ask me anything about this topic.')
        toast.success('AI tutor connected')
      }

      ws.onmessage = async (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'transcript') {
          setAiTranscript(msg.text)
          setIsSpeaking(true)
          if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current)
          speakingTimerRef.current = setTimeout(() => setIsSpeaking(false), 2000)
        }
        if (msg.type === 'audio' && msg.data && audioCtxRef.current) {
          const pcm = base64ToPcmFloat(msg.data)
          const buf = audioCtxRef.current.createBuffer(1, pcm.length, 24000)
          buf.copyToChannel(pcm as any, 0)
          const src = audioCtxRef.current.createBufferSource()
          src.buffer = buf
          src.connect(audioCtxRef.current.destination)
          src.start()
        }
      }

      ws.onclose = () => {
        setSessionActive(false)
        setIsSpeaking(false)
      }

      // Mic capture
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const micCtx = new AudioContext({ sampleRate: 16000 })
      const src = micCtx.createMediaStreamSource(stream)
      const proc = micCtx.createScriptProcessor(4096, 1, 1)
      processorRef.current = proc
      src.connect(proc)
      proc.connect(micCtx.destination)
      proc.onaudioprocess = (ev) => {
        if (!isMicMuted && ws.readyState === WebSocket.OPEN) {
          const f32 = ev.inputBuffer.getChannelData(0)
          const i16 = new Int16Array(f32.length)
          for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768))
          const bytes = new Uint8Array(i16.buffer)
          let binary = ''
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          const b64 = btoa(binary)
          ws.send(JSON.stringify({ type: 'audio', data: b64 }))
        }
      }
    } catch (err) {
      toast.error('Could not start AI session')
      console.error(err)
    }
  }, [sessionActive, params.id, isMicMuted])

  const endSession = useCallback(() => {
    wsRef.current?.close()
    streamRef.current?.getTracks().forEach(t => t.stop())
    processorRef.current?.disconnect()
    setSessionActive(false)
    setAiTranscript('Session ended.')
  }, [])

  // Cleanup on unmount
  useEffect(() => () => { endSession() }, [endSession])

  // ── Loading state ───────────────────────────────────────────────────────────
  if (resourceLoading || layoutLoading) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#050816', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Loader2 size={48} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontSize: 18 }}>Loading VR Classroom…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!resource || !vrLayout) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#050816', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#f43f5e', fontFamily: 'Inter, sans-serif' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 12px' }} />
          <p>Failed to load classroom. <Link href={`/library/${params.id}`} style={{ color: '#6366f1' }}>Go back</Link></p>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100vw', height: '100vh', background: 'linear-gradient(135deg, #050816 0%, #0a0f2e 50%, #050816 100%)', fontFamily: "'Inter', sans-serif", overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
        ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.5); border-radius: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; transform: scale(1); } 50% { opacity:0.7; transform: scale(1.05); } }
        @keyframes wave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
        @keyframes slideIn { from { opacity:0; transform: translateY(20px); } to { opacity:1; transform: translateY(0); } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 10px rgba(99,102,241,0.3); } 50% { box-shadow: 0 0 25px rgba(99,102,241,0.7); } }
        .concept-btn:hover { background: rgba(99,102,241,0.25) !important; transform: translateX(4px); }
        .control-btn:hover { background: rgba(255,255,255,0.12) !important; transform: scale(1.05); }
        .control-btn:active { transform: scale(0.97); }
      `}</style>

      {/* ── TOP NAV BAR ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: 'rgba(5,8,22,0.9)', borderBottom: '1px solid rgba(99,102,241,0.2)', backdropFilter: 'blur(20px)', zIndex: 50, flexShrink: 0 }}>
        <Link href={`/library/${params.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', textDecoration: 'none', fontSize: 14, transition: 'color 0.2s' }}>
          <ChevronLeft size={18} /><span>Back to Library</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s ease-in-out infinite' }} />
          <span style={{ color: '#e2e8f0', fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>VR CLASSROOM</span>
          <span style={{ color: '#64748b', fontSize: 13 }}>—</span>
          <span style={{ color: '#94a3b8', fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.title}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Peers count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, fontSize: 13, color: '#10b981' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            {PEERS.length + 7} online
          </div>
        </div>
      </div>

      {/* ── MAIN BODY ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr 280px', gap: 0, overflow: 'hidden' }}>

        {/* ── LEFT SIDEBAR: Concepts ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(5,8,22,0.8)', borderRight: '1px solid rgba(99,102,241,0.15)', overflow: 'hidden' }}>
          {/* AI Tutor card */}
          <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, animation: isSpeaking ? 'glow 1s ease-in-out infinite' : 'none' }}>🤖</div>
              <div>
                <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>AI Tutor</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: sessionActive ? '#10b981' : '#64748b' }} />
                  <span style={{ color: sessionActive ? '#10b981' : '#64748b' }}>{sessionActive ? 'Live' : 'Offline'}</span>
                </div>
              </div>
            </div>

            {/* Soundwave visualizer */}
            {isSpeaking && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28, marginBottom: 10, padding: '0 4px' }}>
                {[0.3,0.7,1,0.6,0.9,0.4,0.8,0.5,1,0.7,0.4,0.9].map((h, i) => (
                  <div key={i} style={{ flex: 1, background: 'linear-gradient(to top, #6366f1, #a855f7)', borderRadius: 2, animation: `wave ${0.3 + i * 0.07}s ease-in-out ${i * 0.05}s infinite alternate`, transformOrigin: 'bottom', height: `${h * 100}%` }} />
                ))}
              </div>
            )}

            {/* Transcript */}
            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, minHeight: 60, maxHeight: 90, overflow: 'hidden' }}>
              {aiTranscript}
            </div>

            {/* Session controls */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {!sessionActive ? (
                <button onClick={startSession} className="control-btn" style={{ flex: 1, padding: '8px 12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}>
                  <Sparkles size={14} /> Start Session
                </button>
              ) : (
                <>
                  <button onClick={() => setIsMicMuted(m => !m)} className="control-btn" style={{ flex: 1, padding: '8px 10px', background: isMicMuted ? 'rgba(244,63,94,0.2)' : 'rgba(16,185,129,0.2)', border: `1px solid ${isMicMuted ? 'rgba(244,63,94,0.4)' : 'rgba(16,185,129,0.4)'}`, borderRadius: 8, color: isMicMuted ? '#f43f5e' : '#10b981', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.2s' }}>
                    {isMicMuted ? <MicOff size={13} /> : <Mic size={13} />}
                    {isMicMuted ? 'Unmute' : 'Mute'}
                  </button>
                  <button onClick={endSession} className="control-btn" style={{ flex: 1, padding: '8px 10px', background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 8, color: '#f43f5e', fontSize: 12, cursor: 'pointer', transition: 'all 0.2s' }}>
                    End
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Concept list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, paddingLeft: 4 }}>Concepts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(vrLayout?.nodes || []).map(node => (
                <button
                  key={node.id}
                  className="concept-btn"
                  onClick={() => selectNode(node)}
                  style={{ width: '100%', padding: '12px 14px', background: activeNode?.id === node.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${activeNode?.id === node.id ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)'}`, borderLeft: `3px solid ${node.color}`, borderRadius: 10, textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: node.color, flexShrink: 0 }} />
                    <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{node.label}</span>
                  </div>
                  {activeNode?.id === node.id && (
                    <p style={{ color: '#94a3b8', fontSize: 11.5, marginTop: 6, lineHeight: 1.4, paddingLeft: 16 }}>{node.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── CENTER: Sketchfab 3D Model Viewer ──────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {/* Model header */}
          {activeNode && (
            <div style={{ padding: '14px 20px', background: 'rgba(5,8,22,0.6)', borderBottom: '1px solid rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: activeNode.color }} />
                <div>
                  <h2 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, margin: 0 }}>{activeNode.label}</h2>
                  <p style={{ color: '#64748b', fontSize: 12, margin: '2px 0 0' }}>{activeNode.description}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {sketchfabUrl && (
                  <button onClick={() => setModelExpanded(e => !e)} className="control-btn" style={{ padding: '6px 10px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: '#818cf8', cursor: 'pointer', transition: 'all 0.2s' }}>
                    <Maximize2 size={14} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Model viewer area */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {/* Background grid */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />

            {loadingModel && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, animation: 'slideIn 0.3s ease' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', animation: 'spin 1s linear infinite' }} />
                <p style={{ color: '#64748b', fontSize: 14 }}>Loading 3D model…</p>
              </div>
            )}

            {!loadingModel && sketchfabUrl && (
              <div style={{ position: 'absolute', inset: 0, animation: 'slideIn 0.4s ease' }}>
                <iframe
                  key={sketchfabUrl}
                  src={sketchfabUrl}
                  title={activeNode?.label || '3D Model'}
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                  allow="autoplay; fullscreen; xr-spatial-tracking"
                  allowFullScreen
                />
              </div>
            )}

            {!loadingModel && !sketchfabUrl && activeNode && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: 40, animation: 'slideIn 0.3s ease' }}>
                {/* Animated placeholder */}
                <div style={{ width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${activeNode.color}33, transparent)`, border: `2px solid ${activeNode.color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulse 3s ease-in-out infinite' }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: `${activeNode.color}44`, border: `2px solid ${activeNode.color}` }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <h3 style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{activeNode.label}</h3>
                  <p style={{ color: '#64748b', fontSize: 14, maxWidth: 340, lineHeight: 1.6 }}>{activeNode.description}</p>
                  <p style={{ color: '#475569', fontSize: 12, marginTop: 16 }}>No 3D model found for this concept. Add your Sketchfab API token in backend .env to enable dynamic search.</p>
                </div>
              </div>
            )}

            {!loadingModel && !activeNode && (
              <div style={{ textAlign: 'center', color: '#475569' }}>
                <Sparkles size={48} style={{ margin: '0 auto 16px', color: '#6366f1', opacity: 0.5 }} />
                <p style={{ fontSize: 16 }}>Select a concept to view its 3D model</p>
              </div>
            )}
          </div>

          {/* ── BOTTOM CONTROLS ────────────────────────────────────────────── */}
          <div style={{ padding: '12px 20px', background: 'rgba(5,8,22,0.8)', borderTop: '1px solid rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexShrink: 0 }}>
            <button
              className="control-btn"
              onClick={() => setIsMicMuted(m => !m)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: isMicMuted ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)', border: `1px solid ${isMicMuted ? 'rgba(244,63,94,0.4)' : 'rgba(16,185,129,0.4)'}`, borderRadius: 10, color: isMicMuted ? '#f43f5e' : '#10b981', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />}
              {isMicMuted ? 'Unmuted' : 'Mic On'}
            </button>

            <button
              className="control-btn"
              onClick={() => setIsHandRaised(h => !h)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: isHandRaised ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isHandRaised ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, color: isHandRaised ? '#a855f7' : '#94a3b8', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              <Hand size={16} />
              {isHandRaised ? 'Hand Raised' : 'Raise Hand'}
            </button>

            <button
              className="control-btn"
              onClick={() => !sessionActive && startSession()}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.4)', borderRadius: 10, color: '#06b6d4', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              <MessageCircle size={16} />
              Ask AI
            </button>

            <button
              className="control-btn"
              onClick={() => setShowNotes(n => !n)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: showNotes ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showNotes ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, color: showNotes ? '#a855f7' : '#94a3b8', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              <BookOpen size={16} />
              Notes
            </button>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(5,8,22,0.8)', borderLeft: '1px solid rgba(99,102,241,0.15)', overflow: 'hidden' }}>
          {/* Classmates */}
          <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Classmates Online</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PEERS.map(name => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, hsl(${name.charCodeAt(0) * 5 % 360},70%,50%), hsl(${name.charCodeAt(0) * 5 + 60 % 360},70%,40%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                    {name[0]}
                  </div>
                  <span style={{ color: '#e2e8f0', fontSize: 13, flex: 1 }}>{name}</span>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                </div>
              ))}
              <div style={{ padding: '8px 10px', color: '#64748b', fontSize: 12 }}>+ 7 more online</div>
            </div>
          </div>

          {/* Lesson Progress */}
          <div style={{ padding: '16px', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Lesson Progress</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* Circle progress */}
              <svg width="56" height="56" viewBox="0 0 56 56" style={{ flexShrink: 0 }}>
                <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="4" />
                <circle cx="28" cy="28" r="22" fill="none" stroke="#6366f1" strokeWidth="4" strokeDasharray={`${2 * Math.PI * 22 * 0.45} ${2 * Math.PI * 22 * 0.55}`} strokeDashoffset={2 * Math.PI * 22 * 0.25} strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '28px 28px' }} />
                <text x="28" y="33" textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="700">45%</text>
              </svg>
              <div>
                <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>In Progress</div>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                  {activeNode ? `Studying: ${activeNode.label}` : 'Select a concept'}
                </div>
              </div>
            </div>
          </div>

          {/* Concept map mini */}
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>All Topics</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(vrLayout?.nodes || []).map((node, i) => (
                <div key={node.id} onClick={() => selectNode(node)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, background: activeNode?.id === node.id ? 'rgba(99,102,241,0.15)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: node.color, flexShrink: 0 }} />
                  <span style={{ color: activeNode?.id === node.id ? '#e2e8f0' : '#94a3b8', fontSize: 12.5 }}>{node.label}</span>
                  {activeNode?.id === node.id && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#6366f1', marginLeft: 'auto' }} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── NOTES OVERLAY ──────────────────────────────────────────────────── */}
      {showNotes && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'slideIn 0.3s ease' }}>
          <div style={{ width: '90%', maxWidth: 680, maxHeight: '80vh', background: 'linear-gradient(135deg, #0a0f2e, #050816)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.8)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BookOpen size={18} color="#a855f7" />
                <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, margin: 0 }}>Study Notes</h3>
              </div>
              <button onClick={() => setShowNotes(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <h4 style={{ color: '#a855f7', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{resource.title}</h4>
              {activeNode && (
                <div style={{ marginBottom: 20, padding: '14px 16px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12 }}>
                  <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>{activeNode.label}</div>
                  <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>{activeNode.description}</div>
                </div>
              )}
              <div style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {resource.content ? resource.content.slice(0, 2000) : 'No notes available yet. Start an AI tutor session to generate notes!'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
