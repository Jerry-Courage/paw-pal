'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { libraryApi, authApi } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Trophy, Heart, Volume2, VolumeX, Play, Award, Pause } from 'lucide-react'
import { toast } from 'sonner'

interface Question {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

type GameState = 'loading' | 'intro' | 'playing' | 'quiz' | 'paused' | 'gameover' | 'victory'

const SFX = {
  correct: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); a.volume = 0.25; a.play() } catch {} },
  wrong: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2658/2658-preview.mp3'); a.volume = 0.25; a.play() } catch {} },
  coin: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'); a.volume = 0.2; a.play() } catch {} },
  hit: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2803/2803-preview.mp3'); a.volume = 0.3; a.play() } catch {} },
}

interface Runner { lane: number; targetLane: number; animPhase: number }
interface Obstacle { lane: number; z: number; type: 'crate' | 'barrier' | 'spike'; hit: boolean }
interface Coin { lane: number; z: number; collected: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }

export default function KnowledgeRunnerPage() {
  const params = useParams()
  const router = useRouter()
  const resourceId = Number(params.id)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [resource, setResource] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [gameState, setGameState] = useState<GameState>('loading')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [speed, setSpeed] = useState(0.4)
  const [distance, setDistance] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)

  const currentQ = questions[currentQIndex] || questions[0]

  // Mutable game state (not React state — avoids re-render lag)
  const g = useRef({
    runner: { lane: 1, targetLane: 1, animPhase: 0 } as Runner,
    obstacles: [] as Obstacle[],
    coins: [] as Coin[],
    particles: [] as Particle[],
    speed: 0.4,
    frame: 0,
    shakeX: 0,
    shakeY: 0,
    flashAlpha: 0,
    flashColor: '#00ff00',
    lastObstacleZ: 0,
    lastCoinZ: 0,
    quizTriggered: false,
    quizCooldown: 0,
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
      const raw = Array.isArray(data) ? data : data?.questions || []
      let qList = raw.map((item: any) => ({
        question: item.question,
        options: item.options || item.choices || [],
        correctIndex: item.correct_index ?? item.answerIndex ?? 0,
        explanation: item.explanation || ''
      }))
      if (qList.length < 3) {
        qList = [
          { question: `What is a key concept in ${resource?.title || 'this material'}?`, options: ['Core Principles', 'Random Guess', 'Skip It', 'None of these'], correctIndex: 0, explanation: 'Core principles build real understanding.' },
          { question: 'Best study method for retention?', options: ['Active Recall', 'Skimming', 'Highlighting', 'Cramming'], correctIndex: 0, explanation: 'Active recall is scientifically proven.' },
          { question: 'How to handle complex topics?', options: ['Break Down Step-by-Step', 'Skip to Easy Parts', 'Memorize Verbatim', 'Ignore Details'], correctIndex: 0, explanation: 'Decomposition builds mastery.' },
        ]
      }
      setQuestions(qList)
      setGameState('intro')
    } catch {
      setQuestions([
        { question: 'What is effective studying?', options: ['Active Engagement', 'Passive Reading', 'Memorizing', 'Skimming'], correctIndex: 0, explanation: 'Active engagement works.' },
        { question: 'Best retention technique?', options: ['Spaced Repetition', 'Cramming', 'Highlighting', 'Reading Once'], correctIndex: 0, explanation: 'Spaced repetition is proven.' },
        { question: 'How to learn deeply?', options: ['Practice & Apply', 'Just Read', 'Copy Notes', 'Watch Passively'], correctIndex: 0, explanation: 'Application cements knowledge.' },
      ])
      setGameState('intro')
    } finally {
      setLoading(false)
    }
  }

  // ─── Canvas 2D Rendering ────────────────────────────────────────────

  const project = useCallback((worldZ: number, laneX: number, W: number, H: number) => {
    // worldZ: negative = far (horizon), 0 = at runner
    const t = (worldZ + 5) / 100 // t=0 at horizon, t=1 at runner
    if (t <= 0 || t > 1.2) return null
    const horizonY = H * 0.15
    const runnerY = H * 0.78
    const roadLeftEdge = W * 0.25
    const roadRightEdge = W * 0.75
    const roadCenterX = W * 0.5
    // Lane X at runner level
    const laneOffset = (laneX) * (roadRightEdge - roadLeftEdge) / 3
    const perspX = roadCenterX + laneOffset * t
    const perspY = horizonY + (runnerY - horizonY) * t
    const scale = t
    return { x: perspX, y: perspY, scale, roadLeft: roadLeftEdge + (0 - roadLeftEdge) * t, roadRight: roadRightEdge + (W - roadRightEdge) * t }
  }, [])

  const laneToX = useCallback((lane: number, W: number): number => {
    const roadLeft = W * 0.25
    const roadRight = W * 0.75
    const roadW = roadRight - roadLeft
    return roadLeft + ((lane + 0.5) / 3) * roadW
  }, [])

  const drawScene = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    const gRef = g.current
    const horizonY = H * 0.15
    const runnerY = H * 0.78
    const roadLeft = W * 0.25
    const roadRight = W * 0.75
    const roadW = roadRight - roadLeft

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#050520')
    sky.addColorStop(0.4, '#0a0a30')
    sky.addColorStop(0.7, '#10103a')
    sky.addColorStop(1, '#1a1a4a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, H)

    // Stars
    for (let i = 0; i < 50; i++) {
      const sx = (i * 137.508 + t * 0.02) % W
      const sy = (i * 97.3) % (horizonY * 0.8)
      const blink = Math.sin(t * 0.015 + i * 2.3) * 0.5 + 0.5
      ctx.globalAlpha = blink * 0.7
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(sx, sy, 1 + blink * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Buildings silhouettes on sides
    ctx.fillStyle = '#08081a'
    for (let i = 0; i < 20; i++) {
      const frac = i / 20
      const bH = 40 + Math.sin(i * 3.7) * 30
      const bW = 25 + Math.sin(i * 2.1) * 15
      const bY = horizonY + frac * (runnerY - horizonY) * 0.9
      const perspScale = 0.2 + frac * 0.8
      const actualH = bH * perspScale
      const actualW = bW * perspScale
      // Left buildings
      ctx.fillRect(roadLeft - 30 - actualW * (1 + frac * 2), bY - actualH, actualW, actualH)
      // Right buildings
      ctx.fillRect(roadRight + 30, bY - actualH, actualW, actualH)
      // Window lights
      if (Math.sin(i * 7.3) > 0) {
        ctx.fillStyle = `rgba(100,150,255,${0.15 + Math.sin(t * 0.01 + i) * 0.1})`
        ctx.fillRect(roadLeft - 30 - actualW * (1 + frac * 2) + actualW * 0.3, bY - actualH * 0.7, actualW * 0.2, actualH * 0.15)
        ctx.fillRect(roadRight + 30 + actualW * 0.5, bY - actualH * 0.5, actualW * 0.2, actualH * 0.15)
        ctx.fillStyle = '#08081a'
      }
    }

    // Road surface with perspective
    const roadGrad = ctx.createLinearGradient(0, horizonY, 0, runnerY + 20)
    roadGrad.addColorStop(0, '#1a1a30')
    roadGrad.addColorStop(1, '#12122a')
    ctx.fillStyle = roadGrad
    ctx.beginPath()
    ctx.moveTo(roadLeft + 80, horizonY)
    ctx.lineTo(roadLeft - 20, runnerY + 20)
    ctx.lineTo(roadRight + 20, runnerY + 20)
    ctx.lineTo(roadRight - 80, horizonY)
    ctx.closePath()
    ctx.fill()

    // Road edges — bright neon
    ctx.strokeStyle = '#ff8800'
    ctx.lineWidth = 3
    ctx.shadowColor = '#ff6600'
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.moveTo(roadLeft + 80, horizonY)
    ctx.lineTo(roadLeft - 20, runnerY + 20)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(roadRight - 80, horizonY)
    ctx.lineTo(roadRight + 20, runnerY + 20)
    ctx.stroke()
    ctx.shadowBlur = 0

    // Lane dividers with scrolling dash
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 2
    ctx.setLineDash([10, 8])
    ctx.lineDashOffset = -(t * gRef.speed * 2) % 18
    for (let i = 1; i < 3; i++) {
      const xFrac = i / 3
      const topX = roadLeft + 80 + xFrac * (roadRight - roadLeft - 160)
      const botX = roadLeft - 20 + xFrac * (roadRight - roadLeft + 40)
      ctx.beginPath()
      ctx.moveTo(topX, horizonY)
      ctx.lineTo(botX, runnerY + 20)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Scrolling horizontal grid lines for depth
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    const gridScroll = (t * gRef.speed * 2) % 30
    for (let i = 0; i < 20; i++) {
      const rawFrac = (i * 30 - gridScroll) / (20 * 30)
      if (rawFrac <= 0.02 || rawFrac >= 1) continue
      const gy = horizonY + rawFrac * (runnerY - horizonY)
      const shrink = 1 - (1 - rawFrac) * 0.6
      const gl = roadLeft + 80 * shrink + (1 - shrink) * (roadLeft - 20)
      const gr = roadRight - 80 * shrink + (1 - shrink) * (roadRight + 20)
      ctx.beginPath()
      ctx.moveTo(gl, gy)
      ctx.lineTo(gr, gy)
      ctx.stroke()
    }

    // ─── Draw coins (behind runner) ────────────────────────────
    for (const coin of gRef.coins) {
      if (coin.collected) continue
      const pos = project(coin.z, coin.lane - 1, W, H)
      if (!pos || pos.scale < 0.06) continue
      const r = 10 * pos.scale
      const coinY = pos.y - r * 3
      const shimmer = Math.sin(t * 0.08 + coin.lane) * 0.3 + 0.7
      ctx.shadowColor = '#ffd700'
      ctx.shadowBlur = 10 * pos.scale
      ctx.fillStyle = `rgba(255,215,0,${shimmer})`
      ctx.beginPath()
      ctx.ellipse(pos.x, coinY, r, r * (0.5 + Math.abs(Math.sin(t * 0.06)) * 0.5), 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#ffaa00'
      ctx.beginPath()
      ctx.ellipse(pos.x, coinY, r * 0.5, r * 0.25, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // ─── Draw obstacles ───────────────────────────────────────
    const obsColors = {
      crate: { main: '#ef4444', dark: '#b91c1c', light: '#f87171', glow: '#ff0000' },
      barrier: { main: '#ff6b00', dark: '#c2410c', light: '#fb923c', glow: '#ff4400' },
      spike: { main: '#a855f7', dark: '#7e22ce', light: '#c084fc', glow: '#9900ff' },
    }

    for (const obs of gRef.obstacles) {
      const pos = project(obs.z, obs.lane - 1, W, H)
      if (!pos || pos.scale < 0.05) continue
      const size = Math.max(20, 80 * pos.scale)
      const c = obsColors[obs.type]
      const baseY = pos.y

      ctx.shadowColor = c.glow
      ctx.shadowBlur = 18 * pos.scale

      if (obs.type === 'crate') {
        const grad = ctx.createLinearGradient(pos.x - size / 2, baseY - size, pos.x + size / 2, baseY)
        grad.addColorStop(0, c.light)
        grad.addColorStop(0.5, c.main)
        grad.addColorStop(1, c.dark)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(pos.x - size / 2, baseY - size, size, size, 4 * pos.scale)
        ctx.fill()
        // Cross pattern
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'
        ctx.lineWidth = Math.max(1, 2 * pos.scale)
        ctx.beginPath()
        ctx.moveTo(pos.x - size * 0.3, baseY - size * 0.3)
        ctx.lineTo(pos.x + size * 0.3, baseY - size * 0.7)
        ctx.moveTo(pos.x + size * 0.3, baseY - size * 0.3)
        ctx.lineTo(pos.x - size * 0.3, baseY - size * 0.7)
        ctx.stroke()
      } else if (obs.type === 'barrier') {
        const w = size * 1.5
        const h = size * 0.8
        const grad = ctx.createLinearGradient(pos.x - w / 2, baseY - h, pos.x + w / 2, baseY)
        grad.addColorStop(0, c.light)
        grad.addColorStop(0.5, c.main)
        grad.addColorStop(1, c.dark)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(pos.x - w / 2, baseY - h, w, h, 3 * pos.scale)
        ctx.fill()
        // Hazard stripes
        ctx.fillStyle = '#ffdd00'
        for (let s = -w * 0.3; s < w * 0.3; s += w * 0.2) {
          ctx.fillRect(pos.x + s, baseY - h * 0.7, w * 0.08, h * 0.4)
        }
      } else {
        // Spike cone
        const grad = ctx.createLinearGradient(pos.x, baseY - size * 1.2, pos.x, baseY)
        grad.addColorStop(0, c.light)
        grad.addColorStop(0.5, c.main)
        grad.addColorStop(1, c.dark)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.moveTo(pos.x, baseY - size * 1.2)
        ctx.lineTo(pos.x - size * 0.4, baseY)
        ctx.lineTo(pos.x + size * 0.4, baseY)
        ctx.closePath()
        ctx.fill()
        // Inner triangle highlight
        ctx.fillStyle = `rgba(255,255,255,0.15)`
        ctx.beginPath()
        ctx.moveTo(pos.x, baseY - size * 0.9)
        ctx.lineTo(pos.x - size * 0.15, baseY - size * 0.2)
        ctx.lineTo(pos.x + size * 0.15, baseY - size * 0.2)
        ctx.closePath()
        ctx.fill()
      }
      ctx.shadowBlur = 0
    }

    // ─── Draw runner ───────────────────────────────────────────
    const runnerX = laneToX(gRef.runner.lane, W)
    const bob = Math.sin(t * 0.12) * 4
    const lean = (gRef.runner.targetLane - gRef.runner.lane) * 3
    const drawX = runnerX + lean
    const drawY = runnerY + bob
    const rW = 40
    const rH = 70

    // Runner shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.beginPath()
    ctx.ellipse(drawX, runnerY + rH * 0.48, rW * 0.5, 6, 0, 0, Math.PI * 2)
    ctx.fill()

    // Runner glow
    ctx.shadowColor = '#f59e0b'
    ctx.shadowBlur = 25

    // Legs
    const legSwing = Math.sin(t * 0.15) * 8
    ctx.fillStyle = '#92400e'
    ctx.fillRect(drawX - 10, drawY + rH * 0.2, 8, 25 + legSwing)
    ctx.fillRect(drawX + 2, drawY + rH * 0.2, 8, 25 - legSwing)

    // Body
    const bodyGrad = ctx.createLinearGradient(drawX - rW * 0.3, drawY - rH * 0.15, drawX + rW * 0.3, drawY + rH * 0.35)
    bodyGrad.addColorStop(0, '#fbbf24')
    bodyGrad.addColorStop(1, '#d97706')
    ctx.fillStyle = bodyGrad
    ctx.beginPath()
    ctx.roundRect(drawX - rW * 0.3, drawY - rH * 0.15, rW * 0.6, rH * 0.4, 6)
    ctx.fill()

    // Arms
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(drawX - rW * 0.3, drawY - rH * 0.05)
    ctx.lineTo(drawX - rW * 0.5, drawY + rH * 0.1 + legSwing)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(drawX + rW * 0.3, drawY - rH * 0.05)
    ctx.lineTo(drawX + rW * 0.5, drawY + rH * 0.1 - legSwing)
    ctx.stroke()

    // Head
    const headGrad = ctx.createRadialGradient(drawX, drawY - rH * 0.35, 0, drawX, drawY - rH * 0.35, rW * 0.3)
    headGrad.addColorStop(0, '#fde68a')
    headGrad.addColorStop(1, '#f59e0b')
    ctx.fillStyle = headGrad
    ctx.beginPath()
    ctx.arc(drawX, drawY - rH * 0.35, rW * 0.28, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Eyes
    ctx.fillStyle = '#1e1b4b'
    ctx.beginPath()
    ctx.arc(drawX - 5, drawY - rH * 0.37, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(drawX + 5, drawY - rH * 0.37, 3, 0, Math.PI * 2)
    ctx.fill()
    // Eye shine
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(drawX - 4, drawY - rH * 0.38, 1.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(drawX + 6, drawY - rH * 0.38, 1.2, 0, Math.PI * 2)
    ctx.fill()

    // Runner trail
    for (let i = 0; i < 6; i++) {
      const trailY = drawY + rH * 0.3 + i * 6
      const trailAlpha = (0.3 - i * 0.04) * (gRef.speed / 0.4)
      if (trailAlpha <= 0) continue
      ctx.fillStyle = `rgba(245,158,11,${trailAlpha})`
      ctx.beginPath()
      ctx.ellipse(drawX + (Math.random() - 0.5) * 4, trailY, 3 + i, 2, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // ─── Particles ─────────────────────────────────────────────
    for (const p of gRef.particles) {
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // ─── Flash overlay ─────────────────────────────────────────
    if (gRef.flashAlpha > 0.01) {
      ctx.fillStyle = gRef.flashColor
      ctx.globalAlpha = gRef.flashAlpha
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
      gRef.flashAlpha *= 0.88
    }

    // ─── Vignette ──────────────────────────────────────────────
    const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.7)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(0,0,0,0.6)')
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, W, H)

    // ─── Approaching danger indicator ──────────────────────────
    const nearestObs = gRef.obstacles
      .filter(o => !o.hit && Math.abs(o.lane - gRef.runner.lane) < 0.5)
      .sort((a, b) => a.z - b.z)[0]
    if (nearestObs && nearestObs.z > -15 && nearestObs.z < 5) {
      const warning = Math.sin(t * 0.2) * 0.5 + 0.5
      ctx.fillStyle = `rgba(255,0,0,${warning * 0.3})`
      ctx.fillRect(0, 0, W, H)
      ctx.font = `bold ${Math.max(14, 24)}px system-ui`
      ctx.fillStyle = `rgba(255,100,100,${warning})`
      ctx.textAlign = 'center'
      ctx.fillText('⚠ DANGER!', W / 2, H * 0.4)
      ctx.textAlign = 'start'
    }
  }, [project, laneToX])

  const spawnParticles = useCallback((x: number, y: number, color: string, count: number = 8) => {
    for (let i = 0; i < count; i++) {
      g.current.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5 - 2,
        life: 1,
        color,
        size: 2 + Math.random() * 3,
      })
    }
  }, [])

  // ─── Game loop ──────────────────────────────────────────────────────

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { requestAnimationFrame(gameLoop); return }
    const ctx = canvas.getContext('2d')
    if (!ctx) { requestAnimationFrame(gameLoop); return }

    const W = canvas.width
    const H = canvas.height
    const gRef = g.current
    const isPlaying = gameState === 'playing'
    const t = gRef.frame

    // Shake decay
    gRef.shakeX *= 0.85
    gRef.shakeY *= 0.85

    ctx.save()
    ctx.translate(gRef.shakeX, gRef.shakeY)

    // Draw everything
    drawScene(ctx, W, H, t)

    ctx.restore()

    // ─── Game Logic (only while playing) ───────────────────────
    if (!isPlaying) {
      requestAnimationFrame(gameLoop)
      return
    }

    gRef.frame++
    gRef.speed = Math.min(1.5, gRef.speed + 0.0003)
    setSpeed(gRef.speed)

    // Smooth lane switch
    const diff = gRef.runner.targetLane - gRef.runner.lane
    if (Math.abs(diff) > 0.01) {
      gRef.runner.lane += diff * 0.12
    } else {
      gRef.runner.lane = gRef.runner.targetLane
    }

    // Move obstacles
    for (const obs of gRef.obstacles) obs.z += gRef.speed
    gRef.obstacles = gRef.obstacles.filter(o => o.z < 12)

    // Move coins
    for (const c of gRef.coins) c.z += gRef.speed
    gRef.coins = gRef.coins.filter(c => c.z < 12 && !c.collected)

    // ─── Spawn obstacles ──────────────────────────────────────
    const minGap = Math.max(8, 20 - gRef.speed * 8)
    if (gRef.frame > 60 && Math.random() < 0.03 + gRef.speed * 0.01) {
      const furthest = gRef.obstacles.length > 0 ? Math.min(...gRef.obstacles.map(o => o.z)) : 0
      if (furthest < -minGap) {
        const types: Obstacle['type'][] = ['crate', 'barrier', 'spike']
        gRef.obstacles.push({
          lane: Math.floor(Math.random() * 3),
          z: -40 - Math.random() * 20,
          type: types[Math.floor(Math.random() * types.length)],
          hit: false,
        })
      }
    }

    // ─── Spawn coins ──────────────────────────────────────────
    if (gRef.frame % 25 === 0 && Math.random() < 0.4) {
      const furthestCoin = gRef.coins.length > 0 ? Math.min(...gRef.coins.map(c => c.z)) : 0
      if (furthestCoin < -15) {
        gRef.coins.push({
          lane: Math.floor(Math.random() * 3),
          z: -45 - Math.random() * 15,
          collected: false,
        })
      }
    }

    // ─── Collision: obstacles ─────────────────────────────────
    const runnerLane = Math.round(gRef.runner.lane)
    const hitZone = 1.5

    for (const obs of gRef.obstacles) {
      if (obs.hit) continue
      if (Math.abs(obs.z) < hitZone && obs.lane === runnerLane) {
        obs.hit = true
        const newLives = lives - 1
        setLives(newLives)
        setCombo(0)
        gRef.shakeX = (Math.random() - 0.5) * 15
        gRef.shakeY = (Math.random() - 0.5) * 15
        gRef.flashAlpha = 0.4
        gRef.flashColor = '#ef4444'
        spawnParticles(laneToX(runnerLane, W), H * 0.78, '#ef4444', 12)
        if (soundEnabled) SFX.hit()
        if (newLives <= 0) setGameState('gameover')
      }
    }

    // ─── Collision: coins ─────────────────────────────────────
    for (const c of gRef.coins) {
      if (c.collected) continue
      if (Math.abs(c.z) < hitZone && c.lane === runnerLane) {
        c.collected = true
        setScore(s => s + 25)
        spawnParticles(laneToX(c.lane, W), H * 0.73, '#ffd700', 6)
        if (soundEnabled) SFX.coin()
      }
    }

    // ─── Quiz trigger ─────────────────────────────────────────
    if (gRef.quizCooldown > 0) gRef.quizCooldown--
    if (gRef.frame > 300 && gRef.quizCooldown <= 0 && currentQIndex < questions.length - 1) {
      if (Math.random() < 0.004) {
        setGameState('quiz')
        setSelectedAnswer(null)
        setShowExplanation(false)
        gRef.quizCooldown = 600
      }
    }

    setDistance(d => d + gRef.speed)
    setScore(s => s + Math.floor(gRef.speed))

    requestAnimationFrame(gameLoop)
  }, [gameState, lives, questions, currentQIndex, soundEnabled, drawScene, spawnParticles, laneToX])

  // ─── Start / Restart ────────────────────────────────────────────────

  const startGame = useCallback(() => {
    const gRef = g.current
    gRef.runner = { lane: 1, targetLane: 1, animPhase: 0 }
    gRef.obstacles = []
    gRef.coins = []
    gRef.particles = []
    gRef.speed = 0.4
    gRef.frame = 0
    gRef.shakeX = 0
    gRef.shakeY = 0
    gRef.flashAlpha = 0
    gRef.quizCooldown = 0
    setScore(0)
    setLives(3)
    setCombo(0)
    setMaxCombo(0)
    setCurrentQIndex(0)
    setDistance(0)
    setSelectedAnswer(null)
    setShowExplanation(false)
    setGameState('playing')
  }, [])

  const handleAnswer = useCallback((idx: number) => {
    if (selectedAnswer !== null) return
    setSelectedAnswer(idx)
    const q = questions[currentQIndex]
    if (!q) return
    const correct = idx === q.correctIndex
    if (correct) {
      const pts = 300 * (combo + 1)
      setScore(s => s + pts)
      setCombo(c => { const n = c + 1; setMaxCombo(m => Math.max(m, n)); return n })
      g.current.flashAlpha = 0.2
      g.current.flashColor = '#22c55e'
      if (soundEnabled) SFX.correct()
    } else {
      setCombo(0)
      setLives(l => {
        const n = l - 1
        g.current.flashAlpha = 0.35
        g.current.flashColor = '#ef4444'
        g.current.shakeX = (Math.random() - 0.5) * 15
        g.current.shakeY = (Math.random() - 0.5) * 15
        if (soundEnabled) SFX.wrong()
        if (n <= 0) setTimeout(() => setGameState('gameover'), 800)
        return n
      })
    }
    setShowExplanation(true)
  }, [selectedAnswer, questions, currentQIndex, combo, soundEnabled])

  const advanceAfterQuiz = useCallback(() => {
    setShowExplanation(false)
    setSelectedAnswer(null)
    if (lives <= 0) { setGameState('gameover'); return }
    if (currentQIndex < questions.length - 1) {
      setCurrentQIndex(i => i + 1)
    } else {
      setGameState('victory')
      authApi.awardXp(50, 'Knowledge Runner Victory', resourceId).catch(() => {})
      toast.success('Mission Complete! +50 XP Awarded!')
      return
    }
    setGameState('playing')
  }, [lives, currentQIndex, questions.length, resourceId])

  // ─── Canvas resize ──────────────────────────────────────────────────

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

  // ─── Game loop start ────────────────────────────────────────────────

  useEffect(() => {
    const id = requestAnimationFrame(gameLoop)
    return () => cancelAnimationFrame(id)
  }, [gameLoop])

  // ─── Keyboard ───────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const gRef = g.current
      if (gameState === 'playing') {
        if ((e.key === 'ArrowLeft' || e.key === 'a') && gRef.runner.targetLane > 0) gRef.runner.targetLane--
        if ((e.key === 'ArrowRight' || e.key === 'd') && gRef.runner.targetLane < 2) gRef.runner.targetLane++
        if (e.key === 'Escape') setGameState('paused')
      } else if (gameState === 'paused' && e.key === 'Escape') {
        setGameState('playing')
      } else if (gameState === 'quiz' && e.key >= '1' && e.key <= '4') {
        handleAnswer(parseInt(e.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameState, handleAnswer])

  // ─── Touch swipe ────────────────────────────────────────────────────

  useEffect(() => {
    let sx = 0
    const onStart = (e: TouchEvent) => { sx = e.touches[0].clientX }
    const onEnd = (e: TouchEvent) => {
      if (gameState !== 'playing') return
      const dx = e.changedTouches[0].clientX - sx
      const gRef = g.current
      if (Math.abs(dx) > 40) {
        if (dx < 0 && gRef.runner.targetLane > 0) gRef.runner.targetLane--
        if (dx > 0 && gRef.runner.targetLane < 2) gRef.runner.targetLane++
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd) }
  }, [gameState])

  // ─── Loading screen ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#050520] flex items-center justify-center text-white z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="font-extrabold text-slate-300 text-lg">Loading Knowledge Runner...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none z-50">
      {/* Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }} />

      {/* HUD */}
      {(gameState === 'playing' || gameState === 'quiz') && (
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
          <div className="flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-md border-b border-white/5 pointer-events-auto">
            <button onClick={() => setGameState(gameState === 'paused' ? 'playing' : 'paused')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors">
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
              <button onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div className="absolute top-16 left-4 px-2 py-1 rounded-lg bg-black/60 text-[10px] font-bold text-slate-400">
            SPEED: {speed.toFixed(1)}x
          </div>
        </div>
      )}

      {/* Mobile lane buttons */}
      {gameState === 'playing' && (
        <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center gap-3 px-4 md:hidden pointer-events-auto">
          {[0, 1, 2].map(l => (
            <button key={l} onTouchStart={(e) => { e.preventDefault(); g.current.runner.targetLane = l }}
              className={`flex-1 py-4 rounded-2xl font-black text-sm border-2 transition-all active:scale-95 ${
                Math.round(g.current.runner.targetLane) === l
                  ? 'bg-primary/20 border-primary text-primary shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                  : 'bg-white/5 border-white/10 text-white/60'
              }`}>
              {l === 0 ? '⬅️' : l === 1 ? '🏃' : '➡️'}
            </button>
          ))}
        </div>
      )}

      {/* Quiz Modal */}
      <AnimatePresence>
        {gameState === 'quiz' && currentQ && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, y: 30 }}
              className="bg-[#0f172a]/95 border border-cyan-500/30 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-[0_0_60px_rgba(6,182,212,0.15)]">
              <div className="text-center">
                <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-[11px] font-black uppercase tracking-widest">
                  ⚡ Quiz Gate — {currentQIndex + 1}/{questions.length}
                </span>
                <h2 className="text-lg md:text-xl font-black text-white mt-3 leading-snug">{currentQ.question}</h2>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {currentQ.options.map((opt, i) => {
                  const isCorrect = i === currentQ.correctIndex
                  const isSelected = selectedAnswer === i
                  let style = 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                  if (selectedAnswer !== null) {
                    if (isCorrect) style = 'bg-green-500/20 border-green-500/50 text-green-400'
                    else if (isSelected) style = 'bg-red-500/20 border-red-500/50 text-red-400'
                    else style = 'bg-white/5 border-white/5 text-white/30'
                  }
                  return (
                    <button key={i} onClick={() => handleAnswer(i)} disabled={selectedAnswer !== null}
                      className={`px-4 py-3 rounded-xl border text-left text-sm font-bold transition-all ${style}`}>
                      <span className="text-[10px] font-black text-slate-500 mr-2">{i + 1}.</span>{opt}
                    </button>
                  )
                })}
              </div>
              {showExplanation && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`p-3.5 rounded-xl text-sm font-medium ${
                    selectedAnswer === currentQ.correctIndex
                      ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                      : 'bg-red-500/10 border border-red-500/30 text-red-300'
                  }`}>
                  <p className="font-black mb-1">
                    {selectedAnswer === currentQ.correctIndex ? '✅ Correct!' : `❌ Wrong — Answer: ${currentQ.options[currentQ.correctIndex]}`}
                  </p>
                  {currentQ.explanation && <p className="text-xs opacity-80">{currentQ.explanation}</p>}
                </motion.div>
              )}
              {showExplanation && (
                <button onClick={advanceAfterQuiz}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-black text-sm shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-95 transition-all">
                  CONTINUE RUNNING →
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Intro */}
      <AnimatePresence>
        {gameState === 'intro' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="bg-[#0f172a]/95 border border-primary/30 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-[0_0_80px_rgba(245,158,11,0.15)]">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-amber-400 mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.4)]">
                <Play className="w-8 h-8 text-black fill-black" />
              </div>
              <div>
                <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-[11px] font-black uppercase tracking-widest">Knowledge Runner</span>
                <h1 className="text-2xl md:text-3xl font-black text-white mt-2">{resource?.title || 'Quiz Runner'}</h1>
                <p className="text-slate-400 text-sm mt-2">Dodge crates, barriers and spikes. Collect coins. Smash quiz gates to prove mastery.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-bold text-slate-400 bg-white/5 p-3 rounded-2xl border border-white/10">
                <div className="text-center">⬅️ ➡️<br/>Switch Lanes</div>
                <div className="text-center">🪙<br/>Collect Coins</div>
                <div className="text-center">⚡<br/>Quiz Gates</div>
              </div>
              <button onClick={startGame}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-amber-400 text-black font-black text-base shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all">
                START RUNNING
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pause */}
      <AnimatePresence>
        {gameState === 'paused' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="bg-[#0f172a]/95 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center space-y-5">
              <Pause className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-2xl font-black text-white">PAUSED</h2>
              <button onClick={() => setGameState('playing')}
                className="w-full py-3 rounded-xl bg-primary text-black font-black text-sm hover:scale-[1.02] active:scale-95 transition-all">RESUME</button>
              <button onClick={() => router.push(`/library/${resourceId}`)}
                className="w-full py-3 rounded-xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all">EXIT</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over / Victory */}
      <AnimatePresence>
        {(gameState === 'gameover' || gameState === 'victory') && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#0f172a]/95 border border-white/10 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
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
                  {gameState === 'victory' ? 'You crushed it! +50 XP awarded.' : 'The city got you. Try again!'}
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
                  <p className="text-2xl font-black text-cyan-400">{Math.floor(distance / 10)}</p>
                  <p className="text-[10px] font-bold text-slate-500">DISTANCE</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={startGame}
                  className="flex-1 py-3 rounded-xl bg-primary text-black font-black text-sm hover:scale-[1.02] active:scale-95 transition-all">RUN AGAIN</button>
                <button onClick={() => router.push(`/library/${resourceId}`)}
                  className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all">EXIT</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-slate-600 z-20 pointer-events-none">
        Knowledge Runner • Immersive Arcade Engine
      </div>
    </div>
  )
}
