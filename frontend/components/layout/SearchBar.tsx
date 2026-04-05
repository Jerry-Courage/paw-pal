'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { libraryApi, groupsApi, communityApi } from '@/lib/api'
import { Search, BookOpen, Users, FileText, X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const { data: resourcesData, isFetching: loadingR } = useQuery({
    queryKey: ['search-resources', query],
    queryFn: () => libraryApi.getResources().then((r) => r.data),
    enabled: query.length > 1,
  })

  const { data: groupsData, isFetching: loadingG } = useQuery({
    queryKey: ['search-groups', query],
    queryFn: () => groupsApi.getGroups('all').then((r) => r.data),
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
    <div ref={ref} className="relative flex-1 max-w-lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search resources, groups, or AI help..."
          className="w-full pl-9 pr-8 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-gray-100 dark:placeholder-gray-500"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && query.length > 1 && (
        <div className="absolute top-full mt-2 w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-xl z-50 overflow-hidden">
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching...
            </div>
          )}

          {!loading && !hasResults && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No results for "{query}"
            </div>
          )}

          {resources.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-gray-400 dark:text-gray-600 bg-gray-50 dark:bg-gray-950">RESOURCES</div>
              {resources.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/library/${r.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-sky-50 dark:bg-sky-950 rounded-lg flex items-center justify-center text-sm flex-shrink-0">
                    {r.resource_type === 'pdf' ? '📄' : r.resource_type === 'video' ? '🎥' : '💻'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{r.title}</div>
                    <div className="text-xs text-gray-400">{r.subject} · {r.resource_type}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {groups.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-gray-400 dark:text-gray-600 bg-gray-50 dark:bg-gray-950">GROUPS</div>
              {groups.map((g: any) => (
                <button
                  key={g.id}
                  onClick={() => navigate(`/groups/${g.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-950 rounded-lg flex items-center justify-center text-sm font-bold text-emerald-500 flex-shrink-0">
                    {g.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{g.name}</div>
                    <div className="text-xs text-gray-400">{g.member_count} members</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Ask AI option */}
          <div className="border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => navigate(`/ai?q=${encodeURIComponent(query)}`)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors text-left"
            >
              <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Search className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-medium text-sky-600 dark:text-sky-400">Ask FlowAI: "{query}"</div>
                <div className="text-xs text-gray-400">Get an instant AI answer</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
