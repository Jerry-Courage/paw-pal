'use client'

import { useFlowSound } from '@/context/FlowSoundContext'
import { cn } from '@/lib/utils'

export default function FlowSoundControl({ compact = false }: { compact?: boolean }) {
  const { muted, volume, setMuted, setVolume } = useFlowSound()
  return <div className={cn('flex items-center gap-2', !compact && 'rounded-xl bg-black/15 px-3 py-2')}>
    <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn FlowState sounds on' : 'Mute FlowState sounds'} aria-pressed={!muted} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface">
      <span className="material-symbols-outlined text-[19px]">{muted ? 'volume_off' : 'volume_up'}</span>
    </button>
    {!compact && <><label htmlFor="flow-volume" className="sr-only">FlowState sound volume</label><input id="flow-volume" type="range" min="0" max="1" step="0.05" value={volume} disabled={muted} onChange={event => setVolume(Number(event.target.value))} className="h-1 min-w-0 flex-1 accent-orange-400 disabled:opacity-35" /></>}
  </div>
}
