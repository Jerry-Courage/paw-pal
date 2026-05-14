'use client'

import Link from 'next/link'
import {
  ArrowRight, Brain, Layers, Map,
  HelpCircle, Wand2, Radio, Calculator, Upload, Link2, Mic,
  CheckCircle2, Star, Zap, Users, Calendar, Sparkles,
  FileText, ChevronRight, Play, BarChart3,
  Clock, MessageSquare, TrendingUp, Award
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Navbar ────────────────────────────────────────────────────────────────
function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0d0d0d]/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center group-hover:bg-orange-500/20 transition-all overflow-hidden p-0.5">
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

      <div className="relative max-w-5xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-orange-500/5 text-orange-500 text-[10px] font-black px-4 py-2 rounded-full mb-10 uppercase tracking-[0.2em]">
          <Zap className="w-3 h-3 fill-orange-500" />
          New Intelligence Tech Era
        </div>
        
        {/* Headline */}
        <h1 className="text-6xl md:text-8xl font-black leading-[0.95] mb-8 tracking-tighter">
          Master any subject<br />
          <span className="text-orange-500">with NITE Mind.</span>
        </h1>

        {/* Subtext */}
        <p className="text-slate-400 text-lg md:text-xl mb-14 leading-relaxed max-w-2xl mx-auto font-medium">
          The all-in-one AI partner for the next generation of students. Live voice prep, instant study kits, and memory-sync technology.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
          <Link href="/signup" className="btn-primary text-base px-10 py-4 rounded-2xl font-black shadow-2xl shadow-orange-500/20">
            Get Started Free <ArrowRight className="w-5 h-5 ml-1" />
          </Link>
          <Link href="#features" className="px-10 py-4 text-slate-500 hover:text-white transition-all font-bold text-sm">
            Explore Features
          </Link>
        </div>

        {/* Hero Image / Mockup Placeholder */}
        <div className="relative max-w-6xl mx-auto px-4">
           <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-transparent to-transparent z-10" />
           <div className="relative rounded-[2.5rem] bg-[#1a1a1a]/50 backdrop-blur-3xl overflow-hidden aspect-[16/9] flex items-center justify-center">
              <div className="flex flex-col items-center text-center">
                 <div className="w-20 h-20 bg-orange-500/10 rounded-3xl flex items-center justify-center mb-6">
                    <Brain className="w-10 h-10 text-orange-500" />
                 </div>
                 <h3 className="text-2xl font-black text-white mb-2">Live AI Exam Simulation</h3>
                 <p className="text-slate-500 max-w-sm text-sm">Coming this fall: Real-time voice interaction with NITE AI to simulate high-pressure exams.</p>
              </div>
           </div>
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
      title: 'Upload anything',
      desc: 'Drop a PDF, paste a YouTube URL, type a topic, or record your lecture live. We handle files up to 50 MB across all formats.',
    },
    {
      step: '02',
      icon: Sparkles,
      accent: 'text-violet-400',
      bg: 'bg-violet-500/10',
      title: 'AI generates your kit',
      desc: 'In seconds, get AI-written notes, auto-generated flashcards, a quiz, a podcast episode, and an interactive mind map.',
    },
    {
      step: '03',
      icon: TrendingUp,
      accent: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      title: 'Master with science',
      desc: 'Spaced repetition schedules your reviews. The AI tutor answers questions. Practice tests track your progress to exam day.',
    },
  ]

  return (
    <section id="how-it-works" className="py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-3">How it works</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            From upload to exam-ready<br />in three steps.
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">No setup. No syllabus-building. Just results.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {steps.map(({ step, icon: Icon, accent, bg, title, desc }) => (
            <div key={step} className={`relative p-8 rounded-[2rem] bg-[#1a1a1a]/50 backdrop-blur-sm overflow-hidden group hover:bg-[#1f1f1f]/50 transition-all duration-300`}>
              <div className={`relative w-14 h-14 rounded-2xl ${bg} flex items-center justify-center mb-6`}>
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
      icon: Sparkles,
      accent: 'text-orange-400',
      bg: 'bg-orange-500/10',
      title: 'Live AI Exam Prep',
      desc: 'Simulate high-pressure exam sessions with real-time voice interaction. NITE AI quizzes you live and gives instant verbal feedback.',
    },
    {
      icon: Radio,
      accent: 'text-pink-400',
      bg: 'bg-pink-500/10',
      title: 'Voice Study Sessions',
      desc: 'Hands-free studying. Discuss your materials with NITE AI while walking, driving, or relaxing. Natural voice flow.',
    },
    {
      icon: Layers,
      accent: 'text-sky-400',
      bg: 'bg-sky-500/10',
      title: 'Memory-Sync Technology',
      desc: 'Spaced repetition system that syncs across all your study kits. It knows what you forgot before you do.',
    },
    {
      icon: FileText,
      accent: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      title: 'Instant Study Kits',
      desc: 'Drop any material and get structured notes, flashcards, and practice tests in under 30 seconds.',
    },
    {
      icon: Users,
      accent: 'text-violet-400',
      bg: 'bg-violet-500/10',
      title: 'Collaborative Space',
      desc: 'Study together with friends. A shared AI partner that understands your group\'s combined knowledge base.',
    },
    {
      icon: Map,
      accent: 'text-amber-400',
      bg: 'bg-amber-500/10',
      title: 'Interactive Mind Maps',
      desc: 'See the big picture. NITE Mind auto-generates visual concept maps to show how topics connect.',
    },
  ]

  return (
    <section id="features" className="py-28 px-6 bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-3">Features</p>
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-4">
            Designed for the era of AI.
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Everything you need to master your syllabus in record time.
          </p>
        </div>

        <div id="tools" className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map(({ icon: Icon, accent, bg, title, desc }) => (
            <div
              key={title}
              className={`group p-8 rounded-[2.5rem] bg-[#1a1a1a]/50 hover:bg-[#1e1e1e] transition-all duration-300 cursor-default`}
            >
              <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center mb-6`}>
                <Icon className={`w-6 h-6 ${accent}`} />
              </div>
              <h3 className="text-base font-black text-white mb-3 tracking-tight">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
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
        <div>
          <div className="inline-flex items-center gap-2 bg-orange-500/10 text-orange-400 text-[10px] font-black px-3 py-1.5 rounded-full mb-6 uppercase tracking-widest">
            <Brain className="w-3.5 h-3.5" /> AI Personal Tutor
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-6 leading-[1.05]">
            An AI that actually<br />
            <span className="text-orange-500">read your notes.</span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed mb-8">
            Unlike generic chatbots, NITE AI is trained on your exact material. Ask it to explain a concept from your lecture, quiz you on a specific chapter, or simplify a complex formula.
          </p>
          <ul className="space-y-4 mb-10">
            {[
              'Answers questions from your specific documents',
              'Cites exact pages or timestamps',
              'Adjusts explanation depth to your level',
              'Available 24/7 across all your devices',
            ].map(item => (
              <li key={item} className="flex items-start gap-3 text-sm text-slate-400 font-medium">
                <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <Link href="/signup" className="btn-primary inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-black">
            Try the AI Tutor <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 bg-orange-500/5 rounded-3xl blur-2xl" />
          <div className="relative rounded-[2.5rem] bg-[#111] overflow-hidden shadow-2xl">
            <div className="flex items-center gap-3 px-6 py-5 bg-[#161616]">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-black text-white">NITE AI Tutor</p>
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Active · Trained on Notes</p>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex justify-end">
                <div className="bg-orange-500/10 rounded-2xl rounded-tr-sm px-5 py-4 max-w-[80%]">
                  <p className="text-sm text-white">Can you explain the difference between mitosis and meiosis from my notes?</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                  <Brain className="w-4 h-4 text-orange-400" />
                </div>
                <div className="bg-[#1a1a1a] rounded-2xl rounded-tl-sm px-5 py-4 max-w-[85%]">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    From your <span className="text-orange-400 font-bold">Chapter 4 notes</span>:
                  </p>
                  <div className="mt-4 space-y-3">
                    <div className="flex gap-2 text-xs">
                      <span className="text-orange-400 font-black tracking-widest uppercase">Mitosis:</span>
                      <span className="text-slate-400">Produces 2 identical diploid cells for growth.</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="text-violet-400 font-black tracking-widest uppercase">Meiosis:</span>
                      <span className="text-slate-400">Produces 4 genetically unique haploid cells for reproduction.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
    { feature: 'Live Exam Prep',        flowstate: 'AI Voice Interaction',    traditional: 'Not available' },
    { feature: 'Memory Sync',           flowstate: 'Cross-document',          traditional: 'Manual review' },
    { feature: 'AI tutor',              flowstate: 'Knows your material',     traditional: 'Generic chatbot' },
  ]

  return (
    <section className="py-28 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-3">Why NITE Mind</p>
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-4">
            The difference is night and day.
          </h2>
        </div>

        <div className="rounded-[2.5rem] overflow-hidden bg-[#111]">
          <div className="grid grid-cols-3 bg-[#161616]">
            <div className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Feature</div>
            <div className="px-8 py-6 text-[10px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-2">
              <img src="/images/logo-icon.png" className="w-4 h-4 object-contain" /> NITE Mind
            </div>
            <div className="px-8 py-6 text-[10px] font-black text-slate-600 uppercase tracking-widest">Traditional</div>
          </div>

          {rows.map(({ feature, flowstate, traditional }, i) => (
            <div
              key={feature}
              className={cn(
                "grid grid-cols-3 hover:bg-white/2 transition-colors",
                i % 2 === 1 && "bg-white/[0.01]"
              )}
            >
              <div className="px-8 py-6 text-sm font-bold text-slate-400">{feature}</div>
              <div className="px-8 py-6 flex items-center gap-2">
                <span className="text-emerald-400 text-base">✅</span>
                <span className="text-sm font-black text-white">{flowstate}</span>
              </div>
              <div className="px-8 py-6 flex items-center gap-2">
                <span className="text-red-400 text-base">❌</span>
                <span className="text-sm text-slate-600 font-medium">{traditional}</span>
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
      color: 'bg-orange-500/10 text-orange-400',
      quote: 'I uploaded 3 months of anatomy notes and NITE Mind built me a complete revision plan. The live voice prep actually simulated my oral exams perfectly.',
    },
    {
      name: 'Marcus L.',
      role: 'CS Undergrad · Stanford',
      initials: 'ML',
      color: 'bg-sky-500/10 text-sky-400',
      quote: 'The AI tutor actually understands my lecture slides. I stopped spending hours on Stack Overflow and just ask NITE AI instead. It explains everything.',
    },
    {
      name: 'Priya S.',
      role: 'Law Student · Year 3',
      initials: 'PS',
      color: 'bg-pink-500/10 text-pink-400',
      quote: 'Voice Study Sessions are insane. I listen to AI discussions of my case law readings while commuting. I retain twice as much material now.',
    },
  ]

  return (
    <section className="py-28 px-6 bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-3">Testimonials</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight">Students love it.</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {testimonials.map(({ name, role, initials, color, quote }) => (
            <div key={name} className="p-10 rounded-[2.5rem] bg-[#1a1a1a]/50 hover:bg-[#1e1e1e] transition-all flex flex-col gap-6 group duration-300">
              <div className="flex gap-1">
                {[1,2,3,4,5].map(i => <Star key={i} className="w-3 h-3 fill-orange-500 text-orange-500" />)}
              </div>
              <p className="text-sm text-slate-400 leading-relaxed flex-1 font-medium italic">
                &ldquo;{quote}&rdquo;
              </p>
              <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xs font-black ${color}`}>
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-black text-white">{name}</p>
                  <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">{role}</p>
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
      <div className="max-w-5xl mx-auto text-center">
        <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-3">Pricing</p>
        <h2 className="text-4xl md:text-7xl font-black text-white tracking-tighter mb-16">Simple pricing.</h2>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
          <div className="p-10 rounded-[3rem] bg-[#1a1a1a]/50 flex flex-col">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Free</p>
            <div className="flex items-end gap-1 mb-8">
              <span className="text-6xl font-black text-white">$0</span>
              <span className="text-slate-500 mb-2 font-bold">/mo</span>
            </div>
            <ul className="space-y-4 flex-1 mb-10">
              {['5 documents/mo', 'Basic study kits', '20 AI messages/day', 'Limited Voice Prep'].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm text-slate-400 font-medium">
                  <CheckCircle2 className="w-5 h-5 text-slate-700" /> {item}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="w-full text-center py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-black transition-all">
              Start Free
            </Link>
          </div>

          <div className="relative p-10 rounded-[3rem] bg-orange-500/5 overflow-hidden flex flex-col border border-orange-500/20">
            <div className="absolute top-0 right-0 p-6">
               <span className="bg-orange-500 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl">Best Value</span>
            </div>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-4">Pro</p>
            <div className="flex items-end gap-1 mb-8">
              <span className="text-6xl font-black text-white">$9</span>
              <span className="text-slate-500 mb-2 font-bold">/mo</span>
            </div>
            <ul className="space-y-4 flex-1 mb-10">
              {['Unlimited uploads', 'Full AI study kits', 'Unlimited AI Tutor', 'Live Voice Exam Prep', 'Memory-Sync Technology'].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm text-slate-200 font-bold">
                  <CheckCircle2 className="w-5 h-5 text-orange-500" /> {item}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="btn-primary w-full text-center py-4 rounded-2xl font-black shadow-2xl shadow-orange-500/20">
              Get Pro Now <ArrowRight className="w-4 h-4" />
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
        <div className="relative rounded-[3.5rem] overflow-hidden bg-[#1a1a1a] flex flex-col items-center text-center px-8 py-24 shadow-2xl">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-orange-500/10 to-transparent pointer-events-none" />
          <div className="relative inline-flex items-center gap-2 bg-orange-500/10 text-orange-400 text-[10px] font-black px-4 py-2 rounded-full mb-8 uppercase tracking-[0.2em]">
            <Zap className="w-3 h-3 fill-orange-400" /> Join the Intelligence Tech Era
          </div>
          <h2 className="relative text-6xl md:text-8xl font-black text-white tracking-tighter mb-8 leading-[0.95]">
            Ready to master<br />
            <span className="text-orange-500">everything?</span>
          </h2>
          <p className="relative text-slate-400 text-lg mb-14 max-w-xl leading-relaxed font-medium">
            Experience the most advanced AI study partner ever built. Start your journey with NITE Mind today.
          </p>
          <Link href="/signup" className="relative btn-primary text-lg px-12 py-5 rounded-2xl font-black shadow-2xl shadow-orange-500/30">
            Start for Free <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ─────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="py-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12 text-sm">
        <div className="col-span-2">
          <Link href="/" className="flex items-center gap-2.5 mb-6">
            <img src="/images/logo-icon.png" className="w-8 h-8 object-contain" />
            <span className="font-black text-xl tracking-tighter uppercase">NITE <span className="text-orange-500">Mind</span></span>
          </Link>
          <p className="text-slate-500 max-w-xs leading-relaxed font-medium">
            Revolutionizing how the world learns. The New Intelligence Tech Era for students and lifelong learners.
          </p>
        </div>
        <div>
          <h4 className="text-white font-black uppercase tracking-widest text-[10px] mb-6">Platform</h4>
          <ul className="space-y-4 text-slate-500 font-bold">
            <li><Link href="#features" className="hover:text-white transition-colors">Features</Link></li>
            <li><Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link></li>
            <li><Link href="/login" className="hover:text-white transition-colors">Login</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-black uppercase tracking-widest text-[10px] mb-6">Legal</h4>
          <ul className="space-y-4 text-slate-500 font-bold">
            <li><Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link href="#" className="hover:text-white transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-black text-slate-700 uppercase tracking-widest">
        <p>© {new Date().getFullYear()} NITE Mind. All rights reserved.</p>
        <p>Built with ❤️ for the future of education.</p>
      </div>
    </footer>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white selection:bg-orange-500/30">
      <Navbar />
      <Hero />
      <StatsBar />
      <HowItWorks />
      <FeaturesGrid />
      <SpotlightTutor />
      <ComparisonTable />
      <Testimonials />
      <Pricing />
      <CTASection />
      <Footer />
    </div>
  )
}
