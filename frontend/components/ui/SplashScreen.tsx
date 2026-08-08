'use client'

export default function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[9999] bg-[#0a0014] flex flex-col items-center justify-center gap-4">
      <img src="/images/logo-icon.png" alt="FlowState" className="w-12 h-12 object-contain opacity-80" />
      <div className="w-8 h-8 border-2 border-white/10 border-t-orange-500 rounded-full animate-spin" />
    </div>
  )
}
