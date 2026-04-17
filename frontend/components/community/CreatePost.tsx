'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { communityApi } from '@/lib/api'
import { 
  Send, Loader2, Sparkles, Hash, Link as LinkIcon, 
  X, Image as ImageIcon, Video, Paperclip
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { POST_TYPES } from './constants'
import { motion, AnimatePresence } from 'framer-motion'

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
      setContent('')
      setTags('')
      setResourceId('')
      setExpandCompose(false)
      toast.success('Your thought is now in the Nexus!')
    },
  })

  const initials = getInitials(session?.user?.name || 'Me')

  return (
    <div className="glass-card mb-6 overflow-hidden border-slate-200/60 dark:border-white/5 p-4">
      <div className="flex gap-4">
        <div className="w-11 h-11 bg-primary/10 rounded-2xl flex items-center justify-center text-primary text-sm font-bold flex-shrink-0 shadow-inner">
          {initials}
        </div>
        <div className="flex-1">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onFocus={() => setExpandCompose(true)}
            placeholder="Share an insight or ask a question..."
            className="w-full text-base font-medium resize-none border-0 outline-none bg-transparent placeholder-slate-400 dark:placeholder-slate-500 pt-2 min-h-[44px]"
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
                <div className="mt-4 space-y-4 pt-4 border-t border-slate-100 dark:border-white/5">
                  {/* Post Types Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {POST_TYPES.map(pt => (
                      <button 
                        key={pt.id} 
                        onClick={() => setPostType(pt.id)}
                        className={cn(
                          'flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2',
                          postType === pt.id 
                            ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-105' 
                            : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                        )}
                      >
                        <span className="text-xl">{pt.icon}</span>
                        {pt.label}
                      </button>
                    ))}
                  </div>

                  {/* Input Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative group">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                      <input 
                        value={tags} 
                        onChange={e => setTags(e.target.value)}
                        placeholder="Tags (math, study, tips)"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-transparent focus:bg-white dark:focus:bg-slate-900 border focus:border-primary rounded-xl text-xs transition-all" 
                      />
                    </div>
                    
                    {postType === 'resource' && (
                      <div className="relative group animate-in slide-in-from-left-2 duration-300">
                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                        <select 
                          value={resourceId} 
                          onChange={e => setResourceId(e.target.value)} 
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-transparent focus:bg-white dark:focus:bg-slate-900 border focus:border-primary rounded-xl text-xs transition-all appearance-none outline-none"
                        >
                          <option value="">Link a Library Resource</option>
                          {resources.map((r: any) => <option key={r.id} value={r.id}>{r.title}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Attachment Shortcuts */}
                  <div className="flex items-center gap-2">
                    <button className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"><ImageIcon className="w-5 h-5" /></button>
                    <button className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"><Video className="w-5 h-5" /></button>
                    <button className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"><Paperclip className="w-5 h-5" /></button>
                  </div>

                  {/* Submit Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <button 
                      onClick={() => setExpandCompose(false)} 
                      className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex items-center gap-2"
                    >
                      <X className="w-4 h-4" /> Discard
                    </button>
                    <button 
                      onClick={() => createPost.mutate()} 
                      disabled={!content.trim() || createPost.isPending}
                      className="bg-primary hover:opacity-90 text-white text-sm font-black uppercase tracking-widest px-6 py-3 rounded-2xl shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      {createPost.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Publish
                    </button>
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
