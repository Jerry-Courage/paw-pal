'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, Brain, BookOpen, Layers, Headphones } from 'lucide-react'
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
    email: '', username: '', first_name: '', last_name: '',
    password: '', password2: '', university: '',
  })

  useEffect(() => {
    if (status === 'authenticated') router.push('/dashboard')
  }, [status, router])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    setErrors(err => ({ ...err, [k]: '' }))
  }

  const validateStep0 = () => {
    const errs: Record<string, string> = {}
    if (!form.email) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Invalid email'
    if (!form.password) errs.password = 'Password is required'
    else if (form.password.length < 8) errs.password = 'At least 8 characters'
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
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength]
  const strengthColor = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400'][strength]

  return (
    <div className="min-h-screen bg-[#0d0d0d] grid lg:grid-cols-2">
      {/* Left — form */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 mb-10 group w-fit">
          <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center overflow-hidden p-0.5">
             <img src="/images/logo-icon.png" alt="Flow State" className="w-full h-full object-contain" />
          </div>
          <span className="text-xl font-black text-white uppercase tracking-tight">
            NITE <span className="text-orange-500">Mind</span>
          </span>
        </Link>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all',
                i < step ? 'bg-orange-500 text-white' :
                i === step ? 'bg-orange-500 text-white ring-4 ring-orange-500/20' :
                'bg-white/5 text-slate-600'
              )}>
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={cn('text-xs font-bold', i === step ? 'text-white' : 'text-slate-600')}>{s}</span>
              {i < STEPS.length - 1 && <div className={cn('w-8 h-px', i < step ? 'bg-orange-500' : 'bg-white/8')} />}
            </div>
          ))}
        </div>

        {/* Step 0 — Account */}
        {step === 0 && (
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">Create your account</h1>
            <p className="text-slate-500 text-sm mb-8">Free forever. No credit card required.</p>

            <div className="space-y-4">
              <div>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input type="email" placeholder="name@university.edu" value={form.email} onChange={set('email')}
                    className={cn('input pl-10', errors.email && 'border-red-500/50')} autoComplete="email" />
                </div>
                {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
              </div>

              <div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input type={showPassword ? 'text' : 'password'} placeholder="Create a password" value={form.password} onChange={set('password')}
                    className={cn('input pl-10 pr-10', errors.password && 'border-red-500/50')} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.password && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex gap-1 flex-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className={cn('h-1 flex-1 rounded-full transition-all', i <= strength ? strengthColor : 'bg-white/8')} />
                      ))}
                    </div>
                    <span className={cn('text-xs font-bold', strength >= 3 ? 'text-emerald-400' : strength >= 2 ? 'text-yellow-400' : 'text-red-400')}>{strengthLabel}</span>
                  </div>
                )}
                {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
              </div>

              <div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input type="password" placeholder="Confirm password" value={form.password2} onChange={set('password2')}
                    className={cn('input pl-10', errors.password2 && 'border-red-500/50')} autoComplete="new-password" />
                  {form.password2 && form.password === form.password2 && (
                    <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                  )}
                </div>
                {errors.password2 && <p className="text-xs text-red-400 mt-1">{errors.password2}</p>}
              </div>

              <button onClick={handleNext} className="btn-primary w-full py-3 text-base">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <p className="text-center text-sm text-slate-600 mt-6">
              Already have an account?{' '}
              <Link href="/login" className="text-orange-400 font-bold hover:text-orange-300 transition-colors">Log in</Link>
            </p>
          </div>
        )}

        {/* Step 1 — Profile */}
        {step === 1 && (
          <form onSubmit={handleSubmit}>
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">Tell us about yourself</h1>
            <p className="text-slate-500 text-sm mb-8">Help us personalize your experience.</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="First name" value={form.first_name} onChange={set('first_name')} className="input" />
                <input placeholder="Last name" value={form.last_name} onChange={set('last_name')} className="input" />
              </div>

              <div>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input placeholder="Username" value={form.username} onChange={set('username')}
                    className={cn('input pl-10', errors.username && 'border-red-500/50')} required />
                </div>
                {errors.username && <p className="text-xs text-red-400 mt-1">{errors.username}</p>}
              </div>

              <input placeholder="University / Institution (optional)" value={form.university} onChange={set('university')} className="input" />

              {errors.email && (
                <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">{errors.email}</div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
                {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating...</> : <>Create Account <ArrowRight className="w-4 h-4" /></>}
              </button>

              <button type="button" onClick={() => setStep(0)} className="w-full text-sm text-slate-600 hover:text-slate-400 transition-colors">
                ← Back
              </button>
            </div>
          </form>
        )}

        {/* Step 2 — Done */}
        {step === 2 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-emerald-500 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-black text-white mb-2">You're in!</h1>
            <p className="text-slate-500 mb-4">Taking you to your dashboard...</p>
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}
      </div>

      {/* Right — features */}
      <div className="hidden lg:flex flex-col justify-center bg-[#111] px-16 py-12 border-l border-white/5">
        <h2 className="text-4xl font-black text-white mb-3 leading-tight tracking-tight">
          Everything you need to<br />
          <span className="text-orange-400">master any subject.</span>
        </h2>
        <p className="text-slate-500 text-sm mb-10 leading-relaxed">
          Join 50,000+ students using Flow State to study smarter with AI.
        </p>

        <div className="space-y-3">
          {[
            { icon: Brain,      color: 'bg-orange-500/10 text-orange-400', title: 'AI Personal Tutor',  desc: '24/7 AI that understands your materials and learning style' },
            { icon: Layers,     color: 'bg-sky-500/10 text-sky-400',       title: 'Smart Flashcards',   desc: 'Spaced repetition system that adapts to your memory' },
            { icon: Headphones, color: 'bg-pink-500/10 text-pink-400',     title: 'Study Podcasts',     desc: 'Turn any document into an immersive audio experience' },
            { icon: BookOpen,   color: 'bg-violet-500/10 text-violet-400', title: 'AI Study Notes',     desc: 'Structured notes generated from your uploads instantly' },
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
          <span className="text-sm text-slate-600">Trusted at Stanford, MIT, Cambridge & more</span>
        </div>
      </div>
    </div>
  )
}
