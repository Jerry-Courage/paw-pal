'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { communityApi } from '@/lib/api'
import { Send, Loader2, Hash, Link as LinkIcon, X, Image as ImageIcon, Video, Paperclip } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { POST_TYPES } from './constants'
import { AnimatePresence, motion } from 'framer-motion'

export default function CreatePost({ session, resources }: { session: any; resources: any[] }) {
  const [expandCompose, setExpandCompose] = useState(false)
  const [postType, setPostType] = useState('general')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [resourceId, setResourceId] = useState('')
  const qc = useQueryClient()

  const createPost = useMutation({
    mutationFn: () => communityApi.createPost({
      content,
      post_type: postType,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      resource: resourceId || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts'] })
      setContent(''); setTags(''); setResourceId(''); setExpandCompose(false)
      toast.success('Your thought is now in the Nexus!')
    },
  })

  const initials = getInitials(session?.user?.name || 'Me')

  return (
    <div className="bg-[#1a1a1a] rounded-2xl mb-4 overflow-hidden p-4">
      <div className="flex gap-3">
        <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center text-orange-400 text-sm font-black shrink-0">
          {initials}
        </div>
        <div className="flex-1">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onFocus={() => setExpandCompose(true)}
            placeholder="Share an insight or ask a question..."
            className="w-full text-sm font-medium resize-none border-0 outline-none bg-transparent placeholder-slate-600 text-white pt-2 min-h-[44px]"
            rows={expandCompose ? 4 : 1}
          />

          <AnimatePresence>
            {expandCompose && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-4 pt-4 border-t border-white/5">
                  {/* Post type grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {POST_TYPES.map(pt => (
                      <button key={pt.id} onClick={() => setPostType(pt.id)}
                        className={cn(
                          'flex flex-col items-center justify-center gap-1 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border',
                          postType === pt.id
                            ? 'bg-orange-500/10 text-orange-400 border-orange-500/30 scale-105'
                            : 'bg-white/3 border-white/8 text-slate-500 hover:bg-white/5 hover:text-slate-300'
                        )}>
                        <span className="text-lg">{pt.icon}</span>
                        {pt.label}
                      </button>
                    ))}
                  </div>

                  {/* Tags + resource */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                      <input value={tags} onChange={e => setTags(e.target.value)}
                        placeholder="Tags (math, study, tips)"
                        className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/8 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/30 transition-all" />
                    </div>
                    {postType === 'resource' && (
                      <div className="relative">
                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                        <select value={resourceId} onChange={e => setResourceId(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/8 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500/30 transition-all appearance-none">
                          <option value="" className="bg-[#1a1a1a]">Link a Library Resource</option>
                          {resources.map((r: any) => <option key={r.id} value={r.id} className="bg-[#1a1a1a]">{r.title}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-1">
                      <button className="p-2 text-slate-600 hover:text-orange-400 hover:bg-orange-500/10 rounded-xl transition-all"><ImageIcon className="w-4 h-4" /></button>
                      <button className="p-2 text-slate-600 hover:text-orange-400 hover:bg-orange-500/10 rounded-xl transition-all"><Video className="w-4 h-4" /></button>
                      <button className="p-2 text-slate-600 hover:text-orange-400 hover:bg-orange-500/10 rounded-xl transition-all"><Paperclip className="w-4 h-4" /></button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setExpandCompose(false)} className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
                        <X className="w-3.5 h-3.5" /> Discard
                      </button>
                      <button onClick={() => createPost.mutate()} disabled={!content.trim() || createPost.isPending}
                        className="btn-primary text-xs px-5 py-2.5">
                        {createPost.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Publish
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
