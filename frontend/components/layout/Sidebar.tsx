'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard, Calendar, BookOpen, Sparkles,
  Settings, LogOut, FileText, LayoutGrid, ChevronLeft, Brain, Download, Zap, Crown
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { groupsApi, workspaceApi, paymentsApi } from '@/lib/api'
import { usePricing } from '@/hooks/usePricing'
import dynamic from 'next/dynamic'

const PaywallModal = dynamic(() => import('@/components/ui/PaywallModal'), { ssr: false })

interface SidebarProps {
  onToggle?: () => void
  isOpen?: boolean
}

const navItems = [
  { href: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/planner',     icon: Calendar,        label: 'Planner' },
  { href: '/library',     icon: BookOpen,        label: 'Library' },
  { href: '/assignments', icon: FileText,        label: 'Assignments' },
  { href: '/workspace',   icon: LayoutGrid,      label: 'Collab Space' },
  { href: '/ai',          icon: Sparkles,        label: 'AI Assistant' },
]

const GROUP_COLORS = ['bg-emerald-400', 'bg-sky-400', 'bg-violet-400', 'bg-orange-400', 'bg-pink-400']

export default function Sidebar({ onToggle, isOpen = true }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const qc = useQueryClient()
  const [showPaywall, setShowPaywall] = useState(false)

  const { data } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.getGroups('my').then(r => r.data),
  })
  const groups = data?.results || []

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.getAll().then(r => r.data),
    refetchInterval: 30000,
  })
  const workspaces = Array.isArray(workspacesData) ? workspacesData : workspacesData?.results || []
  const totalUnreadWorkspaces = workspaces.reduce((sum: number, ws: any) => sum + (ws.unread_count || 0), 0)

  const { data: subStatus, refetch: refetchSub } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => paymentsApi.getStatus().then(r => r.data),
    staleTime: 60000,
  })

  const { priceInfo } = usePricing()
  const isPremium = subStatus?.is_premium ?? false
  const notesUsed = subStatus?.notes_used ?? 0
  const notesLimit = subStatus?.notes_limit ?? 5
  const notesRemaining = subStatus?.notes_remaining ?? notesLimit

  return (
    <aside className="w-64 bg-[#111] border-r border-white/5 flex flex-col h-full flex-shrink-0 relative overflow-hidden">
      {/* Collapse button */}
      {onToggle && isOpen && (
        <button
          onClick={onToggle}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all z-20 shadow-lg"
          title="Hide Sidebar"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Logo */}
      <div className="px-5 py-6 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center overflow-hidden group-hover:bg-orange-500/20 transition-all shadow-lg shadow-orange-500/5">
            <img src="/images/logo-icon.png" alt="Flow State" className="w-full h-full object-contain" />
          </div>
          <span className="text-base font-black text-white uppercase tracking-tight">
            Flow <span className="text-orange-500">State</span>
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
        {navItems.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                active
                  ? 'bg-orange-500/10 text-orange-400'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.href === '/workspace' && totalUnreadWorkspaces > 0 && (
                <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[9px] font-black rounded-full min-w-[18px] text-center shadow-lg shadow-orange-500/20">
                  {totalUnreadWorkspaces > 9 ? '9+' : totalUnreadWorkspaces}
                </span>
              )}
            </Link>
          )
        })}

        {/* Groups */}
        {groups.length > 0 && (
          <div className="pt-5">
            <p className="text-[10px] font-black text-slate-600 px-3 mb-2 tracking-widest uppercase">My Groups</p>
            {groups.map((g: any, i: number) => (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${GROUP_COLORS[i % GROUP_COLORS.length]}`} />
                <span className="truncate">{g.name}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-white/5 space-y-0.5">

        {/* Premium upgrade card for free users */}
        {!isPremium && subStatus && (
          <div className="mb-3 p-3.5 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-xs font-black text-white">Go Premium</span>
            </div>
            {/* Usage bar */}
            <div className="flex gap-1 mb-2">
              {Array.from({ length: notesLimit }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1 rounded-full flex-1 transition-all',
                    i < notesUsed
                      ? notesUsed >= notesLimit ? 'bg-red-500' : 'bg-orange-500'
                      : 'bg-white/10'
                  )}
                />
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
              {notesRemaining > 0
                ? <><span className="text-white font-bold">{notesRemaining} kit{notesRemaining !== 1 ? 's' : ''}</span> left — unlock unlimited for {priceInfo.displayShort}</>
                : <>Limit reached — upgrade for <span className="text-orange-400 font-bold">{priceInfo.displayShort}</span> to keep going</>
              }
            </p>
            <button
              onClick={() => setShowPaywall(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-black transition-all shadow-lg shadow-orange-500/20 active:scale-95"
            >
              <Zap className="w-3 h-3" /> Upgrade — {priceInfo.displayShort}
            </button>
          </div>
        )}

        {/* Premium badge for premium users */}
        {isPremium && (
          <div className="mb-2 px-3 py-2.5 rounded-xl flex items-center gap-2 bg-orange-500/8 border border-orange-500/15">
            <Crown className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="text-xs font-black text-orange-400">Premium Active</span>
          </div>
        )}

        <Link
          href="/download"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all"
        >
          <Download className="w-4 h-4" /> Desktop App
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all"
        >
          <Settings className="w-4 h-4" /> Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500/70 hover:text-red-400 hover:bg-red-500/5 w-full transition-all"
        >
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>

      {/* Paywall modal */}
      {showPaywall && subStatus && (
        <PaywallModal
          onClose={() => setShowPaywall(false)}
          notesUsed={notesUsed}
          notesLimit={notesLimit}
          onSuccess={() => { refetchSub(); setShowPaywall(false) }}
        />
      )}
    </aside>
  )
}
