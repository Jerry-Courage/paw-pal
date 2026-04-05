'use client'

import React, { useState } from 'react'
import { 
  X, Calculator, Sparkles, Brain, CheckCircle2, 
  ArrowRight, Info, AlertCircle, Loader2
} from 'lucide-react'
import { libraryApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import katex from 'katex'
import DigitalBlackboard from './DigitalBlackboard'

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

interface MathSolverModalProps {
  isOpen: boolean
  onClose: () => void
  resourceId: number
  initialProblem?: string
}

export default function MathSolverModal({ isOpen, onClose, resourceId, initialProblem }: MathSolverModalProps) {
  const [problem, setProblem] = useState('')
  const [isSolving, setIsSolving] = useState(false)
  const [solution, setSolution] = useState<MathSolution | null>(null)

  // Handle pre-filled problem from context (notes)
  React.useEffect(() => {
    if (isOpen && initialProblem) {
      setProblem(initialProblem)
      setSolution(null) // Reset previous solution
    }
  }, [isOpen, initialProblem])

  const handleSolve = async () => {
    if (!problem.trim()) return
    setIsSolving(true)
    try {
      const res = await libraryApi.solveMath(resourceId, problem)
      setSolution(res.data)
    } catch (error) {
      toast.error('Could not solve this problem. Try simplifying it.')
    } finally {
      setIsSolving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 py-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Calculator className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Math Solver</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Step-by-Step AI Solutions</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-transform active:scale-90"
          >
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
          {!solution ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                  Describe your problem
                </label>
                <textarea
                  autoFocus
                  placeholder="e.g. Find the derivative of f(x) = sin(x^2) + 5x..."
                  className="w-full h-40 p-6 bg-slate-50 dark:bg-slate-950/50 border-2 border-slate-200 dark:border-slate-800 rounded-3xl text-lg font-medium outline-none focus:ring-4 ring-primary/10 focus:border-primary transition-all resize-none"
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                />
              </div>

              <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10 flex gap-4">
                <Info className="w-6 h-6 text-primary shrink-0" />
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                  Tip: Be specific! If this problem relates to a formula in your notes, mentioning it helps the AI provide a more contextual solution.
                </p>
              </div>

              <button
                disabled={!problem.trim() || isSolving}
                onClick={handleSolve}
                className={cn(
                  "w-full py-5 rounded-full text-white font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-[0.98]",
                  isSolving ? "bg-slate-700 pointer-events-none" : "bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20"
                )}
              >
                {isSolving ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-6 h-6" />
                    Solve Step-by-Step
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              {/* Reset Tool */}
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Problem Result</span>
                <button 
                  onClick={() => { setSolution(null); setProblem(''); }}
                  className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                >
                  Solve Another
                </button>
              </div>

              {/* Steps */}
              <div className="space-y-6">
                {solution.steps.map((step, idx) => (
                  <div key={idx} className="group flex gap-6">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 border-2 border-primary/20 flex items-center justify-center text-primary font-black text-xs">
                        {idx + 1}
                      </div>
                      {idx !== solution.steps.length - 1 && (
                        <div className="w-0.5 flex-1 bg-gradient-to-b from-primary/20 to-transparent my-2" />
                      )}
                    </div>
                    <div className="flex-1 pb-8">
                      <div className="font-black text-slate-800 dark:text-white uppercase tracking-tighter text-sm mb-2 opacity-50">
                        {step.label}
                      </div>
                      <DigitalBlackboard label={step.label} variant="mini">
                        <div 
                          dangerouslySetInnerHTML={{ 
                            __html: katex.renderToString(step.formula.replace(/\$/g, ''), { displayMode: true, throwOnError: false }) 
                          }} 
                        />
                      </DigitalBlackboard>
                      <p className="text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed italic">
                        &quot;{step.explanation}&quot;
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Final Result */}
              <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-2xl shadow-emerald-500/20 relative overflow-hidden">
                <Sparkles className="absolute -top-4 -right-4 w-24 h-24 text-white/10 rotate-12" />
                <div className="relative space-y-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6" />
                    <span className="font-black uppercase tracking-widest text-xs opacity-80">Final Solution</span>
                  </div>
                  <div className="text-4xl font-black tracking-tighter overflow-x-auto">
                    <div 
                      dangerouslySetInnerHTML={{ 
                        __html: katex.renderToString(solution.final_answer.replace(/\$/g, ''), { displayMode: true, throwOnError: false }) 
                      }} 
                    />
                  </div>
                </div>
              </div>

              {/* Theorems */}
              {solution.key_theorems.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                    <Brain className="w-3.5 h-3.5" /> Core Concepts Used
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {solution.key_theorems.map((t, idx) => (
                      <span key={idx} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2 border border-slate-200/50 dark:border-slate-700/50">
                        <CheckCircle2 className="w-3 h-3 text-primary" /> {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
