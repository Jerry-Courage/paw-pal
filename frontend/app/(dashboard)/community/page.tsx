'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { communityApi, groupsApi, libraryApi } from '@/lib/api'
import {
  Plus, Heart, MessageCircle, Share2, Sparkles, Users, Calendar,
  Trophy, Flame, BookOpen, X, Send, Loader2, Zap, Clock,
  HelpCircle, Lightbulb, Star, ChevronDown, Play, Crown
} from 'lucide-react'
import { timeAgo, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useSession } from 'next-auth/react'

const TABS = [
  { id: 'feed', label: 'Feed', icon: Sparkles },
  { id: 'rooms', label: 'Study Rooms', icon: Users },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'events', label: 'Events', icon: Calendar },
  { id: 'groups', label: 'Groups', icon: BookOpen },
]

const POST_TYPES = [
  { id: 'general', label: 'General', icon: '💬', color: 'bg-gray-100 text-gray-600' },
  { id: 'question', label: 'Question', icon: '❓', color: 'bg-orange-100 text-orange-600' },
  { id: 'resource', label: 'Resource', icon: '📚', color: 'bg-sky-100 text-sky-600' },
  { id: 'tip', label: 'Study Tip', icon: '💡', color: 'bg-yellow-100 text-yellow-600' },
  { id: 'achievement', label: 'Achievement', icon: '🏆', color: 'bg-emerald-100 text-emerald-600' },
]

export default function CommunityPage() {
  const [tab, setTab] = useState('feed')
  const { data: session } = useSession()

  return (
    <div className="max-w-6xl mx-auto">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto scrollbar-hide border-b border-gray-100 dark:border-gray-800">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0',
              tab === t.id ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'feed' && <FeedTab session={session} />}
      {tab === 'rooms' && <RoomsTab />}
      {tab === 'leaderboard' && <LeaderboardTab />}
      {tab === 'events' && <EventsTab />}
      {tab === 'groups' && <GroupsTab />}
    </div>
  )
}

