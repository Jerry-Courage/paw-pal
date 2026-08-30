'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Headphones, Lightbulb, Play, RefreshCw, RotateCcw } from 'lucide-react'
import { aiApi, libraryApi, podcastApi } from '@/lib/api'
import FlowCompanion from '@/components/onboarding/FlowCompanion'
import type { FlowObject } from '@/types/flow-object'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

function VideoObject({ object }: { object: FlowObject }) {
  const videos = object.payload.videos || []
  const [selected, setSelected] = useState(videos[0])
  if (object.state === 'error') return <ObjectError label="Video search face-planted." />
  if (!selected) return null
  return <section className="flow-native-object overflow-hidden" aria-label="Flow video">
    <div className="aspect-video w-full bg-background">
      <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${selected.video_id}`} title={selected.title} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
    </div>
    <div className="p-4"><p className="font-black text-on-surface">{selected.title}</p><p className="mt-1 text-xs text-on-surface-variant">{selected.channel}{selected.duration_str ? ` · ${selected.duration_str}` : ''}</p>
      {videos.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{videos.map((video: any) => <button key={video.video_id} onClick={() => setSelected(video)} className={cn('min-h-10 shrink-0 rounded-xl px-3 text-xs font-bold', selected.video_id === video.video_id ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant')}>{video.title}</button>)}</div>}
    </div>
  </section>
}

function FlashcardObject({ object }: { object: FlowObject }) {
  const cards = object.payload.cards || []
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [saving, setSaving] = useState(false)
  if (object.state === 'error') return <ObjectError label="Card generation face-planted." />
  const card = cards[index]
  if (!card) return null
  const save = async () => {
    setSaving(true)
    try {
      const deck = await libraryApi.createDeck(object.payload.title || 'Flow cards')
      await libraryApi.saveFlashcardsToDeck(deck.data.id, object.payload.resource_id, cards)
      toast.success('Deck saved to Flashcards')
    } catch { toast.error('Could not save that deck') } finally { setSaving(false) }
  }
  return <section className="flow-native-object p-4" aria-label="Flow flashcards">
    <div className="flex items-center justify-between"><span className="flow-object-label">Flashcards</span><span className="text-xs text-on-surface-variant">{index + 1} / {cards.length}</span></div>
    <button onClick={() => setFlipped(value => !value)} className="mt-3 flex min-h-48 w-full items-center justify-center rounded-2xl bg-surface-container-low p-6 text-center shadow-inner" aria-label={flipped ? 'Show card front' : 'Show card answer'}>
      <div><p className="text-[10px] font-black uppercase tracking-widest text-primary">{flipped ? 'Answer' : 'Question'}</p><p className="mt-3 text-lg font-bold leading-relaxed text-on-surface">{flipped ? card.answer : card.question}</p><p className="mt-5 text-xs text-on-surface-variant"><RotateCcw className="mr-1 inline h-3 w-3" />Tap to flip</p></div>
    </button>
    <div className="mt-3 flex items-center justify-between"><button disabled={index === 0} onClick={() => { setIndex(i => i - 1); setFlipped(false) }} className="flow-object-button"><ChevronLeft className="h-4 w-4" /> Previous</button><button onClick={save} disabled={saving} className="flow-object-button"><BookOpen className="h-4 w-4" />{saving ? 'Saving…' : 'Save deck'}</button><button disabled={index === cards.length - 1} onClick={() => { setIndex(i => i + 1); setFlipped(false) }} className="flow-object-button">Next <ChevronRight className="h-4 w-4" /></button></div>
  </section>
}

function PodcastObject({ object }: { object: FlowObject }) {
  const [status, setStatus] = useState(object.payload.status || object.state)
  const [script, setScript] = useState<any[]>([])
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (status === 'ready' || status === 'error') return
    const timer = window.setInterval(async () => {
      try { const response = await podcastApi.getStatus(object.payload.session_id); setStatus(response.data.status); setScript(response.data.script || []) } catch { setStatus('error') }
    }, 2500)
    return () => clearInterval(timer)
  }, [object.payload.session_id, status])
  const play = async () => {
    try { const response = await podcastApi.getChunk(object.payload.session_id, 0); const audio = new Audio(URL.createObjectURL(response.data)); audio.onended = () => setPlaying(false); setPlaying(true); await audio.play() } catch { setStatus('error') }
  }
  if (status === 'error') return <ObjectError label="Podcast generation face-planted 😭" />
  return <section className="flow-native-object flex items-center gap-4 p-4" aria-label="Flow podcast">
    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Headphones className="h-6 w-6" /></div><div className="min-w-0 flex-1"><span className="flow-object-label">Podcast</span><p className="truncate font-black text-on-surface">{object.payload.title}</p><p className="text-xs text-on-surface-variant">{status === 'ready' ? `${script.length || ''} segments ready` : 'Putting the episode together…'}</p></div><button disabled={status !== 'ready' || playing} onClick={play} className="grid h-11 w-11 place-items-center rounded-full bg-primary-container text-on-primary-container disabled:opacity-40"><Play className="h-4 w-4 fill-current" /></button>
  </section>
}

function FocusObject({ object, onAction }: { object: FlowObject; onAction: (text: string) => void }) {
  const recall = object.type === 'active_recall'
  return <section className="flow-native-object p-5" aria-label={recall ? 'Active Recall' : 'Feynman mode'}><div className="flex items-center gap-3"><FlowCompanion state={recall ? 'thinking' : 'teaching'} className="w-14 shrink-0" label="Flow" /><div><span className="flow-object-label">{recall ? 'Active Recall' : 'Feynman mode'}</span><p className="font-black text-on-surface">{recall ? `Question ${object.payload.question_index} of ${object.payload.question_total}` : `Teach Flow · ${object.payload.topic}`}</p></div></div><p className="mt-4 text-base font-bold leading-relaxed text-on-surface">{recall ? object.payload.question : object.payload.prompt}</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => onAction(recall ? 'I need a hint, but do not reveal the answer.' : `Here is my explanation of ${object.payload.topic}: `)} className="flow-object-button"><Lightbulb className="h-4 w-4" />{recall ? 'Hint' : 'Start explaining'}</button>{recall && <button onClick={() => onAction('I do not know. Teach me the smallest missing piece, then ask again.')} className="flow-object-button">I don’t know</button>}</div></section>
}

function PracticeObject({ object: initialObject, sessionId, onAction }: { object: FlowObject; sessionId?: number; onAction: (text: string) => void }) {
  const [object, setObject] = useState(initialObject)
  const [choice, setChoice] = useState<number | null>(null)
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const payload = object.payload
  const question = payload.questions?.[payload.question_index]
  const evaluation = payload.last_evaluation
  useEffect(() => { setChoice(null); setAnswer(''); setError('') }, [payload.question_index])
  if (!question) return <ObjectError label="This practice activity is unavailable." />
  const completed = payload.status === 'completed'
  const canSubmit = question.type === 'mcq' ? choice !== null : answer.trim().length >= 2
  const submit = async () => {
    if (!sessionId || !canSubmit || submitting || completed) return
    setSubmitting(true); setError('')
    try {
      const response = await aiApi.submitFlowObject(sessionId, object.id, question.type === 'mcq' ? { choice } : { text: answer.trim() }, `${object.id}:${question.id}`)
      setObject(response.data.object)
    } catch (caught: any) {
      setError(caught?.response?.data?.error || 'Your answer did not reach Flow. It is still here—try again.')
    } finally { setSubmitting(false) }
  }
  return <section className="flow-native-object overflow-hidden" aria-label="Interactive practice">
    <div className="border-b border-white/[.08] bg-flow-violet/[.07] px-4 py-3 sm:px-5"><div className="flex items-center justify-between gap-3"><span className="flow-object-label">Quick check · {payload.mode === 'journey' ? 'Journey evidence' : 'Practice'}</span><span className="text-xs font-black text-on-surface-variant">{Math.min((payload.question_offset || 0) + payload.question_index + 1, payload.session_question_total || payload.question_total)} / {payload.session_question_total || payload.question_total}</span></div><p className="mt-1 truncate text-xs font-bold text-flow-violet">{payload.topic}</p></div>
    <div className="p-4 sm:p-5">
      <h3 className="text-base font-black leading-relaxed text-on-surface sm:text-lg">{question.prompt}</h3>
      {!completed && question.type === 'mcq' && <fieldset className="mt-4 space-y-2"><legend className="sr-only">Choose one answer</legend>{question.options?.map((option: string, index: number) => <label key={`${question.id}-${index}`} className={cn('flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm font-bold transition focus-within:ring-2 focus-within:ring-flow-orange', choice === index ? 'border-flow-orange/60 bg-flow-orange/10 text-on-surface' : 'border-white/[.08] bg-surface-container-low text-on-surface-variant hover:bg-surface-hover')}><input type="radio" name={`practice-${object.id}-${question.id}`} value={index} checked={choice === index} onChange={() => setChoice(index)} className="mt-0.5 h-4 w-4 accent-orange-500" /><span>{option}</span></label>)}</fieldset>}
      {!completed && question.type !== 'mcq' && <label className="mt-4 block"><span className="sr-only">Your answer</span><textarea value={answer} onChange={event => setAnswer(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') submit() }} rows={3} placeholder="Explain it in your own words…" className="w-full resize-y rounded-xl border border-white/10 bg-surface-container-low p-3 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-flow-orange focus:ring-2 focus:ring-flow-orange/30" /></label>}
      {evaluation && <div role="status" aria-live="polite" className={cn('mt-4 flex items-start gap-3 rounded-xl border p-3 text-sm', evaluation.correct === false ? 'border-warning/25 bg-warning/[.07]' : 'border-flow-success/25 bg-flow-success/[.07]')}>{evaluation.correct === false ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-flow-success" />}<div><p className="font-black text-on-surface">{evaluation.correct === false ? 'Not quite yet.' : 'That holds.'}</p><p className="mt-1 leading-relaxed text-on-surface-variant">{evaluation.feedback}</p></div></div>}
      {payload.next_decision && <p className="mt-3 text-sm font-bold leading-relaxed text-flow-violet">Flow: {payload.next_decision}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-bold text-danger">{error}</p>}
      {!completed && <button onClick={submit} disabled={!sessionId || !canSubmit || submitting} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-container px-4 font-black text-on-primary-container shadow-[0_4px_0_rgba(143,54,0,1)] transition active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">{submitting ? 'Checking…' : 'Check answer'} <ChevronRight className="h-4 w-4" /></button>}
      {completed && <div className="mt-4 flex flex-wrap items-center gap-2"><p className="mr-auto text-xs font-black uppercase tracking-[.15em] text-flow-success">Practice complete · response saved</p><button onClick={() => onAction('give me one more')} className="flow-object-button">One more</button><button onClick={() => onAction('make the next one harder')} className="flow-object-button">Make it harder</button></div>}
    </div>
  </section>
}

function ObjectError({ label }: { label: string }) { return <section className="flow-native-object flex items-center gap-3 p-4 text-warning"><RefreshCw className="h-5 w-5" /><p className="font-bold">{label} Your context is still here—try again.</p></section> }

export default function FlowObjectRenderer({ object, onAction, sessionId }: { object: FlowObject; onAction: (text: string) => void; sessionId?: number }) {
  if (object.type === 'video') return <VideoObject object={object} />
  if (object.type === 'podcast') return <PodcastObject object={object} />
  if (object.type === 'flashcards') return <FlashcardObject object={object} />
  if (object.type === 'active_recall' || object.type === 'feynman') return <FocusObject object={object} onAction={onAction} />
  if (object.type === 'practice') return <PracticeObject object={object} sessionId={sessionId} onAction={onAction} />
  return null
}
