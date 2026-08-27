'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react'
import FlowCompanion from '@/components/onboarding/FlowCompanion'
import { API_BASE, getAuthToken } from '@/lib/api'
import type { TeachingSessionResponse } from '@/types/journey'

type VoiceState = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'

function decodePcm(value: string) {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  const samples = new Int16Array(bytes.buffer)
  return Float32Array.from(samples, sample => sample / 32768)
}

export default function TeachingVoiceMode({ session, onClose, feynman = false }: { session: TeachingSessionResponse; onClose: () => void; feynman?: boolean }) {
  const reduceMotion = useReducedMotion()
  const [state, setState] = useState<VoiceState>('connecting')
  const [muted, setMuted] = useState(false)
  const [subtitle, setSubtitle] = useState('Connecting to Flow…')
  const socketRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const captureContextRef = useRef<AudioContext | null>(null)
  const playbackContextRef = useRef<AudioContext | null>(null)
  const nextPlaybackRef = useRef(0)
  const mutedRef = useRef(false)
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  const onCloseRef = useRef(onClose)

  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  const play = useCallback((value: string) => {
    const samples = decodePcm(value)
    const context = playbackContextRef.current || new AudioContext()
    playbackContextRef.current = context
    const buffer = context.createBuffer(1, samples.length, 24000)
    buffer.copyToChannel(samples, 0)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const start = Math.max(context.currentTime, nextPlaybackRef.current)
    source.start(start)
    nextPlaybackRef.current = start + buffer.duration
    sourcesRef.current.push(source)
    setState('speaking')
    source.onended = () => {
      sourcesRef.current = sourcesRef.current.filter(item => item !== source)
      if (!sourcesRef.current.length) setState('listening')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
        if (cancelled) return stream.getTracks().forEach(track => track.stop())
        streamRef.current = stream
        const token = await getAuthToken()
        const host = (API_BASE || '').replace(/^https?:\/\//, '').replace(/\/api$/, '')
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const socket = new WebSocket(`${protocol}//${host}/ws/personalised/?token=${token}`)
        socketRef.current = socket
        socket.onopen = () => socket.send(JSON.stringify({ type: 'start', voice: 'Aoede', teaching_session_id: session.id, feynman_mode: feynman }))
        socket.onmessage = async event => {
          const message = JSON.parse(event.data)
          if (message.type === 'ready') {
            setState('listening'); setSubtitle('I’m listening.')
            const context = new AudioContext({ sampleRate: 16000 })
            captureContextRef.current = context
            const source = context.createMediaStreamSource(stream)
            const processor = context.createScriptProcessor(1024, 1, 1)
            const silent = context.createGain(); silent.gain.value = 0
            source.connect(processor); processor.connect(silent); silent.connect(context.destination)
            processor.onaudioprocess = audioEvent => {
              if (mutedRef.current || socket.readyState !== WebSocket.OPEN) return
              const input = audioEvent.inputBuffer.getChannelData(0)
              const pcm = new Int16Array(input.length)
              for (let i = 0; i < input.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, input[i] * 32767))
              const packet = new Uint8Array(4 + pcm.byteLength); packet[0] = 1; packet.set(new Uint8Array(pcm.buffer), 4)
              if (socket.bufferedAmount < 512000) socket.send(packet)
            }
          } else if (message.type === 'audio') play(message.data)
          else if (message.type === 'transcript_user') { setState('thinking'); setSubtitle(message.text) }
          else if (message.type === 'transcript_ai') { setState('speaking'); setSubtitle(current => `${current === 'I’m listening.' ? '' : current}${message.text}`.slice(-240)) }
          else if (message.type === 'session_report') onCloseRef.current()
          else if (message.type === 'error') { setState('error'); setSubtitle(message.message || 'Voice could not connect.') }
        }
        socket.onerror = () => { setState('error'); setSubtitle('Voice could not connect. Your text lesson is still safe.') }
      } catch {
        setState('error'); setSubtitle('Microphone access is needed for Talk mode.')
      }
    }
    start()
    return () => {
      cancelled = true
      socketRef.current?.close()
      streamRef.current?.getTracks().forEach(track => track.stop())
      captureContextRef.current?.close().catch(() => {})
      playbackContextRef.current?.close().catch(() => {})
      sourcesRef.current.forEach(source => { try { source.stop() } catch {} })
    }
  }, [play, session.id, feynman])

  const end = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: 'end_session' }))
    else onCloseRef.current()
  }
  const avatarState = state === 'speaking' ? 'speaking' : state === 'thinking' ? 'thinking' : state === 'listening' ? 'listening' : 'idle'

  return <motion.section role="dialog" aria-modal="true" aria-label={feynman ? 'Teach Flow' : 'Talk with Flow'} className="fixed inset-0 z-[80] grid place-items-center overflow-hidden bg-flow-void px-5 text-flow-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(124,92,255,.20),transparent_32%),radial-gradient(circle_at_50%_45%,rgba(255,122,26,.10),transparent_52%)]" />
    <div className="relative flex w-full max-w-xl flex-col items-center text-center">
      <p className="text-xs font-black uppercase tracking-[.28em] text-flow-violet">{feynman ? 'Final understanding check · teach Flow' : 'Same lesson · voice mode'}</p>
      <div className="relative mt-10 grid h-52 w-52 place-items-center">
        <AnimatePresence>{state !== 'error' && [0, 1, 2].map(index => <motion.i key={index} aria-hidden="true" className="absolute inset-0 rounded-full border border-flow-violet/40" animate={reduceMotion ? undefined : { scale: [0.72, 1.12], opacity: [.55, 0] }} transition={{ duration: 2.2, repeat: Infinity, delay: index * .5 }} />)}</AnimatePresence>
        <FlowCompanion state={avatarState} className="relative z-10 w-32 drop-shadow-[0_18px_40px_rgba(124,92,255,.35)]" />
      </div>
      <h2 className="mt-6 text-3xl font-black tracking-[-.04em]">{state === 'connecting' ? 'Flow is joining…' : state === 'listening' ? (feynman ? 'Teach me.' : 'Listening') : state === 'thinking' ? 'Thinking' : state === 'speaking' ? (feynman ? 'Flow has a question' : 'Speaking') : 'Voice paused'}</h2>
      <p aria-live="polite" className="mt-4 min-h-14 max-w-md text-sm leading-relaxed text-flow-muted">{subtitle}</p>
      <div className="mt-10 flex items-center gap-5">
        <button onClick={() => setMuted(value => !value)} aria-pressed={muted} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} className="grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-white/[.06] focus-visible:ring-2 focus-visible:ring-flow-orange">{muted ? <MicOff /> : <Mic />}</button>
        <button onClick={end} aria-label="End voice and return to lesson" className="grid h-16 w-16 place-items-center rounded-full bg-rose-500 text-white shadow-lg focus-visible:ring-2 focus-visible:ring-white"><PhoneOff /></button>
        <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full border border-white/10 text-flow-violet"><Volume2 /></span>
      </div>
    </div>
  </motion.section>
}
