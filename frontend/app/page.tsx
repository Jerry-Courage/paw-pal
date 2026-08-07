'use client'

import Link from 'next/link'

const FEATURES = [
  { icon: 'view_in_ar', label: 'VR Classroom', desc: 'Step inside your study material in immersive virtual reality', color: 'text-primary' },
  { icon: 'smart_toy', label: 'AI Tutor', desc: 'Personalised voice tutor that adapts to how you learn', color: 'text-secondary' },
  { icon: 'quiz', label: 'Quiz Battles', desc: 'Adaptive quizzes + live multiplayer battles & XP', color: 'text-tertiary' },
  { icon: 'style', label: 'Flashcards', desc: 'AI-generated spaced repetition cards', color: 'text-primary' },
  { icon: 'hub', label: 'Mind Maps', desc: 'Visual concept mapping', color: 'text-secondary' },
  { icon: 'podcasts', label: 'Podcast', desc: 'AI dual-host audio lessons', color: 'text-tertiary' },
  { icon: 'history_edu', label: 'Exam Prep', desc: 'Voice-based AI tutoring for exams', color: 'text-primary' },
  { icon: 'calculate', label: 'Solver', desc: 'Step-by-step problem solving', color: 'text-secondary' },
  { icon: 'leaderboard', label: 'Rankings & XP', desc: 'Climb the leaderboard and earn points as you learn', color: 'text-tertiary' },
  { icon: 'calendar_today', label: 'Planner', desc: 'Smart scheduling & deadlines', color: 'text-primary' },
  { icon: 'group_work', label: 'Collab', desc: 'Real-time collaborative spaces', color: 'text-secondary' },
  { icon: 'auto_awesome', label: 'Personalised', desc: 'Every kit adapts to your level & learning style', color: 'text-tertiary' },
]

