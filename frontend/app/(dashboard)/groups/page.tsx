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

const OPTION_COLORS = ['bg-[#e21b3c]', 'bg-[#1368ce]', 'bg-[#26890c]', 'bg-[#ffa602]']
const OPTION_ICONS  = ['triangle', 'diamond', 'circle', 'square']
const OPTION_KEYS   = ['A', 'B', 'C', 'D'] as const

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
          animate={{ y: window.innerHeight + 40, rotate: 720, opacity: 0 }}
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

  const wsRef        = useRef<WebSocket | null>(null)
  const qStartRef    = useRef<number>(0)

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
      handleServerMsg(msg)
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
        setScreen('countdown')
        setCountNum(msg.count)
        snd.countdown()
        break

      case 'show_question':
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

  // Re-wire handler when it updates (avoids stale closure)
  useEffect(() => {
    if (!wsRef.current) return
    wsRef.current.onmessage = (ev) => handleServerMsg(JSON.parse(ev.data))
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
    wsRef.current?.send(JSON.stringify({ type: 'start_game' }))
  }

  const handleAnswer = (choice: string) => {
    if (answered) return
    const elapsed = (Date.now() - qStartRef.current) / 1000
    setAnswered(choice)
    setAnswerTime(elapsed)
    wsRef.current?.send(JSON.stringify({ type: 'submit_answer', choice, time_taken: elapsed }))
    const correct = roundResult?.correct  // not available yet, sound after result
    snd.tick()
  }

  const goHome = () => { disconnect(); setScreen('home'); setPin(''); setPlayers([]); setQuestion(null); setRoundResult(null); setLeaderboard([]); setIsHost(false) }

  // ── Play correct/wrong sound when round result arrives ─────────────────────
  useEffect(() => {
    if (screen !== 'round_result' || !roundResult || !answered) return
    if (answered === roundResult.correct) snd.correct()
    else snd.wrong()
  }, [screen, roundResult, answered])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white relative overflow-hidden">
      {showConfetti && <Confetti />}

      {/* Animated background blobs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-tertiary/10 blur-[100px]" />
      </div>

      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {screen === 'home'        && <HomeScreen     key="home"     onCreate={() => setScreen('create')} onJoin={handleJoinRoom} joinPin={joinPinInput} setJoinPin={setJoinPinInput} />}
          {screen === 'create'      && <CreateScreen   key="create"   onBack={() => setScreen('home')} onCreated={async (roomPin, host) => { setPin(roomPin); setIsHost(host); await connect(roomPin); setScreen('lobby') }} />}
          {screen === 'lobby'       && <LobbyScreen    key="lobby"    pin={pin} players={players} isHost={isHost} onStart={handleStartGame} onLeave={goHome} isConnecting={isConnecting} />}
          {screen === 'countdown'   && <CountdownScreen key="countdown" count={countNum} />}
          {screen === 'question'    && question && <QuestionScreen key={`q-${question.idx}`} question={question} timeLeft={timeLeft} answered={answered} onAnswer={handleAnswer} />}
          {screen === 'round_result' && roundResult && <RoundResultScreen key="result" result={roundResult} answered={answered} me={me} onContinue={() => setScreen('leaderboard')} isHost={isHost} />}
          {screen === 'leaderboard' && <LeaderboardScreen key="lb" leaderboard={leaderboard} me={me} onContinue={isHost ? undefined : undefined} />}
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
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16 gap-10">

      {/* Logo / Hero */}
      <div className="text-center space-y-3">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.1 }}
          className="text-[64px] mb-2 select-none">⚡</motion.div>
        <h1 className="text-[42px] md:text-[56px] font-black tracking-tight bg-gradient-to-r from-primary via-[#a855f7] to-[#ec4899] bg-clip-text text-transparent">
          Quiz Battle
        </h1>
        <p className="text-[16px] text-white/50 max-w-sm mx-auto">Real-time multiplayer quiz battles — create a room or join a friend's!</p>
      </div>

      {/* Cards */}
      <div className="flex flex-col sm:flex-row gap-5 w-full max-w-lg">
        {/* Create */}
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} onClick={onCreate}
          className="flex-1 flex flex-col items-center gap-3 py-8 px-6 bg-gradient-to-br from-primary/80 to-[#a855f7]/80 rounded-[1.75rem] border border-primary/40 shadow-[0_8px_32px_rgba(var(--color-primary),0.3)] cursor-pointer">
          <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
          <span className="text-[20px] font-black">Create Room</span>
          <span className="text-[12px] text-white/60">Build your own quiz</span>
        </motion.button>

        {/* Join */}
        <div className="flex-1 flex flex-col items-center gap-3 py-8 px-6 bg-surface-container-high/60 rounded-[1.75rem] border border-outline-variant/30 backdrop-blur-md">
          <span className="material-symbols-outlined text-[40px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code</span>
          <span className="text-[20px] font-black">Join Room</span>
          <input value={joinPin} onChange={e => setJoinPin(e.target.value.replace(/\D/g,'').slice(0,6))}
            placeholder="Enter PIN"
            className="w-full bg-black/30 border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[18px] font-black text-center tracking-[0.3em] focus:outline-none focus:border-tertiary transition-all placeholder:text-white/20 placeholder:tracking-normal" />
          <motion.button whileTap={{ scale: 0.95 }} onClick={onJoin} disabled={joinPin.length !== 6}
            className="w-full py-2.5 bg-tertiary text-black font-black rounded-xl text-[14px] disabled:opacity-40 transition-all hover:brightness-110">
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
    if (!selected && !uploadFile) return toast.error('Pick a resource or upload a file.')
    setLoading(true)
    try {
      let resourceId = selected?.id
      // If they uploaded a new file, upload it to library first then use it
      if (uploadFile && !selected) {
        const { libraryApi } = require('@/lib/api')
        const fd = new FormData()
        fd.append('file', uploadFile)
        fd.append('title', uploadFile.name.replace(/\.[^.]+$/, ''))
        const upRes = await libraryApi.uploadResource(fd)
        resourceId = upRes.data.id
      }
      const res = await groupsApi.generateQuiz({
        resource_id: resourceId,
        title: title.trim() || undefined,
        count,
        time_per_q: timePerQ,
      })
      onCreated(res.data.pin, true)
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not generate quiz. Try a different resource.')
    } finally { setLoading(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }}
      className="min-h-screen px-4 py-8 max-w-lg mx-auto flex flex-col gap-6">

      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div>
          <h2 className="text-[24px] font-black">Create Quiz Battle</h2>
          <p className="text-[12px] text-white/40">AI generates questions from your resource</p>
        </div>
      </div>

      {/* Optional title */}
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Quiz title (optional — AI will name it)"
        className="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:border-primary/60 transition-all placeholder:text-white/25" />

      {/* Settings row */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-white/40 uppercase tracking-widest">Questions</span>
          <div className="flex gap-1.5">
            {[5, 10, 15, 20].map(n => (
              <button key={n} onClick={() => setCount(n)}
                className={cn('px-3 py-1.5 rounded-lg text-[13px] font-black transition-all', count === n ? 'bg-primary text-white' : 'bg-white/10 text-white/50 hover:bg-white/15')}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-white/40 uppercase tracking-widest">Secs / question</span>
          <div className="flex gap-1.5">
            {[10, 15, 20, 30].map(t => (
              <button key={t} onClick={() => setTimePerQ(t)}
                className={cn('px-3 py-1.5 rounded-lg text-[13px] font-black transition-all', timePerQ === t ? 'bg-[#ffa602] text-black' : 'bg-white/10 text-white/50 hover:bg-white/15')}>
                {t}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resource picker */}
      <div className="flex-1 flex flex-col gap-3">
        <p className="text-[13px] font-bold text-white/60">Pick from your library</p>
        {fetching ? (
          <div className="flex items-center justify-center py-10 gap-3 text-white/30">
            <span className="material-symbols-outlined animate-spin text-[24px]">autorenew</span>
            <span className="text-[13px]">Loading library…</span>
          </div>
        ) : resources.length === 0 ? (
          <div className="text-center py-8 text-white/30 text-[13px]">No resources found — upload a file below.</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
            {resources.map((r: any) => (
              <button key={r.id} onClick={() => { setSelected(r); setUploadFile(null) }}
                className={cn('flex items-center gap-3 px-4 py-3 rounded-[1rem] border text-left transition-all',
                  selected?.id === r.id ? 'bg-primary/25 border-primary/60 shadow-[0_0_16px_rgba(var(--color-primary),0.2)]' : 'bg-white/5 border-white/10 hover:bg-white/10')}>
                <span className="material-symbols-outlined text-[20px] shrink-0 text-white/50"
                  style={{ fontVariationSettings: "'FILL' 1" }}>
                  {r.resource_type === 'pdf' ? 'picture_as_pdf' : r.resource_type === 'video' ? 'smart_display' : 'description'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold truncate">{r.title}</p>
                  <p className="text-[11px] text-white/40 capitalize">{r.resource_type || 'note'}</p>
                </div>
                {selected?.id === r.id && <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>}
              </button>
            ))}
          </div>
        )}

        {/* Or upload */}
        <div className="flex items-center gap-3 mt-1">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[11px] text-white/30 uppercase tracking-widest">or upload</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>
        <input ref={fileRef} type="file" accept=".pdf,image/*,.txt,.docx" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { setUploadFile(f); setSelected(null) }; e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()}
          className={cn('w-full py-3 border-2 border-dashed rounded-xl text-[13px] font-bold transition-all flex items-center justify-center gap-2',
            uploadFile ? 'border-[#26890c]/60 bg-[#26890c]/10 text-[#4ade80]' : 'border-white/20 text-white/40 hover:border-white/40 hover:text-white/60')}>
          <span className="material-symbols-outlined text-[18px]">upload_file</span>
          {uploadFile ? uploadFile.name : 'Upload PDF / image / text'}
        </button>
      </div>

      <motion.button whileTap={{ scale: 0.97 }} onClick={handleGenerate}
        disabled={loading || (!selected && !uploadFile)}
        className="w-full py-4 bg-gradient-to-r from-primary to-[#a855f7] rounded-xl font-black text-[16px] shadow-[0_6px_0_0_rgba(0,0,0,0.4)] active:translate-y-1 active:shadow-none transition-all disabled:opacity-40 flex items-center justify-center gap-2">
        {loading
          ? <><span className="material-symbols-outlined animate-spin text-[20px]">autorenew</span> AI is building your quiz…</>
          : <><span className="material-symbols-outlined text-[20px]">bolt</span> Generate &amp; Launch Room</>}
      </motion.button>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Lobby
// ══════════════════════════════════════════════════════════════════════════════
function LobbyScreen({ pin, players, isHost, onStart, onLeave, isConnecting }: { pin: string; players: Player[]; isHost: boolean; onStart: () => void; onLeave: () => void; isConnecting: boolean }) {
  const AVATAR_COLORS = ['bg-[#e21b3c]','bg-[#1368ce]','bg-[#26890c]','bg-[#ffa602]','bg-[#a855f7]','bg-[#ec4899]','bg-[#0891b2]','bg-[#d97706]']
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 gap-8">

      {/* PIN display */}
      <div className="text-center">
        <p className="text-[13px] font-bold text-white/40 uppercase tracking-widest mb-2">Room PIN</p>
        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}
          className="text-[56px] md:text-[72px] font-black tracking-[0.2em] text-white drop-shadow-[0_0_24px_rgba(255,255,255,0.3)]">
          {pin}
        </motion.div>
        <p className="text-[13px] text-white/40 mt-1">Share this code with friends to join</p>
      </div>

      {/* Players grid */}
      <div className="w-full max-w-lg">
        <p className="text-[13px] text-white/50 text-center mb-4">{players.length} player{players.length !== 1 ? 's' : ''} joined</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          <AnimatePresence>
            {players.map((p, i) => (
              <motion.div key={p.username} initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className={cn('rounded-2xl p-3 flex flex-col items-center gap-1.5', AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center text-[18px] font-black">
                  {(p.username || '?')[0].toUpperCase()}
                </div>
                <span className="text-[11px] font-bold text-white truncate max-w-full px-1">{p.username}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <button onClick={onLeave} className="px-5 py-3 bg-white/10 rounded-xl font-bold text-[14px] hover:bg-white/15 transition-all">
          Leave
        </button>
        {isHost && (
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={onStart}
            disabled={players.length < 1 || isConnecting}
            className="px-8 py-3 bg-gradient-to-r from-[#26890c] to-[#22c55e] rounded-xl font-black text-[16px] shadow-[0_6px_0_0_#14532d] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">play_arrow</span>
            {isConnecting ? 'Connecting…' : 'Start Game!'}
          </motion.button>
        )}
        {!isHost && (
          <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-[14px] text-white/50 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Waiting for host…
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
      <p className="text-[14px] text-white/40 uppercase tracking-widest font-bold">Get ready!</p>
      <AnimatePresence mode="wait">
        <motion.div key={count}
          initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="text-[140px] font-black bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent leading-none">
          {count}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Question
// ══════════════════════════════════════════════════════════════════════════════
function QuestionScreen({ question, timeLeft, answered, onAnswer }: { question: Question; timeLeft: number; answered: string | null; onAnswer: (c: string) => void }) {
  const pct = (timeLeft / question.time_limit) * 100
  const timerColor = pct > 50 ? 'bg-[#26890c]' : pct > 25 ? 'bg-[#ffa602]' : 'bg-[#e21b3c]'
  const opts = [question.opt_a, question.opt_b, question.opt_c, question.opt_d]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="text-[12px] text-white/40 font-bold">Q{question.idx + 1} / {question.total}</span>
        <motion.span key={timeLeft} initial={{ scale: 1.3 }} animate={{ scale: 1 }}
          className={cn('text-[28px] font-black tabular-nums', timeLeft <= 5 ? 'text-[#e21b3c]' : 'text-white')}>
          {timeLeft}
        </motion.span>
      </div>

      {/* Timer bar */}
      <div className="h-2 bg-white/10 mx-4 rounded-full overflow-hidden">
        <motion.div className={cn('h-full rounded-full transition-colors', timerColor)}
          animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: 'linear' }} />
      </div>

      {/* Question text */}
      <div className="flex-1 flex flex-col px-4 pb-4 gap-4 mt-4">
        <div className="bg-white/8 border border-white/10 rounded-[1.5rem] px-6 py-6 text-center flex items-center justify-center min-h-[120px]">
          <p className="text-[20px] md:text-[24px] font-black leading-snug">{question.text}</p>
        </div>

        {/* Answer grid */}
        <div className="grid grid-cols-2 gap-3 flex-1">
          {opts.map((opt, i) => {
            const key = OPTION_KEYS[i]
            const isSelected = answered === key
            return (
              <motion.button key={key} whileHover={!answered ? { scale: 1.02 } : {}} whileTap={!answered ? { scale: 0.97 } : {}}
                onClick={() => onAnswer(key)} disabled={!!answered}
                className={cn(
                  'rounded-[1.25rem] p-4 flex items-center gap-3 font-black text-[15px] text-left transition-all relative overflow-hidden',
                  OPTION_COLORS[i],
                  isSelected ? 'ring-4 ring-white shadow-[0_0_24px_rgba(255,255,255,0.3)]' : 'opacity-90 hover:opacity-100',
                  answered && !isSelected ? 'opacity-40' : ''
                )}>
                <span className="material-symbols-outlined text-[22px] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>{OPTION_ICONS[i]}</span>
                <span className="leading-tight">{opt}</span>
                {isSelected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-2 right-2 w-6 h-6 bg-white/30 rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-[14px]">check</span>
                </motion.div>}
              </motion.button>
            )
          })}
        </div>
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
      className="min-h-screen flex flex-col items-center justify-center px-4 py-8 gap-5">

      {/* Big correct/wrong + rank */}
      <div className="flex flex-col items-center gap-3 w-full max-w-sm">
        <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', delay: 0.1 }}
          className={cn('w-full flex flex-col items-center gap-1 px-8 py-6 rounded-[2rem]',
            isCorrect ? 'bg-[#26890c]/30 border border-[#26890c]/50' : 'bg-[#e21b3c]/20 border border-[#e21b3c]/40')}>
          <span className="material-symbols-outlined text-[52px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            {isCorrect ? 'check_circle' : 'cancel'}
          </span>
          <span className="text-[26px] font-black">{isCorrect ? '🎉 Correct!' : '😬 Wrong!'}</span>
          {/* Points earned */}
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.3 }}
            className={cn('text-[32px] font-black tabular-nums', isCorrect ? 'text-[#4ade80]' : 'text-white/30')}>
            {isCorrect ? `+${myResult?.points ?? 0}` : '+0'}
          </motion.span>
          {isSpeedBonus && (
            <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="text-[12px] bg-[#ffa602]/20 text-[#ffa602] px-3 py-1 rounded-full font-bold">
              ⚡ Speed bonus!
            </motion.span>
          )}
        </motion.div>

        {/* Your rank */}
        {myRank > 0 && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.4 }}
            className="flex items-center gap-3 px-6 py-3 bg-white/8 border border-white/15 rounded-2xl">
            <span className="text-[28px]">{MEDALS[myRank - 1] || `#${myRank}`}</span>
            <div>
              <p className="text-[11px] text-white/40 uppercase tracking-widest">Your rank</p>
              <p className="text-[20px] font-black">{myRank === 1 ? '1st Place 🔥' : myRank === 2 ? '2nd Place' : myRank === 3 ? '3rd Place' : `${myRank}th Place`}</p>
            </div>
            <div className="ml-2 text-right">
              <p className="text-[11px] text-white/40 uppercase tracking-widest">Total</p>
              <p className="text-[18px] font-black text-primary">{result.leaderboard[myRank - 1]?.score.toLocaleString()}</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Correct answer reveal */}
      <div className="w-full max-w-sm">
        <p className="text-[11px] text-white/40 text-center mb-2 uppercase tracking-widest">Correct answer</p>
        <div className={cn('rounded-xl px-4 py-3 flex items-center gap-3 font-black text-[15px]', OPTION_COLORS[correctIdx])}>
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>{OPTION_ICONS[correctIdx]}</span>
          <span>{result.correct}</span>
        </div>
      </div>

      {/* Full leaderboard */}
      <div className="w-full max-w-sm space-y-1.5">
        <p className="text-[11px] text-white/40 text-center uppercase tracking-widest mb-2">Standings</p>
        {result.leaderboard.map((p, i) => (
          <motion.div key={p.username} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.06 * i }}
            className={cn('flex items-center gap-3 px-4 py-2.5 rounded-xl',
              p.username === me ? 'bg-primary/20 border border-primary/40' : 'bg-white/5')}>
            <span className="text-[16px] w-6 text-center shrink-0">{MEDALS[i] || `${i + 1}`}</span>
            <span className="flex-1 text-[13px] font-bold truncate">{p.username}</span>
            {p.streak >= 3 && <span className="text-[10px] text-[#ffa602] font-bold">🔥{p.streak}</span>}
            {/* Points from this round */}
            {(() => { const r = result.results.find(x => x.username === p.username); return r?.is_correct ? <span className="text-[11px] text-[#4ade80] font-bold shrink-0">+{r.points}</span> : <span className="text-[11px] text-white/25 shrink-0">+0</span> })()}
            <span className="font-black text-[14px] tabular-nums shrink-0">{p.score.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>

      <p className="text-[11px] text-white/25 animate-pulse">Next question coming up…</p>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Leaderboard (between rounds)
// ══════════════════════════════════════════════════════════════════════════════
function LeaderboardScreen({ leaderboard, me, onContinue }: { leaderboard: Player[]; me: string; onContinue?: () => void }) {
  const MEDALS = ['🥇','🥈','🥉']
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10 gap-5">
      <h2 className="text-[28px] font-black">Leaderboard</h2>
      <div className="w-full max-w-sm space-y-2">
        {leaderboard.map((p, i) => (
          <motion.div key={p.username} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            transition={{ delay: i * 0.07, type: 'spring' }}
            className={cn('flex items-center gap-3 px-4 py-3.5 rounded-[1.25rem] border transition-all',
              p.username === me ? 'bg-primary/25 border-primary/50 shadow-[0_0_20px_rgba(var(--color-primary),0.2)]' : 'bg-white/5 border-white/10')}>
            <span className="text-[22px] w-8 text-center shrink-0">{MEDALS[i] || `#${i+1}`}</span>
            <span className="flex-1 font-bold text-[14px]">{p.username}</span>
            {p.streak >= 3 && <span className="text-[11px] bg-[#ffa602]/20 text-[#ffa602] px-2 py-0.5 rounded-full font-bold">🔥{p.streak}</span>}
            <span className="font-black text-[16px] tabular-nums">{p.score.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>
      <p className="text-[12px] text-white/30 animate-pulse mt-2">Next question loading…</p>
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN: Game Over
// ══════════════════════════════════════════════════════════════════════════════
function GameOverScreen({ leaderboard, me, onPlayAgain }: { leaderboard: Player[]; me: string; onPlayAgain: () => void }) {
  const MEDALS   = ['🥇','🥈','🥉']
  const myRank   = leaderboard.findIndex(p => p.username === me) + 1
  const winner   = leaderboard[0]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10 gap-6">

      {/* Winner podium */}
      {winner && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}
          className="flex flex-col items-center gap-2 text-center">
          <span className="text-[64px]">🏆</span>
          <p className="text-[13px] text-white/40 uppercase tracking-widest">Winner</p>
          <p className="text-[32px] font-black">{winner.username}</p>
          <p className="text-[20px] font-bold text-[#ffa602]">{winner.score.toLocaleString()} pts</p>
        </motion.div>
      )}

      {/* Your result */}
      {myRank > 0 && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
          className="px-8 py-4 bg-primary/20 border border-primary/40 rounded-2xl text-center">
          <p className="text-[13px] text-white/50">Your position</p>
          <p className="text-[28px] font-black">{MEDALS[myRank-1] || `#${myRank}`}</p>
          <p className="text-[14px] text-white/60">{leaderboard[myRank-1]?.score.toLocaleString()} pts</p>
        </motion.div>
      )}

      {/* Full leaderboard */}
      <div className="w-full max-w-sm space-y-2">
        {leaderboard.map((p, i) => (
          <motion.div key={p.username} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.05 * i }}
            className={cn('flex items-center gap-3 px-4 py-3 rounded-xl',
              p.username === me ? 'bg-primary/20 border border-primary/40' : 'bg-white/5')}>
            <span className="text-[18px] w-7 text-center">{MEDALS[i] || `${i+1}`}</span>
            <span className="flex-1 font-bold text-[13px]">{p.username}</span>
            <span className="font-black text-[15px]">{p.score.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>

      <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} onClick={onPlayAgain}
        className="px-10 py-3.5 bg-gradient-to-r from-primary to-[#a855f7] rounded-full font-black text-[16px] shadow-[0_6px_0_0_rgba(0,0,0,0.4)] active:translate-y-1 active:shadow-none transition-all">
        Play Again
      </motion.button>
    </motion.div>
  )
}
