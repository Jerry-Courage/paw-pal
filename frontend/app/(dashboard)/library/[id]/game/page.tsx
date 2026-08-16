'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { libraryApi, authApi } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Trophy, Heart, Volume2, VolumeX, Play, Award, Pause, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

interface Question {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

type GameState = 'loading' | 'intro' | 'playing' | 'quiz' | 'paused' | 'gameover' | 'victory'

interface Obstacle {
  lane: number
  z: number
  type: 'barrier' | 'block' | 'spike'
  hit: boolean
  color: string
}

interface Coin {
  lane: number
  z: number
  collected: boolean
}

interface QuizGate {
  z: number
  active: boolean
  questionIndex: number
}

const LANE_COUNT = 3
const LANE_WIDTH = 90
const ROAD_WIDTH = LANE_COUNT * LANE_WIDTH + (LANE_COUNT + 1) * 8
const RUNNER_Y_RATIO = 0.82
const HORIZON_Y = 0.12
const INITIAL_SPEED = 2.8
const MAX_SPEED = 9
const SPEED_INCREMENT = 0.0004

const SOUNDS = {
  correct: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); a.volume = 0.25; a.play() } catch {} },
  wrong: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2658/2658-preview.mp3'); a.volume = 0.25; a.play() } catch {} },
  coin: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'); a.volume = 0.2; a.play() } catch {} },
  hit: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2803/2803-preview.mp3'); a.volume = 0.3; a.play() } catch {} },
}

