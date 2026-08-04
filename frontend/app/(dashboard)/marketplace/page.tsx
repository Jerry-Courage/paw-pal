'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { paymentsApi } from '@/lib/api'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const POWERUPS = [
  {
    id: 'clue_5050',
    name: '50/50 Clue',
    cost: 250,
    icon: 'tips_and_updates',
    color: 'from-amber-500 to-orange-500',
    badge: 'Quiz Battle',
    desc: 'Instantly removes 2 wrong answer choices in a Quiz Battle question round.',
  },
  {
    id: 'time_extend',
    name: 'Time Extension',
    cost: 300,
    icon: 'hourglass_top',
    color: 'from-cyan-500 to-blue-500',
    badge: 'Quiz Battle',
    desc: 'Adds +10 extra seconds to your active question timer when you need more time.',
  },
  {
    id: 'streak_guard',
    name: 'Streak Guard',
    cost: 500,
    icon: 'shield',
    color: 'from-emerald-500 to-teal-500',
    badge: 'Study Streak',
    desc: 'Protects your daily study streak if you accidentally miss a day of studying.',
  },
  {
    id: 'double_xp',
    name: '2x XP Boost',
    cost: 400,
    icon: 'bolt',
    color: 'from-violet-500 to-purple-500',
    badge: 'Multiplier',
    desc: 'Doubles all XP earned across your next 3 completed study sessions or quiz battles.',
  },
  {
    id: 'hint',
    name: 'AI Hint / Poll',
    cost: 350,
    icon: 'visibility',
    color: 'from-pink-500 to-rose-500',
    badge: 'Quiz Battle',
    desc: 'Reveals AI probability breakdown on difficult multiple-choice questions.',
  },
]

const XP_PACKS = [
  {
    id: 'pack_500',
    xp: 500,
    priceGhs: 10.00,
    label: 'Starter Pack',
    badge: 'Basic',
    color: 'border-primary/30 bg-primary/5',
    btnColor: 'bg-primary text-on-primary hover:bg-primary/90',
  },
  {
    id: 'pack_1500',
    xp: 1500,
    priceGhs: 25.00,
    label: 'Pro Pack',
    badge: '🔥 Best Value',
    popular: true,
    color: 'border-secondary/50 bg-secondary/10 glow-secondary',
    btnColor: 'bg-secondary text-on-secondary hover:bg-secondary/90',
  },
  {
    id: 'pack_5000',
    xp: 5000,
    priceGhs: 70.00,
    label: 'Mega Pack',
    badge: '⚡ Maximum Power',
    color: 'border-tertiary/30 bg-tertiary/5',
    btnColor: 'bg-tertiary text-on-tertiary hover:bg-tertiary/90',
  },
]

