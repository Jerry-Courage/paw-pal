'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
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

// ─── Dynamic Three.js loader ──────────────────────────────────────────
let THREE: typeof import('three') | null = null
let threePromise: Promise<void> | null = null

function loadThree() {
  if (THREE) return Promise.resolve()
  if (threePromise) return threePromise
  threePromise = import('three').then(mod => {
    THREE = mod
  }).catch(err => {
    console.error('Failed to load Three.js:', err)
    threePromise = null
  })
  return threePromise
}

// ─── 3D Game Engine ───────────────────────────────────────────────────

class RunnerEngine {
  private scene: any
  private camera: any
  private renderer: any
  private runner: any
  private runnerParts: any[] = []
  private laneMarkers: any[] = []
  private obstacles: { mesh: any; lane: number; z: number; type: string; hit: boolean }[] = []
  private coins: { mesh: any; lane: number; z: number; collected: boolean }[] = []
  private trail: any[] = []
  private particles: { mesh: any; vx: number; vy: number; vz: number; life: number }[] = []
  private buildings: any[] = []
  private frame = 0
  private speed = 0.35
  private currentLane = 1
  private targetLane = 1
  private animId = 0
  private alive = true
  private onHit: () => void = () => {}
  private onCoin: () => void = () => {}
  private onQuiz: () => void = () => {}
  private lastScoreTick = 0

  private LANE_X = [-3.5, 0, 3.5]

  async init(container: HTMLDivElement, callbacks: { onHit: () => void; onCoin: () => void; onQuiz: () => void }) {
    await loadThree()
    if (!THREE || !this.alive) return false

    this.onHit = callbacks.onHit
    this.onCoin = callbacks.onCoin
    this.onQuiz = callbacks.onQuiz

    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight

    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x030310)
    this.scene.fog = new THREE.FogExp2(0x030310, 0.015)

    // Camera
    this.camera = new THREE.PerspectiveCamera(68, w / h, 0.1, 200)
    this.camera.position.set(0, 6, 9)
    this.camera.lookAt(0, 1.5, -25)

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = 2 // PCFSoftShadowMap
    this.renderer.toneMapping = 4 // ACESFilmic
    this.renderer.toneMappingExposure = 1.3
    container.appendChild(this.renderer.domElement)

    // Lights
    this.scene.add(new THREE.AmbientLight(0x303050, 2))

    const dir = new THREE.DirectionalLight(0xffffff, 2)
    dir.position.set(5, 15, 10)
    dir.castShadow = true
    dir.shadow.mapSize.set(1024, 1024)
    dir.shadow.camera.near = 1
    dir.shadow.camera.far = 60
    dir.shadow.camera.left = -15
    dir.shadow.camera.right = 15
    this.scene.add(dir)

    const rim = new THREE.DirectionalLight(0x4488ff, 1)
    rim.position.set(-5, 3, -10)
    this.scene.add(rim)

    const warm = new THREE.PointLight(0xff6600, 2, 25)
    warm.position.set(0, 5, -5)
    this.scene.add(warm)

