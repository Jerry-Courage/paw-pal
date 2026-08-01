'use client'

import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assignmentsApi, libraryApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export default function NewAssignmentPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [wordCount, setWordCount] = useState(500)
  const [files, setFiles] = useState<File[]>([])
  const [selectedResources, setSelectedResources] = useState<number[]>([])

  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })
  const resources = resourcesData?.results || []

  const createMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('title', title)
      fd.append('subject', subject)
      fd.append('instructions', instructions)
      if (dueDate) fd.append('due_date', dueDate)
      if (files[0]) fd.append('file', files[0])
      const res = await assignmentsApi.create(fd)
      // Link resources
      for (const rid of selectedResources) {
        try { await assignmentsApi.update(res.data.id, { resources: [...selectedResources] }) } catch {}
      }
      return res
    },
    onSuccess: (res) => {
      toast.success('Assignment created! AI is generating your draft…')
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      assignmentsApi.solve(res.data.id).catch(() => {})
      router.push(`/assignments/${res.data.id}`)
    },
    onError: () => toast.error('Failed to create assignment.'),
  })

  const aiReadiness = Math.min(100, (title ? 30 : 0) + (subject ? 20 : 0) + (instructions.length > 50 ? 50 : instructions.length))

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-6xl mx-auto">

      <div className="flex items-center gap-base mb-stack-lg">
        <Link href="/assignments" className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span className="material-symbols-outlined text-[22px]">arrow_back</span>
        </Link>
        <div>
          <h1 className="text-[28px] font-bold text-primary flex items-center gap-base">
            <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            Plan Your Mission
          </h1>
          <p className="text-on-surface-variant text-[15px] mt-1">Tell me what we&apos;re working on, and I&apos;ll help you build an amazing outline!</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-gutter">
        {/* Form */}
        <div className="flex-1 space-y-stack-md">
          {/* Title + Subject */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md">
            <div className="space-y-base">
              <label className="text-[13px] font-bold text-on-surface pl-2">Assignment Title *</label>
              <div className="input-glow bg-surface-container rounded-[1rem] border-2 border-outline-variant p-1 transition-all">
                <input
                  className="w-full bg-transparent border-none focus:ring-0 text-[16px] p-stack-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none"
                  placeholder="e.g. The Life of Honeybees"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-base">
              <label className="text-[13px] font-bold text-on-surface pl-2">Subject</label>
              <div className="input-glow bg-surface-container rounded-[1rem] border-2 border-outline-variant p-1 transition-all">
                <select
                  className="w-full bg-transparent border-none focus:ring-0 text-[16px] p-stack-sm text-on-surface appearance-none outline-none"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                >
                  <option value="">Select subject…</option>
                  <option>Science &amp; Nature</option>
                  <option>Mathematics</option>
                  <option>History</option>
                  <option>English Literature</option>
                  <option>Geography</option>
                  <option>Computer Science</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-base">
            <label className="text-[13px] font-bold text-on-surface pl-2">What is it about? *</label>
            <div className="input-glow bg-surface-container rounded-[1rem] border-2 border-outline-variant p-1 transition-all">
              <textarea
                className="w-full bg-transparent border-none focus:ring-0 text-[16px] p-stack-sm text-on-surface placeholder:text-on-surface-variant/40 resize-none outline-none"
                placeholder="Describe your topic here… the more details you give, the better your outline will be!"
                rows={5}
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
              />
            </div>
          </div>

          {/* Word Count + Due Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md">
            <div className="bg-surface-container rounded-[1rem] border-2 border-outline-variant p-stack-md space-y-stack-sm">
              <div className="flex justify-between items-center">
                <label className="text-[13px] font-bold text-on-surface">Target Word Count</label>
                <span className="font-bold text-primary text-[14px]">{wordCount} words</span>
              </div>
              <input
                type="range" min={100} max={2000} step={50} value={wordCount}
                onChange={e => setWordCount(Number(e.target.value))}
                className="w-full h-3 bg-surface-container-highest rounded-[1rem] appearance-none cursor-pointer accent-primary-container"
              />
              <div className="flex justify-between text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">
                <span>Short</span><span>Detailed</span>
              </div>
            </div>
            <div className="space-y-base">
              <label className="text-[13px] font-bold text-on-surface pl-2">Due Date</label>
              <div className="input-glow bg-surface-container rounded-[1rem] border-2 border-outline-variant p-1 transition-all h-[100px] flex items-center">
                <input
                  type="date"
                  className="w-full bg-transparent border-none focus:ring-0 text-[16px] p-stack-sm text-on-surface outline-none"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* File attachment */}
          <div className="space-y-base">
            <label className="text-[13px] font-bold text-on-surface pl-2">Add Sources (PDFs or Images)</label>
            <div
              className="border-2 border-dashed border-outline-variant rounded-[1.5rem] p-stack-lg bg-surface-container-low hover:bg-surface-container-high transition-colors flex flex-col items-center justify-center gap-base cursor-pointer group"
              onClick={() => fileRef.current?.click()}
            >
              <div className="w-16 h-16 rounded-full bg-primary-container/10 flex items-center justify-center text-primary-container group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-[32px]">cloud_upload</span>
              </div>
              <p className="text-[15px] text-on-surface-variant text-center">Drag files here or <span className="text-primary font-bold">click to browse</span></p>
              <p className="text-[12px] text-on-surface-variant/60">Maximum size: 25MB per file</p>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-base mt-2">
                  {files.map((f, i) => (
                    <span key={i} className="bg-primary/10 text-primary text-[12px] px-3 py-1 rounded-full font-bold">{f.name}</span>
                  ))}
                </div>
              )}
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" multiple onChange={e => setFiles(Array.from(e.target.files || []))} />
            </div>
          </div>

          {/* Library resources */}
          {resources.length > 0 && (
            <div className="space-y-base">
              <label className="text-[13px] font-bold text-on-surface pl-2">Link Library Resources (optional)</label>
              <div className="flex flex-wrap gap-base">
                {resources.slice(0, 8).map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedResources(prev => prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id])}
                    className={cn('text-[13px] px-3 py-1.5 rounded-full border transition-all font-medium', selectedResources.includes(r.id) ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface-variant hover:border-primary/40')}
                  >
                    {r.title.slice(0, 24)}{r.title.length > 24 ? '…' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="pt-stack-md">
            <button
              onClick={() => { if (!title.trim()) { toast.error('Title required'); return } if (!instructions.trim()) { toast.error('Instructions required'); return } createMutation.mutate() }}
              disabled={createMutation.isPending}
              className="w-full py-stack-md bg-primary-container text-on-primary-container rounded-[1rem] text-[20px] font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-base btn-squishy hover:brightness-110 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              {createMutation.isPending ? 'Creating…' : 'Generate with AI'}
            </button>
            <p className="text-center text-on-surface-variant/60 mt-stack-sm text-[13px]">FlowState AI helps you organize thoughts, not write the whole thing!</p>
          </div>
        </div>

        {/* Live Blueprint sidebar */}
        <aside className="w-full lg:w-[380px] shrink-0">
          <div className="glass-panel rounded-[1.5rem] border-2 border-outline-variant sticky top-8 overflow-hidden shadow-2xl">
            <div className="h-16 bg-gradient-to-r from-primary-container/20 to-surface-container flex items-end p-stack-md">
              <h3 className="text-[16px] font-bold text-primary flex items-center gap-base">
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>visibility</span>
                Live Blueprint
              </h3>
            </div>
            <div className="p-stack-md space-y-stack-md">
              {/* Progress */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[13px] font-bold text-on-surface-variant">AI Readiness</span>
                  <span className={cn('text-[13px] font-bold', aiReadiness >= 80 ? 'text-primary' : 'text-on-surface-variant')}>
                    {aiReadiness >= 80 ? 'Ready to launch!' : 'Awaiting input…'}
                  </span>
                </div>
                <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${aiReadiness}%` }} />
                </div>
              </div>

              {/* Preview items */}
              <div className="space-y-stack-sm">
                {title ? (
                  <div className="bg-surface-container rounded-[1rem] p-stack-sm border border-outline-variant flex gap-stack-sm items-start">
                    <span className="material-symbols-outlined text-primary-container text-[20px]">article</span>
                    <div className="space-y-1 flex-1">
                      <p className="text-[14px] font-bold text-on-surface">{title}</p>
                      {subject && <p className="text-[12px] text-on-surface-variant">{subject}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="bg-surface-container/50 rounded-[1rem] p-stack-sm border border-outline-variant/30 flex gap-stack-sm items-start animate-pulse">
                    <span className="material-symbols-outlined text-on-surface-variant/60">article</span>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-outline-variant/30 rounded w-3/4"></div>
                      <div className="h-3 bg-outline-variant/20 rounded w-1/2"></div>
                    </div>
                  </div>
                )}
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-surface-container/50 rounded-[1rem] p-stack-sm border border-outline-variant/30 flex gap-stack-sm items-start opacity-50">
                    <span className="material-symbols-outlined text-on-surface-variant/60">segment</span>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-outline-variant/30 rounded" style={{ width: `${[83, 66, 50][i]}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[1rem] bg-tertiary-container/10 p-stack-sm border border-tertiary/20">
                <p className="text-[12px] text-tertiary leading-relaxed">
                  <span className="font-bold">Tip:</span> Adding sources helps the AI provide more accurate citations for your work!
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
