'use client'

import { cn } from '@/lib/utils'

interface Props {
  data: string
}

const SECTION_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  'overview':  { icon: '📋', color: 'text-sky-600 dark:text-sky-400',     bg: 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800' },
  'key concept': { icon: '🧠', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/50 border-violet-200 dark:border-violet-800' },
  'important': { icon: '📌', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800' },
  'summary':   { icon: '✨', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800' },
  'exam tip':  { icon: '🎯', color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800' },
  'definition':{ icon: '📖', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800' },
}

function getStyle(title: string) {
  const lower = title.toLowerCase()
  for (const [key, val] of Object.entries(SECTION_ICONS)) {
    if (lower.includes(key)) return val
  }
  return { icon: '📝', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700' }
}

export default function RichNotesRenderer({ data }: Props) {
  if (!data) return null

  const lines = data.split('\n')
  const sections: { type: string; content: string; items: string[] }[] = []
  let current: { type: string; content: string; items: string[] } | null = null

  const cleanse = (text: string) => {
    if (!text) return ''
    return text.replace(/ACTION:\s*\{.*?\}/gi, '').trim()
  }

  const flush = () => { if (current) { sections.push(current); current = null } }

  for (const line of lines) {
    const t = line.trim()
    if (!t) { flush(); continue }

    if (t.startsWith('# '))       { flush(); current = { type: 'h1', content: t.slice(2), items: [] } }
    else if (t.startsWith('## ')) { flush(); current = { type: 'h2', content: t.slice(3), items: [] } }
    else if (t.startsWith('### ')){ flush(); current = { type: 'h3', content: t.slice(4), items: [] } }
    else if (t.startsWith('- ') || t.startsWith('* ')) {
      if (!current || current.type !== 'list') { flush(); current = { type: 'list', content: '', items: [] } }
      current.items.push(t.slice(2))
    } else if (/^\d+\.\s/.test(t)) {
      if (!current || current.type !== 'olist') { flush(); current = { type: 'olist', content: '', items: [] } }
      current.items.push(t.replace(/^\d+\.\s/, ''))
    } else if (t.startsWith('> ')) {
      flush(); current = { type: 'quote', content: t.slice(2), items: [] }
    } else if (t.startsWith('**') && t.endsWith('**') && t.length > 4) {
      flush(); current = { type: 'bold', content: t.slice(2, -2), items: [] }
    } else {
      if (!current || current.type !== 'p') { flush(); current = { type: 'p', content: '', items: [] } }
      current.content += (current.content ? ' ' : '') + t
    }
  }
  flush()

  return (
    <div className="space-y-3">
      {sections.map((s, i) => {
        if (s.type === 'h1') return (
          <div key={i} className="text-center py-1">
            <h1 className="text-base font-bold text-gray-900 dark:text-white">{cleanse(s.content)}</h1>
          </div>
        )

        if (s.type === 'h2') {
          const style = getStyle(s.content)
          return (
            <div key={i} className={cn('rounded-xl border px-3 py-2.5 mt-2', style.bg)}>
              <div className={cn('flex items-center gap-2 font-bold text-sm', style.color)}>
                <span>{style.icon}</span>{cleanse(s.content)}
              </div>
            </div>
          )
        }

        if (s.type === 'h3') return (
          <div key={i} className="flex items-center gap-2 mt-1">
            <div className="w-1 h-4 bg-sky-400 rounded-full flex-shrink-0" />
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{cleanse(s.content)}</h3>
          </div>
        )

        if (s.type === 'list' && s.items.length > 0) return (
          <ul key={i} className="space-y-1.5 pl-1">
            {s.items.map((item, j) => (
              <li key={j} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-sky-400 mt-1 flex-shrink-0 text-xs">●</span>
                <span className="leading-relaxed">{cleanse(item)}</span>
              </li>
            ))}
          </ul>
        )

        if (s.type === 'olist' && s.items.length > 0) return (
          <ol key={i} className="space-y-1.5 pl-1">
            {s.items.map((item, j) => (
              <li key={j} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-sky-500 font-bold flex-shrink-0 text-xs mt-0.5">{j + 1}.</span>
                <span className="leading-relaxed">{cleanse(item)}</span>
              </li>
            ))}
          </ol>
        )

        if (s.type === 'quote') return (
          <div key={i} className="border-l-4 border-sky-400 pl-3 py-1">
            <p className="text-sm text-gray-600 dark:text-gray-400 italic leading-relaxed">{cleanse(s.content)}</p>
          </div>
        )

        if (s.type === 'bold') return (
          <div key={i} className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">💡 {cleanse(s.content)}</p>
          </div>
        )

        if (s.type === 'p' && s.content) return (
          <p key={i} className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{cleanse(s.content)}</p>
        )

        return null
      })}
    </div>
  )
}