const STEPS = [
  { num: '1', icon: 'upload_file', label: 'Upload or Paste', desc: 'Drop a PDF, slide, YouTube link — or type a topic you want to master.', color: 'bg-primary-container text-on-primary-container' },
  { num: '2', icon: 'auto_awesome', label: 'AI Personalises', desc: 'FlowState generates VR scenes, quizzes & study kits tailored to your level.', color: 'bg-secondary-container text-on-secondary-container' },
  { num: '3', icon: 'military_tech', label: 'Study, Battle & Master', desc: 'Quiz battles, XP & rankings turn revision into a game you win.', color: 'bg-tertiary-container text-on-tertiary-container' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-on-surface font-sans overflow-x-hidden selection:bg-primary-container selection:text-on-primary-container">
      {/* ── TopNavBar ─────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-low/80 backdrop-blur-md shadow-sm">
        <div className="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-stack-sm">
          <span className="text-[22px] font-bold text-primary">FlowState</span>
          <nav className="hidden md:flex gap-gutter items-center">
            <a href="#how-it-works" className="text-on-surface-variant font-medium hover:text-primary transition-colors text-[15px]">How It Works</a>
            <a href="#features" className="text-on-surface-variant font-medium hover:text-primary transition-colors text-[15px]">Features</a>
            <a href="#pricing" className="text-on-surface-variant font-medium hover:text-primary transition-colors text-[15px]">Pricing</a>
          </nav>
          <div className="flex items-center gap-stack-sm">
            <Link href="/login" className="text-on-surface-variant font-semibold text-[14px] hover:text-primary transition-colors hidden md:block">
              Login
            </Link>
            <Link
              href="/signup"
              className="bg-primary text-on-primary font-bold px-stack-md py-[10px] rounded-full btn-3d text-[14px] hover:brightness-110 transition-all"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-32 pb-stack-lg">
        {/* ── Hero ──────────────────────────────────────────── */}
        <section className="px-margin-mobile md:px-margin-desktop mb-stack-lg">
          <div className="flex flex-col md:flex-row items-center gap-stack-lg max-w-6xl mx-auto">
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-[40px] md:text-[56px] font-bold text-on-surface leading-tight mb-stack-sm tracking-tight">
                Learn in{' '}
                <span className="text-primary sparkle-text">VR. Master with AI.</span>
              </h1>
              <p className="text-on-surface-variant text-body-lg max-w-xl mb-stack-md mx-auto md:mx-0">
                FlowState turns any material into a personalised study kit — immersive VR classrooms, AI quizzes and game-like battles that adapt to how you learn. Upload a PDF, drop a link, or just type a topic.
              </p>
              <div className="flex flex-col sm:flex-row gap-stack-sm justify-center md:justify-start">
                <Link
                  href="/signup"
                  className="bg-primary text-on-primary font-bold px-stack-lg py-stack-sm rounded-[1rem] btn-3d text-[18px] transition-all hover:brightness-110 inline-flex items-center gap-base justify-center"
                >
                  Start For Free
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </Link>
                <Link
                  href="/login"
                  className="bg-surface-container-high text-primary font-bold px-stack-lg py-stack-sm rounded-[1rem] border-2 border-primary/20 hover:border-primary transition-all inline-flex items-center gap-base justify-center text-[18px]"
                >
                  Sign In
                </Link>
              </div>
            </div>
            <div className="flex-1 w-full max-w-md">
              <div className="relative">
                <div className="absolute -inset-4 bg-primary/10 blur-3xl rounded-full"></div>
                <div className="relative bg-surface-container rounded-[2rem] p-base overflow-hidden border border-outline-variant/30">
                  {/* Mock dashboard preview */}
                  <div className="bg-surface-container-low rounded-[1.5rem] p-stack-md">
                    <div className="flex items-center gap-base mb-stack-md">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-sm">A</div>
                      <div>
                        <p className="text-[13px] font-bold text-on-surface">Welcome back, Alex!</p>
                        <p className="text-[11px] text-on-surface-variant">12 Day Streak 🔥</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-base mb-stack-md">
                      {['74%', '12🔥', '2,450 XP'].map((s, i) => (
                        <div key={i} className="bg-surface-container rounded-[1rem] p-3 text-center">
                          <p className="text-primary font-bold text-[14px]">{s}</p>
                          <p className="text-on-surface-variant text-[10px] mt-1">{['Progress', 'Streak', 'XP'][i]}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {['Cell Biology 101', 'Advanced Calculus', 'European History'].map((title, i) => (
                        <div key={i} className="flex items-center gap-base bg-surface-container rounded-[1rem] p-3">
                          <div className="w-8 h-8 rounded-[0.75rem] bg-primary-container/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[16px] text-primary">
                              {['biotech', 'functions', 'history_edu'][i]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-on-surface truncate">{title}</p>
                            <div className="h-1.5 bg-surface-container-highest rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${[60, 100, 20][i]}%` }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats Bar ─────────────────────────────────────── */}
        <section className="px-margin-mobile md:px-margin-desktop py-stack-md bg-surface-container-lowest">
          <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-gutter text-center">
            {[
              { val: '50K+', label: 'Students' },
              { val: '2M+', label: 'Study Kits Generated' },
              { val: '98%', label: 'Satisfaction Rate' },
              { val: '4.9★', label: 'Average Rating' },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-[28px] md:text-[36px] font-bold text-primary">{s.val}</p>
                <p className="text-on-surface-variant text-[13px] mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How It Works ──────────────────────────────────── */}
        <section id="how-it-works" className="px-margin-mobile md:px-margin-desktop py-stack-lg">
          <div className="text-center mb-stack-lg">
            <h2 className="text-[32px] md:text-[40px] font-bold text-on-surface">3 Steps to Your FlowState</h2>
            <p className="text-on-surface-variant mt-base text-body-lg">Upload → AI personalises → then learn in VR, quizzes and battle.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter max-w-5xl mx-auto">
            {STEPS.map((s) => (
              <div key={s.num} className="flex flex-col items-center text-center p-stack-md bg-surface-container-low rounded-[2rem] bento-shadow border border-outline-variant/30">
                <div className={`w-16 h-16 ${s.color} rounded-full flex items-center justify-center mb-stack-sm`}>
                  <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
                </div>
                <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest mb-base">{s.num}</p>
                <h3 className="text-[18px] font-bold text-on-surface mb-base">{s.label}</h3>
                <p className="text-on-surface-variant text-[15px]">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features Grid ─────────────────────────────────── */}
        <section id="features" className="px-margin-mobile md:px-margin-desktop py-stack-lg bg-surface-container-lowest">
          <div className="text-center mb-stack-lg">
            <h2 className="text-[32px] md:text-[40px] font-bold text-on-surface">Everything You Need to Ace It</h2>
            <p className="text-on-surface-variant mt-base text-body-lg">12 AI-powered tools for VR, quizzes &amp; personalised study — one platform.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter max-w-5xl mx-auto">
            {FEATURES.map((f) => (
              <div key={f.label} className="squishy-card bg-surface-container-low rounded-[1.5rem] p-stack-md border border-outline-variant/20 flex items-start gap-stack-sm">
                <div className="w-12 h-12 rounded-[1rem] bg-surface-container-high flex items-center justify-center shrink-0">
                  <span className={`material-symbols-outlined text-[24px] ${f.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
                </div>
                <div>
                  <h3 className="font-bold text-on-surface text-[16px] mb-1">{f.label}</h3>
                  <p className="text-on-surface-variant text-[13px]">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing ───────────────────────────────────────── */}
        <section id="pricing" className="px-margin-mobile md:px-margin-desktop py-stack-lg">
          <div className="text-center mb-stack-lg">
            <h2 className="text-[32px] md:text-[40px] font-bold text-on-surface">Simple, Honest Pricing</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter max-w-3xl mx-auto">
            {/* Free */}
            <div className="bg-surface-container-low rounded-[2rem] p-stack-lg border border-outline-variant">
              <h3 className="text-[24px] font-bold text-on-surface mb-base">Free</h3>
              <p className="text-[40px] font-bold text-primary mb-stack-md">GH₵0</p>
              <ul className="space-y-base text-on-surface-variant text-[15px] mb-stack-lg">
                {['5 Study Kits/month', 'Flashcards & Quizzes', 'AI Assistant', 'Basic Planner'].map(f => (
                  <li key={f} className="flex items-center gap-base">
                    <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="block w-full text-center py-stack-sm bg-surface-container-high text-primary font-bold rounded-[1rem] border-2 border-primary/20 hover:border-primary transition-all">
                Get Started
              </Link>
            </div>
            {/* Premium */}
            <div className="bg-surface-container-high rounded-[2rem] p-stack-lg border-2 border-primary glow-primary relative overflow-hidden">
              <div className="absolute top-4 right-4">
                <span className="bg-primary text-on-primary text-[11px] font-black px-3 py-1 rounded-full">POPULAR</span>
              </div>
              <h3 className="text-[24px] font-bold text-on-surface mb-base">Premium</h3>
              <p className="text-[40px] font-bold text-primary mb-stack-md">GH₵10<span className="text-[16px] text-on-surface-variant">/mo</span></p>
              <ul className="space-y-base text-on-surface-variant text-[15px] mb-stack-lg">
                {['Unlimited Study Kits', 'AI Voice Tutor', 'AI Podcast Generation', 'VR Classroom', 'Priority AI Processing', 'Advanced Analytics'].map(f => (
                  <li key={f} className="flex items-center gap-base">
                    <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="block w-full text-center py-stack-sm bg-primary text-on-primary font-bold rounded-[1rem] btn-3d hover:brightness-110 transition-all">
                Upgrade to Premium
              </Link>
            </div>
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────── */}
        <section className="px-margin-mobile md:px-margin-desktop py-stack-lg">
          <div className="bg-surface-container-low rounded-[2rem] p-stack-lg text-center border-2 border-primary/20 relative overflow-hidden max-w-4xl mx-auto">
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <div className="w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent"></div>
            </div>
            <h2 className="text-[32px] font-bold text-on-surface mb-base">Ready to become a FlowState Hero?</h2>
            <p className="text-on-surface-variant text-body-lg mb-stack-md max-w-lg mx-auto">
              Start your first study session today and see how much fun learning can be.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-base bg-primary text-on-primary font-bold px-stack-lg py-stack-md rounded-[1rem] btn-3d text-[18px] hover:brightness-110 transition-all"
            >
              Let&apos;s Go!
              <span className="material-symbols-outlined">arrow_forward</span>
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="bg-surface-dim px-margin-mobile md:px-margin-desktop py-stack-md flex flex-col md:flex-row justify-between items-center border-t border-outline-variant gap-stack-sm">
        <span className="text-[18px] font-bold text-primary">FlowState</span>
        <div className="flex gap-gutter">
          <a href="#" className="text-on-surface-variant text-[13px] hover:text-primary transition-colors">Help Center</a>
          <a href="#" className="text-on-surface-variant text-[13px] hover:text-primary transition-colors">Privacy Policy</a>
          <a href="#" className="text-on-surface-variant text-[13px] hover:text-primary transition-colors">Terms of Service</a>
        </div>
        <p className="text-on-surface-variant text-[13px]">© 2025 FlowState Study Platform</p>
      </footer>
    </div>
  )
}
