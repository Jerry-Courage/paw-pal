import Link from 'next/link'
import {
  ArrowRight, Brain, BookOpen, Layers, Headphones, Map,
  HelpCircle, Wand2, Radio, Calculator, Upload, Link2, Mic,
  CheckCircle2, Star, Flame, Clock, Target, Zap, Users, Calendar
} from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white overflow-hidden">

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className="fixed top-0 w-full z-50 bg-[#0d0d0d]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Brain className="w-4 h-4 text-orange-400" />
            </div>
            <span className="text-base font-black uppercase tracking-tight">
              Flow<span className="text-orange-500">State</span>
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-500">
            <Link href="#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="#how-it-works" className="hover:text-white transition-colors">How it works</Link>
            <Link href="#tools" className="hover:text-white transition-colors">Tools</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-semibold text-slate-400 hover:text-white transition-colors">Log in</Link>
            <Link href="/signup" className="btn-primary py-2 px-5 text-sm">Sign up free</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="pt-36 pb-24 px-6 max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-black px-4 py-2 rounded-full mb-8 uppercase tracking-widest">
          <Zap className="w-3.5 h-3.5" /> AI-powered · Made for students
        </div>
        <h1 className="text-5xl md:text-7xl font-black leading-[1.05] mb-6 tracking-tight">
          What do you wanna<br />
          <span className="text-orange-400">master today?</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl mb-10 leading-relaxed max-w-2xl mx-auto">
          Upload anything and get interactive notes, flashcards, quizzes, podcasts, and an AI tutor — in seconds.
        </p>

        {/* Upload cards */}
        <div className="grid grid-cols-3 gap-3 max-w-xl mx-auto mb-10">
          {[
            { icon: Upload, label: 'Upload', sub: 'Image, file, audio, video', href: '/signup' },
            { icon: Link2,  label: 'Paste',  sub: 'YouTube, website, text',    href: '/signup' },
            { icon: Mic,    label: 'Record', sub: 'Record live lecture',        href: '/signup' },
          ].map(({ icon: Icon, label, sub, href }) => (
            <Link key={label} href={href}
              className="group flex flex-col items-start gap-3 p-5 rounded-2xl bg-[#1a1a1a] border border-white/8 hover:border-orange-500/30 hover:bg-[#1f1f1f] transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 group-hover:bg-orange-500/10 flex items-center justify-center transition-colors">
                <Icon className="w-5 h-5 text-slate-400 group-hover:text-orange-400 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-black text-white">{label}</p>
                <p className="text-xs text-slate-600 mt-0.5">{sub}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
          {['No credit card needed', 'Upload PDFs & videos', 'AI that knows your syllabus'].map(t => (
            <span key={t} className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4 tracking-tight">From upload to exam-ready in three steps.</h2>
          <p className="text-slate-500">No setup. No syllabus-building. Just results.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: '01', icon: Upload,   color: 'text-orange-400 bg-orange-500/10', title: 'Upload your material',      desc: 'Drop a PDF, paste a YouTube URL, or type a topic. We handle PDFs up to 50 MB.' },
            { step: '02', icon: Brain,    color: 'text-violet-400 bg-violet-500/10', title: 'AI builds your Study Kit',  desc: 'In seconds, get AI notes, flashcards, quizzes, a mind map, and a study podcast.' },
            { step: '03', icon: Target,   color: 'text-emerald-400 bg-emerald-500/10', title: 'Learn with spaced repetition', desc: 'Our SM-2 algorithm schedules reviews so you remember everything before your exam.' },
          ].map(item => (
            <div key={item.step} className="relative p-6 rounded-2xl bg-[#1a1a1a] border border-white/6">
              <span className="absolute top-4 right-5 text-5xl font-black text-white/3 select-none">{item.step}</span>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${item.color}`}>
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-white mb-2">{item.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-16 pb-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4 tracking-tight">
            Every tool a top student needs.
          </h2>
          <p className="text-slate-500">Scientifically-proven study techniques combined with state-of-the-art AI.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: Brain,      color: 'text-orange-400 bg-orange-500/10', title: 'AI Personal Tutor',         desc: 'Chat with an AI that has read your exact lecture notes. Ask anything, get precise answers.' },
            { icon: Layers,     color: 'text-sky-400 bg-sky-500/10',       title: 'Spaced Repetition Cards',   desc: 'Auto-generated flashcards using the SM-2 algorithm. Learns which cards you struggle with.' },
            { icon: Radio,      color: 'text-pink-400 bg-pink-500/10',     title: 'FlowCast — Study Podcast',  desc: 'Turn any document into a two-host audio podcast. Interrupt to ask questions live.' },
            { icon: Map,        color: 'text-amber-400 bg-amber-500/10',   title: 'Visual Mind Maps',          desc: 'Generate interactive concept maps. See how topics connect and identify knowledge gaps.' },
            { icon: HelpCircle, color: 'text-violet-400 bg-violet-500/10', title: 'AI Quiz Generator',         desc: 'MCQs, short-answer, and true/false questions tailored to your syllabus and level.' },
            { icon: Calculator, color: 'text-teal-400 bg-teal-500/10',     title: 'Math & Formula Solver',     desc: 'Step-by-step derivations with LaTeX rendering. Explains the underlying theory.' },
            { icon: Wand2,      color: 'text-emerald-400 bg-emerald-500/10', title: 'Written Practice Tests',  desc: 'AI-graded written answers with detailed feedback, strengths, and improvement tips.' },
            { icon: Users,      color: 'text-indigo-400 bg-indigo-500/10', title: 'Study Groups',              desc: 'Create or join groups, share resources, and collaborate with an AI TA.' },
            { icon: Calendar,   color: 'text-rose-400 bg-rose-500/10',     title: 'Smart Study Planner',       desc: 'Set deadlines, let AI schedule revision blocks, and track your weekly goal.' },
          ].map(f => (
            <div key={f.title} className="p-6 rounded-2xl bg-[#1a1a1a] border border-white/6 hover:border-white/12 transition-all group">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black text-white mb-2">{f.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16 pb-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-black text-white mb-3 tracking-tight">Students love it.</h2>
          <p className="text-slate-500">Real results from real students.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { name: 'Aisha K.', role: 'Medical Student', quote: 'I uploaded 3 months of anatomy notes and FlowState built me a complete revision plan with 400 flashcards. Got an A in my finals.' },
            { name: 'Marcus L.', role: 'CS Undergrad', quote: 'The AI tutor actually understands my lecture slides. I stopped spending hours on Stack Overflow and just ask FlowState instead.' },
            { name: 'Priya S.', role: 'Law Student', quote: 'FlowCast is insane — I listen to AI podcasts of my case law readings while commuting. I review 2x as much material now.' },
          ].map(t => (
            <div key={t.name} className="p-6 rounded-2xl bg-[#1a1a1a] border border-white/6 flex flex-col gap-4">
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(i => <Star key={i} className="w-3.5 h-3.5 fill-orange-400 text-orange-400" />)}
              </div>
              <p className="text-sm text-slate-400 leading-relaxed flex-1">"{t.quote}"</p>
              <div>
                <p className="text-sm font-bold text-white">{t.name}</p>
                <p className="text-xs text-slate-600">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      <section className="px-6 pb-24 max-w-4xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden bg-[#1a1a1a] border border-white/8 flex flex-col items-center text-center px-6 py-20">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight relative z-10">
            Ready to enter your<br />
            <span className="text-orange-400">FlowState?</span>
          </h2>
          <p className="text-slate-400 mb-10 max-w-xl relative z-10">
            Upload your first document and get a complete AI study kit in under 30 seconds. Free to start.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 relative z-10">
            <Link href="/signup" className="btn-primary text-base px-10 py-4">
              Start for Free <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/login" className="text-slate-500 hover:text-white text-base px-8 py-4 transition-colors font-semibold">
              Already have an account →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-orange-400" />
            </div>
            <span className="font-black text-white uppercase tracking-tight text-sm">Flow<span className="text-orange-500">State</span></span>
          </div>
          <p>© {new Date().getFullYear()} FlowState. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-white transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
