import Link from 'next/link'
import {
  ArrowRight, Zap, Users, BookOpen, Globe, Sparkles, Brain,
  CheckCircle2, Headphones, Map, FlaskConical, Calendar,
  BarChart2, Mic, Radio, Target, FileText, Video, Play,
  Star, Flame, Clock, TrendingUp
} from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 overflow-hidden relative">
      {/* Ambient background glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/15 rounded-full blur-[140px] mix-blend-multiply dark:mix-blend-screen -z-10 animate-pulse-slow pointer-events-none" />
      <div className="fixed top-[30%] right-[-10%] w-[35%] h-[60%] bg-violet-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="fixed bottom-0 left-[30%] w-[40%] h-[30%] bg-emerald-500/5 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 glass-panel border-b-0 border-r-0 border-l-0 rounded-none font-outfit">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                <img 
                  src="/images/logo-icon.png" 
                  alt="FlowState" 
                  className="h-14 w-auto relative z-10 transition-transform duration-500 group-hover:scale-110 contrast-110 brightness-110" 
                  style={{ imageRendering: '-webkit-optimize-contrast' }}
                />
              </div>
              <span className="text-3xl font-black tracking-tighter text-slate-900 dark:text-white uppercase font-outfit">
                FLOW<span className="text-primary">STATE</span>
              </span>
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-8 font-medium text-sm text-slate-600 dark:text-slate-300">
            <Link href="#features" className="hover:text-primary transition-colors">Features</Link>
            <Link href="#how-it-works" className="hover:text-primary transition-colors">How it works</Link>
            <Link href="#tools" className="hover:text-primary transition-colors">Tools</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-primary transition-colors">Log in</Link>
            <Link href="/signup" className="btn-primary py-2 px-5 text-sm shadow-primary/20">Sign up free</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────── */}
      <section className="relative pt-36 pb-24 lg:pt-52 lg:pb-36 px-6 max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        <div className="animate-fade-in-up">
          <div className="inline-flex items-center gap-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-primary/20 text-primary text-xs font-bold px-4 py-2 rounded-full mb-8 shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI-powered · Real-time · Made for students</span>
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold leading-[1.08] mb-8 tracking-tight text-slate-900 dark:text-white">
            Your AI study<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-violet-500 to-emerald-400">
              companion.
            </span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-lg lg:text-xl mb-10 leading-relaxed max-w-xl">
            Upload a PDF, paste a YouTube link, or type a topic. FlowState builds your entire study kit — notes, flashcards, quizzes, mind maps, and an AI tutor — in seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-10">
            <Link href="/signup" className="btn-primary w-full sm:w-auto text-lg px-8 py-4">
              Start for Free <ArrowRight className="w-5 h-5 ml-2 inline" />
            </Link>
            <Link href="/login" className="btn-secondary w-full sm:w-auto text-lg px-8 py-4">
              <Play className="w-5 h-5 mr-2 text-slate-500 inline" /> See a demo
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-500 dark:text-slate-400">
            {['No credit card needed', 'Upload PDFs & videos', 'AI that knows your syllabus'].map((t) => (
              <span key={t} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> {t}
              </span>
            ))}
          </div>
        </div>

        {/* Hero mockup */}
        <div className="relative animate-float lg:ml-10">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-violet-500/20 blur-3xl rounded-full pointer-events-none" />
          <div className="relative glass-card border border-white/40 dark:border-slate-700/50 p-6 rounded-3xl shadow-2xl backdrop-blur-2xl bg-white/70 dark:bg-slate-900/80 space-y-5">
            {/* Study Kit header */}
            <div className="flex items-center gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-violet-500 rounded-2xl flex items-center justify-center shadow-inner">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">FlowAI Tutor</h3>
                <p className="text-xs text-primary font-semibold">Studying "Organic Chemistry Ch. 7"</p>
              </div>
              <div className="ml-auto flex items-center gap-1 text-xs text-emerald-500 font-bold bg-emerald-500/10 px-2 py-1 rounded-lg">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </div>
            </div>
            {/* Chat */}
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0 mt-0.5" />
                <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-2xl rounded-tl-sm text-sm text-slate-700 dark:text-slate-300 max-w-[85%]">
                  Explain SN2 reactions and when they beat SN1
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-violet-500 shrink-0 mt-0.5 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-primary/10 dark:bg-primary/15 border border-primary/20 p-3 rounded-2xl rounded-tl-sm text-sm text-slate-800 dark:text-slate-200 max-w-[85%]">
                  <p className="mb-2">SN2 dominates with primary substrates + strong nucleophiles. The backside attack inverts stereochemistry (Walden inversion)...</p>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="text-primary flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 8 Flashcards</span>
                    <span className="text-violet-500 flex items-center gap-1"><Map className="w-3 h-3" /> Mind Map</span>
                    <span className="text-emerald-500 flex items-center gap-1"><FlaskConical className="w-3 h-3" /> Practice Quiz</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              {[
                { label: 'Study Streak', value: '14 days', icon: Flame, color: 'text-orange-500' },
                { label: 'Cards Due', value: '23 cards', icon: Target, color: 'text-primary' },
                { label: 'This Week', value: '12.5 hrs', icon: Clock, color: 'text-emerald-500' },
              ].map((s) => (
                <div key={s.label} className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 text-center">
                  <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
                  <p className="font-extrabold text-sm text-slate-900 dark:text-white">{s.value}</p>
                  <p className="text-[10px] text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ───────────────────────────── */}
      <section className="border-y border-slate-200/50 dark:border-slate-800/50 bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm py-10">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs text-slate-400 font-bold tracking-widest uppercase mb-8">Built for ambitious students everywhere</p>
          <div className="flex flex-wrap justify-center gap-x-14 gap-y-6 text-slate-400 dark:text-slate-500 font-extrabold text-lg opacity-60">
            {['STANFORD', 'MIT', 'CAMBRIDGE', 'OXFORD', 'ETH ZURICH', 'UCL', 'TORONTO'].map((s) => (
              <span key={s} className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-default">{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────── */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-32">
        <div className="text-center mb-20">
          <h2 className="text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white mb-5">From upload to exam-ready<br />in three steps.</h2>
          <p className="text-lg text-slate-500">No setup. No syllabus-building. Just results.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-12 left-[25%] right-[25%] h-px bg-gradient-to-r from-primary/40 via-violet-500/40 to-emerald-400/40" />
          {[
            { step: '01', icon: FileText, color: 'text-primary', bg: 'bg-primary/10', title: 'Upload your material', desc: 'Drop a PDF lecture, paste a YouTube URL, or type in a topic. We handle PDFs up to 50 MB.' },
            { step: '02', icon: Sparkles, color: 'text-violet-500', bg: 'bg-violet-500/10', title: 'AI builds your Study Kit', desc: 'In seconds, get AI notes, auto-flashcards, quizzes, a visual mind map, and a full study podcast.' },
            { step: '03', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', title: 'Learn with spaced repetition', desc: 'Our SM-2 algorithm schedules your reviews so you remember everything — right before your exam.' },
          ].map((item) => (
            <div key={item.step} className="glass-card p-8 flex flex-col items-center text-center relative">
              <div className={`w-16 h-16 rounded-2xl ${item.bg} flex items-center justify-center mb-6 shadow-sm`}>
                <item.icon className={`w-8 h-8 ${item.color}`} />
              </div>
              <span className="absolute top-5 right-6 text-6xl font-black text-slate-100 dark:text-slate-800 select-none">{item.step}</span>
              <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-white">{item.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES GRID ──────────────────────────── */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-16 pb-32">
        <div className="text-center max-w-3xl mx-auto mb-20 animate-fade-in-up">
          <h2 className="text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white mb-6">
            Every tool a top student needs.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-violet-500">All in one place.</span>
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Scientifically-proven study techniques combined with state-of-the-art AI — from your first read to your last revision.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              icon: Brain, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-500/10',
              title: 'AI Personal Tutor',
              desc: 'Chat with an AI that has read your exact lecture notes. Ask "what does page 42 mean?" and get a precise, cited answer. Includes vision support for diagrams and equations.',
            },
            {
              icon: Zap, color: 'text-violet-500', bg: 'bg-violet-500/10',
              title: 'Spaced Repetition Flashcards',
              desc: 'Auto-generated from your uploads using the proven SM-2 algorithm. The app learns which cards you struggle with and schedules reviews at the optimal moment.',
            },
            {
              icon: Radio, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10',
              title: 'FlowCast — AI Study Podcast',
              desc: 'Turn any document into a dynamic two-host audio podcast. Interrupt mid-episode to ask questions, get answers spoken back, and keep learning hands-free.',
            },
            {
              icon: Map, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10',
              title: 'Visual Mind Maps',
              desc: 'Generate beautiful, interactive concept maps from any resource. See how topics connect at a glance and identify knowledge gaps before the exam.',
            },
            {
              icon: FlaskConical, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10',
              title: 'AI Quiz Generator',
              desc: 'Practice with MCQs, short-answer, and true/false questions tailored to your syllabus and academic level. Get instant AI feedback on every wrong answer.',
            },
            {
              icon: Mic, color: 'text-primary', bg: 'bg-primary/10',
              title: 'Math & Formula Solver',
              desc: 'Paste or type any equation. FlowState shows step-by-step derivations with LaTeX rendering, explains the underlying theory, and links it to your notes.',
            },
            {
              icon: Video, color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-500/10',
              title: 'YouTube → Study Kit',
              desc: 'Paste any lecture URL. We fetch the transcript (or transcribe via Whisper AI if no captions exist), summarise the key concepts, and build a full study kit.',
            },
            {
              icon: Users, color: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-500/10',
              title: 'Study Groups & Collaboration',
              desc: 'Create or join groups, share resources, chat with your team, and have an AI TA that knows your group\'s shared materials. Real-time collaborative workspace included.',
            },
            {
              icon: Calendar, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10',
              title: 'Smart Study Planner',
              desc: 'Schedule study blocks, set assignment deadlines, and let the AI create an adaptive revision plan that rebalances itself as your priorities change.',
            },
            {
              icon: Globe, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10',
              title: 'Community & Public Library',
              desc: 'Discover public notes, popular flashcard decks, and study events shared by students in your field. Like and comment on content, or share your own.',
            },
            {
              icon: BarChart2, color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-500/10',
              title: 'Progress Analytics',
              desc: 'Track your study streak, weekly hours, review accuracy, and flashcard retention over time. See exactly where to focus next to maximise your exam score.',
            },
            {
              icon: BookOpen, color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-700/40',
              title: 'Rich Notes with LaTeX',
              desc: 'AI-written notes render mathematical expressions, code blocks, and Mermaid diagrams natively. Edit in-line and save your own annotations alongside the AI output.',
            },
          ].map((f) => (
            <div key={f.title} className="glass-card p-7 relative overflow-hidden group hover:shadow-xl transition-shadow duration-300">
              <div className={`absolute top-0 right-0 w-28 h-28 ${f.bg} rounded-bl-full -z-10 transition-transform group-hover:scale-125 duration-500`} />
              <div className={`w-13 h-13 rounded-2xl ${f.bg} flex items-center justify-center mb-5 shadow-sm w-12 h-12`}>
                <f.icon className={`w-6 h-6 ${f.color}`} />
              </div>
              <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">{f.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TOOLS SPOTLIGHT ────────────────────────── */}
      <section id="tools" className="bg-slate-900 dark:bg-slate-950 py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-5">
              Powered by the best AI models.
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              FlowState routes your requests to the right model — GPT-4o for vision, Claude for reasoning, Gemini for speed. You always get the smartest answer, automatically.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* FlowCast feature */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col gap-6">
              <div className="w-14 h-14 bg-rose-500/20 rounded-2xl flex items-center justify-center">
                <Headphones className="w-7 h-7 text-rose-400" />
              </div>
              <div>
                <h3 className="text-2xl font-extrabold text-white mb-3">FlowCast — Study by listening</h3>
                <p className="text-slate-400 leading-relaxed">
                  Turn any PDF or note into a rich two-host conversation. Commute, gym, or cooking — keep learning without opening your laptop. Interrupt at any moment to ask questions out loud.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {['2-voice dialogue', 'Whisper speech-to-text', 'Real-time interruptions', 'Edge TTS narration'].map((tag) => (
                  <span key={tag} className="text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1 rounded-full">{tag}</span>
                ))}
              </div>
            </div>

            {/* Mind Map feature */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col gap-6">
              <div className="w-14 h-14 bg-amber-500/20 rounded-2xl flex items-center justify-center">
                <Map className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <h3 className="text-2xl font-extrabold text-white mb-3">Mind Maps that think with you</h3>
                <p className="text-slate-400 leading-relaxed">
                  Visual concept maps generated from your exact document. Each branch links to the relevant section, so you can drill down into any topic with a single click.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {['AI-generated structure', 'Mermaid diagrams', 'Topic-linked branches', 'Dark & light mode'].map((tag) => (
                  <span key={tag} className="text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full">{tag}</span>
                ))}
              </div>
            </div>

            {/* Flashcard feature */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col gap-6">
              <div className="w-14 h-14 bg-violet-500/20 rounded-2xl flex items-center justify-center">
                <Zap className="w-7 h-7 text-violet-400" />
              </div>
              <div>
                <h3 className="text-2xl font-extrabold text-white mb-3">Flashcards that adapt to you</h3>
                <p className="text-slate-400 leading-relaxed">
                  SM-2 spaced repetition ensures you review each card at the exact moment you're about to forget it. Export any deck to Anki-compatible CSV with one click.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {['SM-2 algorithm', 'Auto-generated', 'Anki export', 'Difficulty tracking'].map((tag) => (
                  <span key={tag} className="text-xs font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20 px-3 py-1 rounded-full">{tag}</span>
                ))}
              </div>
            </div>

            {/* Planner feature */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col gap-6">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
                <Calendar className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-2xl font-extrabold text-white mb-3">Planner that plans itself</h3>
                <p className="text-slate-400 leading-relaxed">
                  Set your deadlines, let the AI schedule your revision blocks. Tracks your weekly goal, study streak, and automatically reschedules if you miss a session.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Deadline tracking', 'AI scheduling', 'Weekly goals', 'Streak system'].map((tag) => (
                  <span key={tag} className="text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-32">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4">Students love it.</h2>
          <p className="text-slate-500">Real results from real students.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { name: 'Aisha K.', role: 'Medical Student', avatar: 'Aisha', color: 'bg-rose-100', quote: 'I uploaded 3 months of anatomy notes and FlowState built me a complete revision plan with 400 flashcards. Got an A in my finals.' },
            { name: 'Marcus L.', role: 'CS Undergrad', avatar: 'Marcus', color: 'bg-sky-100', quote: 'The AI tutor actually understands my lecture slides. I stopped spending hours on Stack Overflow and just ask FlowState instead.' },
            { name: 'Priya S.', role: 'Law Student', avatar: 'Priya', color: 'bg-violet-100', quote: 'FlowCast is insane — I listen to AI podcasts of my case law readings while commuting. I review 2x as much material now.' },
          ].map((t) => (
            <div key={t.name} className="glass-card p-8 flex flex-col gap-6">
              <div className="flex gap-1">
                {[1,2,3,4,5].map((i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-4">
                <img
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${t.avatar}&backgroundColor=e2e8f0`}
                  alt={t.name}
                  className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-700"
                />
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-sm">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────── */}
      <section className="px-6 pb-32 max-w-7xl mx-auto animate-fade-in-up">
        <div className="relative rounded-[3rem] overflow-hidden bg-slate-900 dark:bg-slate-950 border border-slate-800 flex flex-col items-center text-center px-6 py-28 shadow-2xl">
          <div className="absolute top-[-20%] left-[20%] w-[60%] h-[60%] bg-primary/30 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[10%] w-[30%] h-[50%] bg-violet-500/20 rounded-full blur-[80px] pointer-events-none" />
          <h2 className="text-5xl lg:text-6xl font-extrabold text-white mb-8 relative z-10">
            Ready to enter your<br />
            <span className="text-primary italic">FlowState?</span>
          </h2>
          <p className="text-xl text-slate-300 mb-12 max-w-2xl relative z-10">
            Upload your first document and get a complete AI study kit in under 30 seconds. Free to start.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 relative z-10">
            <Link href="/signup" className="btn-primary text-lg px-12 py-5 shadow-primary/40 hover:scale-[1.02] transition-transform">
              Start for Free <ArrowRight className="w-5 h-5 ml-2 inline" />
            </Link>
            <Link href="/login" className="text-white/70 hover:text-white text-lg px-8 py-5 transition-colors font-semibold">
              Already have an account →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────── */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 pt-20 pb-10">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-16">
          <div className="col-span-2 lg:col-span-2">
            <Link href="/" className="flex items-center gap-3 group mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                <img 
                  src="/images/logo-icon.png" 
                  alt="FlowState" 
                  className="h-12 w-auto relative z-10 transition-transform duration-500 group-hover:scale-110 contrast-110 brightness-110" 
                  style={{ imageRendering: '-webkit-optimize-contrast' }}
                />
              </div>
              <span className="text-2xl font-black tracking-tighter text-slate-900 dark:text-white uppercase font-outfit">
                FLOW<span className="text-primary">STATE</span>
              </span>
            </Link>
            <p className="text-slate-500 max-w-xs mb-6 text-sm leading-relaxed">
              The AI study platform built for students who want to learn faster, retain more, and actually enjoy studying.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-6 text-sm">Product</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><Link href="#features" className="hover:text-primary transition-colors">Features</Link></li>
              <li><Link href="#tools" className="hover:text-primary transition-colors">AI Tools</Link></li>
              <li><Link href="/library" className="hover:text-primary transition-colors">Study Library</Link></li>
              <li><Link href="/signup" className="hover:text-primary transition-colors">Get Started</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-6 text-sm">Study Tools</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              {['AI Tutor', 'Flashcards', 'FlowCast', 'Mind Maps', 'Quizzes', 'Planner'].map((t) => (
                <li key={t}><Link href="/signup" className="hover:text-primary transition-colors">{t}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-6 text-sm">Legal</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><Link href="#" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 border-t border-slate-200 dark:border-slate-800 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-slate-500">
          <p>© {new Date().getFullYear()} FlowState. All rights reserved.</p>
          <p className="mt-2 md:mt-0 text-xs text-slate-400">Made with ❤️ for students who want to be great.</p>
        </div>
      </footer>
    </div>
  )
}
