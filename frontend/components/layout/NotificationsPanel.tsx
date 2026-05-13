'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Bell, X, Sparkles, Users, Calendar, BookOpen, Flame, Info, Zap, CheckCheck, Trash2 } from 'lucide-react'
import { authApi, SERVER_URL, getAuthToken } from '@/lib/api'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { registerPushNotifications, checkNotificationPermission } from '@/lib/push-notifications'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

const TYPE_CONFIG: Record<string, { icon: any; color: string; label: string; glow: string }> = {
  ai_nudge:  { icon: Sparkles, color: 'text-sky-400',  label: 'AI Tip',    glow: 'bg-sky-500/10' },
  streak:    { icon: Flame,    color: 'text-orange-400', label: 'Streak',    glow: 'bg-orange-500/10' },
  deadline:  { icon: Calendar, color: 'text-red-400',    label: 'Deadline',  glow: 'bg-red-500/10' },
  flashcard: { icon: BookOpen, color: 'text-violet-400', label: 'Flashcard', glow: 'bg-violet-500/10' },
  group:     { icon: Users,    color: 'text-emerald-400',label: 'Collab',    glow: 'bg-emerald-500/10' },
  resource:  { icon: BookOpen, color: 'text-amber-400',  label: 'Library',   glow: 'bg-amber-500/10' },
  system:    { icon: Info,     color: 'text-slate-400',  label: 'System',    glow: 'bg-white/5' },
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
  const { data: session, status } = useSession()
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState(checkNotificationPermission())
  const [subscribing, setSubscribing] = useState(false)
  const qc = useQueryClient()

  // 📡 Real-Time WebSocket Logic
  useEffect(() => {
    if (status !== 'authenticated') return

    let socket: WebSocket | null = null
    let reconnectTimeout: any = null

    const connect = async () => {
      try {
        const token = await authApi.getNotifications().then(() => getAuthToken()) // Helper to get token
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = SERVER_URL.replace(/^https?:\/\//, '')
        const wsUrl = `${protocol}//${host}/ws/notifications/${token ? `?token=${token}` : ''}`
        
        console.log("[WS Notifications] Connecting...")
        socket = new WebSocket(wsUrl)

        socket.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.type === 'new_notification') {
            // Update cache manually for instant UI update
            qc.setQueryData(['notifications'], (old: any) => {
              if (!old) return old
              return {
                ...old,
                results: [data.notification, ...(old.results || [])].slice(0, 50),
                unread_count: (old.unread_count || 0) + 1
              }
            })
            
            toast(data.notification.title, {
              description: data.notification.body,
              icon: <Bell className="w-4 h-4 text-orange-500" />
            })
          }
        }

        socket.onclose = () => {
          console.warn("[WS Notifications] Closed. Reconnecting...")
          reconnectTimeout = setTimeout(connect, 5000)
        }

        socket.onerror = (err) => {
          console.error("[WS Notifications] Error:", err)
        }
      } catch (err) {
        console.error("[WS Notifications] Connection failed:", err)
      }
    }

    connect()
    return () => {
      if (socket) socket.close()
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
    }
  }, [status, qc])

  const { data, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => authApi.getNotifications().then(r => r.data),
    enabled: status === 'authenticated',
    retry: false,
    staleTime: 60000,
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
      if (success) setPermission('granted')
    } finally {
      setSubscribing(false)
    }
  }

  const markReadMutation = useMutation({
    mutationFn: (id: number) => authApi.markRead(id),
    onSuccess: (_, id) => {
      qc.setQueryData(['notifications'], (old: any) => {
        if (!old) return old
        return {
          ...old,
          results: old.results.map((n: any) => n.id === id ? { ...n, is_read: true } : n),
          unread_count: Math.max(0, old.unread_count - 1)
        }
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authApi.deleteNotification(id),
    onSuccess: (_, id) => {
      qc.setQueryData(['notifications'], (old: any) => {
        if (!old) return old
        const wasUnread = old.results.find((n: any) => n.id === id)?.is_read === false
        return {
          ...old,
          results: old.results.filter((n: any) => n.id !== id),
          unread_count: wasUnread ? Math.max(0, old.unread_count - 1) : old.unread_count
        }
      })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: () => authApi.markAllRead(),
    onSuccess: () => {
      qc.setQueryData(['notifications'], (old: any) => {
        if (!old) return old
        return {
          ...old,
          results: old.results.map((n: any) => ({ ...n, is_read: true })),
          unread_count: 0
        }
      })
    },
  })

  if (status !== 'authenticated') return null

  return (
    <div className="relative">
      
      <button
        onClick={handleOpen}
        className={cn(
          "relative p-2 rounded-xl transition-all duration-300",
          open ? "bg-white/10 text-white" : "text-slate-500 hover:text-white hover:bg-white/5"
        )}
      >
        <Bell className={cn("w-4 h-4", unreadCount > 0 && "animate-pulse")} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full border border-[#111]"
            />
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="fixed sm:absolute inset-x-4 sm:inset-x-auto sm:right-0 top-20 sm:top-full mt-3 w-auto sm:w-[380px] bg-[#1a1a1a]/90 backdrop-blur-3xl rounded-[32px] border border-white/10 shadow-[0_25px_80px_rgba(0,0,0,0.8)] z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Bell className="w-3.5 h-3.5 text-orange-500" />
                  </div>
                  <span className="text-xs font-black text-white uppercase tracking-widest">Nexus Inbox</span>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllMutation.mutate()}
                    className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 hover:text-orange-400 transition-colors uppercase tracking-widest"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Mark All
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="max-h-[420px] overflow-y-auto scrollbar-hide py-2">
                <AnimatePresence initial={false}>
                  {notifications.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="py-16 text-center"
                    >
                      <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-white/5">
                        <Bell className="w-7 h-7 text-slate-700" />
                      </div>
                      <p className="text-[11px] text-slate-500 font-black uppercase tracking-[0.25em] mb-1">Silence is Golden</p>
                      <p className="text-[10px] text-slate-600 font-medium">Your Nexus Inbox is clean.</p>
                    </motion.div>
                  ) : (
                    notifications.map((n, idx) => {
                      const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system
                      const Icon = cfg.icon
                      return (
                        <motion.div
                          key={n.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className={cn(
                            "relative group px-4 py-3.5 hover:bg-white/[0.03] transition-all cursor-default border-l-2",
                            n.is_read ? "border-transparent opacity-60" : "border-orange-500 bg-orange-500/[0.02]"
                          )}
                        >
                          <div className="flex gap-3.5">
                            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg", cfg.glow)}>
                              <Icon className={cn("w-4 h-4", cfg.color)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-0.5">
                                <span className={cn("text-[10px] font-black uppercase tracking-widest", cfg.color)}>
                                  {cfg.label}
                                </span>
                                <span className="text-[9px] font-bold text-slate-600">{timeAgo(n.created_at)}</span>
                              </div>
                              <p className={cn("text-[13px] font-bold leading-snug mb-1", n.is_read ? "text-slate-400" : "text-white")}>
                                {n.title}
                              </p>
                              <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{n.body}</p>
                              
                              <div className="flex items-center gap-3 mt-3">
                                {n.link && (
                                  <Link 
                                    href={n.link} 
                                    onClick={() => { setOpen(false); !n.is_read && markReadMutation.mutate(n.id) }}
                                    className="text-[10px] font-black text-orange-500 uppercase tracking-widest hover:text-orange-400"
                                  >
                                    View Action
                                  </Link>
                                )}
                                {!n.is_read && (
                                  <button 
                                    onClick={() => markReadMutation.mutate(n.id)}
                                    className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white"
                                  >
                                    Mark Read
                                  </button>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => deleteMutation.mutate(n.id)}
                              className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </motion.div>
                      )
                    })
                  )}
                </AnimatePresence>
              </div>

              {/* Footer / Push Prompt */}
              {permission === 'default' && (
                <div className="p-4 bg-orange-500/10 border-t border-white/5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
                      <Zap className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-white uppercase tracking-tight">Stay Synchronized</p>
                      <p className="text-[10px] text-slate-400">Enable real-time push for streaks and deadlines.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSubscribe}
                    disabled={subscribing}
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-orange-500/20"
                  >
                    {subscribing ? "Activating..." : "Enable Push"}
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

