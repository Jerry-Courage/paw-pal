'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { plannerApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const SESSION_COLORS: Record<string, string> = {
  study:      'border-secondary bg-secondary-container/20 text-secondary',
  class:      'border-tertiary bg-tertiary-container/20 text-tertiary',
  exam:       'border-error bg-error-container/20 text-error',
  assignment: 'border-primary bg-primary-container/20 text-primary',
  personal:   'border-green-400 bg-green-500/10 text-green-400',
}
const SESSION_ICONS: Record<string, string> = {
  study: 'book', class: 'science', exam: 'priority_high', assignment: 'edit', personal: 'person'
}

const AI_STATUSES = ['Schedule 1 hour for math tomorrow morning…', 'Block 2 hours for biology exam prep before Thursday…', 'Remind me to review calculus every day this week…']

function getDayName(date: Date) {
  return date.toLocaleDateString('en', { weekday: 'short' }).toUpperCase()
}
function getWeekDates() {
  const today = new Date()
  // Use local day-of-week (0=Sun, 1=Mon…) to avoid UTC offset shifting the week
  const dayOfWeek = today.getDay() // 0=Sun
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - daysFromMonday + i)
    d.setHours(0, 0, 0, 0)
    return d
  })
}

export default function PlannerPage() {
  const queryClient = useQueryClient()
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiStatusIdx, setAiStatusIdx] = useState(0)
  const [showNewSession, setShowNewSession] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState('study')
  const [newDate, setNewDate] = useState('')
  const [newStart, setNewStart] = useState('09:00')
  const [newEnd, setNewEnd] = useState('10:00')
  const weekDates = getWeekDates()
  const today = new Date()

  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ['planner-sessions'],
    queryFn: async () => {
      const r = await plannerApi.getSessions()
      console.log('[Planner] sessions response:', r.data)
      return r.data
    },
    staleTime: 0,
    refetchOnMount: true,
  })
  const { data: deadlinesData } = useQuery({
    queryKey: ['planner-deadlines'],
    queryFn: () => plannerApi.getDeadlines().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => plannerApi.createSession(data),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['planner-sessions'] })
      setShowNewSession(false); setNewTitle(''); setNewDate(''); setNewStart('09:00'); setNewEnd('10:00')
    },
    onError: () => toast.error('Failed to create session.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => plannerApi.deleteSession(id),
    onSuccess: () => { toast.success('Session deleted'); queryClient.invalidateQueries({ queryKey: ['planner-sessions'] }) },
  })

  const handleAISchedule = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    const timer = setInterval(() => setAiStatusIdx(i => (i + 1) % AI_STATUSES.length), 1500)
    try {
      const res = await plannerApi.interpret(aiPrompt)
      const parsed = res.data
      if (!parsed || parsed.error) {
        toast.error('Could not understand that. Try rephrasing.')
        return
      }

      const start = new Date(parsed.start_time)
      const durationMs = (parsed.duration_minutes || 60) * 60 * 1000
      const end = new Date(start.getTime() + durationMs)

      const sessionPayload = {
        title: parsed.title || 'Study Session',
        subject: parsed.subject || '',
        session_type: parsed.session_type || 'study',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: 'scheduled',
      }

      if (parsed.is_recurring && parsed.days?.length) {
        await plannerApi.createRecurring({
          ...sessionPayload,
          days: parsed.days,
          recurrence_type: 'weekly',
          end_date: new Date(start.getTime() + 56 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        })
        toast.success(`Recurring session scheduled for ${parsed.days.length} day(s)!`)
      } else {
        await plannerApi.createSession(sessionPayload)
        toast.success('Session scheduled! ✅')
      }

      setAiPrompt('')
      await refetchSessions()
    } catch (err: any) {
      console.error('[AI Schedule] Error:', err?.response?.data || err?.message)
      toast.error('AI scheduling failed. Try rephrasing.')
    } finally {
      setAiLoading(false)
      clearInterval(timer)
    }
  }

  const sessions = Array.isArray(sessionsData)
    ? sessionsData
    : (sessionsData?.results || [])
  console.log('[Planner] parsed sessions:', sessions.length, sessions.map((s: any) => s.start_time))
  const deadlines = Array.isArray(deadlinesData)
    ? deadlinesData
    : (deadlinesData?.results || [])

  // Group sessions by day — compare in local time to avoid UTC offset issues
  const sessionsByDay = weekDates.map(date => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const localDateStr = `${y}-${m}-${d}`
    return sessions.filter((s: any) => {
      if (!s.start_time) return false
      // Parse the ISO string and convert to local date
      const sessionDate = new Date(s.start_time)
      const sy = sessionDate.getFullYear()
      const sm = String(sessionDate.getMonth() + 1).padStart(2, '0')
      const sd = String(sessionDate.getDate()).padStart(2, '0')
      return `${sy}-${sm}-${sd}` === localDateStr
    })
  })

  // Today stats
  const todaySessions = sessionsByDay[today.getDay() === 0 ? 6 : today.getDay() - 1] || []
  const upcomingDeadlines = deadlines.filter((d: any) => !d.is_completed).slice(0, 3)

  return (
    <div className="flex flex-col h-full md:flex-row overflow-hidden">
      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden px-margin-mobile md:px-margin-desktop py-stack-md gap-gutter overflow-y-auto md:overflow-hidden">

        {/* ── AI Command Bar ─────────────────────────────── */}
        <section className="w-full max-w-3xl mx-auto">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-tertiary rounded-full blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
            <div className="relative flex items-center bg-surface-container-high rounded-full p-2 pl-6 pr-3 border-2 border-transparent focus-within:border-tertiary transition-all">
              <span className="material-symbols-outlined text-primary mr-3 text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
              <input
                className="bg-transparent border-none focus:ring-0 w-full text-[16px] text-on-surface placeholder:text-on-surface-variant/50 outline-none"
                placeholder="Schedule 1 hour for math tomorrow morning..."
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAISchedule()}
              />
              <button
                onClick={handleAISchedule}
                disabled={aiLoading || !aiPrompt.trim()}
                className="bg-primary text-on-primary px-6 py-2 rounded-full font-bold press-effect flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-[14px] shrink-0"
              >
                {aiLoading ? (
                  <><span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span> Scheduling…</>
                ) : (
                  <><span>Execute</span><span className="material-symbols-outlined text-[16px]">send</span></>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* ── Weekly Calendar ────────────────────────────── */}
        <section className="flex-grow bg-surface-container rounded-[1.5rem] p-stack-md border border-outline-variant/30 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-stack-md shrink-0">
            <div className="flex items-center gap-4">
              <h2 className="text-[22px] font-bold text-on-surface">Weekly Planner</h2>
              <span className="bg-surface-container-highest px-3 py-1 rounded-full text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                {weekDates[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} – {weekDates[6].toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <button onClick={() => setShowNewSession(true)} className="flex items-center gap-base bg-primary text-on-primary font-bold px-stack-md py-2 rounded-full btn-3d text-[13px] hover:brightness-110 transition-all">
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Session
            </button>
          </div>

          {/* Day headers + session columns */}
          <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
            {/* Day header row */}
            <div className="grid grid-cols-7 gap-base mb-4 sticky top-0 bg-surface-container z-20 pb-2">
              {weekDates.map((d, i) => {
                const isToday = d.toDateString() === today.toDateString()
                return (
                  <div key={i} className={cn('text-center', isToday && 'text-primary')}>
                    <p className={cn('text-[11px] font-bold', isToday ? 'text-primary' : 'text-on-surface-variant')}>{getDayName(d)}</p>
                    <p className="text-[18px] font-bold">{d.getDate()}</p>
                    {isToday && <div className="w-1 h-1 bg-primary mx-auto rounded-full mt-1"></div>}
                  </div>
                )
              })}
            </div>

            {/* Session grid */}
            <div className="grid grid-cols-7 gap-base min-h-[300px]">
              {sessionsByDay.map((daySessions, dayIdx) => (
                <div key={dayIdx} className="space-y-2">
                  {daySessions.length === 0 ? (
                    <div
                      className="h-full min-h-[120px] bg-surface-container-lowest/30 rounded-[1rem] border-2 border-dashed border-outline-variant/10 cursor-pointer hover:border-outline-variant/30 transition-colors"
                      onClick={() => { setNewDate(weekDates[dayIdx].toISOString().split('T')[0]); setShowNewSession(true) }}
                    />
                  ) : (
                    daySessions.map((s: any) => (
                      <div
                        key={s.id}
                        className={cn('rounded-[1rem] p-3 border-l-4 squishy-card flex flex-col justify-between cursor-pointer', SESSION_COLORS[s.session_type] || SESSION_COLORS.study)}
                      >
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{s.session_type?.toUpperCase()}</p>
                          <p className="text-[12px] font-bold mt-0.5 leading-tight">{s.title}</p>
                        </div>
                        <span className="material-symbols-outlined text-[16px] opacity-60 mt-2">{SESSION_ICONS[s.session_type] || 'book'}</span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ── Right Sidebar: HUD & AI Suggestions ────────── */}
      <aside className="w-full md:w-80 flex flex-col gap-gutter shrink-0 px-margin-mobile md:px-0 md:pr-margin-desktop py-stack-md overflow-y-auto">
        {/* Today's HUD */}
        <div className="bg-surface-container-high rounded-[1.5rem] p-stack-md shadow-lg">
          <h3 className="text-[16px] font-bold text-primary mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">analytics</span>
            Today&apos;s HUD
          </h3>
          <div className="grid grid-cols-2 gap-stack-sm">
            <div className="bg-surface-container p-4 rounded-[1rem] text-center squishy-card">
              <p className="text-on-surface-variant text-[10px] font-bold uppercase">Lessons</p>
              <p className="text-[28px] font-bold text-primary">{todaySessions.length}<span className="text-[14px] opacity-50">/5</span></p>
            </div>
            <div className="bg-surface-container p-4 rounded-[1rem] text-center squishy-card">
              <p className="text-on-surface-variant text-[10px] font-bold uppercase">Deadlines</p>
              <p className="text-[28px] font-bold text-tertiary">{upcomingDeadlines.length}</p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-surface-container-lowest rounded-[1rem]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[12px] font-bold">Daily Goal</span>
              <span className="text-[12px] text-primary font-bold">{Math.min(100, todaySessions.length * 20)}%</span>
            </div>
            <div className="h-3 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, todaySessions.length * 20)}%` }} />
            </div>
          </div>
        </div>

        {/* Upcoming deadlines */}
        {upcomingDeadlines.length > 0 && (
          <div className="flex flex-col gap-stack-sm">
            <h3 className="text-[16px] font-bold text-tertiary flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              Upcoming Deadlines
            </h3>
            {upcomingDeadlines.map((d: any) => (
              <div key={d.id} className="bg-surface-container p-4 rounded-[1rem] border-l-4 border-tertiary squishy-card flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <span className="bg-tertiary-container/30 text-tertiary text-[10px] font-bold px-2 py-1 rounded">DEADLINE</span>
                  <span className="text-[11px] text-on-surface-variant">{new Date(d.due_date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                </div>
                <p className="font-bold text-[14px] text-on-surface">{d.title}</p>
                <button
                  onClick={() => { setNewTitle(`Study: ${d.title}`); setShowNewSession(true) }}
                  className="bg-tertiary text-on-tertiary py-2 rounded-[1rem] font-bold press-effect flex items-center justify-center gap-2 text-[13px]"
                >
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  Schedule Study Time
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── New Session Modal ──────────────────────────── */}
      {showNewSession && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-surface-container-low rounded-[2rem] p-stack-md w-full max-w-md space-y-stack-sm border border-outline-variant">
            <h3 className="text-[20px] font-bold text-on-surface">New Study Session</h3>
            <input
              className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none focus:border-secondary transition-all"
              placeholder="Session title"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
            />
            <select
              className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none appearance-none"
              value={newType}
              onChange={e => setNewType(e.target.value)}
            >
              <option value="study">Study Session</option>
              <option value="class">Class / Lesson</option>
              <option value="exam">Exam / Test</option>
              <option value="assignment">Assignment Focus</option>
              <option value="personal">Personal</option>
            </select>
            <input type="date" className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none focus:border-secondary transition-all" value={newDate} onChange={e => setNewDate(e.target.value)} />
            <div className="grid grid-cols-2 gap-base">
              <input type="time" className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none" value={newStart} onChange={e => setNewStart(e.target.value)} />
              <input type="time" className="w-full bg-surface-container-high border border-outline-variant rounded-[1rem] px-stack-md py-3 text-on-surface focus:outline-none" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
            </div>
            <div className="flex gap-base pt-2">
              <button
                onClick={() => {
                  if (!newTitle || !newDate) return toast.error('Title and date required')
                  createMutation.mutate({ title: newTitle, session_type: newType, start_time: `${newDate}T${newStart}:00`, end_time: `${newDate}T${newEnd}:00` })
                }}
                disabled={createMutation.isPending}
                className="flex-1 bg-primary text-on-primary font-bold py-3 rounded-[1rem] btn-3d hover:brightness-110 transition-all disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving…' : 'Lock It In'}
              </button>
              <button onClick={() => setShowNewSession(false)} className="px-stack-md bg-surface-container-high text-on-surface-variant font-bold rounded-[1rem] hover:bg-surface-container-highest transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
