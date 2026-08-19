'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Mic, MicOff, Volume2, VolumeX, MessageSquare, FlipHorizontal, Camera } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type LiveState = 'idle' | 'connecting' | 'listening' | 'analyzing' | 'speaking' | 'ended'

interface SubtitleEntry {
  role: 'user' | 'ai'
  text: string
  ts: number
}

export default function CameraVisionModal({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasDrawRef = useRef<number>(0)

  const playbackCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])
  const playDoneTimeoutRef = useRef<any>(null)

  const micCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const micMutedRef = useRef(false)

  const [state, setState] = useState<LiveState>('idle')
  const [micMuted, setMicMuted] = useState(false)
  const [speakerMuted, setSpeakerMuted] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [subtitles, setSubtitles] = useState<SubtitleEntry[]>([])
  const [aiStatusText, setAiStatusText] = useState('Connecting...')
  const [textInput, setTextInput] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)

  useEffect(() => { micMutedRef.current = micMuted }, [micMuted])

  const cleanup = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (workletNodeRef.current) { workletNodeRef.current.disconnect(); workletNodeRef.current = null }
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null }
    if (micCtxRef.current) { micCtxRef.current.close().catch(() => {}); micCtxRef.current = null }
    activeSourcesRef.current.forEach(s => { try { s.stop() } catch {} })
    activeSourcesRef.current = []
    if (playbackCtxRef.current) { playbackCtxRef.current.close().catch(() => {}); playbackCtxRef.current = null }
    if (playDoneTimeoutRef.current) clearTimeout(playDoneTimeoutRef.current)
    if (canvasDrawRef.current) cancelAnimationFrame(canvasDrawRef.current)
    nextPlayTimeRef.current = 0
  }, [])

  const startCameraAndMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: {
          sampleRate: { ideal: 16000 },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }

      const ctx = new AudioContext({ sampleRate: 16000 })
      micCtxRef.current = ctx
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {})

      const source = ctx.createMediaStreamSource(stream)

      try {
        await ctx.audioWorklet.addModule('/noise-gate-processor.js')
        const worklet = new AudioWorkletNode(ctx, 'noise-gate', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
        })
        workletNodeRef.current = worklet

        source.connect(worklet)

        const captureNode = ctx.createScriptProcessor(1024, 1, 1)
        processorRef.current = captureNode
        worklet.connect(captureNode)

        const silentGain = ctx.createGain()
        silentGain.gain.value = 0
        captureNode.connect(silentGain)
        silentGain.connect(ctx.destination)

        captureNode.onaudioprocess = (e) => {
          if (micMutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
          if (ctx.state !== 'running') { ctx.resume().catch(() => {}) }

          const float32 = e.inputBuffer.getChannelData(0).slice()
          const pcm16 = new Int16Array(float32.length)
          for (let i = 0; i < float32.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
          }

          const bytes = new Uint8Array(pcm16.buffer)
          const header = new Uint8Array([0x01, 0x00, 0x00, 0x00])
          const frame = new Uint8Array(header.length + bytes.byteLength)
          frame.set(header, 0)
          frame.set(bytes, header.length)
          wsRef.current.send(frame)
        }
        return
      } catch {
        // Fallback to ScriptProcessor
      }

      const processor = ctx.createScriptProcessor(2048, 1, 1)
      processorRef.current = processor
      source.connect(processor)

      const silentGain = ctx.createGain()
      silentGain.gain.value = 0
      processor.connect(silentGain)
      silentGain.connect(ctx.destination)

      processor.onaudioprocess = (e) => {
        if (micMutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        if (ctx.state !== 'running') { ctx.resume().catch(() => {}) }

        const float32 = e.inputBuffer.getChannelData(0).slice()
        const pcm16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
        }

        const bytes = new Uint8Array(pcm16.buffer)
        const header = new Uint8Array([0x01, 0x00, 0x00, 0x00])
        const frame = new Uint8Array(header.length + bytes.byteLength)
        frame.set(header, 0)
        frame.set(bytes, header.length)
        wsRef.current.send(frame)
      }
    } catch {
      toast.error('Camera or microphone access denied. Please allow permissions.')
    }
  }, [facingMode])

  const enqueueAiAudio = useCallback((b64Pcm: string) => {
    if (speakerMuted) return

    const raw = atob(b64Pcm)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    const int16 = new Int16Array(bytes.buffer)
    const pcm = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      pcm[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF)
    }

    const ctx = playbackCtxRef.current || new AudioContext()
    playbackCtxRef.current = ctx

    const buffer = ctx.createBuffer(1, pcm.length, 24000)
    buffer.copyToChannel(pcm as any, 0)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current)
    source.start(startAt)
    nextPlayTimeRef.current = startAt + buffer.duration

    activeSourcesRef.current.push(source)
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source)
    }

    clearTimeout(playDoneTimeoutRef.current)
    playDoneTimeoutRef.current = setTimeout(() => {
      nextPlayTimeRef.current = 0
    }, (nextPlayTimeRef.current - ctx.currentTime) * 1000 + 500)
  }, [speakerMuted])

  const captureAndSendFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !wsRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'camera_frame', data: dataUrl }))
    }
  }, [])

  const startFrameCapture = useCallback(() => {
    let running = true
    const tick = () => {
      if (!running) return
      captureAndSendFrame()
      canvasDrawRef.current = requestAnimationFrame(tick)
    }
    canvasDrawRef.current = requestAnimationFrame(tick)
    return () => { running = false }
  }, [captureAndSendFrame])

  const sendTextQuery = useCallback(() => {
    if (!textInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'text_query', text: textInput.trim() }))
    setTextInput('')
  }, [textInput])

  const connectWebSocket = useCallback(async () => {
    setState('connecting')
    setAiStatusText('Connecting to Flow AI...')
    try {
      const wsUrl = await aiApi.getLiveVisionWsUrl()
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'start', voice: 'default', system_prompt: '' }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          switch (msg.type) {
            case 'ready':
              setState('listening')
              setAiStatusText('Listening — speak or show me something!')
              startFrameCapture()
              break
            case 'ai_audio':
              enqueueAiAudio(msg.data)
              break
            case 'ai_text':
              setSubtitles(prev => [...prev.slice(-20), { role: 'ai', text: msg.text, ts: Date.now() }])
              break
            case 'user_transcript':
              setSubtitles(prev => [...prev.slice(-20), { role: 'user', text: msg.text, ts: Date.now() }])
              break
            case 'status':
              if (msg.state === 'listening') setAiStatusText('Listening...')
              else if (msg.state === 'analyzing') setAiStatusText('Analyzing camera...')
              else if (msg.state === 'speaking') setAiStatusText('Speaking...')
              setState(msg.state as LiveState)
              break
            case 'error':
              toast.error(msg.message)
              break
            case 'ended':
              cleanup()
              setState('ended')
              break
          }
        } catch {}
      }

      ws.onerror = () => {
        toast.error('Connection failed')
        setState('idle')
      }

      ws.onclose = (e) => {
        if (e.code !== 1000 && state !== 'ended' && state !== 'idle') {
          setAiStatusText('Reconnecting...')
          setTimeout(() => {
            if (state !== 'ended' && state !== 'idle') {
              connectWebSocket()
            }
          }, 2000)
        }
      }
    } catch {
      toast.error('Failed to connect')
      setState('idle')
    }
  }, [startFrameCapture, enqueueAiAudio, cleanup, state])

  const endSession = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end' }))
    }
    cleanup()
    onClose()
  }, [cleanup, onClose])

  const flipCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }, [])

  useEffect(() => {
    startCameraAndMic()
    connectWebSocket()
    return () => cleanup()
  }, [facingMode, startCameraAndMic, connectWebSocket, cleanup])

  return (
    <div className="fixed inset-0 z-[999] bg-black flex flex-col overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera feed — fills entire viewport */}
      <div className="absolute inset-0 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70 pointer-events-none" />
      </div>

      {/* Top bar — close, status, subtitles toggle */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 pt-2 pb-2" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <button onClick={endSession} className="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
          <X className="w-5 h-5 text-white" />
        </button>

        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border text-[11px] font-bold tracking-wide',
          state === 'listening' && 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
          state === 'analyzing' && 'bg-amber-500/15 border-amber-500/30 text-amber-300',
          state === 'speaking' && 'bg-violet-500/15 border-violet-500/30 text-violet-300',
          state === 'connecting' && 'bg-white/10 border-white/10 text-white/60',
          state === 'ended' && 'bg-red-500/15 border-red-500/30 text-red-300',
        )}>
          <div className={cn(
            'w-1.5 h-1.5 rounded-full',
            state === 'listening' && 'bg-emerald-400 animate-pulse',
            state === 'analyzing' && 'bg-amber-400 animate-pulse',
            state === 'speaking' && 'bg-violet-400 animate-pulse',
            state === 'connecting' && 'bg-white/40 animate-pulse',
            state === 'ended' && 'bg-red-400',
          )} />
          <span>{aiStatusText}</span>
        </div>

        <button
          onClick={flipCamera}
          className="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10"
        >
          <FlipHorizontal className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Subtitles — middle of screen, above controls */}
      {subtitles.length > 0 && (
        <div className="absolute left-3 right-3 z-20 pointer-events-none" style={{ bottom: 'calc(8rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="max-w-lg mx-auto space-y-1.5">
            {subtitles.slice(-3).map((sub, i) => (
              <div
                key={sub.ts + i}
                className={cn(
                  'px-3 py-2 rounded-xl text-xs font-medium backdrop-blur-md animate-fade-in',
                  sub.role === 'ai'
                    ? 'bg-black/60 text-white border border-white/10 ml-0 mr-6'
                    : 'bg-violet-500/20 text-violet-300 border border-violet-500/20 ml-6 mr-0'
                )}
              >
                {sub.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom controls — safe area aware, above mobile nav */}
      <div className="absolute bottom-0 left-0 right-0 z-20" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {/* Text input — toggleable */}
        {showTextInput && (
          <div className="px-3 mb-2">
            <form onSubmit={e => { e.preventDefault(); sendTextQuery() }} className="flex gap-2 max-w-lg mx-auto">
              <input
                type="text"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder="Type a question..."
                className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white text-sm placeholder-white/40 outline-none focus:border-violet-500/40"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendTextQuery() } }}
              />
              <button
                type="submit"
                disabled={!textInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-30 shrink-0"
              >
                Ask
              </button>
            </form>
          </div>
        )}

        {/* Control buttons — centered row */}
        <div className="flex items-center justify-center gap-4 px-3">
          {/* Mic toggle */}
          <button
            onClick={() => setMicMuted(v => !v)}
            className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition-all active:scale-95',
              micMuted
                ? 'bg-red-500/20 border-red-500/30'
                : 'bg-white/10 border-white/20'
            )}
          >
            {micMuted ? <MicOff className="w-5 h-5 text-red-400" /> : <Mic className="w-5 h-5 text-white" />}
          </button>

          {/* End call — big red center */}
          <button
            onClick={endSession}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95 transition-all"
          >
            <X className="w-7 h-7 text-white" />
          </button>

          {/* Speaker toggle */}
          <button
            onClick={() => setSpeakerMuted(v => !v)}
            className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition-all active:scale-95',
              speakerMuted
                ? 'bg-red-500/20 border-red-500/30'
                : 'bg-white/10 border-white/20'
            )}
          >
            {speakerMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-white" />}
          </button>

          {/* Text toggle */}
          <button
            onClick={() => setShowTextInput(v => !v)}
            className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition-all active:scale-95',
              showTextInput
                ? 'bg-violet-500/20 border-violet-500/30'
                : 'bg-white/10 border-white/20'
            )}
          >
            <MessageSquare className="w-5 h-5 text-white" />
          </button>

          {/* Manual camera capture */}
          <button
            onClick={captureAndSendFrame}
            className="w-14 h-14 rounded-full bg-violet-600/80 hover:bg-violet-600 flex items-center justify-center border border-violet-400/30 active:scale-95 transition-all"
          >
            <Camera className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}
