'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Gift, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MysteryBoxProps {
  onClaim: (xp: number) => void
  onClose?: () => void
}

const REWARDS = [
  { xp: 25, label: 'Nice find!', color: 'from-blue-500 to-cyan-500', weight: 40 },
  { xp: 50, label: 'Great discovery!', color: 'from-emerald-500 to-teal-500', weight: 30 },
  { xp: 100, label: 'Amazing loot!', color: 'from-purple-500 to-pink-500', weight: 20 },
  { xp: 200, label: 'LEGENDARY!', color: 'from-amber-500 to-orange-500', weight: 8 },
  { xp: 500, label: 'MYTHIC DROP!', color: 'from-red-500 to-rose-500', weight: 2 },
]

function pickReward() {
  const totalWeight = REWARDS.reduce((sum, r) => sum + r.weight, 0)
  let random = Math.random() * totalWeight
  for (const reward of REWARDS) {
    random -= reward.weight
    if (random <= 0) return reward
  }
  return REWARDS[0]
}

function playRevealSound(rarity: number) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    // More dramatic sound for higher rarity
    const baseFreq = 400 + rarity * 200
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2, ctx.currentTime + 0.15)
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 3, ctx.currentTime + 0.3)

    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)

    // Add sparkle oscillators for higher rarity
    if (rarity >= 2) {
      for (let i = 0; i < 3; i++) {
        const sparkle = ctx.createOscillator()
        const sparkleGain = ctx.createGain()
        sparkle.connect(sparkleGain)
        sparkleGain.connect(ctx.destination)
        sparkle.frequency.setValueAtTime(baseFreq * (3 + i), ctx.currentTime + 0.1 * i)
        sparkleGain.gain.setValueAtTime(0.1, ctx.currentTime + 0.1 * i)
        sparkleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3 + 0.1 * i)
        sparkle.start(ctx.currentTime + 0.1 * i)
        sparkle.stop(ctx.currentTime + 0.3 + 0.1 * i)
      }
    }
  } catch (e) { /* audio not supported */ }
}

function playBoxSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(300, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.15)
  } catch (e) {}
}

export default function MysteryBox({ onClaim, onClose }: MysteryBoxProps) {
  const [phase, setPhase] = useState<'idle' | 'shaking' | 'revealing' | 'reward'>('idle')
  const [reward] = useState(pickReward())
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string; delay: number }[]>([])
  const [claimed, setClaimed] = useState(false)
  const timerRef = useRef<NodeJS.Timeout>()

  // Generate particles
  const generateParticles = useCallback(() => {
    const colors = ['#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#3b82f6', '#ef4444']
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.5,
    }))
  }, [])

  // Auto-start shaking after 2 seconds
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setPhase('shaking')
      playBoxSound()

      setTimeout(() => {
        setPhase('revealing')
        playRevealSound(reward.xp >= 200 ? 3 : reward.xp >= 100 ? 2 : reward.xp >= 50 ? 1 : 0)

        setParticles(generateParticles())

        setTimeout(() => {
          setPhase('reward')
        }, 1500)
      }, 1500)
    }, 2000)

    return () => clearTimeout(timerRef.current)
  }, [generateParticles, reward.xp])

  const handleClaim = () => {
    if (claimed) return
    setClaimed(true)
    onClaim(reward.xp)
    setTimeout(() => onClose?.(), 500)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={handleClaim} />

      <div className="relative z-10 flex flex-col items-center">
        {/* Confetti particles */}
        {phase === 'reward' && particles.map(p => (
          <div
            key={p.id}
            className="absolute w-2 h-2 rounded-full animate-confetti pointer-events-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              backgroundColor: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: '2s',
            }}
          />
        ))}

        {/* Mystery Box */}
        {phase !== 'reward' && (
          <div className={cn(
            "relative cursor-pointer transition-all",
            phase === 'shaking' && "animate-shake",
            phase === 'revealing' && "animate-bounce scale-110"
          )}>
            {/* Glow effect */}
            <div className="absolute -inset-8 bg-gradient-to-r from-amber-500/30 via-purple-500/30 to-pink-500/30 rounded-full blur-xl animate-pulse" />

            {/* Box */}
            <div className={cn(
              "relative w-32 h-32 rounded-2xl flex items-center justify-center transition-all duration-500",
              "bg-gradient-to-br from-amber-500 via-purple-500 to-pink-500",
              "shadow-2xl shadow-amber-500/30",
              phase === 'revealing' && "scale-150 opacity-0"
            )}>
              <Gift className="w-16 h-16 text-white drop-shadow-lg" />

              {/* Sparkle effects */}
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-amber-300 animate-pulse" />
              <Sparkles className="absolute -bottom-2 -left-2 w-5 h-5 text-purple-300 animate-pulse" style={{ animationDelay: '0.3s' }} />
              <Sparkles className="absolute top-1 -left-3 w-4 h-4 text-pink-300 animate-pulse" style={{ animationDelay: '0.6s' }} />
            </div>
          </div>
        )}

        {/* Reward Display */}
        {phase === 'reward' && (
          <div className="text-center animate-scale-in">
            <div className={cn(
              "w-24 h-24 rounded-3xl mx-auto mb-4 flex items-center justify-center",
              "bg-gradient-to-br shadow-2xl",
              reward.color
            )}>
              <Sparkles className="w-12 h-12 text-white drop-shadow-lg" />
            </div>

            <p className="text-white/60 text-[12px] font-bold uppercase tracking-widest mb-1">{reward.label}</p>
            <p className="text-[48px] font-black text-white mb-1">+{reward.xp} XP</p>
            <p className="text-white/40 text-[11px] mb-6">Added to your session</p>

            <button
              onClick={handleClaim}
              disabled={claimed}
              className={cn(
                "px-8 py-3 rounded-full font-bold text-[14px] transition-all",
                claimed
                  ? "bg-white/20 text-white/50 cursor-not-allowed"
                  : "bg-white text-gray-900 hover:bg-white/90 active:scale-95"
              )}
            >
              {claimed ? 'Claimed!' : 'Claim Reward'}
            </button>
          </div>
        )}

        {/* Shake hint */}
        {phase === 'idle' && (
          <p className="text-white/60 text-[12px] font-bold mt-4 animate-pulse">Something's appearing...</p>
        )}
        {phase === 'shaking' && (
          <p className="text-amber-400 text-[12px] font-bold mt-4 animate-pulse">Open it! Open it!</p>
        )}
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          10% { transform: translateX(-5px) rotate(-5deg); }
          20% { transform: translateX(5px) rotate(5deg); }
          30% { transform: translateX(-5px) rotate(-3deg); }
          40% { transform: translateX(5px) rotate(3deg); }
          50% { transform: translateX(-3px) rotate(-2deg); }
          60% { transform: translateX(3px) rotate(2deg); }
          70% { transform: translateX(-2px) rotate(-1deg); }
          80% { transform: translateX(2px) rotate(1deg); }
          90% { transform: translateX(-1px) rotate(0deg); }
        }
        .animate-shake {
          animation: shake 0.6s ease-in-out infinite;
        }
        @keyframes confetti {
          0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
          100% { transform: translateY(400px) rotate(720deg) scale(0); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti 2s ease-out forwards;
        }
        @keyframes scale-in {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
