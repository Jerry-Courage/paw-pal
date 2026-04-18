'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { plannerApi, libraryApi, assignmentsApi } from '@/lib/api'
import {
  ChevronLeft, ChevronRight, Plus, Sparkles, Clock, AlertCircle,
  CheckCircle2, Trash2, Pencil, X, BookOpen, Zap, Calendar, Play, FileText, ArrowRight,
  Hash, Target, GraduationCap
} from 'lucide-react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7) // 7am–9pm

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
  active:    'border-emerald-500 bg-emerald-500/5 shadow-emerald-500/20 shadow-xl ring-2 ring-emerald-500/20',
  completed: 'opacity-40 grayscale-[0.5] line-through bg-slate-50 dark:bg-slate-900/50',
  skipped:   'opacity-40 border-dashed bg-transparent',
}

const TYPE_STYLES: Record<string, { bg: string, border: string, text: string, icon: any, glow: string }> = {
  class:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400', glow: 'shadow-emerald-500/10', icon: GraduationCap },
  study:      { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  text: 'text-violet-600 dark:text-violet-400',   glow: 'shadow-violet-500/10',  icon: BookOpen },
  exam:       { bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    text: 'text-rose-600 dark:text-rose-400',     glow: 'shadow-rose-500/10',    icon: Target },
  assignment: { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-600 dark:text-amber-400',   glow: 'shadow-amber-500/10',   icon: FileText },
  personal:   { bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   text: 'text-slate-600 dark:text-slate-400',   glow: 'shadow-slate-500/10',   icon: Clock },
}

const URGENCY_STYLES: Record<string, string> = {
  high:   'text-rose-600 bg-rose-500/10 border-rose-500/20 shadow-rose-500/5 shadow-lg',
  medium: 'text-orange-600 bg-orange-500/10 border-orange-500/20',
  low:    'text-sky-600 bg-sky-500/10 border-sky-500/20',
}

export default function PlannerPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()
  
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedDay, setSelectedDay] = useState(new Date())
  
  // Slide Over Panel State
  const [activePanel, setActivePanel] = useState<'none' | 'detail' | 'form'>('none')
  const [panelSession, setPanelSession] = useState<any>(null) // Used for both viewing detail and editing
  const [isEditing, setIsEditing] = useState(false)

  // Initialization check for query params
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openForm(null)
      // Remove query param without refresh
      router.replace('/planner', { scroll: false })
    }
  }, [searchParams, router])

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

  const getSessionsForDay = (day: Date) => sessions.filter((s: any) => isSameDay(new Date(s.start_time), day))

  const deleteMutation = useMutation({
    mutationFn: (id: number) => plannerApi.deleteSession(id),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['planner-sessions'] })
      closePanel()
      toast.success('Session deleted.') 
    },
  })

  const completeMutation = useMutation({
    mutationFn: (id: number) => plannerApi.completeSession(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['planner-sessions'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
      closePanel()
      toast.success(`Session complete! ${res.data.minutes_logged}m logged to your study time.`)
    },
  })

  // Panel Handlers
  const openDetail = (s: any) => { setPanelSession(s); setActivePanel('detail'); setIsEditing(false) }
  const openForm = (s: any = null) => { setPanelSession(s); setActivePanel('form'); setIsEditing(!!s) }
  const closePanel = () => { setActivePanel('none'); setTimeout(() => setPanelSession(null), 300) } // delay clear for exit animation

  return (
    <div className="w-full flex h-[calc(100vh-64px)] overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-500">
      
      {/* ── Main Canvas (Calendar & Actions) ── */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 p-4 md:p-8 overflow-y-auto overflow-x-hidden custom-scrollbar transition-all duration-500 ease-in-out scroll-smooth",
        activePanel !== 'none' ? "md:pr-[420px]" : ""
      )}>
        
        {/* Header */}
        <div className="flex flex-col gap-6 mb-8 pt-2">
           <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
              <div>
                <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">Command Center</h1>
                <p className="text-sm font-bold text-slate-400 flex items-center gap-2 mt-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Operational Intelligence Protocol
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <div className="flex items-center justify-between gap-1 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md rounded-[1.5rem] p-1.5 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none transition-all">
                  <button onClick={() => setWeekStart(subWeeks(weekStart, 1))} className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-all active:scale-90">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="px-6 flex flex-col items-center justify-center min-w-[150px]">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{format(weekStart, 'MMM yyyy')}</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                      {format(weekStart, 'd')} – {format(weekEnd, 'd')}
                    </span>
                  </div>
                  <button onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-all active:scale-90">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                <button onClick={() => openForm(null)} className="btn-primary px-8 py-4 rounded-[1.5rem] flex items-center justify-center gap-3 text-sm font-black shadow-2xl shadow-sky-500/40 active:scale-95 transition-all group overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  <Plus className="w-5 h-5" /> New Mission
                </button>
              </div>
           </div>

           {/* AI Command Bar */}
           <AICommandBar onInterpret={(data) => openForm(data)} />

           {/* TodayHUD */}
           <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="bg-white/40 dark:bg-slate-900/40 p-5 rounded-[2.25rem] border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex items-center gap-4 group hover:border-emerald-500/50 hover:bg-white dark:hover:bg-slate-900 transition-all duration-300">
                 <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-inner">
                    <GraduationCap className="w-7 h-7" />
                 </div>
                 <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Today's Lessons</h4>
                    <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">
                       {sessions.filter(s => isSameDay(new Date(s.start_time), new Date()) && s.session_type === 'class').length} <span className="text-[10px] uppercase font-black text-slate-400 ml-1">Fixed</span>
                    </p>
                 </div>
              </div>
              <div className="bg-white/40 dark:bg-slate-900/40 p-5 rounded-[2.25rem] border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex items-center gap-4 group hover:border-violet-500/50 hover:bg-white dark:hover:bg-slate-900 transition-all duration-300">
                 <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-500 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-inner">
                    <BookOpen className="w-7 h-7" />
                 </div>
                 <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Study Sprints</h4>
                    <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">
                       {sessions.filter(s => isSameDay(new Date(s.start_time), new Date()) && s.session_type === 'study').length} <span className="text-[10px] uppercase font-black text-slate-400 ml-1">Fluid</span>
                    </p>
                 </div>
              </div>
              <div className="bg-white/40 dark:bg-slate-900/40 p-5 rounded-[2.25rem] border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex items-center gap-4 group hover:border-rose-500/50 hover:bg-white dark:hover:bg-slate-900 transition-all duration-300">
                 <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-inner">
                    <Target className="w-7 h-7" />
                 </div>
                 <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Active Goals</h4>
                    <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">
                       {deadlines.length} <span className="text-[10px] uppercase font-black text-slate-400 ml-1">Objectives</span>
                    </p>
                 </div>
              </div>
              <div className="bg-white/40 dark:bg-slate-900/40 p-5 rounded-[2.25rem] border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex items-center gap-4 group hover:border-sky-500/50 hover:bg-white dark:hover:bg-slate-900 transition-all duration-300">
                 <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-500 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-inner">
                    <Zap className="w-7 h-7" />
                 </div>
                 <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Schedule Density</h4>
                    <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">
                       {Math.round((sessions.filter(s => isSameDay(new Date(s.start_time), new Date())).length / 8) * 100)}%
                    </p>
                 </div>
              </div>
           </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Calendar Grid */}
          <div className="xl:col-span-3 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col">
            
            {/* Mobile day strip */}
            <div className="flex xl:hidden overflow-x-auto scrollbar-hide border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              {days.map(day => (
                <button key={day.toISOString()} onClick={() => setSelectedDay(day)}
                  className={cn('flex-shrink-0 flex flex-col items-center px-5 py-4 transition-colors relative',
                    isSameDay(day, selectedDay) ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-600' :
                    isSameDay(day, new Date()) ? 'text-sky-500' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50')}>
                  <span className="text-[10px] font-bold uppercase tracking-widest">{format(day, 'EEE')}</span>
                  <span className="text-xl font-black mt-1">{format(day, 'd')}</span>
                  {getSessionsForDay(day).length > 0 && <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-sky-500 rounded-full" />}
                </button>
              ))}
            </div>

            {/* Mobile sessions list */}
            <div className="xl:hidden p-6 space-y-3 bg-slate-50/30 dark:bg-slate-950/30 min-h-[400px]">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{format(selectedDay, 'EEEE, MMMM d')}</p>
              {getSessionsForDay(selectedDay).length === 0 ? (
                <div className="text-center py-16">
                  <Calendar className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
                  <p className="text-sm font-semibold text-slate-500">No scheduled tasks</p>
                  <button onClick={() => openForm(null)} className="btn-secondary text-xs mt-4">Add Schedule</button>
                </div>
              ) : getSessionsForDay(selectedDay).map((s: any) => (
                <SessionCard key={s.id} session={s} onClick={() => openDetail(s)} />
              ))}
            </div>

            {/* Desktop week grid */}
            <div id="tour-planner-calendar" className="hidden xl:flex flex-col flex-1">
              <div className="grid grid-cols-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-sm z-10 sticky top-0">
                <div className="p-4" />
                {days.map(day => (
                  <div key={day.toISOString()} className={cn('p-4 text-center border-l border-slate-100 dark:border-slate-800', isSameDay(day, new Date()) && 'bg-sky-50 dark:bg-sky-900/20')}>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(day, 'EEE')}</div>
                    <div className={cn('text-xl font-black mt-1', isSameDay(day, new Date()) ? 'text-sky-500' : 'text-slate-900 dark:text-white')}>
                      {format(day, 'd')}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-400 h-4 mt-1">
                      {getSessionsForDay(day).length > 0 ? `${getSessionsForDay(day).length} task${getSessionsForDay(day).length > 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                ))}
              </div>
              <div className="overflow-y-auto custom-scrollbar flex-1 relative bg-slate-50/20 dark:bg-slate-950/20">
                 {/* Current Time Indicator logic could go here */}
                {HOURS.map(hour => (
                  <div key={hour} className="grid grid-cols-8 min-h-[80px] group relative">
                    {/* Hour Label */}
                    <div className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right border-b border-slate-50 dark:border-slate-800/50 flex-shrink-0 bg-white dark:bg-slate-900 z-10">
                      {hour}:00
                    </div>
                    {/* Day Columns */}
                    {days.map(day => {
                      const daySessions = getSessionsForDay(day).filter((s: any) => new Date(s.start_time).getHours() === hour)
                      return (
                        <div key={day.toISOString()} className="border-l border-b border-slate-100 dark:border-slate-800 transition-colors group-hover:bg-slate-50/50 dark:group-hover:bg-slate-800/20 p-1.5 relative min-w-0">
                          {daySessions.map((s: any) => {
                            const typeStyle = TYPE_STYLES[s.session_type] || TYPE_STYLES.study
                            const TypeIcon = typeStyle.icon
                            const isFixed = s.session_type === 'class'
                            
                            return (
                              <button key={s.id} onClick={() => openDetail(s)}
                                className={cn(
                                  'w-full rounded-xl border p-2 text-left transition-all hover:scale-[1.02] active:scale-95 group/card overflow-hidden relative mb-1 last:mb-0', 
                                  typeStyle.bg, typeStyle.border, typeStyle.text, typeStyle.glow,
                                  STATUS_STYLES[s.status] || STATUS_STYLES.scheduled,
                                  isFixed ? 'border-l-4 font-black' : 'border-dashed opacity-90'
                                )}
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  <TypeIcon className="w-3 h-3 flex-shrink-0" />
                                  <span className="text-[9px] font-black uppercase tracking-tighter opacity-70">
                                    {s.session_type}
                                  </span>
                                  {s.status === 'active' && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                </div>
                                <div className="font-black text-xs truncate pr-3">{s.title}</div>
                                {s.is_ai_suggested && <div className="absolute top-0 right-1 p-0.5"><Sparkles className="w-2.5 h-2.5 text-sky-400/80" /></div>}
                                <div className="opacity-70 flex items-center gap-1 mt-1 text-[9px] font-bold">
                                  <Clock className="w-2.5 h-2.5" />{format(new Date(s.start_time), 'HH:mm')}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Control Panel (Widgets) */}
          <div className="space-y-6">
            
            {/* AI Suggestions Widget */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-6 shadow-sm overflow-hidden relative group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110 pointer-events-none" />
              <h3 className="font-black text-slate-900 dark:text-white text-sm mb-1 flex items-center gap-2 relative z-10">
                <Zap className="w-4 h-4 text-yellow-500" /> Smart Suggestions
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest relative z-10 mb-5">AI Gen Schedule</p>
              
              <div className="space-y-4 relative z-10 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {suggestions.length === 0 && (
                  <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                     <p className="text-xs font-semibold text-slate-500">Provide deadlines to generate.</p>
                  </div>
                )}
                {suggestions.map((s: any, i: number) => {
                  const handleAdd = () => {
                    if (s.suggested_date && s.suggested_time) {
                      const start = new Date(`${s.suggested_date}T${s.suggested_time}:00`)
                      const end = new Date(start.getTime() + (s.duration_minutes || 60) * 60000)
                      openForm({ 
                        title: s.title, 
                        subject: s.subject,
                        start_time: start.toISOString(), 
                        end_time: end.toISOString(),
                        notes: s.reason,
                        is_ai_suggested: true
                      })
                    } else {
                      openForm({ title: s.title, subject: s.subject, notes: s.reason, is_ai_suggested: true })
                    }
                  }

                  return (
                    <div key={i} className={cn('rounded-[1.5rem] p-5 border transition-all relative overflow-hidden group/sug hover:shadow-xl', URGENCY_STYLES[s.urgency] || URGENCY_STYLES.low)}>
                      <div className="font-black text-sm mb-2 flex items-center gap-2">
                        {s.title}
                        {s.urgency === 'high' && <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
                      </div>
                      <div className="opacity-80 text-[11px] font-extrabold mb-4 leading-relaxed">{s.reason}</div>
                      <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-4 mt-1">
                        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] opacity-60">
                          <Clock className="w-4 h-4" /> {s.suggested_time ? `${s.suggested_time} (${s.duration_minutes}m)` : `${s.duration_minutes}m`}
                        </span>
                        <button onClick={handleAdd} className="text-[10px] font-black px-4 py-2 bg-white/70 dark:bg-black/40 rounded-xl hover:bg-white dark:hover:bg-black/60 transition-all border border-black/5 dark:border-white/10 shadow-sm uppercase tracking-widest active:scale-90">Secure Slot</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Deadlines Widget */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-sm">Deadlines</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Upcoming Goals</p>
                </div>
                <span className="text-xs font-black bg-slate-100 dark:bg-slate-800 text-slate-500 px-3 py-1 rounded-full">{deadlines.length}</span>
              </div>
              
              <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2 mb-4">
                {deadlines.length === 0 && <p className="text-xs font-semibold text-slate-400 text-center py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">No immediate deadlines.</p>}
                {deadlines.slice(0, 5).map((d: any) => (
                  <DeadlineRow key={d.id} deadline={d} />
                ))}
              </div>
              <AddDeadlineForm />
            </div>

          </div>
        </div>
      </div>

      {/* ── Slide Over Panel (Overlay for Mobile) ── */}
      {activePanel !== 'none' && (
        <div className="fixed inset-0 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm z-40 md:hidden transition-opacity" onClick={closePanel} />
      )}

      {/* ── Right Slide Over Panel Container ── */}
      <div className={cn(
        "fixed md:absolute top-0 right-0 bottom-0 w-full md:w-[400px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 transform transition-transform duration-500 ease-in-out flex flex-col",
        activePanel !== 'none' ? "translate-x-0" : "translate-x-full"
      )}>
        {activePanel === 'detail' && panelSession && (
          <SlideDetailPanel 
            session={panelSession} 
            onClose={closePanel} 
            onEdit={() => openForm(panelSession)}
            onDelete={() => deleteMutation.mutate(panelSession.id)}
            onComplete={() => completeMutation.mutate(panelSession.id)}
            completing={completeMutation.isPending}
            deleting={deleteMutation.isPending}
          />
        )}
        {activePanel === 'form' && (
          <SlideFormPanel 
            session={panelSession} 
            isEdit={isEditing}
            onClose={closePanel} 
          />
        )}
      </div>

    </div>
  )
}

/* ── Components ────────────────────────────────────────── */

function AICommandBar({ onInterpret }: { onInterpret: (data: any) => void }) {
  const [prompt, setPrompt] = useState('')
  const [interpreting, setInterpreting] = useState(false)

  const handleCommand = async () => {
    if (!prompt.trim() || interpreting) return
    setInterpreting(true)
    try {
      const res = await plannerApi.interpret(prompt)
      onInterpret(res.data)
      setPrompt('')
      toast.success("Intelligence Received. Operational drafting complete.")
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.response?.data?.error || "Neural Handshake Stalled"
      toast.error(`Tactical Interpretation Conflict: ${detail}`)
    } finally {
      setInterpreting(false)
    }
  }

  return (
    <div className="relative group animate-in fade-in slide-in-from-top-4 duration-1000">
      <div className="absolute -inset-1 bg-gradient-to-r from-sky-500 to-violet-600 rounded-[2.5rem] blur opacity-5 group-hover:opacity-15 transition duration-1000 group-hover:duration-200"></div>
      <div className="relative bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-[2rem] p-2 flex items-center gap-2 shadow-2xl shadow-slate-200/30 dark:shadow-none">
        <div className="pl-4 sm:pl-6 flex items-center gap-3 text-sky-500">
          <Zap className={cn("w-6 h-6", interpreting && "animate-pulse")} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] hidden md:inline-block">Command Intel</span>
        </div>
        <input 
          type="text" 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCommand()}
          placeholder="Schedule math lesson tomorrow at 3pm..."
          disabled={interpreting}
          className="flex-1 bg-transparent px-2 sm:px-4 py-3 outline-none text-slate-900 dark:text-white font-bold text-base placeholder:text-slate-400 placeholder:font-bold disabled:opacity-50 min-w-0"
        />
        <button 
          onClick={handleCommand}
          disabled={interpreting || !prompt.trim()}
          className={cn(
            "p-4 rounded-2xl transition-all flex items-center gap-2 flex-shrink-0",
            prompt.trim() ? "bg-sky-500 text-white shadow-xl shadow-sky-500/20" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
          )}
        >
          {interpreting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          <span className="text-xs font-black uppercase tracking-widest hidden lg:inline-block">Draft Mission</span>
        </button>
      </div>
    </div>
  )
}

function SessionCard({ session: s, onClick }: { session: any; onClick: () => void }) {
  const typeStyle = TYPE_STYLES[s.session_type] || TYPE_STYLES.study
  const TypeIcon = typeStyle.icon
  const isFixed = s.session_type === 'class'

  return (
    <button onClick={onClick} className={cn(
      'w-full rounded-[1.5rem] border p-5 text-left transition-all hover:scale-[1.02] active:scale-95 relative overflow-hidden group shadow-xl shadow-slate-200/50 dark:shadow-none', 
      typeStyle.bg, typeStyle.border, typeStyle.text, typeStyle.glow,
      STATUS_STYLES[s.status] || STATUS_STYLES.scheduled,
      isFixed && 'border-l-4 font-black'
    )}>
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm border", typeStyle.border)}>
           <TypeIcon className="w-4 h-4" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
          {s.session_type}
        </span>
        {s.is_ai_suggested && <Sparkles className="w-4 h-4 text-sky-400 ml-auto" />}
      </div>
      <div className="font-black text-base text-slate-900 dark:text-white leading-tight mb-3 group-hover:translate-x-1 transition-transform">{s.title}</div>
      <div className="text-[11px] font-extrabold text-slate-500 flex items-center gap-2">
        <Clock className="w-4 h-4 opacity-40" />
        {format(new Date(s.start_time), 'HH:mm')} – {format(new Date(s.end_time), 'HH:mm')}
        {s.subject && <span className="opacity-30">|</span>}
        {s.subject && <span className="text-slate-400">{s.subject}</span>}
      </div>
      {s.resource_title && (
        <div className="text-[10px] font-black text-sky-600 dark:text-sky-400 bg-sky-500/10 rounded-xl px-3 py-1.5 mt-4 flex items-center gap-2 w-fit border border-sky-500/20">
          <BookOpen className="w-3.5 h-3.5" /> {s.resource_title}
        </div>
      )}
    </button>
  )
}

function SlideDetailPanel({ session: s, onClose, onEdit, onDelete, onComplete, completing, deleting }: any) {
  const typeStyle = TYPE_STYLES[s.session_type] || TYPE_STYLES.study
  const TypeIcon = typeStyle.icon

  return (
    <>
      <div className={cn("p-6 md:p-8 flex-shrink-0 transition-colors border-b relative overflow-hidden", typeStyle.bg)}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 dark:bg-black/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
        <div className="flex items-start justify-between gap-4 mb-8 relative z-10">
          <div className={cn("p-4 bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border flex items-center justify-center", typeStyle.border)}>
            <TypeIcon className={cn("w-8 h-8", typeStyle.text)} />
          </div>
          <button onClick={onClose} className="p-3 bg-white/50 hover:bg-white dark:bg-slate-800/50 dark:hover:bg-slate-800 rounded-2xl transition-all shadow-xl backdrop-blur-md"><X className="w-6 h-6 text-slate-500" /></button>
        </div>
        
        <div className="flex items-center gap-2 mb-3 relative z-10">
          {s.is_ai_suggested && <Sparkles className="w-4 h-4 text-sky-500" />}
          <span className={cn("text-[11px] font-black uppercase tracking-[0.3em]", typeStyle.text)}>
            {s.session_type} Phase
          </span>
        </div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white leading-tight tracking-tighter relative z-10">{s.title}</h2>
        {s.subject && <p className="text-sm font-extrabold text-slate-500 mt-3 flex items-center gap-2 relative z-10"><Hash className="w-4 h-4 opacity-30" /> {s.subject}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 bg-white dark:bg-slate-900">
        
        {/* Timing */}
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Schedule</h4>
          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
             <div className="p-2.5 bg-white dark:bg-slate-700 rounded-xl shadow-sm"><Calendar className="w-5 h-5 text-sky-500" /></div>
             <div>
               <p className="text-sm font-bold text-slate-900 dark:text-white">{format(new Date(s.start_time), 'EEEE, MMMM d')}</p>
               <p className="text-xs font-semibold text-slate-500">{format(new Date(s.start_time), 'h:mm a')} – {format(new Date(s.end_time), 'h:mm a')} <span className="opacity-50">({s.duration_minutes}m)</span></p>
             </div>
          </div>
        </div>

        {/* Links */}
        {(s.resource_title || s.assignment_title) && (
          <div className="space-y-3">
             <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resources</h4>
             <div className="space-y-2">
                {s.resource_title && (
                  <Link href={`/library/${s.resource}`} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700 hover:shadow-md transition-all group">
                    <div className="p-2 bg-sky-50 dark:bg-sky-900/30 text-sky-500 rounded-xl group-hover:bg-sky-500 group-hover:text-white transition-colors"><BookOpen className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0 pr-2">
                       <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{s.resource_title}</p>
                       <p className="text-[10px] font-semibold text-slate-400">Library Target</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-sky-500 group-hover:-rotate-45 transition-all" />
                  </Link>
                )}
                {s.assignment_title && (
                  <Link href="/assignments" className="flex items-center gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md transition-all group">
                    <div className="p-2 bg-violet-50 dark:bg-violet-900/30 text-violet-500 rounded-xl group-hover:bg-violet-500 group-hover:text-white transition-colors"><FileText className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0 pr-2">
                       <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{s.assignment_title}</p>
                       <p className="text-[10px] font-semibold text-slate-400">Assignment Target</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-violet-500 group-hover:-rotate-45 transition-all" />
                  </Link>
                )}
             </div>
          </div>
        )}

        {/* Notes */}
        {s.notes && (
          <div className="space-y-3">
             <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target Objective</h4>
             <div className="bg-amber-50/50 dark:bg-amber-900/10 p-5 rounded-2xl border border-amber-100/50 dark:border-amber-900/30 text-sm font-medium text-amber-900 dark:text-amber-200/70 leading-relaxed italic border-l-4 border-l-amber-400 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-amber-400/10 rounded-bl-full pointer-events-none" />
                "{s.notes}"
             </div>
          </div>
        )}
      </div>

      <div className="p-6 md:p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
         {s.status !== 'completed' && (
           <button onClick={onComplete} disabled={completing} className="w-full btn-primary py-4 rounded-2xl shadow-xl shadow-sky-200 dark:shadow-none hover:-translate-y-1 transition-all active:scale-95 flex justify-center items-center font-bold text-base">
             <CheckCircle2 className="w-5 h-5 mr-3" /> {completing ? 'Logging Results...' : 'Mark Session Complete'}
           </button>
         )}
         <div className="flex items-center gap-3">
            <button onClick={onEdit} className="flex-1 btn-secondary py-3 rounded-xl gap-2 font-bold"><Pencil className="w-4 h-4" /> Edit</button>
            <button onClick={onDelete} disabled={deleting} className="flex-1 btn-secondary py-3 rounded-xl gap-2 font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-900 transition-colors"><Trash2 className="w-4 h-4" /> Delete</button>
         </div>
      </div>
    </>
  )
}

function SlideFormPanel({ session, isEdit, onClose }: { session?: any; isEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient()

  const toLocal = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }

  // Pre-fill logic if a suggested session object is passed in
  const defaultStartTime = session?.start_time ? toLocal(session.start_time) : ''
  const defaultTitle = session?.title || ''

  const [form, setForm] = useState({
    title: defaultTitle,
    subject: session?.subject || '',
    session_type: session?.session_type || 'study',
    start_time: defaultStartTime,
    end_time: toLocal(session?.end_time) || '',
    location: session?.location || '',
    notes: session?.notes || '',
    resource: session?.resource || '',
    assignment: session?.assignment || '',
    // Recurrence fields
    days: session?.days || [] as number[],
    weeks_count: session?.weeks_count || 12
  })

  const { data: resourcesData } = useQuery({ queryKey: ['resources'], queryFn: () => libraryApi.getResources().then(r => r.data) })
  const { data: assignmentsData } = useQuery({ queryKey: ['assignments'], queryFn: () => assignmentsApi.getAll().then(r => r.data) })
  const resources: any[] = resourcesData?.results || []
  const assignments: any[] = assignmentsData?.results || []

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  
  const toggleDay = (day: number) => {
    setForm(f => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d: number) => d !== day) : [...f.days, day]
    }))
  }

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
      if (!isEdit && form.session_type === 'class' && form.days.length > 0) {
         return plannerApi.createRecurring({
           ...form,
           resource: form.resource || null,
           assignment: form.assignment || null
         })
      }
      const payload = { ...form, resource: form.resource || null, assignment: form.assignment || null }
      return isEdit && session?.id ? plannerApi.updateSession(session.id, payload) : plannerApi.createSession(payload)
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['planner-sessions'] })
      onClose()
      const count = res.data?.count
      toast.success(count ? `Successfully generated ${count} recurring classes.` : (isEdit ? 'Session updated.' : 'Session added.'))
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to save session.'),
  })

  return (
    <>
      <div className="p-6 md:p-8 flex-shrink-0 border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{isEdit ? 'Edit Directive' : 'New Plan Phase'}</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Schedule Architecture</p>
        </div>
        <button onClick={onClose} className="p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 rounded-xl transition-all"><X className="w-5 h-5 text-slate-500" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar bg-slate-50/30 dark:bg-slate-950/30">
        
        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Base Logistics</h4>
          <div className="space-y-4">
             <div>
               <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Phase Type</label>
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                 {Object.entries(TYPE_STYLES).map(([type, style]) => (
                   <button 
                     key={type}
                     onClick={() => setForm(f => ({ ...f, session_type: type }))}
                     className={cn(
                       "flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter border transition-all",
                       form.session_type === type ? `${style.bg} ${style.border} ${style.text}` : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400"
                     )}
                   >
                     <style.icon className="w-3.5 h-3.5" /> {type}
                   </button>
                 ))}
               </div>
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Operation Title <span className="text-rose-500">*</span></label>
               <input value={form.title} onChange={set('title')} placeholder="e.g. Master Calculus Physics" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-semibold text-slate-900 dark:text-white shadow-sm" />
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Subject Category</label>
               <input value={form.subject} onChange={set('subject')} placeholder="e.g. Physics" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-semibold text-slate-900 dark:text-white shadow-sm" />
             </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Temporal Intelligence</h4>
          {form.session_type === 'class' && !isEdit && (
            <div className="space-y-4 bg-emerald-500/5 border border-emerald-500/10 p-5 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-500">
               <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400 mb-3">Recurrence Pattern</label>
               <div className="flex flex-wrap gap-2">
                 {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
                   <button 
                     key={day}
                     onClick={() => toggleDay(idx)}
                     className={cn(
                       "w-10 h-10 rounded-xl text-[10px] font-black uppercase flex items-center justify-center transition-all",
                       form.days.includes(idx) ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-white dark:bg-slate-900 text-slate-400 border border-slate-200 dark:border-slate-800"
                     )}
                   >
                     {day[0]}
                   </button>
                 ))}
               </div>
               <div className="pt-2">
                 <label className="block text-[10px] font-bold text-slate-500 mb-2">GENERATE FOR (WEEKS)</label>
                 <input type="number" min={1} max={52} value={form.weeks_count} onChange={set('weeks_count')} className="w-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl text-xs font-black" />
               </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
             <div>
               <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Time Start <span className="text-rose-500">*</span></label>
               <input type="datetime-local" value={form.start_time} onChange={set('start_time')} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm" />
             </div>
             <div>
               <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Time End <span className="text-rose-500">*</span></label>
               <input type="datetime-local" value={form.end_time} onChange={set('end_time')} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm" />
             </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Library Integration</h4>
          {assignments.length > 0 && (
             <div>
               <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Relate to Assignment</label>
               <select value={form.assignment} onChange={handleAssignmentChange} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all text-sm font-semibold text-slate-700 dark:text-slate-300 appearance-none shadow-sm">
                 <option value="">No assignment attached</option>
                 {assignments.map((a: any) => <option key={a.id} value={a.id}>{a.title}{a.subject ? ` · ${a.subject}` : ''}</option>)}
               </select>
             </div>
          )}
          <div>
             <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Relate to Study Resource</label>
             <select value={form.resource} onChange={set('resource')} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-semibold text-slate-700 dark:text-slate-300 appearance-none shadow-sm">
               <option value="">No resource attached</option>
               {resources.map((r: any) => <option key={r.id} value={r.id}>{r.title} ({r.resource_type})</option>)}
             </select>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operational Intel</h4>
          <textarea placeholder="Specific focus areas, chapters, or goals for this phase..." value={form.notes} onChange={set('notes')} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-medium text-slate-900 dark:text-white resize-none shadow-sm" rows={3} />
        </div>

      </div>

      <div className="p-6 md:p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-4">
        <button onClick={onClose} className="btn-secondary flex-1 py-3.5 rounded-xl font-bold">Abort</button>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.title || !form.start_time || !form.end_time} className="btn-primary flex-1 py-3.5 rounded-xl font-bold shadow-lg shadow-sky-500/20 active:scale-95 disabled:opacity-50 disabled:active:scale-100">
          {mutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (isEdit ? 'Authorize Update' : 'Initialize Plan')}
        </button>
      </div>
    </>
  )
}

function Loader2({ className }: { className?: string }) {
  // Polyfill inside file just in case lucide loader2 is missing or something
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("animate-spin", className)}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;
}

function DeadlineRow({ deadline: d }: { deadline: any }) {
  const qc = useQueryClient()
  const completeMutation = useMutation({
    mutationFn: () => plannerApi.updateDeadline(d.id, { is_completed: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deadlines'] }); toast.success('Objective secured.') },
  })
  
  return (
    <div className="flex items-start gap-3 group bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden relative">
      <div className="relative z-10 flex flex-1 min-w-0 gap-3 items-start">
        <div className={cn("p-2 rounded-lg text-white font-black text-xs flex-shrink-0 flex items-center justify-center min-w-[36px]", d.days_until <= 2 ? 'bg-rose-500' : d.days_until <= 5 ? 'bg-orange-400' : 'bg-slate-300 dark:bg-slate-600')}>
          {d.days_until}d
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{d.title}</div>
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{d.subject} · {format(new Date(d.due_date), 'MMM d')}</div>
          {d.days_until <= 3 && (
            <div className="w-full h-1 bg-rose-100 dark:bg-rose-950 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-rose-500" style={{ width: `${Math.max(10, 100 - d.days_until * 20)}%` }} />
            </div>
          )}
        </div>
        <button onClick={() => completeMutation.mutate()} className="opacity-0 group-hover:opacity-100 p-2 text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 rounded-xl transition-all self-center absolute right-2 bg-white dark:bg-slate-800 shadow-sm border border-emerald-100 dark:border-emerald-900">
          <CheckCircle2 className="w-4 h-4" />
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
      toast.success('Strategic deadline added.')
    },
  })

  if (!show) return (
    <button onClick={() => setShow(true)} className="w-full py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 font-bold text-xs hover:border-sky-500 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-all flex justify-center items-center gap-2">
      <Plus className="w-3.5 h-3.5" /> Define New Objective
    </button>
  )

  return (
    <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-2xl animate-in fade-in zoom-in-95 origin-top">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">New Objective Directive</h4>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Objective identity *" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl outline-none focus:ring-2 ring-sky-500/50 text-xs font-semibold" />
      <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject Area" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl outline-none focus:ring-2 ring-sky-500/50 text-xs font-semibold" />
      <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl outline-none focus:ring-2 ring-sky-500/50 text-xs font-semibold" />
      <div className="flex gap-2 pt-1">
        <button onClick={() => setShow(false)} className="btn-secondary flex-1 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700">Abort</button>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !title || !dueDate} className="btn-primary flex-1 py-2 text-xs font-bold rounded-lg relative overflow-hidden group">
           <span className="relative z-10">{mutation.isPending ? 'Committing...' : 'Commit Objective'}</span>
        </button>
      </div>
    </div>
  )
}
