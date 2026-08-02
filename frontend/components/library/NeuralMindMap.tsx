'use client'

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { aiApi, ttsApi } from '@/lib/api'

interface MindMapData {
  center: string
  branches: { topic: string; subtopics: string[] }[]
}
interface NeuralMindMapProps {
  data: MindMapData
  resourceTitle?: string
  resourceId?: number
}

const NODE_COLORS = [
  { bg: '#c084fc', text: '#1a0033', glow: 'rgba(192,132,252,0.4)' },
  { bg: '#fb923c', text: '#3d1200', glow: 'rgba(251,146,60,0.4)'  },
  { bg: '#6366f1', text: '#ffffff', glow: 'rgba(99,102,241,0.4)'  },
  { bg: '#4ade80', text: '#052e16', glow: 'rgba(74,222,128,0.4)'  },
  { bg: '#f472b6', text: '#3d0022', glow: 'rgba(244,114,182,0.4)' },
  { bg: '#38bdf8', text: '#0c1a3d', glow: 'rgba(56,189,248,0.4)'  },
  { bg: '#fbbf24', text: '#3d1f00', glow: 'rgba(251,191,36,0.4)'  },
  { bg: '#64748b', text: '#f1f5f9', glow: 'rgba(100,116,139,0.35)'},
]
const BRANCH_ICONS = ['public','science','hub','calculate','biotech','history_edu','language','psychology']

const CX = 90   // center radius
const BX = 60   // branch radius
const SX = 42   // sub radius

// ─── Global CSS injected once ─────────────────────────────────────────────────
const STYLES = `
  @keyframes waveBar    { from{transform:scaleY(0.4)} to{transform:scaleY(1)} }
  @keyframes edgePulse  { to{stroke-dashoffset:-40} }
  @keyframes nodeFloat  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
  .ep { stroke-dasharray:6 14; animation:edgePulse 1.8s linear infinite; }
  .nf { animation:nodeFloat 4s ease-in-out infinite; }
`

// ─── Avatar ───────────────────────────────────────────────────────────────────
type AvState = 'idle' | 'thinking' | 'speaking'

