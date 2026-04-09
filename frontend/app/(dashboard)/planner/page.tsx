'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { plannerApi, libraryApi, assignmentsApi } from '@/lib/api'
import {
  ChevronLeft, ChevronRight, Plus, Sparkles, Clock, AlertCircle,
  CheckCircle2, Trash2, Pencil, X, BookOpen, Zap, Calendar, Play, FileText, ArrowRight
} from 'lucide-react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7) // 7am–9pm

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
  active:    'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 shadow-emerald-500/10 shadow-lg',
  completed: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 line-through opacity-60',
  skipped:   'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-500 opacity-80',
}

const URGENCY_COLORS: Record<string, string> = {
  high:   'text-rose-500 bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20',
  medium: 'text-orange-500 bg-orange-50 dark:bg-orange-500/10 border-orange-100 dark:border-orange-500/20',
  low:    'text-sky-500 bg-sky-50 dark:bg-sky-500/10 border-sky-100 dark:border-sky-500/20',
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
    <div className="max-w-7xl mx-auto flex h-[calc(100vh-64px)] -m-4 md:-m-6 overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-500">
      
      {/* ── Main Canvas (Calendar & Actions) ── */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 p-6 md:p-8 overflow-y-auto custom-scrollbar transition-all duration-500 ease-in-out",
        activePanel !== 'none' ? "md:pr-[420px]" : ""
      )}>
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Study Planner</h1>
            <p className="text-sm font-semibold text-sky-500 flex items-center gap-1 mt-1">
              <Sparkles className="w-4 h-4" /> AI-Optimized Roadmap
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-xl p-1 border border-slate-200 dark:border-slate-800 shadow-sm">
              <button onClick={() => setWeekStart(subWeeks(weekStart, 1))} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 flex flex-col items-center justify-center min-w-[130px]">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(weekStart, 'MMM yyyy')}</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {format(weekStart, 'd')} – {format(weekEnd, 'd')}
                </span>
              </div>
              <button onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button onClick={() => openForm(null)} className="btn-primary flex items-center gap-2 text-sm shadow-lg shadow-sky-500/20 active:scale-95">
              <Plus className="w-4 h-4" /> New Session
            </button>
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
            <div className="hidden xl:flex flex-col flex-1">
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
                        <div key={day.toISOString()} className="border-l border-b border-slate-100 dark:border-slate-800 transition-colors group-hover:bg-slate-50/50 dark:group-hover:bg-slate-800/20 p-1.5 relative">
                          {daySessions.map((s: any) => (
                            <button key={s.id} onClick={() => openDetail(s)}
                              className={cn(
                                'w-full rounded-xl border p-2 text-left transition-all hover:scale-[1.02] active:scale-95 group/card overflow-hidden relative', 
                                STATUS_COLORS[s.status] || STATUS_COLORS.scheduled, 
                                s.is_ai_suggested && 'border-dashed border-sky-300 dark:border-sky-700 bg-sky-50/50 dark:bg-sky-900/20'
                              )}
                            >
                              {s.is_ai_suggested && <div className="absolute top-0 right-0 p-1 line-clamp-1"><Sparkles className="w-3 h-3 text-sky-400 opacity-50 block" /></div>}
                              <div className="font-bold text-xs truncate pr-3">{s.title}</div>
                              <div className="opacity-70 flex items-center gap-1 mt-1 text-[10px] font-semibold">
                                <Clock className="w-3 h-3" />{format(new Date(s.start_time), 'HH:mm')}
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
                {suggestions.map((s: any, i: number) => (
                  <div key={i} className={cn('rounded-2xl p-4 border transition-colors', URGENCY_COLORS[s.urgency] || URGENCY_COLORS.low)}>
                    <div className="font-bold text-xs mb-1">{s.title}</div>
                    <div className="opacity-75 text-[11px] mb-3 leading-relaxed">{s.reason}</div>
                    <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-3 mt-1">
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"><Clock className="w-3 h-3" /> {s.duration_minutes}m</span>
                      <button onClick={() => openForm({ title: s.title, duration: s.duration_minutes, notes: s.reason })} className="text-xs font-black underline hover:no-underline transition-all">Add to plan</button>
                    </div>
                  </div>
                ))}
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

function SessionCard({ session: s, onClick }: { session: any; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('w-full rounded-2xl border p-4 text-left transition-all hover:scale-[1.01] active:scale-95', STATUS_COLORS[s.status] || STATUS_COLORS.scheduled)}>
      {s.is_ai_suggested && <div className="text-[10px] font-black uppercase tracking-widest text-sky-500 mb-2 flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> AI Suggested</div>}
      <div className="font-bold text-sm text-slate-900 dark:text-white leading-tight">{s.title}</div>
      <div className="text-xs font-semibold text-slate-500 flex items-center gap-2 mt-2">
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        {format(new Date(s.start_time), 'HH:mm')} – {format(new Date(s.end_time), 'HH:mm')}
        {s.subject && <span className="opacity-50">|</span>}
        {s.subject && <span>{s.subject}</span>}
      </div>
      {s.resource_title && (
        <div className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 rounded-lg px-2 py-1 mt-3 flex items-center gap-1.5 w-fit">
          <BookOpen className="w-3 h-3" /> {s.resource_title}
        </div>
      )}
    </button>
  )
}

function SlideDetailPanel({ session: s, onClose, onEdit, onDelete, onComplete, completing, deleting }: any) {
  return (
    <>
      <div className={cn("p-6 md:p-8 flex-shrink-0 transition-colors", STATUS_COLORS[s.status]?.split(' ')[0] || 'bg-slate-50')}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            {s.status === 'completed' ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <Clock className="w-6 h-6 text-sky-500" />}
          </div>
          <button onClick={onClose} className="p-2 bg-white/50 hover:bg-white dark:bg-slate-800/50 dark:hover:bg-slate-800 rounded-xl transition-all"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        
        {s.is_ai_suggested && <div className="text-[10px] font-black uppercase tracking-widest text-sky-600 mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> FlowAI Roadmap Node</div>}
        <h2 className="text-2xl font-black text-slate-900 dark:text-white leading-tight">{s.title}</h2>
        {s.subject && <p className="text-sm font-bold text-slate-500 mt-2">{s.subject}</p>}
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
    start_time: defaultStartTime,
    end_time: toLocal(session?.end_time) || '',
    location: session?.location || '',
    notes: session?.notes || '',
    resource: session?.resource || '',
    assignment: session?.assignment || '',
  })

  const { data: resourcesData } = useQuery({ queryKey: ['resources'], queryFn: () => libraryApi.getResources().then(r => r.data) })
  const { data: assignmentsData } = useQuery({ queryKey: ['assignments'], queryFn: () => assignmentsApi.getAll().then(r => r.data) })
  const resources: any[] = resourcesData?.results || []
  const assignments: any[] = assignmentsData?.results || []

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

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
      const payload = { ...form, resource: form.resource || null, assignment: form.assignment || null }
      return isEdit && session?.id ? plannerApi.updateSession(session.id, payload) : plannerApi.createSession(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner-sessions'] })
      onClose()
      toast.success(isEdit ? 'Session updated.' : 'Session added.')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to save session.'),
  })

  return (
    <>
      <div className="p-6 md:p-8 flex-shrink-0 border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{isEdit ? 'Edit Session' : 'New Plan Phase'}</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Schedule Architecture</p>
        </div>
        <button onClick={onClose} className="p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 rounded-xl transition-all"><X className="w-5 h-5 text-slate-500" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar bg-slate-50/30 dark:bg-slate-950/30">
        
        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Base Logistics</h4>
          <div className="space-y-4">
             <div>
               <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Operation Title <span className="text-rose-500">*</span></label>
               <input value={form.title} onChange={set('title')} placeholder="e.g. Master Calculus Physics" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-semibold text-slate-900 dark:text-white" />
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Subject Category</label>
               <input value={form.subject} onChange={set('subject')} placeholder="e.g. Physics" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-semibold text-slate-900 dark:text-white" />
             </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time Window</h4>
          <div className="grid grid-cols-2 gap-4">
             <div>
               <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">From <span className="text-rose-500">*</span></label>
               <input type="datetime-local" value={form.start_time} onChange={set('start_time')} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-semibold text-slate-700 dark:text-slate-300" />
             </div>
             <div>
               <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">To <span className="text-rose-500">*</span></label>
               <input type="datetime-local" value={form.end_time} onChange={set('end_time')} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-semibold text-slate-700 dark:text-slate-300" />
             </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Integration Links</h4>
          {assignments.length > 0 && (
             <div>
               <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Connect Assignment Target</label>
               <select value={form.assignment} onChange={handleAssignmentChange} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all text-sm font-semibold text-slate-700 dark:text-slate-300 appearance-none">
                 <option value="">No assignment attached</option>
                 {assignments.map((a: any) => <option key={a.id} value={a.id}>{a.title}{a.subject ? ` · ${a.subject}` : ''}</option>)}
               </select>
             </div>
          )}
          <div>
             <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Connect Library Resource</label>
             <select value={form.resource} onChange={set('resource')} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-semibold text-slate-700 dark:text-slate-300 appearance-none">
               <option value="">No resource attached</option>
               {resources.map((r: any) => <option key={r.id} value={r.id}>{r.title} ({r.resource_type})</option>)}
             </select>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Additional Context</h4>
          <textarea placeholder="Specific focus areas, chapters, or goals for this session..." value={form.notes} onChange={set('notes')} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm font-medium text-slate-900 dark:text-white resize-none" rows={3} />
        </div>

      </div>

      <div className="p-6 md:p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-4">
        <button onClick={onClose} className="btn-secondary flex-1 py-3.5 rounded-xl font-bold">Cancel</button>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.title || !form.start_time || !form.end_time} className="btn-primary flex-1 py-3.5 rounded-xl font-bold shadow-lg shadow-sky-500/20 active:scale-95 disabled:opacity-50 disabled:active:scale-100">
          {mutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (isEdit ? 'Compile Update' : 'Initialize Session')}
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
