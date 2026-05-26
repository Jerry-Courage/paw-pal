'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Mail, Lock, User, Eye, EyeOff, ArrowRight, Check,
  Brain, BookOpen, Layers, Headphones, Sparkles, ChevronLeft
} from 'lucide-react'
import { toast } from 'sonner'
import { authApi } from '@/lib/api'
import { cn } from '@/lib/utils'

const STEPS = [
  { label: 'Account',  hint: 'Set up your credentials' },
  { label: 'Profile',  hint: 'Tell us about yourself' },
  { label: 'Done',     hint: '' },
]

const FEATURES = [
  { icon: Brain,      color: 'text-orange-400 bg-orange-500/10', title: 'AI Tutor',       desc: 'Understands your exact materials' },
  { icon: Layers,     color: 'text-sky-400 bg-sky-500/10',       title: 'Flashcards',     desc: 'Spaced repetition that adapts' },
  { icon: Headphones, color: 'text-pink-400 bg-pink-500/10',     title: 'Study Podcasts', desc: 'Audio deep-dives from any doc' },
  { icon: BookOpen,   color: 'text-violet-400 bg-violet-500/10', title: 'Smart Notes',    desc: 'Structured notes in seconds' },
]

export default function SignupPage() {
  const router = useRouter()
  const { status } = useSession()
  const [step, setStep]         = useState(0)
  const [loading, setLoading]   = useState(false)
  const [showPw, setShowPw]     = useState(false)
  const [errors, setErrors]     = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    email: '', username: '', first_name: '', last_name: '',
    password: '', password2: '', university: '',
  })

  // Only redirect if already authenticated when page loads (e.g. back button after login)
  // Don't use this to handle post-signup redirect — that's done in handleSubmit directly
  useEffect(() => {
    if (status === 'authenticated' && step === 0) router.push('/dashboard')
  }, [status, router, step])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    setErrors(err => ({ ...err, [k]: '' }))
  }

  const validateStep0 = () => {
    const errs: Record<string, string> = {}
    if (!form.email) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Invalid email address'
    if (!form.password) errs.password = 'Password is required'
    else if (form.password.length < 8) errs.password = 'At least 8 characters required'
    if (form.password !== form.password2) errs.password2 = 'Passwords do not match'
    return errs
  }

  const handleNext = () => {
    if (step === 0) {
      const errs = validateStep0()
      if (Object.keys(errs).length > 0) { setErrors(errs); return }
    }
    setStep(s => s + 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username) { setErrors({ username: 'Username is required' }); return }
    setLoading(true)
    try {
      await authApi.register({
        email: form.email.trim().toLowerCase(),
        username: form.username.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        password: form.password,
        password2: form.password2,
      })
      const res = await signIn('credentials', {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        redirect: false,
      })
      if (res?.ok) {
        // Show success state briefly then redirect immediately
        // Don't use setTimeout — it races with the useEffect session watcher
        // and causes the stuck-button bug on slow connections
        setStep(2)
        router.push('/dashboard')
      } else {
        toast.error('Account created but sign-in failed. Please log in.')
        router.push('/login')
      }
    } catch (err: any) {
      const data = err.response?.data
      if (typeof data === 'object') {
        const fieldErrors: Record<string, string> = {}
        Object.entries(data).forEach(([k, v]) => {
          fieldErrors[k] = Array.isArray(v) ? v[0] : String(v)
        })
        setErrors(fieldErrors)
        if (fieldErrors.email || fieldErrors.password) setStep(0)
      } else {
        toast.error('Registration failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Password strength
  const strength = (() => {
    const p = form.password
    if (!p) return 0
    let s = 0
    if (p.length >= 8) s++
    if (/[A-Z]/.test(p)) s++
    if (/[0-9]/.test(p)) s++
    if (/[^A-Za-z0-9]/.test(p)) s++
    return s
  })()
  const strengthMeta = [
    null,
    { label: 'Weak',   color: 'bg-red-400',     text: 'text-red-400'     },
    { label: 'Fair',   color: 'bg-orange-400',   text: 'text-orange-400'  },
    { label: 'Good',   color: 'bg-yellow-400',   text: 'text-yellow-400'  },
    { label: 'Strong', color: 'bg-emerald-400',  text: 'text-emerald-400' },
  ][strength]

  // Shared input class
  const inputCls = (err?: string) => cn(
    'w-full bg-[#141414] border rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-colors',
    err ? 'border-red-500/50 focus:border-red-500/70' : 'border-white/[0.08] focus:border-orange-500/50'
  )

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">

      {/* ── Left: Form panel ─────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 lg:px-16 min-h-screen">
        <div className="w-full max-w-sm">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 mb-8 w-fit">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-[#1a1a1a]">
              <img src="/images/logo-pwa.png" alt="FlowState" className="w-full h-full object-cover" />
            </div>
            <span className="text-lg font-black text-white tracking-tight">
              Flow<span className="text-orange-500">State</span>
            </span>
          </Link>

          {/* Step indicator */}
          {step < 2 && (
            <div className="flex items-center gap-1.5 mb-8">
              {STEPS.slice(0, 2).map((s, i) => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black transition-all duration-300',
                    i < step  ? 'bg-orange-500 text-white' :
                    i === step ? 'bg-orange-500 text-white ring-4 ring-orange-500/20' :
                                 'bg-white/[0.06] text-slate-600'
                  )}>
                    {i < step ? <Check className="w-3 h-3" /> : i + 1}
                  </div>
                  <span className={cn(
                    'text-xs font-semibold transition-colors',
                    i === step ? 'text-white' : 'text-slate-600'
                  )}>
                    {s.label}
                  </span>
                  {i < 1 && (
                    <div className={cn('w-10 h-px mx-1 transition-colors', i < step ? 'bg-orange-500' : 'bg-white/[0.08]')} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Step 0: Credentials ── */}
          {step === 0 && (
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight leading-tight mb-1.5">
                Create account
              </h1>
              <p className="text-slate-500 text-sm mb-7">Free forever. No credit card needed.</p>

              <div className="space-y-3">
                {/* Email */}
                <div>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                    <input
                      type="email" placeholder="your@email.com"
                      value={form.email} onChange={set('email')}
                      autoComplete="email"
                      className={cn(inputCls(errors.email), 'pl-10')}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-400 mt-1.5 pl-1">{errors.email}</p>}
                </div>

                {/* Password */}
                <div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                    <input
                      type={showPw ? 'text' : 'password'} placeholder="Create a password"
                      value={form.password} onChange={set('password')}
                      autoComplete="new-password"
                      className={cn(inputCls(errors.password), 'pl-10 pr-10')}
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Strength bar */}
                  {form.password && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-1 flex-1">
                        {[1,2,3,4].map(i => (
                          <div key={i} className={cn(
                            'h-1 flex-1 rounded-full transition-all duration-300',
                            i <= strength ? strengthMeta?.color : 'bg-white/[0.06]'
                          )} />
                        ))}
                      </div>
                      {strengthMeta && (
                        <span className={cn('text-[11px] font-bold', strengthMeta.text)}>{strengthMeta.label}</span>
                      )}
                    </div>
                  )}
                  {errors.password && <p className="text-xs text-red-400 mt-1.5 pl-1">{errors.password}</p>}
                </div>

                {/* Confirm password */}
                <div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                    <input
                      type="password" placeholder="Confirm password"
                      value={form.password2} onChange={set('password2')}
                      autoComplete="new-password"
                      className={cn(inputCls(errors.password2), 'pl-10 pr-10')}
                    />
                    {form.password2 && form.password === form.password2 && (
                      <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  {errors.password2 && <p className="text-xs text-red-400 mt-1.5 pl-1">{errors.password2}</p>}
                </div>

                <button
                  onClick={handleNext}
                  className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-white font-bold text-sm rounded-xl py-3 transition-all shadow-lg shadow-orange-500/20 mt-1"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-[11px] text-slate-600">Have an account?</span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>

              <Link href="/login"
                className="w-full flex items-center justify-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-white font-bold text-sm rounded-xl py-3 transition-all">
                Sign in instead
              </Link>
            </div>
          )}

          {/* ── Step 1: Profile ── */}
          {step === 1 && (
            <form onSubmit={handleSubmit}>
              <h1 className="text-3xl font-black text-white tracking-tight leading-tight mb-1.5">
                Your profile
              </h1>
              <p className="text-slate-500 text-sm mb-7">Help us personalize your experience.</p>

              <div className="space-y-3">
                {/* Name row */}
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    placeholder="First name" value={form.first_name} onChange={set('first_name')}
                    className={inputCls()}
                  />
                  <input
                    placeholder="Last name" value={form.last_name} onChange={set('last_name')}
                    className={inputCls()}
                  />
                </div>

                {/* Username */}
                <div>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                    <input
                      placeholder="Username" value={form.username} onChange={set('username')}
                      required
                      className={cn(inputCls(errors.username), 'pl-10')}
                    />
                  </div>
                  {errors.username && <p className="text-xs text-red-400 mt-1.5 pl-1">{errors.username}</p>}
                </div>

                {/* University */}
                <input
                  placeholder="University / Institution (optional)"
                  value={form.university} onChange={set('university')}
                  className={inputCls()}
                />

                {/* Server-side email error */}
                {errors.email && (
                  <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                    {errors.email}
                  </div>
                )}

                <button
                  type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl py-3 transition-all shadow-lg shadow-orange-500/20 mt-1"
                >
                  {loading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating account…</>
                  ) : (
                    <>Create Account <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <button
                  type="button" onClick={() => setStep(0)}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-slate-600 hover:text-slate-300 transition-colors py-2"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
              </div>
            </form>
          )}

          {/* ── Step 2: Done ── */}
          {step === 2 && (
            <div className="text-center py-8">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping opacity-40" />
                <div className="relative w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/30">
                  <Check className="w-9 h-9 text-white" />
                </div>
              </div>
              <h1 className="text-3xl font-black text-white mb-2 tracking-tight">You're in!</h1>
              <p className="text-slate-500 text-sm mb-6">Setting up your workspace…</p>
              <div className="w-6 h-6 border-2 border-orange-500/40 border-t-orange-500 rounded-full animate-spin mx-auto" />
            </div>
          )}

          {step < 2 && (
            <p className="text-center text-[11px] text-slate-700 mt-8 leading-relaxed">
              By continuing you agree to our{' '}
              <span className="text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">Terms</span>
              {' '}and{' '}
              <span className="text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">Privacy Policy</span>.
            </p>
          )}
        </div>
      </div>

      {/* ── Right: Visual panel (desktop only) ───────────── */}
      <div className="hidden lg:flex w-[460px] xl:w-[500px] flex-col justify-between bg-[#0f0f0f] border-l border-white/[0.05] px-12 py-14 relative overflow-hidden shrink-0">

        {/* Glows */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Badge */}
        <div className="flex items-center gap-2 w-fit">
          <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-black px-3 py-1.5 rounded-full tracking-widest uppercase">
            <Sparkles className="w-3 h-3" />
            AI Study Platform
          </div>
        </div>

        {/* Copy */}
        <div className="space-y-6">
          <div>
            <h2 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight mb-4">
              Everything you need<br />
              to <span className="text-orange-400">ace any subject.</span>
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
              Upload any material — PDF, video, slides — and get a full study kit in seconds.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-2.5">
            {FEATURES.map(f => (
              <div key={f.title} className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:border-white/10 transition-colors">
                <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', f.color)}>
                  <f.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-none mb-0.5">{f.title}</p>
                  <p className="text-xs text-slate-600">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Social proof */}
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {['bg-orange-400', 'bg-emerald-400', 'bg-violet-400', 'bg-sky-400', 'bg-pink-400'].map((c, i) => (
              <div key={i} className={cn('w-7 h-7 rounded-full border-2 border-[#0f0f0f]', c)} />
            ))}
          </div>
          <div>
            <p className="text-xs font-bold text-white">50,000+ students</p>
            <p className="text-[11px] text-slate-600">Stanford · MIT · Cambridge</p>
          </div>
        </div>
      </div>
    </div>
  )
}
