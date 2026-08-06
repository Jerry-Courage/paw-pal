'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { groupsApi, getAuthToken, API_BASE } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────
type Screen = 'home' | 'create' | 'lobby' | 'countdown' | 'question' | 'round_result' | 'leaderboard' | 'game_over'

interface Player   { username: string; score: number; streak: number; rank?: number }
interface Question { id: number; text: string; opt_a: string; opt_b: string; opt_c: string; opt_d: string; time_limit: number; idx: number; total: number }
interface RoundResult { correct: string; results: { username: string; choice: string; is_correct: boolean; points: number; time_taken: number }[]; leaderboard: Player[] }

const OPTION_COLORS = ['bg-[#e21b3c]', 'bg-[#1368ce]', 'bg-[#d89e00]', 'bg-[#26890c]']
const OPTION_KEYS   = ['A', 'B', 'C', 'D'] as const

// Inline Kahoot-style SVG shape icons
function OptionShape({ index, className = "w-6 h-6 fill-current shrink-0" }: { index: number; className?: string }) {
  switch (index) {
    case 0: // Triangle (A - Red)
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <polygon points="12,3 2,21 22,21" />
        </svg>
      )
    case 1: // Diamond (B - Blue)
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <polygon points="12,2 22,12 12,22 2,12" />
        </svg>
      )
    case 2: // Circle (C - Yellow)
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      )
    case 3: // Square (D - Green)
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      )
    default:
      return null
  }
}