function Avatar({ state, text, onDismiss }: { state: AvState; text: string; onDismiss: () => void }) {
  const [typed, setTyped] = useState('')
  const [dots, setDots] = useState(1)

  useEffect(() => {
    if (state === 'thinking' || !text) { setTyped(''); return }
    setTyped('')
    let i = 0
    const iv = setInterval(() => {
      i++
      setTyped(text.slice(0, i))
      if (i >= text.length) clearInterval(iv)
    }, 16)
    return () => clearInterval(iv)
  }, [text, state])

  useEffect(() => {
    if (state !== 'thinking') return
    const t = setInterval(() => setDots(d => d % 3 + 1), 400)
    return () => clearInterval(t)
  }, [state])

  const bars = [3,5,8,5,9,6,4,8,5,3]

  return (
    <div className="flex items-end gap-3 pointer-events-auto">
      {/* ── Robot face ── */}
      <div className="relative shrink-0">
        <div
          className="w-14 h-14 rounded-full border-2 overflow-hidden shadow-2xl transition-all duration-300 relative"
          style={{
            background: 'linear-gradient(135deg,#1e2022,#282a2c)',
            borderColor: state === 'speaking' ? '#ffb68d' : state === 'thinking' ? '#bfc2ff' : '#564338',
            boxShadow: state === 'speaking' ? '0 0 24px rgba(255,182,141,0.5)' : state === 'thinking' ? '0 0 16px rgba(191,194,255,0.4)' : 'none',
          }}
        >
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            {/* Head */}
            <rect x="10" y="12" width="36" height="30" rx="6" fill="#ff8a3d" opacity="0.92"/>
            {/* Eyes */}
            <circle cx="20" cy="22" r="5" fill="#1a0033"/>
            <circle cx="36" cy="22" r="5" fill="#1a0033"/>
            <circle cx="21.5" cy="20.5" r="1.8" fill="white" opacity="0.85"/>
            <circle cx="37.5" cy="20.5" r="1.8" fill="white" opacity="0.85"/>
            {/* Mouth */}
            {state === 'speaking'
              ? <ellipse cx="28" cy="35" rx="7" ry="4" fill="#1a0033" opacity="0.8"/>
              : state === 'thinking'
              ? <path d="M21 34 Q28 31 35 34" stroke="#1a0033" strokeWidth="2.5" fill="none" opacity="0.8"/>
              : <path d="M21 33 Q28 37 35 33" stroke="#1a0033" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8"/>
            }
            {/* Antenna */}
            <line x1="28" y1="12" x2="28" y2="6" stroke="#ffb68d" strokeWidth="2.5"/>
            <circle cx="28" cy="4" r="3" fill="#ffb68d"/>
            {/* Ears */}
            <rect x="4" y="20" width="6" height="10" rx="3" fill="#ff8a3d" opacity="0.7"/>
            <rect x="46" y="20" width="6" height="10" rx="3" fill="#ff8a3d" opacity="0.7"/>
          </svg>

          {/* Waveform overlay when speaking */}
          {state === 'speaking' && (
            <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-0.5 h-5 px-1 pb-0.5"
              style={{ background: 'linear-gradient(to top, rgba(30,32,34,0.85), transparent)' }}>
              {bars.map((h, i) => (
                <div key={i} style={{
                  width: 2, height: h, background: '#ffb68d', borderRadius: 2,
                  animation: `waveBar ${0.35 + i * 0.05}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.06}s`,
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Status dot */}
        <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background"
          style={{ background: state === 'speaking' ? '#ffb68d' : state === 'thinking' ? '#bfc2ff' : '#4ade80' }} />
      </div>

      {/* ── Speech bubble ── */}
      <div
        className="relative rounded-[1.25rem] rounded-bl-sm p-4 shadow-2xl border max-w-[260px] transition-all duration-300"
        style={{
          background: '#1e2022',
          borderColor: state === 'speaking' ? 'rgba(255,182,141,0.3)' : state === 'thinking' ? 'rgba(191,194,255,0.25)' : 'rgba(86,67,56,0.4)',
        }}
      >
        {state === 'thinking' ? (
          <div className="flex items-center gap-2 py-0.5">
            {[0,1,2].slice(0, dots).map(i => (
              <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                style={{ background: '#bfc2ff', animationDelay: `${i * 0.15}s` }} />
            ))}
            <span className="text-[12px] text-on-surface-variant ml-1">Thinking…</span>
          </div>
        ) : (
          <div>
            <p className="text-[13px] text-on-surface leading-relaxed min-h-[18px]">{typed || '\u00A0'}</p>
            {typed.length > 30 && (
              <button onClick={onDismiss}
                className="mt-2 text-[11px] text-on-surface-variant/50 hover:text-primary transition-colors">
                ✕ Dismiss
              </button>
            )}
          </div>
        )}
        {/* Tail */}
        <div className="absolute -left-2 bottom-3 w-0 h-0"
          style={{
            borderTop: '8px solid transparent',
            borderBottom: '0 solid transparent',
            borderRight: `8px solid #1e2022`,
          }}
        />
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function NeuralMindMap({ data, resourceTitle, resourceId }: NeuralMindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan]     = useState({ x: 0, y: 0 })
  const [zoom, setZoom]   = useState(0.85)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [activeNode, setActiveNode] = useState<{ type: 'center'|'branch'|'sub'; bi?: number; si?: number } | null>(null)
  const [showGuide, setShowGuide] = useState(true)

  // Avatar
  const [avState, setAvState]   = useState<AvState>('idle')
  const [avText, setAvText]     = useState('')
  const [avDismissed, setAvDismissed] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(async (text: string) => {
    // Stop any currently playing audio first
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    try {
      // Use Gemini TTS — Puck voice: playful, energetic, matches the avatar personality
      const res = await ttsApi.speak(text, 'Puck')
      const blob = new Blob([res.data], { type: 'audio/wav' })
      const url  = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
        setAvState('idle')
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
        setAvState('idle')
      }
      await audio.play()
    } catch {
      // If TTS fails (network, quota, etc.), just show the text without audio
      setAvState('idle')
    }
  }, [])

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    setAvState('idle')
  }, [])

  useEffect(() => () => stopSpeaking(), [stopSpeaking])

  // Greeting on mount
  useEffect(() => {
    if (!data?.center) return
    const msg = `Hi! I'm FlowAI. This mind map is about "${data.center}". Tap any node and I'll explain it!`
    setAvText(msg)
    setAvState('speaking')
    // slight delay so voices load
    const t = setTimeout(() => speak(msg), 600)
    return () => clearTimeout(t)
  }, [data?.center]) // eslint-disable-line

  const onNodeClick = useCallback(async (name: string, context: string, nodeType: 'center' | 'branch' | 'sub' = 'branch') => {
    stopSpeaking()
    setAvDismissed(false)
    setShowGuide(false)
    setAvState('thinking')
    setAvText('')

    // For branch and sub nodes we already have all the context — skip the AI call
    // and go straight to TTS. This cuts latency from ~5-7s down to ~1-2s (single TTS call).
    // Only the center node needs an AI-generated overview since it's the whole topic.
    if (nodeType !== 'center') {
      const lines = context.split('.').filter(Boolean)
      const sentence = lines[0]?.trim() || context
      // Build a natural spoken description from the map data we already have
      let local = ''
      if (nodeType === 'sub') {
        // context = 'Subtopic "X" which is part of "Y" in the mind map about "Z"'
        const parentMatch = context.match(/part of "([^"]+)"/)
        const parent = parentMatch?.[1] || data.center
        local = `${name} is part of ${parent}. It's one of the subtopics that breaks down this area of ${data.center}.`
      } else {
        // branch node
        const subMatch = context.match(/Subtopics: (.+)$/)
        const subs = subMatch?.[1] || ''
        local = subs
          ? `${name} is a main branch of ${data.center}. It covers: ${subs}.`
          : `${name} is a key branch of ${data.center}.`
      }
      setAvText(local)
      setAvState('speaking')
      speak(local)
      return
    }

    // Center node — use the AI with resourceId so it stays scoped to this resource
    try {
      const prompt = `You are explaining a mind map. The topic is "${data.center}". ` +
        `Context: ${context}. ` +
        `In exactly 2 sentences, give an overview of "${data.center}" as a subject. ` +
        `Stay strictly on this topic. No bullet points. Be conversational.`
      const res = await aiApi.quickAsk(prompt, resourceId)
      const raw = res.data?.answer || res.data?.reply || `${data.center} is the central concept of this mind map.`
      const clean = raw.replace(/\*\*/g,'').replace(/\n+/g,' ').trim()
      setAvText(clean)
      setAvState('speaking')
      speak(clean)
    } catch {
      const fb = `${data.center} is the central topic of this mind map. Tap any branch to explore it!`
      setAvText(fb); setAvState('speaking'); speak(fb)
    }
  }, [data.center, resourceId, speak, stopSpeaking])

  // Pan / zoom handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.nc')) return
    setDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }
  const onMouseMove = (e: React.MouseEvent) => { if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }) }
  const onMouseUp   = () => setDragging(false)
  const onTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.nc')) return
    setDragging(true)
    setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y })
  }
  const onTouchMove  = (e: React.TouchEvent) => { if (dragging) setPan({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y }) }
  const onTouchEnd   = () => setDragging(false)
  const onWheel      = (e: React.WheelEvent) => { e.preventDefault(); setZoom(z => e.deltaY < 0 ? Math.min(z*1.08,3) : Math.max(z/1.08,0.25)) }
  const resetView    = () => { setPan({x:0,y:0}); setZoom(0.85) }

  // Layout
  const branches = useMemo(() => {
    if (!data?.branches) return []
    const n = data.branches.length
    const step = (2 * Math.PI) / n
    const R = 280
    return data.branches.map((b, i) => {
      const a = i * step - Math.PI / 2
      const bx = Math.cos(a) * R
      const by = Math.sin(a) * R
      const subCount = b.subtopics?.length || 0
      const subs = (b.subtopics || []).map((s, j) => {
        const spread = subCount > 1 ? ((j / (subCount-1)) - 0.5) * 1.1 : 0
        const sa = a + spread
        const sr = R + 195
        return { text: s, x: Math.cos(sa)*sr, y: Math.sin(sa)*sr }
      })
      return { topic: b.topic, x: bx, y: by, subs, color: NODE_COLORS[i%NODE_COLORS.length], icon: BRANCH_ICONS[i%BRANCH_ICONS.length] }
    })
  }, [data])

  return (
    <div ref={containerRef}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      className={cn('relative w-full h-full overflow-hidden select-none touch-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
      style={{ background: '#0e0e10' }}
    >
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* Dot grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        transform: `translate(${pan.x%28}px,${pan.y%28}px)`,
      }} />

      {/* Canvas */}
      <div className="absolute w-0 h-0" style={{ transform: `translate(calc(50vw + ${pan.x}px), calc(50vh + ${pan.y}px)) scale(${zoom})`, transformOrigin: '0 0' }}>

        {/* SVG edges */}
        <svg className="absolute overflow-visible pointer-events-none" style={{ zIndex: 1 }}>
          {branches.map((b, i) => {
            const a = Math.atan2(b.y, b.x)
            const x0 = Math.cos(a)*(CX-4), y0 = Math.sin(a)*(CX-4)
            const x1 = b.x - Math.cos(a)*(BX-4), y1 = b.y - Math.sin(a)*(BX-4)
            return (
              <g key={i}>
                <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={b.color.bg} strokeWidth="3" opacity="0.2"/>
                <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={b.color.bg} strokeWidth="2" opacity="0.7" className="ep"/>
                {b.subs.map((s, j) => {
                  const sa = Math.atan2(s.y - b.y, s.x - b.x)
                  return (
                    <g key={j}>
                      <line x1={b.x+Math.cos(sa)*(BX-4)} y1={b.y+Math.sin(sa)*(BX-4)} x2={s.x-Math.cos(sa)*(SX-3)} y2={s.y-Math.sin(sa)*(SX-3)} stroke={b.color.bg} strokeWidth="2" opacity="0.15"/>
                      <line x1={b.x+Math.cos(sa)*(BX-4)} y1={b.y+Math.sin(sa)*(BX-4)} x2={s.x-Math.cos(sa)*(SX-3)} y2={s.y-Math.sin(sa)*(SX-3)} stroke={b.color.bg} strokeWidth="1.5" opacity="0.55" className="ep" style={{ animationDelay:`${j*0.2}s` }}/>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>

        {/* Center node */}
        <div className="absolute nc nf" style={{ transform:'translate(-50%,-50%)', zIndex:20 }}>
          <div style={{ position:'relative', width:CX*2, height:CX*2 }}>
            <div style={{ position:'absolute', inset:-10, borderRadius:'50%', background:'radial-gradient(circle, rgba(255,138,61,0.3) 0%, transparent 70%)' }}/>
            <div className="nc" onClick={() => { setActiveNode({type:'center'}); onNodeClick(data.center, `Central concept of the mind map about ${data.center}`, 'center') }}
              style={{ width:CX*2, height:CX*2, borderRadius:'50%', background:'linear-gradient(135deg,#ff8a3d,#ffb68d)', boxShadow:'0 0 48px rgba(255,138,61,0.55), 0 10px 32px rgba(0,0,0,0.5)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', border: activeNode?.type==='center'?'3px solid white':'2px solid rgba(255,255,255,0.2)', cursor:'pointer', transition:'transform 0.2s' }}>
              <span className="material-symbols-outlined" style={{ fontSize:24, color:'#3d1200', fontVariationSettings:"'FILL' 1", marginBottom:2 }}>wb_sunny</span>
              <span style={{ fontSize:11, fontWeight:900, textAlign:'center', color:'#3d1200', lineHeight:1.2, padding:'0 12px', textTransform:'uppercase', letterSpacing:'0.05em' }}>{data.center}</span>
            </div>
          </div>
        </div>

        {/* Branch + sub nodes */}
        {branches.map((b, i) => (
          <React.Fragment key={i}>
            {/* Branch */}
            <div className="absolute nc nf" style={{ left:b.x, top:b.y, transform:'translate(-50%,-50%)', zIndex:15, animationDelay:`${i*0.4}s` }}>
              <div style={{ position:'relative', width:BX*2, height:BX*2 }}>
                <div style={{ position:'absolute', inset:-8, borderRadius:'50%', background:`radial-gradient(circle, ${b.color.glow} 0%, transparent 70%)` }}/>
                <div className="nc" onClick={() => { setActiveNode({type:'branch',bi:i}); onNodeClick(b.topic, `Branch topic "${b.topic}" under "${data.center}". Subtopics: ${b.subs.map(s=>s.text).join(', ')}`, 'branch') }}
                  style={{ width:BX*2, height:BX*2, borderRadius:'50%', background:b.color.bg, boxShadow:`0 0 28px ${b.color.glow}, 0 6px 20px rgba(0,0,0,0.45)`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', border: activeNode?.type==='branch'&&activeNode.bi===i?'3px solid white':'2px solid rgba(255,255,255,0.15)', cursor:'pointer', transition:'transform 0.15s' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:18, color:b.color.text, fontVariationSettings:"'FILL' 1", marginBottom:2 }}>{b.icon}</span>
                  <span style={{ fontSize:10, fontWeight:800, textAlign:'center', color:b.color.text, lineHeight:1.2, padding:'0 6px' }}>{b.topic}</span>
                </div>
              </div>
            </div>

            {/* Subtopics */}
            {b.subs.map((s, j) => (
              <div key={j} className="absolute nc" style={{ left:s.x, top:s.y, transform:'translate(-50%,-50%)', zIndex:10 }}>
                <div className="nc" onClick={() => { setActiveNode({type:'sub',bi:i,si:j}); onNodeClick(s.text, `Subtopic "${s.text}" which is part of "${b.topic}" in the mind map about "${data.center}"`, 'sub') }}
                  style={{ width:SX*2, height:SX*2, borderRadius:'50%', background:'#1e2022', boxShadow:`0 0 14px ${b.color.glow}, 0 4px 12px rgba(0,0,0,0.5)`, display:'flex', alignItems:'center', justifyContent:'center', border: activeNode?.type==='sub'&&activeNode.bi===i&&activeNode.si===j?`2.5px solid ${b.color.bg}`:`1.5px solid ${b.color.bg}55`, cursor:'pointer', transition:'transform 0.15s' }}>
                  <span style={{ fontSize:9, fontWeight:700, textAlign:'center', color:'#e2e2e5', lineHeight:1.2, padding:'0 5px' }}>{s.text}</span>
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* ── Zoom controls — bottom left ─────────────────────────────── */}
      <div className="absolute bottom-6 left-6 z-50 flex items-center gap-1 p-1 rounded-full shadow-xl pointer-events-auto"
        style={{ background:'rgba(30,32,34,0.92)', backdropFilter:'blur(8px)', border:'1px solid rgba(86,67,56,0.4)' }}>
        <button onClick={() => setZoom(z=>Math.max(z/1.2,0.25))} className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[18px]">remove</span>
        </button>
        <span className="text-[12px] font-bold text-on-surface-variant w-12 text-center">{Math.round(zoom*100)}%</span>
        <button onClick={() => setZoom(z=>Math.min(z*1.2,3))} className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[18px]">add</span>
        </button>
        <div className="w-px h-5 mx-1" style={{ background:'rgba(86,67,56,0.4)' }}/>
        <button onClick={resetView} className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[18px]">fit_screen</span>
        </button>
      </div>

      {/* ── Avatar — bottom left above zoom ─────────────────────────── */}
      {!avDismissed && (
        <div className="absolute left-6 z-50 pointer-events-none" style={{ bottom: '88px' }}>
          <Avatar state={avState} text={avText} onDismiss={() => { stopSpeaking(); setAvDismissed(true); setAvState('idle') }} />
        </div>
      )}

      {/* Re-show avatar button if dismissed */}
      {avDismissed && (
        <div className="absolute left-6 z-50" style={{ bottom: '88px' }}>
          <button onClick={() => { setAvDismissed(false); setAvState('idle'); setAvText('Tap any node and I\'ll explain it!') }}
            className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center border-2 border-outline-variant/40 hover:border-primary/40 transition-all"
            style={{ background:'linear-gradient(135deg,#1e2022,#282a2c)' }}
            title="Show FlowAI">
            <span className="material-symbols-outlined text-primary text-[24px]" style={{ fontVariationSettings:"'FILL' 1" }}>smart_toy</span>
          </button>
        </div>
      )}

      {/* ── Study Guide — bottom right ───────────────────────────────── */}
      {showGuide && (
        <div className="absolute bottom-6 right-6 z-50 w-68 pointer-events-auto" style={{ maxWidth: 280 }}>
          <div className="rounded-[1.5rem] p-4 shadow-2xl border" style={{ background:'rgba(30,32,34,0.95)', backdropFilter:'blur(8px)', borderColor:'rgba(86,67,56,0.4)' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-[0.75rem] flex items-center justify-center" style={{ background:'rgba(255,182,141,0.12)' }}>
                <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings:"'FILL' 1" }}>menu_book</span>
              </div>
              <p className="font-bold text-on-surface text-[14px]">Study Guide</p>
            </div>
            <p className="text-on-surface-variant text-[13px] leading-relaxed">Mind map generated from your material. Tap any node — FlowAI will explain it out loud!</p>
            <button onClick={() => setShowGuide(false)}
              className="mt-3 w-full py-2 rounded-[1rem] text-on-surface-variant text-[12px] font-bold hover:bg-surface-container-highest transition-all"
              style={{ background:'rgba(40,42,44,0.8)' }}>
              Hide Help
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
