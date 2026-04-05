'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi, aiApi } from '@/lib/api'
import { Users, Sparkles, Send, Calendar, ArrowRight, MessageCircle, Pin } from 'lucide-react'
import { timeAgo, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import CollabEditor from '@/components/groups/CollabEditor'
import Link from 'next/link'

const TABS = ['Overview', 'Workspace', 'Files', 'Members', 'Events', 'Chat']

export default function GroupPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const [tab, setTab] = useState('Overview')
  const qc = useQueryClient()

  const { data: group, isLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: () => groupsApi.getGroup(id).then((r) => r.data),
  })

  if (isLoading) return (
    <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
      <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-xl w-1/2" />
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto">
      {/* Group header — matches design page 9 */}
      <div className="card mb-5 overflow-hidden">
        <div className="h-36 bg-gradient-to-r from-sky-400 via-sky-500 to-teal-400 relative">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        </div>
        <div className="px-5 pb-5">
          <div className="flex items-end gap-4 -mt-8 mb-3">
            <div className="w-16 h-16 bg-white dark:bg-gray-900 rounded-xl border-4 border-white dark:border-gray-900 shadow-lg flex items-center justify-center text-2xl font-bold text-sky-500 flex-shrink-0">
              {group?.name?.[0] || 'G'}
            </div>
            <div className="flex-1 pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{group?.name}</h1>
                {group?.is_verified && (
                  <span className="text-xs bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Verified Group
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{group?.description}</p>
            </div>
            <div className="flex gap-2 pb-1">
              <button className="btn-secondary text-sm">Leave Group</button>
              <button className="btn-secondary text-sm">+ Invite</button>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2">···</button>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {group?.member_count || 0} Members</span>
            <span>{group?.is_public ? '🌐 Public Group' : '🔒 Private Group'}</span>
            {group?.is_verified && <span className="text-sky-500 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Moderated</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-100 dark:border-gray-800 mb-5 overflow-x-auto scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <GroupOverview groupId={id} />}
      {tab === 'Workspace' && <CollabEditor groupId={id} />}
      {tab === 'Chat' && <GroupChat groupId={id} />}
      {tab === 'Members' && <GroupMembers groupId={id} />}
      {tab === 'Events' && <GroupEvents groupId={id} />}
      {tab === 'Files' && <GroupFiles groupId={id} />}
    </div>
  )
}

function GroupOverview({ groupId }: { groupId: number }) {
  const { data: sessionsData } = useQuery({
    queryKey: ['group-sessions', groupId],
    queryFn: () => groupsApi.getSessions(groupId).then((r) => r.data),
  })
  const sessions = sessionsData?.results || []

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-4">
        {/* Enter workspace CTA — matches design page 9 */}
        <div className="card p-5 border-l-4 border-sky-500 bg-gradient-to-r from-sky-50 to-white dark:from-sky-950/30 dark:to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">ACTIVE NOW</span>
            <span className="text-xs text-gray-400">12 peers collaborating</span>
          </div>
          <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">Enter Group Workspace</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Our AI "Third Member" has summarized last night's discussion. Join the shared editor to contribute to the final paper.
          </p>
          <button className="btn-primary text-sm flex items-center gap-2">
            Join Workspace <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Pinned Resources */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Pin className="w-4 h-4 text-gray-400" /> Pinned Resources
              <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded-full">4</span>
            </h3>
            <button className="text-xs text-sky-500 hover:underline">View all Files</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { name: 'Ethical Frameworks in LLMs', by: 'Sarah Jenkins', date: 'Oct 12', icon: '📄' },
              { name: 'Bias Detection Workshop', by: 'Dr. Miller', date: 'Oct 15', icon: '🎥' },
              { name: 'Group Discussion Notes', by: 'AI Assistant', date: 'Oct 20', icon: '📝' },
            ].map((r) => (
              <div key={r.name} className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 hover:border-sky-200 dark:hover:border-sky-800 transition-colors">
                <div className="text-2xl mb-2">{r.icon}</div>
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 line-clamp-2">{r.name}</div>
                <div className="text-xs text-gray-400">Shared by {r.by} • {r.date}</div>
                <div className="flex gap-2 mt-2">
                  <button className="text-xs text-sky-500 hover:underline">Ask AI</button>
                  <button className="text-xs text-sky-500 hover:underline">Quiz Me</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Latest Discussions */}
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-3">Latest Discussions</h3>
          <div className="space-y-3">
            {[
              { name: 'Marcus Thorne', time: '2h ago', content: "I've been looking into the reinforcement learning from human feedback (RLHF) section of the new paper. Does anyone want to do a deep dive tonight at 8 PM? I think the alignment problem is being simplified too much.", replies: 12 },
            ].map((d, i) => (
              <div key={i} className="flex gap-3 pb-3 border-b border-gray-50 dark:border-gray-800 last:border-0 last:pb-0">
                <div className="w-8 h-8 bg-sky-400 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {getInitials(d.name)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{d.name}</span>
                    <span className="text-xs text-gray-400">{d.time}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{d.content}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" /> {d.replies} replies
                    </span>
                    <span className="text-xs text-sky-500 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI Summary Available
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="space-y-4">
        {/* Group Sessions */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Group Sessions</h3>
            <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <Calendar className="w-4 h-4" />
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">No sessions scheduled</p>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 3).map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                  <div className="text-center w-10 flex-shrink-0">
                    <div className="text-xs font-bold text-sky-500">{new Date(s.scheduled_at).toLocaleDateString('en', { month: 'short' }).toUpperCase()}</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white leading-none">{new Date(s.scheduled_at).getDate()}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate text-gray-700 dark:text-gray-300">{s.title}</div>
                    <div className="text-xs text-gray-400">{s.attendee_count} attending</div>
                  </div>
                  <button className="text-sky-500 hover:text-sky-600 flex-shrink-0">
                    <span className="text-lg">+</span>
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className="btn-secondary w-full text-xs mt-3">Open Group Calendar</button>
        </div>

        {/* Active Now */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Active Now</h3>
            <span className="text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">24 Online</span>
          </div>
          <div className="space-y-2">
            {[
              { name: 'Alex Rivers', role: 'AI Advisor', status: 'online', badge: null },
              { name: 'Elena Rodriguez', role: 'focus', status: 'focus', badge: 'Focus Mode' },
              { name: 'David Kim', role: 'online', status: 'online', badge: null },
              { name: 'Sophie Chen', role: 'focus', status: 'focus', badge: 'Focus Mode' },
            ].map((m) => (
              <div key={m.name} className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-8 h-8 bg-sky-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {getInitials(m.name)}
                  </div>
                  <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-900 ${m.status === 'online' ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{m.name}</div>
                  <div className="text-xs text-gray-400">{m.role}</div>
                </div>
                {m.badge && (
                  <span className="text-xs bg-yellow-100 dark:bg-yellow-950 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded-full">{m.badge}</span>
                )}
              </div>
            ))}
          </div>
          <button className="text-xs text-sky-500 hover:underline mt-3 block">View all members</button>
        </div>

        {/* Group Stats & AI Insight */}
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-500" /> Group Stats & AI Insight
          </h3>
          <div className="bg-sky-50 dark:bg-sky-950/50 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400 italic mb-3">
            "This week, your group focused most on <strong>Algorithmic Transparency</strong>. Activity is 22% compared to last week.
            I recommend the new 'Ethics in Robotics' dataset for your next session."
            <div className="text-sky-500 font-medium mt-1 not-italic">— FlowState AI</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="text-xl font-bold text-gray-900 dark:text-white">12</div>
              <div className="text-xs text-gray-400">Files Added</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="text-xl font-bold text-gray-900 dark:text-white">48.5</div>
              <div className="text-xs text-gray-400">Study Hours</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function GroupChat({ groupId }: { groupId: number }) {
  const [input, setInput] = useState('')
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['group-messages', groupId],
    queryFn: () => groupsApi.getMessages(groupId).then((r) => r.data),
    refetchInterval: 4000,
  })

  const sendMutation = useMutation({
    mutationFn: () => groupsApi.sendMessage(groupId, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['group-messages', groupId] }); setInput('') },
  })

  const messages = data?.results || []

  return (
    <div className="card flex flex-col h-[520px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m: any) => (
          <div key={m.id} className="flex gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${m.is_ai ? 'bg-sky-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
              {m.is_ai ? <Sparkles className="w-4 h-4" /> : getInitials(m.sender_name || 'U')}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{m.sender_name}</span>
                {m.is_ai && <span className="text-xs bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded">AI</span>}
                <span className="text-xs text-gray-400">{timeAgo(m.created_at)}</span>
              </div>
              <div className={`text-sm rounded-2xl px-3 py-2 max-w-lg ${m.is_ai ? 'bg-sky-50 dark:bg-sky-950/50 text-gray-700 dark:text-gray-300' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                {m.is_ai
                  ? <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">{m.content}</ReactMarkdown>
                  : m.content}
              </div>
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-center text-gray-400 py-12">
            <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1 text-gray-300 dark:text-gray-600">Mention @FlowAI for AI assistance</p>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-gray-100 dark:border-gray-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMutation.mutate()}
            placeholder="Message the group... (mention @FlowAI for AI help)"
            className="input flex-1 text-sm"
          />
          <button onClick={() => sendMutation.mutate()} disabled={!input.trim() || sendMutation.isPending} className="btn-primary p-2.5">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function GroupMembers({ groupId }: { groupId: number }) {
  return (
    <div className="card p-8 text-center text-gray-400">
      <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p className="text-sm">Members list</p>
      <p className="text-xs mt-1 text-gray-300 dark:text-gray-600">Invite members using the button in the group header</p>
    </div>
  )
}

function GroupEvents({ groupId }: { groupId: number }) {
  const { data } = useQuery({
    queryKey: ['group-sessions', groupId],
    queryFn: () => groupsApi.getSessions(groupId).then((r) => r.data),
  })
  const sessions = data?.results || []

  return (
    <div className="space-y-3">
      {sessions.map((s: any) => (
        <div key={s.id} className="card p-4 flex items-center gap-4">
          <div className="text-center w-14 flex-shrink-0">
            <div className="text-xs font-bold text-sky-500">{new Date(s.scheduled_at).toLocaleDateString('en', { month: 'short' }).toUpperCase()}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{new Date(s.scheduled_at).getDate()}</div>
          </div>
          <div className="flex-1">
            <div className="font-medium text-gray-900 dark:text-white">{s.title}</div>
            <div className="text-sm text-gray-400">{s.description}</div>
            <div className="text-xs text-gray-400 mt-1">{s.attendee_count} attending · {s.duration_minutes} mins</div>
          </div>
          <button className="btn-secondary text-sm">+ RSVP</button>
        </div>
      ))}
      {sessions.length === 0 && (
        <div className="card p-12 text-center text-gray-400">
          <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No events scheduled</p>
        </div>
      )}
    </div>
  )
}

function GroupFiles({ groupId }: { groupId: number }) {
  const { data } = useQuery({
    queryKey: ['group-docs', groupId],
    queryFn: () => groupsApi.getDocuments(groupId).then((r) => r.data),
  })
  const docs = data?.results || []

  return (
    <div className="space-y-2">
      {docs.map((d: any) => (
        <div key={d.id} className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-50 dark:bg-sky-950 rounded-lg flex items-center justify-center text-lg">📝</div>
          <div className="flex-1">
            <div className="font-medium text-sm text-gray-900 dark:text-white">{d.title}</div>
            <div className="text-xs text-gray-400">Last edited by {d.last_edited_by_name} · {timeAgo(d.updated_at)}</div>
          </div>
          <div className="flex gap-2">
            <button className="text-xs text-sky-500 hover:underline">Ask AI</button>
            <button className="text-xs text-sky-500 hover:underline">Quiz Me</button>
          </div>
        </div>
      ))}
      {docs.length === 0 && (
        <div className="card p-12 text-center text-gray-400">
          <p className="text-sm">No files yet. Create a document in the Workspace tab.</p>
        </div>
      )}
    </div>
  )
}