// ─── FEED TAB ────────────────────────────────────────────────────────────────
function FeedTab({ session }: { session: any }) {
  const [postType, setPostType] = useState('general')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [resourceId, setResourceId] = useState('')
  const [filterType, setFilterType] = useState('')
  const [expandCompose, setExpandCompose] = useState(false)
  const qc = useQueryClient()

  const { data: postsData, isLoading } = useQuery({
    queryKey: ['posts', filterType],
    queryFn: () => communityApi.getPosts(filterType || undefined).then(r => r.data),
    refetchInterval: 30000,
  })
  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })

  const posts: any[] = postsData?.results || []
  const resources: any[] = resourcesData?.results || []

  const createPost = useMutation({
    mutationFn: () => communityApi.createPost({
      content, post_type: postType,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      resource: resourceId || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts'] })
      setContent(''); setTags(''); setResourceId(''); setExpandCompose(false)
      toast.success('Posted!')
    },
  })

  const likePost = useMutation({
    mutationFn: (id: number) => communityApi.likePost(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  })

  const initials = getInitials(session?.user?.name || 'Me')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        {/* Compose */}
        <div className="card p-4">
          <div className="flex gap-3">
            <div className="w-9 h-9 bg-sky-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials}</div>
            <div className="flex-1">
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                onFocus={() => setExpandCompose(true)}
                placeholder="Share a resource, ask a question, or post a study tip..."
                className="w-full text-sm resize-none border-0 outline-none bg-transparent placeholder-gray-400 dark:placeholder-gray-600"
                rows={expandCompose ? 3 : 1}
              />
              {expandCompose && (
                <div className="mt-3 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                  {/* Post type */}
                  <div className="flex flex-wrap gap-2">
                    {POST_TYPES.map(pt => (
                      <button key={pt.id} onClick={() => setPostType(pt.id)}
                        className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border',
                          postType === pt.id ? `${pt.color} border-current` : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300')}>
                        {pt.icon} {pt.label}
                      </button>
                    ))}
                  </div>
                  {/* Tags */}
                  <input value={tags} onChange={e => setTags(e.target.value)}
                    placeholder="Tags (comma separated, e.g. math, calculus)"
                    className="input text-xs" />
                  {/* Resource link */}
                  {postType === 'resource' && (
                    <select value={resourceId} onChange={e => setResourceId(e.target.value)} className="input text-xs">
                      <option value="">Link a resource (optional)</option>
                      {resources.map((r: any) => <option key={r.id} value={r.id}>{r.title}</option>)}
                    </select>
                  )}
                  <div className="flex items-center justify-between">
                    <button onClick={() => setExpandCompose(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    <button onClick={() => createPost.mutate()} disabled={!content.trim() || createPost.isPending}
                      className="btn-primary text-sm flex items-center gap-2">
                      {createPost.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Post
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {[{ id: '', label: 'All' }, ...POST_TYPES].map(pt => (
            <button key={pt.id} onClick={() => setFilterType(pt.id)}
              className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                filterType === pt.id ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-sky-300')}>
              {'icon' in pt ? `${pt.icon} ` : ''}{pt.label}
            </button>
          ))}
        </div>

        {/* Posts */}
        {isLoading ? (
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="card p-4 animate-pulse h-32" />)}</div>
        ) : posts.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">
            <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No posts yet. Be the first to share!</p>
          </div>
        ) : posts.map((post: any) => (
          <PostCard key={post.id} post={post} onLike={() => likePost.mutate(post.id)} />
        ))}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <TrendingTopics posts={posts} />
        <SuggestedGroups />
        <QuickStats />
      </div>
    </div>
  )
}

// ─── POST CARD ────────────────────────────────────────────────────────────────
function PostCard({ post, onLike }: { post: any; onLike: () => void }) {
  const [showComments, setShowComments] = useState(false)
  const [comment, setComment] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const qc = useQueryClient()

  const pt = POST_TYPES.find(p => p.id === post.post_type) || POST_TYPES[0]

  const addComment = useMutation({
    mutationFn: () => communityApi.addComment(post.id, comment),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posts'] }); setComment('') },
  })

  const getAIAnswer = async () => {
    setAiLoading(true)
    try {
      await communityApi.getAIAnswer(post.id)
      qc.invalidateQueries({ queryKey: ['posts'] })
      toast.success('FlowAI answered!')
    } catch { toast.error('AI unavailable.') }
    finally { setAiLoading(false) }
  }

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 bg-gradient-to-br from-sky-400 to-sky-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {getInitials(post.author?.first_name || post.author?.username || 'U')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {post.author?.first_name ? `${post.author.first_name} ${post.author.last_name || ''}`.trim() : post.author?.username}
            </span>
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', pt.color)}>
              {pt.icon} {pt.label}
            </span>
            {post.is_answered && <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">✓ Answered</span>}
          </div>
          <span className="text-xs text-gray-400">{timeAgo(post.created_at)}</span>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">{post.content}</p>

      {/* Linked resource */}
      {post.resource_title && (
        <Link href={`/library/${post.resource}`}
          className="flex items-center gap-2 p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900 mb-3 hover:bg-sky-100 dark:hover:bg-sky-950/50 transition-colors">
          <BookOpen className="w-4 h-4 text-sky-500 flex-shrink-0" />
          <span className="text-xs font-medium text-sky-700 dark:text-sky-300 truncate">{post.resource_title}</span>
          <span className="text-xs text-sky-400 ml-auto capitalize">{post.resource_type}</span>
        </Link>
      )}

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {post.tags.map((t: string) => (
            <span key={t} className="text-xs text-sky-500 bg-sky-50 dark:bg-sky-950/30 px-2 py-0.5 rounded-full">#{t}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-3 border-t border-gray-50 dark:border-gray-800">
        <button onClick={onLike}
          className={cn('flex items-center gap-1.5 text-sm transition-colors', post.is_liked ? 'text-red-500' : 'text-gray-400 hover:text-red-400')}>
          <Heart className="w-4 h-4" fill={post.is_liked ? 'currentColor' : 'none'} />
          <span>{post.like_count}</span>
        </button>
        <button onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-sky-500 transition-colors">
          <MessageCircle className="w-4 h-4" />
          <span>{post.comment_count}</span>
        </button>
        {post.post_type === 'question' && !post.is_answered && (
          <button onClick={getAIAnswer} disabled={aiLoading}
            className="flex items-center gap-1.5 text-xs text-violet-500 hover:text-violet-600 ml-auto transition-colors">
            {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Ask FlowAI
          </button>
        )}
      </div>

      {/* Comments */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-gray-50 dark:border-gray-800 space-y-3">
          {post.comments?.map((c: any) => (
            <div key={c.id} className={cn('flex gap-2.5', c.is_ai_answer && 'bg-violet-50 dark:bg-violet-950/20 rounded-xl p-2.5')}>
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                c.is_ai_answer ? 'bg-gradient-to-br from-violet-400 to-violet-600' : 'bg-sky-500')}>
                {c.is_ai_answer ? <Sparkles className="w-3 h-3" /> : getInitials(c.author?.username || 'U')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{c.is_ai_answer ? 'FlowAI' : c.author?.username}</span>
                  {c.is_ai_answer && <span className="text-xs bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">AI Answer</span>}
                  <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">{c.content}</p>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={comment} onChange={e => setComment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && comment.trim() && addComment.mutate()}
              placeholder="Add a comment..." className="input text-xs flex-1" />
            <button onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending}
              className="btn-primary p-2"><Send className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── STUDY ROOMS TAB ─────────────────────────────────────────────────────────
function RoomsTab() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['study-rooms'],
    queryFn: () => communityApi.getRooms().then(r => r.data),
    refetchInterval: 15000,
  })
  const rooms: any[] = data?.results || []

  const joinMutation = useMutation({
    mutationFn: (id: number) => communityApi.joinRoom(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['study-rooms'] }),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Live Study Rooms</h2>
          <p className="text-sm text-gray-400">Join a room and study alongside others in real time</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Create Room
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="card p-4 animate-pulse h-40" />)}
        </div>
      ) : rooms.length === 0 ? (
        <div className="card p-16 text-center text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-1">No active rooms</p>
          <p className="text-sm mb-4">Create one and invite others to study with you</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">Create First Room</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room: any) => (
            <div key={room.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-xs text-emerald-500 font-medium">LIVE</span>
                </div>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {room.participant_count}/{room.max_participants}
                </span>
              </div>
              <h3 className="font-semibold text-sm mb-1 line-clamp-1">{room.title}</h3>
              {room.subject && <p className="text-xs text-gray-400 mb-1">{room.subject}</p>}
              {room.resource_title && (
                <p className="text-xs text-sky-500 flex items-center gap-1 mb-3">
                  <BookOpen className="w-3 h-3" /> {room.resource_title}
                </p>
              )}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 bg-sky-500 rounded-full flex items-center justify-center text-white text-xs">
                  {getInitials(room.host?.username || 'H')}
                </div>
                <span className="text-xs text-gray-500">Hosted by {room.host?.username}</span>
              </div>
              {/* Participant avatars */}
              <div className="flex items-center gap-1 mb-3">
                {Array.from({ length: Math.min(5, room.participant_count) }).map((_, i) => (
                  <div key={i} className="w-6 h-6 rounded-full bg-gradient-to-br from-sky-300 to-sky-500 border-2 border-white dark:border-gray-900 -ml-1 first:ml-0" />
                ))}
                {room.participant_count > 5 && <span className="text-xs text-gray-400 ml-1">+{room.participant_count - 5}</span>}
              </div>
              <button
                onClick={() => joinMutation.mutate(room.id)}
                disabled={joinMutation.isPending}
                className={cn('w-full text-sm', room.is_joined ? 'btn-secondary' : 'btn-primary')}>
                {room.is_joined ? 'Leave Room' : room.participant_count >= room.max_participants ? 'Full' : 'Join Room'}
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ title: '', subject: '', resource: '', max_participants: 20 })
  const qc = useQueryClient()
  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })
  const resources: any[] = resourcesData?.results || []

  const mutation = useMutation({
    mutationFn: () => communityApi.createRoom({ ...form, resource: form.resource || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['study-rooms'] }); onClose(); toast.success('Room created!') },
  })

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-bold text-lg">Create Study Room</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <input placeholder="Room title *" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} className="input" />
          <input placeholder="Subject (e.g. Calculus, Python)" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} className="input" />
          <select value={form.resource} onChange={e => setForm(f => ({...f, resource: e.target.value}))} className="input">
            <option value="">Link a resource (optional)</option>
            {resources.map((r: any) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Max participants: {form.max_participants}</label>
            <input type="range" min={2} max={50} value={form.max_participants}
              onChange={e => setForm(f => ({...f, max_participants: parseInt(e.target.value)}))}
              className="w-full" />
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.title || mutation.isPending} className="btn-primary flex-1">
            {mutation.isPending ? 'Creating...' : 'Create Room'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── LEADERBOARD TAB ─────────────────────────────────────────────────────────
function LeaderboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => communityApi.getLeaderboard().then(r => r.data),
    refetchInterval: 60000,
  })

  const leaderboard: any[] = data?.leaderboard || []
  const myRank = data?.my_rank

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />
    if (rank === 2) return <Trophy className="w-5 h-5 text-gray-400" />
    if (rank === 3) return <Trophy className="w-5 h-5 text-orange-400" />
    return <span className="text-sm font-bold text-gray-400 w-5 text-center">#{rank}</span>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-1">Weekly Leaderboard</h2>
        <p className="text-sm text-gray-400">Top learners ranked by streak and study time</p>
      </div>

      {/* My rank card */}
      {myRank && (
        <div className="card p-4 mb-4 bg-gradient-to-r from-sky-50 to-violet-50 dark:from-sky-950/30 dark:to-violet-950/30 border border-sky-200 dark:border-sky-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-500 rounded-full flex items-center justify-center text-white font-bold">
              {getInitials(myRank.full_name)}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">You — Rank #{myRank.rank || '?'}</div>
              <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-400" />{myRank.study_streak} day streak</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-sky-400" />{myRank.total_study_hours}h studied</span>
              </div>
            </div>
            <Zap className="w-5 h-5 text-yellow-400" />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="card p-4 animate-pulse h-16" />)}</div>
      ) : (
        <div className="card overflow-hidden">
          {leaderboard.map((user: any, i: number) => (
            <div key={user.username}
              className={cn('flex items-center gap-4 px-4 py-3 border-b border-gray-50 dark:border-gray-800 last:border-0 transition-colors',
                user.is_me ? 'bg-sky-50 dark:bg-sky-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50')}>
              <div className="w-8 flex items-center justify-center flex-shrink-0">
                {rankIcon(user.rank)}
              </div>
              <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                i === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-400' :
                i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                i === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-500' : 'bg-sky-500')}>
                {getInitials(user.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">
                  {user.full_name} {user.is_me && <span className="text-xs text-sky-500">(you)</span>}
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-3">
                  <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-400" />{user.study_streak}d</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-sky-400" />{user.total_study_hours}h</span>
                </div>
              </div>
              {i < 3 && (
                <div className={cn('text-xs font-bold px-2 py-1 rounded-full',
                  i === 0 ? 'bg-yellow-100 text-yellow-600' : i === 1 ? 'bg-gray-100 text-gray-600' : 'bg-orange-100 text-orange-600')}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                </div>
              )}
            </div>
          ))}
          {leaderboard.length === 0 && (
            <div className="p-12 text-center text-gray-400">
              <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Start studying to appear on the leaderboard!</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── EVENTS TAB ───────────────────────────────────────────────────────────────
function EventsTab() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['events'],
    queryFn: () => communityApi.getEvents().then(r => r.data),
  })
  const events: any[] = data?.results || []

  const registerMutation = useMutation({
    mutationFn: (id: number) => communityApi.registerEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })

  const EVENT_COLORS: Record<string, string> = {
    workshop: 'bg-violet-100 text-violet-600',
    exam_prep: 'bg-red-100 text-red-600',
    session: 'bg-sky-100 text-sky-600',
    challenge: 'bg-orange-100 text-orange-600',
    ama: 'bg-emerald-100 text-emerald-600',
  }

  const getCountdown = (date: string) => {
    const diff = new Date(date).getTime() - Date.now()
    if (diff < 0) return 'Ended'
    const days = Math.floor(diff / 86400000)
    const hrs = Math.floor((diff % 86400000) / 3600000)
    if (days > 0) return `${days}d ${hrs}h`
    const mins = Math.floor((diff % 3600000) / 60000)
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Study Events</h2>
          <p className="text-sm text-gray-400">Workshops, exam prep sessions, and challenges</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Create Event
        </button>
      </div>

      {events.length === 0 ? (
        <div className="card p-16 text-center text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-1">No upcoming events</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm mt-2">Create First Event</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {events.map((e: any) => (
            <div key={e.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className={cn('text-xs px-2 py-1 rounded-full font-medium capitalize', EVENT_COLORS[e.event_type] || EVENT_COLORS.session)}>
                  {e.event_type.replace('_', ' ')}
                </span>
                <div className="text-right">
                  <div className="text-xs font-bold text-sky-500">{getCountdown(e.scheduled_at)}</div>
                  <div className="text-xs text-gray-400">remaining</div>
                </div>
              </div>
              <h3 className="font-bold mb-1">{e.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{e.description}</p>
              <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(e.scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{e.registration_count}/{e.max_participants}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">by {e.host_name}</span>
                <button onClick={() => registerMutation.mutate(e.id)}
                  className={e.is_registered ? 'btn-secondary text-sm' : 'btn-primary text-sm'}>
                  {e.is_registered ? '✓ Registered' : 'Register'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CreateEventModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', event_type: 'session', scheduled_at: '', max_participants: 50 })
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => communityApi.createEvent(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); onClose(); toast.success('Event created!') },
  })
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-bold text-lg">Create Event</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <input placeholder="Event title *" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} className="input" />
          <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="input resize-none" rows={2} />
          <select value={form.event_type} onChange={e => setForm(f => ({...f, event_type: e.target.value}))} className="input">
            <option value="session">Study Session</option>
            <option value="workshop">Workshop</option>
            <option value="exam_prep">Exam Prep</option>
            <option value="challenge">Challenge</option>
            <option value="ama">Ask Me Anything</option>
          </select>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Date & Time *</label>
            <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({...f, scheduled_at: e.target.value}))} className="input" />
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.title || !form.scheduled_at || mutation.isPending} className="btn-primary flex-1">
            {mutation.isPending ? 'Creating...' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── GROUPS TAB ───────────────────────────────────────────────────────────────
function GroupsTab() {
  const { data } = useQuery({
    queryKey: ['public-groups'],
    queryFn: () => groupsApi.getGroups('all').then(r => r.data),
  })
  const qc = useQueryClient()
  const groups: any[] = data?.results || []

  const joinMutation = useMutation({
    mutationFn: (id: number) => groupsApi.joinGroup(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['public-groups'] }); toast.success('Joined!') },
  })

  const COLORS = ['from-sky-400 to-sky-600', 'from-violet-400 to-violet-600', 'from-emerald-400 to-emerald-600', 'from-orange-400 to-orange-600', 'from-pink-400 to-pink-600']

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Groups Directory</h2>
          <p className="text-sm text-gray-400">Find your study community</p>
        </div>
        <Link href="/groups" className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Create Group
        </Link>
      </div>
      {groups.length === 0 ? (
        <div className="card p-16 text-center text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No public groups yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g: any, i: number) => (
            <div key={g.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className={cn('w-12 h-12 bg-gradient-to-br rounded-xl flex items-center justify-center text-white font-bold text-lg', COLORS[i % COLORS.length])}>
                  {g.name[0].toUpperCase()}
                </div>
                {g.is_verified && <span className="text-xs bg-sky-100 dark:bg-sky-950 text-sky-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Star className="w-3 h-3" /> Verified</span>}
              </div>
              <h3 className="font-semibold mb-1">{g.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{g.description || 'No description'}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 flex items-center gap-1"><Users className="w-3 h-3" />{g.member_count} members</span>
                {g.is_member ? (
                  <Link href={`/groups/${g.id}`} className="btn-secondary text-xs py-1.5">View Group</Link>
                ) : (
                  <button onClick={() => joinMutation.mutate(g.id)} className="btn-primary text-xs py-1.5">Join</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SIDEBAR WIDGETS ──────────────────────────────────────────────────────────
function TrendingTopics({ posts }: { posts: any[] }) {
  const allTags = posts.flatMap((p: any) => p.tags || [])
  const counts: Record<string, number> = {}
  allTags.forEach(t => { counts[t] = (counts[t] || 0) + 1 })
  const trending = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)

  const staticTopics = ['#FinalWeek', '#AIStudyBuddy', '#FlowStateCommunity', '#StudyWithMe']

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold mb-3"># Trending Topics</h3>
      <div className="flex flex-wrap gap-2">
        {trending.length > 0
          ? trending.map(([tag, count]) => (
            <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full cursor-pointer hover:bg-sky-50 hover:text-sky-600 transition-colors">
              #{tag} <span className="opacity-60">{count}</span>
            </span>
          ))
          : staticTopics.map(t => (
            <span key={t} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full cursor-pointer hover:bg-sky-50 hover:text-sky-600 transition-colors">{t}</span>
          ))
        }
      </div>
    </div>
  )
}

function SuggestedGroups() {
  const { data } = useQuery({
    queryKey: ['public-groups'],
    queryFn: () => groupsApi.getGroups('all').then(r => r.data),
  })
  const groups: any[] = (data?.results || []).filter((g: any) => !g.is_member).slice(0, 3)
  const qc = useQueryClient()
  const joinMutation = useMutation({
    mutationFn: (id: number) => groupsApi.joinGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-groups'] }),
  })

  if (groups.length === 0) return null

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-gray-400" /> Suggested Groups</h3>
      <div className="space-y-3">
        {groups.map((g: any) => (
          <div key={g.id} className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{g.name}</div>
              <div className="text-xs text-gray-400">{g.member_count} members</div>
            </div>
            <button onClick={() => joinMutation.mutate(g.id)} className="text-sky-500 hover:text-sky-600 flex-shrink-0 ml-2"><Plus className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <Link href="/groups" className="text-xs text-sky-500 mt-3 hover:underline block">Discover More →</Link>
    </div>
  )
}

function QuickStats() {
  const { data } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => communityApi.getLeaderboard().then(r => r.data),
  })
  const myRank = data?.my_rank
  if (!myRank) return null

  return (
    <div className="card p-4 bg-gradient-to-br from-sky-500 to-violet-600 text-white">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4" />
        <span className="text-sm font-semibold">Your Standing</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/20 rounded-xl p-2.5 text-center">
          <div className="text-xl font-bold">#{myRank.rank || '?'}</div>
          <div className="text-xs opacity-80">Global Rank</div>
        </div>
        <div className="bg-white/20 rounded-xl p-2.5 text-center">
          <div className="text-xl font-bold">{myRank.study_streak}</div>
          <div className="text-xs opacity-80">Day Streak</div>
        </div>
      </div>
    </div>
  )
}
