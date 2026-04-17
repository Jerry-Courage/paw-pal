'use client'

import React from 'react'
import { TooltipRenderProps } from 'react-joyride'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronLeft, X, Sparkles } from 'lucide-react'

export const PremiumTooltip = ({
  continuous,
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
  size,
  isLastStep,
}: TooltipRenderProps) => {
  return (
    <motion.div
      {...tooltipProps}
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      className="max-w-sm w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl shadow-2xl p-6 relative overflow-hidden group pointer-events-auto"
    >
      {/* Decorative Gradient Background */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-sky-500/20 rounded-full blur-3xl pointer-events-none group-hover:bg-sky-500/30 transition-colors duration-500" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-500/30 transition-colors duration-500" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-2 px-3 py-1 bg-sky-500/10 rounded-full border border-sky-500/20">
          <Sparkles className="w-3 h-3 text-sky-500" />
          <span className="text-[10px] uppercase tracking-wider font-bold text-sky-600 dark:text-sky-400">
            Feature Walkthrough
          </span>
        </div>
        <button
          {...closeProps}
          className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
        >
          <X className="w-4 h-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" />
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {step.title && (
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 leading-tight">
            {step.title}
          </h3>
        )}
        <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
          {step.content}
        </div>
      </div>

      {/* Footer / Controls */}
      <div className="flex items-center justify-between relative z-10 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
        <div className="text-[10px] font-medium text-slate-400">
          Step {index + 1} of {size}
        </div>
        
        <div className="flex items-center gap-3">
          {!isLastStep && (
            <button
              {...skipProps}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mr-2"
            >
              Skip
            </button>
          )}

          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                {...backProps}
                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all shadow-sm"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </button>
            )}
            
            <button
              {...primaryProps}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-sky-500/25 active:scale-95 ${
                isLastStep 
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20' 
                  : 'bg-sky-500 hover:bg-sky-600 text-white shadow-sky-500/20'
              }`}
            >
              <span>{isLastStep ? 'Got it!' : 'Next'}</span>
              {!isLastStep && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
