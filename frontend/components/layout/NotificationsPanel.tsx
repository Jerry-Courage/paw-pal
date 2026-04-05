'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, X, Sparkles, Users, Calendar, BookOpen, Flame, Info } from 'lucide-react'
import { authApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import Link from 'next/link'

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

export default function NotificationsPanel() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => authApi.getNotifications().then((r) => r.data),
    refetchInterval: open ? 15000 : 60000,
  })

  const notifications: any[] = data?.results || []
  const unreadCount: number = data?.unread_count || 0

  const handleOpen = () => {
    const next = !open
    setOpen(next)
    if (next) refetch()
  }

  const markAllMutation = useMutation({
    mutationFn: () => authApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authApi.deleteNotification(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markReadMutation = useMutation({
    mutationFn: (id: number) => authApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-900 dark:text-white">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-xs bg-red-100 dark:bg-red-950 text-red-500 px-1.5 py-0.5 rounded-full font-medium">
                    {unreadCount} new
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button onClick={() => markAllMutation.mutate()} className="text-xs text-sky-500 hover:underline">
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">All caught up!</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system
                  const Icon = cfg.icon
                  const inner = (
                    <div
                      className={cn(
                        'flex gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer',
                        !n.is_read && 'bg-sky-50/50 dark:bg-sky-950/20'
                      )}
                      onClick={() => !n.is_read && markReadMutation.mutate(n.id)}
                    >
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', cfg.color)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{n.title}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(n.id) }}
                        className="text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 flex-shrink-0 self-start mt-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )

                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>
                      {inner}
                    </Link>
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
