'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { plannerApi, authApi, VAPID_PUBLIC_KEY } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Helpers ──────────────────────────────────────────────────────
function getWeekDates() {
  const today = new Date()
  const dow = today.getDay()
  const fromMon = dow === 0 ? 6 : dow - 1
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - fromMon + i)
    d.setHours(0, 0, 0, 0)
    return d
  })
}
function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
}

const TYPE_COLOR: Record<string,string> = {
  study:      'border-l-secondary bg-secondary/8 text-secondary',
  class:      'border-l-tertiary bg-tertiary/8 text-tertiary',
  exam:       'border-l-error bg-error/8 text-error',
  assignment: 'border-l-primary bg-primary/8 text-primary',
  personal:   'border-l-green-400 bg-green-500/8 text-green-400',
}
const TYPE_ICON: Record<string,string> = {
  study:'book', class:'science', exam:'priority_high', assignment:'edit', personal:'person',
}

// ── Push notification helper ─────────────────────────────────────
async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return false
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      })
    }
    await authApi.registerPushSubscription(JSON.stringify(sub))
    return true
  } catch { return false }
}

export default function PlannerPage() {
  const qc = useQueryClient()
  const weekDates = getWeekDates()
  const today = new Date()
  const fileRef = useRef<HTMLInputElement>(null)

  // ── UI state
  const [aiPrompt, setAiPrompt]     = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [showModal, setShowModal]   = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importSessions, setImportSessions] = useState<any[]>([])
  const [pushEnabled, setPushEnabled] = useState(false)

  // ── New session form
  const [newTitle,   setNewTitle]  = useState('')
  const [newType,    setNewType]   = useState('study')
  const [newDate,    setNewDate]   = useState('')
  const [newStart,   setNewStart]  = useState('09:00')
  const [newEnd,     setNewEnd]    = useState('10:00')
  const [newSubject, setNewSubject]= useState('')

  // ── Queries
  const { data: sessionsRaw, refetch: refetchSessions } = useQuery({
    queryKey: ['planner-sessions'],
    queryFn: () => plannerApi.getSessions().then(r => r.data),
    staleTime: 0,
  })
  const { data: deadlinesRaw } = useQuery({
    queryKey: ['planner-deadlines'],
    queryFn: () => plannerApi.getDeadlines().then(r => r.data),
  })

  const sessions  = Array.isArray(sessionsRaw)  ? sessionsRaw  : (sessionsRaw?.results  || [])
  const deadlines = Array.isArray(deadlinesRaw) ? deadlinesRaw : (deadlinesRaw?.results || [])

  // ── Group sessions by local date
  // Group sessions by local date — extract date portion directly from ISO string
  // to avoid timezone conversion issues entirely
  const sessionsByDay = weekDates.map(date => {
    const ds = localDateStr(date)
    return sessions.filter((s: any) => {
      if (!s.start_time) return false
      // Grab just the date part "2026-08-04" from any ISO format
      const datePart = String(s.start_time).replace(' ', 'T').split('T')[0]
      return datePart === ds
    })
  })

  const todayIdx      = today.getDay() === 0 ? 6 : today.getDay() - 1
  const todaySessions = sessionsByDay[todayIdx] || []
  const upcomingDeadlines = deadlines.filter((d: any) => !d.is_completed).slice(0, 3)

  // ── Check push status on mount
  useEffect(() => {
    if (!('Notification' in window)) return
    setPushEnabled(Notification.permission === 'granted')
  }, [])

  // ── Poll reminders every 5 min
  useEffect(() => {
    if (!pushEnabled) return
    const tick = async () => { try { await plannerApi.sendReminders() } catch {} }
    tick()
    const t = setInterval(tick, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [pushEnabled])

  // ── Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => plannerApi.createSession(data),
    onSuccess: async () => {
      setShowModal(false)
      setNewTitle(''); setNewDate(''); setNewSubject('')
      setNewStart('09:00'); setNewEnd('10:00')
      await qc.invalidateQueries({ queryKey: ['planner-sessions'] })
      await refetchSessions()
      toast.success('Session locked in! ✅')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to create session.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => plannerApi.deleteSession(id),
    onSuccess: () => { refetchSessions(); toast.success('Session removed.') },
  })

  // ── AI prompt scheduling
  const handleAISchedule = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    try {
      const res = await plannerApi.interpret(aiPrompt)
      const p = res.data
      if (!p || p.error) { toast.error('Could not understand that. Try rephrasing.'); return }

      // Build end_time from the same start_time string to avoid UTC shift.
      // toISOString() converts to UTC which can push the time to a different
      // calendar date for users in non-UTC timezones — keep everything as a
      // naive local ISO string the same way start_time comes from the AI.
      const durationMs = (p.duration_minutes || 60) * 60000
      const startDate  = new Date(p.start_time)
      const endDate    = new Date(startDate.getTime() + durationMs)
      // Format as local ISO without timezone offset so the backend stores the
      // intended local time rather than the UTC-shifted equivalent.
      const toLocalISO = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
      }

      const payload = {
        title: p.title || 'Study Session',
        subject: p.subject || '',
        session_type: p.session_type || 'study',
        start_time: toLocalISO(startDate),
        end_time:   toLocalISO(endDate),
        status: 'scheduled',
      }

      if (p.is_recurring && p.days?.length) {
        await plannerApi.createRecurring({
          ...payload,
          days: p.days,
          recurrence_type: 'weekly',
          end_date: toLocalISO(new Date(startDate.getTime() + 56*24*3600000)).split('T')[0],
        })
        toast.success(`Recurring session scheduled! 🔁`)
      } else {
        await plannerApi.createSession(payload)
        toast.success('Session scheduled! ✅')
      }

      setAiPrompt('')
      // Invalidate the cache so React Query re-fetches from the server,
      // then explicitly refetch to make the update synchronous before the
      // toast disappears — fixes the "session count stays at 0" bug.
      await qc.invalidateQueries({ queryKey: ['planner-sessions'] })
      await refetchSessions()
    } catch (e: any) {
      console.error('[AI Schedule]', e?.response?.data || e?.message)
      toast.error('AI scheduling failed. Try rephrasing.')
    } finally { setAiLoading(false) }
  }

  // ── Timetable image import
  const handleTimetableFile = async (file: File) => {
    setImportLoading(true)
    setShowImport(true)
    try {
      let res: any
      if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
        const fd = new FormData()
        fd.append('file', file)
        res = await plannerApi.parseTimetable(fd)
      } else {
        toast.error('Please upload an image or PDF.')
        setShowImport(false)
        return
      }
      setImportSessions(res.data.sessions || [])
      if (!res.data.sessions?.length) toast.error('No sessions found. Try a clearer image.')
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not parse timetable.')
      setShowImport(false)
    } finally { setImportLoading(false) }
  }

  const handleImportConfirm = async () => {
    if (!importSessions.length) return
    try {
      for (const s of importSessions) {
        await plannerApi.createSession({ ...s, is_ai_suggested: true })
      }
      await refetchSessions()
      toast.success(`${importSessions.length} sessions imported from timetable! 📅`)
      setShowImport(false)
      setImportSessions([])
    } catch {
      toast.error('Import failed. Please try again.')
    }
  }

  // ── Enable push
  const handleEnablePush = async () => {
    const ok = await subscribeToPush()
    if (ok) { setPushEnabled(true); toast.success('Reminders enabled! You\'ll get notified 15 min before sessions. 🔔') }
    else toast.error('Could not enable notifications. Check browser permissions.')
  }

  // ── RENDER ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full md:flex-row overflow-hidden">

      {/* ── LEFT: Main planner ── */}
      <div className="flex-1 flex flex-col overflow-hidden px-4 md:px-8 py-5 gap-4 overflow-y-auto">

        {/* AI command bar */}
        <section className="w-full max-w-3xl mx-auto">
          <div className="relative flex items-center bg-surface-container-high rounded-full p-2 pl-5 pr-2 border border-outline-variant/30 focus-within:border-primary/50 transition-all gap-2">
            <span className="material-symbols-outlined text-primary text-[22px] shrink-0" style={{fontVariationSettings:"'FILL' 1"}}>auto_fix_high</span>
            <input
              className="bg-transparent flex-1 text-[15px] text-on-surface placeholder:text-on-surface-variant/50 outline-none"
              placeholder="Schedule 2 hours for biology exam prep tomorrow morning…"
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAISchedule()}
            />
            {/* Timetable upload */}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleTimetableFile(f); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()}
              className="p-2 rounded-full bg-surface-container-highest text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-all"
              title="Import timetable from image or PDF">
              <span className="material-symbols-outlined text-[20px]">upload_file</span>
            </button>
            <button onClick={handleAISchedule} disabled={aiLoading || !aiPrompt.trim()}
              className="bg-primary-container text-on-primary-container px-5 py-2 rounded-full font-bold flex items-center gap-2 disabled:opacity-40 text-[13px] shrink-0 shadow-[0_3px_0_0_#763300] active:translate-y-0.5 active:shadow-none hover:brightness-110 transition-all">
              {aiLoading
                ? <><span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span> Scheduling…</>
                : <><span>Execute</span><span className="material-symbols-outlined text-[16px]">send</span></>}
            </button>
          </div>
          <p className="text-[11px] text-on-surface-variant/50 text-center mt-1.5">
            Type to schedule · Upload 📎 to import your timetable
          </p>
        </section>

        {/* Weekly calendar */}
        <section className="flex-1 bg-surface-container rounded-[1.5rem] p-4 border border-outline-variant/20 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-[20px] font-bold text-on-surface">Weekly Planner</h2>
              <span className="text-[11px] font-bold text-on-surface-variant bg-surface-container-highest px-3 py-1 rounded-full">
                {weekDates[0].toLocaleDateString('en',{month:'short',day:'numeric'})} – {weekDates[6].toLocaleDateString('en',{month:'short',day:'numeric'})}
              </span>
            </div>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 bg-primary-container text-on-primary-container font-bold px-4 py-2 rounded-full text-[13px] shadow-[0_3px_0_0_#763300] active:translate-y-0.5 active:shadow-none hover:brightness-110 transition-all">
              <span className="material-symbols-outlined text-[16px]">add</span>Add Session
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-2 mb-3 sticky top-0 bg-surface-container z-10 pb-2">
              {weekDates.map((d,i) => {
                const isToday = d.toDateString() === today.toDateString()
                return (
                  <div key={i} className={cn('text-center', isToday && 'text-primary')}>
                    <p className={cn('text-[10px] font-black uppercase tracking-widest', isToday?'text-primary':'text-on-surface-variant')}>
                      {d.toLocaleDateString('en',{weekday:'short'})}
                    </p>
                    <p className={cn('text-[18px] font-bold', isToday?'text-primary':'text-on-surface')}>{d.getDate()}</p>
                    {isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary mx-auto mt-0.5" />}
                  </div>
                )
              })}
            </div>

            {/* Session grid */}
            <div className="grid grid-cols-7 gap-2 min-h-[240px]">
              {sessionsByDay.map((daySessions, dayIdx) => (
                <div key={dayIdx} className="space-y-1.5">
                  {daySessions.length === 0 ? (
                    <div
                      className="h-full min-h-[100px] rounded-[1rem] border-2 border-dashed border-outline-variant/15 hover:border-primary/30 transition-colors cursor-pointer"
                      onClick={() => { setNewDate(localDateStr(weekDates[dayIdx])); setShowModal(true) }}
                    />
                  ) : (
                    daySessions.map((s: any) => (
                      <div key={s.id}
                        className={cn('rounded-[0.875rem] p-2.5 border-l-4 flex flex-col gap-1 group relative cursor-default', TYPE_COLOR[s.session_type] || TYPE_COLOR.study)}>
                        <p className="text-[10px] font-black uppercase tracking-wider opacity-60">{s.session_type}</p>
                        <p className="text-[12px] font-bold leading-tight">{s.title}</p>
                        <p className="text-[10px] opacity-60">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</p>
                        <button
                          onClick={() => deleteMutation.mutate(s.id)}
                          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full bg-error/20 text-error flex items-center justify-center">
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ── RIGHT: Sidebar ── */}
      <aside className="w-full md:w-72 flex flex-col gap-4 shrink-0 px-4 md:px-0 md:pr-6 py-5 overflow-y-auto">

        {/* Push notification opt-in */}
        {!pushEnabled && (
          <button onClick={handleEnablePush}
            className="flex items-center gap-3 p-4 rounded-[1.25rem] bg-primary/8 border border-primary/20 text-left hover:bg-primary/12 transition-all group">
            <span className="material-symbols-outlined text-primary text-[24px] shrink-0" style={{fontVariationSettings:"'FILL' 1"}}>notifications</span>
            <div>
              <p className="text-[13px] font-bold text-on-surface">Enable Reminders</p>
              <p className="text-[11px] text-on-surface-variant">Get notified 15 min before sessions</p>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] ml-auto group-hover:text-primary transition-colors">chevron_right</span>
          </button>
        )}

        {pushEnabled && (
          <div className="flex items-center gap-2.5 p-3 rounded-[1.25rem] bg-green-500/8 border border-green-500/20">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
            <p className="text-[12px] font-bold text-green-400">Session reminders active 🔔</p>
          </div>
        )}

        {/* Today's HUD */}
        <div className="bg-surface-container-high rounded-[1.5rem] p-4">
          <h3 className="text-[14px] font-black text-primary mb-3 flex items-center gap-2 uppercase tracking-widest">
            <span className="material-symbols-outlined text-[16px]">analytics</span>Today&apos;s HUD
          </h3>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-surface-container p-3 rounded-[1rem] text-center">
              <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Sessions</p>
              <p className="text-[26px] font-bold text-primary">{todaySessions.length}</p>
            </div>
            <div className="bg-surface-container p-3 rounded-[1rem] text-center">
              <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Deadlines</p>
              <p className="text-[26px] font-bold text-tertiary">{upcomingDeadlines.length}</p>
            </div>
          </div>
          <div className="bg-surface-container rounded-[1rem] p-3">
            <div className="flex justify-between mb-1.5">
              <span className="text-[11px] font-bold text-on-surface-variant">Daily Goal</span>
              <span className="text-[11px] font-bold text-primary">{Math.min(100, todaySessions.length * 20)}%</span>
            </div>
            <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{width:`${Math.min(100,todaySessions.length*20)}%`}} />
            </div>
          </div>
        </div>

        {/* Upcoming deadlines */}
        {upcomingDeadlines.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] font-black text-tertiary uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">auto_awesome</span>Upcoming Deadlines
            </h3>
            {upcomingDeadlines.map((d: any) => (
              <div key={d.id} className="bg-surface-container p-3 rounded-[1.25rem] border-l-4 border-l-tertiary">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[9px] font-black text-tertiary bg-tertiary/10 px-2 py-0.5 rounded uppercase tracking-widest">Deadline</span>
                  <span className="text-[10px] text-on-surface-variant">{new Date(d.due_date).toLocaleDateString('en',{month:'short',day:'numeric'})}</span>
                </div>
                <p className="text-[13px] font-bold text-on-surface mb-2">{d.title}</p>
                <button
                  onClick={() => { setNewTitle(`Study: ${d.title}`); setNewDate(localDateStr(today)); setShowModal(true) }}
                  className="w-full py-2 rounded-[0.75rem] bg-tertiary/15 border border-tertiary/30 text-tertiary text-[12px] font-bold flex items-center justify-center gap-1.5 hover:bg-tertiary/20 transition-all">
                  <span className="material-symbols-outlined text-[14px]">lock_clock</span>Schedule Study Time
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── New Session Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-surface-container-low rounded-[1.75rem] p-5 w-full max-w-md space-y-3 border border-outline-variant/30">
            <h3 className="text-[18px] font-bold text-on-surface">New Session</h3>
            <input className="w-full bg-surface-container border border-outline-variant/40 rounded-[1rem] px-4 py-3 text-on-surface text-[14px] focus:outline-none focus:border-primary/50 transition-all placeholder:text-on-surface-variant/40"
              placeholder="Session title" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
            <input className="w-full bg-surface-container border border-outline-variant/40 rounded-[1rem] px-4 py-3 text-on-surface text-[14px] focus:outline-none focus:border-primary/50 transition-all placeholder:text-on-surface-variant/40"
              placeholder="Subject (optional)" value={newSubject} onChange={e => setNewSubject(e.target.value)} />
            <select className="w-full bg-surface-container border border-outline-variant/40 rounded-[1rem] px-4 py-3 text-on-surface text-[14px] focus:outline-none appearance-none"
              value={newType} onChange={e => setNewType(e.target.value)}>
              <option value="study">Study Session</option>
              <option value="class">Class / Lesson</option>
              <option value="exam">Exam / Test</option>
              <option value="assignment">Assignment Focus</option>
              <option value="personal">Personal</option>
            </select>
            <input type="date" className="w-full bg-surface-container border border-outline-variant/40 rounded-[1rem] px-4 py-3 text-on-surface text-[14px] focus:outline-none"
              value={newDate} onChange={e => setNewDate(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input type="time" className="w-full bg-surface-container border border-outline-variant/40 rounded-[1rem] px-4 py-3 text-on-surface text-[14px] focus:outline-none"
                value={newStart} onChange={e => setNewStart(e.target.value)} />
              <input type="time" className="w-full bg-surface-container border border-outline-variant/40 rounded-[1rem] px-4 py-3 text-on-surface text-[14px] focus:outline-none"
                value={newEnd} onChange={e => setNewEnd(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  if (!newTitle.trim() || !newDate) return toast.error('Title and date are required')
                  createMutation.mutate({
                    title: newTitle.trim(), subject: newSubject.trim(),
                    session_type: newType,
                    start_time: `${newDate}T${newStart}:00`,
                    end_time: `${newDate}T${newEnd}:00`,
                  })
                }}
                disabled={createMutation.isPending}
                className="flex-1 bg-primary-container text-on-primary-container font-bold py-3 rounded-[1rem] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all disabled:opacity-50">
                {createMutation.isPending ? 'Saving…' : 'Lock It In 🔒'}
              </button>
              <button onClick={() => setShowModal(false)}
                className="px-5 bg-surface-container-high text-on-surface-variant font-bold rounded-[1rem] hover:bg-surface-container-highest transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Timetable Import Modal ── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-surface-container-low rounded-[1.75rem] p-5 w-full max-w-lg space-y-4 border border-outline-variant/30">
            <div className="flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-on-surface">Import Timetable</h3>
              <button onClick={() => { setShowImport(false); setImportSessions([]) }}
                className="p-1.5 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {importLoading ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <span className="material-symbols-outlined text-primary text-[48px] animate-pulse" style={{fontVariationSettings:"'FILL' 1"}}>document_scanner</span>
                <p className="text-on-surface-variant text-[14px]">AI is reading your timetable…</p>
              </div>
            ) : importSessions.length > 0 ? (
              <>
                <p className="text-[13px] text-on-surface-variant">Found <span className="text-primary font-bold">{importSessions.length} sessions</span>. Review and confirm:</p>
                <div className="max-h-64 overflow-y-auto space-y-2 scrollbar-hide">
                  {importSessions.map((s, i) => (
                    <div key={i} className={cn('rounded-[1rem] p-3 border-l-4', TYPE_COLOR[s.session_type] || TYPE_COLOR.study)}>
                      <p className="text-[13px] font-bold text-on-surface">{s.title}</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">
                        {new Date(s.start_time).toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'})} · {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleImportConfirm}
                    className="flex-1 bg-primary-container text-on-primary-container font-bold py-3 rounded-[1rem] shadow-[0_4px_0_0_#763300] active:translate-y-1 active:shadow-none hover:brightness-110 transition-all">
                    Import All Sessions 📅
                  </button>
                  <button onClick={() => { setShowImport(false); setImportSessions([]) }}
                    className="px-5 bg-surface-container-high text-on-surface-variant font-bold rounded-[1rem]">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-on-surface-variant text-[14px]">
                No sessions detected. Try a clearer image.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
