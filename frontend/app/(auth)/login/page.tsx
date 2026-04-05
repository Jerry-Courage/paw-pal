'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Zap, Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles } from 'lucide-react'

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
    const err = searchParams.get('error')
    if (err) setError('Invalid email or password. Please try again.')
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
    if (res?.ok) {
      router.push('/dashboard')
    } else {
      setError('Invalid email or password. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 grid lg:grid-cols-2">
      {/* Left — form */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12">
        <Link href="/" className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center shadow-lg shadow-sky-200 dark:shadow-sky-900">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg text-gray-900 dark:text-white">FlowState</span>
        </Link>

        <div className="flex gap-2 mb-8">
          <div className="w-8 h-1.5 bg-sky-500 rounded-full" />
          <div className="w-4 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="w-4 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Welcome back</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm leading-relaxed">
          Log in to your workspace or create a new account to start studying with AI.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <button disabled className="btn-secondary flex items-center justify-center gap-2 text-sm opacity-50 cursor-not-allowed">
            🌐 Google
          </button>
          <button disabled className="btn-secondary flex items-center justify-center gap-2 text-sm opacity-50 cursor-not-allowed">
            🐙 Github
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
          <span className="text-xs text-gray-400 font-medium tracking-wider">OR CONTINUE WITH EMAIL</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              placeholder="name@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input pl-10"
              required
              autoComplete="email"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pl-10 pr-10"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
              <input type="checkbox" className="accent-sky-500" />
              Remember me
            </label>
            <button type="button" className="text-sm text-sky-500 hover:underline">
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base"
          >
            {loading ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing in...</>
            ) : (
              <>Get Started <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          New to FlowState?{' '}
          <Link href="/signup" className="text-sky-500 font-semibold hover:underline">Sign up for free</Link>
        </p>
      </div>

      {/* Right — promo */}
      <div className="hidden lg:flex flex-col justify-center bg-gradient-to-br from-sky-50 via-white to-violet-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 px-16 py-12 border-l border-gray-100 dark:border-gray-800">
        <div className="inline-flex items-center gap-2 bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 w-fit tracking-wider">
          <Sparkles className="w-3 h-3" /> THE "THIRD MEMBER" OF YOUR STUDY GROUP
        </div>
        <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-4 leading-tight">
          Study smarter,{' '}
          <span className="text-sky-500 italic">together.</span>
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8 leading-relaxed text-sm">
          Connect your materials, invite your classmates, and let our AI facilitate your
          collaborative sessions with real-time flashcards and summaries.
        </p>
        <div className="card p-5 shadow-xl mb-8 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-sky-500 rounded-full flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-3/4 mb-1.5" />
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full w-1/2" />
            </div>
          </div>
          <div className="h-px bg-gray-100 dark:bg-gray-800 mb-4" />
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-sky-50 dark:bg-sky-950/50 rounded-xl p-3 border border-sky-100 dark:border-sky-900">
              <span className="text-xs text-sky-600 dark:text-sky-400 font-semibold">Concept</span>
              <div className="h-2 bg-sky-200 dark:bg-sky-800 rounded-full mt-2 w-3/4" />
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/50 rounded-xl p-3 border border-emerald-100 dark:border-emerald-900">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Quiz</span>
              <div className="h-2 bg-emerald-200 dark:bg-emerald-800 rounded-full mt-2 w-2/3" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {['bg-sky-400', 'bg-emerald-400', 'bg-violet-400', 'bg-orange-400'].map((c, i) => (
              <div key={i} className={`w-9 h-9 rounded-full ${c} border-2 border-white dark:border-gray-950`} />
            ))}
            <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-950 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">+12</div>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">Joined by 1,200+ students this week</span>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
