export default function DashboardLoading() {
  return (
    <div className="md:ml-64 min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 bg-primary/10 rounded-[1.5rem] flex items-center justify-center animate-pulse border border-primary/20">
          <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
        </div>
        <p className="text-[12px] text-on-surface-variant uppercase tracking-[0.2em] font-bold">Loading…</p>
      </div>
    </div>
  )
}
