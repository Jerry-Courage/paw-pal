'use client'

import { useQuery } from '@tanstack/react-query'
import { communityApi } from '@/lib/api'
import { Plus, Loader2 } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import StoryViewer from './StoryViewer'
import StoryUploader from './StoryUploader'
import { cn } from '@/lib/utils'

export default function StoriesBar() {
  const { data: session } = useSession()
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [showUploader, setShowUploader] = useState(false)

  const { data: stories, isLoading } = useQuery({
    queryKey: ['stories'],
    queryFn: () => communityApi.getStories().then(r => r.data),
    refetchInterval: 60000,
  })

  // Handle paginated or direct array response
  const storiesList = Array.isArray(stories) ? stories : (stories as any)?.results || []

  // Group stories by author
  const storiesByUser = storiesList.reduce((acc: any, story: any) => {
    const userId = story.author.username
    if (!acc[userId]) acc[userId] = []
    acc[userId].push(story)
    return acc
  }, {})

  const usersWithStories = Object.keys(storiesByUser)

  return (
    <div className="relative mb-8">
      <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide py-2 px-1">
        {/* Your Story Button */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <button 
            onClick={() => setShowUploader(true)}
            className="group relative w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary transition-all active:scale-95 overflow-hidden"
          >
            {session?.user?.image ? (
              <img src={session.user.image} alt="Me" className="w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-opacity" />
            ) : (
              <span className="text-xl font-black text-slate-400">{getInitials(session?.user?.name || 'Me')}</span>
            )}
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <Plus className="w-6 h-6 text-white" />
            </div>
          </button>
          <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400">Your Story</span>
        </div>

        {/* Other Users' Stories */}
        {isLoading ? (
          <div className="flex gap-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : (
          usersWithStories.map((username) => {
            const userStories = storiesByUser[username]
            const author = userStories[0].author
            return (
              <motion.div 
                key={username}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-2 flex-shrink-0"
              >
                <button 
                  onClick={() => setSelectedUser(username)}
                  className="relative p-[3px] rounded-full bg-gradient-to-tr from-amber-400 via-fuchsia-500 to-primary active:scale-95 transition-transform"
                >
                  <div className="w-14 h-14 rounded-full bg-white dark:bg-slate-900 p-[2px]">
                    <div className="w-full h-full rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                      {author.avatar ? (
                        <img src={author.avatar} alt={username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg font-black text-slate-400">{getInitials(author.full_name || username)}</span>
                      )}
                    </div>
                  </div>
                </button>
                <span className="text-[10px] font-black uppercase tracking-tighter text-slate-900 dark:text-white truncate max-w-[64px]">
                  {author.full_name?.split(' ')[0] || username}
                </span>
              </motion.div>
            )
          })
        )}
      </div>

      {/* Overlays */}
      {selectedUser && (
        <StoryViewer 
          username={selectedUser} 
          stories={storiesByUser[selectedUser]} 
          onClose={() => setSelectedUser(null)} 
        />
      )}

      {showUploader && (
        <StoryUploader 
          onClose={() => setShowUploader(false)} 
        />
      )}
    </div>
  )
}
