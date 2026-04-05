'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { plannerApi, libraryApi, assignmentsApi } from '@/lib/api'
import {
  ChevronLeft, ChevronRight, Plus, Sparkles, Clock, AlertCircle,
  CheckCircle2, Trash2, Pencil, X, BookOpen, Zap, Calendar, Play, FileText
} from 'lucide-react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7) // 7am–9pm

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-sky-100 dark:bg-sky-950 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300',
  active:    'bg-emerald-100 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300',
  completed: 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 line-through',
  skipped:   'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-400',
}

const URGENCY_COLORS: Record<string, string> = {
  high:   'text-red-500 bg-red-50 dark:bg-red-950/30',
  medium: 'text-orange-500 bg-orange-50 dark:bg-orange-950/30',
  low:    'text-sky-500 bg-sky-50 dark:bg-sky-950/30',
}

export default function PlannerPage() {
  const searchParams = useSearchParams()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [showAdd, setShowAdd] = useState(false)
  const [editSession, setEditSession] = useState<any>(null)
  const [selectedSession, setSelectedSession] = useState<any>(null)
  const qc = useQueryClient()

  // Open add modal if coming from dashboard "New Session"
  useEffect(() => {
    if (searchParams.get('new') === '1') setShowAdd(true)
  }, [searchParams])

  const weekEnd = addDays(weekStart, 6)

  const { data: sessionsData } = useQuery({
    queryKey: ['planner-sessions', weekStart.toISOString()],
    queryFn: () => plannerApi.getSessions(weekStart.toISOString(), weekEnd.toISOString()).then(r => r.data),
  })
  const { data: deadlinesData } = useQuery({
    queryKey: ['deadlines'],
    queryFn: () => plannerApi.getDeadlines().then(r => r.data),
  })
  const { data: smartData } = useQuery({
    queryKey: ['smart-schedule'],
    queryFn: () => plannerApi.getSmartSchedule().then(r => r.data),
  })

  const sessions: any[] = sessionsData?.results || []
  const deadlines: any[] = deadlinesData?.results || []
  const suggestions: any[] = smartData?.suggestions || []
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const getSessionsForDay = (day: Date) =>
    sessions.filter((s: any) => isSameDay(new Date(s.start_time), day))

  const deleteMutation = useMutation({
    mutationFn: (id: number) => plannerApi.deleteSession(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner-sessions'] }); setSelectedSession(null); toast.success('Session deleted.') },
  })

  const completeMutation = useMutation({
    mutationFn: (id: number) => plannerApi.completeSession(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['planner-sessions'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
      setSelectedSession(null)
      toast.success(`Session complete! ${res.data.minutes_logged}m logged to your study time.`)
    },
  })

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Study Planner</h1>
          <p className="text-sm text-sky-500 flex items-center gap-1 mt-0.5">
            <Sparkles className="w-3 h-3" /> Plan sessions, track deadlines, let AI suggest your schedule.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl px-2 py-1">
            <button onClick={() => setWeekStart(subWeeks(weekStart, 1))} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium px-1 min-w-[140px] text-center">
              {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
            </span>
            <button onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> New Session
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-3 card overflow-hidden">
          {/* Mobile day strip */}
          <div className="flex lg:hidden overflow-x-auto scrollbar-hide border-b border-gray-100 dark:border-gray-800">
            {days.map(day => (
              <button key={day.toISOString()} onClick={() => setSelectedDay(day)}
                className={cn('flex-shrink-0 flex flex-col items-center px-4 py-3 transition-colors',
                  isSameDay(day, selectedDay) ? 'bg-sky-50 dark:bg-sky-950 text-sky-600' :
                  isSameDay(day, new Date()) ? 'text-sky-500' : 'text-gray-500 dark:text-gray-400')}>
                <span className="text-xs">{format(day, 'EEE')}</span>
                <span className="text-lg font-bold">{format(day, 'd')}</span>
                {getSessionsForDay(day).length > 0 && <div className="w-1.5 h-1.5 bg-sky-500 rounded-full mt-0.5" />}
              </button>
            ))}
          </div>

          {/* Mobile sessions list */}
          <div className="lg:hidden p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-500 mb-3">{format(selectedDay, 'EEEE, MMMM d')}</p>
            {getSessionsForDay(selectedDay).length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No sessions today</p>
                <button onClick={() => setShowAdd(true)} className="btn-primary text-sm mt-3">+ Add Session</button>
              </div>
            ) : getSessionsForDay(selectedDay).map((s: any) => (
              <SessionCard key={s.id} session={s} onClick={() => setSelectedSession(s)} />
            ))}
          </div>

          {/* Desktop week grid */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-8 border-b border-gray-100 dark:border-gray-800">
              <div className="p-3" />
              {days.map(day => (
                <div key={day.toISOString()} className={cn('p-3 text-center border-l border-gray-100 dark:border-gray-800', isSameDay(day, new Date()) && 'bg-sky-50 dark:bg-sky-950/30')}>
                  <div className="text-xs text-gray-400">{format(day, 'EEE')}</div>
                  <div className={cn('text-lg font-bold mt-0.5', isSameDay(day, new Date()) ? 'text-sky-500' : 'text-gray-900 dark:text-white')}>
                    {format(day, 'd')}
                  </div>
                  <div className="text-xs text-gray-400">{getSessionsForDay(day).length > 0 ? `${getSessionsForDay(day).length} session${getSessionsForDay(day).length > 1 ? 's' : ''}` : ''}</div>
                </div>
              ))}
            </div>
            <div className="overflow-y-auto max-h-[520px]">
              {HOURS.map(hour => (
                <div key={hour} className="grid grid-cols-8 border-b border-gray-50 dark:border-gray-800/50 min-h-[64px]">
                  <div className="p-2 text-xs text-gray-400 text-right pr-3 pt-2 flex-shrink-0">{hour}:00</div>
                  {days.map(day => {
                    const daySessions = getSessionsForDay(day).filter((s: any) => new Date(s.start_time).getHours() === hour)
                    return (
                      <div key={day.toISOString()} className="border-l border-gray-50 dark:border-gray-800/50 p-1">
                        {daySessions.map((s: any) => (
                          <button key={s.id} onClick={() => setSelectedSession(s)}
                            className={cn('w-full rounded-lg border p-1.5 text-xs mb-1 text-left transition-all hover:shadow-md', STATUS_COLORS[s.status] || STATUS_COLORS.scheduled, s.is_ai_suggested && 'border-dashed')}>
                            {s.is_ai_suggested && <div className="text-xs opacity-60 mb-0.5 flex items-center gap-0.5"><Sparkles className="w-2 h-2" /> AI</div>}
                            <div className="font-medium truncate">{s.title}</div>
                            <div className="opacity-70 flex items-center gap-1 mt-0.5">
                              <Clock className="w-2 h-2" />{format(new Date(s.start_time), 'HH:mm')}
                              {s.resource_title && <><BookOpen className="w-2 h-2 ml-1" /><span className="truncate">{s.resource_title}</span></>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* AI Suggestions */}
          <div className="card p-4">
            <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" /> AI Suggestions
            </h3>
            <p className="text-xs text-gray-400 mb-3">Based on your deadlines and due flashcards.</p>
            <div className="space-y-2">
              {suggestions.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Add deadlines to get AI suggestions</p>}
              {suggestions.map((s: any, i: number) => (
                <div key={i} className={cn('rounded-xl p-3 text-xs', URGENCY_COLORS[s.urgency] || URGENCY_COLORS.low)}>
                  <div className="font-semibold mb-0.5">{s.title}</div>
                  <div className="opacity-75 mb-1">{s.reason}</div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.duration_minutes}m · {s.suggested_date}</span>
                    <button onClick={() => setShowAdd(true)} className="font-semibold underline">Add →</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deadlines */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Deadlines</h3>
              <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">{deadlines.length}</span>
            </div>
            <div className="space-y-3">
              {deadlines.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No upcoming deadlines</p>}
              {deadlines.slice(0, 5).map((d: any) => (
                <DeadlineRow key={d.id} deadline={d} />
              ))}
            </div>
            <AddDeadlineForm />
          </div>
        </div>
      </div>

      {/* Session detail modal */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
          onEdit={() => { setEditSession(selectedSession); setSelectedSession(null) }}
          onDelete={() => deleteMutation.mutate(selectedSession.id)}
          onComplete={() => completeMutation.mutate(selectedSession.id)}
          completing={completeMutation.isPending}
          deleting={deleteMutation.isPending}
        />
      )}

      {(showAdd || editSession) && (
        <SessionFormModal
          session={editSession}
          onClose={() => { setShowAdd(false); setEditSession(null) }}
        />
      )}
    </div>
  )
}

function SessionCard({ session: s, onClick }: { session: any; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('w-full rounded-xl border p-3 text-left transition-all hover:shadow-md', STATUS_COLORS[s.status] || STATUS_COLORS.scheduled)}>
      {s.is_ai_suggested && <div className="text-xs opacity-60 mb-0.5 flex items-center gap-1"><Sparkles className="w-2.5 h-2.5" /> AI Suggested</div>}
      <div className="font-medium text-sm">{s.title}</div>
      <div className="text-xs opacity-70 flex items-center gap-1 mt-0.5">
        <Clock className="w-3 h-3" />
        {format(new Date(s.start_time), 'HH:mm')} – {format(new Date(s.end_time), 'HH:mm')}
        {s.subject && ` · ${s.subject}`}
      </div>
      {s.resource_title && (
        <div className="text-xs opacity-70 flex items-center gap-1 mt-0.5">
          <BookOpen className="w-3 h-3" /> {s.resource_title}
        </div>
      )}
    </button>
  )
}

function SessionDetailModal({ session: s, onClose, onEdit, onDelete, onComplete, completing, deleting }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className={cn('px-5 pt-5 pb-4', STATUS_COLORS[s.status] || STATUS_COLORS.scheduled)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              {s.is_ai_suggested && <div className="text-xs opacity-70 mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Suggested</div>}
              <h2 className="font-bold text-lg">{s.title}</h2>
              {s.subject && <p className="text-sm opacity-75">{s.subject}</p>}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/10 transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>{format(new Date(s.start_time), 'EEEE, MMM d · HH:mm')} – {format(new Date(s.end_time), 'HH:mm')}</span>
            <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{s.duration_minutes}m</span>
          </div>
          {s.resource_title && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <BookOpen className="w-4 h-4 flex-shrink-0" />
              <span>{s.resource_title}</span>
              <Link href={`/library/${s.resource}`} onClick={onClose}
                className="ml-auto text-xs text-sky-500 hover:underline flex items-center gap-1">
                Open <Play className="w-3 h-3" />
              </Link>
            </div>
          )}
          {s.assignment_title && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{s.assignment_title}</span>
              <Link href="/assignments" onClick={onClose}
                className="ml-auto text-xs text-violet-500 hover:underline flex items-center gap-1 flex-shrink-0">
                View <Play className="w-3 h-3" />
              </Link>
            </div>
          )}          {s.notes && <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">{s.notes}</p>}

          <div className="flex items-center gap-2 pt-2">
            <span className={cn('text-xs px-2 py-1 rounded-full font-medium capitalize', {
              'bg-sky-100 text-sky-600': s.status === 'scheduled',
              'bg-emerald-100 text-emerald-600': s.status === 'active' || s.status === 'completed',
              'bg-orange-100 text-orange-600': s.status === 'skipped',
            })}>{s.status}</span>
          </div>
        </div>
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          {s.status !== 'completed' && (
            <button onClick={onComplete} disabled={completing}
              className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              {completing ? 'Logging...' : 'Mark Complete'}
            </button>
          )}
          {s.resource && s.status !== 'completed' && (
            <Link href={`/library/${s.resource}`} onClick={onClose}
              className="flex-1 btn-secondary flex items-center justify-center gap-2 text-sm">
              <Play className="w-4 h-4" /> Start Studying
            </Link>
          )}
          <button onClick={onEdit} className="p-2.5 btn-secondary"><Pencil className="w-4 h-4" /></button>
          <button onClick={onDelete} disabled={deleting} className="p-2.5 btn-secondary text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SessionFormModal({ session, onClose }: { session?: any; onClose: () => void }) {
  const isEdit = !!session
  const qc = useQueryClient()

  const toLocal = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }

  const [form, setForm] = useState({
    title: session?.title || '',
    subject: session?.subject || '',
    start_time: toLocal(session?.start_time) || '',
    end_time: toLocal(session?.end_time) || '',
    location: session?.location || '',
    notes: session?.notes || '',
    resource: session?.resource || '',
    assignment: session?.assignment || '',
  })

  const { data: resourcesData } = useQuery({
    queryKey: ['resources'],
    queryFn: () => libraryApi.getResources().then(r => r.data),
  })
  const { data: assignmentsData } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.getAll().then(r => r.data),
  })
  const resources: any[] = resourcesData?.results || []
  const assignments: any[] = assignmentsData?.results || []

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // Auto-fill subject from linked assignment
  const handleAssignmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    setForm(f => ({ ...f, assignment: id }))
    if (id) {
      const a = assignments.find((a: any) => String(a.id) === id)
      if (a && !form.subject) setForm(f => ({ ...f, assignment: id, subject: a.subject || f.subject }))
    }
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        resource: form.resource || null,
        assignment: form.assignment || null,
      }
      return isEdit ? plannerApi.updateSession(session.id, payload) : plannerApi.createSession(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner-sessions'] })
      onClose()
      toast.success(isEdit ? 'Session updated.' : 'Session added.')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to save session.'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-bold text-lg">{isEdit ? 'Edit Session' : 'New Study Session'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <input placeholder="Session title *" value={form.title} onChange={set('title')} className="input" />
          <input placeholder="Subject (e.g. Math, Biology)" value={form.subject} onChange={set('subject')} className="input" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Start time *</label>
              <input type="datetime-local" value={form.start_time} onChange={set('start_time')} className="input" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">End time *</label>
              <input type="datetime-local" value={form.end_time} onChange={set('end_time')} className="input" />
            </div>
          </div>
          {assignments.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Link to assignment (optional)</label>
              <select value={form.assignment} onChange={handleAssignmentChange} className="input">
                <option value="">No assignment</option>
                {assignments.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.title}{a.subject ? ` · ${a.subject}` : ''}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Link a resource (optional)</label>
            <select value={form.resource} onChange={set('resource')} className="input">
              <option value="">No resource</option>
              {resources.map((r: any) => (
                <option key={r.id} value={r.id}>{r.title} ({r.resource_type})</option>
              ))}
            </select>
          </div>
          <input placeholder="Location (optional)" value={form.location} onChange={set('location')} className="input" />
          <textarea placeholder="Notes (optional)" value={form.notes} onChange={set('notes')} className="input resize-none" rows={2} />
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.title || !form.start_time || !form.end_time}
            className="btn-primary flex-1">
            {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Session'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeadlineRow({ deadline: d }: { deadline: any }) {
  const qc = useQueryClient()
  const completeMutation = useMutation({
    mutationFn: () => plannerApi.updateDeadline(d.id, { is_completed: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deadlines'] }); toast.success('Deadline marked complete!') },
  })
  const deleteMutation = useMutation({
    mutationFn: () => plannerApi.updateDeadline(d.id, { is_completed: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deadlines'] }),
  })

  return (
    <div className="flex items-start gap-3 group">
      <AlertCircle className={cn('w-4 h-4 mt-0.5 flex-shrink-0', d.days_until <= 2 ? 'text-red-500' : d.days_until <= 5 ? 'text-orange-400' : 'text-gray-300 dark:text-gray-600')} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{d.title}</div>
        <div className="text-xs text-gray-400">{d.subject} · {format(new Date(d.due_date), 'MMM d')}</div>
        {d.days_until <= 3 && (
          <div className="w-full h-1 bg-red-100 dark:bg-red-950 rounded-full mt-1">
            <div className="h-1 bg-red-500 rounded-full" style={{ width: `${Math.max(10, 100 - d.days_until * 20)}%` }} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className={cn('text-xs font-medium', d.days_until <= 2 ? 'text-red-500' : 'text-gray-400')}>{d.days_until}d</span>
        <button onClick={() => completeMutation.mutate()} className="opacity-0 group-hover:opacity-100 p-1 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded transition-all">
          <CheckCircle2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function AddDeadlineForm() {
  const [show, setShow] = useState(false)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [dueDate, setDueDate] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => plannerApi.createDeadline({ title, subject, due_date: dueDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deadlines'] })
      qc.invalidateQueries({ queryKey: ['smart-schedule'] })
      setShow(false); setTitle(''); setSubject(''); setDueDate('')
      toast.success('Deadline added.')
    },
  })

  if (!show) return (
    <button onClick={() => setShow(true)} className="btn-secondary w-full text-xs mt-3">+ Add Deadline</button>
  )

  return (
    <div className="mt-3 space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Deadline title *" className="input text-xs" />
      <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" className="input text-xs" />
      <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input text-xs" />
      <div className="flex gap-2">
        <button onClick={() => setShow(false)} className="btn-secondary flex-1 text-xs">Cancel</button>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !title || !dueDate} className="btn-primary flex-1 text-xs">Save</button>
      </div>
    </div>
  )
}
