'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, RotateCcw, Sparkles } from 'lucide-react'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import MaterialIntake, { MaterialObject, type MaterialDraft } from './MaterialIntake'
import JourneyPreview from './JourneyPreview'
import { API_BASE, getAuthToken, learningApi, libraryApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { BuildJourneyResponse, JourneyDepth, JourneyPreviewResponse } from '@/types/journey'
import type { OnboardingUpdate } from '@/types/onboarding'
import type { FlowCompanionState } from '@/components/onboarding/FlowCompanion'

type Stage = 'intake' | 'processing' | 'reveal' | 'configure' | 'preview' | 'building' | 'ready'
type ResourceState = { id: number; title: string; subject?: string; resource_type: string; file_size?: number; status: string; processing_progress: number; status_text: string; has_study_kit: boolean; ai_concepts?: Array<{ title?: string; name?: string }>; ai_summary?: string }

const GOALS = [
  ['Understand it', 'Understand and explain the important ideas clearly'],
  ['Prepare for an exam', 'Prepare confidently for an exam on this material'],
  ['Revise quickly', 'Revise the essential ideas quickly'],
  ['Master it properly', 'Master this material deeply and retain it'],
] as const

const DEPTHS: Array<{ id: JourneyDepth; label: string; line: string; width: string }> = [
  { id: 'quick', label: 'Quick', line: 'The essentials.', width: 'w-[54%]' },
  { id: 'standard', label: 'Standard', line: 'Enough to really understand it.', width: 'w-[76%]' },
  { id: 'deep', label: 'Deep', line: 'Leave no survivors.', width: 'w-full' },
]

interface Props {
  initialResourceIds?: number[]
  initialGoal?: string
  initialDepth?: JourneyDepth
  initialJourneyId?: string
  onPersist: (update: OnboardingUpdate) => Promise<boolean>
  onFlowState: (state: FlowCompanionState) => void
}

export default function FirstJourneyBuilder({ initialResourceIds = [], initialGoal = '', initialDepth = 'standard', initialJourneyId, onPersist, onFlowState }: Props) {
  const reduceMotion = useReducedMotion()
  const router = useRouter()
  const [stage, setStage] = useState<Stage>(initialJourneyId ? 'ready' : initialResourceIds.length ? 'processing' : 'intake')
  const [material, setMaterial] = useState<MaterialDraft | null>(null)
  const [resource, setResource] = useState<ResourceState | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const [debugError, setDebugError] = useState('')
  const [goal, setGoal] = useState(initialGoal)
  const [customGoal, setCustomGoal] = useState('')
  const [depth, setDepth] = useState<JourneyDepth>(initialDepth)
  const [preview, setPreview] = useState<JourneyPreviewResponse | null>(null)
  const [journey, setJourney] = useState<BuildJourneyResponse | null>(initialJourneyId ? { id: initialJourneyId } as BuildJourneyResponse : null)
  const [busy, setBusy] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resourceRef = useRef<ResourceState | null>(null)
  const buildSubmittingRef = useRef(false)
  const resourceId = resource?.id || initialResourceIds[0]

  const applyResource = useCallback((next: ResourceState) => {
    resourceRef.current = next
    setResource(next)
    if (next.status === 'ready' && next.has_study_kit) {
      setStage(current => current === 'processing' ? 'reveal' : current)
      libraryApi.getResource(next.id).then(response => setResource(response.data)).catch(() => { /* list data still supports the reveal */ })
      onFlowState('celebrating')
      eventSourceRef.current?.close()
      if (pollRef.current) clearInterval(pollRef.current)
    } else if (next.status === 'error' || next.status === 'failed') {
      setError('That one fought back.')
      setDebugError(next.status_text || 'The material could not be processed.')
      onFlowState('idle')
      eventSourceRef.current?.close()
      if (pollRef.current) clearInterval(pollRef.current)
    } else {
      onFlowState('reading')
    }
  }, [onFlowState])

  const pollResource = useCallback(async (id: number) => {
    try { applyResource((await libraryApi.getResource(id)).data) } catch { /* next poll retries */ }
  }, [applyResource])

  useEffect(() => {
    if (!initialResourceIds[0] || resource) return
    pollResource(initialResourceIds[0])
  }, [initialResourceIds, resource, pollResource])

  useEffect(() => {
    if (stage !== 'processing' || !resourceId) return
    let disposed = false
    const startPolling = () => {
      if (disposed || pollRef.current) return
      pollResource(resourceId)
      pollRef.current = setInterval(() => pollResource(resourceId), 4000)
    }
    const connect = async () => {
      const token = await getAuthToken()
      if (!token || disposed) return startPolling()
      const source = new EventSource(`${API_BASE}/library/resources/status-stream/?token=${encodeURIComponent(token)}`)
      eventSourceRef.current = source
      const read = (event: MessageEvent) => {
        try {
          const rows = JSON.parse(event.data) as Array<any>
          const match = rows.find(row => row.id === resourceId)
          if (match) applyResource({ ...resourceRef.current, id: match.id, title: match.title, resource_type: resourceRef.current?.resource_type || 'other', status: match.status, processing_progress: match.progress, status_text: match.text, has_study_kit: match.has_study_kit } as ResourceState)
        } catch { /* malformed event falls through to the next update */ }
      }
      source.addEventListener('snapshot', read as EventListener)
      source.addEventListener('status', read as EventListener)
      source.onerror = () => { source.close(); eventSourceRef.current = null; startPolling() }
    }
    connect()
    return () => {
      disposed = true
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [stage, resourceId, applyResource, pollResource])

  useEffect(() => {
    if (stage === 'intake') onFlowState(material ? 'receiving' : 'idle')
    if (stage === 'configure' || stage === 'preview' || stage === 'building') onFlowState(stage === 'building' ? 'thinking' : 'idle')
    if (stage === 'ready') onFlowState('celebrating')
  }, [stage, material, onFlowState])

  const upload = async () => {
    if (!material || busy) return
    setBusy(true); setError(''); setDebugError(''); setUploadProgress(0); onFlowState('receiving')
    const data = new FormData()
    data.append('title', material.title)
    data.append('selected_features', JSON.stringify(['notes']))
    if (material.mode === 'link') {
      data.append('url', material.url || '')
      data.append('resource_type', material.type === 'video' ? 'video' : 'other')
    } else {
      const file = material.file || new File([material.text || ''], `${safeName(material.title)}.txt`, { type: 'text/plain' })
      data.append('file', file)
      data.append('resource_type', material.type === 'slides' ? 'slides' : material.type === 'document' ? 'pdf' : 'other')
    }
    try {
      const response = await libraryApi.uploadResource(data, event => setUploadProgress(event.total ? Math.round(event.loaded * 100 / event.total) : 0))
      const next = response.data as ResourceState
      resourceRef.current = next
      setResource(next)
      setStage('processing')
      await onPersist({ resource_ids: [next.id] })
    } catch (caught) {
      const apiError = caught as AxiosError<any>
      const status = apiError.response?.status
      const detail = apiError.response?.data?.message || apiError.response?.data?.error || apiError.response?.data?.detail || apiError.message
      setError(status === 402 ? 'You’ve reached your material limit.' : 'That one fought back.')
      setDebugError(String(detail || 'Upload failed. Please try again.'))
      onFlowState('idle')
    } finally { setBusy(false) }
  }

  const retryProcessing = async () => {
    if (!resourceId || busy) return
    setBusy(true); setError(''); setDebugError('')
    try { await libraryApi.reprocessResource(resourceId); setStage('processing'); await pollResource(resourceId) }
    catch (caught) { setError('Still no luck.'); setDebugError(errorMessage(caught)) }
    finally { setBusy(false) }
  }

  const generatePreview = async () => {
    const finalGoal = customGoal.trim() || goal
    if (!resourceId || !finalGoal || busy) return
    setBusy(true); setError(''); setDebugError(''); onFlowState('thinking')
    try {
      const response = await learningApi.generatePreview({ goal: finalGoal, resources: [resourceId], depth })
      setPreview(response.data); setGoal(finalGoal); setStage('preview')
      await onPersist({ journey_goal: finalGoal, journey_depth: depth })
    } catch (caught) { setError('The route wouldn’t settle.'); setDebugError(errorMessage(caught)); onFlowState('idle') }
    finally { setBusy(false) }
  }

  const buildJourney = async () => {
    if (!resourceId || !goal || busy || buildSubmittingRef.current) return
    buildSubmittingRef.current = true
    setBusy(true); setStage('building'); setError(''); onFlowState('thinking')
    try {
      const response = await learningApi.buildJourney({ title: `${resource?.title || 'My'} Journey`, goal, resources: [resourceId], depth })
      setJourney(response.data); setStage('ready'); await onPersist({ journey_id: response.data.id, journey_goal: goal, journey_depth: depth, completed: true })
    } catch (caught) { buildSubmittingRef.current = false; setStage('preview'); setError('The Journey didn’t lock into place.'); setDebugError(errorMessage(caught)); onFlowState('idle') }
    finally { setBusy(false) }
  }

  const progress = resource?.processing_progress || uploadProgress
  const discoveries = (resource?.ai_concepts || []).filter(item => item?.title || item?.name).slice(0, 6)
  const friendlyStatus = processingCopy(progress, resource?.status_text)

  return (
    <div className="max-w-4xl">
      <AnimatePresence mode="wait">
        <motion.div key={stage} initial={reduceMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}>
          {stage === 'intake' && <>
            <Eyebrow>First material</Eyebrow>
            <Title>Alright. Give me something you&apos;re studying.</Title>
            <Lead>I&apos;ll read it, find the important ideas, and turn it into a structured learning Journey.</Lead>
            <div className="mt-7"><MaterialIntake material={material} onChange={next => { setMaterial(next); setError(''); setDebugError('') }} error={error} /></div>
            {debugError && <p role="alert" className="mt-3 text-sm text-rose-300">{debugError}</p>}
            {material && <PrimaryAction onClick={upload} disabled={busy}>{busy ? `Receiving… ${uploadProgress}%` : 'Give it to Flow'}</PrimaryAction>}
          </>}

          {stage === 'processing' && <>
            <Eyebrow>Flow is reading</Eyebrow><Title>{friendlyStatus.title}</Title><Lead>{friendlyStatus.reaction}</Lead>
            {material && <MaterialObject material={material} className="mt-7 max-w-sm scale-90 origin-left opacity-80" />}
            <div className="mt-8 max-w-2xl">
              <div className="h-2 overflow-hidden bg-white/10"><motion.div className="h-full bg-flow-orange" animate={{ width: `${Math.max(2, progress)}%` }} transition={{ ease: 'easeOut' }} /></div>
              <div className="mt-3 flex justify-between text-xs font-black uppercase tracking-widest text-flow-muted"><span>{resource?.status_text || 'Receiving the material…'}</span><span className="text-flow-orange">{progress}%</span></div>
            </div>
            {error && <Failure error={error} detail={debugError} onRetry={retryProcessing} onReplace={() => { setStage('intake'); setResource(null); setMaterial(null); setError('') }} busy={busy} />}
          </>}

          {stage === 'reveal' && <>
            <Eyebrow><Sparkles className="h-4 w-4" /> Material understood</Eyebrow><Title>I found the shape of it.</Title>
            <Lead>{resource?.ai_summary?.slice(0, 220) || `I pulled out the ideas that hold ${resource?.title || 'this material'} together.`}</Lead>
            <div className="mt-8 border-y border-white/12 py-6">
              <p className="text-xs font-black uppercase tracking-widest text-flow-muted">{resource?.title}</p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
                {discoveries.length ? discoveries.map((concept, index) => <motion.span initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }} key={concept.title || concept.name} className="text-base font-black text-flow-ink"><span className="mr-2 text-flow-orange">●</span>{concept.title || concept.name}</motion.span>) : <span className="text-flow-muted">The study sections are ready.</span>}
              </div>
              <p className="mt-5 text-sm font-bold text-flow-success">{discoveries.length || resource?.ai_concepts?.length || 0} major concepts surfaced</p>
            </div>
            <PrimaryAction onClick={() => setStage('configure')}>Shape the Journey</PrimaryAction>
          </>}

          {stage === 'configure' && <>
            <Eyebrow>Set the destination</Eyebrow><Title>What are we trying to do with this?</Title>
            <div className="mt-7 grid max-w-3xl gap-2 sm:grid-cols-2">
              {GOALS.map(([label, value], index) => <motion.button whileTap={reduceMotion ? undefined : { scale: .97 }} key={label} onClick={() => { setGoal(value); setCustomGoal('') }} aria-pressed={goal === value}
                className={cn('min-h-20 px-5 py-4 text-left text-base font-black outline-none transition focus-visible:ring-2 focus-visible:ring-flow-orange', goal === value ? 'bg-flow-orange text-flow-void shadow-[0_5px_0_#8f3600]' : 'bg-flow-raised text-flow-muted hover:text-flow-ink', index % 2 ? 'rotate-[.4deg]' : '-rotate-[.4deg]')}>{label}{goal === value && <Check className="float-right h-5 w-5" />}</motion.button>)}
            </div>
            <label className="mt-5 block max-w-3xl"><span className="text-xs font-black uppercase tracking-widest text-flow-muted">Or say it your way</span><input maxLength={300} value={customGoal} onChange={event => { setCustomGoal(event.target.value); setGoal('') }} placeholder="I want to be able to…" className="mt-2 w-full border-b-2 border-white/20 bg-transparent py-3 text-lg font-bold outline-none focus:border-flow-orange" /></label>
            <h2 className="mt-9 text-2xl font-black">How deep?</h2>
            <div className="mt-4 max-w-3xl space-y-3">{DEPTHS.map(item => <button key={item.id} onClick={() => setDepth(item.id)} aria-pressed={depth === item.id} className="group flex w-full items-center gap-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-flow-orange"><span className={cn('h-3 transition-all', item.width, depth === item.id ? 'bg-flow-orange' : 'bg-white/15 group-hover:bg-white/30')} /><span className="w-24 shrink-0"><strong className={cn('block', depth === item.id ? 'text-flow-orange' : 'text-flow-ink')}>{item.label}</strong><small className="text-flow-muted">{item.line}</small></span></button>)}</div>
            <PrimaryAction onClick={generatePreview} disabled={busy || !(customGoal.trim() || goal)}>{busy ? 'Drawing the route…' : 'Reveal My Route'}</PrimaryAction>
            {error && <InlineError title={error} detail={debugError} />}
          </>}

          {stage === 'preview' && preview && <>
            <Eyebrow>Your route appeared</Eyebrow><Title>{resource?.title} Journey</Title><Lead>{goal}</Lead>
            <div className="mt-7"><JourneyPreview preview={preview} /></div>
            {error && <InlineError title={error} detail={debugError} />}
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <PrimaryAction onClick={buildJourney} disabled={busy}>Build My Journey</PrimaryAction>
              <button onClick={() => setStage('configure')} className="inline-flex items-center gap-2 py-3 text-sm font-black text-flow-muted hover:text-flow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-orange"><RotateCcw className="h-4 w-4" />Change goal or depth</button>
            </div>
          </>}

          {stage === 'building' && <><Eyebrow>Locking in the route</Eyebrow><Title>Building your Journey…</Title><Lead>The approved route is becoming yours. This only happens once.</Lead><div className="mt-8 h-2 max-w-xl overflow-hidden bg-white/10"><motion.div className="h-full bg-flow-orange" initial={{ width: '15%' }} animate={{ width: '88%' }} transition={{ duration: 1.4, ease: 'easeOut' }} /></div></>}

          {stage === 'ready' && <>
            <Eyebrow><Sparkles className="h-4 w-4" /> Route secured</Eyebrow><Title>Your Journey is ready.</Title><Lead>{goal || initialGoal || 'The path is built. What happens next becomes the Journey World.'}</Lead>
            <div className="mt-8 flex h-36 max-w-2xl items-center gap-4 border-y border-white/12 px-4" aria-hidden="true"><span className="h-5 w-5 rounded-full bg-flow-success" /><span className="h-1 flex-1 -rotate-2 bg-flow-orange/50" /><span className="h-8 w-8 rotate-3 bg-flow-orange shadow-[0_0_24px_rgba(255,122,26,.45)]" /><span className="h-1 flex-1 rotate-2 bg-flow-orange/25" /><span className="h-5 w-5 rounded-full border-4 border-flow-violet" /></div>
            <PrimaryAction onClick={() => journey?.id ? router.push(`/learn/${journey.id}`) : toast.error('Flow lost the Journey address. Please refresh.')}>Enter Journey</PrimaryAction>
            {journey?.id && <p className="mt-3 text-xs text-flow-muted">Journey ID {journey.id}</p>}
          </>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) { return <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[.22em] text-flow-orange">{children}</p> }
function Title({ children }: { children: React.ReactNode }) { return <h1 className="max-w-4xl text-[clamp(2.25rem,5.4vw,5.2rem)] font-black leading-[.95] tracking-[-.055em]">{children}</h1> }
function Lead({ children }: { children: React.ReactNode }) { return <p className="mt-5 max-w-2xl text-base leading-relaxed text-flow-muted sm:text-lg">{children}</p> }
function PrimaryAction({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) { return <motion.button whileTap={{ scale: .97, y: 3 }} type="button" onClick={onClick} disabled={disabled} className="mt-7 inline-flex min-h-14 items-center gap-3 bg-flow-orange px-7 py-3 text-base font-black text-flow-void shadow-[0_6px_0_#8f3600] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{children}<ArrowRight className="h-5 w-5" /></motion.button> }
function InlineError({ title, detail }: { title: string; detail: string }) { return <div role="alert" className="mt-5 border-l-4 border-rose-400 pl-4"><p className="font-black text-rose-300">{title}</p><p className="mt-1 text-sm text-flow-muted">{detail}</p></div> }
function Failure({ error, detail, onRetry, onReplace, busy }: { error: string; detail: string; onRetry: () => void; onReplace: () => void; busy: boolean }) { return <div className="mt-7"><InlineError title={error} detail={detail} /><div className="mt-4 flex gap-4"><button disabled={busy} onClick={onRetry} className="font-black text-flow-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-orange">Try again</button><button onClick={onReplace} className="font-black text-flow-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-orange">Choose another material</button></div></div> }
function safeName(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'study-material' }
function errorMessage(caught: unknown) { const error = caught as AxiosError<any>; return String(error.response?.data?.error || error.response?.data?.detail || error.message || 'Please try again.') }
function processingCopy(progress: number, raw?: string) {
  if (progress < 20) return { title: 'Reading the material…', reaction: 'Let me get the pages in order.' }
  if (progress < 45) return { title: 'Finding the important bits…', reaction: 'There’s a lot hiding in here.' }
  if (progress < 78) return { title: 'Connecting ideas…', reaction: 'Found the backbone.' }
  return { title: 'Almost there…', reaction: raw ? 'Okay, this makes sense.' : 'The shape is coming together.' }
}
