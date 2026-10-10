import {
  Color,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import type { FxKind } from '../../state/director'
import {
  confettiGeometry,
  glowTexture,
  heartGeometry,
  quadGeometry,
  ringGeometry,
  sparkleTexture,
  starGeometry,
} from './assets'
import { FX, FX_COLORS } from './config'

// The particle engine behind FxLayer: four instanced pools (confetti, sparkles,
// hearts, stars) and a handful of overlay meshes (shockwave rings, the level-up
// flash). Plain three.js, no React: FxLayer owns one instance, calls emit() for
// each director.fx event and update() every frame. Nothing allocates per frame.

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const range = (r: readonly [number, number]) => rand(r[0], r[1])
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]
const signed = (max: number) => rand(-max, max)

function easeOutBack(t: number) {
  const c = FX.popOvershoot
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}

// Pop in, hold, shrink out: 0..1 (with overshoot) over a particle's life.
function envelope(t: number) {
  if (t < FX.popIn) return easeOutBack(t / FX.popIn)
  const out = 1 - FX.fadeOut
  if (t > out) {
    const k = (t - out) / FX.fadeOut
    return 1 - k * k
  }
  return 1
}

type Facing = 'free' | 'camera'

interface Particle {
  alive: boolean
  age: number // negative while waiting out a stagger delay
  life: number
  p: Vector3
  v: Vector3
  rot: Vector3 // euler angles; with camera facing only z (roll) and y (rock) are used
  spin: Vector3
  size: number
  gravity: number
  drag: number
  sway: number
  phase: number
  twinkle: number
  color: Color
}

const tmpMatrix = new Matrix4()
const tmpQuat = new Quaternion()
const tmpQuat2 = new Quaternion()
const tmpEuler = new Euler()
const tmpScale = new Vector3()
const tmpPos = new Vector3()

class ParticlePool {
  readonly mesh: InstancedMesh
  private readonly particles: Particle[]
  private cursor = 0

  constructor(
    geometry: BufferGeometry,
    material: Material,
    capacity: number,
    private readonly facing: Facing,
    private readonly aspect = 1, // x scale relative to height (quads)
  ) {
    this.mesh = new InstancedMesh(geometry, material, capacity)
    this.mesh.count = 0
    this.mesh.frustumCulled = false // instances roam far from the geometry's bounds
    this.mesh.setColorAt(0, new Color()) // allocate instanceColor up front
    this.particles = Array.from({ length: capacity }, () => ({
      alive: false,
      age: 0,
      life: 1,
      p: new Vector3(),
      v: new Vector3(),
      rot: new Vector3(),
      spin: new Vector3(),
      size: 1,
      gravity: 0,
      drag: 0,
      sway: 0,
      phase: 0,
      twinkle: 0,
      color: new Color(),
    }))
  }

  // A recycled particle, reset to defaults, for the emitter to fill in.
  spawn(origin: Vector3, delay = 0): Particle {
    const n = this.particles.length
    let p = this.particles[this.cursor]
    for (let i = 0; i < n; i++) {
      const c = this.particles[(this.cursor + i) % n]
      if (!c.alive) {
        p = c
        this.cursor = (this.cursor + i) % n
        break
      }
    }
    this.cursor = (this.cursor + 1) % n
    p.alive = true
    p.age = -delay
    p.p.copy(origin)
    p.v.set(0, 0, 0)
    p.rot.set(0, 0, 0)
    p.spin.set(0, 0, 0)
    p.gravity = 0
    p.drag = 0
    p.sway = 0
    p.phase = Math.random() * Math.PI * 2
    p.twinkle = 0
    return p
  }

  update(dt: number, cameraQuat: Quaternion) {
    let n = 0
    for (const p of this.particles) {
      if (!p.alive) continue
      p.age += dt
      if (p.age < 0) continue
      if (p.age >= p.life) {
        p.alive = false
        continue
      }
      const t = p.age / p.life
      p.v.y += p.gravity * dt
      p.v.multiplyScalar(Math.exp(-p.drag * dt))
      p.p.addScaledVector(p.v, dt)
      p.rot.addScaledVector(p.spin, dt)

      // Sway is a sideways offset on top of the integrated position.
      tmpPos.copy(p.p)
      if (p.sway) tmpPos.x += Math.sin(p.age * 4 + p.phase) * p.sway * t

      let s = p.size * envelope(t)
      if (p.twinkle) s *= 1 - FX.sparkles.twinkleDepth * (0.5 + 0.5 * Math.sin(p.age * p.twinkle + p.phase))
      tmpScale.set(s * this.aspect, s, s)

      if (this.facing === 'camera') {
        tmpEuler.set(0, p.rot.y, p.rot.z)
        tmpQuat.copy(cameraQuat).multiply(tmpQuat2.setFromEuler(tmpEuler))
      } else {
        tmpQuat.setFromEuler(tmpEuler.set(p.rot.x, p.rot.y, p.rot.z))
      }
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale)
      this.mesh.setMatrixAt(n, tmpMatrix)
      this.mesh.setColorAt(n, p.color)
      n++
    }
    this.mesh.count = n
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }
  }

  get active() {
    return this.mesh.count
  }
}

