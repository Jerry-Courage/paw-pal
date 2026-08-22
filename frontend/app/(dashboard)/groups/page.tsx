'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { groupsApi, getAuthToken, API_BASE } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type Screen = 'home' | 'create' | 'lobby' | 'countdown' | 'question' | 'round_result' | 'leaderboard' | 'game_over'

interface Player { username: string; score: number; streak: number; ready?: boolean; correct_count?: number; best_streak?: number; avg_time?: number }
interface Question { id: number; text: string; opt_a: string; opt_b: string; opt_c: string; opt_d: string; time_limit: number; idx: number; total: number; explanation?: string }
interface RoundResult { correct: string; explanation?: string; results: { username: string; choice: string; is_correct: boolean; points: number; time_taken: number }[]; leaderboard: Player[] }

const OPTION_COLORS = ['bg-[#e21b3c]', 'bg-[#1368ce]', 'bg-[#d89e00]', 'bg-[#26890c]']
const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const
const QUICK_EMOJIS = ['🔥', '💀', '😱', '🎉', '🧠', '😤', '💪', '😂']

function OptionShape({ index, className = "w-6 h-6 fill-current shrink-0" }: { index: number; className?: string }) {
  switch (index) {
    case 0: return <svg viewBox="0 0 24 24" className={className}><polygon points="12,3 2,21 22,21" /></svg>
    case 1: return <svg viewBox="0 0 24 24" className={className}><polygon points="12,2 22,12 12,22 2,12" /></svg>
    case 2: return <svg viewBox="0 0 24 24" className={className}><circle cx="12" cy="12" r="10" /></svg>
    case 3: return <svg viewBox="0 0 24 24" className={className}><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
    default: return null
  }
}

function useSound(muted: boolean) {
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const ctx = useRef<AudioContext | null>(null)
  const ensure = () => {
    if (!ctx.current) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      if (AC) ctx.current = new AC()
    }
    if (ctx.current && ctx.current.state === 'suspended') ctx.current.resume().catch(() => {})
    return ctx.current
  }
  const play = useCallback((freq: number, type: OscillatorType, dur: number, vol = 0.18) => {
    if (mutedRef.current) return
    try {
      const c = ensure(); if (!c) return
      const osc = c.createOscillator(); const gain = c.createGain()
      osc.connect(gain); gain.connect(c.destination)
      osc.type = type; osc.frequency.setValueAtTime(freq, c.currentTime)
      gain.gain.setValueAtTime(vol, c.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur)
      osc.start(); osc.stop(c.currentTime + dur)
    } catch {}
  }, [])
  return {
    correct:    () => { play(523,'sine',0.15); setTimeout(() => play(659,'sine',0.15),120); setTimeout(() => play(784,'sine',0.25),240); setTimeout(() => play(1046,'sine',0.3),360) },
    wrong:      () => { play(220,'sawtooth',0.3,0.12); setTimeout(() => play(185,'sawtooth',0.3,0.12),150) },
    tick:       () => play(880,'square',0.05,0.06),
    urgentTick: () => { play(1046,'square',0.08,0.1) },
    countdown:  () => play(440,'sine',0.3,0.2),
    go:         () => { play(523,'sine',0.1); setTimeout(() => play(659,'sine',0.1),80); setTimeout(() => play(784,'sine',0.1),160); setTimeout(() => play(1046,'sine',0.35),240) },
    join:       () => { play(660,'sine',0.15,0.15); setTimeout(() => play(880,'sine',0.2,0.15),100) },
    gameOver:   () => { [523,659,784,1046,1318].forEach((f,i) => setTimeout(() => play(f,'sine',0.3,0.2),i*120)) },
    streak:     () => { play(784,'sine',0.1); setTimeout(() => play(988,'sine',0.1),80); setTimeout(() => play(1175,'sine',0.2),160) },
    scorePop:   () => play(1200,'sine',0.08,0.1),
  }
}

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

function FloatingScore({ points, show }: { points: number; show: boolean }) {
  if (!show || points <= 0) return null
  return (
    <motion.div initial={{ opacity: 1, y: 0, scale: 0.5 }} animate={{ opacity: 0, y: -60, scale: 1.2 }} transition={{ duration: 1.2, ease: 'easeOut' }}
      className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <span className="text-[48px] font-black text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.5)]">+{points}</span>
    </motion.div>
  )
}

function FloatingEmoji({ emoji, startX }: { emoji: string; startX: number }) {
  return (
    <motion.div initial={{ opacity: 1, y: 0, scale: 0.5 }} animate={{ opacity: 0, y: -120, scale: 1.5 }} transition={{ duration: 2, ease: 'easeOut' }}
      className="fixed z-50 pointer-events-none text-[32px]" style={{ left: `${startX}%`, bottom: '20%' }}>
      {emoji}
    </motion.div>
  )
}

function StreakFire({ streak }: { streak: number }) {
  if (streak < 3) return null
  return (
    <motion.div className="flex items-center gap-1" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
      <motion.span className="text-2xl" animate={{ scale: [1, 1.3, 1], rotate: [0, -10, 10, 0] }} transition={{ duration: 0.6, repeat: Infinity }}>
        🔥
      </motion.span>
      <span className="text-sm font-bold text-orange-400">{streak}x</span>
    </motion.div>
  )
}

