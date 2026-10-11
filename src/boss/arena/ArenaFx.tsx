import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Matrix4,
  Quaternion,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  Vector3,
  Euler,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
} from 'three'
import { FLOOR_Y, SPOTS } from '../../scene/layout3d'
import { laneZ } from '../../lesson/roam'
import type { Archetype } from '../archetypes'
import { useFight } from '../fight'
import { ARENA, BEAT, BOLT, BOSS_SHAPE, BURST } from './config'
import { arenaFrame } from './frame'
import { DASH, boltProgress, outCubic, sinceImpact } from './timeline'

// The fight's effects, all driven from arenaFrame: Mochee's star bolt (with
// its trail and glow), the impact ring and sparks, the clash ring when the boss
// lunges into him, and on a KO the boss bursting into pieces and confetti.

const GEMINI = ['#4285f4', '#ea4335', '#fbbc04', '#34a853'] as const

// The Gemini spark (GEMINI_SPARK in config.ts), unit radius, UVs over 0..1.
function sparkGeometry(): ShapeGeometry {
  const c = 0.158
  const s = new Shape()
  s.moveTo(0, 1)
  s.quadraticCurveTo(c, c, 1, 0)
  s.quadraticCurveTo(c, -c, 0, -1)
  s.quadraticCurveTo(-c, -c, -1, 0)
  s.quadraticCurveTo(-c, c, 0, 1)
  const g = new ShapeGeometry(s, 8)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 1) / 2, (uv.getY(i) + 1) / 2)
  return g
}

function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (!g) return null
  draw(g)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

const sparkTexture = () =>
  paint(64, 64, (g) => {
    const grad = g.createLinearGradient(0, 64, 64, 0) // top-left (uv 0,1) -> bottom-right, like the design's spark
    grad.addColorStop(0, '#ea4335')
    grad.addColorStop(0.38, '#fbbc04')
    grad.addColorStop(0.62, '#34a853')
    grad.addColorStop(1, '#4285f4')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
  })

const glowTexture = () =>
  paint(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.35, 'rgba(255,236,170,0.55)')
    grad.addColorStop(1, 'rgba(255,236,170,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
  })

// Stable pseudo-random in [0, 1) per (i, salt).
const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const tmp = { a: new Vector3(), b: new Vector3(), m: new Vector3(), right: new Vector3(), up: new Vector3(), q: new Quaternion(), e: new Euler(), mat: new Matrix4(), s: new Vector3() }

function bezier(a: Vector3, b: Vector3, arc: number, t: number, out: Vector3) {
  // Quadratic: control point above the middle.
  tmp.m.copy(a).add(b).multiplyScalar(0.5)
  tmp.m.y += arc * 2
  const u = 1 - t
  out.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(tmp.m, 2 * u * t).addScaledVector(b, t * t)
  return out
}