export default function KnowledgeRunnerPage() {
  const params = useParams()
  const router = useRouter()
  const resourceId = Number(params.id)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<number>(0)

  const [resource, setResource] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [gameState, setGameState] = useState<GameState>('loading')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [speed, setSpeed] = useState(INITIAL_SPEED)
  const [distance, setDistance] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const [correctAnswer, setCorrectAnswer] = useState<number | null>(null)

  const gameRef = useRef({
    runnerLane: 1,
    runnerTargetLane: 1,
    runnerX: 0,
    runnerAnimPhase: 0,
    obstacles: [] as Obstacle[],
    coins: [] as Coin[],
    quizGates: [] as QuizGate[],
    lastObstacleZ: -300,
    lastCoinZ: -100,
    lastQuizZ: -500,
    frameCount: 0,
    speed: INITIAL_SPEED,
    laneSwitchAnim: 0,
    trail: [] as { x: number; y: number; age: number }[],
    particles: [] as { x: number; y: number; vx: number; vy: number; life: number; color: string }[],
    shakeX: 0,
    shakeY: 0,
    flashAlpha: 0,
    flashColor: '#00ff00',
  })

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
      const raw = Array.isArray(data) ? data : data?.questions || []
      qList = raw.map((item: any) => ({
        question: item.question,
        options: item.options || item.choices || [],
        correctIndex: item.correct_index ?? item.answerIndex ?? 0,
        explanation: item.explanation || ''
      }))
      if (qList.length < 3) {
        qList = [
          { question: `What is a key concept in ${resource?.title || 'this material'}?`, options: ['Core Principles', 'Random Data', 'Invalid Syntax', 'None'], correctIndex: 0, explanation: 'Core principles drive understanding.' },
          { question: 'What study method improves long-term retention?', options: ['Active Recall', 'Passive Reading', 'Highlighting Only', 'Cramming'], correctIndex: 0, explanation: 'Active recall strengthens memory.' },
          { question: 'How should you approach complex topics?', options: ['Break Down Step-by-Step', 'Skip to Easy Parts', 'Memorize Verbatim', 'Ignore Details'], correctIndex: 0, explanation: 'Breaking down builds deeper understanding.' },
        ]
      }
      setQuestions(qList)
      setGameState('intro')
    } catch {
      toast.error('Failed to load questions. Using defaults.')
      setQuestions([
        { question: 'What is effective studying?', options: ['Active Engagement', 'Passive Reading', 'Memorizing', 'Skimming'], correctIndex: 0, explanation: 'Active engagement builds real understanding.' },
        { question: 'How do you retain information best?', options: ['Spaced Repetition', 'Cramming', 'Highlighting', 'Reading Once'], correctIndex: 0, explanation: 'Spaced repetition is scientifically proven.' },
      ])
      setGameState('intro')
    } finally {
      setLoading(false)
    }
  }

  const currentQ = questions[currentQIndex] || questions[0]
  const g = gameRef.current

  const worldToScreen = useCallback((worldZ: number, laneX: number, canvasW: number, canvasH: number) => {
    const t = (worldZ + 10) / 360
    if (t <= 0) return null
    const perspX = canvasW / 2 + laneX * t
    const perspY = HORIZON_Y * canvasH + (RUNNER_Y_RATIO * canvasH - HORIZON_Y * canvasH) * t
    const scale = Math.max(0.05, t)
    return { x: perspX, y: perspY, scale }
  }, [])

  const getLaneX = useCallback((lane: number, canvasW: number) => {
    const offset = (lane - 2) * LANE_WIDTH
    return canvasW / 2 + offset
  }, [])

  const spawnParticles = useCallback((x: number, y: number, color: string, count: number = 8) => {
    for (let i = 0; i < count; i++) {
      g.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 2,
        life: 1,
        color,
      })
    }
  }, [g])

  const drawRunner = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) => {
    const bobY = Math.sin(t * 0.12) * 3
    const leanX = (g.runnerTargetLane - g.runnerLane) * 2
    const drawY = y + bobY
    const drawX = x + leanX

    // Glow
    ctx.shadowColor = '#f59e0b'
    ctx.shadowBlur = 20
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.ellipse(drawX, drawY + h * 0.48, w * 0.35, h * 0.06, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.ellipse(drawX, drawY + h * 0.48, w * 0.35, h * 0.05, 0, 0, Math.PI * 2)
    ctx.fill()

    // Body
    const bodyGrad = ctx.createLinearGradient(drawX - w * 0.2, drawY - h * 0.15, drawX + w * 0.2, drawY + h * 0.35)
    bodyGrad.addColorStop(0, '#f59e0b')
    bodyGrad.addColorStop(1, '#d97706')
    ctx.fillStyle = bodyGrad
    ctx.beginPath()
    ctx.roundRect(drawX - w * 0.2, drawY - h * 0.15, w * 0.4, h * 0.5, w * 0.08)
    ctx.fill()

    // Legs animation
    const legPhase = Math.sin(t * 0.15)
    ctx.fillStyle = '#92400e'
    ctx.fillRect(drawX - w * 0.12, drawY + h * 0.32, w * 0.1, h * 0.14 + legPhase * 3)
    ctx.fillRect(drawX + w * 0.02, drawY + h * 0.32, w * 0.1, h * 0.14 - legPhase * 3)

    // Arms
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = w * 0.06
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(drawX - w * 0.2, drawY - h * 0.05)
    ctx.lineTo(drawX - w * 0.35, drawY + h * 0.1 + legPhase * 5)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(drawX + w * 0.2, drawY - h * 0.05)
    ctx.lineTo(drawX + w * 0.35, drawY + h * 0.1 - legPhase * 5)
    ctx.stroke()

    // Head
    ctx.shadowColor = '#fbbf24'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath()
    ctx.arc(drawX, drawY - h * 0.28, w * 0.16, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Eyes
    ctx.fillStyle = '#1e1b4b'
    ctx.beginPath()
    ctx.arc(drawX - w * 0.05, drawY - h * 0.3, w * 0.035, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(drawX + w * 0.05, drawY - h * 0.3, w * 0.035, 0, Math.PI * 2)
    ctx.fill()

    // Helmet highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.arc(drawX - w * 0.03, drawY - h * 0.33, w * 0.04, 0, Math.PI * 2)
    ctx.fill()
  }, [g])

  const drawObstacle = useCallback((ctx: CanvasRenderingContext2D, obs: Obstacle, canvasW: number, canvasH: number) => {
    const pos = worldToScreen(obs.z, getLaneX(obs.lane, canvasW), canvasW, canvasH)
    if (!pos || pos.scale < 0.08) return
    const size = 50 * pos.scale
    const colors: Record<string, string[]> = {
      barrier: ['#ef4444', '#dc2626', '#991b1b'],
      block: ['#8b5cf6', '#7c3aed', '#5b21b6'],
      spike: ['#f97316', '#ea580c', '#c2410c'],
    }
    const c = colors[obs.type] || colors.barrier

    ctx.shadowColor = c[0]
    ctx.shadowBlur = 15 * pos.scale
    const grad = ctx.createLinearGradient(pos.x - size / 2, pos.y - size, pos.x + size / 2, pos.y)
    grad.addColorStop(0, c[0])
    grad.addColorStop(0.5, c[1])
    grad.addColorStop(1, c[2])
    ctx.fillStyle = grad

    if (obs.type === 'spike') {
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y - size)
      ctx.lineTo(pos.x - size * 0.4, pos.y)
      ctx.lineTo(pos.x + size * 0.4, pos.y)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.roundRect(pos.x - size / 2, pos.y - size, size, size, 4 * pos.scale)
      ctx.fill()
    }

    // Hazard stripes
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = Math.max(1, 2 * pos.scale)
    for (let i = 0; i < 3; i++) {
      const stripeY = pos.y - size + (size / 4) * (i + 0.5)
      ctx.beginPath()
      ctx.moveTo(pos.x - size * 0.3, stripeY)
      ctx.lineTo(pos.x + size * 0.3, stripeY)
      ctx.stroke()
    }
    ctx.shadowBlur = 0
  }, [worldToScreen, getLaneX])

  const drawCoin = useCallback((ctx: CanvasRenderingContext2D, coin: Coin, canvasW: number, canvasH: number, t: number) => {
    if (coin.collected) return
    const pos = worldToScreen(coin.z, getLaneX(coin.lane, canvasW), canvasW, canvasH)
    if (!pos || pos.scale < 0.06) return
    const r = 14 * pos.scale

    ctx.shadowColor = '#fbbf24'
    ctx.shadowBlur = 12 * pos.scale
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath()
    ctx.ellipse(pos.x, pos.y - r * 2, r, r * (0.5 + Math.abs(Math.sin(t * 0.05)) * 0.5), 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.ellipse(pos.x, pos.y - r * 2, r * 0.6, r * 0.3 * (0.5 + Math.abs(Math.sin(t * 0.05)) * 0.5), 0, 0, Math.PI * 2)
    ctx.fill()
  }, [worldToScreen, getLaneX])

  const drawQuizGate = useCallback((ctx: CanvasRenderingContext2D, gate: QuizGate, canvasW: number, canvasH: number, t: number) => {
    if (!gate.active) return
    const topPos = worldToScreen(gate.z, canvasW / 2 - LANE_WIDTH * 1.5, canvasW, canvasH)
    const botPos = worldToScreen(gate.z, canvasW / 2 + LANE_WIDTH * 1.5, canvasW, canvasH)
    if (!topPos || !botPos || topPos.scale < 0.1) return

    const pulse = 0.6 + Math.sin(t * 0.06) * 0.4
    const gateHeight = (botPos.y - topPos.y) * 0.85
    const gateTop = topPos.y + gateHeight * 0.1

    // Gate arch
    ctx.shadowColor = '#06b6d4'
    ctx.shadowBlur = 30 * pulse
    const gateGrad = ctx.createLinearGradient(topPos.x, gateTop, botPos.x, gateTop + gateHeight)
    gateGrad.addColorStop(0, `rgba(6,182,212,${0.7 * pulse})`)
    gateGrad.addColorStop(0.5, `rgba(59,130,246,${0.9 * pulse})`)
    gateGrad.addColorStop(1, `rgba(6,182,212,${0.7 * pulse})`)
    ctx.fillStyle = gateGrad
    ctx.beginPath()
    ctx.roundRect(topPos.x, gateTop, botPos.x - topPos.x, gateHeight, 8)
    ctx.fill()
    ctx.shadowBlur = 0

    // Gate text
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.max(10, 14 * topPos.scale)}px system-ui`
    ctx.textAlign = 'center'
    ctx.fillText('⚡ QUIZ GATE ⚡', (topPos.x + botPos.x) / 2, gateTop + gateHeight * 0.35)
    ctx.font = `${Math.max(8, 10 * topPos.scale)}px system-ui`
    ctx.fillStyle = '#e0f2fe'
    ctx.fillText('Answer to pass!', (topPos.x + botPos.x) / 2, gateTop + gateHeight * 0.6)

    // Side pillars
    ctx.fillStyle = `rgba(6,182,212,${0.5 * pulse})`
    ctx.fillRect(topPos.x - 4 * topPos.scale, gateTop, 8 * topPos.scale, gateHeight)
    ctx.fillRect(botPos.x - 4 * topPos.scale, gateTop, 8 * topPos.scale, gateHeight)
  }, [worldToScreen])

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    const t = g.frameCount

    // Screen shake decay
    g.shakeX *= 0.85
    g.shakeY *= 0.85

    // Clear
    ctx.save()
    ctx.translate(g.shakeX, g.shakeY)

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H)
    skyGrad.addColorStop(0, '#020617')
    skyGrad.addColorStop(0.3, '#0f172a')
    skyGrad.addColorStop(0.6, '#1e293b')
    skyGrad.addColorStop(1, '#334155')
    ctx.fillStyle = skyGrad
    ctx.fillRect(0, 0, W, H)

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 137.508 + t * 0.05) % W)
      const sy = (i * 97.3) % (H * 0.35)
      const blink = Math.sin(t * 0.02 + i) * 0.5 + 0.5
      ctx.globalAlpha = blink * 0.6
      ctx.beginPath()
      ctx.arc(sx, sy, 1 + blink, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Road surface
    const roadLeft = (W - ROAD_WIDTH) / 2
    const roadRight = roadLeft + ROAD_WIDTH
    const horizonY = H * HORIZON_Y
    const runnerY = H * RUNNER_Y_RATIO

    ctx.fillStyle = '#1a1a2e'
    ctx.beginPath()
    ctx.moveTo(roadLeft + 60, horizonY)
    ctx.lineTo(roadLeft - 40, runnerY + 30)
    ctx.lineTo(roadRight + 40, runnerY + 30)
    ctx.lineTo(roadRight - 60, horizonY)
    ctx.closePath()
    ctx.fill()

    // Road edge glow
    ctx.strokeStyle = 'rgba(245,158,11,0.3)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(roadLeft + 60, horizonY)
    ctx.lineTo(roadLeft - 40, runnerY + 30)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(roadRight - 60, horizonY)
    ctx.lineTo(roadRight + 40, runnerY + 30)
    ctx.stroke()

    // Lane dividers
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([12, 8])
    const dashOffset = -(t * g.speed * 1.5) % 20
    ctx.lineDashOffset = dashOffset
    for (let i = 1; i < LANE_COUNT; i++) {
      const leftFrac = (roadLeft + 60 + (i / LANE_COUNT) * (roadRight - roadLeft - 120)) / W
      const rightFrac = (roadLeft - 40 + (i / LANE_COUNT) * (roadRight - roadLeft + 80)) / W
      ctx.beginPath()
      ctx.moveTo(leftFrac * W, horizonY)
      ctx.lineTo(rightFrac * W, runnerY + 30)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Grid lines on road (scrolling)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    const gridSpacing = 35
    const gridScroll = (t * g.speed * 1.5) % gridSpacing
    for (let i = 0; i < 15; i++) {
      const frac = (i * gridSpacing - gridScroll) / (15 * gridSpacing)
      if (frac <= 0 || frac >= 1) continue
      const gy = horizonY + frac * (runnerY - horizonY)
      const shrink = 1 - frac * 0.7
      const gl = W / 2 - (ROAD_WIDTH / 2) * shrink
      const gr = W / 2 + (ROAD_WIDTH / 2) * shrink
      ctx.beginPath()
      ctx.moveTo(gl, gy)
      ctx.lineTo(gr, gy)
      ctx.stroke()
    }

    // Draw coins
    for (const coin of g.coins) {
      drawCoin(ctx, coin, W, H, t)
    }

    // Draw obstacles
    for (const obs of g.obstacles) {
      drawObstacle(ctx, obs, W, H)
    }

    // Draw quiz gates
    for (const gate of g.quizGates) {
      drawQuizGate(ctx, gate, W, H, t)
    }

    // Runner trail
    for (let i = g.trail.length - 1; i >= 0; i--) {
      const tr = g.trail[i]
      tr.age += 0.04
      if (tr.age >= 1) { g.trail.splice(i, 1); continue }
      ctx.globalAlpha = (1 - tr.age) * 0.3
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath()
      ctx.arc(tr.x, tr.y, 4 * (1 - tr.age), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Draw runner
    const runnerWorldX = getLaneX(g.runnerLane, W)
    drawRunner(ctx, runnerWorldX, runnerY, 80, 100, t)

    // Runner trail
    if (t % 3 === 0) {
      g.trail.push({ x: runnerWorldX, y: runnerY + 40, age: 0 })
    }

    // Particles
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const p = g.particles[i]
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.15
      p.life -= 0.025
      if (p.life <= 0) { g.particles.splice(i, 1); continue }
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Flash overlay
    if (g.flashAlpha > 0) {
      ctx.fillStyle = g.flashColor
      ctx.globalAlpha = g.flashAlpha
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
      g.flashAlpha *= 0.88
    }

    // Vignette
    const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.7)
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.5)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, W, H)

    ctx.restore()

    // --- GAME LOGIC (only while playing) ---
    if (gameState !== 'playing') {
      gameLoopRef.current = requestAnimationFrame(gameLoop)
      return
    }

    g.frameCount++
    g.speed = Math.min(MAX_SPEED, g.speed + SPEED_INCREMENT)
    setSpeed(g.speed)

    // Smooth lane switch
    const laneDiff = g.runnerTargetLane - g.runnerLane
    if (Math.abs(laneDiff) > 0.01) {
      g.runnerLane += laneDiff * 0.15
    } else {
      g.runnerLane = g.runnerTargetLane
    }

    // Move obstacles
    for (const obs of g.obstacles) {
      obs.z += g.speed
    }
    g.obstacles = g.obstacles.filter(o => o.z < 20)

    // Move coins
    for (const coin of g.coins) {
      coin.z += g.speed
    }
    g.coins = g.coins.filter(c => c.z < 20 && !c.collected)

    // Move quiz gates
    for (const gate of g.quizGates) {
      gate.z += g.speed
    }
    g.quizGates = g.quizGates.filter(qz => qz.z < 20)

    // Spawn obstacles
    const minGap = Math.max(60, 140 - g.speed * 8)
    if (g.obstacles.length < 6 && g.frameCount > 30) {
      if (Math.random() < 0.025 + g.speed * 0.002) {
        const lastZ = g.obstacles.length > 0 ? Math.min(...g.obstacles.map(o => o.z)) : -200
        if (lastZ < -minGap) {
          const types: Obstacle['type'][] = ['barrier', 'block', 'spike']
          const colors = ['#ef4444', '#8b5cf6', '#f97316']
          const typeIdx = Math.floor(Math.random() * types.length)
          g.obstacles.push({
            lane: Math.ceil(Math.random() * 3),
            z: -280 - Math.random() * 80,
            type: types[typeIdx],
            hit: false,
            color: colors[typeIdx],
          })
        }
      }
    }

    // Spawn coins
    if (g.frameCount % 12 === 0 && Math.random() < 0.4) {
      const lastCoinZ = g.coins.length > 0 ? Math.min(...g.coins.map(c => c.z)) : -100
      if (lastCoinZ < -50) {
        g.coins.push({
          lane: Math.ceil(Math.random() * 3),
          z: -280 - Math.random() * 40,
          collected: false,
        })
      }
    }

    // Spawn quiz gates
    if (g.quizGates.length === 0 && g.frameCount > 200 && Math.random() < 0.003) {
      g.quizGates.push({
        z: -350,
        active: true,
        questionIndex: (currentQIndex + 1) % questions.length,
      })
    }

    // Collision detection
    const runnerLaneRounded = Math.round(g.runnerLane)
    const hitZone = 18

    for (const obs of g.obstacles) {
      if (obs.hit) continue
      if (Math.abs(obs.z) < hitZone && Math.round(obs.lane) === runnerLaneRounded) {
        obs.hit = true
        const newLives = lives - 1
        setLives(newLives)
        setCombo(0)
        g.shakeX = (Math.random() - 0.5) * 12
        g.shakeY = (Math.random() - 0.5) * 12
        g.flashAlpha = 0.35
        g.flashColor = '#ef4444'
        spawnParticles(runnerWorldX, runnerY, '#ef4444', 10)
        if (soundEnabled) SOUNDS.hit()
        if (newLives <= 0) {
          setGameState('gameover')
          return
        }
      }
    }

    // Coin collection
    for (const coin of g.coins) {
      if (coin.collected) continue
      if (Math.abs(coin.z) < hitZone && Math.round(coin.lane) === runnerLaneRounded) {
        coin.collected = true
        setScore(s => s + 25)
        spawnParticles(getLaneX(coin.lane, W), runnerY, '#fbbf24', 5)
        if (soundEnabled) SOUNDS.coin()
      }
    }

    // Quiz gate collision
    for (const gate of g.quizGates) {
      if (!gate.active) continue
      if (Math.abs(gate.z) < 25) {
        gate.active = false
        setGameState('quiz')
        setSelectedAnswer(null)
        setShowExplanation(false)
        setCorrectAnswer(null)
      }
    }

    setDistance(d => d + g.speed)
    setScore(s => s + Math.floor(g.speed * 0.3))

    gameLoopRef.current = requestAnimationFrame(gameLoop)
  }, [gameState, lives, questions, currentQIndex, soundEnabled, worldToScreen, getLaneX, drawRunner, drawObstacle, drawCoin, drawQuizGate, spawnParticles, g])

  const handleAnswer = (optionIndex: number) => {
    if (selectedAnswer !== null) return
    setSelectedAnswer(optionIndex)
    const isCorrect = optionIndex === currentQ.correctIndex
    setCorrectAnswer(currentQ.correctIndex)

    if (isCorrect) {
      const pts = 300 * (combo + 1)
      setScore(s => s + pts)
      setCombo(c => {
        const newC = c + 1
        setMaxCombo(m => Math.max(m, newC))
        return newC
      })
      g.flashAlpha = 0.2
      g.flashColor = '#22c55e'
      spawnParticles(getLaneX(2, canvasRef.current?.width || 400), (canvasRef.current?.height || 700) * RUNNER_Y_RATIO, '#22c55e', 12)
      if (soundEnabled) SOUNDS.correct()
    } else {
      setCombo(0)
      setLives(l => {
        const newL = l - 1
        g.flashAlpha = 0.3
        g.flashColor = '#ef4444'
        g.shakeX = (Math.random() - 0.5) * 15
        g.shakeY = (Math.random() - 0.5) * 15
        if (soundEnabled) SOUNDS.wrong()
        if (newL <= 0) {
          setTimeout(() => setGameState('gameover'), 800)
        }
        return newL
      })
    }
    setShowExplanation(true)
  }

  const advanceAfterQuiz = () => {
    setShowExplanation(false)
    setSelectedAnswer(null)
    setCorrectAnswer(null)
    if (lives <= 0) {
      setGameState('gameover')
      return
    }
    if (currentQIndex < questions.length - 1) {
      setCurrentQIndex(i => i + 1)
    } else {
      setGameState('victory')
      authApi.awardXp(50, 'Knowledge Runner Victory', resourceId).catch(() => {})
      toast.success('Mission Complete! +50 XP Awarded!')
      return
    }
    setGameState('playing')
  }

  const startGame = () => {
    g.runnerLane = 2
    g.runnerTargetLane = 2
    g.obstacles = []
    g.coins = []
    g.quizGates = []
    g.frameCount = 0
    g.speed = INITIAL_SPEED
    g.trail = []
    g.particles = []
    g.shakeX = 0
    g.shakeY = 0
    g.flashAlpha = 0
    setScore(0)
    setLives(3)
    setCombo(0)
    setMaxCombo(0)
    setCurrentQIndex(0)
    setDistance(0)
    setSelectedAnswer(null)
    setShowExplanation(false)
    setCorrectAnswer(null)
    setGameState('playing')
  }

  // Resize canvas
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // Game loop
  useEffect(() => {
    gameLoopRef.current = requestAnimationFrame(gameLoop)
    return () => cancelAnimationFrame(gameLoopRef.current)
  }, [gameLoop])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'playing') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          if (g.runnerTargetLane > 1) g.runnerTargetLane--
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          if (g.runnerTargetLane < 3) g.runnerTargetLane++
        } else if (e.key === 'Escape') {
          setGameState('paused')
        }
      } else if (gameState === 'paused' && e.key === 'Escape') {
        setGameState('playing')
      } else if (gameState === 'quiz') {
        if (e.key >= '1' && e.key <= '4') {
          handleAnswer(parseInt(e.key) - 1)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, g])

  // Touch controls
  useEffect(() => {
    let touchStartX = 0
    let touchStartY = 0

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX
      touchStartY = e.touches[0].clientY
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (gameState !== 'playing') return
      const dx = e.changedTouches[0].clientX - touchStartX
      const dy = e.changedTouches[0].clientY - touchStartY
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
        if (dx < 0 && g.runnerTargetLane > 1) g.runnerTargetLane--
        else if (dx > 0 && g.runnerTargetLane < 3) g.runnerTargetLane++
      }
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [gameState, g])

  // Calculate displayed lane for UI
  const displayLane = Math.round(g.runnerTargetLane)

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#090a0f] flex items-center justify-center text-white z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="font-extrabold text-slate-300 text-lg">Loading Knowledge Runner...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none z-50">
      {/* Canvas Game */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {/* HUD Overlay */}
      {(gameState === 'playing' || gameState === 'quiz') && (
        <div className="absolute top-0 left-0 right-0 z-30">
          <div className="flex items-center justify-between px-4 py-3 bg-black/50 backdrop-blur-md border-b border-white/10">
            <button
              onClick={() => setGameState(gameState === 'paused' ? 'playing' : 'paused')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Exit
            </button>

            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black">
                <Trophy className="w-3.5 h-3.5 inline mr-1" />{score}
              </div>
              {combo > 1 && (
                <div className="px-2.5 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 text-xs font-black animate-pulse">
                  x{combo} COMBO
                </div>
              )}
              <div className="flex items-center gap-0.5 px-2 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Heart key={i} className={`w-3.5 h-3.5 ${i < lives ? 'fill-red-500 text-red-500' : 'text-slate-700'}`} />
                ))}
              </div>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Speed indicator */}
          <div className="absolute top-16 left-4 px-2 py-1 rounded-lg bg-black/60 backdrop-blur text-[10px] font-bold text-slate-400">
            SPEED: {speed.toFixed(1)}x
          </div>
        </div>
      )}

      {/* Mobile Lane Controls */}
      {gameState === 'playing' && (
        <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center gap-3 px-4 md:hidden">
          {[1, 2, 3].map(l => (
            <button
              key={l}
              onTouchStart={(e) => {
                e.preventDefault()
                if (l === 1 && g.runnerTargetLane > 1) g.runnerTargetLane--
                if (l === 3 && g.runnerTargetLane < 3) g.runnerTargetLane++
              }}
              className={`flex-1 py-4 rounded-2xl font-black text-sm border-2 transition-all active:scale-95 ${
                displayLane === l
                  ? 'bg-primary/20 border-primary text-primary shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                  : 'bg-white/5 border-white/10 text-white/60'
              }`}
            >
              {l === 1 ? '⬅️' : l === 2 ? '🏃' : '➡️'}
            </button>
          ))}
        </div>
      )}

      {/* Quiz Modal */}
      <AnimatePresence>
        {gameState === 'quiz' && currentQ && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 30 }}
              className="bg-[#0f172a]/95 border border-cyan-500/30 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-[0_0_60px_rgba(6,182,212,0.15)]"
            >
              <div className="text-center">
                <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-[11px] font-black uppercase tracking-widest">
                  ⚡ Quiz Gate — Question {currentQIndex + 1}/{questions.length}
                </span>
                <h2 className="text-lg md:text-xl font-black text-white mt-3 leading-snug">{currentQ.question}</h2>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {currentQ.options.map((opt, i) => {
                  const isCorrect = i === currentQ.correctIndex
                  const isSelected = selectedAnswer === i
                  let btnStyle = 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20'
                  if (selectedAnswer !== null) {
                    if (isCorrect) btnStyle = 'bg-green-500/20 border-green-500/50 text-green-400'
                    else if (isSelected && !isCorrect) btnStyle = 'bg-red-500/20 border-red-500/50 text-red-400'
                    else btnStyle = 'bg-white/5 border-white/5 text-white/30'
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => handleAnswer(i)}
                      disabled={selectedAnswer !== null}
                      className={`px-4 py-3 rounded-xl border text-left text-sm font-bold transition-all ${btnStyle}`}
                    >
                      <span className="text-[10px] font-black text-slate-500 mr-2">{i + 1}.</span>
                      {opt}
                    </button>
                  )
                })}
              </div>

              {showExplanation && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-3.5 rounded-xl text-sm font-medium ${
                    selectedAnswer === currentQ.correctIndex
                      ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                      : 'bg-red-500/10 border border-red-500/30 text-red-300'
                  }`}
                >
                  <p className="font-black mb-1">
                    {selectedAnswer === currentQ.correctIndex ? '✅ Correct!' : '❌ Wrong!'}
                    {selectedAnswer !== currentQ.correctIndex && ` Answer: ${currentQ.options[currentQ.correctIndex]}`}
                  </p>
                  {currentQ.explanation && <p className="text-xs opacity-80">{currentQ.explanation}</p>}
                </motion.div>
              )}

              {showExplanation && (
                <button
                  onClick={advanceAfterQuiz}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-black text-sm shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  CONTINUE RUNNING →
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Intro Screen */}
      <AnimatePresence>
        {gameState === 'intro' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-[#0f172a]/95 border border-primary/30 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-[0_0_80px_rgba(245,158,11,0.15)]"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-amber-400 mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.4)]">
                <Play className="w-8 h-8 text-black fill-black" />
              </div>
              <div>
                <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-[11px] font-black uppercase tracking-widest">
                  Knowledge Runner
                </span>
                <h1 className="text-2xl md:text-3xl font-black text-white mt-2">{resource?.title || 'Quiz Runner'}</h1>
                <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                  Run the neon highway! Dodge obstacles, collect coins, and smash quiz gates to prove your mastery.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-bold text-slate-400 bg-white/5 p-3 rounded-2xl border border-white/10">
                <div className="text-center">⬅️ ➡️<br/>Switch Lanes</div>
                <div className="text-center">🪙<br/>Collect Coins</div>
                <div className="text-center">⚡<br/>Quiz Gates</div>
              </div>
              <button
                onClick={startGame}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-amber-400 text-black font-black text-base shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all"
              >
                START RUNNING
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pause Screen */}
      <AnimatePresence>
        {gameState === 'paused' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-[#0f172a]/95 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center space-y-5"
            >
              <Pause className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-2xl font-black text-white">PAUSED</h2>
              <div className="space-y-2">
                <button
                  onClick={() => setGameState('playing')}
                  className="w-full py-3 rounded-xl bg-primary text-black font-black text-sm hover:scale-[1.02] active:scale-95 transition-all"
                >
                  RESUME
                </button>
                <button
                  onClick={() => router.push(`/library/${resourceId}`)}
                  className="w-full py-3 rounded-xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all"
                >
                  EXIT TO MATERIAL
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over / Victory */}
      <AnimatePresence>
        {(gameState === 'gameover' || gameState === 'victory') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#0f172a]/95 border border-white/10 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl"
            >
              <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${
                gameState === 'victory'
                  ? 'bg-gradient-to-br from-amber-500 to-yellow-400 text-black shadow-[0_0_30px_rgba(245,158,11,0.4)]'
                  : 'bg-gradient-to-br from-red-600 to-rose-800 text-white'
              }`}>
                {gameState === 'victory' ? <Award className="w-8 h-8" /> : <span className="text-3xl">💀</span>}
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-white">
                  {gameState === 'victory' ? 'RUN COMPLETE!' : 'GAME OVER'}
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                  {gameState === 'victory'
                    ? 'You crushed it! +50 XP awarded.'
                    : 'The highway got the better of you. Try again!'}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                  <p className="text-2xl font-black text-primary">{score}</p>
                  <p className="text-[10px] font-bold text-slate-500">SCORE</p>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                  <p className="text-2xl font-black text-purple-400">x{maxCombo}</p>
                  <p className="text-[10px] font-bold text-slate-500">MAX COMBO</p>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                  <p className="text-2xl font-black text-cyan-400">{Math.floor(distance / 100)}</p>
                  <p className="text-[10px] font-bold text-slate-500">DISTANCE</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={startGame}
                  className="flex-1 py-3 rounded-xl bg-primary text-black font-black text-sm hover:scale-[1.02] active:scale-95 transition-all"
                >
                  RUN AGAIN
                </button>
                <button
                  onClick={() => router.push(`/library/${resourceId}`)}
                  className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all"
                >
                  EXIT
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer watermark */}
      <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-slate-600 z-20 pointer-events-none">
        Knowledge Runner • Immersive Arcade Engine
      </div>
    </div>
  )
}
