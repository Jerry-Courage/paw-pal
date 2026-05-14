import Link from 'next/link'
import {
  ArrowRight, Brain, Layers, Map,
  HelpCircle, Wand2, Radio, Calculator, Upload, Link2, Mic,
  CheckCircle2, Star, Zap, Users, Calendar, Sparkles,
  FileText, ChevronRight, Play, BarChart3,
  Clock, MessageSquare, TrendingUp, Award
} from 'lucide-react'

// ─── Navbar ────────────────────────────────────────────────────────────────
function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0d0d0d]/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors overflow-hidden p-0.5">
             <img src="/images/logo-icon.png" alt="NITE Mind" className="w-full h-full object-contain" />
          </div>
          <span className="text-lg font-black tracking-tight uppercase">
            NITE <span className="text-orange-500">Mind</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-500">
          <Link href="#features" className="hover:text-white transition-colors">Features</Link>
          <Link href="#how-it-works" className="hover:text-white transition-colors">How it works</Link>
          <Link href="#tools" className="hover:text-white transition-colors">Tools</Link>
          <Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden sm:block text-sm font-semibold text-slate-400 hover:text-white transition-colors px-3 py-2">
            Login
          </Link>
          <Link href="/signup" className="btn-primary text-sm px-5 py-2.5 rounded-xl font-black">
            Get Started Free
          </Link>
        </div>
      </div>
    </nav>
  )
}