    // ─── Road ───────────────────────────────────
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x0c0c1a, roughness: 0.5, metalness: 0.1 })
    const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 250), roadMat)
    road.rotation.x = -Math.PI / 2
    road.position.set(0, -0.01, -100)
    road.receiveShadow = true
    this.scene.add(road)

    // Road edges — neon strips
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff6600, emissiveIntensity: 3 })
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 250), edgeMat)
      edge.position.set(side * 7, 0.02, -100)
      this.scene.add(edge)
    }

    // Lane dividers
    const divMat = new THREE.MeshStandardMaterial({ color: 0x333355, emissive: 0x1a1a33, emissiveIntensity: 0.8 })
    for (let li = 0; li < 2; li++) {
      const x = li === 0 ? -1.75 : 1.75
      for (let i = 0; i < 60; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 1.8), divMat)
        m.position.set(x, 0.01, -i * 4)
        this.scene.add(m)
        this.laneMarkers.push(m)
      }
    }

    // ─── Buildings ──────────────────────────────
    const buildColors = [0x0a0a1a, 0x0d0d22, 0x080818, 0x0b0b20]
    const windowColors = [0x223355, 0x334466, 0x112244, 0x445577]
    for (const side of [-1, 1]) {
      for (let i = 0; i < 35; i++) {
        const bH = 4 + Math.sin(i * 2.7) * 5 + Math.random() * 4
        const bW = 2.5 + Math.random() * 2
        const bD = 3 + Math.random() * 3
        const bMat = new THREE.MeshStandardMaterial({
          color: buildColors[i % buildColors.length],
          roughness: 0.8,
          metalness: 0.15
        })
        const bldg = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bD), bMat)
        const xPos = side * (8.5 + Math.random() * 5)
        bldg.position.set(xPos, bH / 2, -i * 7 - Math.random() * 5)
        bldg.castShadow = true
        this.scene.add(bldg)
        this.buildings.push(bldg)

        // Windows
        const wMat = new THREE.MeshStandardMaterial({
          color: windowColors[i % windowColors.length],
          emissive: windowColors[i % windowColors.length],
          emissiveIntensity: 1.5 + Math.random() * 1.5,
        })
        const cols = Math.floor(bW / 0.8)
        const rows = Math.floor(bH / 1.2)
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (Math.random() > 0.6) continue
            const win = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.45), wMat)
            win.position.set(
              xPos + (side > 0 ? -bW / 2 - 0.01 : bW / 2 + 0.01),
              1 + r * 1.1,
              bldg.position.z - bD / 2 + 0.5 + c * 0.9
            )
            win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
            this.scene.add(win)
          }
        }

        // Street lamp between buildings
        if (Math.random() > 0.5) {
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.06, 3.5, 6),
            new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.8 })
          )
          const lampX = side * (7.5 + Math.random())
          pole.position.set(lampX, 1.75, bldg.position.z)
          this.scene.add(pole)

          const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xffeecc, emissive: 0xffaa44, emissiveIntensity: 3 })
          )
          bulb.position.set(lampX, 3.6, bldg.position.z)
          this.scene.add(bulb)

          const lampLight = new THREE.PointLight(0xffaa44, 0.8, 8)
          lampLight.position.copy(bulb.position)
          this.scene.add(lampLight)
        }
      }
    }

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 300),
      new THREE.MeshStandardMaterial({ color: 0x050510, roughness: 1 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, -0.05, -120)
    this.scene.add(ground)

    // ─── Runner Character ───────────────────────
    this.runner = new THREE.Group()

    // Body — torso with slight taper
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 0.2, roughness: 0.35, metalness: 0.25 })
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.55), torsoMat)
    torso.position.y = 1.3
    torso.castShadow = true
    this.runner.add(torso)
    this.runnerParts.push(torso)

    // Head
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.15 })
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), headMat)
    head.position.y = 2.2
    head.castShadow = true
    this.runner.add(head)
    this.runnerParts.push(head)

    // Hair / helmet
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, emissive: 0x111133, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.4 })
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), helmetMat)
    helmet.position.y = 2.25
    this.runner.add(helmet)

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111122 })
    for (const ex of [-0.13, 0.13]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat)
      eye.position.set(ex, 2.25, 0.3)
      this.runner.add(eye)
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), pupilMat)
      pupil.position.set(ex, 2.25, 0.36)
      this.runner.add(pupil)
    }

    // Mouth — simple smile
    const smileMat = new THREE.MeshStandardMaterial({ color: 0x92400e })
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 4, 8, Math.PI), smileMat)
    smile.position.set(0, 2.1, 0.35)
    smile.rotation.x = Math.PI
    this.runner.add(smile)

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.5, metalness: 0.2 })
    for (const lx of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.28), legMat)
      leg.position.set(lx, 0.42, 0)
      leg.castShadow = true
      this.runner.add(leg)
      this.runnerParts.push(leg)
    }

    // Arms
    const armMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.2 })
    for (const ax of [-0.55, 0.55]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.85, 0.22), armMat)
      arm.position.set(ax, 1.2, 0)
      arm.castShadow = true
      this.runner.add(arm)
      this.runnerParts.push(arm)
    }

    // Shoes
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4, metalness: 0.3 })
    for (const sx of [-0.18, 0.18]) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.38), shoeMat)
      shoe.position.set(sx, 0.06, 0.05)
      this.runner.add(shoe)
    }

    this.runner.position.set(0, 0, 0)
    this.scene.add(this.runner)

    // Trail particles
    for (let i = 0; i < 20; i++) {
      const trail = new THREE.Mesh(
        new THREE.SphereGeometry(0.06 - i * 0.002, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.25 - i * 0.012 })
      )
      trail.position.set(0, 0.5, i * 0.4)
      this.scene.add(trail)
      this.trail.push(trail)
    }

    return true
  }

  start() {
    this.speed = 0.35
    this.frame = 0
    this.currentLane = 1
    this.targetLane = 1
    this.obstacles.forEach(o => this.scene.remove(o.mesh))
    this.coins.forEach(c => this.scene.remove(c.mesh))
    this.particles.forEach(p => this.scene.remove(p.mesh))
    this.obstacles = []
    this.coins = []
    this.particles = []
    this.animate()
  }

  switchLane(dir: number) {
    const newLane = this.targetLane + dir
    if (newLane >= 0 && newLane <= 2) this.targetLane = newLane
  }

  stop() {
    this.alive = false
    cancelAnimationFrame(this.animId)
  }

  getSpeed() { return this.speed }

  private animate = () => {
    if (!this.alive || !THREE) return
    this.animId = requestAnimationFrame(this.animate)

    this.frame++
    this.speed = Math.min(1.4, this.speed + 0.00025)

    // Smooth lane
    const diff = this.targetLane - this.currentLane
    if (Math.abs(diff) > 0.01) this.currentLane += diff * 0.12
    else this.currentLane = this.targetLane

    // Runner movement
    if (this.runner) {
      const tx = this.LANE_X[Math.round(this.targetLane)]
      this.runner.position.x += (tx - this.runner.position.x) * 0.12

      // Animation
      const t = this.frame
      const bob = Math.sin(t * 0.15) * 0.12
      const legSwing = Math.sin(t * 0.15) * 0.4
      // Body bob
      if (this.runnerParts[0]) this.runnerParts[0].position.y = 1.3 + bob
      if (this.runnerParts[1]) this.runnerParts[1].position.y = 2.2 + bob
      // Legs
      if (this.runnerParts[2]) this.runnerParts[2].rotation.x = legSwing
      if (this.runnerParts[3]) this.runnerParts[3].rotation.x = -legSwing
      // Arms
      if (this.runnerParts[4]) this.runnerParts[4].rotation.x = -legSwing
      if (this.runnerParts[5]) this.runnerParts[5].rotation.x = legSwing
    }

    // Move obstacles
    for (const obs of this.obstacles) {
      obs.z += this.speed
      obs.mesh.position.z = obs.z
    }
    this.obstacles = this.obstacles.filter(o => {
      if (o.z > 15) { this.scene.remove(o.mesh); return false }
      return true
    })

    // Move coins
    for (const c of this.coins) {
      c.z += this.speed
      c.mesh.position.z = c.z
      c.mesh.rotation.y += 0.06
      c.mesh.rotation.x += 0.02
    }
    this.coins = this.coins.filter(c => {
      if (c.z > 15) { this.scene.remove(c.mesh); return false }
      return true
    })

    // Spawn obstacles
    const minGap = Math.max(10, 22 - this.speed * 10)
    if (this.frame > 80 && Math.random() < 0.02 + this.speed * 0.008) {
      const furthest = this.obstacles.length > 0 ? Math.min(...this.obstacles.map(o => o.z)) : 0
      if (furthest < -minGap) this.spawnObstacle()
    }

    // Spawn coins
    if (this.frame % 20 === 0 && Math.random() < 0.45) {
      const furthest = this.coins.length > 0 ? Math.min(...this.coins.map(c => c.z)) : 0
      if (furthest < -12) this.spawnCoin()
    }

    // Collision detection
    const runnerLane = Math.round(this.currentLane)
    for (const obs of this.obstacles) {
      if (obs.hit) continue
      if (Math.abs(obs.z) < 1.5 && obs.lane === runnerLane) {
        obs.hit = true
        this.onHit()
        this.spawnParticles(obs.mesh.position.x, 1.5, 0xef4444, 12)
      }
    }
    for (const c of this.coins) {
      if (c.collected) continue
      if (Math.abs(c.z) < 1.5 && c.lane === runnerLane) {
        c.collected = true
        this.onCoin()
        this.spawnParticles(c.mesh.position.x, 1.5, 0xffd700, 6)
      }
    }

    // Quiz trigger
    if (this.frame > 350 && this.frame % 500 === 0) {
      this.onQuiz()
    }

    // Trail
    for (let i = 0; i < this.trail.length; i++) {
      const tr = this.trail[i]
      if (this.runner) {
        tr.position.x = this.runner.position.x + (Math.random() - 0.5) * 0.08
        tr.position.z = i * 0.35
        tr.position.y = 0.5 + Math.sin(this.frame * 0.1 + i) * 0.08
      }
      tr.material.opacity = 0.25 - i * 0.012
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.mesh.position.x += p.vx
      p.mesh.position.y += p.vy
      p.mesh.position.z += p.vz
      p.vy -= 0.006
      p.life -= 0.02
      p.mesh.material.opacity = p.life
      p.mesh.material.transparent = true
      if (p.life <= 0) { this.scene.remove(p.mesh); this.particles.splice(i, 1) }
    }

    // Camera bob
    this.camera.position.x += (0 - this.camera.position.x) * 0.05
    this.camera.position.y = 6 + Math.sin(this.frame * 0.08) * 0.15

    // Render
    this.renderer.render(this.scene, this.camera)
  }

  private spawnObstacle() {
    if (!THREE) return
    const lane = Math.floor(Math.random() * 3)
    const types = ['crate', 'barrier', 'spike']
    const type = types[Math.floor(Math.random() * types.length)]
    let mesh: any

    if (type === 'crate') {
      const s = 0.9 + Math.random() * 0.4
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.5 })
      )
      mesh.castShadow = true
    } else if (type === 'barrier') {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 2, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xff6b00, emissive: 0xff4400, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.5 })
      )
      mesh.castShadow = true
      const sMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xffaa00, emissiveIntensity: 1 })
      for (let s = -0.8; s <= 0.8; s += 0.5) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.42), sMat)
        stripe.position.set(s, 0, 0)
        mesh.add(stripe)
      }
    } else {
      mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.65, 1.8, 4),
        new THREE.MeshStandardMaterial({ color: 0xaa00ff, emissive: 0x7700cc, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.7 })
      )
      mesh.castShadow = true
    }

    mesh.position.set(this.LANE_X[lane], type === 'spike' ? 0.9 : 1, -130)
    this.scene.add(mesh)
    this.obstacles.push({ mesh, lane, z: -130, type, hit: false })
  }

  private spawnCoin() {
    if (!THREE) return
    const lane = Math.floor(Math.random() * 3)
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 1.5, roughness: 0.15, metalness: 0.9 })
    )
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(this.LANE_X[lane], 1.5, -130)
    this.scene.add(mesh)
    this.coins.push({ mesh, lane, z: -130, collected: false })
  }

  private spawnParticles(x: number, y: number, z: number, color: number, count: number) {
    if (!THREE) return
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 4, 4),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3 })
      )
      mesh.position.set(x, y, z)
      this.scene.add(mesh)
      this.particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 0.35,
        vy: Math.random() * 0.25 + 0.08,
        vz: (Math.random() - 0.5) * 0.35,
        life: 1,
      })
    }
  }

  dispose() {
    this.alive = false
    cancelAnimationFrame(this.animId)
    if (this.renderer) {
      this.renderer.dispose()
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement)
      }
    }
    if (this.scene) {
      this.scene.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose())
          else obj.material.dispose()
        }
      })
    }
  }
}

