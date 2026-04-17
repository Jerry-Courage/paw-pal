'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { communityApi } from '@/lib/api'
import { 
  Heart, MessageCircle, BookOpen, Sparkles, Loader2, Send, 
  MoreHorizontal, Flag, Share2, CheckCircle2 
} from 'lucide-react'
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
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['posts'] })
      setComment('') 
      toast.success('Comment added!')
    },
  })

  const deletePost = useMutation({
    mutationFn: () => communityApi.deletePost(post.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts'] })
      toast.success('Post deleted')
    },
  })

  const getAIAnswer = async () => {
    setAiLoading(true)
    try {
      await communityApi.getAIAnswer(post.id)
      qc.invalidateQueries({ queryKey: ['posts'] })
      toast.success('FlowAI answered!')
    } catch { 
      toast.error('AI unavailable.') 
    } finally { 
      setAiLoading(false) 
    }
  }

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass-card mb-4 overflow-hidden border-slate-200/60 dark:border-white/5"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-violet-600 rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-lg">
                {getInitials(post.author?.first_name || post.author?.username || 'U')}
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {post.author?.first_name ? `${post.author.first_name} ${post.author.last_name || ''}`.trim() : post.author?.username}
                </span>
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider uppercase', pt.color)}>
                  {pt.label}
                </span>
                {post.is_answered && (
                  <span className="flex items-center gap-0.5 text-[10px] bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Solved
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400 font-medium">{timeAgo(post.created_at)}</span>
            </div>
          </div>
          <div className="relative">
            <button 
              onClick={() => setShowOptions(!showOptions)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            <AnimatePresence>
              {showOptions && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowOptions(false)} 
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl shadow-2xl z-20 overflow-hidden"
                  >
                    <div className="p-1.5">
                      <button 
                        onClick={() => {
                          setShowOptions(false)
                          toast.success('Reported to community mods')
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <Flag className="w-4 h-4" />
                        Report Post
                      </button>
                      
                      {isAuthor && (
                        <button 
                          onClick={() => {
                            if (confirm('Delete this post permanently?')) {
                              deletePost.mutate()
                              setShowOptions(false)
                            }
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                        >
                          <Loader2 className={cn("w-4 h-4", deletePost.isPending ? "animate-spin" : "hidden")} />
                          {!deletePost.isPending && <Heart className="w-4 h-4 rotate-45" />} 
                          Delete Pulse
                        </button>
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <p className="text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
            {post.content}
          </p>

          {/* Linked resource */}
          {post.resource_title && (
            <Link href={`/library/${post.resource}`}
              className="group flex items-center gap-3 p-3 rounded-2xl bg-primary/5 dark:bg-primary/10 border border-primary/10 hover:bg-primary/10 dark:hover:bg-primary/20 transition-all duration-300"
            >
              <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-primary uppercase tracking-wider mb-0.5">{post.resource_type}</span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-white truncate">{post.resource_title}</span>
              </div>
              <div className="text-xs font-bold text-primary group-hover:translate-x-1 transition-transform">View →</div>
            </Link>
          )}

          {/* Tags */}
          {post.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((t: string) => (
                <span key={t} className="text-[11px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-3 py-1 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-1 sm:gap-4">
            <button 
              onClick={onLike}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold transition-all active:scale-90',
                post.is_liked 
                  ? 'bg-rose-50 text-rose-500 dark:bg-rose-900/20' 
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <Heart className={cn('w-4 h-4', post.is_liked && 'fill-current')} />
              <span>{post.like_count}</span>
            </button>
            <button 
              onClick={() => setShowComments(!showComments)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold transition-all',
                showComments 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <MessageCircle className="w-4 h-4" />
              <span>{post.comment_count}</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          {post.post_type === 'question' && !post.is_answered && (
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={getAIAnswer} 
              disabled={aiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-primary text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 transition-all"
            >
              {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Ask AI
            </motion.button>
          )}
        </div>

        {/* Comments Section */}
        <AnimatePresence>
          {showComments && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-6 space-y-4 overflow-hidden"
            >
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5">
                {post.comments?.map((c: any) => (
                  <div key={c.id} className={cn(
                    'flex gap-3 p-3 rounded-2xl transition-colors',
                    c.is_ai_answer ? 'bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  )}>
                    <div className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 shadow-sm',
                      c.is_ai_answer ? 'bg-gradient-to-br from-violet-500 to-primary' : 'bg-slate-500'
                    )}>
                      {c.is_ai_answer ? <Sparkles className="w-4 h-4" /> : getInitials(c.author?.username || 'U')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {c.is_ai_answer ? 'FlowAI Assistant' : c.author?.username}
                        </span>
                        {c.is_ai_answer && (
                          <span className="text-[9px] bg-primary text-white px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter">AI</span>
                        )}
                        <span className="text-[10px] text-slate-400">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                        {c.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Comment Input */}
              <div className="flex gap-3 pt-4">
                <input 
                  value={comment} 
                  onChange={e => setComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && comment.trim() && addComment.mutate()}
                  placeholder="Share your thoughts..." 
                  className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border-transparent focus:bg-white dark:focus:bg-slate-900 border focus:border-primary rounded-xl text-sm transition-all" 
                />
                <button 
                  onClick={() => addComment.mutate()} 
                  disabled={!comment.trim() || addComment.isPending}
                  className="bg-primary text-white p-2.5 rounded-xl hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
