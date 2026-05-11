'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { communityApi, libraryApi } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Trophy, Calendar, 
  LayoutGrid, Filter, Search, Plus, Loader2, Zap } from 'lucide-react'

// Modular Components
import CommunityHeader from '@/components/community/CommunityHeader'
import CreatePost from '@/components/community/CreatePost'
import PostCard from '@/components/community/PostCard'
import EventsSection from '@/components/community/EventsSection'
import LeaderboardSection from '@/components/community/LeaderboardSection'
import CommunitySidebar from '@/components/community/CommunitySidebar'
import StoriesBar from '@/components/community/StoriesBar'
import { POST_TYPES, TABS } from '@/components/community/constants'

const TAB_ICONS: Record<string, any> = { feed:
  leaderboard: Trophy,
  events: Calendar, Zap }

export default function CommunityPage() {
  const [tab, setTab] = useState('feed')
  const [filterType, setFilterType] = useState('')
  const { data: session } = useSession()
  const qc = useQueryClient()

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['posts', filterType],
    queryFn: () => communityApi.getPosts(filterType || undefined).then(r => r.data),
    refetchInterval: 30000,
    enabled: tab === 'feed',
  })

  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })

  const posts: any[] = postsData?.results || []
  const resources: any[] = resourcesData?.results || []

  const likePost = useMutation({
    mutationFn: (id: number) => communityApi.likePost(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  })

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <CommunityHeader />

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Sidebar - Navigation & Quick Links (Desktop) */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="sticky top-16 space-y-6">
            <nav id="tour-community-tabs" className="bg-[#1a1a1a] rounded-2xl p-3">
              <div className="space-y-1">
                {TABS.map(t => {
                  const Icon = TAB_ICONS[t.id]
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black transition-all group',
                        tab === t.id 
                          ? 'bg-orange-500/10 text-orange-400' 
                          : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                      )}
                    >
                      <Icon className={cn('w-5 h-5 transition-transform group-hover:scale-110', tab === t.id ? 'text-white' : 'text-slate-400')} />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </nav>
          </div>
        </aside>

        {/* Mobile Navigation - Horizontal Scroll */}
        <div className="lg:hidden -mx-4 px-4 mb-6 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 min-w-max">
            {TABS.map(t => {
              const Icon = TAB_ICONS[t.id]
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all',
                    tab === t.id 
                      ? 'bg-orange-500/10 text-orange-400' 
                      : 'bg-white/3 text-slate-500 hover:text-slate-300'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {tab === 'feed' && (
              <motion.div 
                key="feed"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                id="tour-community-feed" 
                className="space-y-6"
              >
                {/* Nexus Stories */}
                <StoriesBar />

                <CreatePost session={session} resources={resources} />

                {/* Feed Filters */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
                    <button 
                      onClick={() => setFilterType('')}
                      className={cn(
                        'flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2',
                        filterType === '' 
                          ? 'bg-white text-black border-white' 
                          : 'border-white/8 text-slate-500 hover:border-white/20 hover:text-white'
                      )}
                    >
                      All Pulse
                    </button>
                    {POST_TYPES.map(pt => (
                      <button 
                        key={pt.id} 
                        onClick={() => setFilterType(pt.id)}
                        className={cn(
                          'flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 flex items-center gap-2',
                          filterType === pt.id 
                            ? 'bg-primary border-primary text-white' 
                            : 'border-slate-100 dark:border-slate-800 text-slate-500 hover:border-primary/30'
                        )}
                      >
                        <span>{pt.icon}</span>
                        {pt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Posts Feed */}
                <div className="space-y-4">
                  {postsLoading ? (
                    [1,2,3].map(i => <div key={i} className="bg-[#1a1a1a] rounded-2xl p-20 animate-pulse" />)
                  ) : posts.length === 0 ? (
                    <div className="bg-[#1a1a1a] border border-dashed border-white/8 rounded-2xl p-20 text-center">
                       <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6">
                        <Zap className="w-10 h-10 text-slate-700" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Feed is Quiet</h3>
                      <p className="text-sm text-slate-500 font-medium">Be the one to spark a conversation in the Nexus.</p>
                    </div>
                  ) : (
                    posts.map((post: any) => (
                      <PostCard key={post.id} post={post} onLike={() => likePost.mutate(post.id)} />
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {tab === 'leaderboard' && (
              <motion.div 
                key="leaderboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <LeaderboardSection />
              </motion.div>
            )}

            {tab === 'events' && (
              <motion.div 
                key="events"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <EventsSection />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Right Sidebar - Widgets (Desktop) */}
        <aside className="hidden xl:block w-80 flex-shrink-0">
          <div className="sticky top-16">
            <CommunitySidebar posts={posts} />
          </div>
        </aside>
      </div>
    </div>
  )
}
