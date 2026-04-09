'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import { 
  Sparkles, Phone, BookOpen, Clock, 
  ChevronRight, Search, LayoutGrid, 
  Loader2, Radio, Headphones, Mic2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import StudyCall from '@/components/library/StudyCall'
import Image from 'next/image'

export default function TutorCallPage() {
  const [selectedResource, setSelectedResource] = useState<any>(null)
  const [search, setSearch] = useState('')

  const { data: resources, isLoading } = useQuery({
    queryKey: ['resources-for-tutor'],
    queryFn: () => libraryApi.getResources().then(res => res.data)
  })

  const filteredResources = (resources as any)?.results?.filter((r: any) => 
    r.title.toLowerCase().includes(search.toLowerCase())
  ) || []

  if (selectedResource) {
    return (
      <StudyCall
        resourceId={selectedResource.id}
        resourceTitle={selectedResource.title}
        notes={selectedResource.ai_notes_json}
        onClose={() => setSelectedResource(null)}
      />
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950/50 scrollbar-hide overflow-y-auto pb-24">
      
      {/* Premium Hero Section */}
      <div className="relative h-[300px] sm:h-[400px] w-full bg-slate-900 overflow-hidden flex flex-col items-center justify-center text-center p-6 sm:p-12">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(#ffffff10_1px,transparent_1px)] [background-size:32px_32px]" />
        </div>

        <div className="relative z-10 space-y-6 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-[10px] font-black text-primary uppercase tracking-[0.2em]">
            <Radio className="w-3 h-3" /> Immersive Learning
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tighter uppercase leading-[0.9]">
            Talk to <span className="text-primary italic">a Tutor</span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base font-medium leading-relaxed max-w-lg mx-auto">
            Choose a study kit and jump into a hands-free, Socratic dialogue with FlowAI. Master complex concepts through natural conversation.
          </p>
        </div>
      </div>

      {/* Main Selection UI */}
      <div className="max-w-7xl mx-auto w-full px-6 -mt-12 relative z-20">
        
        {/* Search & Filter Bar */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-white/5 flex flex-col sm:flex-row items-center gap-3 backdrop-blur-3xl">
          <div className="flex-1 relative w-full">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text"
              placeholder="Search your Study Kits..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border-0 rounded-[1.8rem] pl-14 pr-6 py-4 text-sm font-medium focus:ring-4 ring-primary/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 px-6 py-4 bg-slate-50 dark:bg-slate-800 rounded-[1.8rem] text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <LayoutGrid className="w-4 h-4" /> {filteredResources?.length || 0} Resources
          </div>
        </div>

        {/* Resources Grid */}
        <div className="mt-12">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accessing Library Matrix...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredResources?.map((resource: any) => (
                <button
                  key={resource.id}
                  onClick={() => setSelectedResource(resource)}
                  className="group relative flex flex-col bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-xl hover:shadow-2xl hover:border-primary/30 transition-all text-left overflow-hidden active:scale-95 duration-500"
                >
                  <div className="h-40 sm:h-48 w-full bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                    {resource.thumbnail ? (
                      <Image src={resource.thumbnail} alt={resource.title} fill className="object-cover group-hover:scale-110 transition-transform duration-700" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-500/10 to-violet-500/10">
                        <BookOpen className="w-12 h-12 text-primary opacity-20" />
                      </div>
                    )}
                    <div className="absolute top-4 left-4">
                       <div className="px-3 py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Study Kit
                       </div>
                    </div>
                  </div>

                  <div className="p-6 sm:p-8 space-y-4">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight group-hover:text-primary transition-colors line-clamp-2">
                        {resource.title}
                    </h3>
                    <div className="flex items-center gap-6">
                       <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                          <Clock className="w-4 h-4" /> 
                          {resource.reading_time || '15 min'}
                       </div>
                       <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                          <HeaderIcon type={resource.resource_type} />
                          {resource.resource_type}
                       </div>
                    </div>

                    <div className="pt-4 flex items-center justify-between border-t border-slate-50 dark:border-white/5">
                       <span className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                          Start Session <ChevronRight className="w-4 h-4" />
                       </span>
                       <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-lg shadow-primary/20">
                          <Phone className="w-5 h-5" />
                       </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!isLoading && filteredResources?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
               <div className="p-8 bg-slate-100 dark:bg-slate-800 rounded-[3rem]">
                  <Search className="w-12 h-12 text-slate-300" />
               </div>
               <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">No Knowledge Matched</h3>
                  <p className="text-slate-500 mt-2">Try searching for a different topic or upload new materials.</p>
               </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

function HeaderIcon({ type }: { type: string }) {
  if (type === 'pdf') return <BookOpen className="w-4 h-4" />
  if (type === 'video') return <Radio className="w-4 h-4" />
  return <Sparkles className="w-4 h-4" />
}