export function ArenaFx({ arch }: { arch: Archetype }) {
  const { camera } = useThree()
  const geo = useMemo(sparkGeometry, [])
  const tex = useMemo(() => ({ spark: sparkTexture(), glow: glowTexture() }), [])
  useEffect(
    () => () => {
      geo.dispose()
      tex.spark?.dispose()
      tex.glow?.dispose()
    },
    [geo, tex],
  )

  const bolt = useRef<Mesh>(null)
  const glow = useRef<Mesh>(null)
  const ghosts = useRef<(Mesh | null)[]>([])
  const ring = useRef<Mesh>(null)
  const ring2 = useRef<Mesh>(null)
  const sparks = useRef<(Mesh | null)[]>([])
  const pieces = useRef<(Mesh | null)[]>([])
  const confetti = useRef<InstancedMesh>(null)

  const sim = useMemo(
    () => ({
      burstOf: -1, // the beat whose burst the pieces are flying for
      p: Array.from({ length: BURST.pieces }, () => ({ pos: new Vector3(), vel: new Vector3(), rot: new Vector3(), spin: new Vector3(), size: 0 })),
      colors: [] as Color[],
    }),
    [],
  )

  // Confetti colours, once.
  useEffect(() => {
    const c = confetti.current
    if (!c) return
    const col = new Color()
    for (let i = 0; i < BURST.confetti; i++) c.setColorAt(i, col.set(BURST.colors[i % BURST.colors.length]))
    if (c.instanceColor) c.instanceColor.needsUpdate = true
  }, [])

  useFrame((_, delta) => {
    const F = arenaFrame
    const f = useFight.getState()
    const beat = f.beat
    const now = F.now
    const dt = Math.min(delta, 0.05)
    tmp.right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    tmp.up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const boss = ARENA.boss
    const target = tmp.b.set(boss.x + BOLT.to[0], FLOOR_Y + BOLT.to[1], boss.z + BOLT.to[2])

    // ---- The star bolt: from his hand mid-dash, over an arc, into the boss.
    const p = boltProgress(beat, now)
    const from = tmp.a.set(F.guyAt.x + DASH * BOLT.dashAt + BOLT.from[0], F.guyAt.y + BOLT.from[1], F.guyAt.z + BOLT.from[2])
    const flight = BEAT.hit.impact - BEAT.hit.launch
    const place = (m: Mesh | null | undefined, t: number, scale: number, opacity: number) => {
      if (!m) return
      m.visible = t >= 0 && opacity > 0.01
      if (!m.visible) return
      bezier(from, target, BOLT.arc, t, m.position)
      m.quaternion.copy(camera.quaternion)
      m.rotateZ(-t * BOLT.spin)
      m.scale.setScalar(scale)
      ;(m.material as MeshBasicMaterial).opacity = opacity
    }
    place(bolt.current, p, BOLT.size * (0.6 + 0.6 * p), 1)
    place(glow.current, p, BOLT.size * BOLT.glow * (0.7 + 0.5 * p), 0.9)
    for (let i = 0; i < ghosts.current.length; i++) {
      const t = p < 0 ? -1 : p - ((i + 1) * BOLT.trailGap) / flight
      const fade = 1 - (i + 1) / (BOLT.trail + 1)
      place(ghosts.current[i], t, BOLT.size * (0.6 + 0.6 * Math.max(0, t)) * fade, 0.55 * fade)
    }

    // ---- Impact ring + sparks: on the boss for a hit, between them for a lunge.
    const u = sinceImpact(beat, now)
    const R = BOLT.ring
    const S = BOLT.sparks
    const miss = beat?.kind === 'miss'
    const at = miss
      ? tmp.m.set(F.guyAt.x + BOLT.clash[0], FLOOR_Y + BOLT.clash[1], (laneZ(ARENA.guy.x, SPOTS) + boss.z) / 2 + BOLT.clash[2])
      : target
    const ringOn = beat && u >= 0 && u < R.ms
    const r = ring.current
    if (r) {
      r.visible = !!ringOn
      if (ringOn) {
        const k = u / R.ms
        r.position.copy(at)
        r.quaternion.copy(camera.quaternion)
        r.scale.setScalar(1 + (R.grow - 1) * outCubic(k) * (miss ? 1.3 : 1))
        const m = r.material as MeshBasicMaterial
        m.opacity = 1 - k
        m.color.set(miss ? BOLT.colors.miss : BOLT.colors.hit)
      }
    }
    const sparkOn = beat && u >= 0 && u < S.ms
    for (let i = 0; i < sparks.current.length; i++) {
      const m = sparks.current[i]
      if (!m) continue
      m.visible = !!sparkOn
      if (!sparkOn) continue
      const k = u / S.ms
      const a = (i / S.n) * Math.PI * 2 + 0.4
      const d = S.dist * outCubic(k) * (0.75 + 0.5 * rnd(i, beat.id))
      m.position.copy(at).addScaledVector(tmp.right, Math.cos(a) * d).addScaledVector(tmp.up, Math.sin(a) * d)
      m.quaternion.copy(camera.quaternion)
      m.rotateZ(k * 3 + i)
      m.scale.setScalar(Math.max(1e-3, S.size * (1 - k) * (miss ? 1.2 : 1)))
    }

    // ---- KO: a white ring, the pieces and the confetti (reduced motion: the ring only, like the HUD's confetti).
    const gone = F.boss.gone && beat?.kind === 'ko'
    const age = gone ? F.boss.burstAge : -1
    const fly = gone && !f.reduced
    const r2 = ring2.current
    if (r2) {
      r2.visible = gone && age < R.ms * 1.6
      if (r2.visible) {
        const k = age / (R.ms * 1.6)
        r2.position.set(F.bossAt.x, F.bossAt.y + 1.1, F.bossAt.z + 0.3)
        r2.quaternion.copy(camera.quaternion)
        r2.scale.setScalar(1.5 + 5 * outCubic(k))
        ;(r2.material as MeshBasicMaterial).opacity = 1 - k
      }
    }

    if (gone && beat && sim.burstOf !== beat.id) {
      sim.burstOf = beat.id
      sim.p.forEach((pc, i) => {
        pc.pos.set(F.bossAt.x + (rnd(i, 1) - 0.5) * 1.4, F.bossAt.y + 0.5 + rnd(i, 2) * 1.2, F.bossAt.z + (rnd(i, 3) - 0.5) * 0.8)
        pc.vel.set((rnd(i, 4) - 0.5) * 7, 3 + rnd(i, 5) * 5, (rnd(i, 6) - 0.2) * 3)
        pc.rot.set(0, 0, 0)
        pc.spin.set((rnd(i, 7) - 0.5) * 18, (rnd(i, 8) - 0.5) * 18, (rnd(i, 9) - 0.5) * 18)
        pc.size = 0.14 + rnd(i, 10) * 0.2
      })
    }
    const life = age / 1000
    for (let i = 0; i < pieces.current.length; i++) {
      const m = pieces.current[i]
      if (!m) continue
      m.visible = fly && life < BURST.life
      if (!m.visible) continue
      const pc = sim.p[i]
      pc.vel.y -= BURST.gravity * dt
      pc.pos.addScaledVector(pc.vel, dt)
      const floor = FLOOR_Y + pc.size / 2
      if (pc.pos.y < floor) {
        pc.pos.y = floor
        pc.vel.y = Math.abs(pc.vel.y) * BURST.bounce
        pc.vel.x *= 0.7
        pc.vel.z *= 0.7
        pc.spin.multiplyScalar(0.6)
      }
      pc.rot.addScaledVector(pc.spin, dt)
      m.position.copy(pc.pos)
      m.rotation.set(pc.rot.x, pc.rot.y, pc.rot.z)
      m.scale.setScalar(pc.size * (1 - Math.max(0, (life - BURST.life * 0.6) / (BURST.life * 0.4))))
    }

    const c = confetti.current
    if (c) {
      const t = age / 1000
      c.visible = fly && t < BURST.confettiLife
      if (c.visible) {
        const drag = 1.6
        const g = BURST.confettiGravity
        for (let i = 0; i < BURST.confetti; i++) {
          const vx = (rnd(i, 11) - 0.5) * 9
          const vy = 3 + rnd(i, 12) * 6
          const vz = (rnd(i, 13) - 0.3) * 3
          const e = (1 - Math.exp(-drag * t)) / drag
          const x = F.bossAt.x + vx * e + Math.sin(t * 4 + i) * 0.12
          const y = Math.max(FLOOR_Y + 0.01, F.bossAt.y + 1.2 + (vy + g / drag) * e - (g * t) / drag)
          const z = F.bossAt.z + vz * e
          tmp.e.set(t * (3 + rnd(i, 14) * 6), t * (2 + rnd(i, 15) * 5), i)
          tmp.q.setFromEuler(tmp.e)
          const s = 1 - Math.max(0, (t - BURST.confettiLife * 0.7) / (BURST.confettiLife * 0.3))
          tmp.s.setScalar(Math.max(1e-3, s))
          tmp.mat.compose(tmp.m.set(x, y, z), tmp.q, tmp.s)
          c.setMatrixAt(i, tmp.mat)
        }
        c.instanceMatrix.needsUpdate = true
      }
    }
  })

  const pieceColors = [arch.body, arch.shade, BOSS_SHAPE.tire, '#ffffff']
  return (
    <group name="boss-fx">
      <mesh ref={glow} visible={false} renderOrder={10}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={tex.glow} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      {Array.from({ length: BOLT.trail }, (_, i) => (
        <mesh key={i} ref={(m) => void (ghosts.current[i] = m)} geometry={geo} visible={false} renderOrder={11}>
          <meshBasicMaterial map={tex.spark} transparent depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={bolt} geometry={geo} visible={false} renderOrder={12}>
        <meshBasicMaterial map={tex.spark} transparent depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={ring} visible={false} renderOrder={12}>
        <ringGeometry args={[BOLT.ring.inner, BOLT.ring.outer, 48]} />
        <meshBasicMaterial transparent depthWrite={false} depthTest={false} side={DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={ring2} visible={false} renderOrder={12}>
        <ringGeometry args={[BOLT.ring.inner, BOLT.ring.outer, 48]} />
        <meshBasicMaterial color={BOLT.colors.burst} transparent depthWrite={false} depthTest={false} side={DoubleSide} toneMapped={false} />
      </mesh>
      {Array.from({ length: BOLT.sparks.n }, (_, i) => (
        <mesh key={i} ref={(m) => void (sparks.current[i] = m)} geometry={geo} visible={false} renderOrder={12}>
          <meshBasicMaterial color={GEMINI[i % GEMINI.length]} transparent depthWrite={false} depthTest={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: BURST.pieces }, (_, i) => (
        <mesh key={i} ref={(m) => void (pieces.current[i] = m)} visible={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={pieceColors[i % pieceColors.length]} roughness={0.5} />
        </mesh>
      ))}
      <instancedMesh ref={confetti} args={[undefined, undefined, BURST.confetti]} visible={false} frustumCulled={false}>
        <planeGeometry args={[0.09, 0.15]} />
        <meshBasicMaterial side={DoubleSide} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