// ─── Main Component ───────────────────────────────────────────────────

function GameInner() {
  const params = useParams()
  const router = useRouter()
  const resourceId = Number(params.id)
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<RunnerEngine | null>(null)

  const [resource, setResource] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [threeLoaded, setThreeLoaded] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [gameState, setGameState] = useState<GameState>('loading')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [speed, setSpeed] = useState(0.35)
  const [distance, setDistance] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)

  const currentQ = questions[currentQIndex] || questions[0]

  useEffect(() => {
    libraryApi.getResource(resourceId).then(r => setResource(r.data)).catch(() => {})
    loadThree().then(() => setThreeLoaded(true))
    return () => { engineRef.current?.dispose() }
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
          { question: `What is a key concept in ${resource?.title || 'this material'}?`, options: ['Core Principles', 'Random Guess', 'Skip It', 'None'], correctIndex: 0, explanation: 'Core principles drive understanding.' },
          { question: 'Best method for retention?', options: ['Active Recall', 'Skimming', 'Highlighting', 'Cramming'], correctIndex: 0, explanation: 'Active recall is scientifically proven.' },
          { question: 'How to handle complex topics?', options: ['Break Down Step-by-Step', 'Skip to Easy', 'Memorize', 'Ignore'], correctIndex: 0, explanation: 'Decomposition builds mastery.' },
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

  useEffect(() => { loadQuestions() }, [])

  const startGame = useCallback(async () => {
    if (!containerRef.current) return
    engineRef.current?.dispose()
    const engine = new RunnerEngine()
    engineRef.current = engine

    const ok = await engine.init(containerRef.current, {
      onHit: () => {
        setLives(l => {
          const n = l - 1
          if (soundEnabled) SFX.hit()
          if (n <= 0) setTimeout(() => setGameState('gameover'), 600)
          return n
        })
        setCombo(0)
      },
      onCoin: () => {
        setScore(s => s + 25)
        if (soundEnabled) SFX.coin()
      },
      onQuiz: () => {
        setGameState('quiz')
        setSelectedAnswer(null)
        setShowExplanation(false)
      },
    })

    if (ok) {
      setScore(0); setLives(3); setCombo(0); setMaxCombo(0)
      setCurrentQIndex(0); setDistance(0)
      setSelectedAnswer(null); setShowExplanation(false)
      setGameState('playing')
      engine.start()

      // Speed ticker
      const ticker = setInterval(() => {
        if (engineRef.current) setSpeed(engineRef.current.getSpeed())
      }, 200)
      return () => clearInterval(ticker)
    }
  }, [soundEnabled])

  const handleAnswer = useCallback((idx: number) => {
    if (selectedAnswer !== null) return
    setSelectedAnswer(idx)
    const q = questions[currentQIndex]
    if (!q) return
    if (idx === q.correctIndex) {
      setScore(s => s + 300 * (combo + 1))
      setCombo(c => { const n = c + 1; setMaxCombo(m => Math.max(m, n)); return n })
      if (soundEnabled) SFX.correct()
    } else {
      setCombo(0)
      setLives(l => {
        const n = l - 1
        if (soundEnabled) SFX.wrong()
        if (n <= 0) setTimeout(() => setGameState('gameover'), 800)
        return n
      })
    }
    setShowExplanation(true)
  }, [selectedAnswer, questions, currentQIndex, combo, soundEnabled])

  const advanceAfterQuiz = useCallback(() => {
    setShowExplanation(false); setSelectedAnswer(null)
    if (lives <= 0) { setGameState('gameover'); return }
    if (currentQIndex < questions.length - 1) setCurrentQIndex(i => i + 1)
    else {
      setGameState('victory')
      authApi.awardXp(50, 'Knowledge Runner Victory', resourceId).catch(() => {})
      toast.success('Mission Complete! +50 XP Awarded!')
      return
    }
    setGameState('playing')
  }, [lives, currentQIndex, questions.length, resourceId])

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current
      if (gameState === 'playing' && eng) {
        if (e.key === 'ArrowLeft' || e.key === 'a') eng.switchLane(-1)
        if (e.key === 'ArrowRight' || e.key === 'd') eng.switchLane(1)
        if (e.key === 'Escape') { eng.stop(); setGameState('paused') }
      } else if (gameState === 'paused' && e.key === 'Escape') {
        setGameState('playing'); startGame()
      } else if (gameState === 'quiz' && e.key >= '1' && e.key <= '4') {
        handleAnswer(parseInt(e.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameState, handleAnswer, startGame])

  // Touch
  useEffect(() => {
    let sx = 0
    const onStart = (e: TouchEvent) => { sx = e.touches[0].clientX }
    const onEnd = (e: TouchEvent) => {
      if (gameState !== 'playing') return
      const dx = e.changedTouches[0].clientX - sx
      if (Math.abs(dx) > 40 && engineRef.current) {
        engineRef.current.switchLane(dx < 0 ? -1 : 1)
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd) }
  }, [gameState])

  if (loading || !threeLoaded) {
    return (
      <div className="fixed inset-0 bg-[#030310] flex items-center justify-center text-white z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="font-extrabold text-slate-300 text-lg">
            {loading ? 'Loading questions...' : 'Loading 3D engine...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none z-50">
      {/* 3D Container */}
      <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

      {/* HUD */}
      {(gameState === 'playing' || gameState === 'quiz') && (
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
          <div className="flex items-center justify-between px-4 py-3 bg-black/30 backdrop-blur-sm border-b border-white/5 pointer-events-auto">
            <button onClick={() => { engineRef.current?.stop(); setGameState('paused') }}
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
          <div className="absolute top-16 left-4 px-2 py-1 rounded-lg bg-black/50 text-[10px] font-bold text-slate-400">
            SPEED: {speed.toFixed(1)}x
          </div>
        </div>
      )}

      {/* Mobile */}
      {gameState === 'playing' && (
        <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center gap-3 px-4 md:hidden pointer-events-auto">
          <button onTouchStart={(e) => { e.preventDefault(); engineRef.current?.switchLane(-1) }}
            className="flex-1 py-4 rounded-2xl font-black text-sm border-2 bg-white/5 border-white/10 text-white/60 active:scale-95 active:bg-primary/20 active:border-primary active:text-primary transition-all">⬅️ Left</button>
          <button onTouchStart={(e) => { e.preventDefault(); engineRef.current?.switchLane(1) }}
            className="flex-1 py-4 rounded-2xl font-black text-sm border-2 bg-white/5 border-white/10 text-white/60 active:scale-95 active:bg-primary/20 active:border-primary active:text-primary transition-all">Right ➡️</button>
        </div>
      )}

      {/* Quiz Modal */}
      <AnimatePresence>
        {gameState === 'quiz' && currentQ && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="bg-[#0f172a]/95 border border-primary/30 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-[0_0_80px_rgba(245,158,11,0.15)]">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-amber-400 mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.4)]">
                <Play className="w-8 h-8 text-black fill-black" />
              </div>
              <div>
                <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-[11px] font-black uppercase tracking-widest">3D Knowledge Runner</span>
                <h1 className="text-2xl md:text-3xl font-black text-white mt-2">{resource?.title || 'Quiz Runner'}</h1>
                <p className="text-slate-400 text-sm mt-2">Run through the neon city! Dodge crates, barriers and spikes. Collect coins. Smash quiz gates.</p>
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
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="bg-[#0f172a]/95 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center space-y-5">
              <Pause className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-2xl font-black text-white">PAUSED</h2>
              <button onClick={() => startGame()}
                className="w-full py-3 rounded-xl bg-primary text-black font-black text-sm hover:scale-[1.02] active:scale-95 transition-all">RESUME</button>
              <button onClick={() => { engineRef.current?.dispose(); router.push(`/library/${resourceId}`) }}
                className="w-full py-3 rounded-xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all">EXIT</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over / Victory */}
      <AnimatePresence>
        {(gameState === 'gameover' || gameState === 'victory') && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
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
                <button onClick={() => startGame()}
                  className="flex-1 py-3 rounded-xl bg-primary text-black font-black text-sm hover:scale-[1.02] active:scale-95 transition-all">RUN AGAIN</button>
                <button onClick={() => { engineRef.current?.dispose(); router.push(`/library/${resourceId}`) }}
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

export default function KnowledgeRunnerPage() {
  return <GameInner />
}
