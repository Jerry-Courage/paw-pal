'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { libraryApi, authApi } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Trophy, Heart, Volume2, VolumeX, Award, Pause, MessageSquare, Check, X } from 'lucide-react'
import { toast } from 'sonner'

interface Question {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

interface AnswerRecord {
  question: Question
  selectedIndex: number
  correct: boolean
}

type GameState = 'loading' | 'intro' | 'warmup' | 'boss_intro' | 'boss_fight' | 'victory' | 'gameover' | 'paused'

const SFX = {
  correct: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); a.volume = 0.25; a.play() } catch {} },
  wrong: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2658/2658-preview.mp3'); a.volume = 0.25; a.play() } catch {} },
  coin: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'); a.volume = 0.2; a.play() } catch {} },
  hit: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2803/2803-preview.mp3'); a.volume = 0.3; a.play() } catch {} },
  jump: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'); a.volume = 0.15; a.play() } catch {} },
  defeat: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); a.volume = 0.4; a.play() } catch {} },
  fireball: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3'); a.volume = 0.35; a.play() } catch {} },
  bossHit: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2803/2803-preview.mp3'); a.volume = 0.5; a.play() } catch {} },
  bossAppear: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2658/2658-preview.mp3'); a.volume = 0.4; a.play() } catch {} },
  explosion: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2803/2803-preview.mp3'); a.volume = 0.6; a.play() } catch {} },
}

let THREE: typeof import('three') | null = null
let GLTFLoaderRef: any = null
let threeLoaded = false
let threeLoading: Promise<void> | null = null

async function ensureThree() {
  if (threeLoaded && THREE) return
  if (threeLoading) { await threeLoading; return }
  threeLoading = Promise.all([
    import('three').then(mod => { THREE = mod }),
    import('three/addons/loaders/GLTFLoader.js').then(mod => { GLTFLoaderRef = mod.GLTFLoader }),
  ]).then(() => { threeLoaded = true }).catch(e => { console.error('Three.js load failed:', e); threeLoading = null })
  await threeLoading
}

class CityRunEngine {
  private scene: any = null
  private camera: any = null
  private renderer: any = null
  private animId = 0
  private alive = false

  // Runner
  private runnerGroup: any = null
  private runnerParts: Record<string, any> = {}
  private currentLane = 1
  private targetLane = 1
  private isJumping = false
  private jumpVelocity = 0
  private jumpY = 0
  private isSliding = false
  private slideTimer = 0
  private animPhase = 0

  // World
  private worldOffset = 0
  private speed = 0.3
  private baseSpeed = 0.3
  private frame = 0
  private trackPlanks: any[] = []
  private obstacles: { mesh: any; lane: number; z: number; type: string; hit: boolean; jumpable: boolean }[] = []
  private coins: { mesh: any; lane: number; z: number; collected: boolean }[] = []
  private particles: { mesh: any; vx: number; vy: number; vz: number; life: number }[] = []

  private LANE_X = [-3, 0, 3]
  private onHit: () => void = () => {}
  private onCoin: () => void = () => {}
  private invincible = false
  private invincibleTimer = 0
  private isMobile = false
  private lowQuality = false
  private mixer: any = null
  private runAction: any = null

  // Boss system
  bossGroup: any = null
  fireballs: { mesh: any; vz: number; life: number }[] = []
  bossProjectiles: { mesh: any; vz: number; life: number }[] = []
  bossHealth = 3
  bossActive = false
  bossArrived = false
  private bossTargetZ = -12
  private bossFlashTimer = 0
  private bossOriginalColors: Map<any, any> = new Map()
  private spawnObstaclesActive = true

  onBossReady: () => void = () => {}
  onBossDefeated: () => void = () => {}
  onPlayerHitByBoss: () => void = () => {}

