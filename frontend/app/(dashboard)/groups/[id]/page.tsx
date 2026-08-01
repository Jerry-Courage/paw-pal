'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi } from '@/lib/api'
import { cn, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

const TABS = ['Overview', 'Chat', 'Files', 'Members']

export default function GroupDetailPage({ params }: { params: { id: string } }) {
  const groupId = parseInt(params.id)
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('Overview')
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: group, isLoading } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => groupsApi.getGroup(groupId).then(r => r.data),
  })

  const { data: messagesData } = useQuery({
    queryKey: ['group-messages', groupId],
    queryFn: () => groupsApi.getMessages(groupId).then(r => r.data),
    refetchInterval: 5000,
    enabled: activeTab === 'Chat',
  })

  const { data: documentsData } = useQuery({
    queryKey: ['group-docs', groupId],
    queryFn: () => groupsApi.getDocuments(groupId).then(r => r.data),
    enabled: activeTab === 'Files',
  })

  const sendMutation = useMutation({
    mutationFn: (content: string) => groupsApi.sendMessage(groupId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-messages', groupId] })
      setMessage('')
    },
    onError: () => toast.error('Failed to send message.'),
  })

  const messages = messagesData?.results || messagesData || []
  const documents = documentsData?.results || documentsData || []

  useEffect(() => {
    if (activeTab === 'Chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, activeTab])

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
        <span className="material-symbols-outlined text-primary text-[24px]">group</span>
      </div>
    </div>
  )

  if (!group) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <span className="material-symbols-outlined text-[48px] text-on-surface-variant">group_off</span>
      <h2 className="text-[20px] font-bold text-on-surface">Group not found</h2>
      <Link href="/groups" className="text-primary hover:underline">← Back to Groups</Link>
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* ── Cinematic Header ─────────────────────────── */}
      <div className="star-field relative w-full h-[300px] md:h-[360px] flex items-end overflow-hidden bg-surface-container-lowest">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 to-transparent"></div>
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-gradient-to-br from-tertiary/20 to-transparent blur-3xl"></div>

        <div className="relative z-10 w-full flex flex-col md:flex-row md:items-end justify-between gap-stack-md px-margin-mobile md:px-margin-desktop pb-stack-md">
          <div className="flex items-end gap-stack-md">
            <div className="w-20 h-20 md:w-28 md:h-28 rounded-[1.5rem] bg-surface-container border-4 border-primary shadow-xl flex items-center justify-center overflow-hidden">
              {group.cover_image ? (
                <img src={group.cover_image} alt={group.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[48px] font-bold text-primary">{(group.name || 'G')[0]}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-primary/20 text-primary text-[12px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  {group.member_count || 0} Members
                </span>
                {group.is_verified && (
                  <span className="flex items-center gap-1 text-secondary text-[13px] font-medium">
                    <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                    Verified
                  </span>
                )}
              </div>
              <h2 className="text-[28px] md:text-[36px] font-bold text-on-surface">{group.name}</h2>
              <p className="text-on-surface-variant text-[15px] max-w-md">{group.description || `A study group for ${group.subject || 'all subjects'}.`}</p>
            </div>
          </div>
          <button className="bg-primary text-on-primary px-8 py-4 rounded-[1rem] font-bold text-[16px] flex items-center justify-center gap-2 shadow-[0_6px_0_0_#763300] btn-squishy hover:brightness-110 transition-all self-start md:self-auto">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
            Join Session
          </button>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────── */}
      <div className="px-margin-mobile md:px-margin-desktop mt-stack-md">
        <div className="flex gap-stack-md border-b border-outline-variant/30 overflow-x-auto no-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'pb-stack-sm border-b-4 font-bold px-base transition-all whitespace-nowrap text-[15px]',
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
              )}
            >
              {tab}
              {tab === 'Chat' && messages.length > 0 && (
                <span className="ml-1 bg-error rounded-full px-1.5 py-0.5 text-[10px] text-on-error">{messages.length > 9 ? '9+' : messages.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ──────────────────────────────── */}
      <div className="px-margin-mobile md:px-margin-desktop mt-stack-lg grid grid-cols-1 lg:grid-cols-12 gap-gutter pb-stack-lg">

        {/* ── OVERVIEW TAB ─────────────────────────────── */}
        {activeTab === 'Overview' && (
          <>
            <div className="lg:col-span-8 space-y-stack-lg">
              {/* Study Tools */}
              <section>
                <h3 className="text-[22px] font-bold text-on-surface mb-stack-md flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>push_pin</span>
                  Study Tools
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter">
                  {[
                    { icon: 'account_tree', color: 'text-tertiary bg-tertiary-container', label: 'Group Mind Map', desc: 'Collaborative concept mapping', badge: 'Interactive' },
                    { icon: 'quiz', color: 'text-secondary bg-secondary-container', label: 'Challenge Quiz', desc: 'Test your knowledge together', badge: `High Score: ${Math.floor(Math.random() * 500 + 500)}` },
                  ].map(tool => (
                    <div key={tool.label} className="glass-panel p-stack-md rounded-[1.5rem] group cursor-pointer hover:bg-surface-container-high transition-all">
                      <div className={cn('w-12 h-12 rounded-[1rem] flex items-center justify-center mb-stack-sm', tool.color)}>
                        <span className="material-symbols-outlined text-[28px]">{tool.icon}</span>
                      </div>
                      <h4 className="text-[16px] font-bold text-on-surface mb-1">{tool.label}</h4>
                      <p className="text-on-surface-variant text-[13px] mb-stack-md">{tool.desc}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-bold text-secondary bg-secondary/10 px-2 py-1 rounded">{tool.badge}</span>
                        <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">arrow_forward</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Resource library */}
              {documents.length > 0 && (
                <section>
                  <h3 className="text-[22px] font-bold text-on-surface mb-stack-md flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>library_books</span>
                    Group Resources
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-base">
                    {documents.slice(0, 6).map((doc: any) => (
                      <div key={doc.id} className="glass-panel p-stack-sm rounded-[1rem] flex flex-col gap-2 hover:bg-surface-container-high transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-primary text-[24px]">description</span>
                        <span className="text-[13px] font-bold text-on-surface truncate">{doc.title}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Right sidebar */}
            <div className="lg:col-span-4 space-y-stack-lg">
              {/* Squad Achievements */}
              <div className="glass-panel p-stack-md rounded-[1.5rem] border-2 border-primary/20">
                <h3 className="text-[16px] font-bold text-on-surface mb-stack-md">Squad Achievements</h3>
                <div className="space-y-stack-md">
                  {[
                    { label: 'Hours Studied', val: 128, max: 150, color: 'bg-primary' },
                    { label: 'Goals Met', val: 12, max: 20, color: 'bg-tertiary' },
                  ].map(stat => (
                    <div key={stat.label}>
                      <div className="flex justify-between text-[13px] mb-1">
                        <span className="text-on-surface-variant">{stat.label}</span>
                        <span className="text-primary font-bold">{stat.val} / {stat.max}</span>
                      </div>
                      <div className="w-full h-3 bg-surface-container-highest rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', stat.color)} style={{ width: `${(stat.val / stat.max) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Tip */}
              <div className="bg-gradient-to-br from-secondary-container to-secondary/30 p-stack-md rounded-[1.5rem] shadow-xl relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 opacity-20">
                  <span className="material-symbols-outlined text-[80px] text-white">auto_awesome</span>
                </div>
                <div className="flex items-center gap-base mb-stack-sm relative z-10">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                  </div>
                  <h4 className="text-white font-bold text-[13px] uppercase tracking-widest">FlowAI Quick Tip</h4>
                </div>
                <p className="text-white text-[14px] relative z-10 leading-relaxed italic">
                  &quot;Study groups that quiz each other regularly perform 35% better on exams. Try the Flashcard Race tool!&quot;
                </p>
                <button className="mt-stack-sm bg-white text-secondary-container px-4 py-2 rounded-full font-bold text-[12px] uppercase tracking-wider relative z-10 shadow-lg">
                  Try It Now
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── CHAT TAB ──────────────────────────────────── */}
        {activeTab === 'Chat' && (
          <div className="lg:col-span-12 flex flex-col h-[600px] bg-surface-container-low rounded-[1.5rem] border border-outline-variant overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-stack-md space-y-stack-sm">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                  <span className="material-symbols-outlined text-[48px] text-on-surface-variant/40">chat</span>
                  <p className="text-on-surface-variant text-[15px]">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((msg: any) => {
                  const isMe = msg.sender?.id === (session?.user as any)?.id || msg.sender_id === (session?.user as any)?.id
                  return (
                    <div key={msg.id} className={cn('flex gap-3', isMe ? 'flex-row-reverse' : 'flex-row')}>
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary text-[12px] font-bold shrink-0">
                        {(msg.sender?.username || msg.sender?.email || 'U')[0].toUpperCase()}
                      </div>
                      <div className={cn('max-w-[70%] rounded-[1rem] px-4 py-3', isMe ? 'bg-primary text-on-primary rounded-tr-sm' : 'bg-surface-container text-on-surface rounded-tl-sm')}>
                        {!isMe && <p className="text-[11px] font-bold mb-1 opacity-70">{msg.sender?.username || 'Unknown'}</p>}
                        <p className="text-[14px]">{msg.content}</p>
                        <p className={cn('text-[10px] mt-1 opacity-60', isMe ? 'text-right' : '')}>{timeAgo(msg.created_at)}</p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-stack-sm border-t border-outline-variant/30 flex items-center gap-base">
              <input
                className="flex-1 bg-surface-container rounded-full px-stack-md py-3 text-on-surface text-[15px] focus:outline-none focus:ring-2 focus:ring-secondary transition-all"
                placeholder="Type a message…"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && message.trim() && sendMutation.mutate(message)}
              />
              <button
                onClick={() => message.trim() && sendMutation.mutate(message)}
                disabled={sendMutation.isPending || !message.trim()}
                className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg btn-3d hover:brightness-110 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">send</span>
              </button>
            </div>
          </div>
        )}

        {/* ── FILES TAB ─────────────────────────────────── */}
        {activeTab === 'Files' && (
          <div className="lg:col-span-12">
            {documents.length === 0 ? (
              <div className="text-center py-stack-lg">
                <span className="material-symbols-outlined text-[48px] text-on-surface-variant/40">folder_open</span>
                <p className="text-on-surface-variant text-[15px] mt-4">No files shared yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
                {documents.map((doc: any) => (
                  <div key={doc.id} className="bg-surface-container-low rounded-[1.5rem] p-stack-md border border-outline-variant hover:border-primary/30 transition-all">
                    <div className="flex items-start gap-base mb-stack-sm">
                      <span className="material-symbols-outlined text-primary text-[28px]">description</span>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-on-surface truncate">{doc.title}</h4>
                        <p className="text-[12px] text-on-surface-variant">{doc.author?.username || 'Unknown'} · {timeAgo(doc.created_at)}</p>
                      </div>
                    </div>
                    {doc.content && <p className="text-[13px] text-on-surface-variant line-clamp-2">{doc.content}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MEMBERS TAB ───────────────────────────────── */}
        {activeTab === 'Members' && (
          <div className="lg:col-span-12">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-gutter">
              {(group.memberships || group.members || []).map((member: any, i: number) => (
                <div key={member.id || i} className="bg-surface-container-low rounded-[1.5rem] p-stack-md border border-outline-variant/20 flex flex-col items-center text-center gap-base">
                  <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-on-primary text-[24px] font-bold">
                    {(member.user?.username || member.username || member.email || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-on-surface text-[15px]">{member.user?.username || member.username || 'Member'}</p>
                    <p className="text-[12px] text-on-surface-variant capitalize">{member.role || 'Member'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