export default function MarketplacePage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'powerups' | 'xp_packs' | 'inventory'>('powerups')

  const { data: marketplaceData, isLoading } = useQuery({
    queryKey: ['marketplace-inventory'],
    queryFn: () => paymentsApi.getMarketplaceInventory().then(r => r.data),
  })

  const totalXp = marketplaceData?.total_xp ?? 0
  const inventory = marketplaceData?.inventory ?? {}

  const buyPowerupMutation = useMutation({
    mutationFn: (itemId: string) => paymentsApi.buyPowerup(itemId),
    onSuccess: (res) => {
      toast.success(res.data.message)
      qc.invalidateQueries({ queryKey: ['marketplace-inventory'] })
      qc.invalidateQueries({ queryKey: ['user-profile'] })
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.error || 'Failed to purchase item.')
    },
  })

  const buyXpPackMutation = useMutation({
    mutationFn: (packId: string) => paymentsApi.buyXpPack(packId),
    onSuccess: (res) => {
      if (res.data.authorization_url) {
        window.open(res.data.authorization_url, '_blank')
        toast.info('Opening Paystack checkout window...')
      }
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.error || 'Failed to initialize XP pack payment.')
    },
  })

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-stack-md max-w-6xl mx-auto space-y-8 pb-28 md:pb-12">
      {/* Hero Banner */}
      <div className="relative rounded-[2rem] bg-gradient-to-r from-surface-container-low via-surface-container to-surface-container-high p-6 md:p-10 border border-outline-variant/20 overflow-hidden shadow-2xl">
        <div className="absolute top-[-30%] right-[-10%] w-[350px] h-[350px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-30%] left-[-10%] w-[300px] h-[300px] bg-secondary/10 rounded-full blur-[90px] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold uppercase tracking-widest">
              <span className="material-symbols-outlined text-[16px]">storefront</span>
              FlowState Marketplace
            </div>
            <h1 className="text-[32px] md:text-[44px] font-black text-on-surface tracking-tight leading-tight">
              XP Shop &amp; Power-Ups
            </h1>
            <p className="text-on-surface-variant text-[14px] md:text-[16px]">
              Spend your study-earned XP on powerful Quiz Battle clues, or purchase XP bundles with Paystack (GH₵).
            </p>
          </div>

          {/* XP Balance Widget */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="flex items-center gap-4 bg-surface-container-highest/60 backdrop-blur-xl border border-primary/30 p-5 rounded-[1.5rem] shadow-xl shrink-0"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.4)]">
              <span className="material-symbols-outlined text-black text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                bolt
              </span>
            </div>
            <div>
              <p className="text-[11px] font-black text-on-surface-variant/70 uppercase tracking-widest">Available XP</p>
              <p className="text-[28px] font-black text-on-surface leading-none mt-0.5">
                {isLoading ? '...' : totalXp.toLocaleString()} <span className="text-[14px] font-bold text-primary">XP</span>
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2 overflow-x-auto scrollbar-hide">
        {[
          { id: 'powerups', label: 'Quiz Battle Power-Ups', icon: 'extension' },
          { id: 'xp_packs', label: 'Buy XP Bundles (GH₵)', icon: 'add_shopping_cart' },
          { id: 'inventory', label: 'My Inventory', icon: 'backpack' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'flex items-center gap-2 px-5 py-3 rounded-2xl text-[13px] font-bold transition-all whitespace-nowrap',
              activeTab === tab.id
                ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            )}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: POWER-UPS */}
      {activeTab === 'powerups' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {POWERUPS.map((item) => {
            const ownedCount = inventory[item.id] || 0
            const canAfford = totalXp >= item.cost
            return (
              <motion.div
                key={item.id}
                whileHover={{ y: -4 }}
                className="flex flex-col justify-between bg-surface-container-low rounded-[1.75rem] p-6 border border-outline-variant/20 hover:border-primary/40 transition-all shadow-lg relative overflow-hidden group"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className={cn('w-12 h-12 rounded-2xl bg-gradient-to-tr flex items-center justify-center shadow-md text-white', item.color)}>
                      <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {item.icon}
                      </span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-surface-container-high border border-outline-variant/30 text-on-surface-variant">
                      {item.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-[18px] font-bold text-on-surface">{item.name}</h3>
                    <p className="text-[13px] text-on-surface-variant mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </div>

                <div className="pt-6 border-t border-outline-variant/15 mt-6 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">Price</span>
                    <span className="text-[18px] font-black text-primary">{item.cost} XP</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {ownedCount > 0 && (
                      <span className="text-[12px] font-bold px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                        x{ownedCount} Owned
                      </span>
                    )}
                    <button
                      onClick={() => buyPowerupMutation.mutate(item.id)}
                      disabled={!canAfford || buyPowerupMutation.isPending}
                      className={cn(
                        'px-4 py-2.5 rounded-xl font-bold text-[13px] transition-all flex items-center gap-1.5',
                        canAfford
                          ? 'bg-primary text-on-primary hover:bg-primary/90 active:scale-95 shadow-md'
                          : 'bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed border border-outline-variant/20'
                      )}
                    >
                      {buyPowerupMutation.isPending ? 'Buying...' : canAfford ? 'Buy Item' : 'Need XP'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* TAB 2: BUY XP PACKS */}
      {activeTab === 'xp_packs' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[24px]">info</span>
            <p className="text-[13px] text-on-surface-variant">
              Buy instant XP packs to unlock high-tier power-ups in Quiz Battles. All prices are in <strong>Ghanaian Cedis (GH₵)</strong> via Paystack.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {XP_PACKS.map((pack) => (
              <motion.div
                key={pack.id}
                whileHover={{ y: -6 }}
                className={cn(
                  'rounded-[2rem] p-7 border-2 flex flex-col justify-between relative overflow-hidden transition-all shadow-xl',
                  pack.color
                )}
              >
                {pack.popular && (
                  <div className="absolute top-0 right-0 bg-secondary text-on-secondary px-4 py-1 rounded-bl-2xl text-[10px] font-black uppercase tracking-widest">
                    Best Value
                  </div>
                )}

                <div className="space-y-4">
                  <span className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant/70">
                    {pack.badge}
                  </span>
                  <div>
                    <h3 className="text-[26px] font-black text-on-surface leading-tight">{pack.label}</h3>
                    <p className="text-[36px] font-black text-primary mt-2">
                      +{pack.xp.toLocaleString()} <span className="text-[16px] text-on-surface-variant">XP</span>
                    </p>
                  </div>
                  <p className="text-[13px] text-on-surface-variant leading-relaxed">
                    Instant credit to your account. Use on 50/50 clues, streak guards, and battle boosts.
                  </p>
                </div>

                <div className="pt-6 border-t border-outline-variant/20 mt-6 space-y-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] text-on-surface-variant font-bold">Total Cost:</span>
                    <span className="text-[24px] font-black text-on-surface">GH₵ {pack.priceGhs.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={() => buyXpPackMutation.mutate(pack.id)}
                    disabled={buyXpPackMutation.isPending}
                    className={cn(
                      'w-full py-3.5 rounded-2xl font-black text-[14px] shadow-lg transition-all flex items-center justify-center gap-2 active:scale-98',
                      pack.btnColor
                    )}
                  >
                    <span className="material-symbols-outlined text-[20px]">bolt</span>
                    {buyXpPackMutation.isPending ? 'Initializing...' : `Buy for GH₵ ${pack.priceGhs.toFixed(2)}`}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: INVENTORY */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <h2 className="text-[20px] font-bold text-on-surface">Your Power-Up Inventory</h2>

          {Object.values(inventory).every(v => !v || v === 0) ? (
            <div className="text-center py-16 bg-surface-container-low rounded-[2rem] border border-outline-variant/20 space-y-3">
              <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30">backpack</span>
              <p className="text-[16px] font-bold text-on-surface">Your backpack is empty</p>
              <p className="text-[13px] text-on-surface-variant max-w-sm mx-auto">
                Visit the Quiz Battle Power-Ups tab to buy 50/50 clues and time extensions with your XP.
              </p>
              <button
                onClick={() => setActiveTab('powerups')}
                className="mt-4 px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-[13px]"
              >
                Browse Marketplace
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {POWERUPS.map((item) => {
                const count = (inventory as any)[item.id] || 0
                if (count <= 0) return null
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-5 bg-surface-container-low rounded-2xl border border-outline-variant/20"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn('w-12 h-12 rounded-xl bg-gradient-to-tr flex items-center justify-center text-white', item.color)}>
                        <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {item.icon}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-[15px] font-bold text-on-surface">{item.name}</h4>
                        <p className="text-[12px] text-on-surface-variant">{item.desc}</p>
                      </div>
                    </div>
                    <span className="text-[16px] font-black px-4 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full">
                      x{count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
