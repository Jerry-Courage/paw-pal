'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { libraryApi, authApi } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Shield, Zap, Flame, Trophy, RefreshCw, Heart, Sparkles, Sword } from 'lucide-react'
import { toast } from 'sonner'

interface Question {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

export default function BattleArenaPage() {
  const params = useParams()
  const router = useRouter()
  const resourceId = Number(params.id)

  const [resource, setResource] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQIndex, setCurrentQIndex] = useState(0)

  // Game Stats
  const [playerHp, setPlayerHp] = useState(100)
  const [bossHp, setBossHp] = useState(100)
  const [combo, setCombo] = useState(0)
  const [score, setScore] = useState(0)
  const [gameState, setGameState] = useState<'intro' | 'playing' | 'attack_effect' | 'boss_attack_effect' | 'victory' | 'defeat'>('intro')
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [battleLog, setBattleLog] = useState<string>('Battle started! Answer correctly to unleash special attacks.')

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
        // Fallback questions if none returned
        qList = [
          { question: `What is a core principle discussed in ${resource?.title || 'this material'}?`, options: ['Data Integrity & Structure', 'Random Guessing', 'Ignoring Rules', 'None of the above'], correctIndex: 0, explanation: 'Core principles form the foundation of study.' },
          { question: 'Which methodology improves active recall?', options: ['Passive reading', 'Testing yourself under pressure', 'Sleeping', 'Skimming'], correctIndex: 1, explanation: 'Active testing reinforces neural pathways.' }
        ]
      }
      setQuestions(qList)
    } catch (e) {
      toast.error('Failed to load battle questions.')
    } finally {
      setLoading(false)
    }
  }

  const currentQ = questions[currentQIndex] || questions[0]

  const handleAnswer = (index: number) => {
    if (selectedOption !== null || gameState !== 'playing') return
    setSelectedOption(index)
    const correct = index === currentQ.correctIndex
    setIsCorrect(correct)

    if (correct) {
      setCombo(c => c + 1)
      setScore(s => s + 150 * (combo + 1))
      const damage = Math.floor(30 + Math.random() * 15)
      setBossHp(hp => Math.max(0, hp - damage))
      setBattleLog(`💥 CRITICAL HIT! You launched a Plasma Blast for ${damage} damage!`)
      setGameState('attack_effect')

      setTimeout(() => {
        if (bossHp - damage <= 0) {
          setGameState('victory')
          authApi.awardXp(50, 'Battle Arena Victory', resourceId).catch(() => {})
          toast.success('🏆 Victory! +50 XP Awarded!')
        } else {
          nextQuestion()
        }
      }, 1500)
    } else {
      setCombo(0)
      const damage = Math.floor(20 + Math.random() * 10)
      setPlayerHp(hp => Math.max(0, hp - damage))
      setBattleLog(`⚡ OUCH! Boss counter-attacked for ${damage} damage!`)
      setGameState('boss_attack_effect')

      setTimeout(() => {
        if (playerHp - damage <= 0) {
          setGameState('defeat')
        } else {
          nextQuestion()
        }
      }, 1500)
    }
  }

  const nextQuestion = () => {
    setSelectedOption(null)
    setIsCorrect(null)
    if (currentQIndex < questions.length - 1) {
      setCurrentQIndex(i => i + 1)
      setGameState('playing')
    } else {
      // Loop questions if needed or restart index
      setCurrentQIndex(0)
      setGameState('playing')
    }
  }

  const restartGame = () => {
    setPlayerHp(100)
    setBossHp(100)
    setCombo(0)
    setScore(0)
    setCurrentQIndex(0)
    setSelectedOption(null)
    setIsCorrect(null)
    setGameState('playing')
    setBattleLog('New round started! Fight!')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090a0f] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-red-500/20 border-t-red-500 animate-spin" />
          <p className="font-bold text-slate-300">Entering the Battle Arena...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-white px-4 md:px-12 py-6 flex flex-col justify-between relative overflow-hidden select-none">
      {/* Background Arena Glows */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-red-600/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none" />

      {/* Top Header */}
      <div className="relative z-10 flex items-center justify-between max-w-5xl mx-auto w-full">
        <button
          onClick={() => router.push(`/library/${resourceId}`)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Material
        </button>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black">
            <Trophy className="w-4 h-4" /> Score: {score}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-black">
            <Flame className="w-4 h-4" /> Combo: {combo}x
          </div>
        </div>
      </div>

      {/* Main Arena Display */}
      <div className="relative z-10 max-w-4xl mx-auto w-full my-auto py-6 space-y-6">
        {gameState === 'intro' ? (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5pax] p-8 md:p-12 text-center space-y-6 shadow-2xl rounded-[2.5rem]">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-red-600 to-orange-500 mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.5)]">
              <Sword className="w-10 h-10 text-white" />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-black uppercase tracking-wider">
                Study Battle Arena
              </span>
              <h1 className="text-3xl md:text-5xl font-black text-white">{resource?.title || 'Knowledge Duel'}</h1>
              <p className="text-slate-400 text-sm max-w-md mx-auto">
                Answer study questions correctly to blast the Knowledge Demon. Wrong answers let the demon strike back!
              </p>
            </div>
            <button
              onClick={() => setGameState('playing')}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 text-white font-black text-base shadow-lg shadow-red-600/30 hover:scale-105 active:scale-95 transition-all"
            >
              START BATTLE ⚔️
            </button>
          </div>
        ) : gameState === 'victory' || gameState === 'defeat' ? (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 md:p-12 text-center space-y-6 shadow-2xl">
            <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center shadow-2xl ${gameState === 'victory' ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-black' : 'bg-gradient-to-tr from-red-700 to-rose-900 text-white'}`}>
              {gameState === 'victory' ? <Trophy className="w-10 h-10 fill-black" /> : <Flame className="w-10 h-10" />}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-black text-white">
                {gameState === 'victory' ? '🏆 VICTORY ACHIEVED!' : '💀 DEFEATED IN BATTLE'}
              </h1>
              <p className="text-slate-400 text-sm">
                {gameState === 'victory' ? 'You mastered this material and crushed the boss! +50 XP earned.' : 'Review your study notes and try again to conquer the arena!'}
              </p>
              <p className="text-lg font-bold text-amber-400 pt-2">Final Score: {score} pts • Max Combo: {combo}x</p>
            </div>
            <div className="flex justify-center gap-4">
              <button
                onClick={restartGame}
                className="px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Play Again
              </button>
              <button
                onClick={() => router.push(`/library/${resourceId}`)}
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 font-bold text-sm transition-all"
              >
                Return to Material
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Fighters Battle Stage */}
            <div className="bg-gradient-to-b from-slate-900/80 to-black/80 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 md:p-8 flex items-center justify-between relative overflow-hidden shadow-2xl">
              {/* Player Side */}
              <div className="flex flex-col items-center gap-3 w-1/3">
                <div className="w-full flex items-center justify-between text-xs font-bold px-1">
                  <span className="text-blue-400">HERO</span>
                  <span className="font-mono">{playerHp}/100 HP</span>
                </div>
                <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden p-0.5 border border-white/10">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    style={{ width: `${playerHp}%` }}
                  />
                </div>
                <motion.div
                  animate={gameState === 'boss_attack_effect' ? { x: [-10, 10, -10, 10, 0], scale: [1, 0.9, 1] } : { y: [0, -5, 0] }}
                  transition={{ repeat: gameState === 'boss_attack_effect' ? 0 : Infinity, duration: 2 }}
                  className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-blue-600/20 border-2 border-blue-500/50 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(59,130,246,0.3)] relative"
                >
                  🧙‍♂️
                  {gameState === 'attack_effect' && (
                    <motion.div
                      initial={{ x: 0, scale: 0.5, opacity: 1 }}
                      animate={{ x: 180, scale: 1.5, opacity: 0 }}
                      className="absolute text-3xl pointer-events-none"
                    >
                      ⚡🔥
                    </motion.div>
                  )}
                </motion.div>
              </div>

              {/* VS Badge */}
              <div className="flex flex-col items-center justify-center px-4">
                <span className="text-2xl md:text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-400">
                  VS
                </span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Round {currentQIndex + 1}</span>
              </div>

              {/* Boss Side */}
              <div className="flex flex-col items-center gap-3 w-1/3">
                <div className="w-full flex items-center justify-between text-xs font-bold px-1">
                  <span className="text-red-400">SCHOLAR BOSS</span>
                  <span className="font-mono">{bossHp}/100 HP</span>
                </div>
                <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden p-0.5 border border-white/10">
                  <div
                    className="bg-red-500 h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                    style={{ width: `${bossHp}%` }}
                  />
                </div>
                <motion.div
                  animate={gameState === 'attack_effect' ? { x: [10, -10, 10, -10, 0], scale: [1, 0.9, 1] } : { y: [0, -5, 0] }}
                  transition={{ repeat: gameState === 'attack_effect' ? 0 : Infinity, duration: 2 }}
                  className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-red-600/20 border-2 border-red-500/50 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(239,68,68,0.3)] relative"
                >
                  👹
                  {gameState === 'boss_attack_effect' && (
                    <motion.div
                      initial={{ x: 0, scale: 0.5, opacity: 1 }}
                      animate={{ x: -180, scale: 1.5, opacity: 0 }}
                      className="absolute text-3xl pointer-events-none"
                    >
                      💢💥
                    </motion.div>
                  )}
                </motion.div>
              </div>
            </div>

            {/* Battle Log Banner */}
            <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl text-center text-xs font-bold text-amber-400">
              {battleLog}
            </div>

            {/* Question & Options Card */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 md:p-8 space-y-6 shadow-2xl">
              <div>
                <span className="text-[11px] font-black text-primary uppercase tracking-wider">Question {currentQIndex + 1} of {questions.length}</span>
                <h2 className="text-lg md:text-xl font-bold text-white mt-1 leading-snug">{currentQ?.question}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentQ?.options.map((option, idx) => {
                  let btnStyle = "bg-white/5 border-white/10 hover:bg-white/10 text-slate-200"
                  if (selectedOption !== null) {
                    if (idx === currentQ.correctIndex) {
                      btnStyle = "bg-green-500/20 border-green-500 text-green-300 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                    } else if (idx === selectedOption) {
                      btnStyle = "bg-red-500/20 border-red-500 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                    } else {
                      btnStyle = "opacity-40 bg-white/5 border-white/5 text-slate-400"
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(idx)}
                      disabled={selectedOption !== null}
                      className={`p-4 rounded-2xl border text-left font-bold text-sm transition-all flex items-center justify-between ${btnStyle}`}
                    >
                      <span>{option}</span>
                      <span className="w-7 h-7 rounded-xl bg-white/5 flex items-center justify-center text-xs font-mono shrink-0 ml-2">
                        {String.fromCharCode(65 + idx)}
                      </span>
                    </button>
                  )
                })}
              </div>

              {selectedOption !== null && currentQ?.explanation && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300 animate-in fade-in">
                  <span className="font-black text-amber-400 mr-2">Explanation:</span>
                  {currentQ.explanation}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 text-center text-xs text-slate-500 max-w-md mx-auto">
        Battle Arena • Powered by FlowState Knowledge Combat Engine
      </div>
    </div>
  )
}
