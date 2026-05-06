'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { communityApi } from '@/lib/api'
import { Heart, MessageCircle, BookOpen, Sparkles, Loader2, Send, MoreHorizontal, Flag, Share2, CheckCircle2 } from 'lucide-react'
import { timeAgo, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { POST_TYPES } from './constants'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from 'next-auth/react'

export default function PostCard({ post, onLike }: { post: any; onLike: () => void }) {
  const [showComments, setShowComments] = useState(false)
  const [comment, setComment] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const { data: session } = useSession()
  const qc = useQueryClient()

  const isAuthor = session?.user?.id === post.author?.id
  const pt = POST_TYPES.find(p => p.id === post.post_type) || POST_TYPES[0]

  const addComment = useMutation({
    mutationFn: () => communityApi.addComment(post.id, comment),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posts'] }); setComment(''); toast.success('Comment added!') },
  })

  const deletePost = useMutation({
    mutationFn: () => communityApi.deletePost(post.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posts'] }); toast.success('Post deleted') },
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
    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      className="bg-[#1a1a1a] rounded-2xl mb-3 overflow-hidden hover:border-white/10 transition-all">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center text-orange-400 text-xs font-black">
                {getInitials(post.author?.first_name || post.author?.username || 'U')}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#1a1a1a] rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white">
                  {post.author?.first_name ? `${post.author.first_name} ${post.author.last_name || ''}`.trim() : post.author?.username}
                </span>
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider uppercase', pt.color)}>
                  {pt.label}
                </span>
                {post.is_answered && (
                  <span className="flex items-center gap-0.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold uppercase">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Solved
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-600">{timeAgo(post.created_at)}</span>
            </div>
          </div>

          <div className="relative">
            <button onClick={() => setShowOptions(!showOptions)}
              className="p-1.5 text-slate-600 hover:text-slate-300 hover:bg-white/5 rounded-xl transition-all">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {showOptions && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowOptions(false)} />
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -8 }}
                    className="absolute right-0 mt-1 w-44 bg-[#111] border border-white/8 rounded-2xl shadow-2xl z-20 overflow-hidden p-1.5">
                    <button onClick={() => { setShowOptions(false); toast.success('Reported to community mods') }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-white transition-all">
                      <Flag className="w-3.5 h-3.5" /> Report Post
                    </button>
                    {isAuthor && (
                      <button onClick={() => { if (confirm('Delete this post?')) { deletePost.mutate(); setShowOptions(false) } }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-all">
                        {deletePost.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Heart className="w-3.5 h-3.5 rotate-45" />}
                        Delete Post
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <p className="text-sm text-slate-300 leading-relaxed">{post.content}</p>

          {post.resource_title && (
            <Link href={`/library/${post.resource}`}
              className="group flex items-center gap-3 p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 hover:bg-orange-500/10 transition-all">
              <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <BookOpen className="w-4 h-4 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-0.5">{post.resource_type}</span>
                <span className="block text-xs font-semibold text-white truncate">{post.resource_title}</span>
              </div>
              <span className="text-xs font-bold text-orange-400 group-hover:translate-x-0.5 transition-transform">→</span>
            </Link>
          )}

          {post.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.tags.map((t: string) => (
                <span key={t} className="text-[10px] font-bold text-slate-500 bg-white/5 border border-white/8 px-2.5 py-1 rounded-lg hover:bg-orange-500/10 hover:text-orange-400 hover:border-orange-500/20 transition-all cursor-pointer">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/5">
          <div className="flex items-center gap-1">
            <button onClick={onLike}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                post.is_liked ? 'bg-rose-500/10 text-rose-400' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300')}>
              <Heart className={cn('w-3.5 h-3.5', post.is_liked && 'fill-current')} />
              <span>{post.like_count}</span>
            </button>
            <button onClick={() => setShowComments(!showComments)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                showComments ? 'bg-orange-500/10 text-orange-400' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300')}>
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{post.comment_count}</span>
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-all">
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {post.post_type === 'question' && !post.is_answered && (
            <button onClick={getAIAnswer} disabled={aiLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-orange-500/15 disabled:opacity-50 transition-all">
              {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Ask AI
            </button>
          )}
        </div>

        {/* Comments */}
        <AnimatePresence>
          {showComments && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="mt-4 overflow-hidden">
              <div className="space-y-3 pt-4 border-t border-white/5">
                {post.comments?.map((c: any) => (
                  <div key={c.id} className={cn('flex gap-3 p-3 rounded-xl',
                    c.is_ai_answer ? 'bg-violet-500/5 border border-violet-500/10' : 'hover:bg-white/3')}>
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0',
                      c.is_ai_answer ? 'bg-violet-500/20 text-violet-400' : 'bg-white/10 text-slate-400')}>
                      {c.is_ai_answer ? <Sparkles className="w-3.5 h-3.5" /> : getInitials(c.author?.username || 'U')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-white">{c.is_ai_answer ? 'FlowAI' : c.author?.username}</span>
                        {c.is_ai_answer && <span className="text-[9px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded-full font-black uppercase">AI</span>}
                        <span className="text-[10px] text-slate-600">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-3">
                <input value={comment} onChange={e => setComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && comment.trim() && addComment.mutate()}
                  placeholder="Share your thoughts..."
                  className="flex-1 px-3 py-2.5 bg-white/5 border border-white/8 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/30 transition-all" />
                <button onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending}
                  className="btn-primary px-3 py-2.5 text-xs">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
