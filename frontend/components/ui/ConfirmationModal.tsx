import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  isLoading?: boolean
  title: string
  message: string
  confirmText: string
  type?: 'danger' | 'warning'
}

export default function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  isLoading,
  title, 
  message, 
  confirmText,
  type = 'warning' 
}: ConfirmationModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-xl" 
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm bg-[#0a0a0b]/90 border border-white/10 rounded-[2rem] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
      >
        <div className="p-8 pb-4">
          <div className="flex items-center gap-4 mb-6">
            <div className={cn(
               "w-12 h-12 rounded-2xl flex items-center justify-center shadow-2xl relative z-10 border border-white/10",
               type === 'danger' ? "bg-red-500/10 text-red-500" : "bg-zinc-800 text-zinc-400"
            )}>
              {type === 'danger' ? <AlertTriangle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="font-black text-white text-lg tracking-tight uppercase">{title}</h2>
              <div className="flex items-center gap-2">
                 <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", type === 'danger' ? "bg-red-400" : "bg-zinc-500")} />
                 <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest leading-none">Authorization Required</span>
              </div>
            </div>
          </div>

          <p className="text-sm text-zinc-400 font-medium leading-relaxed mb-8">
            {message}
          </p>
        </div>

        <div className="p-8 pt-0 grid grid-cols-2 gap-4">
          <button 
            onClick={onClose}
            disabled={isLoading}
            className="py-4 bg-zinc-900 border border-white/5 text-zinc-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-50"
          >
            Abort
          </button>
          <button 
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50",
              type === 'danger' 
                ? "bg-red-600 text-white hover:bg-red-500 shadow-red-600/20" 
                : "bg-white text-black hover:bg-zinc-200 shadow-white/10"
            )}
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
