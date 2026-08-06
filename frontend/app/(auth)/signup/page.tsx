'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, Brain, BookOpen, Layers, Headphones, Sparkles, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { authApi } from '@/lib/api'
import { cn } from '@/lib/utils'

const STEPS = [
  { label: 'Account', hint: 'Set up your credentials' },
  { label: 'Profile', hint: 'Tell us about yourself' },
  { label: 'Done', hint: '' },
]

const FEATURES = [
  { icon: Brain,      color: 'text-primary bg-primary/10',     title: 'AI Tutor',       desc: 'Understands your exact materials' },
  { icon: Layers,     color: 'text-secondary bg-secondary/10', title: 'Flashcards',     desc: 'Spaced repetition that adapts' },
  { icon: Headphones, color: 'text-tertiary bg-tertiary/10',   title: 'Study Podcasts', desc: 'Audio deep-dives from any doc' },
  { icon: BookOpen,   color: 'text-primary bg-primary/10',     title: 'Smart Notes',    desc: 'Structured notes in seconds' },
]

export default function SignupPage() {
  const router = useRouter()
  const { status } = useSession()
  const [step, setStep]       = useState(0)
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw]   = useState(false)
  const [errors, setErrors]   = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    email: '', username: '', first_name: '', last_name: '',
    password: '', password2: '', university: '', education_level: 'tertiary' as 'secondary' | 'tertiary',
  })

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
        university: form.university.trim(),
        education_level: form.education_level,
      })
      const res = await signIn('credentials', {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        redirect: false,
      })
      if (res?.ok) {
        setStep(2)
        router.push('/dashboard')
      } else {
        toast.error('Account created but sign-in failed. Please log in.')
        router.push('/login')
      }
    } catch (err: any) {
      const data = err.response?.data
      if (typeof data === 'object' && data !== null) {
        const fieldErrors: Record<string, string> = {}
        Object.entries(data).forEach(([k, v]) => {
          fieldErrors[k] = Array.isArray(v) ? v[0] : String(v)
        })
        setErrors(fieldErrors)
        if (fieldErrors.email || fieldErrors.password || fieldErrors.username) setStep(0)
        else {
          const firstErr = Object.values(fieldErrors)[0] || 'Registration failed. Please check your inputs.'
          toast.error(firstErr)
        }
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
  const strengthMeta = [
    null,
    { label: 'Weak',   color: 'bg-error',          text: 'text-error' },
    { label: 'Fair',   color: 'bg-primary',         text: 'text-primary' },
    { label: 'Good',   color: 'bg-secondary',       text: 'text-secondary' },
    { label: 'Strong', color: 'bg-green-400',       text: 'text-green-400' },
  ][strength]

  const inputCls = (err?: string) => cn(
    'w-full bg-surface-container border rounded-[1rem] px-4 py-3 text-[15px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none transition-all font-sans',
    err ? 'border-error/50 focus:border-error' : 'border-outline-variant focus:border-secondary focus:shadow-[0_0_0_3px_rgba(191,194,255,0.15)]'
  )

  return (
    <div className="min-h-screen bg-background flex font-sans">
      {/* ── Left: Form panel ── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 lg:px-16 min-h-screen">
        <div className="w-full max-w-sm">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 mb-8 w-fit">
            <div className="w-10 h-10 rounded-[1rem] overflow-hidden border border-outline-variant bg-surface-container">
              <img src="/images/logo-pwa.png" alt="FlowState" className="w-full h-full object-cover" />
            </div>
            <span className="text-[20px] font-bold text-on-surface tracking-tight">
              Flow<span className="text-primary">State</span>
            </span>
          </Link>

          {/* Step indicator */}
          {step < 2 && (
            <div className="flex items-center gap-1.5 mb-8">
              {STEPS.slice(0, 2).map((s, i) => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300',
                    i < step  ? 'bg-primary-container text-on-primary-container' :
                    i === step ? 'bg-primary-container text-on-primary-container ring-4 ring-primary/20' :
                                 'bg-surface-container-high text-on-surface-variant'
                  )}>
                    {i < step ? <Check className="w-3 h-3" /> : i + 1}
                  </div>
                  <span className={cn('text-[13px] font-semibold transition-colors', i === step ? 'text-on-surface' : 'text-on-surface-variant')}>
                    {s.label}
                  </span>
                  {i < 1 && <div className={cn('w-10 h-px mx-1 transition-colors', i < step ? 'bg-primary' : 'bg-outline-variant/40')} />}
                </div>
              ))}
            </div>
          )}

          {/* ── Step 0: Credentials ── */}
          {step === 0 && (
            <div>
              <h1 className="text-[32px] font-bold text-on-surface tracking-tight leading-tight mb-1.5">Create account</h1>
              <p className="text-on-surface-variant text-[15px] mb-7">Free forever. No credit card needed.</p>
              <div className="space-y-stack-sm">
                <div>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
                    <input type="email" placeholder="your@email.com" value={form.email} onChange={set('email')} autoComplete="email" className={cn(inputCls(errors.email), 'pl-11')} />
                  </div>
                  {errors.email && <p className="text-[13px] text-error mt-1.5 pl-1">{errors.email}</p>}
                </div>
                <div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
                    <input type={showPw ? 'text' : 'password'} placeholder="Create a password" value={form.password} onChange={set('password')} autoComplete="new-password" className={cn(inputCls(errors.password), 'pl-11 pr-11')} />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.password && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-1 flex-1">
                        {[1,2,3,4].map(i => (
                          <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all duration-300', i <= strength ? strengthMeta?.color : 'bg-outline-variant/30')} />
                        ))}
                      </div>
                      {strengthMeta && <span className={cn('text-[11px] font-bold', strengthMeta.text)}>{strengthMeta.label}</span>}
                    </div>
                  )}
                  {errors.password && <p className="text-[13px] text-error mt-1.5 pl-1">{errors.password}</p>}
                </div>
                <div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
                    <input type="password" placeholder="Confirm password" value={form.password2} onChange={set('password2')} autoComplete="new-password" className={cn(inputCls(errors.password2), 'pl-11 pr-11')} />
                    {form.password2 && form.password === form.password2 && (
                      <Check className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                    )}
                  </div>
                  {errors.password2 && <p className="text-[13px] text-error mt-1.5 pl-1">{errors.password2}</p>}
                </div>
                <button onClick={handleNext} className="w-full flex items-center justify-center gap-2 bg-primary-container text-on-primary-container font-bold text-[16px] rounded-[1rem] py-[14px] transition-all shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 mt-1">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 my-stack-lg">
                <div className="flex-1 h-px bg-outline-variant/30" />
                <span className="text-[12px] text-on-surface-variant">or sign up with</span>
                <div className="flex-1 h-px bg-outline-variant/30" />
              </div>

              <div className="space-y-stack-sm">
                <button type="button" onClick={() => signIn('google', { callbackUrl: '/dashboard' })} className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 active:scale-[0.98] text-gray-800 font-bold text-[15px] rounded-[1rem] py-3 transition-all shadow-sm border border-outline-variant/20">
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </button>
                <button type="button" onClick={() => signIn('github', { callbackUrl: '/dashboard' })} className="w-full flex items-center justify-center gap-3 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface font-bold text-[15px] rounded-[1rem] py-3 transition-all">
                  <svg className="w-4 h-4 fill-on-surface" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  Continue with GitHub
                </button>
              </div>

              <div className="flex items-center gap-3 mt-stack-lg">
                <div className="flex-1 h-px bg-outline-variant/30" />
                <span className="text-[12px] text-on-surface-variant">Have an account?</span>
                <div className="flex-1 h-px bg-outline-variant/30" />
              </div>
              <Link href="/login" className="w-full flex items-center justify-center gap-2 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface font-bold text-[15px] rounded-[1rem] py-3 transition-all mt-stack-sm">
                Sign in instead
              </Link>
            </div>
          )}

          {/* ── Step 1: Profile ── */}
          {step === 1 && (
            <form onSubmit={handleSubmit}>
              <h1 className="text-[32px] font-bold text-on-surface tracking-tight leading-tight mb-1.5">Your profile</h1>
              <p className="text-on-surface-variant text-[15px] mb-7">Help us personalize your experience.</p>
              <div className="space-y-stack-sm">
                <div className="grid grid-cols-2 gap-2.5">
                  <input placeholder="First name" value={form.first_name} onChange={set('first_name')} className={inputCls()} />
                  <input placeholder="Last name" value={form.last_name} onChange={set('last_name')} className={inputCls()} />
                </div>
                <div>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
                    <input placeholder="Username" value={form.username} onChange={set('username')} required className={cn(inputCls(errors.username), 'pl-11')} />
                  </div>
                  {errors.username && <p className="text-[13px] text-error mt-1.5 pl-1">{errors.username}</p>}
                </div>
                <input placeholder="University / Institution (optional)" value={form.university} onChange={set('university')} className={inputCls()} />

                {/* Education Level */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block pl-1">Curriculum Level</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, education_level: 'secondary' }))}
                      className={cn('p-3 rounded-[1rem] text-left border transition-all',
                        form.education_level === 'secondary'
                          ? 'bg-primary-container border-primary text-on-primary-container shadow-sm'
                          : 'bg-surface-container-high border-outline-variant text-on-surface-variant hover:border-outline-variant/80'
                      )}
                    >
                      <p className="font-bold text-[13px]">🇬🇭 Secondary / SHS</p>
                      <p className="text-[10px] opacity-70 mt-0.5">NaCCA & WASSCE</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, education_level: 'tertiary' }))}
                      className={cn('p-3 rounded-[1rem] text-left border transition-all',
                        form.education_level === 'tertiary'
                          ? 'bg-primary-container border-primary text-on-primary-container shadow-sm'
                          : 'bg-surface-container-high border-outline-variant text-on-surface-variant hover:border-outline-variant/80'
                      )}
                    >
                      <p className="font-bold text-[13px]">🎓 Tertiary / Univ.</p>
                      <p className="text-[10px] opacity-70 mt-0.5">Degree & Higher Ed</p>
                    </button>
                  </div>
                </div>
                {errors.email && (
                  <div className="px-4 py-3 bg-error-container/20 border border-error/30 rounded-[1rem] text-[14px] text-error">{errors.email}</div>
                )}
                <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 bg-primary-container text-on-primary-container font-bold text-[16px] rounded-[1rem] py-[14px] transition-all shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 disabled:opacity-50 mt-1">
                  {loading ? (
                    <><div className="w-4 h-4 border-2 border-on-primary-container/30 border-t-on-primary-container rounded-full animate-spin" /> Creating account…</>
                  ) : (
                    <>Create Account <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
                <button type="button" onClick={() => setStep(0)} className="w-full flex items-center justify-center gap-1.5 text-[14px] text-on-surface-variant hover:text-on-surface transition-colors py-2">
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
              </div>
            </form>
          )}

          {/* ── Step 2: Done ── */}
          {step === 2 && (
            <div className="text-center py-8">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping opacity-40" />
                <div className="relative w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-xl shadow-green-500/30">
                  <Check className="w-9 h-9 text-white" />
                </div>
              </div>
              <h1 className="text-[32px] font-bold text-on-surface mb-2 tracking-tight">You&apos;re in!</h1>
              <p className="text-on-surface-variant text-[15px] mb-6">Setting up your workspace…</p>
              <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin mx-auto" />
            </div>
          )}

          {step < 2 && (
            <p className="text-center text-[12px] text-on-surface-variant/50 mt-8 leading-relaxed">
              By continuing you agree to our{' '}
              <span className="text-on-surface-variant cursor-pointer hover:text-primary transition-colors">Terms</span>
              {' '}and{' '}
              <span className="text-on-surface-variant cursor-pointer hover:text-primary transition-colors">Privacy Policy</span>.
            </p>
          )}
        </div>
      </div>

      {/* ── Right: Visual panel (desktop only) ── */}
      <div className="hidden lg:flex w-[460px] xl:w-[500px] flex-col justify-between bg-surface-container-low border-l border-outline-variant/20 px-12 py-14 relative overflow-hidden shrink-0">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-tertiary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-2 w-fit">
          <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold px-3 py-1.5 rounded-full tracking-widest uppercase">
            <Sparkles className="w-3 h-3" />
            AI Study Platform
          </div>
        </div>

        <div className="space-y-stack-lg">
          <div>
            <h2 className="text-[42px] xl:text-[52px] font-bold text-on-surface leading-[1.1] tracking-tight mb-4">
              Everything you need<br />
              to <span className="text-primary">ace any subject.</span>
            </h2>
            <p className="text-on-surface-variant text-[15px] leading-relaxed max-w-xs">
              Upload any material — PDF, video, slides — and get a full study kit in seconds.
            </p>
          </div>
          <div className="space-y-stack-sm">
            {FEATURES.map(f => (
              <div key={f.title} className="flex items-center gap-4 p-4 rounded-[1.5rem] bg-surface-container border border-outline-variant/20 hover:border-outline-variant transition-all">
                <div className={cn('w-10 h-10 rounded-[1rem] flex items-center justify-center shrink-0', f.color)}>
                  <f.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[15px] font-bold text-on-surface leading-none mb-1">{f.title}</p>
                  <p className="text-[13px] text-on-surface-variant">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {['bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-green-400', 'bg-pink-400'].map((c, i) => (
              <div key={i} className={cn('w-8 h-8 rounded-full border-2 border-surface-container-low', c)} />
            ))}
          </div>
          <div>
            <p className="text-[13px] font-bold text-on-surface">50,000+ students</p>
            <p className="text-[12px] text-on-surface-variant">Stanford · MIT · Cambridge</p>
          </div>
        </div>
      </div>
    </div>
  )
}
