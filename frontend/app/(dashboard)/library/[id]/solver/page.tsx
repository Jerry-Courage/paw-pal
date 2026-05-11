'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import { ArrowLeft, Calculator, Brain, CheckCircle2,
  Loader2, Info, RotateCcw, Zap } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

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

// Safe KaTeX renderer — falls back to plain text if katex isn't available
function KatexDisplay({ formula }: { formula: string }) {
  const [html, setHtml] = useState('')
  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const katex = require('katex')
      setHtml(katex.renderToString(formula.replace(/\$/g, ''), { displayMode: true, throwOnError: false }))
    } catch {
      setHtml(`<span class="font-mono text-emerald-300">${formula}</span>`)
    }
  }, [formula])
  return <div dangerouslySetInnerHTML={{ __html: html }} className="overflow-x-auto" />
}

export default function SolverPage({ params }: { params: { id: string } }) {
  const resourceId = parseInt(params.id)
  const [problem, setProblem] = useState('')
  const [solving, setSolving] = useState(false)
  const [solution, setSolution] = useState<MathSolution | null>(null)

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => libraryApi.getResource(resourceId).then(r => r.data),
  })

  const handleSolve = async () => {
    if (!problem.trim()) return
    setSolving(true)
    try {
      const res = await libraryApi.solveMath(resourceId, problem)
      setSolution(res.data)
    } catch {
      toast.error('Could not solve this problem. Try simplifying it.')
    } finally {
      setSolving(false)
    }
  }

  return (
    <div className="fixed inset-0 top-14 bg-[#0d0d0d] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0">
        <Link href={`/library/${resourceId}`} className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </Link>
        <div>
          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Math Solver</p>
          <h1 className="text-xs font-black text-slate-400 truncate max-w-[200px]">{resource?.title}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 max-w-2xl mx-auto w-full space-y-6 scrollbar-hide">
        {!solution ? (
          <>
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] flex items-center justify-center">
                <Calculator className="w-8 h-8 text-orange-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Math Solver</h2>
                <p className="text-slate-500 mt-1.5 text-sm">Step-by-step AI solutions with full derivations.</p>
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Describe your problem</label>
              <textarea autoFocus
                placeholder="e.g. Find the derivative of f(x) = sin(x²) + 5x..."
                rows={5} value={problem} onChange={e => setProblem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSolve() }}
                className="w-full bg-[#1a1a1a] border border-white/8 rounded-2xl p-4 text-white text-sm leading-relaxed resize-none focus:outline-none focus:border-orange-500/40 placeholder:text-slate-600 transition-all"
              />
            </div>
            <div className="flex gap-3 bg-orange-500/5 border border-orange-500/10 rounded-2xl p-4">
              <Info className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Be specific. Press <kbd className="px-1.5 py-0.5 bg-white/8 rounded text-xs font-mono">⌘ Enter</kbd> to solve.
              </p>
            </div>
            <button onClick={handleSolve} disabled={!problem.trim() || solving}
              className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-sm hover:bg-orange-400 active:scale-[0.98] transition-all shadow-xl shadow-orange-500/20 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2.5">
              { solving ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</> : <><className="w-4 h-4" /> Solve Step-by-Step</>, Zap }
            </button>
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-[#1a1a1a] border border-white/5 rounded-2xl px-4 py-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Solution</span>
              <button onClick={() => { setSolution(null); setProblem('') }}
                className="flex items-center gap-1.5 text-[10px] font-black text-orange-400 uppercase tracking-widest hover:text-orange-300 transition-colors">
                <RotateCcw className="w-3 h-3" /> Solve Another
              </button>
            </div>
            <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Problem</p>
              <p className="text-white font-medium text-sm">{solution.problem || problem}</p>
            </div>
            <div className="space-y-5">
              {solution.steps?.map((step, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-orange-500/20 flex items-center justify-center text-orange-400 font-black text-xs shrink-0">{idx + 1}</div>
                    {idx !== solution.steps.length - 1 && <div className="w-px flex-1 bg-gradient-to-b from-orange-500/20 to-transparent my-2" />}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-2">{step.label}</p>
                    <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-4 mb-2 overflow-x-auto">
                      <KatexDisplay formula={step.formula} />
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed italic">"{step.explanation}"</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-orange-500 p-6 shadow-xl shadow-orange-500/20">
              <Zap className="absolute -top-3 -right-3 w-20 h-20 text-white/10 rotate-12" />
              <div className="relative space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Final Answer</span>
                </div>
                <div className="text-white overflow-x-auto"><KatexDisplay formula={solution.final_answer} /></div>
              </div>
            </div>
            {solution.key_theorems?.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <Brain className="w-3.5 h-3.5" /> Core Concepts Used
                </div>
                <div className="flex flex-wrap gap-2">
                  {solution.key_theorems.map((t, i) => (
                    <span key={i} className="px-3 py-1.5 bg-[#1a1a1a] border border-white/8 rounded-full text-xs font-bold text-slate-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-orange-400" /> {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
