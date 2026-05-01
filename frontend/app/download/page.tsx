import Link from 'next/link'
import { ArrowLeft, Monitor, Apple, Terminal, Download, Zap, Shield, RefreshCw, Bell } from 'lucide-react'

const VERSION = '1.0.1'
const RELEASE_BASE = `https://github.com/Jerry-Courage/paw-pal/releases/download/v${VERSION}`

const PLATFORMS = [
  {
    name: 'Windows',
    icon: Monitor,
    version: 'Windows 10 / 11',
    file: `FlowState-${VERSION}-Setup.exe`,
    color: 'from-sky-500 to-blue-600',
    shadow: 'shadow-sky-500/20',
    badge: 'Most Popular',
  },
  {
    name: 'macOS',
    icon: Apple,
    version: 'macOS 11+  (Intel & Apple Silicon)',
    file: `FlowState-${VERSION}.dmg`,
    color: 'from-slate-600 to-slate-800',
    shadow: 'shadow-slate-500/20',
    badge: null,
  },
  {
    name: 'Linux',
    icon: Terminal,
    version: 'Ubuntu, Fedora & more',
    file: `FlowState-${VERSION}.AppImage`,
    color: 'from-orange-500 to-amber-600',
    shadow: 'shadow-orange-500/20',
    badge: null,
  },
]

const FEATURES = [
  { icon: Zap, label: 'Native performance', desc: 'Runs as a real desktop app, not a browser tab' },
  { icon: Bell, label: 'System notifications', desc: 'Get nudges even when the app is in the background' },
  { icon: Shield, label: 'Mic & camera access', desc: 'Full access for voice notes and AI features' },
  { icon: RefreshCw, label: 'Auto-updates', desc: 'Always on the latest version automatically' },
]

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Ambient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60vw] h-[40vh] bg-primary/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[40vw] h-[30vh] bg-violet-500/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-5 py-12">

        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors mb-12">
          <ArrowLeft className="w-4 h-4" /> Back to FlowState
        </Link>

        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-6">
            <Download className="w-3.5 h-3.5" /> Desktop App
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
            FlowState for <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-violet-400">Desktop</span>
          </h1>
          <p className="text-white/50 text-lg max-w-md mx-auto leading-relaxed">
            The full FlowState experience as a native app. Notifications, mic access, and keyboard shortcuts included.
          </p>
        </div>

        {/* Download cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-16">
          {PLATFORMS.map((p) => (
            <a
              key={p.name}
              href={`${RELEASE_BASE}/${p.file}`}
              className={`relative group flex flex-col p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/8 transition-all duration-300 hover:-translate-y-1 shadow-xl ${p.shadow}`}
            >
              {p.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/30">
                  {p.badge}
                </span>
              )}
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${p.color} flex items-center justify-center mb-4 shadow-lg`}>
                <p.icon className="w-6 h-6 text-white" />
              </div>
              <div className="font-black text-lg text-white mb-1">{p.name}</div>
              <div className="text-xs text-white/40 font-medium mb-5 leading-relaxed">{p.version}</div>
              <div className="mt-auto flex items-center gap-2 text-sm font-bold text-primary group-hover:gap-3 transition-all">
                <Download className="w-4 h-4" />
                Download .{p.file.split('.').pop()}
              </div>
            </a>
          ))}
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-16">
          {FEATURES.map((f) => (
            <div key={f.label} className="flex flex-col p-4 rounded-2xl bg-white/5 border border-white/5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <f.icon className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="text-sm font-black text-white mb-1">{f.label}</div>
              <div className="text-[11px] text-white/40 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* All releases link */}
        <div className="text-center">
          <a
            href="https://github.com/Jerry-Courage/paw-pal/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-white/30 hover:text-white/60 transition-colors underline underline-offset-4"
          >
            View all releases on GitHub
          </a>
        </div>

      </div>
    </div>
  )
}