// ── Sound engine (Web Audio API — no external deps) ──────────────────────────
function useSound() {
  const ctx = useRef<AudioContext | null>(null)
  const ensure = () => { if (!ctx.current) ctx.current = new (window.AudioContext || (window as any).webkitAudioContext)(); return ctx.current }

  const play = useCallback((freq: number, type: OscillatorType, dur: number, vol = 0.18) => {
    try {
      const c = ensure(); const osc = c.createOscillator(); const gain = c.createGain()
      osc.connect(gain); gain.connect(c.destination)
      osc.type = type; osc.frequency.setValueAtTime(freq, c.currentTime)
      gain.gain.setValueAtTime(vol, c.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur)
      osc.start(); osc.stop(c.currentTime + dur)
    } catch {}
  }, [])

  return {
    correct:     () => { play(523, 'sine', 0.15); setTimeout(() => play(659, 'sine', 0.15), 120); setTimeout(() => play(784, 'sine', 0.25), 240) },
    wrong:       () => { play(220, 'sawtooth', 0.3, 0.12) },
    tick:        () => play(880, 'square', 0.05, 0.06),
    urgentTick:  () => { play(1046, 'square', 0.08, 0.1); play(1046, 'square', 0.08, 0.1) },
    countdown:   () => play(440, 'sine', 0.3, 0.2),
    go:          () => { play(523, 'sine', 0.1); setTimeout(() => play(659, 'sine', 0.1), 80); setTimeout(() => play(784, 'sine', 0.1), 160); setTimeout(() => play(1046, 'sine', 0.35), 240) },
    join:        () => play(660, 'sine', 0.2, 0.15),
    gameOver:    () => { [523,659,784,1046,1318].forEach((f,i) => setTimeout(() => play(f,'sine',0.3,0.2), i*120)) },
  }
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function Confetti() {
  const pieces = Array.from({ length: 80 }, (_, i) => ({
    id: i, x: Math.random() * 100, delay: Math.random() * 2,
    color: ['#e21b3c','#1368ce','#26890c','#ffa602','#a855f7','#ec4899'][i % 6],
    size: 6 + Math.random() * 8,
  }))
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map(p => (
        <motion.div key={p.id} className="absolute rounded-sm"
          style={{ left: `${p.x}%`, top: -20, width: p.size, height: p.size * 0.6, backgroundColor: p.color }}
          initial={{ y: -20, rotate: 0, opacity: 1 }}
          animate={{ y: typeof window !== 'undefined' ? window.innerHeight + 40 : 800, rotate: 720, opacity: 0 }}
          transition={{ duration: 2.5 + Math.random(), delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}

// ── Main page component ───────────────────────────────────────────────────────
export default function QuizBattlePage() {
  const { data: session } = useSession()
  const snd = useSound()
  const me = session?.user?.username || session?.user?.name || 'You'

  // Screen state
  const [screen, setScreen]               = useState<Screen>('home')
  const [pin, setPin]                     = useState('')
  const [joinPinInput, setJoinPinInput]   = useState('')
  const [players, setPlayers]             = useState<Player[]>([])
  const [question, setQuestion]           = useState<Question | null>(null)
  const [timeLeft, setTimeLeft]           = useState(0)
  const [answered, setAnswered]           = useState<string | null>(null)
  const [answerTime, setAnswerTime]       = useState(0)
  const [roundResult, setRoundResult]     = useState<RoundResult | null>(null)
  const [leaderboard, setLeaderboard]     = useState<Player[]>([])
  const [countNum, setCountNum]           = useState(3)
  const [showConfetti, setShowConfetti]   = useState(false)
  const [isHost, setIsHost]               = useState(false)
  const [isConnecting, setIsConnecting]   = useState(false)
  const [isStarting, setIsStarting]       = useState(false)

  const wsRef        = useRef<WebSocket | null>(null)
  const qStartRef    = useRef<number>(0)
  // Ref keeps handleServerMsg always current inside the WS callback (avoids stale closure)
  const msgHandlerRef = useRef<(msg: any) => void>(() => {})

  // ── WebSocket connection ────────────────────────────────────────────────────
  const connect = useCallback(async (roomPin: string) => {
    setIsConnecting(true)
    const token = await getAuthToken()
    const base  = (API_BASE || '').replace(/^https?:\/\//, '').replace(/\/api$/, '')
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host  = base || (window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host)
    const url   = `${proto}//${host}/ws/quiz/${roomPin}/${token ? `?token=${token}` : ''}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen  = () => setIsConnecting(false)
    ws.onerror = () => { setIsConnecting(false); toast.error('Connection failed.') }
    ws.onclose = () => {}

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      msgHandlerRef.current(msg)
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  useEffect(() => () => { disconnect() }, [disconnect])

  // ── Handle incoming WS messages ────────────────────────────────────────────
  const handleServerMsg = useCallback((msg: any) => {
    switch (msg.type) {
      case 'player_joined':
        setPlayers(msg.players || [])
        if (msg.username !== me) snd.join()
        break

      case 'player_left':
        setPlayers(msg.players || [])
        break

      case 'game_countdown':
        setIsStarting(false)
        setScreen('countdown')
        setCountNum(msg.count)
        snd.countdown()
        break

      case 'show_question':
        setIsStarting(false)
        setQuestion({ id: msg.id, text: msg.text, opt_a: msg.opt_a, opt_b: msg.opt_b, opt_c: msg.opt_c, opt_d: msg.opt_d, time_limit: msg.time_limit, idx: msg.idx, total: msg.total })
        setTimeLeft(msg.time_limit)
        setAnswered(null)
        setAnswerTime(0)
        qStartRef.current = Date.now()
        setScreen('question')
        break

      case 'timer_tick':
        setTimeLeft(msg.remaining)
        if (msg.remaining <= 5) snd.urgentTick()
        else if (msg.remaining <= 10) snd.tick()
        break

      case 'round_result':
        setRoundResult({ correct: msg.correct, results: msg.results || [], leaderboard: msg.leaderboard || [] })
        setLeaderboard(msg.leaderboard || [])
        setScreen('round_result')
        break

      case 'leaderboard':
        setLeaderboard(msg.leaderboard || [])
        setScreen('leaderboard')
        break

      case 'game_over':
        setLeaderboard(msg.leaderboard || [])
        setScreen('game_over')
        setShowConfetti(true)
        snd.gameOver()
        setTimeout(() => setShowConfetti(false), 4000)
        break
    }
  }, [me, snd])

  // Keep ref current so WS callback always calls latest handler
  useEffect(() => { msgHandlerRef.current = handleServerMsg }, [handleServerMsg])

  // Re-wire handler when it updates (avoids stale closure)
  useEffect(() => {
    if (!wsRef.current) return
    wsRef.current.onmessage = (ev) => msgHandlerRef.current(JSON.parse(ev.data))
  }, [handleServerMsg])

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleJoinRoom = async () => {
    const p = joinPinInput.trim().toUpperCase()
    if (p.length !== 6) return toast.error('Enter a valid 6-digit PIN.')
    try {
      await groupsApi.joinQuiz(p)
      setPin(p)
      setIsHost(false)
      await connect(p)
      setScreen('lobby')
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not join room.')
    }
  }

  const handleStartGame = () => {
    if (isStarting) return
    setIsStarting(true)
    wsRef.current?.send(JSON.stringify({ type: 'start_game' }))
  }

  const handleAnswer = (choice: string) => {
    if (answered) return
    const elapsed = (Date.now() - qStartRef.current) / 1000
    setAnswered(choice)
    setAnswerTime(elapsed)
    wsRef.current?.send(JSON.stringify({ type: 'submit_answer', choice, time_taken: elapsed }))
    snd.tick()
  }

  const goHome = () => { disconnect(); setScreen('home'); setPin(''); setPlayers([]); setQuestion(null); setRoundResult(null); setLeaderboard([]); setIsHost(false); setIsStarting(false) }

  // ── Play correct/wrong sound when round result arrives ─────────────────────
  useEffect(() => {
    if (screen !== 'round_result' || !roundResult || !answered) return
    if (answered === roundResult.correct) snd.correct()
    else snd.wrong()
  }, [screen, roundResult, answered])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d091b] text-white relative overflow-x-hidden selection:bg-primary selection:text-white">
      {showConfetti && <Confetti />}

      {/* Safe-area top spacer — pushes content below iPhone notch/Dynamic Island */}
      <div className="tool-header-safe" />

      {/* Animated background glowing blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] left-[-10%] w-[70vw] h-[70vw] max-w-[600px] max-h-[600px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[60vw] h-[60vw] max-w-[500px] max-h-[500px] rounded-full bg-[#a855f7]/15 blur-[100px]" />
      </div>

      <div className="relative z-10 h-[100dvh] flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {screen === 'home'        && <HomeScreen     key="home"     onCreate={() => setScreen('create')} onJoin={handleJoinRoom} joinPin={joinPinInput} setJoinPin={setJoinPinInput} />}
          {screen === 'create'      && <CreateScreen   key="create"   onBack={() => setScreen('home')} onCreated={async (roomPin, host) => { setPin(roomPin); setIsHost(host); await connect(roomPin); setScreen('lobby') }} />}
          {screen === 'lobby'       && <LobbyScreen    key="lobby"    pin={pin} players={players} isHost={isHost} onStart={handleStartGame} onLeave={goHome} isConnecting={isConnecting} isStarting={isStarting} me={me} />}
          {screen === 'countdown'   && <CountdownScreen key="countdown" count={countNum} />}
          {screen === 'question'    && question && <QuestionScreen key={`q-${question.idx}`} question={question} timeLeft={timeLeft} setTimeLeft={setTimeLeft} answered={answered} onAnswer={handleAnswer} />}
          {screen === 'round_result' && roundResult && <RoundResultScreen key="result" result={roundResult} answered={answered} me={me} isHost={isHost} />}
          {screen === 'leaderboard' && <LeaderboardScreen key="lb" leaderboard={leaderboard} me={me} />}
          {screen === 'game_over'   && <GameOverScreen  key="gameover" leaderboard={leaderboard} me={me} onPlayAgain={goHome} />}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Home
// ══════════════════════════════════════════════════════════════════════════════
function HomeScreen({ onCreate, onJoin, joinPin, setJoinPin }: { onCreate: () => void; onJoin: () => void; joinPin: string; setJoinPin: (v: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="h-[100dvh] flex flex-col items-center justify-center px-4 py-8 gap-8 max-w-4xl mx-auto overflow-y-auto"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 24px)' }}>

      {/* Back to Dashboard */}
      <a href="/dashboard" className="self-start flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors text-[13px] font-semibold -mb-4">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Dashboard
      </a>

      {/* Hero Header */}
      <div className="text-center space-y-3">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.1 }}
          className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-tr from-primary via-[#a855f7] to-[#ec4899] rounded-[2rem] flex items-center justify-center text-[40px] md:text-[50px] shadow-[0_0_40px_rgba(168,85,247,0.4)] mx-auto mb-4 select-none">
          ⚡
        </motion.div>
        <h1 className="text-[36px] sm:text-[48px] md:text-[60px] font-black tracking-tight leading-none bg-gradient-to-r from-white via-slate-100 to-white/70 bg-clip-text text-transparent">
          Quiz <span className="bg-gradient-to-r from-primary via-[#a855f7] to-[#ec4899] bg-clip-text text-transparent">Battle</span>
        </h1>
        <p className="text-[14px] sm:text-[16px] text-slate-400 max-w-md mx-auto font-medium">Real-time multiplayer quiz games. Host a room or join a live battle!</p>
      </div>

      {/* Action Cards */}
      <div className="flex flex-col sm:flex-row gap-5 w-full max-w-lg">
        {/* Create Card */}
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={onCreate}
          className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6 sm:p-8 bg-gradient-to-br from-primary/90 to-[#a855f7]/90 rounded-[2rem] border border-white/20 shadow-[0_12px_40px_rgba(var(--color-primary),0.35)] cursor-pointer group">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[32px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
          </div>
          <div>
            <span className="text-[20px] font-black block">Create Room</span>
            <span className="text-[12px] text-white/70 font-medium">AI builds quiz from your notes</span>
          </div>
        </motion.button>

        {/* Join Card */}
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6 sm:p-8 bg-white/5 rounded-[2rem] border border-white/10 backdrop-blur-xl">
          <div className="w-14 h-14 rounded-2xl bg-tertiary/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>style</span>
          </div>
          <span className="text-[20px] font-black">Join Room</span>
          <input value={joinPin} onChange={e => setJoinPin(e.target.value.replace(/\D/g,'').slice(0,6))}
            placeholder="6-Digit PIN"
            maxLength={6}
            className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-3 text-[20px] font-black text-center tracking-[0.25em] focus:outline-none focus:border-tertiary transition-all placeholder:text-white/20 placeholder:tracking-normal text-tertiary" />
          <motion.button whileTap={{ scale: 0.95 }} onClick={onJoin} disabled={joinPin.length !== 6}
            className="w-full py-3 bg-tertiary text-black font-black rounded-xl text-[14px] disabled:opacity-40 transition-all hover:brightness-110 shadow-lg shadow-tertiary/20">
            Join Now
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Create — AI-powered from library resource
// ══════════════════════════════════════════════════════════════════════════════
function CreateScreen({ onBack, onCreated }: { onBack: () => void; onCreated: (pin: string, isHost: boolean) => void }) {
  const [resources, setResources]     = useState<any[]>([])
  const [selected, setSelected]       = useState<any>(null)
  const [topic, setTopic]             = useState('')
  const [title, setTitle]             = useState('')
  const [count, setCount]             = useState(10)
  const [timePerQ, setTimePerQ]       = useState(20)
  const [loading, setLoading]         = useState(false)
  const [fetching, setFetching]       = useState(true)
  const fileRef                       = useRef<HTMLInputElement>(null)
  const [uploadFile, setUploadFile]   = useState<File | null>(null)

  useEffect(() => {
    const { libraryApi } = require('@/lib/api')
    libraryApi.getResources().then((r: any) => {
      const items = Array.isArray(r.data) ? r.data : r.data?.results || []
      setResources(items)
    }).catch(() => {}).finally(() => setFetching(false))
  }, [])

  const handleGenerate = async () => {
    if (!topic.trim() && !selected && !uploadFile) return toast.error('Enter a topic, pick a resource, or upload a file.')
    setLoading(true)
    try {
      let resourceId = selected?.id
      if (uploadFile && !selected) {
        const { libraryApi } = require('@/lib/api')
        const fd = new FormData()
        fd.append('file', uploadFile)
        fd.append('title', uploadFile.name.replace(/\.[^.]+$/, ''))
        const upRes = await libraryApi.uploadResource(fd)
        resourceId = upRes.data.id
      }
      const res = await groupsApi.generateQuiz({
        topic: topic.trim() || undefined,
        resource_id: resourceId,
        title: title.trim() || undefined,
        count,
        time_per_q: timePerQ,
      })
      onCreated(res.data.pin, true)
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not generate quiz. Try a different topic or resource.')
    } finally { setLoading(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      className="h-[100dvh] px-4 pt-6 pb-safe max-w-lg mx-auto flex flex-col gap-5 overflow-y-auto"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)' }}>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 transition-all">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <h2 className="text-[22px] sm:text-[26px] font-black">Create Quiz Battle</h2>
            <p className="text-[12px] text-white/50 font-medium">AI extracts questions directly from your materials</p>
          </div>
        </div>

        {/* Topic Input */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-white/40 font-bold uppercase tracking-wider ml-1">Generate From Topic</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary text-[20px]">psychology</span>
            <input
              value={topic}
              onChange={e => { setTopic(e.target.value); if (e.target.value) { setSelected(null); setUploadFile(null) } }}
              placeholder="e.g. Quiz on anime, Python, Black holes..."
              className="w-full bg-white/5 border border-white/15 rounded-2xl pl-12 pr-4 py-3.5 text-[15px] focus:outline-none focus:border-primary transition-all placeholder:text-white/30 text-white"
            />
          </div>
        </div>

        {/* Title Input */}
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Quiz Title (optional)"
          className="w-full bg-white/5 border border-white/15 rounded-2xl px-5 py-3.5 text-[15px] focus:outline-none focus:border-primary transition-all placeholder:text-white/30" />

        {/* Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider ml-1">Questions</span>
            <div className="grid grid-cols-4 gap-1.5 bg-white/5 p-1.5 rounded-xl border border-white/10">
              {[5, 10, 15, 20].map(n => (
                <button key={n} onClick={() => setCount(n)}
                  className={cn('py-1.5 rounded-lg text-[13px] font-black transition-all', count === n ? 'bg-primary text-white shadow-md' : 'text-white/60 hover:text-white')}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider ml-1">Timer / Question</span>
            <div className="grid grid-cols-4 gap-1.5 bg-white/5 p-1.5 rounded-xl border border-white/10">
              {[10, 15, 20, 30].map(t => (
                <button key={t} onClick={() => setTimePerQ(t)}
                  className={cn('py-1.5 rounded-lg text-[13px] font-black transition-all', timePerQ === t ? 'bg-[#ffa602] text-black shadow-md' : 'text-white/60 hover:text-white')}>
                  {t}s
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Resource Selection */}
        <div className="space-y-3">
          <p className="text-[13px] font-bold text-white/70">Or Select Study Material / File</p>
          {fetching ? (
            <div className="flex items-center justify-center py-10 gap-3 text-white/40">
              <span className="material-symbols-outlined animate-spin text-[24px]">autorenew</span>
              <span className="text-[13px]">Fetching library materials…</span>
            </div>
          ) : resources.length === 0 ? (
            <div className="text-center py-6 text-white/40 text-[13px]">No library resources found. Upload a file below.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 max-h-56 overflow-y-auto pr-1">
              {resources.map((r: any) => (
                <button key={r.id} onClick={() => { setSelected(r); setUploadFile(null); setTopic('') }}
                  className={cn('flex items-center gap-3.5 px-4 py-3 rounded-2xl border text-left transition-all',
                    selected?.id === r.id ? 'bg-primary/20 border-primary shadow-[0_0_16px_rgba(var(--color-primary),0.3)]' : 'bg-white/5 border-white/10 hover:bg-white/10')}>
                  <span className="material-symbols-outlined text-[22px] shrink-0 text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {r.resource_type === 'pdf' ? 'picture_as_pdf' : r.resource_type === 'video' ? 'smart_display' : 'description'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold truncate text-white">{r.title}</p>
                    <p className="text-[11px] text-white/40 capitalize">{r.resource_type || 'note'}</p>
                  </div>
                  {selected?.id === r.id && <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[11px] text-white/30 font-bold uppercase tracking-widest">or upload</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <input ref={fileRef} type="file" accept=".pdf,image/*,.txt,.docx" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { setUploadFile(f); setSelected(null); setTopic('') }; e.target.value = '' }} />
          <button onClick={() => fileRef.current?.click()}
            className={cn('w-full py-3.5 border-2 border-dashed rounded-2xl text-[13px] font-bold transition-all flex items-center justify-center gap-2',
              uploadFile ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400' : 'border-white/20 text-white/50 hover:border-white/40 hover:text-white/80')}>
            <span className="material-symbols-outlined text-[20px]">upload_file</span>
            <span className="truncate">{uploadFile ? uploadFile.name : 'Upload PDF, Image, or Doc'}</span>
          </button>
        </div>
      </div>

      <motion.button whileTap={{ scale: 0.97 }} onClick={handleGenerate}
        disabled={loading || (!topic.trim() && !selected && !uploadFile)}
        className="w-full py-4 bg-gradient-to-r from-primary to-[#a855f7] rounded-2xl font-black text-[16px] shadow-[0_8px_24px_rgba(var(--color-primary),0.35)] active:translate-y-0.5 transition-all disabled:opacity-40 flex items-center justify-center gap-2 mt-4">
        {loading
          ? <><span className="material-symbols-outlined animate-spin text-[20px]">autorenew</span> Building Battle Room…</>
          : <><span className="material-symbols-outlined text-[20px]">bolt</span> Generate &amp; Launch</>}
      </motion.button>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Lobby
// ══════════════════════════════════════════════════════════════════════════════
function LobbyScreen({ pin, players, isHost, onStart, onLeave, isConnecting, isStarting, me }: { pin: string; players: Player[]; isHost: boolean; onStart: () => void; onLeave: () => void; isConnecting: boolean; isStarting: boolean; me: string }) {
  const AVATAR_COLORS = ['bg-[#e21b3c]','bg-[#1368ce]','bg-[#26890c]','bg-[#ffa602]','bg-[#a855f7]','bg-[#ec4899]','bg-[#0891b2]','bg-[#d97706]']

  const copyPin = () => {
    navigator.clipboard.writeText(pin)
    toast.success('Room PIN copied to clipboard!')
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="h-[100dvh] flex flex-col items-center justify-center px-4 py-8 max-w-2xl mx-auto gap-6 overflow-y-auto"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 24px)' }}>

      {/* PIN Card */}
      <div className="text-center w-full">
        <p className="text-[12px] font-bold text-white/40 uppercase tracking-widest mb-2">Room PIN</p>
        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}
          onClick={copyPin}
          title="Click to copy"
          className="inline-flex items-center gap-3 px-8 py-4 bg-white/5 border border-white/15 rounded-3xl cursor-pointer hover:bg-white/10 transition-all group shadow-[0_0_50px_rgba(255,255,255,0.08)]">
          <span className="text-[44px] xs:text-[56px] sm:text-[68px] font-black tracking-[0.2em] text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
            {pin}
          </span>
          <span className="material-symbols-outlined text-[24px] text-white/40 group-hover:text-white transition-colors">content_copy</span>
        </motion.div>
        <p className="text-[13px] text-white/40 mt-2 font-medium">Click to copy PIN &amp; share with friends</p>
      </div>

      {/* Players grid */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-4 px-2">
          <span className="text-[13px] font-bold text-white/60">Players ({players.length})</span>
          <span className="text-[11px] bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Lobby Active
          </span>
        </div>
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto p-1">
          <AnimatePresence>
            {players.map((p, i) => {
              const isUserHost = p.username === me && isHost
              return (
                <motion.div key={p.username} initial={{ scale: 0, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className={cn('rounded-2xl p-3 flex flex-col items-center gap-2 shadow-lg relative overflow-hidden', AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                  <div className="w-11 h-11 rounded-full bg-black/25 flex items-center justify-center text-[20px] font-black shadow-inner">
                    {(p.username || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-[12px] font-black text-white truncate max-w-full px-1">{p.username}</span>
                  {isUserHost && (
                    <span className="text-[9px] bg-black/40 text-yellow-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Host</span>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-4 w-full pt-2">
        <button onClick={onLeave} className="px-6 py-3.5 bg-white/10 rounded-2xl font-bold text-[14px] hover:bg-white/15 transition-all">
          Leave Room
        </button>
        {isHost && (
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={onStart}
            disabled={players.length < 1 || isConnecting || isStarting}
            className="px-10 py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 rounded-2xl font-black text-[16px] shadow-[0_8px_24px_rgba(34,197,94,0.35)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px]">play_arrow</span>
            {isStarting ? 'Starting Match…' : isConnecting ? 'Connecting…' : 'Start Match!'}
          </motion.button>
        )}
        {!isHost && (
          <div className="px-6 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-[14px] text-white/60 font-bold flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            Waiting for Host to start…
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Countdown
// ══════════════════════════════════════════════════════════════════════════════
function CountdownScreen({ count }: { count: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-[14px] text-white/50 uppercase tracking-widest font-black">Get Ready!</p>
      <AnimatePresence mode="wait">
        <motion.div key={count}
          initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="text-[120px] sm:text-[160px] font-black bg-gradient-to-b from-white via-slate-100 to-white/40 bg-clip-text text-transparent leading-none select-none drop-shadow-[0_0_40px_rgba(255,255,255,0.3)]">
          {count}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Question
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Question
// ══════════════════════════════════════════════════════════════════════════════
function QuestionScreen({ question, timeLeft, setTimeLeft, answered, onAnswer }: { question: Question; timeLeft: number; setTimeLeft?: React.Dispatch<React.SetStateAction<number>>; answered: string | null; onAnswer: (c: string) => void }) {
  const [disabledKeys, setDisabledKeys] = useState<string[]>([])
  const [powerupUsed, setPowerupUsed] = useState<Record<string, boolean>>({})

  const pct = (timeLeft / question.time_limit) * 100
  const timerColor = pct > 50 ? 'bg-emerald-500' : pct > 25 ? 'bg-amber-500' : 'bg-rose-500'
  const opts = [question.opt_a, question.opt_b, question.opt_c, question.opt_d]

  // Power-up 1: 50/50 Clue
  const handleUse5050 = async () => {
    if (powerupUsed.clue_5050 || answered) return
    try {
      const { paymentsApi } = await import('@/lib/api')
      const res = await paymentsApi.usePowerup('clue_5050')
      if (res.data.success) {
        // Disable 2 keys (e.g. B and D or A and C)
        const keys = ['A', 'B', 'C', 'D']
        // Randomly pick 2 keys to hide
        const shuffled = [...keys].sort(() => 0.5 - Math.random())
        setDisabledKeys(shuffled.slice(0, 2))
        setPowerupUsed(p => ({ ...p, clue_5050: true }))
        toast.success('💡 50/50 Clue activated! 2 wrong choices eliminated.')
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'You need to buy 50/50 Clues in the Marketplace first!')
    }
  }

  // Power-up 2: Time Extension
  const handleUseTimeExtend = async () => {
    if (powerupUsed.time_extend || answered) return
    try {
      const { paymentsApi } = await import('@/lib/api')
      const res = await paymentsApi.usePowerup('time_extend')
      if (res.data.success) {
        if (setTimeLeft) setTimeLeft(t => t + 10)
        setPowerupUsed(p => ({ ...p, time_extend: true }))
        toast.success('⏱️ +10 Seconds added to timer!')
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'You need to buy Time Extensions in the Marketplace first!')
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="h-[100dvh] flex flex-col max-w-4xl mx-auto px-4 pt-4 justify-between gap-3 overflow-y-auto"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)' }}>
      
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between pb-2">
          <span className="text-[13px] text-white/50 font-black">Question {question.idx + 1} of {question.total}</span>

          {/* Power-Ups Action Strip */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleUse5050}
              disabled={powerupUsed.clue_5050 || !!answered}
              title="Use 50/50 Clue"
              className={cn(
                'px-3 py-1.5 rounded-full border text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-all',
                powerupUsed.clue_5050
                  ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30 active:scale-95'
              )}
            >
              <span className="material-symbols-outlined text-[15px]">tips_and_updates</span>
              50/50 Clue
            </button>

            <button
              onClick={handleUseTimeExtend}
              disabled={powerupUsed.time_extend || !!answered}
              title="Use +10s Extension"
              className={cn(
                'px-3 py-1.5 rounded-full border text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-all',
                powerupUsed.time_extend
                  ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 active:scale-95'
              )}
            >
              <span className="material-symbols-outlined text-[15px]">hourglass_top</span>
              +10s
            </button>
          </div>

          <motion.div key={timeLeft} initial={{ scale: 1.2 }} animate={{ scale: 1 }}
            className={cn('w-12 h-12 rounded-full border-2 flex items-center justify-center text-[20px] font-black tabular-nums',
              timeLeft <= 5 ? 'border-rose-500 text-rose-500 animate-pulse' : 'border-white/20 text-white')}>
            {timeLeft}
          </motion.div>
        </div>

        {/* Timer Bar */}
        <div className="h-3 bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/10">
          <motion.div className={cn('h-full rounded-full transition-colors', timerColor)}
            animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: 'linear' }} />
        </div>
      </div>

      {/* Question Prompt */}
      <div className="flex-1 flex items-center justify-center my-4">
        <div className="w-full bg-white/5 border border-white/15 rounded-[2rem] p-6 sm:p-10 text-center shadow-2xl backdrop-blur-xl">
          <p className="text-[20px] sm:text-[26px] md:text-[30px] font-black leading-snug text-white">
            {question.text}
          </p>
        </div>
      </div>

      {/* Answer Options Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-2">
        {opts.map((opt, i) => {
          const key = OPTION_KEYS[i]
          const isSelected = answered === key
          const isDisabled = disabledKeys.includes(key)

          if (isDisabled) {
            return (
              <div key={key} className="rounded-2xl p-4 sm:p-5 flex items-center gap-4 bg-white/5 border border-white/5 text-white/20 cursor-not-allowed opacity-30 select-none">
                <OptionShape index={i} className="w-7 h-7 sm:w-8 sm:h-8 fill-current shrink-0 text-white/20" />
                <span className="leading-tight flex-1 line-through">Option eliminated</span>
              </div>
            )
          }

          return (
            <motion.button key={key} whileHover={!answered ? { scale: 1.02 } : {}} whileTap={!answered ? { scale: 0.98 } : {}}
              onClick={() => onAnswer(key)} disabled={!!answered}
              className={cn(
                'rounded-2xl p-4 sm:p-5 flex items-center gap-4 font-black text-[15px] sm:text-[17px] text-left transition-all relative overflow-hidden shadow-lg border border-white/10',
                OPTION_COLORS[i],
                isSelected ? 'ring-4 ring-white shadow-[0_0_30px_rgba(255,255,255,0.4)]' : 'opacity-95 hover:opacity-100',
                answered && !isSelected ? 'opacity-35 grayscale-[30%]' : ''
              )}>
              <OptionShape index={i} className="w-7 h-7 sm:w-8 sm:h-8 fill-current shrink-0 text-white/90" />
              <span className="leading-tight flex-1">{opt}</span>
              {isSelected && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-7 h-7 bg-white text-black rounded-full flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">check</span>
                </motion.div>
              )}
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Round Result
// ══════════════════════════════════════════════════════════════════════════════
function RoundResultScreen({ result, answered, me, isHost }: { result: RoundResult; answered: string | null; me: string; isHost: boolean }) {
  const isCorrect  = answered === result.correct
  const myResult   = result.results.find(r => r.username === me)
  const myRank     = result.leaderboard.findIndex(p => p.username === me) + 1
  const correctIdx = OPTION_KEYS.indexOf(result.correct as any)
  const MEDALS     = ['🥇','🥈','🥉']
  const isSpeedBonus = isCorrect && myResult && myResult.points > 500

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto gap-6 overflow-y-auto"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)' }}>

      {/* Correct / Incorrect Banner */}
      <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring' }}
        className={cn('w-full flex flex-col items-center gap-2 p-6 rounded-[2rem] border text-center shadow-xl',
          isCorrect ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-rose-500/20 border-rose-500/40 text-rose-400')}>
        <span className="material-symbols-outlined text-[56px]" style={{ fontVariationSettings: "'FILL' 1" }}>
          {isCorrect ? 'check_circle' : 'cancel'}
        </span>
        <span className="text-[28px] font-black">{isCorrect ? 'Correct!' : 'Incorrect'}</span>
        <span className={cn('text-[32px] font-black tabular-nums', isCorrect ? 'text-emerald-400' : 'text-white/30')}>
          {isCorrect ? `+${myResult?.points || 500} pts` : '+0'}
        </span>
        {isSpeedBonus && (
          <span className="text-[12px] bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full font-bold flex items-center gap-1">
            ⚡ Speed Bonus Included!
          </span>
        )}
      </motion.div>

      {/* Correct Option Reveal */}
      <div className="w-full">
        <p className="text-[11px] text-white/40 uppercase tracking-widest text-center mb-2 font-bold">Correct Answer</p>
        <div className={cn('rounded-2xl p-4 flex items-center gap-3 font-black text-[16px]', OPTION_COLORS[correctIdx])}>
          <OptionShape index={correctIdx} className="w-6 h-6 fill-current shrink-0" />
          <span>{result.correct}</span>
        </div>
      </div>

      {/* Leaderboard Standings */}
      <div className="w-full">
        <p className="text-[11px] text-white/40 uppercase tracking-widest text-center mb-2 font-bold">Current Standings</p>
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {result.leaderboard.map((p, i) => (
            <motion.div key={p.username} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.05 * i }}
              className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border',
                p.username === me ? 'bg-primary/25 border-primary/50' : 'bg-white/5 border-white/10')}>
              <span className="text-[16px] w-6 text-center shrink-0">{MEDALS[i] || `#${i + 1}`}</span>
              <span className="flex-1 text-[14px] font-bold truncate text-white">{p.username}</span>
              {p.streak >= 3 && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">🔥{p.streak}</span>}
              <span className="font-black text-[15px] tabular-nums text-white">{p.score.toLocaleString()}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-white/30 animate-pulse font-medium">Next question loading…</p>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Leaderboard (between rounds)
// ══════════════════════════════════════════════════════════════════════════════
function LeaderboardScreen({ leaderboard, me }: { leaderboard: Player[]; me: string }) {
  const MEDALS = ['🥇','🥈','🥉']
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10 max-w-lg mx-auto gap-6">
      <h2 className="text-[28px] font-black">Leaderboard</h2>
      <div className="w-full space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
        {leaderboard.map((p, i) => (
          <motion.div key={p.username} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.06 }}
            className={cn('flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all',
              p.username === me ? 'bg-primary/25 border-primary shadow-[0_0_20px_rgba(var(--color-primary),0.2)]' : 'bg-white/5 border-white/10')}>
            <span className="text-[20px] w-8 text-center shrink-0">{MEDALS[i] || `#${i+1}`}</span>
            <span className="flex-1 font-bold text-[14px] truncate text-white">{p.username}</span>
            {p.streak >= 3 && <span className="text-[11px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">🔥{p.streak}</span>}
            <span className="font-black text-[16px] tabular-nums text-white">{p.score.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>
      <p className="text-[12px] text-white/30 animate-pulse font-medium">Next question loading…</p>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Game Over (Podium)
// ══════════════════════════════════════════════════════════════════════════════
function GameOverScreen({ leaderboard, me, onPlayAgain }: { leaderboard: Player[]; me: string; onPlayAgain: () => void }) {
  const MEDALS   = ['🥇','🥈','🥉']
  const top3     = leaderboard.slice(0, 3)
  const myRank   = leaderboard.findIndex(p => p.username === me) + 1

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10 max-w-lg mx-auto gap-8">

      <div className="text-center space-y-1">
        <h2 className="text-[32px] font-black bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent">
          Battle Complete!
        </h2>
        <p className="text-[13px] text-white/50 font-medium">Final Rankings &amp; Winner Podium</p>
      </div>

      {/* Winner Podium (2nd - 1st - 3rd) */}
      {top3.length > 0 && (
        <div className="flex items-end justify-center gap-3 sm:gap-4 w-full h-[220px] pt-6">
          {/* 2nd Place */}
          {top3[1] && (
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
              className="flex-1 flex flex-col items-center">
              <span className="text-[28px] mb-1">🥈</span>
              <span className="text-[12px] font-black text-white truncate max-w-[80px]">{top3[1].username}</span>
              <span className="text-[11px] text-white/50 mb-2">{top3[1].score} pts</span>
              <div className="w-full h-[100px] bg-slate-400/20 border-t-4 border-slate-300 rounded-t-2xl flex items-center justify-center font-black text-[24px] text-slate-300 shadow-lg">
                2
              </div>
            </motion.div>
          )}

          {/* 1st Place */}
          {top3[0] && (
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
              className="flex-1 flex flex-col items-center">
              <span className="text-[36px] mb-1">🏆</span>
              <span className="text-[14px] font-black text-amber-300 truncate max-w-[90px]">{top3[0].username}</span>
              <span className="text-[12px] text-amber-400/80 mb-2 font-bold">{top3[0].score} pts</span>
              <div className="w-full h-[140px] bg-amber-500/25 border-t-4 border-amber-400 rounded-t-2xl flex items-center justify-center font-black text-[32px] text-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                1
              </div>
            </motion.div>
          )}

          {/* 3rd Place */}
          {top3[2] && (
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
              className="flex-1 flex flex-col items-center">
              <span className="text-[28px] mb-1">🥉</span>
              <span className="text-[12px] font-black text-white truncate max-w-[80px]">{top3[2].username}</span>
              <span className="text-[11px] text-white/50 mb-2">{top3[2].score} pts</span>
              <div className="w-full h-[70px] bg-amber-700/20 border-t-4 border-amber-600 rounded-t-2xl flex items-center justify-center font-black text-[20px] text-amber-600 shadow-lg">
                3
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Your Rank Banner */}
      {myRank > 0 && (
        <div className="w-full px-6 py-3.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
          <span className="text-[13px] text-white/60 font-bold">Your Position</span>
          <span className="text-[16px] font-black text-primary">{MEDALS[myRank-1] || `#${myRank}`} ({leaderboard[myRank-1]?.score.toLocaleString()} pts)</span>
        </div>
      )}

      {/* Actions */}
      <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={onPlayAgain}
        className="w-full py-4 bg-gradient-to-r from-primary to-[#a855f7] rounded-2xl font-black text-[16px] shadow-[0_8px_24px_rgba(var(--color-primary),0.35)] transition-all">
        Back to Lobby
      </motion.button>
    </motion.div>
  )
}
