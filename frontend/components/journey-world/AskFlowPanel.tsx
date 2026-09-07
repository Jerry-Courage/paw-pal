'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { X, Send, ArrowLeft } from 'lucide-react'
import { learningApi } from '@/lib/api'
import type { EncounterActivity } from '@/types/journey'
import JourneyLearningObject from './JourneyLearningObject'
import FlowReaction from './FlowReaction'

type Reply = { answer: string; canvas?: EncounterActivity; assessment_protected: boolean }
type Exchange = { question: string; reply: Reply }

export default function AskFlowPanel({ nodeId, onClose, onVoice, onCards }: { nodeId: string; onClose: () => void; onVoice: () => void; onCards: () => void }) {
  const [question, setQuestion] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [canvas, setCanvas] = useState<EncounterActivity | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const requestKey = useRef<string>('')
  const history = useQuery({ queryKey: ['ask-flow', nodeId], queryFn: () => learningApi.getAskFlowHistory(nodeId).then(r => r.data.exchanges as Exchange[]) })
  useEffect(() => { if (history.data) setExchanges(history.data) }, [history.data])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previous?.focus()
  }, [])
  const ask = useMutation({ mutationFn: (text: string) => learningApi.askFlowInConcept(nodeId, { question: text, idempotency_key: requestKey.current }).then(r => r.data as Reply), onSuccess: (reply, text) => { setExchanges(v => [...v, { question: text, reply }]); setQuestion(''); requestKey.current = '' } })
  const submit = () => { if (!question.trim() || ask.isPending) return; requestKey.current ||= crypto.randomUUID(); ask.mutate(question.trim()) }
  return <div className="fixed inset-0 z-[75] flex items-end justify-end bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="ask-flow-title" className="flex max-h-[85dvh] w-full flex-col rounded-t-3xl border border-white/10 bg-flow-void p-4 shadow-2xl sm:max-w-lg sm:rounded-3xl" onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') { const elements = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea'); if (!elements?.length) return; const first = elements[0], last = elements[elements.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() } }
    }}>
      <header className="flex items-center justify-between"><h2 id="ask-flow-title" className="font-black">Ask Flow</h2><button onClick={onClose} aria-label="Return to lesson" className="grid h-11 w-11 place-items-center"><X /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3" aria-live="polite">
        {canvas ? <><button onClick={() => setCanvas(null)} className="mb-4 flex min-h-11 items-center gap-2 text-flow-violet"><ArrowLeft size={16} /> Back to conversation</button><JourneyLearningObject object={canvas} /></> : <>
          {exchanges.length === 0 && <p className="text-sm text-flow-muted">Ask about what Flow is showing you. Your place in the lesson stays saved.</p>}
          {exchanges.map((item, i) => <div key={i} className="mb-5 space-y-3"><p className="ml-8 rounded-2xl bg-white/5 p-3 text-sm">{item.question}</p><p className="whitespace-pre-wrap text-sm leading-6">{item.reply.answer}</p>{item.reply.assessment_protected && <p className="text-xs text-flow-muted">Hints during your check</p>}{item.reply.canvas && <button className="min-h-11 text-sm font-bold text-flow-violet" onClick={() => setCanvas(item.reply.canvas!)}>Show this explanation</button>}</div>)}
        </>}
        {ask.isPending && <FlowReaction state="THINKING" line="Thinking about your question…" />}
        {ask.isError && <p role="alert" className="text-sm text-rose-300">That didn’t reach Flow. Try sending it again.</p>}
      </div>
      <div className="flex gap-4 text-xs font-bold text-flow-violet"><button className="min-h-11" onClick={onVoice}>Talk to Flow</button><button className="min-h-11" onClick={onCards}>Make revision cards</button></div>
      <div className="flex gap-2 border-t border-white/10 pt-3"><textarea aria-label="Your question" value={question} maxLength={3000} onChange={e => { setQuestion(e.target.value); requestKey.current = '' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} placeholder="Ask about this idea…" rows={2} className="min-w-0 flex-1 resize-none rounded-xl bg-white/5 p-3 outline-none focus:ring-2 focus:ring-flow-violet" /><button onClick={submit} disabled={ask.isPending || !question.trim()} aria-label="Send question" className="grid min-h-11 w-11 place-items-center text-flow-orange disabled:opacity-30"><Send size={20} /></button></div>
    </div>
  </div>
}
