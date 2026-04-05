import Link from 'next/link'
import { ArrowRight, Zap, Users, BookOpen, Globe, PlayCircle, Sparkles, Brain, CheckCircle2 } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 overflow-hidden relative">
      {/* Background decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen -z-10 animate-pulse-slow"></div>
      <div className="absolute top-[20%] right-[-10%] w-[30%] h-[50%] bg-violet-500/10 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen -z-10"></div>
      
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 glass-panel border-b-0 border-r-0 border-l-0 rounded-none">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
              FlowState
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 font-medium text-sm text-slate-600 dark:text-slate-300">
            <Link href="#features" className="hover:text-primary transition-colors">Features</Link>
            <Link href="#community" className="hover:text-primary transition-colors">Community</Link>
            <Link href="#pricing" className="hover:text-primary transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-primary transition-colors">Log in</Link>
            <Link href="/signup" className="btn-primary py-2 px-5 text-sm shadow-primary/20">Sign up</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 px-6 max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        <div className="animate-fade-in-up">
          <div className="inline-flex items-center gap-2 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold px-4 py-2 rounded-full mb-8 shadow-sm">
            <Sparkles className="w-4 h-4 text-primary" /> 
            <span>Now with GPT-4o Vision for PDF Analysis</span>
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold leading-[1.1] mb-8 tracking-tight text-slate-900 dark:text-white">
            Unlock your <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-violet-500">Peak Intelligence.</span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-lg lg:text-xl mb-10 leading-relaxed max-w-xl">
            Upload any lecture, PDF, or YouTube video. FlowState creates personalized study guides, active-recall flashcards, and an AI tutor that deeply understands your syllabus.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-10">
            <Link href="/signup" className="btn-primary w-full sm:w-auto text-lg px-8 py-4">
              Get Started for Free <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
            <Link href="#demo" className="btn-secondary w-full sm:w-auto text-lg px-8 py-4">
              <PlayCircle className="w-5 h-5 mr-2 text-slate-500" /> Watch Demo
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-500 dark:text-slate-400">
            <div className="flex -space-x-3">
              {[
                'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=e2e8f0',
                'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&backgroundColor=bbf7d0',
                'https://api.dicebear.com/7.x/avataaars/svg?seed=John&backgroundColor=fef08a'
              ].map((src, i) => (
                <img key={i} src={src} alt="User" className="w-10 h-10 rounded-full border-2 border-slate-50 dark:border-slate-950" />
              ))}
            </div>
            <p>Joined by <strong className="text-slate-800 dark:text-slate-200">50,000+</strong> top students</p>
          </div>
        </div>
        
        {/* Floating UI Mockup */}
        <div className="relative animate-float lg:ml-10">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-violet-500/20 blur-3xl rounded-full"></div>
          <div className="relative glass-card border border-white/40 dark:border-slate-700/50 p-6 rounded-3xl shadow-2xl backdrop-blur-2xl bg-white/60 dark:bg-slate-900/80">
            {/* Mockup Header */}
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200 dark:border-slate-800">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-violet-500 rounded-2xl flex items-center justify-center shadow-inner">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">FlowAI Tutor</h3>
                <p className="text-xs text-primary font-medium">Analyzing "Neuroscience_101.pdf"</p>
              </div>
            </div>
            {/* Mockup Chat */}
            <div className="space-y-4 mb-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0"></div>
                <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl rounded-tl-sm text-sm text-slate-700 dark:text-slate-300">
                  Can you explain how dopamine receptors actually work based on page 42?
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-primary shrink-0 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div className="bg-primary/10 dark:bg-primary/20 border border-primary/20 p-4 rounded-2xl rounded-tl-sm text-sm text-slate-800 dark:text-slate-200">
                  <p className="mb-3">Of course! Based on page 42, dopamine receptors are G protein-coupled receptors that...</p>
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <CheckCircle2 className="w-4 h-4" /> 12 Flashcards Generated
                  </div>
                </div>
              </div>
            </div>
            {/* Mockup Input */}
            <div className="relative">
              <input type="text" placeholder="Ask a follow up..." disabled className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm" />
              <button disabled className="absolute right-2 top-2 bg-primary text-white p-1.5 rounded-lg"><ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted by */}
      <section className="border-y border-slate-200/50 dark:border-slate-800/50 bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm py-10">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-sm text-slate-500 font-bold tracking-widest uppercase mb-8">Trusted by students from top universities</p>
          <div className="flex flex-wrap justify-center gap-x-16 gap-y-8 text-slate-400 dark:text-slate-500 font-extrabold text-xl opacity-70">
            {['STANFORD', 'MIT', 'HARVARD', 'OXFORD', 'ETH ZURICH', 'CAMBRIDGE'].map((s) => (
              <span key={s} className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-default">{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-32">
        <div className="text-center max-w-3xl mx-auto mb-20 animate-fade-in-up">
          <h2 className="text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white mb-6">Learn faster. <br />Retain more.</h2>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            We've combined scientifically-proven study techniques with the most advanced AI models to create the ultimate learning environment.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            { icon: Brain, title: 'AI Personal Tutor', desc: 'Ask complex questions, get step-by-step explanations, and run mock exams tailored perfectly to your syllabus.', color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-500/10' },
            { icon: Users, title: 'Collaborative Groups', desc: 'Study synchronously with friends. Share whiteboards, flashcards, and let the AI act as your group\'s TA.', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
            { icon: Zap, title: 'Auto-Flashcards', desc: 'Upload a 50-page PDF and instantly receive targeted active-recall flashcards directly from the text.', color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-500/10' },
            { icon: BookOpen, title: 'Smart Library', desc: 'Organize all your materials. Our AI indexes your entire library so you can search across all documents instantly.', color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10' },
            { icon: Globe, title: 'Public Community', desc: 'Discover public notes, popular flashcard decks, and join study groups for your specific major.', color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-500/10' },
            { icon: Sparkles, title: 'YouTube to Notes', desc: 'Paste any lecture link. We extract the transcript, highlight key concepts, and summarize the entire video.', color: 'text-primary', bg: 'bg-primary/10' },
          ].map((f, i) => (
            <div key={f.title} className="glass-card p-8 relative overflow-hidden group">
              <div className={`absolute top-0 right-0 w-32 h-32 ${f.bg} rounded-bl-full -z-10 transition-transform group-hover:scale-110`}></div>
              <div className={`w-14 h-14 rounded-2xl ${f.bg} flex items-center justify-center mb-6 shadow-sm`}>
                <f.icon className={`w-7 h-7 ${f.color}`} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-white">{f.title}</h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-24 mb-20 max-w-7xl mx-auto animate-fade-in-up">
        <div className="relative rounded-[3rem] overflow-hidden bg-slate-900 dark:bg-slate-950 border border-slate-800 flex flex-col items-center text-center px-6 py-24 shadow-2xl">
          <div className="absolute top-[-20%] left-[20%] w-[60%] h-[60%] bg-primary/40 rounded-full blur-[100px] pointer-events-none"></div>
          
          <h2 className="text-5xl lg:text-6xl font-extrabold text-white mb-8 relative z-10">
            Ready to enter your <br /><span className="text-primary italic">FlowState?</span>
          </h2>
          <p className="text-xl text-slate-300 mb-12 max-w-2xl relative z-10 px-4">
            Join the movement of students upgrading their GPAs with the world's most intelligent study platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 relative z-10 w-full sm:w-auto px-4">
            <Link href="/signup" className="btn-primary text-lg px-10 py-5 w-full sm:w-auto shadow-primary/40 hover:scale-[1.02] transition-transform">
              Start Studying for Free
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 pt-20 pb-10">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 lg:gap-8 mb-16">
          <div className="col-span-2 lg:col-span-2">
             <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-violet-500 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-extrabold text-xl text-slate-900 dark:text-white">FlowState</span>
            </div>
            <p className="text-slate-500 max-w-xs mb-6">
              The AI-powered studying platform crafted for students who want to learn faster and smarter.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-6">Product</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><Link href="#" className="hover:text-primary transition-colors">Features</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Study Tools</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Library</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-6">Resources</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><Link href="#" className="hover:text-primary transition-colors">Community</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Blog</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Help Center</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-6">Legal</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><Link href="#" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 border-t border-slate-200 dark:border-slate-800 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-slate-500">
          <p>© {new Date().getFullYear()} FlowState. All rights reserved.</p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <Link href="#" className="hover:text-primary transition-colors">Twitter</Link>
            <Link href="#" className="hover:text-primary transition-colors">Discord</Link>
            <Link href="#" className="hover:text-primary transition-colors">GitHub</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
