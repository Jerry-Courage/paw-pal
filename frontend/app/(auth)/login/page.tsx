'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Brain, BookOpen, Layers, Headphones } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'authenticated') router.push('/dashboard')
  }, [status, router])

  useEffect(() => {
    if (searchParams.get('error')) setError('Invalid email or password. Please try again.')
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    })
    setLoading(false)
    if (res?.ok) router.push('/dashboard')
    else setError('Invalid email or password. Please try again.')
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] grid lg:grid-cols-2">
      {/* Left — form */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 mb-12 group w-fit">
          <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center overflow-hidden p-0.5">
             <img src="/images/logo-icon.png" alt="NITE Mind" className="w-full h-full object-contain" />
          </div>
          <span className="text-xl font-black text-white uppercase tracking-tight">
            NITE <span className="text-orange-500">Mind</span>
          </span>
        </Link>

        <h1 className="text-3xl font-black text-white tracking-tight mb-2">Welcome back</h1>
        <p className="text-slate-500 text-sm mb-8">Log in to your workspace and keep learning.</p>

        {error && (
          <div className="mb-5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
            <input
              type="email"
              placeholder="name@university.edu"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input pl-10"
              required
              autoComplete="email"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input pl-10 pr-10"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
              <input type="checkbox" className="accent-orange-500 rounded" />
              Remember me
            </label>
            <button type="button" className="text-sm text-orange-400 hover:text-orange-300 transition-colors">
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-base"
          >
            {loading ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing in...</>
            ) : (
              <>Get Started <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        <p className="text-center text-sm text-slate-600 mt-6">
          New to NITE Mind?{' '}
          <Link href="/signup" className="text-orange-400 font-bold hover:text-orange-300 transition-colors">Sign up for free</Link>
        </p>
      </div>

      {/* Right — promo */}
      <div className="hidden lg:flex flex-col justify-center bg-[#111] px-16 py-12 border-l border-white/5">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-black px-3 py-1.5 rounded-full mb-8 w-fit tracking-widest uppercase">
          The AI Study Platform
        </div>
        <h2 className="text-4xl font-black text-white mb-4 leading-tight tracking-tight">
          Study smarter,<br />
          <span className="text-orange-400">not harder.</span>
        </h2>
        <p className="text-slate-500 mb-10 leading-relaxed text-sm">
          Upload any material and get interactive notes, flashcards, quizzes, podcasts, and an AI tutor — all in seconds.
        </p>

        <div className="space-y-3">
          {[
            { icon: Brain,     color: 'bg-orange-500/10 text-orange-400', title: 'AI Personal Tutor',    desc: '24/7 AI that understands your exact materials' },
            { icon: Layers,    color: 'bg-sky-500/10 text-sky-400',       title: 'Smart Flashcards',     desc: 'Spaced repetition that adapts to your memory' },
            { icon: Headphones,color: 'bg-pink-500/10 text-pink-400',     title: 'Study Podcasts',       desc: 'Turn any document into an audio deep-dive' },
            { icon: BookOpen,  color: 'bg-violet-500/10 text-violet-400', title: 'AI Study Notes',       desc: 'Structured notes generated from your uploads' },
          ].map(f => (
            <div key={f.title} className="flex items-center gap-4 p-4 rounded-2xl bg-white/3 border border-white/5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${f.color}`}>
                <f.icon className="w-4.5 h-4.5" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">{f.title}</div>
                <div className="text-xs text-slate-600 mt-0.5">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <div className="flex -space-x-2">
            {['bg-orange-400', 'bg-emerald-400', 'bg-violet-400', 'bg-sky-400'].map((c, i) => (
              <div key={i} className={`w-8 h-8 rounded-full ${c} border-2 border-[#111]`} />
            ))}
          </div>
          <span className="text-sm text-slate-600">Joined by 50,000+ students</span>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d]">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
