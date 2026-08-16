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
  jump: () => { try { const a = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'); a.volume = 0.15; a.play() } catch {} },
}

let THREE: typeof import('three') | null = null
let threeLoaded = false
let threeLoading: Promise<void> | null = null

async function ensureThree() {
  if (threeLoaded && THREE) return
  if (threeLoading) { await threeLoading; return }
  threeLoading = import('three').then(mod => { THREE = mod; threeLoaded = true }).catch(e => { console.error('Three.js load failed:', e); threeLoading = null })
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
  private frame = 0
  private trackPlanks: any[] = []
  private trees: any[] = []
  private obstacles: { mesh: any; lane: number; z: number; type: string; hit: boolean; jumpable: boolean }[] = []
  private coins: { mesh: any; lane: number; z: number; collected: boolean }[] = []
  private particles: { mesh: any; vx: number; vy: number; vz: number; life: number }[] = []

  private LANE_X = [-3, 0, 3]
  private onHit: () => void = () => {}
  private onCoin: () => void = () => {}
  private onQuiz: () => void = () => {}
  private quizCooldown = 0

  async init(container: HTMLElement, cbs: { onHit: () => void; onCoin: () => void; onQuiz: () => void }) {
    await ensureThree()
    if (!THREE) return false
    this.onHit = cbs.onHit
    this.onCoin = cbs.onCoin
    this.onQuiz = cbs.onQuiz
    this.alive = true

    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight

    // Scene — bright sky
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb)
    this.scene.fog = new THREE.Fog(0x87ceeb, 40, 120)

    // Camera — third person behind runner
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 200)
    this.camera.position.set(0, 5, 10)
    this.camera.lookAt(0, 1.5, -15)

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = 2
    this.renderer.toneMapping = 4
    this.renderer.toneMappingExposure = 1.4
    container.appendChild(this.renderer.domElement)

    // ─── Lighting — bright daylight ─────────────
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.8)
    sun.position.set(10, 20, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 80
    sun.shadow.camera.left = -20
    sun.shadow.camera.right = 20
    sun.shadow.camera.top = 20
    sun.shadow.camera.bottom = -20
    this.scene.add(sun)

    const fill = new THREE.DirectionalLight(0xaaddff, 0.4)
    fill.position.set(-5, 5, -5)
    this.scene.add(fill)

    // ─── Ground — green grass ───────────────────
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4a8c3f, roughness: 0.9 })
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(120, 300), grassMat)
    grass.rotation.x = -Math.PI / 2
    grass.position.set(0, -0.05, -100)
    grass.receiveShadow = true
    this.scene.add(grass)

    // ─── Railroad Track ─────────────────────────
    // Road bed (gravel)
    const gravelMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.85 })
    const gravel = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 300), gravelMat)
    gravel.position.set(0, 0, -100)
    gravel.receiveShadow = true
    this.scene.add(gravel)

    // Rails
    const railMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 })
    for (const rx of [-2.2, 2.2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 300), railMat)
      rail.position.set(rx, 0.12, -100)
      rail.castShadow = true
      this.scene.add(rail)
    }

    // Cross ties (wooden planks)
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.8 })
    for (let i = 0; i < 80; i++) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 0.3), tieMat)
      tie.position.set(0, 0.04, -i * 3.5)
      tie.receiveShadow = true
      this.scene.add(tie)
      this.trackPlanks.push(tie)
    }

    // Lane dividers — subtle markers on the track
    const markerMat = new THREE.MeshStandardMaterial({ color: 0xdddd44, emissive: 0xcccc22, emissiveIntensity: 0.3 })
    for (let i = 0; i < 50; i++) {
      for (const mx of [-1.5, 1.5]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 1.5), markerMat)
        m.position.set(mx, 0.16, -i * 5)
        this.scene.add(m)
        this.trackPlanks.push(m)
      }
    }

    // ─── Trees ──────────────────────────────────
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 })
    const treeLeafMats = [
      new THREE.MeshStandardMaterial({ color: 0x2d7a2d, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x3a8c3a, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x1d6a1d, roughness: 0.7 }),
    ]

    for (const side of [-1, 1]) {
      for (let i = 0; i < 40; i++) {
        const treeGroup = new THREE.Group()
        const trunkH = 1.5 + Math.random() * 1.5
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.25, trunkH, 6),
          treeTrunkMat
        )
        trunk.position.y = trunkH / 2
        trunk.castShadow = true
        treeGroup.add(trunk)

        // Cone-shaped leaves (like the screenshot)
        const leafMat = treeLeafMats[i % 3]
        const leafH = 2 + Math.random() * 2
        const leafR = 1 + Math.random() * 0.8
        const leaves = new THREE.Mesh(
          new THREE.ConeGeometry(leafR, leafH, 6),
          leafMat
        )
        leaves.position.y = trunkH + leafH * 0.35
        leaves.castShadow = true
        treeGroup.add(leaves)

        // Sometimes add a second smaller cone on top
        if (Math.random() > 0.4) {
          const topLeaf = new THREE.Mesh(
            new THREE.ConeGeometry(leafR * 0.6, leafH * 0.6, 6),
            leafMat
          )
          topLeaf.position.y = trunkH + leafH * 0.7
          topLeaf.castShadow = true
          treeGroup.add(topLeaf)
        }

        const xPos = side * (7 + Math.random() * 15)
        const zPos = -i * 6 - Math.random() * 4
        treeGroup.position.set(xPos, 0, zPos)
        this.scene.add(treeGroup)
        this.trees.push(treeGroup)
      }
    }

    // ─── Runner Character ───────────────────────
    this.runnerGroup = new THREE.Group()

    // Red cap
    const capMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5 })
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.15, 12), capMat)
    cap.position.y = 2.55
    this.runnerGroup.add(cap)
    this.runnerParts.cap = cap

    // Cap brim
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.25), capMat)
    brim.position.set(0, 2.48, 0.18)
    this.runnerGroup.add(brim)

    // Head
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5c7a1, roughness: 0.6 })
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), skinMat)
    head.position.y = 2.35
    head.castShadow = true
    this.runnerGroup.add(head)
    this.runnerParts.head = head

    // Eyes
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff })
    const eyePupil = new THREE.MeshStandardMaterial({ color: 0x222222 })
    for (const ex of [-0.1, 0.1]) {
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeWhite)
      ew.position.set(ex, 2.38, 0.25)
      this.runnerGroup.add(ew)
      const ep = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyePupil)
      ep.position.set(ex, 2.38, 0.29)
      this.runnerGroup.add(ep)
    }

    // Body — green t-shirt
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x22883a, roughness: 0.6 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), shirtMat)
    body.position.y = 1.65
    body.castShadow = true
    this.runnerGroup.add(body)
    this.runnerParts.body = body

    // Backpack
    const packMat = new THREE.MeshStandardMaterial({ color: 0x3344aa, roughness: 0.5 })
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.25), packMat)
    pack.position.set(0, 1.7, -0.32)
    this.runnerGroup.add(pack)
    const packStrap1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.05), packMat)
    packStrap1.position.set(-0.15, 1.8, -0.18)
    this.runnerGroup.add(packStrap1)
    const packStrap2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.05), packMat)
    packStrap2.position.set(0.15, 1.8, -0.18)
    this.runnerGroup.add(packStrap2)

    // Arms
    const armMat = new THREE.MeshStandardMaterial({ color: 0xf5c7a1, roughness: 0.6 })
    for (const ax of [-0.48, 0.48]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), armMat)
      arm.position.set(ax, 1.5, 0)
      arm.castShadow = true
      this.runnerGroup.add(arm)
      this.runnerParts[`arm${ax > 0 ? 'R' : 'L'}`] = arm
    }

    // Hands
    const handMat = new THREE.MeshStandardMaterial({ color: 0xf0b888, roughness: 0.5 })
    for (const hx of [-0.48, 0.48]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), handMat)
      hand.position.set(hx, 1.15, 0)
      this.runnerGroup.add(hand)
    }

    // Blue pants
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.6 })
    for (const lx of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), pantsMat)
      leg.position.set(lx, 0.8, 0)
      leg.castShadow = true
      this.runnerGroup.add(leg)
      this.runnerParts[`leg${lx > 0 ? 'R' : 'L'}`] = leg
    }

    // Shoes
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
    for (const sx of [-0.15, 0.15]) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.3), shoeMat)
      shoe.position.set(sx, 0.45, 0.04)
      this.runnerGroup.add(shoe)
    }

    this.runnerGroup.position.set(0, 0, 0)
    this.scene.add(this.runnerGroup)

    // Resize handler
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
    this.frame = 0
    this.currentLane = 1
    this.targetLane = 1
    this.isJumping = false
    this.jumpVelocity = 0
    this.jumpY = 0
    this.isSliding = false
    this.slideTimer = 0
    this.quizCooldown = 0
    this.obstacles.forEach(o => this.scene.remove(o.mesh))
    this.coins.forEach(c => this.scene.remove(c.mesh))
    this.particles.forEach(p => this.scene.remove(p.mesh))
    this.obstacles = []
    this.coins = []
    this.particles = []
    this.worldOffset = 0
    this.run()
  }

  switchLane(dir: number) {
    const n = this.targetLane + dir
    if (n >= 0 && n <= 2) this.targetLane = n
  }

  jump() {
    if (!this.isJumping && !this.isSliding) {
      this.isJumping = true
      this.jumpVelocity = 0.25
      if (jumpSound) jumpSound()
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
    const container = this.renderer?.domElement?.parentElement
    if ((this as any)._onResize) window.removeEventListener('resize', (this as any)._onResize)
  }

  getSpeed() { return this.speed }

  private run = () => {
    if (!this.alive || !THREE) return
    this.animId = requestAnimationFrame(this.run)

    this.frame++
    this.speed = Math.min(1.2, this.speed + 0.0002)
    this.worldOffset += this.speed
    this.animPhase += this.speed * 2

    // Smooth lane
    const diff = this.targetLane - this.currentLane
    if (Math.abs(diff) > 0.01) this.currentLane += diff * 0.15
    else this.currentLane = this.targetLane

    // Jump physics
    if (this.isJumping) {
      this.jumpY += this.jumpVelocity
      this.jumpVelocity -= 0.012
      if (this.jumpY <= 0) {
        this.jumpY = 0
        this.isJumping = false
        this.jumpVelocity = 0
      }
    }

    // Slide timer
    if (this.isSliding) {
      this.slideTimer--
      if (this.slideTimer <= 0) this.isSliding = false
    }

    // Runner position & animation
    if (this.runnerGroup) {
      const tx = this.LANE_X[this.targetLane]
      this.runnerGroup.position.x += (tx - this.runnerGroup.position.x) * 0.15
      this.runnerGroup.position.y = this.jumpY

      // Slide — crouch the character
      if (this.isSliding) {
        this.runnerGroup.scale.y = 0.5
        this.runnerGroup.position.y = Math.max(this.jumpY, 0)
      } else {
        this.runnerGroup.scale.y += (1 - this.runnerGroup.scale.y) * 0.2
      }

      const t = this.animPhase
      const bob = Math.sin(t) * 0.08
      const legSwing = Math.sin(t) * 0.5

      if (this.runnerParts.body) this.runnerParts.body.position.y = 1.65 + bob
      if (this.runnerParts.head) this.runnerParts.head.position.y = 2.35 + bob
      if (this.runnerParts.cap) this.runnerParts.cap.position.y = 2.55 + bob
      if (this.runnerParts.legL) this.runnerParts.legL.rotation.x = this.isSliding ? 0.8 : legSwing
      if (this.runnerParts.legR) this.runnerParts.legR.rotation.x = this.isSliding ? -0.3 : -legSwing
      if (this.runnerParts.armL) this.runnerParts.armL.rotation.x = this.isSliding ? 0.3 : -legSwing * 0.8
      if (this.runnerParts.armR) this.runnerParts.armR.rotation.x = this.isSliding ? -0.3 : legSwing * 0.8
    }

    // Move track planks
    for (const plank of this.trackPlanks) {
      plank.position.z += this.speed
      if (plank.position.z > 15) plank.position.z -= 280
    }

    // Move obstacles
    for (const obs of this.obstacles) {
      obs.z += this.speed
      obs.mesh.position.z = obs.z
    }
    this.obstacles = this.obstacles.filter(o => {
      if (o.z > 12) { this.scene.remove(o.mesh); return false }
      return true
    })

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

    // Spawn obstacles
    const gap = Math.max(10, 22 - this.speed * 10)
    if (this.frame > 80 && Math.random() < 0.025 + this.speed * 0.008) {
      const far = this.obstacles.length > 0 ? Math.min(...this.obstacles.map(o => o.z)) : 0
      if (far < -gap) this.spawnObstacle()
    }

    // Spawn coins
    if (this.frame % 18 === 0 && Math.random() < 0.5) {
      const far = this.coins.length > 0 ? Math.min(...this.coins.map(c => c.z)) : 0
      if (far < -12) this.spawnCoin()
    }

    // Collision
    const rl = Math.round(this.currentLane)
    for (const obs of this.obstacles) {
      if (obs.hit) continue
      if (Math.abs(obs.z) < 1.5 && obs.lane === rl) {
        // Jump over low obstacles
        if (obs.jumpable && this.jumpY > 0.8) continue
        // Slide under high obstacles
        if (!obs.jumpable && this.isSliding) continue
        obs.hit = true
        this.onHit()
        this.spawnParticles(obs.mesh.position.x, 1.5, 0, 0xff4444, 10)
      }
    }
    for (const c of this.coins) {
      if (c.collected) continue
      if (Math.abs(c.z) < 1.5 && c.lane === rl) {
        c.collected = true
        this.onCoin()
        this.spawnParticles(c.mesh.position.x, 1.8, 0, 0xffd700, 6)
      }
    }

    // Quiz
    if (this.quizCooldown > 0) this.quizCooldown--
    if (this.frame > 300 && this.quizCooldown <= 0 && Math.random() < 0.003) {
      this.onQuiz()
      this.quizCooldown = 500
    }

    // Camera follow
    this.camera.position.x += (this.runnerGroup.position.x * 0.3 - this.camera.position.x) * 0.05
    this.camera.position.y = 5 + this.jumpY * 0.3 + Math.sin(this.frame * 0.05) * 0.1

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
      // Low barrier — can jump over
      jumpable = true
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 0.8, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xdd6600, roughness: 0.4 })
      )
      mesh.castShadow = true
      // Stripes
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffdd00 })
      for (let s = -0.8; s <= 0.8; s += 0.5) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.42), stripeMat)
        st.position.set(s, 0, 0)
        mesh.add(st)
      }
      mesh.position.set(this.LANE_X[lane], 0.5, -130)
    } else if (type === 'crate') {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.5 })
      )
      mesh.castShadow = true
      mesh.position.set(this.LANE_X[lane], 0.55, -130)
    } else {
      // Rock — can slide under if it's a high obstacle
      mesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.6, 0),
        new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7, metalness: 0.2 })
      )
      mesh.castShadow = true
      mesh.position.set(this.LANE_X[lane], 0.6, -130)
    }

    this.scene.add(mesh)
    this.obstacles.push({ mesh, lane, z: -130, type, hit: false, jumpable })
  }

  private spawnCoin() {
    if (!THREE) return
    const lane = Math.floor(Math.random() * 3)
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 1.5, metalness: 0.8, roughness: 0.2 })
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