  async init(container: HTMLElement, cbs: { onHit: () => void; onCoin: () => void }) {
    await ensureThree()
    if (!THREE) return false
    this.onHit = cbs.onHit
    this.onCoin = cbs.onCoin
    this.alive = true
    this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.innerWidth < 768)
    this.lowQuality = this.isMobile || (navigator.hardwareConcurrency || 4) <= 4

    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb)
    this.scene.fog = new THREE.Fog(0x87ceeb, 40, 120)

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 200)
    this.camera.position.set(0, 5, 10)
    this.camera.lookAt(0, 1.5, -15)

    this.renderer = new THREE.WebGLRenderer({ antialias: !this.lowQuality })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(this.lowQuality ? 1 : Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = !this.lowQuality
    if (!this.lowQuality) {
      this.renderer.shadowMap.type = 2
    }
    this.renderer.toneMapping = 4
    this.renderer.toneMappingExposure = 1.4
    container.appendChild(this.renderer.domElement)

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.8)
    sun.position.set(10, 20, 10)
    if (!this.lowQuality) {
      sun.castShadow = true
      sun.shadow.mapSize.set(1024, 1024)
      sun.shadow.camera.near = 1
      sun.shadow.camera.far = 80
      sun.shadow.camera.left = -20
      sun.shadow.camera.right = 20
      sun.shadow.camera.top = 20
      sun.shadow.camera.bottom = -20
    }
    this.scene.add(sun)
    const fill = new THREE.DirectionalLight(0xaaddff, 0.4)
    fill.position.set(-5, 5, -5)
    this.scene.add(fill)

    // Ground
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4a8c3f, roughness: 0.9 })
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(120, 300), grassMat)
    grass.rotation.x = -Math.PI / 2
    grass.position.set(0, -0.05, -100)
    grass.receiveShadow = true
    this.scene.add(grass)

    // Track
    const gravelMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.85 })
    const gravel = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 300), gravelMat)
    gravel.position.set(0, 0, -100)
    gravel.receiveShadow = true
    this.scene.add(gravel)

    const railMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 })
    for (const rx of [-2.2, 2.2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 300), railMat)
      rail.position.set(rx, 0.12, -100)
      rail.castShadow = true
      this.scene.add(rail)
    }

    const tieMat = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.8 })
    const plankCount = this.lowQuality ? 30 : 80
    for (let i = 0; i < plankCount; i++) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 0.3), tieMat)
      tie.position.set(0, 0.04, -i * 3.5)
      tie.receiveShadow = true
      this.scene.add(tie)
      this.trackPlanks.push(tie)
    }

    const markerMat = new THREE.MeshStandardMaterial({ color: 0xdddd44, emissive: 0xcccc22, emissiveIntensity: 0.3 })
    const markerCount = this.lowQuality ? 20 : 50
    for (let i = 0; i < markerCount; i++) {
      for (const mx of [-1.5, 1.5]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 1.5), markerMat)
        m.position.set(mx, 0.16, -i * 5)
        this.scene.add(m)
        this.trackPlanks.push(m)
      }
    }

    // Trees
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 })
    const treeLeafMats = [
      new THREE.MeshStandardMaterial({ color: 0x2d7a2d, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x3a8c3a, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x1d6a1d, roughness: 0.7 }),
    ]
    const treeCount = this.lowQuality ? 15 : 40
    for (const side of [-1, 1]) {
      for (let i = 0; i < treeCount; i++) {
        const treeGroup = new THREE.Group()
        const trunkH = 1.5 + Math.random() * 1.5
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, trunkH, 6), treeTrunkMat)
        trunk.position.y = trunkH / 2
        trunk.castShadow = true
        treeGroup.add(trunk)
        const leafMat = treeLeafMats[i % 3]
        const leafH = 2 + Math.random() * 2
        const leafR = 1 + Math.random() * 0.8
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(leafR, leafH, 6), leafMat)
        leaves.position.y = trunkH + leafH * 0.35
        leaves.castShadow = true
        treeGroup.add(leaves)
        if (Math.random() > 0.4) {
          const topLeaf = new THREE.Mesh(new THREE.ConeGeometry(leafR * 0.6, leafH * 0.6, 6), leafMat)
          topLeaf.position.y = trunkH + leafH * 0.7
          topLeaf.castShadow = true
          treeGroup.add(topLeaf)
        }
        treeGroup.position.set(side * (7 + Math.random() * 15), 0, -i * 6 - Math.random() * 4)
        this.scene.add(treeGroup)
      }
    }

    // Runner Character
    this.runnerGroup = new THREE.Group()

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0b080, roughness: 0.5 })
    const darkSkinMat = new THREE.MeshStandardMaterial({ color: 0xd4956a, roughness: 0.5 })

    // Shoes
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    const shoeAccent = new THREE.MeshStandardMaterial({ color: 0x2288cc, roughness: 0.4 })
    for (const sx of [-0.15, 0.15]) {
      const shoe = new THREE.Group()
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.34), new THREE.MeshStandardMaterial({ color: 0x333333 }))
      sole.position.y = 0.03
      shoe.add(sole)
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.32), shoeMat)
      upper.position.y = 0.12
      shoe.add(upper)
      const accent = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.04, 0.15), shoeAccent)
      accent.position.set(0, 0.1, 0.08)
      shoe.add(accent)
      shoe.position.set(sx, 0.48, 0.02)
      this.runnerGroup.add(shoe)
      this.runnerParts[`shoe${sx > 0 ? 'R' : 'L'}`] = shoe
    }

    // Legs
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.5 })
    const pantsLight = new THREE.MeshStandardMaterial({ color: 0x2a52bb, roughness: 0.5 })
    for (const lx of [-0.15, 0.15]) {
      const leg = new THREE.Group()
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.24), pantsMat)
      upper.position.y = 0.5
      leg.add(upper)
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.22), pantsLight)
      lower.position.y = 0.25
      leg.add(lower)
      leg.position.set(lx, 0, 0)
      this.runnerGroup.add(leg)
      this.runnerParts[`leg${lx > 0 ? 'R' : 'L'}`] = leg
    }

    // Body
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x22883a, roughness: 0.5 })
    const shirtDark = new THREE.MeshStandardMaterial({ color: 0x1a6e2e, roughness: 0.5 })
    const torso = new THREE.Group()
    const shirtFront = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 0.35), shirtMat)
    torso.add(shirtFront)
    const shirtBack = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 0.35), shirtDark)
    shirtBack.position.set(0, 0, -0.35)
    torso.add(shirtBack)
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.15), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }))
    collar.position.set(0, 0.4, 0.1)
    torso.add(collar)
    torso.position.y = 1.55
    this.runnerGroup.add(torso)
    this.runnerParts.torso = torso

    // Backpack
    const packMat = new THREE.MeshStandardMaterial({ color: 0x3344aa, roughness: 0.4 })
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.22), packMat)
    pack.position.set(0, 1.6, -0.3)
    this.runnerGroup.add(pack)
    const packFlap = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.23), new THREE.MeshStandardMaterial({ color: 0x2233aa }))
    packFlap.position.set(0, 1.88, -0.3)
    this.runnerGroup.add(packFlap)
    for (const sx of [-0.12, 0.12]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.04), packMat)
      strap.position.set(sx, 1.7, -0.16)
      this.runnerGroup.add(strap)
    }

    // Arms
    const armMat = new THREE.MeshStandardMaterial({ color: 0xf0b080, roughness: 0.5 })
    for (const ax of [-0.42, 0.42]) {
      const arm = new THREE.Group()
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.16), shirtMat)
      sleeve.position.y = 0.35
      arm.add(sleeve)
      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), armMat)
      forearm.position.y = 0.1
      arm.add(forearm)
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), darkSkinMat)
      hand.position.y = -0.05
      arm.add(hand)
      arm.position.set(ax, 1.55, 0)
      this.runnerGroup.add(arm)
      this.runnerParts[`arm${ax > 0 ? 'R' : 'L'}`] = arm
    }

    // Head
    const headGroup = new THREE.Group()
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), skinMat)
    headMesh.castShadow = true
    headGroup.add(headMesh)

    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.6 })
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat)
    hair.position.y = 0.03
    headGroup.add(hair)

    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff })
    const eyePupil = new THREE.MeshStandardMaterial({ color: 0x1a1a2e })
    const eyeIris = new THREE.MeshStandardMaterial({ color: 0x3a2510 })
    for (const ex of [-0.1, 0.1]) {
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeWhite)
      ew.position.set(ex, 0.04, 0.22)
      headGroup.add(ew)
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeIris)
      iris.position.set(ex, 0.04, 0.25)
      headGroup.add(iris)
      const ep = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), eyePupil)
      ep.position.set(ex, 0.04, 0.27)
      headGroup.add(ep)
    }

    const browMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e })
    for (const bx of [-0.1, 0.1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.03), browMat)
      brow.position.set(bx, 0.12, 0.23)
      headGroup.add(brow)
    }

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), darkSkinMat)
    nose.position.set(0, -0.02, 0.28)
    headGroup.add(nose)

    const mouthMat = new THREE.MeshStandardMaterial({ color: 0xcc6655 })
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), mouthMat)
    mouth.position.set(0, -0.08, 0.26)
    headGroup.add(mouth)

    const capMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.4 })
    const capDome = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.18, 16), capMat)
    capDome.position.y = 0.22
    headGroup.add(capDome)
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.2), capMat)
    brim.position.set(0, 0.15, 0.2)
    headGroup.add(brim)

    headGroup.position.y = 2.25
    this.runnerGroup.add(headGroup)
    this.runnerParts.head = headGroup

    this.runnerGroup.position.set(0, 0, 0)
    this.scene.add(this.runnerGroup)

    this.loadGLBModel()

    const onResize = () => {
      const nw = container.clientWidth || window.innerWidth
      const nh = container.clientHeight || window.innerHeight
      this.camera.aspect = nw / nh
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(nw, nh)
    }
    window.addEventListener('resize', onResize)
    ;(this as any)._onResize = onResize

    return true
  }

  start() {
    this.speed = 0.3
    this.baseSpeed = 0.3
    this.frame = 0
    this.currentLane = 1
    this.targetLane = 1
    this.isJumping = false
    this.jumpVelocity = 0
    this.jumpY = 0
    this.isSliding = false
    this.slideTimer = 0
    this.invincible = false
    this.invincibleTimer = 0
    this.bossActive = false
    this.bossArrived = false
    this.bossHealth = 3
    this.spawnObstaclesActive = true
    this.bossOriginalColors.clear()
    this.obstacles.forEach(o => this.scene.remove(o.mesh))
    this.coins.forEach(c => this.scene.remove(c.mesh))
    this.particles.forEach(p => this.scene.remove(p.mesh))
    this.fireballs.forEach(f => this.scene.remove(f.mesh))
    this.bossProjectiles.forEach(bp => this.scene.remove(bp.mesh))
    if (this.bossGroup) { this.scene.remove(this.bossGroup); this.bossGroup = null }
    this.obstacles = []
    this.coins = []
    this.particles = []
    this.fireballs = []
    this.bossProjectiles = []
    this.worldOffset = 0

    for (let i = 0; i < 5; i++) {
      this.spawnObstacle()
      const last = this.obstacles[this.obstacles.length - 1]
      if (last) { last.z = -20 - i * 18; last.mesh.position.z = last.z }
    }
    this.run()
  }

  setQuizActive(active: boolean) {
    if (active) {
      this.baseSpeed = Math.max(0.15, this.speed * 0.4)
    } else {
      this.baseSpeed = Math.min(1.2, 0.3 + this.worldOffset * 0.0001)
    }
  }

  grantInvincibility(frames: number = 60) {
    this.invincible = true
    this.invincibleTimer = frames
  }

  destroyAllObstacles() {
    for (const obs of this.obstacles) {
      this.spawnParticles(obs.mesh.position.x, 1.5, obs.z, 0x44ff44, 8)
      this.scene.remove(obs.mesh)
    }
    this.obstacles = []
  }

  clearObstacles() {
    this.spawnObstaclesActive = false
    for (const obs of this.obstacles) {
      this.spawnParticles(obs.mesh.position.x, 1.5, obs.z, 0x44ff44, 8)
      this.scene.remove(obs.mesh)
    }
    this.obstacles = []
    for (const c of this.coins) {
      this.spawnParticles(c.mesh.position.x, 1.5, c.z, 0xffd700, 4)
      this.scene.remove(c.mesh)
    }
    this.coins = []
  }

  spawnBoss() {
    if (!THREE) return
    const group = new THREE.Group()

    // Body — large dark red/purple mass
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5a0a2e, roughness: 0.3, metalness: 0.4 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 2.5), bodyMat)
    body.position.y = 2.5
    body.castShadow = true
    group.add(body)
    this.bossOriginalColors.set(body, bodyMat.color.clone())

    // Chest plate
    const chestMat = new THREE.MeshStandardMaterial({ color: 0x7a1a4e, roughness: 0.3, metalness: 0.5 })
    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 0.3), chestMat)
    chest.position.set(0, 3, 1.3)
    group.add(chest)

    // Head
    const headMat = new THREE.MeshStandardMaterial({ color: 0x4a0a28, roughness: 0.3, metalness: 0.3 })
    const head = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 1.8), headMat)
    head.position.set(0, 5.5, 0)
    head.castShadow = true
    group.add(head)
    this.bossOriginalColors.set(head, headMat.color.clone())

    // Eyes — glowing yellow/red
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff4400, emissiveIntensity: 2 })
    for (const ex of [-0.5, 0.5]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), eyeMat)
      eye.position.set(ex, 5.7, 0.9)
      group.add(eye)
      // Eye glow
      const glowMat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 3, transparent: true, opacity: 0.5 })
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), glowMat)
      glow.position.set(ex, 5.7, 0.8)
      group.add(glow)
    }

    // Horns / Spikes on top
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x880044, emissive: 0x440022, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 })
    for (const hx of [-0.6, 0, 0.6]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.2, 6), hornMat)
      horn.position.set(hx, 6.5, -0.2)
      horn.rotation.z = hx > 0 ? -0.2 : hx < 0 ? 0.2 : 0
      group.add(horn)
    }
    // Side spikes
    for (const sx of [-1.7, 1.7]) {
      for (const sy of [1.5, 2.5]) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 4), hornMat)
        spike.position.set(sx, sy + 2, 0)
        spike.rotation.z = sx > 0 ? -Math.PI / 3 : Math.PI / 3
        group.add(spike)
      }
    }

    // Arms — large blocky
    const armMat = new THREE.MeshStandardMaterial({ color: 0x3a0a1e, roughness: 0.4, metalness: 0.3 })
    for (const ax of [-2.2, 2.2]) {
      const arm = new THREE.Group()
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), armMat)
      upper.position.y = -1
      arm.add(upper)
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), hornMat)
      fist.position.y = -2.2
      arm.add(fist)
      arm.position.set(ax, 3.5, 0)
      group.add(arm)
    }

    // Dark aura ring
    const auraMat = new THREE.MeshStandardMaterial({ color: 0xaa0044, emissive: 0x880022, emissiveIntensity: 1.5, transparent: true, opacity: 0.4, side: 2 })
    const aura = new THREE.Mesh(new THREE.TorusGeometry(3, 0.15, 8, 32), auraMat)
    aura.rotation.x = Math.PI / 2
    aura.position.y = 3
    group.add(aura)

    // Second aura ring
    const aura2 = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.1, 8, 24), auraMat.clone())
    aura2.rotation.x = Math.PI / 3
    aura2.rotation.y = Math.PI / 4
    aura2.position.y = 4
    group.add(aura2)

    // Legs
    for (const lx of [-0.7, 0.7]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), armMat)
      leg.position.set(lx, 0, 0)
      group.add(leg)
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 1.2), hornMat)
      foot.position.set(lx, -0.2, 0.2)
      group.add(foot)
    }

    group.position.set(0, 0, this.bossTargetZ - 40)
    this.scene.add(group)
    this.bossGroup = group
    this.bossActive = true
    this.bossHealth = 3
    this.bossArrived = false
  }

  throwFireball(count: number) {
    if (!THREE) return
    const runnerX = this.runnerGroup ? this.runnerGroup.position.x : 0
    const runnerY = this.runnerGroup ? Math.max(this.jumpY + 1.5, 1.5) : 1.5
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (!THREE || !this.alive) return
        const fbGroup = new THREE.Group()
        // Core — bright white-hot center
        const coreMat = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffff00, emissiveIntensity: 5 })
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), coreMat)
        fbGroup.add(core)
        // Inner flame — orange
        const innerMat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff6600, emissiveIntensity: 4, transparent: true, opacity: 0.9 })
        const inner = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), innerMat)
        fbGroup.add(inner)
        // Outer flame — red/orange
        const outerMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 3, transparent: true, opacity: 0.6 })
        const outer = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), outerMat)
        fbGroup.add(outer)
        // Glow halo
        const glowMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 2, transparent: true, opacity: 0.35, side: 2 })
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), glowMat)
        fbGroup.add(glow)
        // Flame trail particles
        for (let t = 0; t < 5; t++) {
          const trailMat = new THREE.MeshStandardMaterial({ color: t < 2 ? 0xff6600 : 0xff2200, emissive: 0xff4400, emissiveIntensity: 2, transparent: true, opacity: 0.5 - t * 0.08 })
          const trail = new THREE.Mesh(new THREE.SphereGeometry(0.18 - t * 0.03, 6, 6), trailMat)
          trail.position.z = 0.4 + t * 0.3
          fbGroup.add(trail)
        }
        fbGroup.position.set(runnerX + (Math.random() - 0.5) * 0.5, runnerY + (Math.random() - 0.5) * 0.3, -2)
        this.scene.add(fbGroup)
        this.fireballs.push({ mesh: fbGroup, vz: -1.8, life: 200 })
        if (i === 0) SFX.fireball()
      }, i * 250)
    }
  }

  bossAttack() {
    if (!THREE) return
    for (let i = 0; i < 2; i++) {
      setTimeout(() => {
        if (!THREE || !this.alive || !this.bossGroup) return
        const projGroup = new THREE.Group()
        const coreMat = new THREE.MeshStandardMaterial({ color: 0xff0044, emissive: 0xff0022, emissiveIntensity: 3 })
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), coreMat)
        projGroup.add(core)
        const glowMat = new THREE.MeshStandardMaterial({ color: 0xff2266, emissive: 0xff0044, emissiveIntensity: 2, transparent: true, opacity: 0.6 })
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), glowMat)
        projGroup.add(glow)
        const bossX = this.bossGroup.position.x
        const bossY = this.bossGroup.position.y + 3
        projGroup.position.set(bossX + (i === 0 ? -0.5 : 0.5), bossY, this.bossGroup.position.z + 2)
        this.scene.add(projGroup)
        this.bossProjectiles.push({ mesh: projGroup, vz: 0.8, life: 200 })
      }, i * 250)
    }
    SFX.fireball()
  }

  private loadGLBModel() {
    if (!THREE || !GLTFLoaderRef) return
    const loader = new GLTFLoaderRef()
    loader.load('/dancing_running_man.glb', (gltf: any) => {
      if (this.runnerGroup) this.scene.remove(this.runnerGroup)
      if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null }

      const model = gltf.scene
      const box = new THREE!.Box3().setFromObject(model)
      const size = box.getSize(new THREE!.Vector3())
      const height = size.y
      const scale = 2.5 / height
      model.scale.setScalar(scale)
      model.rotation.y = Math.PI
      const center = box.getCenter(new THREE!.Vector3())
      model.position.set(0, -center.y * scale + (height * scale) / 2, 0)
      model.traverse((child: any) => {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true }
      })

      this.runnerGroup = model as any
      this.scene.add(this.runnerGroup)

      if (gltf.animations && gltf.animations.length > 0) {
        this.mixer = new THREE!.AnimationMixer(this.runnerGroup)
        const runNames = ['run', 'running', 'jog', 'sprint', 'runloop', 'runcycle', 'walk']
        let clip = gltf.animations.find((a: any) => runNames.some(n => a.name.toLowerCase().includes(n)))
        if (!clip) clip = gltf.animations[0]
        this.runAction = this.mixer.clipAction(clip)
        this.runAction.play()
      }
      this.runnerParts = {}
    }, undefined, (err: any) => {
      console.warn('GLB load failed, using box runner:', err)
    })
  }

  switchLane(dir: number) {
    const n = this.targetLane + dir
    if (n >= 0 && n <= 2) this.targetLane = n
  }

  jump() {
    if (!this.isJumping && !this.isSliding) {
      this.isJumping = true
      this.jumpVelocity = 0.3
      SFX.jump()
    }
  }

  slide() {
    if (!this.isSliding && !this.isJumping) {
      this.isSliding = true
      this.slideTimer = 30
    }
  }

  stop() {
    this.alive = false
    cancelAnimationFrame(this.animId)
    if ((this as any)._onResize) window.removeEventListener('resize', (this as any)._onResize)
  }

  getSpeed() { return this.speed }

  private run = () => {
    if (!this.alive || !THREE) return
    this.animId = requestAnimationFrame(this.run)

    this.frame++
    this.speed += (this.baseSpeed - this.speed) * 0.05
    this.baseSpeed = Math.min(1.2, this.baseSpeed + 0.00015)
    this.worldOffset += this.speed
    this.animPhase += this.speed * 2

    const diff = this.targetLane - this.currentLane
    if (Math.abs(diff) > 0.01) this.currentLane += diff * 0.25
    else this.currentLane = this.targetLane

    if (this.isJumping) {
      this.jumpY += this.jumpVelocity
      this.jumpVelocity -= 0.012
      if (this.jumpY <= 0) { this.jumpY = 0; this.isJumping = false; this.jumpVelocity = 0 }
    }
    if (this.isSliding) {
      this.slideTimer--
      if (this.slideTimer <= 0) this.isSliding = false
    }

    // Runner animation
    if (this.runnerGroup) {
      const tx = this.LANE_X[this.targetLane]
      this.runnerGroup.position.x += (tx - this.runnerGroup.position.x) * 0.15
      this.runnerGroup.position.y = this.jumpY
      if (this.isSliding) {
        this.runnerGroup.scale.y = 0.5
        this.runnerGroup.position.y = Math.max(this.jumpY, 0)
      } else {
        this.runnerGroup.scale.y += (1 - this.runnerGroup.scale.y) * 0.2
      }

      if (this.mixer) {
        this.mixer.update(1 / 60)
      }

      if (!this.mixer) {
        const t = this.animPhase
        const bob = Math.sin(t) * 0.06
        const legSwing = Math.sin(t) * 0.6
        const armSwing = Math.sin(t) * 0.7

        if (this.runnerParts.torso) this.runnerParts.torso.position.y = 1.55 + bob
        if (this.runnerParts.head) this.runnerParts.head.position.y = 2.25 + bob
        if (this.runnerParts.legL) this.runnerParts.legL.rotation.x = this.isSliding ? 0.8 : legSwing
        if (this.runnerParts.legR) this.runnerParts.legR.rotation.x = this.isSliding ? -0.3 : -legSwing
        if (this.runnerParts.shoeL) this.runnerParts.shoeL.rotation.x = this.isSliding ? 0.6 : legSwing * 0.5
        if (this.runnerParts.shoeR) this.runnerParts.shoeR.rotation.x = this.isSliding ? -0.2 : -legSwing * 0.5
        if (this.runnerParts.armL) this.runnerParts.armL.rotation.x = this.isSliding ? 0.3 : -armSwing
        if (this.runnerParts.armR) this.runnerParts.armR.rotation.x = this.isSliding ? -0.3 : armSwing
      }
    }

    // Move track
    for (const plank of this.trackPlanks) {
      plank.position.z += this.speed
      if (plank.position.z > 15) plank.position.z -= 280
    }

    // Move obstacles
    if (this.spawnObstaclesActive) {
      for (const obs of this.obstacles) {
        obs.z += this.speed
        obs.mesh.position.z = obs.z
      }
      this.obstacles = this.obstacles.filter(o => {
        if (o.z > 12) { this.scene.remove(o.mesh); return false }
        return true
      })
    }

    // Move coins
    for (const c of this.coins) {
      c.z += this.speed
      c.mesh.position.z = c.z
      c.mesh.rotation.y += 0.06
    }
    this.coins = this.coins.filter(c => {
      if (c.z > 12) { this.scene.remove(c.mesh); return false }
      return true
    })

    // Spawn obstacles (only during warmup, stop at ~480 frames = 8s)
    if (this.spawnObstaclesActive) {
      const gap = Math.max(10, 18 - this.speed * 5)
      if (this.frame > 20 && Math.random() < 0.05 + this.speed * 0.02) {
        const far = this.obstacles.length > 0 ? Math.min(...this.obstacles.map(o => o.z)) : -999
        if (far < -gap) this.spawnObstacle()
      }
      if (this.frame % 10 === 0 && Math.random() < 0.6) {
        const far = this.coins.length > 0 ? Math.min(...this.coins.map(c => c.z)) : -999
        if (far < -6) this.spawnCoin()
      }
    }

    // Collision — obstacles
    const rl = this.targetLane
    if (this.invincible) {
      this.invincibleTimer--
      if (this.invincibleTimer <= 0) this.invincible = false
      if (this.runnerGroup) this.runnerGroup.visible = Math.floor(this.frame / 3) % 2 === 0
    } else {
      if (this.runnerGroup) this.runnerGroup.visible = true
    }
    for (const obs of this.obstacles) {
      if (obs.hit) continue
      if (Math.abs(obs.z) < 1.5 && obs.lane === rl) {
        if (obs.jumpable && this.jumpY > 1.2) continue
        if (!obs.jumpable && this.isSliding) continue
        obs.hit = true
        this.invincible = true
        this.invincibleTimer = 60
        this.onHit()
        this.spawnParticles(obs.mesh.position.x, 1.5, 0, 0xff4444, 10)
      }
    }

    // Collision — coins
    for (const c of this.coins) {
      if (c.collected) continue
      if (Math.abs(c.z) < 1.5 && c.lane === rl) {
        c.collected = true
        this.onCoin()
        this.spawnParticles(c.mesh.position.x, 1.8, 0, 0xffd700, 6)
      }
    }

    // Boss logic
    if (this.bossActive && this.bossGroup) {
      // Move boss toward player
      if (!this.bossArrived) {
        const bossZ = this.bossGroup.position.z
        const targetZ = this.bossTargetZ
        if (bossZ > targetZ) {
          this.bossGroup.position.z -= 0.15
        } else {
          this.bossGroup.position.z = targetZ
          this.bossArrived = true
          this.onBossReady()
        }
      }

      // Boss intimidation animation
      if (this.bossArrived) {
        this.bossGroup.position.y = Math.sin(this.frame * 0.05) * 0.5
        this.bossGroup.rotation.y = Math.sin(this.frame * 0.03) * 0.15
      }

      // Aura rotation
      this.bossGroup.children.forEach((child: any) => {
        if (child.geometry?.type === 'TorusGeometry') {
          child.rotation.z += 0.02
        }
      })

      // Boss flash when hit
      if (this.bossFlashTimer > 0) {
        this.bossFlashTimer--
        this.bossGroup.traverse((child: any) => {
          if (child.isMesh && this.bossOriginalColors.has(child)) {
            child.material.color.setHex(0xffffff)
            child.material.emissive?.setHex(0xffffff)
            child.material.emissiveIntensity = 2
          }
        })
        if (this.bossFlashTimer <= 0) {
          this.bossGroup.traverse((child: any) => {
            if (child.isMesh && this.bossOriginalColors.has(child)) {
              child.material.color.copy(this.bossOriginalColors.get(child))
              child.material.emissive?.setHex(0x000000)
              child.material.emissiveIntensity = 1
            }
          })
        }
      }

      // Boss defeated
      if (this.bossHealth <= 0) {
        // Explosion particles
        const bx = this.bossGroup.position.x
        const by = this.bossGroup.position.y + 3
        const bz = this.bossGroup.position.z
        for (let i = 0; i < 40; i++) {
          this.spawnParticles(
            bx + (Math.random() - 0.5) * 4,
            by + (Math.random() - 0.5) * 4,
            bz + (Math.random() - 0.5) * 2,
            [0xff4400, 0xffaa00, 0xff6600, 0xff0000][Math.floor(Math.random() * 4)],
            3
          )
        }
        this.scene.remove(this.bossGroup)
        this.bossGroup = null
        this.bossActive = false
        SFX.explosion()
        this.onBossDefeated()
      }
    }

    // Move fireballs
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i]
      fb.mesh.position.z += fb.vz
      fb.mesh.rotation.y += 0.15
      fb.mesh.rotation.x += 0.08
      fb.life--
      // Emit flame particles behind fireball
      if (fb.life % 3 === 0) {
        this.spawnParticles(
          fb.mesh.position.x + (Math.random() - 0.5) * 0.3,
          fb.mesh.position.y + (Math.random() - 0.5) * 0.3,
          fb.mesh.position.z + 0.5,
          Math.random() > 0.5 ? 0xff6600 : 0xffaa00, 2
        )
      }
      // Check collision with boss
      if (this.bossGroup && this.bossHealth > 0) {
        const dx = Math.abs(fb.mesh.position.x - this.bossGroup.position.x)
        const dz = Math.abs(fb.mesh.position.z - this.bossGroup.position.z)
        const dy = Math.abs(fb.mesh.position.y - (this.bossGroup.position.y + 3))
        if (dx < 2.5 && dz < 2.5 && dy < 3) {
          this.bossHealth--
          this.bossFlashTimer = 10
          this.spawnParticles(fb.mesh.position.x, fb.mesh.position.y, fb.mesh.position.z, 0xff6600, 12)
          this.scene.remove(fb.mesh)
          this.fireballs.splice(i, 1)
          SFX.bossHit()
          continue
        }
      }
      if (fb.life <= 0 || fb.mesh.position.z < -60) {
        this.scene.remove(fb.mesh)
        this.fireballs.splice(i, 1)
      }
    }

    // Move boss projectiles
    for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
      const bp = this.bossProjectiles[i]
      bp.mesh.position.z += bp.vz
      bp.life--
      // Check collision with player
      const runnerX = this.runnerGroup ? this.runnerGroup.position.x : 0
      const runnerY = this.jumpY + 1
      const dx = Math.abs(bp.mesh.position.x - runnerX)
      const dz = Math.abs(bp.mesh.position.z)
      const dy = Math.abs(bp.mesh.position.y - runnerY)
      if (dx < 1.5 && dz < 1.5 && dy < 2) {
        this.scene.remove(bp.mesh)
        this.bossProjectiles.splice(i, 1)
        this.spawnParticles(runnerX, runnerY, 0, 0xff0044, 15)
        this.onPlayerHitByBoss()
        continue
      }
      if (bp.life <= 0 || bp.mesh.position.z > 15) {
        this.scene.remove(bp.mesh)
        this.bossProjectiles.splice(i, 1)
      }
    }

    // Camera
    if (this.bossActive && this.bossArrived) {
      // Zoom camera toward boss slightly
      const targetCamZ = 6
      const targetCamY = 6
      const targetLookY = 3.5
      this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.02
      this.camera.position.y += (targetCamY - this.camera.position.y) * 0.02
      this.camera.position.x += (this.runnerGroup.position.x * 0.2 - this.camera.position.x) * 0.05
      this.camera.lookAt(0, targetLookY, this.bossGroup ? this.bossGroup.position.z + 5 : -10)
    } else {
      this.camera.position.x += (this.runnerGroup.position.x * 0.3 - this.camera.position.x) * 0.05
      this.camera.position.y = 5 + this.jumpY * 0.3 + Math.sin(this.frame * 0.05) * 0.1
      this.camera.lookAt(0, 1.5, -15)
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.mesh.position.x += p.vx
      p.mesh.position.y += p.vy
      p.mesh.position.z += p.vz
      p.vy -= 0.008
      p.life -= 0.025
      p.mesh.material.opacity = p.life
      p.mesh.material.transparent = true
      if (p.life <= 0) { this.scene.remove(p.mesh); this.particles.splice(i, 1) }
    }

    this.renderer.render(this.scene, this.camera)
  }

  private spawnObstacle() {
    if (!THREE) return
    const lane = Math.floor(Math.random() * 3)
    const types = ['barrier', 'crate', 'rock']
    const type = types[Math.floor(Math.random() * types.length)]
    let mesh: any
    let jumpable = false

    if (type === 'barrier') {
      jumpable = true
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 0.8, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xdd6600, roughness: 0.4 })
      )
      mesh.castShadow = true
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffdd00 })
      for (let s = -0.8; s <= 0.8; s += 0.5) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.42), stripeMat)
        st.position.set(s, 0, 0)
        mesh.add(st)
      }
      mesh.position.set(this.LANE_X[lane], 0.5, -45)
    } else if (type === 'crate') {
      jumpable = true
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.5 })
      )
      mesh.castShadow = true
      mesh.position.set(this.LANE_X[lane], 0.55, -45)
    } else {
      jumpable = true
      mesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.6, 0),
        new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7, metalness: 0.2 })
      )
      mesh.castShadow = true
      mesh.position.set(this.LANE_X[lane], 0.6, -45)
    }

    this.scene.add(mesh)
    this.obstacles.push({ mesh, lane, z: -45, type, hit: false, jumpable })
  }

  private spawnCoin() {
    if (!THREE) return
    const lane = Math.floor(Math.random() * 3)
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 1.5, metalness: 0.8, roughness: 0.2 })
    )
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(this.LANE_X[lane], 1.5, -45)
    this.scene.add(mesh)
    this.coins.push({ mesh, lane, z: -45, collected: false })
  }

  private spawnParticles(x: number, y: number, z: number, color: number, count: number) {
    if (!THREE) return
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 })
      )
      mesh.position.set(x, y, z)
      this.scene.add(mesh)
      this.particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 0.3,
        vy: Math.random() * 0.2 + 0.05,
        vz: (Math.random() - 0.5) * 0.3,
        life: 1,
      })
    }
  }

  dispose() {
    this.alive = false
    cancelAnimationFrame(this.animId)
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null }
    if ((this as any)._onResize) window.removeEventListener('resize', (this as any)._onResize)
    if (this.renderer) {
      this.renderer.dispose()
      this.renderer.domElement.remove()
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

// ─── React Component ──────────────────────────────────────────────────

export default function KnowledgeRunnerPage() {
  const params = useParams()
  const router = useRouter()
  const resourceId = Number(params.id)
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<CityRunEngine | null>(null)

  const [resource, setResource] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [engineReady, setEngineReady] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [gameState, setGameState] = useState<GameState>('loading')
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const [questionHistory, setQuestionHistory] = useState<AnswerRecord[]>([])
  const [showReview, setShowReview] = useState(false)
  const [isPortrait, setIsPortrait] = useState(false)
  const [warmupTimer, setWarmupTimer] = useState(8)
  const [questionTimer, setQuestionTimer] = useState(15)
  const [bossIntroTimer, setBossIntroTimer] = useState(3)
  const [bossHealthDisplay, setBossHealthDisplay] = useState(3)
  const [correctAnswers, setCorrectAnswers] = useState(0)
  const [quizResult, setQuizResult] = useState<'correct' | 'wrong' | null>(null)

  const currentQ = questions[currentQIndex] || questions[0]

  useEffect(() => {
    libraryApi.getResource(resourceId).then(r => setResource(r.data)).catch(() => {})
    ensureThree().then(() => setEngineReady(true))
    return () => { engineRef.current?.dispose() }
  }, [resourceId])

  const loadQuestions = async () => {
    setLoading(true)
    try {
      const res = await libraryApi.generatePracticeQuestions(resourceId, 'medium', 3, 'mcq')
      const data = res.data
      const raw = Array.isArray(data) ? data : data?.questions || []
      let qList = raw.map((item: any) => ({
        question: item.question,
        options: item.options || item.choices || [],
        correctIndex: item.correct_index ?? item.answerIndex ?? 0,
        explanation: item.explanation || ''
      }))
      qList = qList.filter((q: Question) => q.options.length === 4)
      if (qList.length < 3) {
        qList = [
          { question: 'What is the main topic of this material?', options: ['Core Concepts', 'Random Guess', 'Nothing', 'None of these'], correctIndex: 0, explanation: 'Focus on the core concepts covered.' },
          { question: 'Best way to retain information?', options: ['Active Recall', 'Skimming', 'Highlighting', 'Cramming'], correctIndex: 0, explanation: 'Active recall is scientifically proven.' },
          { question: 'How should you approach difficult topics?', options: ['Break Them Down', 'Skip to Easy', 'Memorize Only', 'Ignore Them'], correctIndex: 0, explanation: 'Breaking down builds mastery.' },
        ]
      }
      setQuestions(qList.slice(0, 3))
      setGameState('intro')
    } catch {
      setQuestions([
        { question: 'What is effective studying?', options: ['Active Engagement', 'Passive Reading', 'Memorizing', 'Skimming'], correctIndex: 0, explanation: 'Active engagement works.' },
        { question: 'Best retention technique?', options: ['Spaced Repetition', 'Cramming', 'Highlighting', 'Reading Once'], correctIndex: 0, explanation: 'Spaced repetition is proven.' },
        { question: 'How to learn deeply?', options: ['Practice and Apply', 'Just Read', 'Copy Notes', 'Watch Passively'], correctIndex: 0, explanation: 'Application cements knowledge.' },
      ])
      setGameState('intro')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadQuestions() }, [])

  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth && 'ontouchstart' in window)
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', () => setTimeout(check, 100))
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  // Warmup countdown
  useEffect(() => {
    if (gameState !== 'warmup') return
    setWarmupTimer(8)
    const interval = setInterval(() => {
      setWarmupTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [gameState])

  // Transition from warmup to boss_intro after 8 seconds
  useEffect(() => {
    if (gameState !== 'warmup' || warmupTimer > 0) return
    const timeout = setTimeout(() => {
      const engine = engineRef.current
      if (engine) {
        engine.clearObstacles()
        engine.spawnBoss()
        setGameState('boss_intro')
        setBossIntroTimer(3)
        if (soundEnabled) SFX.bossAppear()
      }
    }, 200)
    return () => clearTimeout(timeout)
  }, [gameState, warmupTimer, soundEnabled])

  // Boss intro countdown
  useEffect(() => {
    if (gameState !== 'boss_intro') return
    const interval = setInterval(() => {
      setBossIntroTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [gameState])

  // Transition from boss_intro to boss_fight
  useEffect(() => {
    if (gameState !== 'boss_intro') return
    const engine = engineRef.current
    if (!engine) return
    const checkReady = setInterval(() => {
      if (engine.bossArrived) {
        clearInterval(checkReady)
        setGameState('boss_fight')
        setCurrentQIndex(0)
        setCorrectAnswers(0)
        setQuestionHistory([])
        setQuizResult(null)
        setSelectedAnswer(null)
        setShowExplanation(false)
        setQuestionTimer(15)
        engineRef.current?.setQuizActive(true)
      }
    }, 100)
    return () => clearInterval(checkReady)
  }, [gameState])

  // Question timer
  useEffect(() => {
    if (gameState !== 'boss_fight' || selectedAnswer !== null) return
    setQuestionTimer(15)
    const interval = setInterval(() => {
      setQuestionTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [gameState, currentQIndex, selectedAnswer])

  // Timer ran out — treat as wrong
  useEffect(() => {
    if (gameState !== 'boss_fight' || questionTimer > 0 || selectedAnswer !== null) return
    handleAnswer(-1)
  }, [questionTimer, gameState, selectedAnswer])

  const startGame = useCallback(async () => {
    if (!containerRef.current) return
    try {
      if ((screen.orientation as any)?.lock) await (screen.orientation as any).lock('landscape')
    } catch {}
    engineRef.current?.dispose()
    const engine = new CityRunEngine()
    engineRef.current = engine

    const ok = await engine.init(containerRef.current, {
      onHit: () => {
        if (soundEnabled) SFX.hit()
      },
      onCoin: () => {
        setScore(s => s + 25)
        if (soundEnabled) SFX.coin()
      },
    })

    if (ok) {
      setScore(0); setCombo(0); setMaxCombo(0)
      setCurrentQIndex(0); setSelectedAnswer(null); setShowExplanation(false)
      setQuestionHistory([]); setShowReview(false)
      setQuizResult(null); setCorrectAnswers(0)
      setGameState('warmup')
      setWarmupTimer(8)
      engine.start()
      const ticker = setInterval(() => {
        if (engineRef.current) {
          setBossHealthDisplay(engineRef.current.bossHealth)
        }
      }, 100)
      ;(engine as any)._ticker = ticker
    }
  }, [soundEnabled])

  const resumeGame = useCallback(() => {
    setGameState('warmup')
    engineRef.current?.start()
  }, [])

  const handleAnswer = useCallback((idx: number) => {
    if (selectedAnswer !== null || gameState !== 'boss_fight') return
    setSelectedAnswer(idx)
    const q = questions[currentQIndex]
    if (!q) return

    const isCorrect = idx >= 0 && idx === q.correctIndex
    setQuestionHistory(prev => [...prev, { question: q, selectedIndex: Math.max(0, idx), correct: isCorrect }])

    if (isCorrect) {
      setScore(s => s + 300 * (currentQIndex + 1))
      setCorrectAnswers(c => c + 1)
      setCombo(c => { const n = c + 1; setMaxCombo(m => Math.max(m, n)); return n })
      setQuizResult('correct')
      if (soundEnabled) SFX.correct()
      // Throw fireballs: 1 for Q1, 2 for Q2, 3 for Q3
      engineRef.current?.throwFireball(currentQIndex + 1)
      setShowExplanation(true)
      setTimeout(() => {
        if (currentQIndex >= 2) {
          // All 3 questions answered correctly — victory!
          setShowExplanation(false)
          setSelectedAnswer(null)
          setQuizResult(null)
          engineRef.current?.setQuizActive(false)
          setGameState('victory')
          authApi.awardXp(75, 'Boss Defeated', resourceId).catch(() => {})
          toast.success('Boss Defeated! +75 XP Awarded!')
        } else {
          // Next question
          setShowExplanation(false)
          setSelectedAnswer(null)
          setQuizResult(null)
          setCurrentQIndex(i => i + 1)
          setQuestionTimer(15)
        }
      }, 2000)
    } else {
      setCombo(0)
      setQuizResult('wrong')
      if (soundEnabled) SFX.wrong()
      engineRef.current?.bossAttack()
      setShowExplanation(true)
      setTimeout(() => {
        setShowExplanation(false)
        setSelectedAnswer(null)
        setQuizResult(null)
        engineRef.current?.setQuizActive(false)
        setShowReview(true)
        setGameState('gameover')
      }, 2000)
    }
  }, [selectedAnswer, gameState, currentQIndex, questions, combo, soundEnabled, resourceId])

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current
      const playableState = gameState === 'warmup' || gameState === 'boss_intro' || gameState === 'boss_fight'
      if (playableState && eng) {
        if (e.key === 'ArrowLeft' || e.key === 'a') eng.switchLane(-1)
        if (e.key === 'ArrowRight' || e.key === 'd') eng.switchLane(1)
        if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w') { e.preventDefault(); eng.jump() }
        if (e.key === 'ArrowDown' || e.key === 's') eng.slide()
        if (e.key === 'Escape') { eng.stop(); setGameState('paused') }
        if (gameState === 'boss_fight' && e.key >= '1' && e.key <= '4') handleAnswer(parseInt(e.key) - 1)
      } else if (gameState === 'paused' && e.key === 'Escape') {
        resumeGame()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameState, handleAnswer, resumeGame])

  // Touch (desktop only)
  useEffect(() => {
    const isTouchDevice = 'ontouchstart' in window && window.innerWidth < 768
    if (isTouchDevice) return

    let sx = 0, sy = 0
    const onStart = (e: TouchEvent) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY }
    const onEnd = (e: TouchEvent) => {
      const playableState = gameState === 'warmup' || gameState === 'boss_intro' || gameState === 'boss_fight'
      if (!playableState) return
      const dx = e.changedTouches[0].clientX - sx
      const dy = e.changedTouches[0].clientY - sy
      const eng = engineRef.current
      if (!eng) return
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        eng.switchLane(dx < 0 ? -1 : 1)
      } else if (Math.abs(dy) > 40) {
        if (dy < 0) eng.jump()
        else eng.slide()
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd) }
  }, [gameState])

  if (loading || !engineReady) {
    return (
      <div className="fixed inset-0 bg-[#87ceeb] flex items-center justify-center text-white z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-white/30 border-t-white animate-spin" />
          <p className="font-extrabold text-white text-lg drop-shadow-md">
            {loading ? 'Loading questions...' : 'Loading 3D engine...'}
          </p>
        </div>
      </div>
    )
  }

  if (isPortrait && (gameState === 'warmup' || gameState === 'boss_intro' || gameState === 'boss_fight')) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white z-50 p-8 text-center">
        <div className="text-6xl mb-6">📱↻</div>
        <h2 className="text-2xl font-black mb-3">Rotate Your Device</h2>
        <p className="text-white/60 text-sm leading-relaxed max-w-xs">
          City Run plays best in landscape mode. Rotate your phone sideways for the full experience.
        </p>
        <button onClick={() => setIsPortrait(false)}
          className="mt-6 px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-sm font-bold hover:bg-white/20 transition-all">
          Play Anyway
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none z-50"
      onTouchMove={(e) => { const ps = gameState === 'warmup' || gameState === 'boss_intro' || gameState === 'boss_fight'; if (ps) e.preventDefault() }}>
      <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

      {/* HUD */}
      {(gameState === 'warmup' || gameState === 'boss_intro' || gameState === 'boss_fight') && (
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
          <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 bg-black/20 backdrop-blur-sm pointer-events-auto">
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={() => { engineRef.current?.stop(); setGameState('paused') }}
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[11px] sm:text-xs font-bold transition-colors backdrop-blur">
                <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Exit</span>
              </button>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-black/30 backdrop-blur text-amber-400 text-xs sm:text-sm font-black">
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-0.5 sm:mr-1" />{score}
              </div>
              {combo > 1 && (
                <div className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl bg-purple-500/30 backdrop-blur text-purple-300 text-xs sm:text-sm font-black animate-pulse">
                  x{combo}
                </div>
              )}
              {gameState === 'warmup' && (
                <div className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-orange-500/30 backdrop-blur text-orange-300 text-xs sm:text-sm font-black">
                  {warmupTimer}s
                </div>
              )}
              {gameState === 'boss_fight' && currentQ && (
                <div className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl backdrop-blur text-xs sm:text-sm font-black ${
                  questionTimer <= 5 ? 'bg-red-500/30 text-red-300 animate-pulse' : 'bg-white/20 text-white'
                }`}>
                  {questionTimer}s
                </div>
              )}
              <button onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1.5 sm:p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors backdrop-blur">
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              </button>
            </div>
          </div>
          {/* Boss Health Bar */}
          {(gameState === 'boss_intro' || gameState === 'boss_fight') && (
            <div className="px-4 pt-2 pb-1 pointer-events-none">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Boss</span>
                <span className="text-[10px] font-bold text-white/60">{bossHealthDisplay}/3</span>
              </div>
              <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden border border-red-500/30 backdrop-blur">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${(bossHealthDisplay / 3) * 100}%`,
                    background: bossHealthDisplay === 3
                      ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                      : bossHealthDisplay === 2
                      ? 'linear-gradient(90deg, #f97316, #ea580c)'
                      : 'linear-gradient(90deg, #eab308, #ca8a04)',
                    boxShadow: bossHealthDisplay <= 1
                      ? '0 0 12px rgba(234, 179, 8, 0.6)'
                      : bossHealthDisplay === 2
                      ? '0 0 8px rgba(249, 115, 22, 0.4)'
                      : '0 0 6px rgba(239, 68, 68, 0.3)',
                  }}
                />
              </div>
            </div>
          )}
          {gameState === 'warmup' && (
            <div className="text-center mt-2 pointer-events-none">
              <span className="px-4 py-1.5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-black uppercase tracking-widest animate-pulse">
                Warmup — Dodge obstacles!
              </span>
            </div>
          )}
          {gameState === 'boss_intro' && (
            <div className="text-center mt-2 pointer-events-none">
              <span className="px-4 py-1.5 rounded-full bg-red-500/20 text-red-400 text-xs font-black uppercase tracking-widest animate-pulse">
                ⚠️ BOSS INCOMING ⚠️
              </span>
            </div>
          )}
        </div>
      )}

      {/* Mobile Controls */}
      {(gameState === 'warmup' || gameState === 'boss_intro') && (
        <div className="absolute bottom-4 sm:bottom-6 left-0 right-0 z-30 flex justify-center gap-2 px-3 sm:px-4 md:hidden pointer-events-auto">
          <button onTouchStart={(e) => { e.preventDefault(); engineRef.current?.switchLane(-1) }}
            className="flex-1 py-5 sm:py-4 rounded-2xl font-black text-base sm:text-sm border-2 bg-white/10 border-white/20 text-white active:scale-90 active:bg-white/30 transition-all backdrop-blur select-none">⬅️</button>
          <button onTouchStart={(e) => { e.preventDefault(); engineRef.current?.jump() }}
            className="flex-[2] py-5 sm:py-4 rounded-2xl font-black text-base sm:text-sm border-2 bg-cyan-500/20 border-cyan-400/40 text-cyan-300 active:scale-90 active:bg-cyan-500/40 transition-all backdrop-blur select-none">⬆️ Jump</button>
          <button onTouchStart={(e) => { e.preventDefault(); engineRef.current?.slide() }}
            className="flex-[2] py-5 sm:py-4 rounded-2xl font-black text-base sm:text-sm border-2 bg-amber-500/20 border-amber-400/40 text-amber-300 active:scale-90 active:bg-amber-500/40 transition-all backdrop-blur select-none">⬇️ Slide</button>
          <button onTouchStart={(e) => { e.preventDefault(); engineRef.current?.switchLane(1) }}
            className="flex-1 py-5 sm:py-4 rounded-2xl font-black text-base sm:text-sm border-2 bg-white/10 border-white/20 text-white active:scale-90 active:bg-white/30 transition-all backdrop-blur select-none">➡️</button>
        </div>
      )}

      {/* Boss Fight Quiz Overlay */}
      <AnimatePresence>
        {gameState === 'boss_fight' && currentQ && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-0 left-0 right-0 z-40 pointer-events-auto">
            <div className="mx-auto max-w-2xl p-3 sm:p-4 pb-20 sm:pb-6 md:pb-4">
              <div className="bg-[#0f172a]/95 border border-red-500/30 rounded-2xl p-4 sm:p-5 shadow-[0_0_60px_rgba(255,0,60,0.15)] backdrop-blur-xl">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="px-2 sm:px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-[10px] sm:text-[11px] font-black uppercase tracking-widest">
                    ⚔️ Boss Question {currentQIndex + 1}/3
                  </span>
                  {quizResult && (
                    <span className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-widest ${
                      quizResult === 'correct'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {quizResult === 'correct' ? `🔥 ${currentQIndex + 1} Fireball${currentQIndex > 0 ? 's' : ''}!` : '💀 Boss Attack!'}
                    </span>
                  )}
                </div>

                <h2 className="text-sm sm:text-base md:text-lg font-black text-white leading-snug mb-3 sm:mb-4">{currentQ.question}</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
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
                        className={`px-3 py-3 sm:py-3 rounded-xl border text-left text-sm font-bold transition-all ${style}`}>
                        <span className="text-[10px] font-black text-slate-500 mr-2">{i + 1}.</span>{opt}
                      </button>
                    )
                  })}
                </div>

                {showExplanation && (
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                    className={`mt-3 p-3 rounded-xl text-sm font-medium ${
                      selectedAnswer !== null && selectedAnswer === currentQ.correctIndex
                        ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                        : 'bg-red-500/10 border border-red-500/30 text-red-300'
                    }`}>
                    {selectedAnswer !== null && selectedAnswer === currentQ.correctIndex
                      ? <p className="text-xs font-black">🔥 Fireball launched at the boss!</p>
                      : <p className="text-xs font-black">💀 The boss strikes back!</p>
                    }
                    {currentQ.explanation && <p className="text-xs opacity-80 mt-1">{currentQ.explanation}</p>}
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Boss Intro Overlay */}
      <AnimatePresence>
        {gameState === 'boss_intro' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-35 flex items-center justify-center pointer-events-none">
            <motion.div initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, type: 'spring' }}
              className="text-center">
              <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-red-500 drop-shadow-[0_0_30px_rgba(255,0,0,0.5)] animate-pulse">
                ⚠️ BOSS BATTLE ⚠️
              </h1>
              <p className="text-white/60 text-sm mt-3">Answer correctly to attack! Wrong answers mean defeat!</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Intro */}
      <AnimatePresence>
        {gameState === 'intro' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="bg-[#0f172a]/90 border border-white/10 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 sm:space-y-5 shadow-2xl">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white drop-shadow-lg">City Run</h1>
              <p className="text-slate-300 text-sm leading-relaxed">
                Run, dodge obstacles, then face the BOSS!<br/>
                <span className="hidden md:inline">Use ← → to switch lanes, ↑ or Space to jump, ↓ to slide.</span>
                <span className="md:hidden">Swipe or use the on-screen buttons to move, jump, and slide.</span><br/>
                <span className="text-red-400 font-bold">Answer 3 questions to defeat the boss!</span><br/>
                <span className="text-cyan-400 font-bold">Correct answers = fireballs. Wrong = boss attacks!</span>
              </p>
              <label className="flex items-center justify-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary" />
                Sound effects
              </label>
              <button onClick={startGame}
                className="w-full py-4 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-black text-lg shadow-xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all">
                Start Game
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pause */}
      <AnimatePresence>
        {gameState === 'paused' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="bg-[#0f172a]/95 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center space-y-5">
              <Pause className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-2xl font-black text-white">PAUSED</h2>
              <button onClick={resumeGame}
                className="w-full py-3 rounded-xl bg-blue-500 text-white font-black text-sm hover:bg-blue-600 transition-all">Resume</button>
              <button onClick={() => { engineRef.current?.dispose(); router.push(`/library/${resourceId}`) }}
                className="w-full py-3 rounded-xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all">Exit</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over / Victory — Review Screen */}
      <AnimatePresence>
        {(gameState === 'gameover' || gameState === 'victory') && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#0f172a]/95 border border-white/10 rounded-3xl p-4 sm:p-6 max-w-2xl w-full space-y-4 sm:space-y-5 shadow-2xl my-4 sm:my-8">

              <div className="text-center space-y-2">
                <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${
                  gameState === 'victory'
                    ? 'bg-gradient-to-br from-amber-500 to-yellow-400 text-black'
                    : 'bg-gradient-to-br from-red-600 to-rose-800 text-white'
                }`}>
                  {gameState === 'victory' ? <Award className="w-8 h-8" /> : <span className="text-3xl">💀</span>}
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-white">
                  {gameState === 'victory' ? 'BOSS DEFEATED!' : 'GAME OVER'}
                </h1>
                <p className="text-slate-400 text-sm">
                  {gameState === 'victory' ? 'The boss is no more! +75 XP awarded.' : 'The boss got you. Try again!'}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                  <p className="text-2xl font-black text-primary">{score}</p>
                  <p className="text-[10px] font-bold text-slate-500">SCORE</p>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                  <p className="text-2xl font-black text-green-400">{correctAnswers}/3</p>
                  <p className="text-[10px] font-bold text-slate-500">CORRECT</p>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                  <p className="text-2xl font-black text-purple-400">x{maxCombo}</p>
                  <p className="text-[10px] font-bold text-slate-500">MAX COMBO</p>
                </div>
              </div>

              {showReview && questionHistory.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-[14px] font-black text-white uppercase tracking-wider">Question Review</h3>
                  <div className="max-h-[40vh] overflow-y-auto space-y-3 pr-1 scrollbar-hide">
                    {questionHistory.map((record, idx) => (
                      <div key={idx} className={`p-4 rounded-xl border ${
                        record.correct
                          ? 'bg-green-500/5 border-green-500/20'
                          : 'bg-red-500/5 border-red-500/20'
                      }`}>
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            record.correct
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {record.correct ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-white leading-snug">{record.question.question}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 ml-9">
                          {record.question.options.map((opt, oi) => {
                            const isCorrect = oi === record.question.correctIndex
                            const isSelected = oi === record.selectedIndex
                            let optStyle = 'bg-white/5 border-white/5 text-white/40'
                            if (isCorrect) optStyle = 'bg-green-500/15 border-green-500/40 text-green-300'
                            else if (isSelected && !isCorrect) optStyle = 'bg-red-500/15 border-red-500/40 text-red-300'
                            return (
                              <div key={oi} className={`px-3 py-2 rounded-lg border text-[12px] font-medium flex items-center gap-2 ${optStyle}`}>
                                <span className="font-black text-[10px] opacity-50">{oi + 1}.</span>
                                <span className="flex-1 truncate">{opt}</span>
                                {isCorrect && <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                                {isSelected && !isCorrect && <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                              </div>
                            )
                          })}
                        </div>
                        {record.question.explanation && (
                          <p className="ml-9 mt-2 text-[11px] text-slate-400 italic">{record.question.explanation}</p>
                        )}
                        {!record.correct && (
                          <div className="ml-9 mt-2.5">
                            <button
                              onClick={() => {
                                const q = record.question.question
                                const yourAnswer = record.question.options[record.selectedIndex]
                                const msg = `I answered "${yourAnswer}" but got this wrong — can you explain why?\n\nQuestion: ${q}`
                                router.push(`/ai?q=${encodeURIComponent(msg)}&resource=${resourceId}`)
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-slate-300 hover:bg-white/10 hover:border-cyan-500/30 transition-all"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Ask the tutor
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => startGame()}
                  className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-black text-sm hover:bg-blue-600 transition-all">Run Again</button>
                <button onClick={() => { engineRef.current?.dispose(); router.push(`/library/${resourceId}`) }}
                  className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all">Exit</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}