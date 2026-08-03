'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { libraryApi, aiApi, authApi } from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import 'katex/dist/katex.min.css'
import { useStudyTimer } from '@/hooks/useStudyTimer'

interface MathStep {
  label: string
  formula: string
  explanation: string
}
interface MathSolution {
  problem: string
  steps: MathStep[]
  final_answer: string
  key_theorems: string[]
}

type InputMode = 'type' | 'snap' | 'draw'

// Strip LaTeX dollar signs for plain text display
// Converts "$x^2$" → "x^2", "$$\frac{a}{b}$$" → "\frac{a}{b}"
// Used in step labels and Why? explanations where we want readable prose
function stripLatex(text: string): string {
  if (!text) return ''
  return text
    .replace(/\$\$([^$]+)\$\$/g, '$1')   // $$...$$ block
    .replace(/\$([^$]+)\$/g, '$1')        // $...$ inline
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')  // \frac{a}{b} → a/b
    .replace(/\^(\{[^}]+\}|\S)/g, (_, p) => '^' + p.replace(/[{}]/g, ''))  // ^{2} → ^2
    .replace(/\\[a-zA-Z]+/g, '')          // strip remaining latex commands
    .replace(/[{}]/g, '')                 // strip stray braces
    .trim()
}
function KatexDisplay({ formula, inline = false }: { formula: string; inline?: boolean }) {
  const [html, setHtml] = useState('')
  useEffect(() => {
    if (!formula) { setHtml(''); return }
    let clean = formula.trim()
      .replace(/^```latex/, '').replace(/```$/, '')
      .replace(/^```/, '').replace(/```$/, '')
      .replace(/^\$\$?/, '').replace(/\$\$?$/, '').trim()
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const katex = require('katex')
      setHtml(katex.renderToString(clean, { displayMode: !inline, throwOnError: false, trust: true }))
    } catch {
      setHtml(`<span class="font-mono text-primary">${clean}</span>`)
    }
  }, [formula, inline])
  return <div dangerouslySetInnerHTML={{ __html: html }} className="overflow-x-auto" />
}