function ChatPanel({ messages, onSend, onClose }: { messages: { username: string; message: string }[]; onSend: (msg: string) => void; onClose: () => void }) {
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-40"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="absolute right-0 top-0 bottom-0 w-[85vw] max-w-80 bg-[#0d091b]/95 backdrop-blur-xl border-l border-white/10 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="font-bold text-sm">Chat</h3>
        <button onClick={onClose} className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-white/30 text-xs text-center mt-10">No messages yet</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className="bg-white/5 rounded-xl px-3 py-2">
            <p className="text-xs font-bold text-purple-400">{m.username}</p>
            <p className="text-sm text-white/80">{m.message}</p>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 px-4 py-3 border-t border-white/10">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        />
        <button type="submit" className="w-11 h-11 rounded-xl bg-purple-600 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-sm">send</span>
        </button>
      </form>
      </motion.div>
    </motion.div>
  )
}

function HomeScreen({ onCreate, onJoin, joinPin, setJoinPin }: { onCreate: () => void; onJoin: () => void; joinPin: string; setJoinPin: (v: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative flex flex-col items-center justify-center min-h-[100dvh] px-6 py-10 overflow-y-auto"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)' }}>
      <button onClick={() => window.history.back()} className="absolute top-4 left-4 w-11 h-11 rounded-full bg-white/10 flex items-center justify-center z-10">
        <span className="material-symbols-outlined text-white">arrow_back</span>
      </button>
      <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
        className="text-[72px] mb-4">
        ⚔️
      </motion.div>
      <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
        className="text-4xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent mb-2 text-center">
        Quiz Battle
      </motion.h1>
      <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
        className="text-white/50 mb-10 text-center px-4">Challenge friends in real-time quiz duels</motion.p>

      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
        className="w-full max-w-sm mb-4 px-2">
        <button onClick={onCreate}
          className="w-full py-5 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-lg shadow-lg shadow-purple-500/25 active:scale-[0.98] transition-transform">
          <span className="material-symbols-outlined align-middle mr-2">add_circle</span>
          Create Room
        </button>
      </motion.div>

      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}
        className="w-full max-w-sm bg-white/5 rounded-2xl p-5 border border-white/10 overflow-hidden">
        <p className="text-white/60 text-sm font-medium mb-3 text-center">Join with PIN</p>
        <div className="flex gap-2">
          <input value={joinPin} onChange={e => setJoinPin(e.target.value.toUpperCase())}
            placeholder="Enter PIN" maxLength={6}
            className="flex-1 bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-center text-xl font-mono tracking-[0.3em] text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-purple-500/50 uppercase" />
          <button onClick={onJoin}
            className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl px-4 py-3 font-semibold text-white active:scale-[0.97] transition-all shrink-0">
            Join
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function CreateScreen({ onBack, onCreated }: { onBack: () => void; onCreated: (pin: string, host: boolean) => void }) {
  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [questionCount, setQuestionCount] = useState(10)
  const [timer, setTimer] = useState(15)
  const [difficulty, setDifficulty] = useState('medium')
  const [selectedRes, setSelectedRes] = useState<any>(null)
  const [resources, setResources] = useState<any[]>([])
  const [fetching, setFetching] = useState(true)
  const [generating, setGenerating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  useEffect(() => {
    const { libraryApi } = require('@/lib/api')
    libraryApi.getResources().then((r: any) => {
      const items = Array.isArray(r.data) ? r.data : r.data?.results || []
      setResources(items)
    }).catch(() => {}).finally(() => setFetching(false))
  }, [])

  const handleCreate = async () => {
    if (!topic.trim() && !selectedRes && !uploadFile) return toast.error('Enter a topic, pick a resource, or upload a file.')
    setGenerating(true)
    try {
      let resourceId = selectedRes?.id
      if (uploadFile && !selectedRes) {
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
        title: title.trim() || topic.trim() || selectedRes?.title || undefined,
        count: questionCount,
        time_per_q: timer,
        difficulty,
      })
      const data = res.data
      toast.success('Quiz room created!')
      onCreated(data.pin, true)
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to create quiz room.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
      className="flex-1 flex flex-col h-[100dvh] overflow-y-auto px-4 py-6"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)' }}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <h2 className="text-xl font-bold">Create Battle Room</h2>
      </div>

      <div className="space-y-4 max-w-sm mx-auto w-full">
        <div>
          <label className="text-xs text-white/50 font-medium mb-1.5 block">Topic *</label>
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Biology, World History..."
            className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
        </div>

        <div>
          <label className="text-xs text-white/50 font-medium mb-1.5 block">Room Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Optional title..."
            className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
        </div>

        <p className="text-xs text-white/40 italic">AI extracts questions with explanations from your notes</p>

        {/* Resource Selection */}
        <div>
          <label className="text-xs text-white/50 font-medium mb-2 block">Or Select Study Material</label>
          {fetching ? (
            <div className="flex items-center justify-center py-6 gap-2 text-white/40 text-xs">
              <span className="material-symbols-outlined animate-spin text-[16px]">autorenew</span>
              Loading library...
            </div>
          ) : resources.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-4">No resources found. Upload a file below.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
              {resources.map((r: any) => (
                <button key={r.id} onClick={() => { setSelectedRes(r); setUploadFile(null); setTopic('') }}
                  className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all text-sm',
                    selectedRes?.id === r.id ? 'bg-purple-600/20 border-purple-500/50' : 'bg-white/5 border-white/10 hover:bg-white/10')}>
                  <span className="material-symbols-outlined text-[18px] text-purple-400">
                    {r.resource_type === 'pdf' ? 'picture_as_pdf' : r.resource_type === 'video' ? 'smart_display' : 'description'}
                  </span>
                  <span className="flex-1 truncate font-medium text-white/80">{r.title}</span>
                  {selectedRes?.id === r.id && <span className="material-symbols-outlined text-purple-400 text-[16px]">check_circle</span>}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">or upload</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <input ref={fileRef} type="file" accept=".pdf,image/*,.txt,.doc,.docx" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { setUploadFile(f); setSelectedRes(null); setTopic('') }; e.target.value = '' }} />
          <button onClick={() => fileRef.current?.click()}
            className={cn('w-full py-3 border-2 border-dashed rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2',
              uploadFile ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400' : 'border-white/20 text-white/40 hover:border-white/40')}>
            <span className="material-symbols-outlined text-[16px]">upload_file</span>
            <span className="truncate">{uploadFile ? uploadFile.name : 'Upload PDF, Image, or Doc'}</span>
          </button>
        </div>

        <div>
          <label className="text-xs text-white/50 font-medium mb-2 block">Questions</label>
          <div className="grid grid-cols-4 gap-2">
            {[5, 10, 15, 20].map(n => (
              <button key={n} onClick={() => setQuestionCount(n)}
                className={cn("py-2.5 rounded-xl font-semibold text-sm transition-all", questionCount === n ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/50 border border-white/10')}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-white/50 font-medium mb-2 block">Timer per Question</label>
          <div className="grid grid-cols-4 gap-2">
            {[10, 15, 20, 30].map(s => (
              <button key={s} onClick={() => setTimer(s)}
                className={cn("py-2.5 rounded-xl font-semibold text-sm transition-all", timer === s ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/50 border border-white/10')}>
                {s}s
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-white/50 font-medium mb-2 block">Difficulty</label>
          <div className="grid grid-cols-3 gap-2">
            {['easy', 'medium', 'hard'].map(d => (
              <button key={d} onClick={() => setDifficulty(d)}
                className={cn("py-2.5 rounded-xl font-semibold text-sm capitalize transition-all",
                  difficulty === d ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/50 border border-white/10')}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleCreate} disabled={generating}
          className={cn("w-full py-4 rounded-2xl font-bold text-lg transition-all mt-2",
            generating ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25 active:scale-[0.98]')}>
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
              Generating...
            </span>
          ) : (
            <><span className="material-symbols-outlined align-middle mr-2">auto_awesome</span> Generate & Create</>
          )}
        </button>
      </div>
    </motion.div>
  )
}

function LobbyScreen({ pin, players, isHost, onStart, onLeave, onToggleReady, me, isStarting, isConnecting, isRematch, onToggleMute, muted, onToggleChat }: {
  pin: string; players: Player[]; isHost: boolean; onStart: () => void; onLeave: () => void; onToggleReady: () => void; me: string; isStarting: boolean; isConnecting: boolean; isRematch: boolean; onToggleMute: () => void; muted: boolean; onToggleChat: () => void
}) {
  const [copied, setCopied] = useState(false)
  const mePlayer = players.find(p => p.username === me)
  const allReady = players.length >= 2 && players.every(p => p.ready)
  const canStart = isHost && allReady && players.length >= 2

  const copyPin = () => {
    navigator.clipboard.writeText(pin).then(() => {
      setCopied(true); toast.success('PIN copied!')
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => toast.error('Failed to copy'))
  }

  const avatarColors = ['from-purple-500 to-pink-500', 'from-blue-500 to-cyan-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500', 'from-rose-500 to-red-500']

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col h-[100dvh] overflow-y-auto px-4 py-6"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)' }}>

      <div className="flex items-center gap-3 mb-6">
        <button onClick={onLeave} className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <h2 className="text-xl font-bold">Lobby</h2>
        {isConnecting && <span className="text-xs text-amber-400 animate-pulse">Connecting...</span>}
        <div className="flex-1" />
        <button onClick={onToggleMute} className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-sm text-white">{muted ? 'volume_off' : 'volume_up'}</span>
        </button>
        <button onClick={onToggleChat} className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-sm text-white">chat_bubble</span>
        </button>
      </div>

      {isRematch && (
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="bg-purple-500/15 border border-purple-500/30 rounded-xl p-3 mb-4 text-center">
          <p className="text-sm font-bold text-purple-400">
            <span className="material-symbols-outlined text-sm align-middle mr-1">replay</span>
            Rematch in progress! Get ready to play again.
          </p>
        </motion.div>
      )}

      <div className="flex-1 flex flex-col items-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="bg-white/5 border border-white/15 rounded-2xl p-6 mb-6 w-full max-w-xs text-center">
          <p className="text-white/50 text-xs font-medium mb-2 uppercase tracking-wider">Room PIN</p>
          <p className="text-4xl font-black font-mono tracking-[0.3em] text-white mb-3">{pin}</p>
          <button onClick={copyPin}
            className="text-xs bg-white/10 hover:bg-white/15 rounded-lg px-3 py-1.5 text-white/60 transition-colors">
            <span className="material-symbols-outlined text-sm align-middle mr-1">{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied!' : 'Copy PIN'}
          </button>
        </motion.div>

        <div className="w-full max-w-sm mb-6">
          <p className="text-white/50 text-xs font-medium mb-3 uppercase tracking-wider">Players ({players.length}/5)</p>
          <div className="grid grid-cols-2 gap-3">
            {players.map((p, i) => (
              <motion.div key={p.username} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 300 }}
                className={cn("bg-white/5 border rounded-xl p-4 flex items-center gap-3 relative",
                  p.username === me ? 'border-purple-500/50' : 'border-white/10')}>
                <div className={cn("w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold",
                  avatarColors[i % avatarColors.length])}>
                  {p.username[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.username}{p.username === me ? ' (You)' : ''}</p>
                  {p.username === players[0]?.username && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">HOST</span>
                  )}
                </div>
                {p.ready && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-emerald-400">
                    <span className="material-symbols-outlined text-xl">check_circle</span>
                  </motion.span>
                )}
              </motion.div>
            ))}
            {Array.from({ length: 5 - players.length }, (_, i) => (
              <div key={`empty-${i}`} className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-4 flex items-center justify-center">
                <span className="text-white/15 text-sm">Waiting...</span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-sm space-y-3">
          {!isHost && (
            <motion.button whileTap={{ scale: 0.97 }} onClick={onToggleReady}
              className={cn("w-full py-4 rounded-xl font-bold text-base transition-all",
                mePlayer?.ready ? 'bg-emerald-600 text-white' : 'bg-white/10 border border-white/15 text-white')}>
              <span className="material-symbols-outlined align-middle mr-2">{mePlayer?.ready ? 'check_circle' : 'radio_button_unchecked'}</span>
              {mePlayer?.ready ? 'Ready!' : 'Tap to Ready Up'}
            </motion.button>
          )}

          {isHost && (
            <motion.button whileTap={{ scale: 0.97 }} onClick={onStart} disabled={!canStart || isStarting}
              className={cn("w-full py-4 rounded-xl font-bold text-base transition-all",
                canStart && !isStarting ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25' : 'bg-white/10 text-white/30 cursor-not-allowed')}>
              {isStarting ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                  Starting...
                </span>
              ) : (
                <><span className="material-symbols-outlined align-middle mr-2">play_arrow</span>
                Start Battle {players.length < 2 ? '(Need 2+ players)' : !allReady ? '(All must be ready)' : ''}</>
              )}
            </motion.button>
          )}

          <button onClick={onLeave} className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm font-medium hover:bg-white/10 transition-colors">
            Leave Room
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function CountdownScreen({ count }: { count: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center h-[100dvh]">
      <AnimatePresence mode="wait">
        <motion.div key={count} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 2, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="relative flex items-center justify-center">
          {[0, 1, 2].map(i => (
            <motion.div key={i}
              className="absolute rounded-full border-2 border-purple-500/30"
              initial={{ width: 120, height: 120, opacity: 0.6 }}
              animate={{ width: 120 + i * 60, height: 120 + i * 60, opacity: 0 }}
              transition={{ duration: 1.5, delay: i * 0.3, repeat: Infinity }}
            />
          ))}
          <span className="text-[120px] font-black text-white drop-shadow-[0_0_40px_rgba(168,85,247,0.5)]">{count}</span>
        </motion.div>
      </AnimatePresence>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        className="text-2xl font-bold text-white/80 mt-6 tracking-wider">
        GET READY!
      </motion.p>
    </motion.div>
  )
}

function QuestionScreen({ question, timeLeft, setTimeLeft, answered, onAnswer, onReact, answeredCount, players, me, onToggleMute, muted, onToggleChat }: {
  question: Question; timeLeft: number; setTimeLeft: (v: number) => void; answered: string | null;
  onAnswer: (choice: string) => void; onReact: (emoji: string) => void;
  answeredCount: { answered: number; total: number }; players: Player[]; me: string;
  onToggleMute: () => void; muted: boolean; onToggleChat: () => void
}) {
  const myStreak = useMemo(() => players.find(p => p.username === me)?.streak || 0, [players, me])
  const [showExplanation, setShowExplanation] = useState(false)

  useEffect(() => {
    if (answered && question.explanation) {
      const timer = setTimeout(() => setShowExplanation(true), 1500)
      return () => clearTimeout(timer)
    }
    setShowExplanation(false)
  }, [answered, question.explanation])

  useEffect(() => {
    if (answered) return
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase()
      if (['A', 'B', 'C', 'D'].includes(key)) {
        e.preventDefault()
        onAnswer(key)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [answered, onAnswer])
  const timerPct = (timeLeft / question.time_limit) * 100
  const timerColor = timerPct > 50 ? 'text-emerald-400' : timerPct > 25 ? 'text-amber-400' : 'text-red-400'
  const barColor = timerPct > 50 ? 'bg-emerald-500' : timerPct > 25 ? 'bg-amber-500' : 'bg-red-500'
  const opts = [
    { key: 'A', text: question.opt_a },
    { key: 'B', text: question.opt_b },
    { key: 'C', text: question.opt_c },
    { key: 'D', text: question.opt_d },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col h-[100dvh] overflow-y-auto"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)' }}>

      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white/60">Q{question.idx}/{question.total}</span>
            <StreakFire streak={myStreak} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40">{answeredCount.answered}/{answeredCount.total} answered</span>
            <button onClick={onToggleMute} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-sm text-white">{muted ? 'volume_off' : 'volume_up'}</span>
            </button>
            <button onClick={onToggleChat} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-sm text-white">chat_bubble</span>
            </button>
            <div className="relative w-10 h-10 shrink-0">
              <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3"
                  className={timerColor} strokeDasharray={`${timerPct} 100`} strokeLinecap="round" />
              </svg>
              <span className={cn("absolute inset-0 flex items-center justify-center text-xs font-bold", timerColor)}>
                {timeLeft}
              </span>
            </div>
          </div>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div className={cn("h-full rounded-full", barColor)} animate={{ width: `${timerPct}%` }}
            transition={{ duration: 0.3 }} />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="bg-white/[0.05] border border-white/10 rounded-2xl p-6 mb-6 w-full max-w-lg">
          <p className="text-lg font-semibold text-center leading-relaxed">{question.text}</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
          {opts.map((opt, i) => {
            const isSelected = answered === opt.key
            return (
              <motion.button key={opt.key} whileTap={{ scale: 0.97 }}
                onClick={() => onAnswer(opt.key)}
                disabled={!!answered}
                className={cn(
                  "relative flex items-center gap-3 p-4 rounded-xl font-medium text-left transition-all border-2",
                  OPTION_COLORS[i], "border-transparent text-white",
                  isSelected && "ring-2 ring-white ring-offset-2 ring-offset-transparent",
                  answered && "opacity-50"
                )}>
                <OptionShape index={i} className="w-5 h-5 fill-current shrink-0 opacity-70" />
                <span className="flex-1 text-sm">{opt.text}</span>
                <span className="text-xs opacity-60 font-bold">{opt.key}</span>
              </motion.button>
            )
          })}
        </div>

        <AnimatePresence>
          {showExplanation && question.explanation && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              className="mt-4 bg-purple-500/15 border border-purple-500/25 rounded-xl p-4 w-full max-w-lg">
              <p className="text-xs text-purple-400 font-medium mb-1">
                <span className="material-symbols-outlined text-sm align-middle mr-1">lightbulb</span>
                Explanation
              </p>
              <p className="text-sm text-white/70 leading-relaxed">{question.explanation}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-4 pb-4">
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          {QUICK_EMOJIS.map(emoji => (
            <motion.button key={emoji} whileTap={{ scale: 0.8 }} onClick={() => onReact(emoji)}
              className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-lg hover:bg-white/10 active:scale-90 transition-all">
              {emoji}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function RoundResultScreen({ result, answered, me, isHost }: { result: RoundResult; answered: string | null; me: string; isHost: boolean }) {
  const myResult = result.results.find(r => r.username === me)
  const isCorrect = answered === result.correct
  const myRank = result.leaderboard.findIndex(p => p.username === me) + 1

  const fastestCorrect = useMemo(() => {
    const correctResults = result.results.filter(r => r.is_correct && r.time_taken > 0)
    return correctResults.length > 0 ? correctResults.reduce((a, b) => a.time_taken < b.time_taken ? a : b) : null
  }, [result.results])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col h-[100dvh] overflow-y-auto px-4 py-6"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)' }}>

      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className={cn("text-center py-6 rounded-2xl mb-4",
          isCorrect ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-red-500/15 border border-red-500/30')}>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}
          className="text-5xl mb-2">
          {isCorrect ? '✅' : '❌'}
        </motion.div>
        <h3 className={cn("text-2xl font-black", isCorrect ? 'text-emerald-400' : 'text-red-400')}>
          {isCorrect ? 'Correct!' : 'Incorrect'}
        </h3>
        {myResult && myResult.points > 0 && (
          <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 }}
            className="text-lg font-bold text-white mt-1">+{myResult.points} points</motion.p>
        )}
        {myResult && myResult.time_taken > 0 && (
          <p className="text-xs text-white/40 mt-1">
            <span className="material-symbols-outlined text-sm align-middle mr-1">schedule</span>
            Answered in {myResult.time_taken.toFixed(1)}s
          </p>
        )}
      </motion.div>

      <div className="text-center mb-3">
        <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Correct Answer</p>
        <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
          className="inline-block">
          <span className={cn("text-lg font-bold text-white rounded-xl py-2 px-4 inline-block", OPTION_COLORS[OPTION_KEYS.indexOf(result.correct as typeof OPTION_KEYS)])}>
            {result.correct}
          </span>
        </motion.div>
      </div>

      {result.explanation && (
        <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}
          className="bg-purple-500/10 border border-purple-500/25 rounded-xl p-4 mb-4">
          <p className="text-xs text-purple-400 font-medium mb-1">
            <span className="material-symbols-outlined text-sm align-middle mr-1">lightbulb</span>
            Explanation
          </p>
          <p className="text-sm text-white/70 leading-relaxed">{result.explanation}</p>
        </motion.div>
      )}

      <div className="mb-4">
        <p className="text-white/50 text-xs font-medium mb-2 uppercase tracking-wider">Results</p>
        <div className="space-y-2">
          {result.results.map((r, i) => (
            <motion.div key={r.username} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 * i }}
              className={cn("flex items-center gap-3 bg-white/5 border rounded-xl px-4 py-3",
                r.username === me ? 'border-purple-500/40' : 'border-white/10')}>
              <span className="text-lg">{r.is_correct ? '✅' : '❌'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">
                  {r.username}{r.username === me ? ' (You)' : ''}
                  {r.username === fastestCorrect?.username && (
                    <span className="text-yellow-400 text-xs font-bold ml-1">⚡ Fastest!</span>
                  )}
                </p>
                <p className="text-xs text-white/40">{r.time_taken.toFixed(1)}s</p>
              </div>
              <span className={cn("font-bold text-sm", r.points > 0 ? 'text-emerald-400' : 'text-white/30')}>
                {r.points > 0 ? `+${r.points}` : '0'}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-white/50 text-xs font-medium mb-2 uppercase tracking-wider">Current Standings</p>
        <div className="space-y-2">
          {result.leaderboard.map((p, i) => {
            const medals = ['🥇', '🥈', '🥉']
            return (
              <motion.div key={p.username} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.05 * i }}
                className={cn("flex items-center gap-3 bg-white/5 border rounded-xl px-4 py-3",
                  p.username === me ? 'border-purple-500/40' : 'border-white/10')}>
                <span className="text-lg w-8 text-center">{i < 3 ? medals[i] : <span className="text-white/30 text-sm font-bold">{i + 1}</span>}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.username}{p.username === me ? ' (You)' : ''}</p>
                </div>
                <span className="font-bold text-sm text-white">{p.score.toLocaleString()}</span>
                {p.streak >= 3 && <StreakFire streak={p.streak} />}
              </motion.div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

function LeaderboardScreen({ leaderboard, me }: { leaderboard: Player[]; me: string }) {
  const medals = ['🥇', '🥈', '🥉']
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col h-[100dvh] overflow-y-auto px-4 py-6"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)' }}>
      <h2 className="text-2xl font-black text-center mb-6">Leaderboard</h2>
      <div className="space-y-2 max-w-sm mx-auto w-full">
        {leaderboard.map((p, i) => (
          <motion.div key={p.username} initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            transition={{ delay: i * 0.08, type: 'spring', stiffness: 300 }}
            className={cn("flex items-center gap-3 bg-white/5 border rounded-xl px-4 py-3",
              p.username === me ? 'border-purple-500/40 bg-purple-500/10' : 'border-white/10')}>
            <span className="text-lg w-8 text-center">{i < 3 ? medals[i] : <span className="text-white/30 text-sm font-bold">{i + 1}</span>}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{p.username}{p.username === me ? ' (You)' : ''}</p>
            </div>
            <span className="font-bold text-white">{p.score.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

function GameOverScreen({ leaderboard, me, onPlayAgain, onGoHome, totalQuestions }: { leaderboard: Player[]; me: string; onPlayAgain: () => void; onGoHome: () => void; totalQuestions: number }) {
  const podium = useMemo(() => {
    const sorted = [...leaderboard].sort((a, b) => b.score - a.score)
    const top3 = sorted.slice(0, 3)
    return {
      second: top3[1] || null,
      first: top3[0] || null,
      third: top3[2] || null,
    }
  }, [leaderboard])

  const myRank = leaderboard.findIndex(p => p.username === me) + 1
  const myStats = leaderboard.find(p => p.username === me)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col h-[100dvh] overflow-y-auto px-4 py-6"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 24px)' }}>

      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}
        className="text-center mb-6">
        <h2 className="text-3xl font-black bg-gradient-to-r from-amber-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
          Battle Complete!
        </h2>
      </motion.div>

      <div className="flex items-end justify-center gap-2 mb-6 h-48">
        {[podium.second, podium.first, podium.third].map((player, idx) => {
          const positions = [
            { order: 0, height: 'h-28', medal: '🥈', rank: 2 },
            { order: 1, height: 'h-40', medal: '🥇', rank: 1 },
            { order: 2, height: 'h-20', medal: '🥉', rank: 3 },
          ]
          const pos = positions[idx]
          return (
            <motion.div key={idx}
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 + idx * 0.2, type: 'spring', stiffness: 200 }}
              className="flex flex-col items-center flex-1 max-w-[120px]">
              {player && (
                <>
                  <span className="text-2xl mb-1">{pos.medal}</span>
                  <div className={cn("w-12 h-12 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold mb-2",
                    idx === 1 ? 'from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30' : idx === 0 ? 'from-gray-300 to-gray-400' : 'from-amber-600 to-amber-700')}>
                    {player.username[0]?.toUpperCase()}
                  </div>
                  <p className="text-xs font-bold truncate w-full text-center">{player.username}</p>
                  <p className="text-[10px] text-white/50">{player.score.toLocaleString()} pts</p>
                </>
              )}
              <div className={cn("w-full rounded-t-xl mt-1",
                pos.height,
                idx === 1 ? 'bg-gradient-to-t from-amber-600 to-amber-400' : idx === 0 ? 'bg-gradient-to-t from-gray-600 to-gray-400' : 'bg-gradient-to-t from-amber-800 to-amber-600')}
                style={{ perspective: '200px', transformStyle: 'preserve-3d' }} />
            </motion.div>
          )
        })}
      </div>

      {myRank > 0 && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.8 }}
          className="bg-purple-500/15 border border-purple-500/30 rounded-2xl p-4 mb-4 text-center">
          <p className="text-sm text-white/50 mb-1">Your Rank</p>
          <p className="text-2xl font-black text-purple-400">#{myRank}</p>
        </motion.div>
      )}

      {myStats && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.9 }}
          className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <p className="text-xs text-white/40 mb-1">Accuracy</p>
            <p className="text-lg font-bold text-white">
              {myStats.correct_count && totalQuestions > 0
                ? Math.round((myStats.correct_count / totalQuestions) * 100)
                : 0}%
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <p className="text-xs text-white/40 mb-1">Avg Speed</p>
            <p className="text-lg font-bold text-white">{myStats.avg_time ? myStats.avg_time.toFixed(1) + 's' : '--'}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <p className="text-xs text-white/40 mb-1">Best Streak</p>
            <p className="text-lg font-bold text-white">{myStats.best_streak || myStats.streak || 0}x</p>
          </div>
        </motion.div>
      )}

      <div className="mb-6">
        <p className="text-white/50 text-xs font-medium mb-2 uppercase tracking-wider">Final Standings</p>
        <div className="space-y-2 max-w-sm mx-auto">
          {leaderboard.map((p, i) => {
            const medals = ['🥇', '🥈', '🥉']
            return (
              <motion.div key={p.username} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 1 + i * 0.05 }}
                className={cn("flex items-center gap-3 bg-white/5 border rounded-xl px-4 py-3",
                  p.username === me ? 'border-purple-500/40 bg-purple-500/10' : 'border-white/10')}>
                <span className="text-lg w-8 text-center">{i < 3 ? medals[i] : <span className="text-white/30 text-sm font-bold">{i + 1}</span>}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.username}{p.username === me ? ' (You)' : ''}</p>
                </div>
                <span className="font-bold text-sm text-white">{p.score.toLocaleString()}</span>
                {p.streak >= 3 && <StreakFire streak={p.streak} />}
              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="flex gap-3 max-w-sm mx-auto w-full">
        <motion.button whileTap={{ scale: 0.97 }} onClick={onPlayAgain}
          className="flex-1 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold shadow-lg shadow-purple-500/25 active:scale-[0.98] transition-transform">
          <span className="material-symbols-outlined align-middle mr-2">replay</span>
          Rematch
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={onGoHome}
          className="flex-1 py-4 rounded-xl bg-white/10 border border-white/15 text-white font-bold active:scale-[0.98] transition-transform">
          <span className="material-symbols-outlined align-middle mr-2">home</span>
          Home
        </motion.button>
      </div>
    </motion.div>
  )
}

export default function QuizBattlePage() {
  const { data: session } = useSession()
  const [muted, setMuted] = useState(false)
  const snd = useSound(muted)
  const me = session?.user?.username || session?.user?.name || 'You'

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
  const [floatingScore, setFloatingScore] = useState({ points: 0, show: false })
  const [floatingEmojis, setFloatingEmojis] = useState<{emoji: string; id: number; x: number}[]>([])
  const [answeredCount, setAnsweredCount] = useState({ answered: 0, total: 0 })
  const [chatMessages, setChatMessages]   = useState<{username: string; message: string}[]>([])
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [showChat, setShowChat]           = useState(false)
  const [isRematch, setIsRematch]         = useState(false)

  const wsRef        = useRef<WebSocket | null>(null)
  const qStartRef    = useRef<number>(0)
  const msgHandlerRef = useRef<(msg: any) => void>(() => {})

  useEffect(() => {
    const unlock = () => {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext
        if (AC) { const t = new AC(); if (t.state === 'suspended') t.resume() }
      } catch {}
      window.removeEventListener('click', unlock)
      window.removeEventListener('touchstart', unlock)
    }
    window.addEventListener('click', unlock)
    window.addEventListener('touchstart', unlock)
    return () => { window.removeEventListener('click', unlock); window.removeEventListener('touchstart', unlock) }
  }, [])

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
    ws.onmessage = (ev) => { msgHandlerRef.current(JSON.parse(ev.data)) }
  }, [])

  const disconnect = useCallback(() => { wsRef.current?.close(); wsRef.current = null }, [])
  useEffect(() => () => { disconnect() }, [disconnect])

  const handleServerMsg = useCallback((msg: any) => {
    switch (msg.type) {
      case 'player_joined':
        setPlayers(msg.players || [])
        if (msg.username !== me) snd.join()
        break
      case 'player_left':
        setPlayers(msg.players || [])
        break
      case 'player_ready':
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
        setQuestion({ id: msg.id, text: msg.text, opt_a: msg.opt_a, opt_b: msg.opt_b, opt_c: msg.opt_c, opt_d: msg.opt_d, time_limit: msg.time_limit, idx: msg.idx, total: msg.total, explanation: msg.explanation })
        setTimeLeft(msg.time_limit)
        setAnswered(null)
        setAnswerTime(0)
        setAnsweredCount({ answered: 0, total: 0 })
        setTotalQuestions(msg.total)
        qStartRef.current = Date.now()
        setScreen('question')
        break
      case 'timer_tick':
        setTimeLeft(msg.remaining)
        if (msg.remaining <= 5) snd.urgentTick()
        else if (msg.remaining <= 10) snd.tick()
        break
      case 'answer_reaction':
        if (msg.reaction_type === 'answer_submit') {
          setAnsweredCount({ answered: msg.answered, total: msg.total })
        } else if (msg.reaction_type === 'emoji') {
          const id = Date.now() + Math.random()
          setFloatingEmojis(prev => [...prev.slice(-10), { emoji: msg.emoji, id, x: 20 + Math.random() * 60 }])
        }
        break
      case 'round_result':
        setRoundResult({ correct: msg.correct, explanation: msg.explanation, results: msg.results || [], leaderboard: msg.leaderboard || [] })
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
        const xpAwards = msg.xp_awards || []
        const myAward = xpAwards.find((a: any) => a.username === me)
        if (myAward) {
          setTimeout(() => {
            if (myAward.bonus === 'perfect_score') {
              toast.success(`Perfect Score! +${myAward.xp} XP`, { duration: 5000 })
            } else if (myAward.rank <= 3) {
              const medals = ['🏆', '🥈', '🥉']
              toast.success(`${medals[myAward.rank - 1]} ${myAward.rank === 1 ? 'Winner' : `#${myAward.rank}`}! +${myAward.xp} XP`, { duration: 5000 })
            } else {
              toast.success(`+${myAward.xp} XP participation reward`, { duration: 3000 })
            }
          }, 1500)
        }
        break
      case 'chat_message':
        setChatMessages(prev => [...prev.slice(-30), { username: msg.username, message: msg.message }])
        break
      case 'rematch_request':
        toast(`${msg.username} wants a rematch!`, { icon: '🔄' })
        break
      case 'rematch_start':
        toast.success('Rematch starting!', { icon: '⚡' })
        setIsRematch(true)
        setScreen('lobby')
        setQuestion(null)
        setRoundResult(null)
        setLeaderboard([])
        break
    }
  }, [me, snd])

  useEffect(() => { msgHandlerRef.current = handleServerMsg }, [handleServerMsg])
  useEffect(() => {
    if (!wsRef.current) return
    wsRef.current.onmessage = (ev) => msgHandlerRef.current(JSON.parse(ev.data))
  }, [handleServerMsg])

  const handleJoinRoom = async () => {
    const p = joinPinInput.trim().toUpperCase()
    if (p.length !== 6) return toast.error('Enter a valid 6-digit PIN.')
    try {
      await groupsApi.joinQuiz(p)
      setPin(p); setIsHost(false)
      await connect(p); setScreen('lobby')
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
    setAnswered(choice); setAnswerTime(elapsed)
    wsRef.current?.send(JSON.stringify({ type: 'submit_answer', choice, time_taken: elapsed }))
    snd.scorePop()
  }

  const handleSendReaction = (emoji: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'send_reaction', emoji }))
  }

  const handleToggleReady = () => {
    wsRef.current?.send(JSON.stringify({ type: 'set_ready' }))
  }

  const handleRematch = () => {
    wsRef.current?.send(JSON.stringify({ type: 'request_rematch' }))
  }

  const handleSendChat = (message: string) => {
    if (!message.trim()) return
    wsRef.current?.send(JSON.stringify({ type: 'chat_message', message: message.trim() }))
  }

  const goHome = () => { disconnect(); setScreen('home'); setPin(''); setPlayers([]); setQuestion(null); setRoundResult(null); setLeaderboard([]); setIsHost(false); setIsStarting(false); setChatMessages([]); setIsRematch(false); setShowChat(false) }

  const vibrate = (ms: number | number[]) => {
    try { (navigator as any)?.vibrate?.(ms) } catch {}
  }

  const handleToggleMute = useCallback(() => setMuted(prev => !prev), [])
  const handleToggleChat = useCallback(() => setShowChat(prev => !prev), [])

  useEffect(() => {
    if (screen !== 'round_result' || !roundResult || !answered) return
    const isCorrect = answered === roundResult.correct
    if (isCorrect) {
      snd.correct()
      vibrate(50)
      const myResult = roundResult.results.find(r => r.username === me)
      if (myResult && myResult.points > 0) {
        setFloatingScore({ points: myResult.points, show: true })
        snd.scorePop()
        setTimeout(() => setFloatingScore({ points: 0, show: false }), 1200)
      }
    } else {
      snd.wrong()
      vibrate([30, 50, 30])
    }
  }, [screen, roundResult, answered, me, snd])

  return (
    <div className="min-h-screen bg-[#0d091b] text-white relative overflow-x-hidden selection:bg-primary selection:text-white">
      {showConfetti && <Confetti />}
      <FloatingScore points={floatingScore.points} show={floatingScore.show} />
      {floatingEmojis.map(e => <FloatingEmoji key={e.id} emoji={e.emoji} startX={e.x} />)}
      <div className="tool-header-safe" />
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] left-[-10%] w-[70vw] h-[70vw] max-w-[600px] max-h-[600px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[60vw] h-[60vw] max-w-[500px] max-h-[500px] rounded-full bg-[#a855f7]/15 blur-[100px]" />
      </div>
      <div className="relative z-10 h-[100dvh] flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {screen === 'home'        && <HomeScreen     key="home"     onCreate={() => setScreen('create')} onJoin={handleJoinRoom} joinPin={joinPinInput} setJoinPin={setJoinPinInput} />}
          {screen === 'create'      && <CreateScreen   key="create"   onBack={() => setScreen('home')} onCreated={async (roomPin, host) => { setPin(roomPin); setIsHost(host); await connect(roomPin); setScreen('lobby') }} />}
          {screen === 'lobby'       && <LobbyScreen    key="lobby"    pin={pin} players={players} isHost={isHost} onStart={handleStartGame} onLeave={goHome} onToggleReady={handleToggleReady} me={me} isStarting={isStarting} isConnecting={isConnecting} isRematch={isRematch} onToggleMute={handleToggleMute} muted={muted} onToggleChat={handleToggleChat} />}
          {screen === 'countdown'   && <CountdownScreen key="countdown" count={countNum} />}
          {screen === 'question'    && question && <QuestionScreen key={`q-${question.idx}`} question={question} timeLeft={timeLeft} setTimeLeft={setTimeLeft} answered={answered} onAnswer={handleAnswer} onReact={handleSendReaction} answeredCount={answeredCount} players={players} me={me} onToggleMute={handleToggleMute} muted={muted} onToggleChat={handleToggleChat} />}
          {screen === 'round_result' && roundResult && <RoundResultScreen key="result" result={roundResult} answered={answered} me={me} isHost={isHost} />}
          {screen === 'leaderboard' && <LeaderboardScreen key="lb" leaderboard={leaderboard} me={me} />}
          {screen === 'game_over'   && <GameOverScreen  key="gameover" leaderboard={leaderboard} me={me} onPlayAgain={handleRematch} onGoHome={goHome} totalQuestions={totalQuestions} />}
        </AnimatePresence>
        <AnimatePresence>
          {showChat && <ChatPanel messages={chatMessages} onSend={handleSendChat} onClose={() => setShowChat(false)} />}
        </AnimatePresence>
      </div>
    </div>
  )
}