let jumpSound = SFX.jump

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
  const [lives, setLives] = useState(3)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [speed, setSpeed] = useState(0.3)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const [slowMotion, setSlowMotion] = useState(true)

  const currentQ = questions[currentQIndex] || questions[0]

  useEffect(() => {
    libraryApi.getResource(resourceId).then(r => setResource(r.data)).catch(() => {})
    ensureThree().then(() => setEngineReady(true))
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
          { question: 'How to handle complex topics?', options: ['Break It Down', 'Skip to Easy', 'Memorize', 'Ignore'], correctIndex: 0, explanation: 'Decomposition builds mastery.' },
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
    const engine = new CityRunEngine()
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
        if (slowMotion) engine.stop()
        setGameState('quiz')
        setSelectedAnswer(null)
        setShowExplanation(false)
      },
    })

    if (ok) {
      setScore(0); setLives(3); setCombo(0); setMaxCombo(0)
      setCurrentQIndex(0); setSelectedAnswer(null); setShowExplanation(false)
      setGameState('playing')
      engine.start()
      const ticker = setInterval(() => {
        if (engineRef.current) setSpeed(engineRef.current.getSpeed())
      }, 200)
      ;(engine as any)._ticker = ticker
    }
  }, [soundEnabled, slowMotion])

  const resumeGame = useCallback(() => {
    setGameState('playing')
    engineRef.current?.start()
  }, [])

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
    if (slowMotion) {
      setGameState('playing')
      engineRef.current?.start()
    } else {
      setGameState('playing')
    }
  }, [lives, currentQIndex, questions.length, resourceId, slowMotion])

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current
      if (gameState === 'playing' && eng) {
        if (e.key === 'ArrowLeft' || e.key === 'a') eng.switchLane(-1)
        if (e.key === 'ArrowRight' || e.key === 'd') eng.switchLane(1)
        if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w') { e.preventDefault(); eng.jump() }
        if (e.key === 'ArrowDown' || e.key === 's') eng.slide()
        if (e.key === 'Escape') { eng.stop(); setGameState('paused') }
      } else if (gameState === 'paused' && e.key === 'Escape') {
        resumeGame()
      } else if (gameState === 'quiz' && e.key >= '1' && e.key <= '4') {
        handleAnswer(parseInt(e.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameState, handleAnswer, resumeGame])

  // Touch
  useEffect(() => {
    let sx = 0, sy = 0
    const onStart = (e: TouchEvent) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY }
    const onEnd = (e: TouchEvent) => {
      if (gameState !== 'playing') return
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

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none z-50">
      {/* 3D Canvas */}
      <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

      {/* HUD */}
      {(gameState === 'playing' || gameState === 'quiz') && (
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
          <div className="flex items-center justify-between px-4 py-3 bg-black/20 backdrop-blur-sm pointer-events-auto">
            <div className="flex items-center gap-3">
              <button onClick={() => { engineRef.current?.stop(); setGameState('paused') }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-colors backdrop-blur">
                <ArrowLeft className="w-4 h-4" /> Exit
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="px-3 py-1.5 rounded-xl bg-black/30 backdrop-blur text-amber-400 text-sm font-black">
                <Trophy className="w-4 h-4 inline mr-1" />{score}
              </div>
              {combo > 1 && (
                <div className="px-2.5 py-1.5 rounded-xl bg-purple-500/30 backdrop-blur text-purple-300 text-sm font-black animate-pulse">
                  x{combo}
                </div>
              )}
              <div className="flex items-center gap-0.5 px-2 py-1.5 rounded-xl bg-black/30 backdrop-blur">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Heart key={i} className={`w-4 h-4 ${i < lives ? 'fill-red-500 text-red-500' : 'text-white/20'}`} />
                ))}
              </div>
              <button onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors backdrop-blur">
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="absolute top-16 left-4 px-2 py-1 rounded-lg bg-black/30 backdrop-blur text-[10px] font-bold text-white/60">
            SPEED: {speed.toFixed(1)}x
          </div>
        </div>
      )}

      {/* Mobile Controls */}
      {gameState === 'playing' && (
        <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center gap-2 px-4 md:hidden pointer-events-auto">
          <button onTouchStart={(e) => { e.preventDefault(); engineRef.current?.switchLane(-1) }}
            className="flex-1 py-4 rounded-2xl font-black text-sm border-2 bg-white/10 border-white/20 text-white active:scale-95 active:bg-white/20 transition-all backdrop-blur">⬅️</button>
          <button onTouchStart={(e) => { e.preventDefault(); engineRef.current?.jump() }}
            className="flex-1 py-4 rounded-2xl font-black text-sm border-2 bg-white/10 border-white/20 text-white active:scale-95 active:bg-white/20 transition-all backdrop-blur">⬆️ Jump</button>
          <button onTouchStart={(e) => { e.preventDefault(); engineRef.current?.slide() }}
            className="flex-1 py-4 rounded-2xl font-black text-sm border-2 bg-white/10 border-white/20 text-white active:scale-95 active:bg-white/20 transition-all backdrop-blur">⬇️ Slide</button>
          <button onTouchStart={(e) => { e.preventDefault(); engineRef.current?.switchLane(1) }}
            className="flex-1 py-4 rounded-2xl font-black text-sm border-2 bg-white/10 border-white/20 text-white active:scale-95 active:bg-white/20 transition-all backdrop-blur">➡️</button>
        </div>
      )}

      {/* Quiz Modal */}
      <AnimatePresence>
        {gameState === 'quiz' && currentQ && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, y: 30 }}
              className="bg-[#0f172a]/95 border border-cyan-500/30 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-[0_0_60px_rgba(6,182,212,0.15)]">
              <div className="text-center">
                <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-[11px] font-black uppercase tracking-widest">
                  ⚡ Question {currentQIndex + 1}/{questions.length}
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
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="bg-[#0f172a]/90 border border-white/10 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
              <h1 className="text-4xl md:text-5xl font-black text-white drop-shadow-lg">City Run</h1>
              <p className="text-slate-300 text-sm leading-relaxed">
                Use ← → to switch lanes, ↑ or Space to jump, ↓ to slide.<br/>
                Answer each question by running into the lane holding the correct option.
              </p>
              <label className="flex items-center justify-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={slowMotion} onChange={e => setSlowMotion(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary" />
                Slow motion — more time to read questions
              </label>
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

      {/* Game Over / Victory */}
      <AnimatePresence>
        {(gameState === 'gameover' || gameState === 'victory') && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#0f172a]/95 border border-white/10 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
              <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${
                gameState === 'victory'
                  ? 'bg-gradient-to-br from-amber-500 to-yellow-400 text-black'
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
                  <p className="text-2xl font-black text-cyan-400">{questions.length}</p>
                  <p className="text-[10px] font-bold text-slate-500">QUESTIONS</p>
                </div>
              </div>
              <div className="flex gap-3">
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
