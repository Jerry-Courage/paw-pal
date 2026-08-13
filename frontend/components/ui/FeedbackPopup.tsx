'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Star, Send, Megaphone, Loader2, Heart, User } from 'lucide-react'
import { toast } from 'sonner'
import { feedbackApi } from '@/lib/api'
import { cn } from '@/lib/utils'

interface FeedbackPopupProps {
  userName?: string
}

const STORAGE_KEY = 'fs_feedback_state'
const MIN_ACTIVE_DAYS = 3       // "consistent use": visited on 3+ distinct days
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000   // at most once per week
const DELAY_MS = 45 * 1000      // wait 45s into the session so it's "after use"
const TRIGGER_CHANCE = 0.5      // random 50% so it feels organic

const QUICK_PRAISES = [
  'Helps me understand tough topics fast!',
  'The AI tutor is actually good — I improved my grades.',
  'Study kits make revision feel like a game.',
  'Best study platform for African students. Period.',
]

interface FeedbackState {
  days: string[]
  lastShown: number
}

function loadState(): FeedbackState {
  if (typeof window === 'undefined') return { days: [], lastShown: 0 }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { days: [], lastShown: 0, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { days: [], lastShown: 0 }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export default function FeedbackPopup({ userName }: FeedbackPopupProps) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [rating, setRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [text, setText] = useState('')
  const [shareAsTestimonial, setShareAsTestimonial] = useState(false)
  const [displayName, setDisplayName] = useState(userName || '')
  const [submitting, setSubmitting] = useState(false)

  // ── Random trigger after consistent use ─────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Track this as an active day
    const state = loadState()
    const today = todayKey()
    if (!state.days.includes(today)) {
      state.days.push(today)
      if (state.days.length > 30) state.days = state.days.slice(-30)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
    }

    const eligible =
      state.days.length >= MIN_ACTIVE_DAYS &&
      Date.now() - state.lastShown > COOLDOWN_MS

    if (!eligible) return

    const timer = setTimeout(() => {
      if (Math.random() < TRIGGER_CHANCE) setVisible(true)
    }, DELAY_MS)

    return () => clearTimeout(timer)
  }, [])

  const close = useCallback(() => {
    setDismissed(true)
    // Remember we showed it so we don't nag for another week
    const state = loadState()
    state.lastShown = Date.now()
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
    setVisible(false)
  }, [])

  const submit = async () => {
    if (!text.trim()) {
      toast.error('Add a quick word about your experience first!')
      return
    }
    setSubmitting(true)
    try {
      await feedbackApi.submit(
        rating,
        text.trim(),
        shareAsTestimonial,
        shareAsTestimonial ? displayName.trim() : ''
      )
      toast.success('Thanks a lot! Your feedback helps make FlowState better 💜')
      const state = loadState()
      state.lastShown = Date.now()
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
      setVisible(false)
      setDismissed(true)
    } catch {
      toast.error('Could not submit feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (dismissed || !visible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[160] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={close}
      >
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="w-full sm:max-w-md bg-surface-container-low rounded-t-[2rem] sm:rounded-2xl border border-outline-variant shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-6 pt-6 pb-5 text-center border-b border-outline-variant/50">
            <button
              onClick={close}
              className="absolute top-4 right-4 p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 bg-secondary-container/60 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Megaphone className="w-6 h-6 text-on-secondary-container" />
            </div>
            <h2 className="text-xl font-black text-on-surface tracking-tight mb-1">
              How&apos;s FlowState treating you?
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              You&apos;ve been grinding this week — take 30 seconds to help us level up the platform.
            </p>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4 max-h-[55vh] overflow-y-auto">
            {/* Star rating */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(n)}
                    className="transition-transform hover:scale-125 active:scale-95"
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={cn(
                        'w-9 h-9 transition-colors',
                        n <= (hoverRating || rating)
                          ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]'
                          : 'text-surface-container-highest'
                      )}
                      strokeWidth={1.5}
                    />
                  </button>
                ))}
              </div>
              <span className="text-xs font-bold text-primary uppercase tracking-widest">
                {rating >= 5 ? 'Absolutely cracked' : rating === 4 ? 'Really solid' : rating === 3 ? 'Decent, could improve' : rating <= 2 ? 'We need to fix things' : ''}
              </span>
            </div>

            {/* Quick chips */}
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_PRAISES.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setText(p)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                    text === p
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container-high text-on-surface-variant border-outline-variant hover:border-primary/50'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Comment */}
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={3}
              placeholder="Tell us what you love (or what to improve)…"
              className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 resize-none transition-all"
            />

            {/* Share as testimonial */}
            <div className="rounded-xl border border-outline-variant/60 bg-surface-container-high/60 p-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={shareAsTestimonial}
                  onChange={e => setShareAsTestimonial(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-primary"
                />
                <span className="text-sm">
                  <span className="flex items-center gap-1.5 font-bold text-on-surface">
                    <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                    Show this as a public testimonial
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    Your words could inspire another student on our homepage.
                  </span>
                </span>
              </label>

              {shareAsTestimonial && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-on-surface-variant shrink-0" />
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder={userName || 'Your name'}
                    className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary/60 transition-all"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 space-y-2">
            <button
              onClick={submit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-on-primary font-bold text-sm rounded-xl py-3.5 transition-all shadow-lg shadow-primary/25 btn-3d"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              ) : (
                <><Send className="w-4 h-4" /> Send Feedback</>
              )}
            </button>
            <button
              onClick={close}
              className="w-full text-xs text-on-surface-variant hover:text-on-surface transition-colors py-1"
            >
              Not now
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
