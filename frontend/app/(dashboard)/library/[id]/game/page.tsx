'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { libraryApi, authApi } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Trophy, Heart, Volume2, VolumeX, Play, Award, Pause } from 'lucide-react'
import { toast } from 'sonner'
import * as THREE from 'three'

interface Question {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

type GameState = 'loading' | 'intro' | 'playing' | 'quiz' | 'paused' | 'gameover' | 'victory'

const LANE_X = [-3.5, 0, 3.5]
const INITIAL_SPEED = 0.35
const MAX_SPEED = 1.2
const SPEED_INC = 0.00008

const SFX = {
  correct: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); a.volume = 0.25; a.play() } catch {} },
  wrong: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2658/2658-preview.mp3'); a.volume = 0.25; a.play() } catch {} },
  coin: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'); a.volume = 0.2; a.play() } catch {} },
  hit: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2803/2803-preview.mp3'); a.volume = 0.3; a.play() } catch {} },
}

export default function KnowledgeRunnerPage() {
  const params = useParams()
  const router = useRouter()
  const resourceId = Number(params.id)
  const mountRef = useRef<HTMLDivElement>(null)
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

  const currentQ = questions[currentQIndex] || questions[0]

  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const runnerRef = useRef<THREE.Group | null>(null)
  const trailRef = useRef<THREE.Mesh[]>([])

  const gameRef = useRef({
    currentLane: 1,
    targetLane: 1,
    runnerX: 0,
    speed: INITIAL_SPEED,
    frame: 0,
    obstacles: [] as { mesh: THREE.Mesh; lane: number; z: number; type: string; hit: boolean }[],
    coins: [] as { mesh: THREE.Mesh; lane: number; z: number; collected: boolean }[],
    laneMarkers: [] as THREE.Mesh[],
    particles: [] as { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number }[],
    shakeIntensity: 0,
  })

  // Init Three.js scene
  const initScene = useCallback(() => {
    if (!mountRef.current) return
    const w = window.innerWidth
    const h = window.innerHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050510)
    scene.fog = new THREE.FogExp2(0x050510, 0.012)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 200)
    camera.position.set(0, 5.5, 8)
    camera.lookAt(0, 1.5, -20)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lighting
    scene.add(new THREE.AmbientLight(0x404060, 1.5))

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
    dirLight.position.set(5, 15, 10)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(1024, 1024)
    dirLight.shadow.camera.near = 1
    dirLight.shadow.camera.far = 80
    dirLight.shadow.camera.left = -15
    dirLight.shadow.camera.right = 15
    scene.add(dirLight)

    const rimLight = new THREE.DirectionalLight(0x00aaff, 0.8)
    rimLight.position.set(-5, 3, -10)
    scene.add(rimLight)

    const pointLight = new THREE.PointLight(0xff6600, 1.5, 30)
    pointLight.position.set(0, 4, -5)
    scene.add(pointLight)

    // Road
    const roadGeo = new THREE.PlaneGeometry(14, 200)
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x111122,
      roughness: 0.6,
      metalness: 0.1,
    })
    const road = new THREE.Mesh(roadGeo, roadMat)
    road.rotation.x = -Math.PI / 2
    road.position.set(0, 0, -80)
    road.receiveShadow = true
    scene.add(road)

    // Road edges — neon glow strips
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff6600, emissiveIntensity: 2 })
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 200), edgeMat)
      edge.position.set(side * 7, 0.05, -80)
      scene.add(edge)
    }

    // Lane dividers
    const dividerMat = new THREE.MeshStandardMaterial({ color: 0x444466, emissive: 0x222244, emissiveIntensity: 0.5 })
    const g = gameRef.current
    g.laneMarkers = []
    for (let laneIdx = 0; laneIdx < 2; laneIdx++) {
      const x = (laneIdx === 0 ? -1.75 : 1.75)
      for (let i = 0; i < 50; i++) {
        const marker = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 2), dividerMat)
        marker.position.set(x, 0.01, -i * 4)
        scene.add(marker)
        g.laneMarkers.push(marker)
      }
    }

    // Side buildings / walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0a0a1a, roughness: 0.8, metalness: 0.2 })
    for (const side of [-1, 1]) {
      for (let i = 0; i < 30; i++) {
        const h = 3 + Math.random() * 8
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(2 + Math.random() * 2, h, 3 + Math.random() * 3),
          wallMat
        )
        wall.position.set(side * (8 + Math.random() * 4), h / 2, -i * 7 - Math.random() * 5)
        wall.castShadow = true
        scene.add(wall)

        // Window lights
        const windowMat = new THREE.MeshStandardMaterial({
          color: 0x334455,
          emissive: Math.random() > 0.5 ? 0x223344 : 0x112233,
          emissiveIntensity: 1 + Math.random() * 2,
        })
        for (let w = 0; w < Math.floor(Math.random() * 4) + 1; w++) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), windowMat)
          win.position.set(
            side * (8 + Math.random() * 4) + (side * -1.01),
            1 + Math.random() * (h - 2),
            -i * 7 - Math.random() * 5
          )
          win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
          scene.add(win)
        }
      }
    }

    // Ground plane
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 200),
      new THREE.MeshStandardMaterial({ color: 0x080810, roughness: 1 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.05
    ground.position.z = -80
    scene.add(ground)

    // Runner character
    const runner = new THREE.Group()
    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.3 })
    )
    body.position.y = 1.2
    body.castShadow = true
    runner.add(body)
    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.2 })
    )
    head.position.y = 2.15
    head.castShadow = true
    runner.add(head)
    // Eyes
    for (const ex of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x1e1b4b })
      )
      eye.position.set(ex, 2.2, 0.3)
      runner.add(eye)
    }
    // Legs
    for (const lx of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.7, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.6 })
      )
      leg.position.set(lx, 0.4, 0)
      leg.castShadow = true
      runner.add(leg)
    }
    // Arms
    for (const ax of [-0.55, 0.55]) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.8, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 })
      )
      arm.position.set(ax, 1.2, 0)
      arm.castShadow = true
      runner.add(arm)
    }
    runner.position.set(0, 0, 0)
    scene.add(runner)
    runnerRef.current = runner

    // Trail
    for (let i = 0; i < 15; i++) {
      const trailMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 - i * 0.004, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.3 - i * 0.02 })
      )
      trailMesh.position.set(0, 0.5, i * 0.5)
      scene.add(trailMesh)
      trailRef.current.push(trailMesh)
    }
  }, [])

  const spawnObstacle = useCallback((type: string) => {
    const scene = sceneRef.current
    if (!scene) return
    const g = gameRef.current
    const lane = Math.floor(Math.random() * 3)
    let mesh: THREE.Mesh

    if (type === 'crate') {
      const size = 1.0 + Math.random() * 0.5
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xdc2626,
          emissiveIntensity: 0.4,
          roughness: 0.3,
          metalness: 0.5,
        })
      )
      mesh.castShadow = true
    } else if (type === 'barrier') {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 1.8, 0.4),
        new THREE.MeshStandardMaterial({
          color: 0xff6b00,
          emissive: 0xff4400,
          emissiveIntensity: 0.6,
          roughness: 0.2,
          metalness: 0.6,
        })
      )
      mesh.castShadow = true
      // Warning stripes
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xffaa00, emissiveIntensity: 0.8 })
      for (let s = -0.6; s <= 0.6; s += 0.4) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.42), stripeMat)
        stripe.position.set(s, 0, 0)
        mesh.add(stripe)
      }
    } else {
      // Spike
      mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 1.5, 4),
        new THREE.MeshStandardMaterial({
          color: 0xaa00ff,
          emissive: 0x7700cc,
          emissiveIntensity: 0.5,
          roughness: 0.2,
          metalness: 0.7,
        })
      )
      mesh.castShadow = true
    }

    mesh.position.set(LANE_X[lane], mesh.geometry instanceof THREE.ConeGeometry ? 0.75 : 0.7, -120)
    scene.add(mesh)
    g.obstacles.push({ mesh, lane, z: -120, type, hit: false })
  }, [])

  const spawnCoin = useCallback(() => {
    const scene = sceneRef.current
    if (!scene) return
    const g = gameRef.current
    const lane = Math.floor(Math.random() * 3)
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 1, roughness: 0.2, metalness: 0.9 })
    )
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(LANE_X[lane], 1.5, -120)
    scene.add(mesh)
    g.coins.push({ mesh, lane, z: -120, collected: false })
  }, [])

  const spawnParticles = useCallback((x: number, y: number, z: number, color: number, count: number = 10) => {
    const scene = sceneRef.current
    if (!scene) return
    const g = gameRef.current
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 4, 4),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 })
      )
      mesh.position.set(x, y, z)
      scene.add(mesh)
      g.particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 0.4,
        vy: Math.random() * 0.3 + 0.1,
        vz: (Math.random() - 0.5) * 0.4,
        life: 1,
      })
    }
  }, [])

  const handleAnswer = useCallback((optionIndex: number) => {
    if (selectedAnswer !== null) return
    setSelectedAnswer(optionIndex)
    const q = questions[currentQIndex]
    if (!q) return
    const isCorrect = optionIndex === q.correctIndex

    if (isCorrect) {
      const pts = 300 * (combo + 1)
      setScore(s => s + pts)
      setCombo(c => { const n = c + 1; setMaxCombo(m => Math.max(m, n)); return n })
      if (soundEnabled) SFX.correct()
      if (runnerRef.current) {
        spawnParticles(runnerRef.current.position.x, 2, 0, 0x22c55e, 15)
      }
    } else {
      setCombo(0)
      setLives(l => {
        const n = l - 1
        if (soundEnabled) SFX.wrong()
        gameRef.current.shakeIntensity = 0.5
        if (n <= 0) setTimeout(() => setGameState('gameover'), 1000)
        return n
      })
    }
    setShowExplanation(true)
  }, [selectedAnswer, questions, currentQIndex, combo, soundEnabled, spawnParticles])

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

  const startGame = useCallback(() => {
    const g = gameRef.current
    // Clean up old objects
    const scene = sceneRef.current
    if (scene) {
      g.obstacles.forEach(o => scene.remove(o.mesh))
      g.coins.forEach(c => scene.remove(c.mesh))
      g.particles.forEach(p => scene.remove(p.mesh))
    }
    g.obstacles = []
    g.coins = []
    g.particles = []
    g.currentLane = 1
    g.targetLane = 1
    g.runnerX = 0
    g.speed = INITIAL_SPEED
    g.frame = 0
    g.shakeIntensity = 0
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

  // Game loop
  const animate = useCallback(() => {
    const scene = sceneRef.current
    const camera = cameraRef.current
    const renderer = rendererRef.current
    const runner = runnerRef.current
    if (!scene || !camera || !renderer || !runner) {
      gameLoopRef.current = requestAnimationFrame(animate)
      return
    }

    const g = gameRef.current
    const isPlaying = gameState === 'playing'

    if (isPlaying) {
      g.frame++
      g.speed = Math.min(MAX_SPEED, g.speed + SPEED_INC)
      setSpeed(g.speed)

      // Smooth lane switch
      const targetX = LANE_X[g.targetLane]
      g.runnerX += (targetX - g.runnerX) * 0.12
      runner.position.x = g.runnerX

      // Spawn obstacles
      const spawnChance = 0.015 + g.speed * 0.01
      const minGap = Math.max(12, 25 - g.speed * 10)
      if (g.frame > 60 && Math.random() < spawnChance) {
        const lastZ = g.obstacles.length > 0 ? Math.min(...g.obstacles.map(o => o.z)) : -50
        if (lastZ < -minGap) {
          const types = ['crate', 'barrier', 'spike']
          spawnObstacle(types[Math.floor(Math.random() * types.length)])
        }
      }

      // Spawn coins
      if (g.frame % 20 === 0 && Math.random() < 0.5) {
        spawnCoin()
      }

      // Move obstacles toward player
      for (const obs of g.obstacles) {
        obs.z += g.speed
        obs.mesh.position.z = obs.z
      }
      g.obstacles = g.obstacles.filter(o => {
        if (o.z > 15) { scene.remove(o.mesh); return false }
        return true
      })

      // Move coins
      for (const c of g.coins) {
        c.z += g.speed
        c.mesh.position.z = c.z
        c.mesh.rotation.y += 0.05
      }
      g.coins = g.coins.filter(c => {
        if (c.z > 15) { scene.remove(c.mesh); return false }
        return true
      })

      // Collision — obstacles
      const runnerLane = Math.round(g.runnerX) <= -1 ? 0 : Math.round(g.runnerX) >= 1 ? 2 : 1
      for (const obs of g.obstacles) {
        if (obs.hit) continue
        if (Math.abs(obs.z) < 1.2 && obs.lane === runnerLane) {
          obs.hit = true
          const newLives = lives - 1
          setLives(newLives)
          setCombo(0)
          g.shakeIntensity = 0.6
          spawnParticles(runner.position.x, 1.5, 0, 0xef4444, 12)
          if (soundEnabled) SFX.hit()
          if (newLives <= 0) setGameState('gameover')
        }
      }

      // Collision — coins
      for (const c of g.coins) {
        if (c.collected) continue
        if (Math.abs(c.z) < 1.2 && c.lane === runnerLane) {
          c.collected = true
          setScore(s => s + 25)
          spawnParticles(c.mesh.position.x, 1.5, 0, 0xffd700, 6)
          if (soundEnabled) SFX.coin()
        }
      }

      // Quiz gate — trigger after certain distance
      if (g.frame > 300 && g.frame % 600 === 0 && currentQIndex < questions.length - 1) {
        setGameState('quiz')
        setSelectedAnswer(null)
        setShowExplanation(false)
      }

      setDistance(d => d + g.speed)
      setScore(s => s + Math.floor(g.speed * 2))
    }

    // Camera shake
    if (g.shakeIntensity > 0.01) {
      camera.position.x = (Math.random() - 0.5) * g.shakeIntensity
      camera.position.y = 5.5 + (Math.random() - 0.5) * g.shakeIntensity
      g.shakeIntensity *= 0.9
    } else {
      camera.position.x += (0 - camera.position.x) * 0.1
      camera.position.y += (5.5 - camera.position.y) * 0.1
    }

    // Runner animation
    if (runner) {
      const t = g.frame
      const bob = Math.sin(t * 0.15) * 0.15
      runner.children[0].position.y = 1.2 + bob // body
      runner.children[1].position.y = 2.15 + bob // head
      // Eye positions
      runner.children[2].position.y = 2.2 + bob
      runner.children[3].position.y = 2.2 + bob
      // Legs
      const legSwing = Math.sin(t * 0.15) * 0.3
      if (runner.children[4]) runner.children[4].rotation.x = legSwing
      if (runner.children[5]) runner.children[5].rotation.x = -legSwing
      // Arms
      if (runner.children[6]) runner.children[6].rotation.x = -legSwing
      if (runner.children[7]) runner.children[7].rotation.x = legSwing
    }

    // Move lane markers
    for (const marker of g.laneMarkers) {
      marker.position.z += isPlaying ? g.speed : INITIAL_SPEED * 0.3
      if (marker.position.z > 10) marker.position.z -= 200
    }

    // Animate trail
    for (let i = 0; i < trailRef.current.length; i++) {
      const trail = trailRef.current[i]
      if (runner) {
        trail.position.x = runner.position.x + (Math.random() - 0.5) * 0.1
        trail.position.z = i * 0.4
        trail.position.y = 0.5 + Math.sin(g.frame * 0.1 + i) * 0.1
      }
      trail.material.opacity = 0.3 - i * 0.02
    }

    // Animate particles
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const p = g.particles[i]
      p.mesh.position.x += p.vx
      p.mesh.position.y += p.vy
      p.mesh.position.z += p.vz
      p.vy -= 0.008
      p.life -= 0.025
      p.mesh.material.opacity = p.life
      p.mesh.material.transparent = true
      if (p.life <= 0) {
        scene.remove(p.mesh)
        g.particles.splice(i, 1)
      }
    }

    renderer.render(scene, camera)
    gameLoopRef.current = requestAnimationFrame(animate)
  }, [gameState, lives, questions, currentQIndex, soundEnabled, spawnObstacle, spawnCoin, spawnParticles])

  // Setup
  useEffect(() => {
    libraryApi.getResource(resourceId).then(r => setResource(r.data)).catch(() => {})
    loadQuestions()
    return () => {
      cancelAnimationFrame(gameLoopRef.current)
      if (rendererRef.current && mountRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement)
        rendererRef.current.dispose()
      }
    }
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
          { question: `What is a key concept in ${resource?.title || 'this material'}?`, options: ['Core Principles', 'Random Guess', 'Skip It', 'None'], correctIndex: 0, explanation: 'Core principles build real understanding.' },
          { question: 'Best study method for retention?', options: ['Active Recall', 'Skimming', 'Highlighting', 'Cramming'], correctIndex: 0, explanation: 'Active recall is scientifically proven.' },
          { question: 'How to handle complex topics?', options: ['Break Down Step-by-Step', 'Skip to Easy', 'Memorize Verbatim', 'Ignore'], correctIndex: 0, explanation: 'Decomposition builds deeper mastery.' },
        ]
      }
      setQuestions(qList)
      initScene()
      setGameState('intro')
    } catch {
      setQuestions([
        { question: 'What is effective studying?', options: ['Active Engagement', 'Passive Reading', 'Memorizing', 'Skimming'], correctIndex: 0, explanation: 'Active engagement works.' },
        { question: 'Best retention technique?', options: ['Spaced Repetition', 'Cramming', 'Highlighting', 'Reading Once'], correctIndex: 0, explanation: 'Spaced repetition is proven.' },
        { question: 'How to learn deeply?', options: ['Practice & Apply', 'Just Read', 'Copy Notes', 'Watch Passively'], correctIndex: 0, explanation: 'Application cements knowledge.' },
      ])
      initScene()
      setGameState('intro')
    } finally {
      setLoading(false)
    }
  }

  // Animation loop
  useEffect(() => {
    gameLoopRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(gameLoopRef.current)
  }, [animate])

  // Resize
  useEffect(() => {
    const onResize = () => {
      const cam = cameraRef.current
      const ren = rendererRef.current
      if (!cam || !ren) return
      cam.aspect = window.innerWidth / window.innerHeight
      cam.updateProjectionMatrix()
      ren.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current
      if (gameState === 'playing') {
        if ((e.key === 'ArrowLeft' || e.key === 'a') && g.targetLane > 0) g.targetLane--
        if ((e.key === 'ArrowRight' || e.key === 'd') && g.targetLane < 2) g.targetLane++
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

  // Touch swipe
  useEffect(() => {
    let sx = 0
    const onStart = (e: TouchEvent) => { sx = e.touches[0].clientX }
    const onEnd = (e: TouchEvent) => {
      if (gameState !== 'playing') return
      const dx = e.changedTouches[0].clientX - sx
      const g = gameRef.current
      if (Math.abs(dx) > 40) {
        if (dx < 0 && g.targetLane > 0) g.targetLane--
        if (dx > 0 && g.targetLane < 2) g.targetLane++
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd) }
  }, [gameState])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#050510] flex items-center justify-center text-white z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="font-extrabold text-slate-300 text-lg">Loading Knowledge Runner...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none z-50">
      {/* 3D Canvas */}
      <div ref={mountRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

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
            <button key={l} onTouchStart={(e) => { e.preventDefault(); gameRef.current.targetLane = l }}
              className={`flex-1 py-4 rounded-2xl font-black text-sm border-2 transition-all active:scale-95 ${
                gameRef.current.targetLane === l
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
                <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-[11px] font-black uppercase tracking-widest">Knowledge Runner 3D</span>
                <h1 className="text-2xl md:text-3xl font-black text-white mt-2">{resource?.title || 'Quiz Runner'}</h1>
                <p className="text-slate-400 text-sm mt-2">Run through the neon city! Dodge crates, barriers and spikes. Collect coins. Smash quiz gates to prove your mastery.</p>
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
        Knowledge Runner 3D • Immersive Arcade Engine
      </div>
    </div>
  )
}
