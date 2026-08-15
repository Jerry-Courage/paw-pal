'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { libraryApi, authApi } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Trophy, Heart, Zap, RefreshCw, Volume2, VolumeX, Sparkles, Play, Award } from 'lucide-react'
import { toast } from 'sonner'

interface Question {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

export default function KnowledgeRunnerPage() {
  const params = useParams()
  const router = useRouter()
  const resourceId = Number(params.id)

  const [resource, setResource] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQIndex, setCurrentQIndex] = useState(0)

  // Game state
  const [gameState, setGameState] = useState<'intro' | 'playing' | 'paused' | 'gameover' | 'victory'>('intro')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [combo, setCombo] = useState(0)
  const [lane, setLane] = useState<1 | 2 | 3>(2) // 1: Left, 2: Center, 3: Right
  const [feedback, setFeedback] = useState<{ text: string; correct: boolean } | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)

  useEffect(() => {
    libraryApi.getResource(resourceId).then(r => setResource(r.data)).catch(() => {})
    loadQuestions()
  }, [resourceId])

  const loadQuestions = async () => {
    setLoading(true)
    try {
      const res = await libraryApi.generatePracticeQuestions(resourceId)
      const data = res.data
      let qList: Question[] = []
      if (Array.isArray(data)) {
        qList = data.map((item: any) => ({
          question: item.question,
          options: item.options || item.choices || [],
          correctIndex: item.correct_index ?? item.answerIndex ?? 0,
          explanation: item.explanation || ''
        }))
      } else if (data.questions) {
        qList = data.questions.map((item: any) => ({
          question: item.question,
          options: item.options || item.choices || [],
          correctIndex: item.correct_index ?? item.answerIndex ?? 0,
          explanation: item.explanation || ''
        }))
      }
      
      if (qList.length === 0) {
        qList = [
          { question: `What is a primary concept in ${resource?.title || 'this material'}?`, options: ['Core Principles', 'Random Data', 'Invalid Syntax', 'Empty State'], correctIndex: 0, explanation: 'Core principles drive understanding.' },
          { question: 'How do you ensure effective study retention?', options: ['Active Recall', 'Passive Skimming', 'Ignoring Notes', 'Memorizing blindly'], correctIndex: 0, explanation: 'Active recall strengthens memory.' }
        ]
      }
      setQuestions(qList)
    } catch (e) {
      toast.error('Failed to load runner questions.')
    } finally {
      setLoading(false)
    }
  }

  const currentQ = questions[currentQIndex] || questions[0]

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'playing') return
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        setLane(l => (l > 1 ? (l - 1) as any : 1))
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        setLane(l => (l < 3 ? (l + 1) as any : 3))
      } else if (e.key === '1') {
        selectLaneAnswer(1)
      } else if (e.key === '2') {
        selectLaneAnswer(2)
      } else if (e.key === '3') {
        selectLaneAnswer(3)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, currentQIndex, lane, questions])

  const selectLaneAnswer = (chosenLane: number) => {
    if (gameState !== 'playing') return
    const optionsCount = currentQ?.options?.length || 2
    // Map lanes (1,2,3) to option indices
    const optionIndex = Math.min(chosenLane - 1, optionsCount - 1)
    const isCorrect = optionIndex === currentQ.correctIndex

    if (isCorrect) {
      const pts = 200 * (combo + 1)
      setScore(s => s + pts)
      setCombo(c => c + 1)
      setFeedback({ text: `+${pts} PTS! Correct! ⚡`, correct: true })
      if (soundEnabled) {
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3')
          audio.volume = 0.3
          audio.play()
        } catch {}
      }
      setTimeout(() => {
        setFeedback(null)
        if (currentQIndex < questions.length - 1) {
          setCurrentQIndex(i => i + 1)
        } else {
          setGameState('victory')
          authApi.awardXp(50, 'Knowledge Runner Victory', resourceId).catch(() => {})
          toast.success('🏆 Mission Complete! +50 XP Awarded!')
        }
      }, 1000)
    } else {
      setCombo(0)
      const newLives = lives - 1
      setLives(newLives)
      setFeedback({ text: 'Wrong Gate! -1 Life 💥', correct: false })
      if (soundEnabled) {
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2658/2658-preview.mp3')
          audio.volume = 0.3
          audio.play()
        } catch {}
      }
      setTimeout(() => {
        setFeedback(null)
        if (newLives <= 0) {
          setGameState('gameover')
        } else if (currentQIndex < questions.length - 1) {
          setCurrentQIndex(i => i + 1)
        } else {
          setGameState('victory')
          authApi.awardXp(50, 'Knowledge Runner Victory', resourceId).catch(() => {})
        }
      }, 1000)
    }
  }

  const restartGame = () => {
    setScore(0)
    setLives(3)
    setCombo(0)
    setCurrentQIndex(0)
    setLane(2)
    setGameState('playing')
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#090a0f] flex items-center justify-center text-white z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="font-extrabold text-slate-300 text-lg">Loading Knowledge Runner Arena...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#06070b] text-white flex flex-col justify-between overflow-hidden select-none z-50">
      {/* Synthwave Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-primary/10 via-transparent to-transparent pointer-events-none" />

      {/* Top HUD */}
      <div className="relative z-20 flex items-center justify-between px-6 py-4 bg-black/40 backdrop-blur-xl border-b border-white/10">
        <button
          onClick={() => router.push(`/library/${resourceId}`)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> Exit Game
        </button>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-black shadow-lg shadow-amber-500/10">
            <Trophy className="w-4 h-4" /> Score: {score}
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-black shadow-lg shadow-red-500/10">
            <div className="flex items-center gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <Heart key={i} className={`w-4 h-4 ${i < lives ? 'fill-red-500 text-red-500' : 'text-slate-600'}`} />
              ))}
            </div>
          </div>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Game Stage */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 max-w-5xl mx-auto w-full">
        {gameState === 'intro' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-container/80 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-14 text-center max-w-xl w-full space-y-6 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-[-30%] right-[-20%] w-[250px] h-[250px] bg-primary/20 rounded-full blur-[90px] pointer-events-none" />
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-primary to-amber-400 mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.4)]">
              <Sparkles className="w-10 h-10 text-black" />
            </div>
            <div className="space-y-3">
              <span className="px-3.5 py-1 rounded-full bg-primary/20 text-primary text-xs font-black uppercase tracking-wider">
                KataLearn Arcade
              </span>
              <h1 className="text-3xl md:text-5xl font-black text-white">{resource?.title || 'Knowledge Runner'}</h1>
              <p className="text-slate-300 text-sm md:text-base leading-relaxed">
                Run down the neon highway! Steer into the correct answer lane before you hit the gates. Test your mastery and win XP!
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs font-bold text-slate-400 bg-white/5 p-4 rounded-2xl border border-white/10">
              <div>⬅️ / ➡️ Arrow Keys</div>
              <div>A / D Keys</div>
              <div>Click Lanes</div>
            </div>
            <button
              onClick={() => setGameState('playing')}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-amber-400 text-black font-black text-base shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-black" /> START RUNNING
            </button>
          </motion.div>
        ) : gameState === 'gameover' || gameState === 'victory' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-container/90 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-14 text-center max-w-xl w-full space-y-6 shadow-2xl"
          >
            <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center shadow-2xl ${gameState === 'victory' ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-black' : 'bg-gradient-to-tr from-red-600 to-rose-800 text-white'}`}>
              {gameState === 'victory' ? <Award className="w-10 h-10" /> : <RefreshCw className="w-10 h-10" />}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-black text-white">
                {gameState === 'victory' ? '🏆 RUN COMPLETED!' : '💀 GAME OVER'}
              </h1>
              <p className="text-slate-300 text-sm">
                {gameState === 'victory' ? 'Fantastic job! You navigated the study track successfully. +50 XP awarded.' : 'You lost all your hearts! Review your notes and try the run again.'}
              </p>
              <p className="text-xl font-black text-primary pt-2">Final Score: {score} pts</p>
            </div>
            <div className="flex justify-center gap-4 pt-4">
              <button
                onClick={restartGame}
                className="px-6 py-3.5 rounded-xl bg-primary text-black font-extrabold text-sm hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Run Again
              </button>
              <button
                onClick={() => router.push(`/library/${resourceId}`)}
                className="px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 font-extrabold text-sm transition-all"
              >
                Exit to Material
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="w-full max-w-3xl flex flex-col items-center space-y-6">
            {/* Question Banner */}
            <div className="w-full bg-surface-container/90 backdrop-blur-xl border border-white/10 p-6 rounded-[2rem] text-center shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-amber-400 to-tertiary" />
              <span className="text-[11px] font-black text-primary uppercase tracking-widest">Question {currentQIndex + 1} of {questions.length}</span>
              <h2 className="text-xl md:text-2xl font-black text-white mt-1 leading-snug">{currentQ?.question}</h2>
            </div>

            {/* Feedback Popup */}
            <AnimatePresence>
              {feedback && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: -20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={`px-6 py-3 rounded-2xl font-black text-sm tracking-wide shadow-2xl z-30 ${
                    feedback.correct ? 'bg-green-500 text-black shadow-green-500/30' : 'bg-red-500 text-white shadow-red-500/30'
                  }`}
                >
                  {feedback.text}
                </motion.div>
              )}
            </AnimatePresence>

            {/* 3-Lane Highway Track */}
            <div className="w-full h-[320px] bg-gradient-to-b from-slate-900/90 to-black/90 backdrop-blur-xl border-2 border-white/10 rounded-[2.5rem] relative overflow-hidden flex justify-between p-4 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
              {/* Lane Divider Lines */}
              <div className="absolute inset-y-0 left-1/3 border-r-2 border-dashed border-white/20" />
              <div className="absolute inset-y-0 left-2/3 border-r-2 border-dashed border-white/20" />

              {/* Lane 1, 2, 3 Gates */}
              {[1, 2, 3].map((lNum) => {
                const optIndex = lNum - 1
                const optionText = currentQ?.options[optIndex] || ''
                const isSelectedLane = lane === lNum

                return (
                  <div
                    key={lNum}
                    onClick={() => selectLaneAnswer(lNum)}
                    className={`flex-1 mx-2 rounded-2xl border-2 flex flex-col items-center justify-between p-4 cursor-pointer transition-all relative overflow-hidden group ${
                      isSelectedLane
                        ? 'bg-primary/20 border-primary shadow-[0_0_25px_rgba(245,158,11,0.4)] scale-[1.02]'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center font-mono font-black text-xs text-slate-300">
                      {lNum}
                    </span>

                    <div className="text-center my-auto">
                      {optionText ? (
                        <p className="text-xs md:text-sm font-black text-white leading-snug">{optionText}</p>
                      ) : (
                        <p className="text-xs text-slate-600 font-bold">— Empty Lane —</p>
                      )}
                    </div>

                    <div className={`w-full py-2 rounded-xl text-center text-[11px] font-black uppercase tracking-wider transition-all ${
                      isSelectedLane ? 'bg-primary text-black' : 'bg-white/10 text-slate-400 group-hover:bg-white/20 group-hover:text-white'
                    }`}>
                      {isSelectedLane ? '👉 YOU ARE HERE' : 'Step In'}
                    </div>
                  </div>
                )
              })}

              {/* Runner Avatar Position Indicator */}
              <div className="absolute bottom-6 left-0 right-0 flex justify-around pointer-events-none">
                {[1, 2, 3].map(lNum => (
                  <div key={lNum} className="flex-1 flex justify-center">
                    {lane === lNum && (
                      <motion.div
                        layoutId="runner"
                        className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary to-amber-400 text-black flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(245,158,11,0.6)]"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      >
                        🏃‍♂️
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile / Click Controls */}
            <div className="grid grid-cols-3 gap-3 w-full">
              <button
                onClick={() => setLane(1)}
                className={`py-3.5 rounded-2xl font-black text-sm border transition-all ${lane === 1 ? 'bg-primary text-black border-primary' : 'bg-white/5 border-white/10 text-white'}`}
              >
                ⬅️ Lane 1
              </button>
              <button
                onClick={() => setLane(2)}
                className={`py-3.5 rounded-2xl font-black text-sm border transition-all ${lane === 2 ? 'bg-primary text-black border-primary' : 'bg-white/5 border-white/10 text-white'}`}
              >
                📍 Center (2)
              </button>
              <button
                onClick={() => setLane(3)}
                className={`py-3.5 rounded-2xl font-black text-sm border transition-all ${lane === 3 ? 'bg-primary text-black border-primary' : 'bg-white/5 border-white/10 text-white'}`}
              >
                Lane 3 ➡️
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-20 text-center py-3 bg-black/40 backdrop-blur-xl border-t border-white/10 text-[11px] text-slate-500">
        KataLearn Knowledge Runner • Immersive Arcade Engine
      </div>
    </div>
  )
}