// ─── Hero ───────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative pt-36 pb-28 px-6 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-orange-500/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-40 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-orange-500/12 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative max-w-4xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-black px-4 py-2 rounded-full mb-8 uppercase tracking-widest">
          <Zap className="w-3.5 h-3.5 fill-orange-400" />
          AI Study Platform · Built for Students
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-black leading-[1.05] mb-6 tracking-tight">
          Stop studying harder.<br />
          Start studying{' '}
          <span className="text-orange-500">smarter.</span>
        </h1>

        {/* Subtext */}
        <p className="text-slate-400 text-lg md:text-xl mb-12 leading-relaxed max-w-2xl mx-auto">
          Upload any PDF, paste a YouTube link, or record your lecture — and get a complete study kit with notes, flashcards, quizzes, a podcast, and an AI tutor in under 30 seconds.
        </p>

        {/* Upload method cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto mb-10">
          {[
            { icon: Upload,  label: 'Upload File',      sub: 'PDF, DOCX, image, audio, video', color: 'group-hover:text-orange-400', bg: 'group-hover:bg-orange-500/10' },
            { icon: Link2,   label: 'Paste URL',        sub: 'YouTube, website, article',       color: 'group-hover:text-sky-400',    bg: 'group-hover:bg-sky-500/10' },
            { icon: Mic,     label: 'Record Lecture',   sub: 'Live mic recording',              color: 'group-hover:text-pink-400',   bg: 'group-hover:bg-pink-500/10' },
          ].map(({ icon: Icon, label, sub, color, bg }) => (
            <Link key={label} href="/signup"
              className="group flex flex-col items-start gap-3 p-5 rounded-2xl bg-[#1a1a1a] border border-white/8 hover:border-white/15 hover:bg-[#1f1f1f] transition-all text-left cursor-pointer"
            >
              <div className={`w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center transition-colors ${bg}`}>
                <Icon className={`w-5 h-5 text-slate-400 transition-colors ${color}`} />
              </div>
              <div>
                <p className="text-sm font-black text-white">{label}</p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 transition-colors ml-auto mt-auto" />
            </Link>
          ))}
        </div>

        {/* Social proof */}
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-slate-500">
          {[
            { icon: CheckCircle2, text: 'No credit card', color: 'text-emerald-500' },
            { icon: CheckCircle2, text: 'Free to start',  color: 'text-emerald-500' },
            { icon: CheckCircle2, text: '10,000+ students', color: 'text-emerald-500' },
          ].map(({ icon: Icon, text, color }) => (
            <span key={text} className="flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              {text}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Stats Bar ──────────────────────────────────────────────────────────────
function StatsBar() {
  const stats = [
    { value: '50,000+', label: 'Documents processed',     icon: FileText },
    { value: '2M+',     label: 'Flashcards generated',    icon: Layers },
    { value: '98%',     label: 'Student satisfaction',    icon: Award },
    { value: '30s',     label: 'Avg. study kit generation', icon: Clock },
  ]
  return (
    <section className="border-y border-white/5 bg-[#111]">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map(({ value, label, icon: Icon }) => (
          <div key={label} className="flex flex-col items-center text-center gap-2">
            <Icon className="w-5 h-5 text-orange-500/60 mb-1" />
            <span className="text-3xl md:text-4xl font-black text-white tracking-tight">{value}</span>
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── How It Works ───────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      step: '01',
      icon: Upload,
      accent: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/20',
      glow: 'bg-orange-500/5',
      title: 'Upload anything',
      desc: 'Drop a PDF, paste a YouTube URL, type a topic, or record your lecture live. We handle files up to 50 MB across all formats.',
    },
    {
      step: '02',
      icon: Sparkles,
      accent: 'text-violet-400',
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/20',
      glow: 'bg-violet-500/5',
      title: 'AI generates your study kit',
      desc: 'In seconds, get AI-written notes, auto-generated flashcards, a quiz, a podcast episode, and an interactive mind map.',
    },
    {
      step: '03',
      icon: TrendingUp,
      accent: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      glow: 'bg-emerald-500/5',
      title: 'Master it with science',
      desc: 'Spaced repetition schedules your reviews. The AI tutor answers questions. Practice tests track your progress to exam day.',
    },
  ]

  return (
    <section id="how-it-works" className="py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-orange-500 text-xs font-black uppercase tracking-widest mb-3">How it works</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            From upload to exam-ready<br />in three steps.
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">No setup. No syllabus-building. Just results.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map(({ step, icon: Icon, accent, bg, border, glow, title, desc }) => (
            <div key={step} className={`relative p-8 rounded-3xl bg-[#1a1a1a] border ${border} overflow-hidden group hover:scale-[1.02] transition-transform duration-300`}>
              {/* Background glow */}
              <div className={`absolute inset-0 ${glow} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
              {/* Step number watermark */}
              <span className="absolute top-4 right-6 text-7xl font-black text-white/4 select-none leading-none">{step}</span>

              <div className={`relative w-14 h-14 rounded-2xl ${bg} border ${border} flex items-center justify-center mb-6`}>
                <Icon className={`w-7 h-7 ${accent}`} />
              </div>
              <h3 className="relative text-xl font-black text-white mb-3 tracking-tight">{title}</h3>
              <p className="relative text-sm text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Features Grid ──────────────────────────────────────────────────────────
function FeaturesGrid() {
  const features = [
    {
      icon: Brain,
      accent: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'hover:border-orange-500/25',
      title: 'AI Personal Tutor',
      desc: 'Chat with an AI that has read your exact notes. Ask anything — it knows your material, not just generic facts.',
    },
    {
      icon: Layers,
      accent: 'text-sky-400',
      bg: 'bg-sky-500/10',
      border: 'hover:border-sky-500/25',
      title: 'Spaced Repetition Cards',
      desc: 'Auto-generated flashcards powered by the SM-2 algorithm. It learns which cards you struggle with and drills them harder.',
    },
    {
      icon: Radio,
      accent: 'text-pink-400',
      bg: 'bg-pink-500/10',
      border: 'hover:border-pink-500/25',
      title: 'FlowCast Podcast',
      desc: 'Turn any document into a two-host AI podcast. Interrupt mid-episode to ask questions and get live answers.',
    },
    {
      icon: Map,
      accent: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'hover:border-amber-500/25',
      title: 'Visual Mind Maps',
      desc: 'Interactive concept maps generated from your material. See how topics connect and instantly spot knowledge gaps.',
    },
    {
      icon: HelpCircle,
      accent: 'text-violet-400',
      bg: 'bg-violet-500/10',
      border: 'hover:border-violet-500/25',
      title: 'AI Quiz Generator',
      desc: 'MCQ, short-answer, and true/false questions tailored to your syllabus and difficulty level. Adapts as you improve.',
    },
    {
      icon: Calculator,
      accent: 'text-teal-400',
      bg: 'bg-teal-500/10',
      border: 'hover:border-teal-500/25',
      title: 'Math & Formula Solver',
      desc: 'Step-by-step LaTeX derivations with full explanations. Covers calculus, linear algebra, statistics, and more.',
    },
    {
      icon: Wand2,
      accent: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'hover:border-emerald-500/25',
      title: 'Written Practice Tests',
      desc: 'AI-graded written answers with detailed feedback, strengths highlighted, and specific improvement suggestions.',
    },
    {
      icon: Users,
      accent: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
      border: 'hover:border-indigo-500/25',
      title: 'Study Groups & Collab',
      desc: 'Create or join study groups, share resources, and get an AI TA that knows your group\'s shared material.',
    },
    {
      icon: Calendar,
      accent: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'hover:border-rose-500/25',
      title: 'Smart Study Planner',
      desc: 'Set your exam deadlines and let AI schedule optimal revision blocks around your calendar. Never cram again.',
    },
  ]

  return (
    <section id="features" className="py-28 px-6 bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-orange-500 text-xs font-black uppercase tracking-widest mb-3">Features</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            Every tool a top student needs.
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Scientifically-proven study techniques combined with state-of-the-art AI.
          </p>
        </div>

        <div id="tools" className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, accent, bg, border, title, desc }) => (
            <div
              key={title}
              className={`group p-6 rounded-2xl bg-[#1a1a1a] border border-white/6 ${border} hover:bg-[#1e1e1e] transition-all duration-200 cursor-default`}
            >
              <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center mb-4`}>
                <Icon className={`w-5 h-5 ${accent}`} />
              </div>
              <h3 className="text-sm font-black text-white mb-2 tracking-tight">{title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Feature Spotlight A: AI Tutor ─────────────────────────────────────────
function SpotlightTutor() {
  return (
    <section className="py-28 px-6">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
        {/* Text */}
        <div>
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-black px-3 py-1.5 rounded-full mb-6 uppercase tracking-widest">
            <Brain className="w-3.5 h-3.5" /> AI Personal Tutor
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-5 leading-[1.1]">
            Your AI tutor that actually<br />
            <span className="text-orange-500">read your notes.</span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed mb-8">
            Unlike generic chatbots, NITE AI is trained on your exact uploaded material. Ask it to explain a concept from your lecture, quiz you on a specific chapter, or simplify a complex formula — it knows your content inside out.
          </p>
          <ul className="space-y-3 mb-8">
            {[
              'Answers questions from your specific documents',
              'Cites the exact page or timestamp it learned from',
              'Adjusts explanation depth to your level',
              'Available 24/7, never gets tired of your questions',
            ].map(item => (
              <li key={item} className="flex items-start gap-3 text-sm text-slate-400">
                <CheckCircle2 className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <Link href="/signup" className="btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-xl font-black">
            Try the AI Tutor <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Mockup: Chat UI */}
        <div className="relative">
          <div className="absolute -inset-4 bg-orange-500/5 rounded-3xl blur-2xl" />
          <div className="relative rounded-3xl bg-[#111] border border-white/8 overflow-hidden shadow-2xl">
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/6 bg-[#161616]">
              <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/20 flex items-center justify-center">
                <Brain className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-black text-white">NITE AI Tutor</p>
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Trained on your Anatomy Notes.pdf
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="p-5 space-y-4">
              {/* User message */}
              <div className="flex justify-end">
                <div className="bg-orange-500/15 border border-orange-500/20 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
                  <p className="text-sm text-white">Can you explain the difference between mitosis and meiosis from my notes?</p>
                </div>
              </div>

              {/* AI response */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/20 flex items-center justify-center shrink-0 mt-1">
                  <Brain className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <div className="bg-[#1a1a1a] border border-white/6 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    From your <span className="text-orange-400 font-semibold">Chapter 4 notes</span>, here&apos;s the key distinction:
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-2 text-xs">
                      <span className="text-orange-400 font-black shrink-0">Mitosis</span>
                      <span className="text-slate-400">produces 2 identical diploid cells — used for growth and repair.</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="text-violet-400 font-black shrink-0">Meiosis</span>
                      <span className="text-slate-400">produces 4 genetically unique haploid cells — used for sexual reproduction.</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mt-3">📄 Source: Anatomy Notes.pdf · Page 47</p>
                </div>
              </div>

              {/* Typing indicator */}
              <div className="flex gap-3 items-center">
                <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/20 flex items-center justify-center shrink-0">
                  <Brain className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <div className="bg-[#1a1a1a] border border-white/6 rounded-2xl px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Input bar */}
            <div className="px-5 pb-5">
              <div className="flex items-center gap-3 bg-[#1a1a1a] border border-white/8 rounded-xl px-4 py-3">
                <MessageSquare className="w-4 h-4 text-slate-600" />
                <span className="text-sm text-slate-600 flex-1">Ask anything about your notes...</span>
                <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
                  <ArrowRight className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Feature Spotlight B: FlowCast Podcast ─────────────────────────────────
function SpotlightPodcast() {
  return (
    <section className="py-28 px-6 bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
        {/* Mockup: Podcast Player */}
        <div className="relative order-2 md:order-1">
          <div className="absolute -inset-4 bg-pink-500/5 rounded-3xl blur-2xl" />
          <div className="relative rounded-3xl bg-[#111] border border-white/8 overflow-hidden shadow-2xl">
            {/* Player header */}
            <div className="px-6 pt-6 pb-4 border-b border-white/6 bg-[#161616]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
                  <span className="text-xs font-black text-pink-400 uppercase tracking-widest">On Air</span>
                </div>
                <span className="text-xs text-slate-600">Episode 1 of 3</span>
              </div>
              <p className="text-base font-black text-white mt-2">Constitutional Law: Key Principles</p>
              <p className="text-xs text-slate-500 mt-0.5">Generated from: ConLaw_Week3.pdf</p>
            </div>

            {/* Hosts */}
            <div className="px-6 py-5">
              <p className="text-xs text-slate-600 uppercase tracking-widest font-black mb-4">Your Hosts</p>
              <div className="flex gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-pink-500/20 border-2 border-pink-500/40 flex items-center justify-center">
                    <span className="text-sm font-black text-pink-400">A</span>
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">Alex</p>
                    <p className="text-xs text-slate-600">Host · Explains</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-violet-500/20 border-2 border-violet-500/40 flex items-center justify-center">
                    <span className="text-sm font-black text-violet-400">B</span>
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">Blake</p>
                    <p className="text-xs text-slate-600">Host · Questions</p>
                  </div>
                </div>
              </div>

              {/* Waveform */}
              <div className="flex items-center gap-0.5 h-12 mb-4">
                {[3,5,8,6,10,7,12,9,6,11,8,5,9,7,13,10,6,8,5,7,11,9,6,10,8,5,7,9,6,8,10,7,5,9,6,11,8,6,9,7].map((h, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-full ${i < 18 ? 'bg-pink-500' : 'bg-white/10'}`}
                    style={{ height: `${h * 3}px` }}
                  />
                ))}
              </div>

              {/* Time */}
              <div className="flex justify-between text-xs text-slate-600 mb-4">
                <span>12:34</span>
                <span>28:15</span>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-6 mb-5">
                <button className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                  <BarChart3 className="w-4 h-4 text-slate-400 rotate-180" />
                </button>
                <button className="w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center hover:bg-pink-400 transition-colors shadow-lg shadow-pink-500/25">
                  <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                </button>
                <button className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                  <BarChart3 className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* Interrupt button */}
              <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 text-sm font-black hover:bg-pink-500/15 transition-colors">
                <Mic className="w-4 h-4" />
                Interrupt & Ask a Question
              </button>
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="order-1 md:order-2">
          <div className="inline-flex items-center gap-2 bg-pink-500/10 border border-pink-500/20 text-pink-400 text-xs font-black px-3 py-1.5 rounded-full mb-6 uppercase tracking-widest">
            <Radio className="w-3.5 h-3.5" /> FlowCast
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-5 leading-[1.1]">
            Turn any document<br />
            <span className="text-pink-400">into a podcast.</span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed mb-8">
            FlowCast converts your notes, PDFs, and lecture slides into a two-host AI podcast. Listen while commuting, working out, or cooking — and interrupt at any moment to ask a question live.
          </p>
          <ul className="space-y-3 mb-8">
            {[
              'Two distinct AI hosts with natural conversation flow',
              'Interrupt mid-episode to ask questions',
              'Covers your exact material, not generic summaries',
              'Download episodes for offline listening',
            ].map(item => (
              <li key={item} className="flex items-start gap-3 text-sm text-slate-400">
                <CheckCircle2 className="w-4 h-4 text-pink-500 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 font-black text-sm hover:bg-pink-500/15 transition-colors">
            Generate Your First Podcast <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ─── Comparison Table ───────────────────────────────────────────────────────
function ComparisonTable() {
  const rows = [
    { feature: 'Study kit generation',  flowstate: '30 seconds',              traditional: 'Hours of manual work' },
    { feature: 'Flashcard creation',    flowstate: 'Auto-generated',          traditional: 'Manual writing' },
    { feature: 'Personalized quizzes',  flowstate: 'AI-tailored to you',      traditional: 'Generic textbook questions' },
    { feature: 'Spaced repetition',     flowstate: 'Built-in SM-2 algorithm', traditional: 'Requires a separate app' },
    { feature: 'AI tutor',              flowstate: 'Knows your material',     traditional: 'Generic chatbot' },
    { feature: 'Study podcast',         flowstate: 'From your own notes',     traditional: "Doesn't exist" },
  ]

  return (
    <section className="py-28 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-orange-500 text-xs font-black uppercase tracking-widest mb-3">Why NITE Mind</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            NITE Mind vs Traditional Studying
          </h2>
          <p className="text-slate-500 text-lg">The difference is night and day.</p>
        </div>

        <div className="rounded-3xl overflow-hidden border border-white/8 bg-[#111]">
          {/* Table header */}
          <div className="grid grid-cols-3 bg-[#161616] border-b border-white/6">
            <div className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Feature</div>
            <div className="px-6 py-4 text-xs font-black text-orange-400 uppercase tracking-widest flex items-center gap-2">
              <img src="/images/logo-icon.png" className="w-3.5 h-3.5 object-contain" /> NITE Mind
            </div>
            <div className="px-6 py-4 text-xs font-black text-slate-600 uppercase tracking-widest">Traditional</div>
          </div>

          {/* Rows */}
          {rows.map(({ feature, flowstate, traditional }, i) => (
            <div
              key={feature}
              className={`grid grid-cols-3 border-b border-white/4 last:border-0 hover:bg-white/2 transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
            >
              <div className="px-6 py-4 text-sm font-semibold text-slate-400">{feature}</div>
              <div className="px-6 py-4 flex items-center gap-2">
                <span className="text-emerald-400 text-base">✅</span>
                <span className="text-sm font-semibold text-white">{flowstate}</span>
              </div>
              <div className="px-6 py-4 flex items-center gap-2">
                <span className="text-red-400 text-base">❌</span>
                <span className="text-sm text-slate-600">{traditional}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Testimonials ───────────────────────────────────────────────────────────
function Testimonials() {
  const testimonials = [
    {
      name: 'Aisha K.',
      role: 'Medical Student · Year 2',
      initials: 'AK',
      color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      quote: 'I uploaded 3 months of anatomy notes and FlowState built me a complete revision plan with 400 flashcards. The spaced repetition actually works — I got an A in my finals for the first time.',
    },
    {
      name: 'Marcus L.',
      role: 'CS Undergrad · Stanford',
      initials: 'ML',
      color: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
      quote: 'The AI tutor actually understands my lecture slides. I stopped spending hours on Stack Overflow and just ask FlowState instead. It explains algorithms using the exact examples from my professor.',
    },
    {
      name: 'Priya S.',
      role: 'Law Student · Year 3',
      initials: 'PS',
      color: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      quote: 'FlowCast is insane. I listen to AI podcasts of my case law readings while commuting. I review 2x as much material now and actually retain it. This is the future of studying.',
    },
  ]

  return (
    <section className="py-28 px-6 bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-orange-500 text-xs font-black uppercase tracking-widest mb-3">Testimonials</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            Students love it.
          </h2>
          <p className="text-slate-500 text-lg">Real results from real students.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {testimonials.map(({ name, role, initials, color, quote }) => (
            <div key={name} className="p-7 rounded-3xl bg-[#1a1a1a] border border-white/6 hover:border-white/10 transition-all flex flex-col gap-5 group hover:-translate-y-1 duration-300">
              {/* Stars */}
              <div className="flex gap-1">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} className="w-4 h-4 fill-orange-400 text-orange-400" />
                ))}
              </div>

              {/* Quote */}
              <p className="text-sm text-slate-400 leading-relaxed flex-1">
                &ldquo;{quote}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm font-black ${color}`}>
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-black text-white">{name}</p>
                  <p className="text-xs text-slate-600">{role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ────────────────────────────────────────────────────────────────
function Pricing() {
  return (
    <section id="pricing" className="py-28 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-orange-500 text-xs font-black uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            Simple pricing.<br />Powerful results.
          </h2>
          <p className="text-slate-500 text-lg">Start free. Upgrade when you&apos;re ready.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Free */}
          <div className="p-8 rounded-3xl bg-[#1a1a1a] border border-white/8 flex flex-col">
            <div className="mb-6">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Free</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-5xl font-black text-white">$0</span>
                <span className="text-slate-500 mb-2">/month</span>
              </div>
              <p className="text-sm text-slate-500">Perfect for getting started.</p>
            </div>

            <ul className="space-y-3 flex-1 mb-8">
              {[
                'Upload 5 documents/month',
                'Basic study kit (notes + flashcards)',
                'AI chat — 20 messages/day',
                'Community access',
                '1 FlowCast episode/month',
              ].map(item => (
                <li key={item} className="flex items-start gap-3 text-sm text-slate-400">
                  <CheckCircle2 className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <Link href="/signup" className="btn-secondary w-full text-center py-3 rounded-xl font-black text-sm">
              Get Started Free
            </Link>
          </div>

          {/* Pro */}
          <div className="relative p-8 rounded-3xl bg-[#1a1a1a] border border-orange-500/30 flex flex-col overflow-hidden">
            {/* Glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/8 rounded-full blur-3xl pointer-events-none" />

            {/* Badge */}
            <div className="absolute top-5 right-5 bg-orange-500 text-white text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
              Most Popular
            </div>

            <div className="mb-6 relative">
              <p className="text-xs font-black text-orange-400 uppercase tracking-widest mb-2">Pro</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-5xl font-black text-white">$9</span>
                <span className="text-slate-500 mb-2">/month</span>
              </div>
              <p className="text-sm text-slate-500">Everything you need to ace your exams.</p>
            </div>

            <ul className="space-y-3 flex-1 mb-8 relative">
              {[
                'Unlimited document uploads',
                'Full study kit — notes, cards, quiz, podcast, mindmap',
                'Unlimited AI tutor chat',
                'Collaborative study spaces',
                'Priority generation (under 15s)',
                'Smart Study Planner',
                'Download FlowCast episodes',
              ].map(item => (
                <li key={item} className="flex items-start gap-3 text-sm text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <Link href="/signup" className="btn-primary w-full text-center py-3 rounded-xl font-black text-sm relative">
              Start Pro Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── CTA Section ────────────────────────────────────────────────────────────
function CTASection() {
  return (
    <section className="py-28 px-6 bg-[#0a0a0a]">
      <div className="max-w-4xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden bg-[#1a1a1a] border border-orange-500/15 flex flex-col items-center text-center px-8 py-24">
          {/* Glows */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-orange-500/12 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-orange-500/8 rounded-full blur-3xl pointer-events-none" />

          {/* Badge */}
          <div className="relative inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-black px-4 py-2 rounded-full mb-8 uppercase tracking-widest">
            <Zap className="w-3.5 h-3.5 fill-orange-400" />
            Free to start · No credit card
          </div>

          <h2 className="relative text-5xl md:text-6xl font-black text-white tracking-tight mb-5 leading-[1.05]">
            Ready to enter the<br />
            <span className="text-orange-500">NITE Mind?</span>
          </h2>

          <p className="relative text-slate-400 text-lg mb-10 max-w-xl leading-relaxed">
            Upload your first document and get a complete AI study kit — notes, flashcards, quiz, podcast, and AI tutor — in under 30 seconds.
          </p>

          <div className="relative flex flex-col sm:flex-row gap-4 items-center">
            <Link href="/signup" className="btn-primary text-base px-10 py-4 rounded-xl font-black">
              Start for Free <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/login" className="text-slate-500 hover:text-white text-base px-6 py-4 transition-colors font-semibold">
              Already have an account →
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ─────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-white/5 py-12">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-slate-600">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Brain className="w-4 h-4 text-orange-400" />
          </div>
          <span className="font-black text-white tracking-tight">Flow<span className="text-orange-500">State</span></span>
        </Link>

        <p>© {new Date().getFullYear()} FlowState. All rights reserved.</p>

        <div className="flex gap-6">
          <Link href="#" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="#" className="hover:text-white transition-colors">Terms</Link>
        </div>
      </div>
    </footer>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white overflow-x-hidden">
      <Navbar />
      <Hero />
      <StatsBar />
      <HowItWorks />
      <FeaturesGrid />
      <SpotlightTutor />
      <SpotlightPodcast />
      <ComparisonTable />
      <Testimonials />
      <Pricing />
      <CTASection />
      <Footer />
    </div>
  )
}
