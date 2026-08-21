'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { normalizeForRendering } from '@/lib/mathFormatting'

interface Formula {
  latex: string
  label?: string
  variables?: { name: string; meaning: string }[]
  explanation?: string
}

export function FormulaCard({ formula, index }: { formula: Formula; index: number }) {
  const [showVars, setShowVars] = useState(false)
  const hasVars = formula.variables && formula.variables.length > 0

  return (
    <div className="bg-surface-container rounded-[1rem] border border-outline-variant/20 overflow-hidden">
      <div className="px-4 py-4">
        {formula.label && (
          <p className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider mb-2 font-medium">{formula.label}</p>
        )}
        <div className="bg-[#0a0a0f] rounded-xl px-4 py-4 border border-outline-variant/10">
          <div className="prose prose-invert max-w-none text-[16px] sm:text-[18px] text-center">
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {normalizeForRendering(formula.latex)}
            </ReactMarkdown>
          </div>
        </div>
      </div>
      {formula.explanation && (
        <div className="px-4 pb-3">
          <p className="text-[12px] text-on-surface-variant leading-relaxed">{formula.explanation}</p>
        </div>
      )}
      {hasVars && (
        <div className="border-t border-outline-variant/15">
          <button onClick={() => setShowVars(!showVars)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold text-primary hover:bg-surface-container-high transition-colors">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">data_object</span>
              What each part means
            </span>
            <span className="material-symbols-outlined text-[14px] transition-transform"
              style={{ transform: showVars ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
          </button>
          {showVars && (
            <div className="px-4 pb-3 animate-in slide-in-from-top-1 duration-200">
              <div className="space-y-1.5">
                {formula.variables!.map((v, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-black text-primary">{String.fromCharCode(65 + i)}</span>
                    </div>
                    <div>
                      <span className="font-bold text-on-surface">{v.name}</span>
                      <span className="text-on-surface-variant/70 mx-1.5">-</span>
                      <span className="text-on-surface-variant">{v.meaning}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function FormulaBreakdown({ formulas }: { formulas: Formula[] }) {
  if (!formulas.length) return null
  return (
    <div className="space-y-3">
      {formulas.map((f, i) => <FormulaCard key={i} formula={f} index={i} />)}
    </div>
  )
}
