'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles, Zap, BookOpen, Headphones, Brain, Layers } from 'lucide-react'
import SplashScreen from '@/components/ui/SplashScreen'
import { cn } from '@/lib/utils'

const FEATURES = [
  { icon: Brain,      color: 'text-orange-400 bg-orange-500/10',  title: 'AI Tutor',        desc: 'Understands your exact materials' },
  { icon: Layers,     color: 'text-sky-400 bg-sky-500/10',        title: 'Flashcards',      desc: 'Spaced repetition that adapts' },
  { icon: Headphones, color: 'text-pink-400 bg-pink-500/10',      title: 'Study Podcasts',  desc: 'Audio deep-dives from any doc' },
  { icon: BookOpen,   color: 'text-violet-400 bg-violet-500/10',  title: 'Smart Notes',     desc: 'Structured notes in seconds' },
]

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status } = useSession()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => { if (status === 'authenticated') router.push('/dashboard') }, [status, router])
  useEffect(() => { if (searchParams.get('error')) setError('Invalid email or password.') }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signIn('credentials', {
      email: email.trim().toLowerCase(), password, redirect: false,
    })
    setLoading(false)
    if (res?.ok) router.push('/dashboard')
    else setError('Invalid email or password. Please try again.')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">

      {/* ── Left: Form panel ─────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 lg:px-16 min-h-screen">
        <div className="w-full max-w-sm">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 mb-10 w-fit group">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-[#1a1a1a]">
              <img src="/images/logo-pwa.png" alt="FlowState" className="w-full h-full object-cover" />
            </div>
            <span className="text-lg font-black text-white tracking-tight">
              Flow<span className="text-orange-500">State</span>
            </span>
          </Link>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-black text-white tracking-tight leading-tight mb-2">
              Welcome back
            </h1>
            <p className="text-slate-500 text-sm">
              Sign in to continue your learning journey.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Email */}
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-[#141414] border border-white/[0.08] rounded-xl px-4 py-3 pl-10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-[#141414] border border-white/[0.08] rounded-xl px-4 py-3 pl-10 pr-10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Remember / Forgot */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                <input type="checkbox" className="accent-orange-500 rounded w-3.5 h-3.5" />
                Remember me
              </label>
              <button type="button" className="text-xs text-orange-400 hover:text-orange-300 transition-colors">
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl py-3 transition-all shadow-lg shadow-orange-500/20 mt-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[11px] text-slate-600 font-medium">or continue with</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* OAuth buttons */}
          <div className="space-y-2.5">
            <button
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 active:scale-[0.98] text-gray-800 font-bold text-sm rounded-xl py-3 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <button
              onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
              className="w-full flex items-center justify-center gap-3 bg-[#24292e] hover:bg-[#2f363d] active:scale-[0.98] text-white font-bold text-sm rounded-xl py-3 transition-all"
            >
              <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Continue with GitHub
            </button>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[11px] text-slate-600 font-medium">New here?</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <Link
            href="/signup"
            className="w-full flex items-center justify-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-white font-bold text-sm rounded-xl py-3 transition-all mt-2.5"
          >
            Create a free account
          </Link>

          <p className="text-center text-[11px] text-slate-700 mt-8 leading-relaxed">
            By signing in you agree to our{' '}
            <span className="text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">Terms</span>
            {' '}and{' '}
            <span className="text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">Privacy Policy</span>.
          </p>
        </div>
      </div>

      {/* ── Right: Visual panel (desktop only) ───────────── */}
      <div className="hidden lg:flex w-[480px] xl:w-[520px] flex-col justify-between bg-[#0f0f0f] border-l border-white/[0.05] px-12 py-14 relative overflow-hidden shrink-0">

        {/* Background glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Top badge */}
        <div className="flex items-center gap-2 w-fit">
          <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-black px-3 py-1.5 rounded-full tracking-widest uppercase">
            <Sparkles className="w-3 h-3" />
            AI Study Platform
          </div>
        </div>

        {/* Main copy */}
        <div className="space-y-6">
          <div>
            <h2 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight mb-4">
              Study smarter,<br />
              <span className="text-orange-400">not harder.</span>
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
              Upload any material — PDF, video, slides — and get a full study kit in seconds.
            </p>
          </div>

          {/* Feature list */}
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

export default function LoginPage() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <LoginForm />
    </Suspense>
  )
}
