'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Bell, X, Sparkles, Users, Calendar, BookOpen, Flame, Info, Zap, CheckCheck } from 'lucide-react'
import { authApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { registerPushNotifications, checkNotificationPermission } from '@/lib/push-notifications'

const TYPE_CONFIG: Record<string, { icon: any; color: string }> = {
  ai_nudge:  { icon: Sparkles, color: 'bg-sky-500/10 text-sky-400' },
  streak:    { icon: Flame,    color: 'bg-orange-500/10 text-orange-400' },
  deadline:  { icon: Calendar, color: 'bg-red-500/10 text-red-400' },
  flashcard: { icon: BookOpen, color: 'bg-violet-500/10 text-violet-400' },
  group:     { icon: Users,    color: 'bg-emerald-500/10 text-emerald-400' },
  resource:  { icon: BookOpen, color: 'bg-violet-500/10 text-violet-400' },
  system:    { icon: Info,     color: 'bg-white/5 text-slate-400' },
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationsPanel() {
  const { status } = useSession()
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState(checkNotificationPermission())
  const [subscribing, setSubscribing] = useState(false)
  const qc = useQueryClient()

  // Only poll when authenticated — stops the Unauthorized log noise
  const { data, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => authApi.getNotifications().then(r => r.data),
    refetchInterval: open ? 15000 : 60000,
    enabled: status === 'authenticated',
    retry: false,
  })

  const notifications: any[] = data?.results || []
  const unreadCount: number = data?.unread_count || 0

  const handleOpen = () => {
    const next = !open
    setOpen(next)
    if (next && status === 'authenticated') refetch()
  }

  const handleSubscribe = async () => {
    setSubscribing(true)
    try {
      const success = await registerPushNotifications()
      if (success) {
        setPermission('granted')
      }
    } finally {
      setSubscribing(false)
    }
  }

  const markAllMutation = useMutation({
    mutationFn: () => authApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authApi.deleteNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markReadMutation = useMutation({
    mutationFn: (id: number) => authApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  if (status !== 'authenticated') return null

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-all"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-orange-500 rounded-full flex items-center justify-center text-white text-[9px] font-black">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-[#1a1a1a] rounded-2xl border border-white/8 shadow-2xl z-50 overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-black text-white uppercase tracking-widest">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded-full font-black">
                    {unreadCount} new
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllMutation.mutate()}
                  disabled={markAllMutation.isPending}
                  className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-orange-400 transition-colors"
                >
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>

            {/* Push notification prompt */}
            {permission === 'default' && (
              <div className="px-4 py-3 border-b border-white/5 bg-orange-500/5">
                <p className="text-[11px] text-slate-400 mb-2">Get notified about deadlines, streaks, and AI nudges.</p>
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing}
                  className="w-full py-2 bg-orange-500/10 hover:bg-orange-500/15 text-orange-400 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 border border-orange-500/20"
                >
                  <Zap className="w-3 h-3" />
                  {subscribing ? 'Enabling...' : 'Enable Push Notifications'}
                </button>
              </div>
            )}

            {permission === 'granted' && (
              <div className="px-4 py-2 border-b border-white/5 bg-emerald-500/5">
                <p className="text-[10px] text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Push notifications active
                </p>
              </div>
            )}

            {/* Notifications list */}
            <div className="max-h-80 overflow-y-auto scrollbar-hide">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="w-7 h-7 mx-auto mb-2 text-slate-700" />
                  <p className="text-xs text-slate-600 font-medium">All caught up!</p>
                </div>
              ) : (
                notifications.map(n => {
                  const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system
                  const Icon = cfg.icon
                  const inner = (
                    <div
                      className={cn(
                        'flex gap-3 px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors cursor-pointer group',
                        !n.is_read && 'bg-orange-500/3'
                      )}
                      onClick={() => !n.is_read && markReadMutation.mutate(n.id)}
                    >
                      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', cfg.color)}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <span className={cn('text-xs font-bold leading-snug', n.is_read ? 'text-slate-400' : 'text-white')}>
                            {n.title}
                          </span>
                          <span className="text-[10px] text-slate-600 shrink-0">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); deleteMutation.mutate(n.id) }}
                        className="text-slate-700 hover:text-slate-400 shrink-0 self-start mt-0.5 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )

                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>{inner}</Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const TYPE_CONFIG: Record<string, { icon: any; color: string }> = {
  ai_nudge:  { icon: Sparkles, color: 'bg-sky-100 dark:bg-sky-950 text-sky-500' },
  streak:    { icon: Flame,    color: 'bg-orange-100 dark:bg-orange-950 text-orange-500' },
  deadline:  { icon: Calendar, color: 'bg-red-100 dark:bg-red-950 text-red-500' },
  flashcard: { icon: BookOpen, color: 'bg-violet-100 dark:bg-violet-950 text-violet-500' },
  group:     { icon: Users,    color: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-500' },
  resource:  { icon: BookOpen, color: 'bg-violet-100 dark:bg-violet-950 text-violet-500' },
  system:    { icon: Info,     color: 'bg-gray-100 dark:bg-gray-800 text-gray-500' },
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

