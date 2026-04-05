'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Zap, Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, Sparkles, BookOpen, Users } from 'lucide-react'
import { toast } from 'sonner'
import { authApi } from '@/lib/api'
import { cn } from '@/lib/utils'

const STEPS = ['Account', 'Profile', 'Done']

export default function SignupPage() {
  const router = useRouter()
  const { status } = useSession()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    email: '',
    username: '',
    first_name: '',
    last_name: '',
    password: '',
    password2: '',
    university: '',
  })

  useEffect(() => {
    if (status === 'authenticated') router.push('/dashboard')
  }, [status, router])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((err) => ({ ...err, [k]: '' }))
  }

  const validateStep0 = () => {
    const errs: Record<string, string> = {}
    if (!form.email) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Invalid email address'
    if (!form.password) errs.password = 'Password is required'
    else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters'
    if (form.password !== form.password2) errs.password2 = 'Passwords do not match'
    return errs
  }

  const handleNext = () => {
    if (step === 0) {
      const errs = validateStep0()
      if (Object.keys(errs).length > 0) { setErrors(errs); return }
    }
    setStep((s) => s + 1)
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
        setStep(2)
        setTimeout(() => router.push('/dashboard'), 1500)
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

  const passwordStrength = () => {
    const p = form.password
    if (!p) return 0
    let score = 0
    if (p.length >= 8) score++
    if (/[A-Z]/.test(p)) score++
    if (/[0-9]/.test(p)) score++
    if (/[^A-Za-z0-9]/.test(p)) score++
    return score
  }

  const strength = passwordStrength()
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength]
  const strengthColor = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400'][strength]

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

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                i < step ? 'bg-sky-500 text-white' :
                i === step ? 'bg-sky-500 text-white ring-4 ring-sky-100 dark:ring-sky-900' :
                'bg-gray-100 dark:bg-gray-800 text-gray-400'
              )}>
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={cn('text-xs font-medium', i === step ? 'text-gray-900 dark:text-white' : 'text-gray-400')}>{s}</span>
              {i < STEPS.length - 1 && <div className={cn('w-8 h-px', i < step ? 'bg-sky-500' : 'bg-gray-200 dark:bg-gray-700')} />}
            </div>
          ))}
        </div>

        {/* Step 0 — Account */}
        {step === 0 && (
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Create your account</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">Free forever. No credit card required.</p>

            <div className="space-y-4">
              <div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    placeholder="name@university.edu"
                    value={form.email}
                    onChange={set('email')}
                    className={cn('input pl-10', errors.email && 'border-red-400 focus:ring-red-400')}
                    autoComplete="email"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>

              <div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
                    value={form.password}
                    onChange={set('password')}
                    className={cn('input pl-10 pr-10', errors.password && 'border-red-400 focus:ring-red-400')}
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.password && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex gap-1 flex-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={cn('h-1 flex-1 rounded-full transition-all', i <= strength ? strengthColor : 'bg-gray-200 dark:bg-gray-700')} />
                      ))}
                    </div>
                    <span className={cn('text-xs font-medium', strength >= 3 ? 'text-emerald-500' : strength >= 2 ? 'text-yellow-500' : 'text-red-400')}>{strengthLabel}</span>
                  </div>
                )}
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              </div>

              <div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    placeholder="Confirm password"
                    value={form.password2}
                    onChange={set('password2')}
                    className={cn('input pl-10', errors.password2 && 'border-red-400 focus:ring-red-400')}
                    autoComplete="new-password"
                  />
                  {form.password2 && form.password === form.password2 && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                  )}
                </div>
                {errors.password2 && <p className="text-xs text-red-500 mt-1">{errors.password2}</p>}
              </div>

              <button onClick={handleNext} className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
              Already have an account?{' '}
              <Link href="/login" className="text-sky-500 font-semibold hover:underline">Log in</Link>
            </p>
          </div>
        )}

        {/* Step 1 — Profile */}
        {step === 1 && (
          <form onSubmit={handleSubmit}>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Tell us about yourself</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">Help us personalize your FlowState experience.</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="First name" value={form.first_name} onChange={set('first_name')} className="input" />
                <input placeholder="Last name" value={form.last_name} onChange={set('last_name')} className="input" />
              </div>

              <div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    placeholder="Username"
                    value={form.username}
                    onChange={set('username')}
                    className={cn('input pl-10', errors.username && 'border-red-400 focus:ring-red-400')}
                    required
                  />
                </div>
                {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username}</p>}
              </div>

              <input
                placeholder="University / Institution (optional)"
                value={form.university}
                onChange={set('university')}
                className="input"
              />

              {errors.email && (
                <div className="px-4 py-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
                  {errors.email}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base"
              >
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating account...</>
                ) : (
                  <>Create Account <ArrowRight className="w-4 h-4" /></>
                )}
              </button>

              <button type="button" onClick={() => setStep(0)} className="w-full text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                ← Back
              </button>
            </div>
          </form>
        )}

        {/* Step 2 — Done */}
        {step === 2 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-emerald-500 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg shadow-emerald-200 dark:shadow-emerald-900">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">You're in!</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Taking you to your dashboard...</p>
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}
      </div>

      {/* Right — features */}
      <div className="hidden lg:flex flex-col justify-center bg-gradient-to-br from-sky-50 via-white to-violet-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 px-16 py-12 border-l border-gray-100 dark:border-gray-800">
        <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-3 leading-tight">
          Everything you need to<br />
          <span className="text-sky-500">master any subject.</span>
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-10 leading-relaxed">
          Join 50,000+ students using FlowState to study smarter with AI.
        </p>

        <div className="space-y-4">
          {[
            { icon: Sparkles, color: 'bg-sky-50 dark:bg-sky-950 text-sky-500', title: 'AI Personal Tutor', desc: '24/7 AI that understands your materials and learning style' },
            { icon: BookOpen, color: 'bg-violet-50 dark:bg-violet-950 text-violet-500', title: 'Smart Flashcards', desc: 'Spaced repetition system that adapts to your memory' },
            { icon: Users, color: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-500', title: 'Group Workspaces', desc: 'Collaborate with classmates in real-time with AI assistance' },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-4 p-4 card dark:border-gray-800">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', f.color)}>
                <f.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-gray-900 dark:text-white text-sm">{f.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <div className="flex -space-x-2">
            {['bg-sky-400', 'bg-emerald-400', 'bg-violet-400'].map((c, i) => (
              <div key={i} className={`w-8 h-8 rounded-full ${c} border-2 border-white dark:border-gray-950`} />
            ))}
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">Trusted at Stanford, MIT, Harvard & more</span>
        </div>
      </div>
    </div>
  )
}
