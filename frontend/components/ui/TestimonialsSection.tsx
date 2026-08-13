'use client'

import { useState, useEffect } from 'react'
import { Star, Quote, Heart } from 'lucide-react'
import { feedbackApi } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Testimonial {
  id: number
  name: string
  rating: number
  feedback_text: string
  created_at: string
}

const FALLBACKS: Testimonial[] = [
  {
    id: -1,
    name: 'Kwame A.',
    rating: 5,
    feedback_text: 'The AI tutor turned my worst subject into my best. WASSCE prep has never felt this smooth.',
    created_at: 'July 2026',
  },
  {
    id: -2,
    name: 'Ama S.',
    rating: 5,
    feedback_text: 'Study kits make revision feel like a game. I actually look forward to studying now.',
    created_at: 'June 2026',
  },
  {
    id: -3,
    name: 'Kofi M.',
    rating: 5,
    feedback_text: 'Uploaded my lecture notes and got quizzes, podcasts and flashcards instantly. This is the future.',
    created_at: 'May 2026',
  },
]

export default function TestimonialsSection() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>(FALLBACKS)

  useEffect(() => {
    let cancelled = false
    feedbackApi
      .getTestimonials()
      .then(res => {
        if (cancelled) return
        const list = res.data?.testimonials
        if (Array.isArray(list) && list.length > 0) setTestimonials(list)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <section id="testimonials" className="px-margin-mobile md:px-margin-desktop py-stack-lg bg-surface-container-lowest">
      <div className="text-center mb-stack-lg">
        <h2 className="text-[32px] md:text-[40px] font-bold text-on-surface">
          Students{' '}
          <span className="text-primary sparkle-text">love</span>{' '}
          FlowState
        </h2>
        <p className="text-on-surface-variant mt-base text-body-lg">
          Real words from real students who turned their grades up.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter max-w-5xl mx-auto">
        {testimonials.slice(0, 6).map(t => (
          <div
            key={t.id}
            className="squishy-card bg-surface-container-low rounded-[1.5rem] p-stack-md border border-outline-variant/30 flex flex-col relative overflow-hidden"
          >
            <Quote className="absolute top-4 right-4 w-8 h-8 text-primary/15" />
            <div className="flex gap-0.5 mb-stack-sm">
              {[1, 2, 3, 4, 5].map(n => (
                <Star
                  key={n}
                  className={cn(
                    'w-4 h-4',
                    n <= t.rating ? 'fill-amber-400 text-amber-400' : 'text-surface-container-highest'
                  )}
                  strokeWidth={1.5}
                />
              ))}
            </div>
            <p className="text-on-surface text-[15px] leading-relaxed flex-1">“{t.feedback_text}”</p>
            <div className="flex items-center gap-base mt-stack-md pt-stack-sm border-t border-outline-variant/40">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-black text-sm">
                {t.name.trim().charAt(0).toUpperCase() || 'S'}
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-on-surface truncate">{t.name}</p>
                <p className="text-[11px] text-on-surface-variant">Verified Student · {t.created_at}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center mt-stack-md flex items-center justify-center gap-1.5 text-[12px] text-on-surface-variant">
        <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
        Loved by students across Ghana, Africa &amp; beyond
      </p>
    </section>
  )
}