// Rings and flashes: few, big, each with its own opacity, so plain meshes.
interface Overlay {
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>
  alive: boolean
  age: number
  life: number
  from: number
  to: number
  opacity: number
}

class OverlayPool {
  readonly group = new Group()
  private readonly items: Overlay[] = []

  constructor(ring: BufferGeometry, glow: BufferGeometry, glowMap: Texture, capacity: number) {
    for (let i = 0; i < capacity; i++) {
      const isGlow = i % 4 === 3 // every fourth slot is a flash
      const material = new MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
        map: isGlow ? glowMap : null, // normal blending: additive would vanish against the white room
      })
      const mesh = new Mesh(isGlow ? glow : ring, material)
      mesh.visible = false
      mesh.renderOrder = 2
      mesh.userData.glow = isGlow
      this.group.add(mesh)
      this.items.push({ mesh, alive: false, age: 0, life: 1, from: 0, to: 1, opacity: 1 })
    }
  }

  spawn(glow: boolean, origin: Vector3, color: string, from: number, to: number, life: number, opacity: number, delay = 0) {
    const item =
      this.items.find((o) => !o.alive && o.mesh.userData.glow === glow) ??
      this.items.find((o) => o.mesh.userData.glow === glow)
    if (!item) return
    item.alive = true
    item.age = -delay
    item.life = life
    item.from = from
    item.to = to
    item.opacity = opacity
    item.mesh.position.copy(origin)
    item.mesh.material.color.set(color)
    item.mesh.visible = false
  }

  update(dt: number, cameraQuat: Quaternion) {
    let active = 0
    for (const o of this.items) {
      if (!o.alive) continue
      o.age += dt
      if (o.age < 0) {
        active++
        continue
      }
      const t = o.age / o.life
      if (t >= 1) {
        o.alive = false
        o.mesh.visible = false
        continue
      }
      const k = 1 - (1 - t) ** 3 // ease-out cubic
      o.mesh.visible = true
      o.mesh.quaternion.copy(cameraQuat)
      o.mesh.scale.setScalar(o.from + (o.to - o.from) * k)
      o.mesh.material.opacity = o.opacity * (1 - t) ** 1.5
      active++
    }
    return active
  }
}

const tmpDir = new Vector3()

export class FxSystem {
  readonly group = new Group()
  private readonly confetti: ParticlePool
  private readonly sparkles: ParticlePool
  private readonly hearts: ParticlePool
  private readonly stars: ParticlePool
  private readonly overlays: OverlayPool
  private readonly disposables: { dispose: () => void }[] = []