export default function SolverPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  useStudyTimer(true)
  const qc = useQueryClient()

  // ── State ────────────────────────────────────────────────────────
  const [mode, setMode] = useState<InputMode>('type')
  const [problem, setProblem] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [solving, setSolving] = useState(false)
  const [solution, setSolution] = useState<MathSolution | null>(null)
  const [xpAwarded, setXpAwarded] = useState(false)
  const [whyLoading, setWhyLoading] = useState<Record<number, boolean>>({})
  const [whyText, setWhyText] = useState<Record<number, string>>({})
  const [similarProblems, setSimilarProblems] = useState<string[]>([])
  const [loadingSimilar, setLoadingSimilar] = useState(false)

  // Draw mode
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 })
  const [hasDrawing, setHasDrawing] = useState(false)

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  // ── Canvas helpers ───────────────────────────────────────────────
  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current; if (!canvas) return
    const pos = getCanvasPos(e, canvas)
    setIsDrawing(true); setLastPos(pos)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const pos = getCanvasPos(e, canvas)
    ctx.beginPath(); ctx.moveTo(lastPos.x, lastPos.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#ffb68d'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.stroke(); setLastPos(pos); setHasDrawing(true)
  }

  const stopDraw = () => setIsDrawing(false)

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawing(false)
  }, [])

  const getCanvasImage = (): string | null => {
    const canvas = canvasRef.current; if (!canvas || !hasDrawing) return null
    return canvas.toDataURL('image/png')
  }

  // ── Image upload ─────────────────────────────────────────────────
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return }
    const reader = new FileReader()
    reader.onloadend = () => { setImage(reader.result as string); toast.success('Photo attached!') }
    reader.readAsDataURL(file)
  }

  // ── Solve ────────────────────────────────────────────────────────
  const handleSolve = async () => {
    const imgData = mode === 'draw' ? getCanvasImage() : image
    if (!problem.trim() && !imgData) return
    setSolving(true); setWhyText({}); setWhyLoading({}); setSimilarProblems([])
    try {
      const res = await libraryApi.solveMath(resourceId, problem, imgData || undefined)
      setSolution(res.data)
    } catch {
      toast.error('Could not solve. Try rephrasing or using a clearer photo.')
    } finally { setSolving(false) }
  }

  // ── Why? ─────────────────────────────────────────────────────────
  const handleWhy = async (idx: number, step: MathStep) => {
    if (whyText[idx] || whyLoading[idx]) return
    setWhyLoading(w => ({ ...w, [idx]: true }))
    try {
      const q = `In simple terms, why do we "${stripLatex(step.label)}" in this step? Give one short sentence in plain English only. No dollar signs, no LaTeX, no backslashes.`
      const res = await aiApi.quickAsk(q, resourceId)
      setWhyText(w => ({ ...w, [idx]: res.data?.answer || res.data?.reply || 'This step simplifies the expression towards the solution.' }))
    } catch {
      setWhyText(w => ({ ...w, [idx]: 'This step brings us closer to isolating the unknown.' }))
    } finally { setWhyLoading(w => ({ ...w, [idx]: false })) }
  }

  // ── Similar Problems ─────────────────────────────────────────────
  const handleSimilar = async () => {
    if (!solution || loadingSimilar) return
    setLoadingSimilar(true)
    try {
      const q = `Generate 3 similar practice problems to: "${solution.problem}". Return ONLY a JSON array of 3 strings, each a problem statement.`
      const res = await aiApi.quickAsk(q, resourceId)
      const raw = res.data?.answer || res.data?.reply || '[]'
      // Try to parse JSON array
      const match = raw.match(/\[[\s\S]*\]/)
      if (match) {
        const arr = JSON.parse(match[0])
        if (Array.isArray(arr)) { setSimilarProblems(arr.slice(0, 3)); return }
      }
      // Fallback: split by newlines
      const lines = raw.split('\n').filter((l: string) => l.trim().length > 5).slice(0, 3)
      setSimilarProblems(lines)
    } catch {
      toast.error('Could not generate similar problems.')
    } finally { setLoadingSimilar(false) }
  }

  const reset = () => {
    setSolution(null); setProblem(''); setImage(null)
    setWhyText({}); setWhyLoading({}); setSimilarProblems([])
    setXpAwarded(false); clearCanvas()
  }

  // ── RENDER ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0">
        <Link href={`/library/${resourceId}`}
          className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors text-[13px] font-bold">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back
        </Link>
        <div className="text-center">
          <h1 className="text-[15px] font-black text-on-surface">AI Problem Solver</h1>
          <p className="text-[11px] text-on-surface-variant">Step-by-step solutions</p>
        </div>
        <div className="w-9" />
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">

          {!solution ? (
            <>
              {/* Page title */}
              <div>
                <h2 className="text-[26px] font-black text-on-surface tracking-tight">AI Problem Solver</h2>
                <p className="text-on-surface-variant text-[14px] mt-1">
                  Drop your math or science question here, and I'll help you figure it out step-by-step!
                </p>
              </div>

              {/* Mode picker */}
              <div className="grid grid-cols-3 gap-3">
                {([
                  { id: 'type', icon: 'keyboard', label: 'Type It',     desc: 'Write your question' },
                  { id: 'snap', icon: 'photo_camera', label: 'Snap Photo', desc: 'Take a picture of the page' },
                  { id: 'draw', icon: 'draw',        label: 'Draw It',    desc: 'Use your digital pen' },
                ] as const).map(m => (
                  <button key={m.id} onClick={() => setMode(m.id as InputMode)}
                    className={cn('flex flex-col items-center text-center p-4 rounded-[1.5rem] border-2 transition-all',
                      mode === m.id
                        ? 'border-primary bg-primary/8'
                        : 'border-outline-variant/40 bg-surface-container-low hover:border-primary/40')}>
                    <span className="material-symbols-outlined text-[28px] mb-2"
                      style={{ fontVariationSettings: "'FILL' 1", color: mode === m.id ? 'var(--primary)' : 'var(--on-surface-variant)' }}>
                      {m.icon}
                    </span>
                    <p className={cn('text-[13px] font-black', mode === m.id ? 'text-primary' : 'text-on-surface')}>{m.label}</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5 leading-tight">{m.desc}</p>
                  </button>
                ))}
              </div>

              {/* Type mode */}
              {mode === 'type' && (
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-[1.5rem] p-4 space-y-3 focus-within:border-primary/40 transition-all">
                  <textarea autoFocus value={problem} onChange={e => setProblem(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSolve() }}
                    placeholder="Type your problem… e.g. Solve 3x + 5 = 20"
                    rows={5}
                    className="w-full bg-transparent text-on-surface text-[15px] leading-relaxed resize-none focus:outline-none placeholder:text-on-surface-variant/40" />
                  <p className="text-[11px] text-on-surface-variant/50 text-right">Ctrl/⌘ + Enter to solve</p>
                </div>
              )}

              {/* Snap mode */}
              {mode === 'snap' && (
                <div className="space-y-3">
                  {image ? (
                    <div className="relative rounded-[1.5rem] overflow-hidden border border-outline-variant/30">
                      <img src={image} alt="Problem" className="w-full max-h-64 object-contain bg-surface-container" />
                      <div className="absolute top-3 right-3 flex gap-2">
                        <button onClick={() => setImage(null)}
                          className="p-2 rounded-full bg-error-container text-on-error-container hover:brightness-110 transition-all">
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </div>
                      <div className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-surface-container/90 backdrop-blur rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-[11px] font-black text-on-surface">Solving Now</span>
                      </div>
                    </div>
                  ) : (
                    <label htmlFor="solver-img"
                      className="flex flex-col items-center justify-center gap-4 p-10 rounded-[1.5rem] border-2 border-dashed border-outline-variant/50 bg-surface-container-low cursor-pointer hover:border-primary/40 hover:bg-primary/3 transition-all">
                      <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>photo_camera</span>
                      </div>
                      <div className="text-center">
                        <p className="text-[15px] font-bold text-on-surface">Tap to upload or take photo</p>
                        <p className="text-[12px] text-on-surface-variant mt-1">JPG, PNG up to 5MB</p>
                      </div>
                    </label>
                  )}
                  <input id="solver-img" type="file" accept="image/*" capture="environment"
                    className="hidden" onChange={handleImageChange} />
                  {image && (
                    <div className="bg-surface-container-low border border-outline-variant/30 rounded-[1.25rem] p-3">
                      <textarea value={problem} onChange={e => setProblem(e.target.value)}
                        placeholder="Optional: add any extra context or specific question about the image…"
                        rows={2}
                        className="w-full bg-transparent text-on-surface text-[13px] leading-relaxed resize-none focus:outline-none placeholder:text-on-surface-variant/40" />
                    </div>
                  )}
                </div>
              )}

              {/* Draw mode */}
              {mode === 'draw' && (
                <div className="space-y-3">
                  <div className="relative rounded-[1.5rem] overflow-hidden border border-outline-variant/30 bg-surface-container-low">
                    <canvas ref={canvasRef} width={600} height={280}
                      className="w-full cursor-crosshair touch-none"
                      style={{ background: '#1a1c1e' }}
                      onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                      onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
                    <div className="absolute top-3 right-3 flex gap-2">
                      <button onClick={clearCanvas}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high border border-outline-variant/40 text-[11px] font-bold text-on-surface-variant hover:text-on-surface transition-all">
                        <span className="material-symbols-outlined text-[14px]">refresh</span> Clear
                      </button>
                    </div>
                    {!hasDrawing && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-on-surface-variant/30 text-[13px] font-medium">Draw your equation here…</p>
                      </div>
                    )}
                  </div>
                  <div className="bg-surface-container-low border border-outline-variant/30 rounded-[1.25rem] p-3">
                    <textarea value={problem} onChange={e => setProblem(e.target.value)}
                      placeholder="Optional: describe what you drew for better accuracy…"
                      rows={2}
                      className="w-full bg-transparent text-on-surface text-[13px] leading-relaxed resize-none focus:outline-none placeholder:text-on-surface-variant/40" />
                  </div>
                </div>
              )}

              {/* Solve button */}
              <button onClick={handleSolve}
                disabled={solving || (mode === 'type' && !problem.trim()) || (mode === 'snap' && !image) || (mode === 'draw' && !hasDrawing && !problem.trim())}
                className="w-full py-4 rounded-[1rem] bg-primary-container text-on-primary-container font-bold text-[16px] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2.5">
                {solving
                  ? <><span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span> Solving…</>
                  : <><span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>calculate</span> Solve Step-by-Step</>}
              </button>
            </>
          ) : (
            <>
              {/* ── Solution view ── */}

              {/* Re-scan / header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-[10px] font-black text-green-400 uppercase tracking-widest">
                      Solved
                    </span>
                    {resource?.subject && (
                      <span className="text-[12px] text-on-surface-variant">{resource.subject}</span>
                    )}
                  </div>
                  <p className="text-[15px] font-bold text-on-surface leading-snug max-w-sm">
                    {solution.problem || problem}
                  </p>
                </div>
                <button onClick={reset}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-[1rem] bg-surface-container-high border border-outline-variant/30 text-[12px] font-bold text-on-surface-variant hover:text-on-surface transition-all">
                  <span className="material-symbols-outlined text-[16px]">refresh</span> Re-scan
                </button>
              </div>

              {/* Steps */}
              <div className="space-y-4">
                {solution.steps?.map((step, idx) => (
                  <div key={idx} className="flex gap-4">
                    {/* Number + line */}
                    <div className="flex flex-col items-center">
                      <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary-container font-black text-[14px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      {idx < solution.steps.length - 1 && (
                        <div className="w-px flex-1 bg-outline-variant/30 my-2" />
                      )}
                    </div>

                    {/* Card */}
                    <div className="flex-1 pb-2">
                      <div className="bg-surface-container-low border border-outline-variant/30 rounded-[1.5rem] p-4 space-y-3">
                        <p className="text-[14px] font-bold text-on-surface">{stripLatex(step.label)}</p>
                        <div className="bg-surface-container rounded-[1rem] p-3 overflow-x-auto">
                          <KatexDisplay formula={step.formula} />
                        </div>

                        {/* Why button */}
                        {!whyText[idx] ? (
                          <button onClick={() => handleWhy(idx, step)}
                            disabled={whyLoading[idx]}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 text-[12px] font-bold text-secondary hover:bg-secondary/15 transition-all disabled:opacity-50">
                            {whyLoading[idx]
                              ? <span className="material-symbols-outlined text-[14px] animate-spin">autorenew</span>
                              : <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>help</span>
                            }
                            Why?
                          </button>
                        ) : (
                          <div className="flex items-start gap-2 bg-secondary/8 border border-secondary/20 rounded-[1rem] px-3 py-2.5">
                            <span className="material-symbols-outlined text-secondary text-[14px] shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                            <p className="text-[12px] text-on-surface-variant leading-relaxed">{stripLatex(whyText[idx])}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Final answer */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-green-400 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="bg-surface-container-low border-2 border-secondary/40 rounded-[1.5rem] p-5 overflow-hidden">
                      <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-3">Final Answer</p>
                      <div className="text-[22px] font-black text-on-surface overflow-x-auto">
                        <KatexDisplay formula={solution.final_answer} />
                      </div>

                      {/* Similar Problems */}
                      <div className="mt-4 space-y-2">
                        {similarProblems.length === 0 ? (
                          <button onClick={handleSimilar} disabled={loadingSimilar}
                            className="w-full py-3 rounded-[1rem] bg-primary-container text-on-primary-container font-bold text-[14px] shadow-[0_3px_0_0_#763300] active:translate-y-0.5 active:shadow-none hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            {loadingSimilar
                              ? <><span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span> Loading…</>
                              : <><span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>refresh</span> Similar Problems</>}
                          </button>
                        ) : (
                          <div className="space-y-2 pt-1">
                            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Try these next:</p>
                            {similarProblems.map((sp, i) => (
                              <button key={i} onClick={() => { setProblem(sp); setSolution(null); setMode('type'); setWhyText({}); setSimilarProblems([]) }}
                                className="w-full text-left px-4 py-3 rounded-[1rem] bg-surface-container border border-outline-variant/30 text-[13px] text-on-surface hover:border-primary/40 hover:bg-primary/5 transition-all">
                                {sp}
                              </button>
                            ))}
                          </div>
                        )}
                        <button onClick={reset}
                          className="w-full py-2.5 rounded-[1rem] bg-surface-container border border-outline-variant/30 text-[13px] font-bold text-on-surface-variant hover:text-on-surface transition-all flex items-center justify-center gap-2">
                          <span className="material-symbols-outlined text-[16px]">arrow_back</span> New Problem
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Key theorems */}
              {solution.key_theorems?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">psychology</span> Concepts Used
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {solution.key_theorems.map((t, i) => (
                      <span key={i} className="px-3 py-1.5 bg-surface-container border border-outline-variant/30 rounded-full text-[12px] font-bold text-on-surface-variant">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="h-4" />
        </div>
      </div>
    </div>
  )
}
