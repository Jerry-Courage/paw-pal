'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, groupsApi } from '@/lib/api'
import { Search, BookOpen, Users, X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const { data: resourcesData, isFetching: loadingR } = useQuery({
    queryKey: ['search-resources', query],
    queryFn: () => libraryApi.getResources().then(r => r.data),
    enabled: query.length > 1,
  })

  const { data: groupsData, isFetching: loadingG } = useQuery({
    queryKey: ['search-groups', query],
    queryFn: () => groupsApi.getGroups('all').then(r => r.data),
    enabled: query.length > 1,
  })

  const loading = loadingR || loadingG

  const resources = (resourcesData?.results || []).filter((r: any) =>
    r.title.toLowerCase().includes(query.toLowerCase()) ||
    r.subject?.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 4)

  const groups = (groupsData?.results || []).filter((g: any) =>
    g.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 3)

  const hasResults = resources.length > 0 || groups.length > 0

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const navigate = (path: string) => {
    router.push(path)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative w-56 lg:w-72">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search..."
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-white/5 border border-white/8 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/30 transition-all"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && query.length > 1 && (
        <div className="absolute top-full mt-2 w-full bg-[#1a1a1a] border border-white/8 rounded-xl shadow-2xl z-50 overflow-hidden">
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...
            </div>
          )}

          {!loading && !hasResults && (
            <div className="px-4 py-5 text-center text-xs text-slate-600">
              No results for "{query}"
            </div>
          )}

          {resources.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-black text-slate-600 uppercase tracking-widest bg-white/3">Resources</div>
              {resources.map((r: any) => (
                <button key={r.id} onClick={() => navigate(`/library/${r.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left">
                  <div className="w-7 h-7 bg-white/5 rounded-lg flex items-center justify-center text-xs shrink-0">
                    {r.resource_type === 'pdf' ? '📄' : r.resource_type === 'video' ? '🎥' : '💻'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white truncate">{r.title}</div>
                    <div className="text-[10px] text-slate-600">{r.subject} · {r.resource_type}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {groups.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-black text-slate-600 uppercase tracking-widest bg-white/3">Groups</div>
              {groups.map((g: any) => (
                <button key={g.id} onClick={() => navigate(`/groups/${g.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left">
                  <div className="w-7 h-7 bg-emerald-500/10 rounded-lg flex items-center justify-center text-xs font-black text-emerald-400 shrink-0">
                    {g.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white truncate">{g.name}</div>
                    <div className="text-[10px] text-slate-600">{g.member_count} members</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-white/5">
            <button onClick={() => navigate(`/ai?q=${encodeURIComponent(query)}`)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-500/5 transition-colors text-left">
              <div className="w-7 h-7 bg-orange-500/10 rounded-lg flex items-center justify-center shrink-0">
                <Search className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-orange-400">Ask FlowAI: "{query}"</div>
                <div className="text-[10px] text-slate-600">Get an instant AI answer</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
