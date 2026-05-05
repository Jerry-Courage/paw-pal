'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import {
  ArrowLeft, Calculator, Sparkles, Brain, CheckCircle2,
  Loader2, Info, RotateCcw
} from 'lucide-react'
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
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 flex items-center gap-4 border-b border-white/5 flex-shrink-0 sticky top-0 z-10 bg-slate-950/90 backdrop-blur-xl">
        <Link href={`/library/${resourceId}`} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </Link>
        <div>
          <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Math Solver</p>
          <h1 className="text-sm font-black text-white truncate max-w-xs">{resource?.title}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 max-w-2xl mx-auto w-full space-y-8">

        {!solution ? (
          <>
            {/* Hero */}
            <div className="flex flex-col items-center text-center space-y-4 py-4">
              <div className="w-20 h-20 bg-teal-500/10 border border-teal-500/20 rounded-[2rem] flex items-center justify-center">
                <Calculator className="w-10 h-10 text-teal-400" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-white tracking-tighter">Math Solver</h2>
                <p className="text-slate-400 mt-2 text-sm">Step-by-step AI solutions with full derivations and explanations.</p>
              </div>
            </div>

            {/* Input */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Describe your problem</label>
              <textarea
                autoFocus
                placeholder="e.g. Find the derivative of f(x) = sin(x²) + 5x..."
                rows={5}
                value={problem}
                onChange={e => setProblem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSolve() }}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-white text-base leading-relaxed resize-none focus:outline-none focus:border-teal-500/50 placeholder:text-slate-600 transition-all"
              />
            </div>

            {/* Tip */}
            <div className="flex gap-3 bg-teal-500/5 border border-teal-500/10 rounded-2xl p-4">
              <Info className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-400 leading-relaxed">
                Be specific. If this relates to a formula in your notes, mention it for a more contextual solution. Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs font-mono">⌘ Enter</kbd> to solve.
              </p>
            </div>

            <button
              onClick={handleSolve}
              disabled={!problem.trim() || solving}
              className="w-full py-4 rounded-2xl bg-teal-500 text-white font-black text-base hover:bg-teal-400 active:scale-95 transition-all shadow-2xl shadow-teal-500/20 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-3"
            >
              {solving ? <><Loader2 className="w-5 h-5 animate-spin" /> Calculating...</> : <><Sparkles className="w-5 h-5" /> Solve Step-by-Step</>}
            </button>
          </>
        ) : (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* Header row */}
            <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-2xl px-5 py-4">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Solution</span>
              <button
                onClick={() => { setSolution(null); setProblem('') }}
                className="flex items-center gap-1.5 text-[10px] font-black text-teal-400 uppercase tracking-widest hover:text-teal-300 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Solve Another
              </button>
            </div>

            {/* Problem restatement */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Problem</p>
              <p className="text-white font-medium">{solution.problem || problem}</p>
            </div>

            {/* Steps */}
            <div className="space-y-6">
              {solution.steps?.map((step, idx) => (
                <div key={idx} className="flex gap-5">
                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-slate-800 border border-teal-500/20 flex items-center justify-center text-teal-400 font-black text-xs shrink-0">
                      {idx + 1}
                    </div>
                    {idx !== solution.steps.length - 1 && (
                      <div className="w-px flex-1 bg-gradient-to-b from-teal-500/20 to-transparent my-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-6">
                    <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest mb-3">{step.label}</p>
                    <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 mb-3 overflow-x-auto">
                      <KatexDisplay formula={step.formula} />
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed italic">"{step.explanation}"</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Final answer */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-8 shadow-2xl shadow-emerald-500/20">
              <Sparkles className="absolute -top-4 -right-4 w-24 h-24 text-white/10 rotate-12" />
              <div className="relative space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                  <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Final Answer</span>
                </div>
                <div className="text-white overflow-x-auto">
                  <KatexDisplay formula={solution.final_answer} />
                </div>
              </div>
            </div>

            {/* Theorems */}
            {solution.key_theorems?.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <Brain className="w-3.5 h-3.5" /> Core Concepts Used
                </div>
                <div className="flex flex-wrap gap-2">
                  {solution.key_theorems.map((t, i) => (
                    <span key={i} className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-xs font-bold text-slate-300 flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-teal-400" /> {t}
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