  constructor() {
    const cap = FX.capacity
    const sparkleMap = sparkleTexture()
    const glowMap = glowTexture()
    const geos = {
      confetti: confettiGeometry(),
      quad: quadGeometry(),
      heart: heartGeometry(),
      star: starGeometry(),
      ring: ringGeometry(),
    }
    const mats = {
      // Unlit and not tone-mapped: exact palette colours; the flip of each piece
      // (its outline thinning edge-on) is what reads as flutter.
      confetti: new MeshBasicMaterial({ side: DoubleSide, toneMapped: false }),
      // Normal (not additive) blending: additive vanishes against the white room.
      sparkles: new MeshBasicMaterial({ map: sparkleMap, transparent: true, depthWrite: false, toneMapped: false }),
      hearts: new MeshPhysicalMaterial({ roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, toneMapped: false }),
      stars: new MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.2, clearcoat: 0.6, toneMapped: false }),
    }
    this.confetti = new ParticlePool(geos.confetti, mats.confetti, cap.confetti, 'free')
    this.sparkles = new ParticlePool(geos.quad, mats.sparkles, cap.sparkles, 'camera')
    this.hearts = new ParticlePool(geos.heart, mats.hearts, cap.hearts, 'camera')
    this.stars = new ParticlePool(geos.star, mats.stars, cap.stars, 'camera')
    this.overlays = new OverlayPool(geos.ring, geos.quad, glowMap, cap.overlays)
    this.sparkles.mesh.renderOrder = 3

    for (const pool of [this.confetti, this.hearts, this.stars, this.sparkles]) this.group.add(pool.mesh)
    this.group.add(this.overlays.group)
    this.disposables.push(sparkleMap, glowMap, ...Object.values(geos), ...Object.values(mats))
    for (const o of this.overlays.group.children) this.disposables.push((o as Mesh<BufferGeometry, Material>).material)
  }

  emit(kind: FxKind, origin: Vector3) {
    switch (kind) {
      case 'confetti':
        return this.emitConfetti(origin, FX.confetti.count, 1)
      case 'sparkles':
        return this.emitSparkles(origin, FX.sparkles.count)
      case 'hearts':
        return this.emitHearts(origin)
      case 'stars':
        return this.emitStars(origin, FX.stars.count)
      case 'ring':
        return this.emitRings(origin, FX.ring.count, FX.ring.stagger, FX.ring.radius)
      case 'levelup':
        return this.emitLevelUp(origin)
    }
  }

  private emitConfetti(origin: Vector3, count: number, boost: number) {
    const c = FX.confetti
    for (let i = 0; i < count; i++) {
      const p = this.confetti.spawn(origin)
      p.v.set(signed(c.spreadX) * boost, range(c.speedUp) * boost, signed(c.spreadZ) * boost + c.towardCamera)
      p.rot.set(signed(Math.PI), signed(Math.PI), signed(Math.PI))
      p.spin.set(signed(c.spin), signed(c.spin), signed(c.spin))
      p.size = range(c.size)
      p.gravity = c.gravity
      p.drag = c.drag
      p.sway = c.sway * Math.random()
      p.life = range(c.life)
      p.color.set(pick(FX_COLORS.confetti))
    }
  }

  private emitSparkles(origin: Vector3, count: number) {
    const c = FX.sparkles
    for (let i = 0; i < count; i++) {
      const p = this.sparkles.spawn(origin, Math.random() * 0.15)
      tmpDir.randomDirection()
      p.v.copy(tmpDir).multiplyScalar(range(c.speed))
      p.rot.z = signed(Math.PI)
      p.spin.z = signed(3)
      p.size = range(c.size)
      p.gravity = c.gravity
      p.drag = c.drag
      p.twinkle = c.twinkle
      p.life = range(c.life)
      p.color.set(pick(FX_COLORS.sparkles))
    }
  }

  private emitHearts(origin: Vector3) {
    const c = FX.hearts
    for (let i = 0; i < c.count; i++) {
      const p = this.hearts.spawn(origin, i * 0.04)
      p.v.set(signed(c.spreadX), range(c.speedUp), range(c.towardCamera))
      p.rot.z = signed(c.wobble)
      p.spin.set(0, signed(c.rock), signed(1.5))
      p.size = range(c.size)
      p.gravity = c.gravity
      p.drag = c.drag
      p.sway = signed(c.sway) * 0.3
      p.life = range(c.life)
      p.color.set(pick(FX_COLORS.hearts))
    }
  }

  private emitStars(origin: Vector3, count: number) {
    const c = FX.stars
    for (let i = 0; i < count; i++) {
      const p = this.stars.spawn(origin)
      const a = (i / count) * Math.PI * 2 + signed(0.2)
      const speed = range(c.speed)
      p.v.set(Math.cos(a) * speed, Math.sin(a) * speed + 1, c.towardCamera)
      p.spin.set(0, signed(c.spin * 0.15), signed(c.spin))
      p.size = range(c.size)
      p.gravity = c.gravity
      p.drag = c.drag
      p.life = range(c.life)
      p.color.set(pick(FX_COLORS.stars))
    }
  }

  private emitRings(origin: Vector3, count: number, stagger: number, radius: readonly [number, number]) {
    const r = FX.ring
    for (let i = 0; i < count; i++) {
      this.overlays.spawn(false, origin, FX_COLORS.rings[i % FX_COLORS.rings.length], radius[0], radius[1], r.life, r.opacity, i * stagger)
    }
  }

  private emitLevelUp(origin: Vector3) {
    const L = FX.levelup
    this.emitConfetti(origin, L.confetti, L.confettiBoost)
    this.emitStars(origin, L.stars)
    this.emitRings(origin, L.rings, L.ringStagger, L.ringRadius)
    this.overlays.spawn(true, origin, FX_COLORS.flash, L.flash.size[0], L.flash.size[1], L.flash.life, L.flash.opacity)

    // A spiral column of sparkles rising around him.
    const col = L.sparkleColumn
    const c = FX.sparkles
    for (let i = 0; i < L.sparkles; i++) {
      const k = i / L.sparkles
      const a = k * Math.PI * 2 * col.turns
      tmpPos.set(origin.x + Math.cos(a) * col.radius, origin.y - 1 + k * 0.6, origin.z + Math.sin(a) * col.radius)
      const p = this.sparkles.spawn(tmpPos, k * 0.6)
      p.v.set(-Math.sin(a) * 0.6, range(col.rise), Math.cos(a) * 0.6)
      p.size = range(c.size) * L.sparkleScale
      p.drag = c.drag * 0.5
      p.twinkle = c.twinkle
      p.life = range(c.life) * 1.3
      p.color.set(pick(FX_COLORS.sparkles))
    }
  }

  // Advances everything; returns how many particles and overlays are live.
  update(dt: number, cameraQuat: Quaternion): number {
    let live = this.overlays.update(dt, cameraQuat)
    for (const pool of [this.confetti, this.sparkles, this.hearts, this.stars]) {
      pool.update(dt, cameraQuat)
      live += pool.active
    }
    return live
  }

  dispose() {
    for (const d of this.disposables) d.dispose()
    this.confetti.mesh.dispose()
    this.sparkles.mesh.dispose()
    this.hearts.mesh.dispose()
    this.stars.mesh.dispose()
  }
}
