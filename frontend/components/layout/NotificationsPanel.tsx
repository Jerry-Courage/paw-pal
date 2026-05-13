'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Bell, Sparkles, Users, Calendar, BookOpen, Flame, Info, CheckCheck, Trash2, X } from 'lucide-react'
import { authApi, SERVER_URL, getAuthToken } from '@/lib/api'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

const TYPE_CONFIG: Record<string, { icon: any; color: string }> = {
  ai_nudge:  { icon: Sparkles, color: 'text-sky-400' },
  streak:    { icon: Flame,    color: 'text-orange-400' },
  deadline:  { icon: Calendar, color: 'text-red-400' },
  flashcard: { icon: BookOpen, color: 'text-violet-400' },
  group:     { icon: Users,    color: 'text-emerald-400' },
  resource:  { icon: BookOpen, color: 'text-amber-400' },
  system:    { icon: Info,     color: 'text-slate-400' },
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
  const qc = useQueryClient()

  // 📡 WebSocket for real-time notifications
  useEffect(() => {
    if (status !== 'authenticated') return
    let socket: WebSocket | null = null
    let reconnectTimeout: any = null

    const connect = async () => {
      try {
        const token = await getAuthToken()
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = SERVER_URL.replace(/^https?:\/\//, '')
        socket = new WebSocket(`${protocol}//${host}/ws/notifications/${token ? `?token=${token}` : ''}`)

        socket.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.type === 'new_notification') {
            qc.setQueryData(['notifications'], (old: any) => {
              if (!old) return old
              return {
                ...old,
                results: [data.notification, ...(old.results || [])].slice(0, 50),
                unread_count: (old.unread_count || 0) + 1,
              }
            })
            toast(data.notification.title, {
              description: data.notification.body,
              icon: <Bell className="w-4 h-4 text-orange-500" />,
            })
          }
        }

        socket.onclose = () => { reconnectTimeout = setTimeout(connect, 5000) }
        socket.onerror = () => {}
      } catch {}
    }

    connect()
    return () => {
      socket?.close()
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

  const markReadMutation = useMutation({
    mutationFn: (id: number) => authApi.markRead(id),
    onSuccess: (_, id) => {
      qc.setQueryData(['notifications'], (old: any) => {
        if (!old) return old
        return {
          ...old,
          results: old.results.map((n: any) => n.id === id ? { ...n, is_read: true } : n),
          unread_count: Math.max(0, old.unread_count - 1),
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
          unread_count: wasUnread ? Math.max(0, old.unread_count - 1) : old.unread_count,
        }
      })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: () => authApi.markAllRead(),
    onSuccess: () => {
      qc.setQueryData(['notifications'], (old: any) => {
        if (!old) return old
        return { ...old, results: old.results.map((n: any) => ({ ...n, is_read: true })), unread_count: 0 }
      })
    },
  })

  if (status !== 'authenticated') return null

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => { setOpen(o => !o); refetch() }}
        className={cn(
          'relative p-2 rounded-xl transition-all duration-200',
          open ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white hover:bg-white/5'
        )}
      >
        <Bell className="w-4 h-4" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full"
            />
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="fixed sm:absolute inset-x-3 sm:inset-x-auto sm:right-0 top-16 sm:top-full sm:mt-2 w-auto sm:w-[340px] bg-[#161616] border border-white/8 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllMutation.mutate()}
                      title="Mark all read"
                      className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-all"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="max-h-[380px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-12 text-center">
                    <Bell className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-600">All caught up</p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system
                    const Icon = cfg.icon
                    return (
                      <div
                        key={n.id}
                        className={cn(
                          'group relative flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] transition-all border-l-2',
                          n.is_read ? 'border-transparent opacity-50' : 'border-orange-500'
                        )}
                      >
                        <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', cfg.color)} />
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-xs font-semibold leading-snug', n.is_read ? 'text-slate-400' : 'text-white')}>
                            {n.title}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[10px] text-slate-600">{timeAgo(n.created_at)}</span>
                            {n.link && (
                              <Link
                                href={n.link}
                                onClick={() => { setOpen(false); if (!n.is_read) markReadMutation.mutate(n.id) }}
                                className="text-[10px] text-orange-500 hover:text-orange-400 font-medium"
                              >
                                View →
                              </Link>
                            )}
                            {!n.is_read && (
                              <button
                                onClick={() => markReadMutation.mutate(n.id)}
                                className="text-[10px] text-slate-600 hover:text-slate-300 transition-colors"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteMutation.mutate(n.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
