import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import { MathUtils, Vector3, type Group } from 'three'
import { abilityById, type AbilitySpec, type PropBlock } from '../../growth/abilities'
import { useAbilityRun } from '../../growth/perform'
import { secondsSince } from '../../growth/timeline'
import { anchors } from '../anchors'
import { FLOOR_Y, PALETTE } from '../layout3d'
import { Text as Label } from './Text'
import { PROPS } from './config'

// The props an ability performance uses: job blocks he juggles, orbits,
// sorts or stacks, a ball that bounces into his hands, a book he flips. Each
// routine is a pure function of the seconds since the run started, placed
// relative to his live head and hand anchors, so a run always looks the same.
// Mount once inside the Canvas; it draws nothing between performances.

const B = PROPS.block
const smooth = (x: number) => MathUtils.smootherstep(x, 0, 1)
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)

interface Pose {
  p: Vector3
  rx: number
  ry: number
  rz: number
  s: number
}

const poses: Pose[] = Array.from({ length: 3 }, () => ({ p: new Vector3(), rx: 0, ry: 0, rz: 0, s: 0 }))
const head = new Vector3()
const mid = new Vector3()
const tmp = new Vector3()
const catchOffset = new Vector3(0, 0.05, 0.15)
const lineUp = new Vector3()

// Overall scale envelope: pop in, hold, pop out at the end.
function envelope(t: number, duration: number): number {
  const inS = clamp01(t / PROPS.popIn)
  const outS = clamp01((duration - t) / PROPS.popOut)
  return Math.min(1 - (1 - inS) ** 3, outS)
}

// A little bounce in scale ('ta-da').
const tada = (t: number, at: number) => (t > at ? 1 + 0.28 * Math.exp(-(t - at) * 6) * Math.sin((t - at) * 18) : 1)

function sortedWidth(b: PropBlock) {
  return Math.max(PROPS.sort.minWidth, (b.size ?? 1) * PROPS.sort.unit + 0.14)
}

// Row of blocks centred on x = 0, left to right in `order`; returns each block's x.
function rowX(blocks: PropBlock[], order: number[]): number[] {
  const g = PROPS.sort.gap
  const total = order.reduce((s, i) => s + sortedWidth(blocks[i]), 0) + g * (order.length - 1)
  const xs = new Array<number>(blocks.length)
  let x = -total / 2
  for (const i of order) {
    const w = sortedWidth(blocks[i])
    xs[i] = x + w / 2
    x += w + g
  }
  return xs
}

function routine(spec: AbilitySpec, t: number) {
  head.copy(anchors.tutor)
  head.z += PROPS.front
  mid.copy(anchors.handL).add(anchors.handR).multiplyScalar(0.5)
  mid.z = head.z
  const env = envelope(t, spec.duration)
  const n = spec.blocks.length

  for (let i = 0; i < n; i++) {
    const q = poses[i]
    q.rx = q.ry = q.rz = 0
    q.s = env

    switch (spec.routine) {
      case 'juggle': {
        const J = PROPS.juggle
        const th = Math.PI * 2 * (t * J.rate + i / n)
        const sin = Math.sin(th)
        const juggle = tmp.set(mid.x + Math.cos(th) * J.halfSpan, mid.y + J.lift + (sin > 0 ? sin * J.arc : sin * 0.06), mid.z)
        const line = lineUp.set(head.x + (i - (n - 1) / 2) * J.lineGap, head.y + J.lineY, head.z + 0.05)
        q.p.copy(juggle).lerp(line, smooth(clamp01((t - J.lineupAt) / J.lineupFor)))
        q.rz = (1 - clamp01((t - J.lineupAt) / J.lineupFor)) * th
        q.s = env * tada(t, J.tadaAt + i * 0.06)
        break
      }
      case 'orbit': {
        const O = PROPS.orbit
        const a = Math.PI * 2 * (t * O.rate + i / n)
        const turn = Math.floor(t / O.turn) % n === i
        q.p.set(head.x + Math.cos(a) * O.radius, head.y + O.y + (turn ? O.lift : 0), head.z + Math.sin(a) * O.radius * 0.6)
        q.ry = -a
        q.s = env * (turn ? 1.2 : 0.9)
        break
      }
      case 'sort': {
        const S = PROPS.sort
        const arrival = spec.blocks.map((_, k) => k)
        const sorted = [...arrival].sort((a, b) => (spec.blocks[a].size ?? 0) - (spec.blocks[b].size ?? 0) || a - b)
        const from = rowX(spec.blocks, arrival)[i]
        const to = rowX(spec.blocks, sorted)[i]
        const k = smooth(clamp01((t - S.sortAt) / S.sortFor))
        q.p.set(head.x + MathUtils.lerp(from, to, k), head.y + S.y + Math.sin(k * Math.PI) * S.hop * (from > to ? 1 : -0.4), head.z + 0.05)
        q.s = Math.min(env, clamp01((t - i * S.appearEvery) / PROPS.popIn)) * tada(t, S.sortAt + S.sortFor)
        break
      }
      case 'stack': {
        const S = PROPS.stack
        const land = i * S.every + S.fall
        const restY = head.y + S.y + i * (B.size + 0.02)
        const fallK = clamp01((t - i * S.every) / S.fall)
        q.p.set(head.x, MathUtils.lerp(restY + S.dropFrom, restY, fallK * fallK), head.z)
        q.s = Math.min(env, t >= i * S.every ? 1 : 0) * (t > land ? 1 + 0.15 * Math.exp(-(t - land) * 10) : 1)
        if (i === n - 1 && t > S.popAt) {
          // Last in, first out: the top block pops off and spins away.
          const k = clamp01((t - S.popAt) / S.popFor)
          q.p.x += k * 0.9
          q.p.y += Math.sin(k * Math.PI) * 0.5 + k * 0.2
          q.rz = -k * Math.PI * 2
          q.s *= 1 - k
        }
        break
      }
      case 'bounce': {
        const Bo = PROPS.bounce
        const floor = FLOOR_Y + Bo.radius
        const x = head.x + Bo.dx
        const z = head.z + Bo.dz
        // Ballistic drop with lossy bounces, solved analytically per segment.
        let y0 = head.y + Bo.dropFrom - floor
        let v = 0
        let tt = Math.min(t, Bo.catchAt)
        let y = y0
        for (let guard = 0; guard < 12; guard++) {
          const disc = v * v + 2 * Bo.gravity * y0
          const hit = (v + Math.sqrt(disc)) / Bo.gravity
          if (tt < hit) {
            y = y0 + v * tt - 0.5 * Bo.gravity * tt * tt
            break
          }
          tt -= hit
          v = Math.sqrt(disc) * Bo.restitution
          y0 = 0
          y = 0
        }
        q.p.set(x, floor + y, z)
        if (t > Bo.catchAt) q.p.lerp(tmp.copy(anchors.handR).add(catchOffset), smooth(clamp01((t - Bo.catchAt) / Bo.catchFor)))
        q.rx = t * 4
        break
      }
      case 'flip': {
        const F = PROPS.flip
        const k = clamp01(t / F.flipFor)
        q.p.set(head.x, head.y + F.y + Math.sin(k * Math.PI) * F.rise, head.z + 0.05)
        q.rx = -smooth(k) * Math.PI * 2 * F.turns
        break
      }
    }
  }
}

function Block({ block, index, spec }: { block: PropBlock; index: number; spec: AbilitySpec }) {
  const ref = useRef<Group>(null)
  const color = PALETTE[block.color]
  const w = spec.routine === 'sort' ? sortedWidth(block) : B.size

  useFrame(() => {
    const g = ref.current
    if (!g) return
    const q = poses[index]
    g.position.copy(q.p)
    g.rotation.set(q.rx, q.ry, q.rz)
    g.scale.setScalar(Math.max(q.s, 0.0001))
  })

  if (spec.routine === 'bounce') {
    return (
      <group ref={ref} scale={0.0001}>
        <mesh castShadow>
          <sphereGeometry args={[PROPS.bounce.radius, 32, 24]} />
          <meshStandardMaterial color={color} roughness={0.35} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[PROPS.bounce.radius * 1.002, 0.018, 8, 40]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      </group>
    )
  }

  if (spec.routine === 'flip') {
    const [bw, bh, bd] = PROPS.flip.size
    return (
      <group ref={ref} scale={0.0001}>
        <mesh castShadow>
          <boxGeometry args={[bw, bh, bd]} />
          <meshStandardMaterial color={color} roughness={0.45} />
        </mesh>
        <mesh position={[bw / 2, 0, 0]}>
          <boxGeometry args={[0.03, bh * 0.9, bd * 0.7]} />
          <meshStandardMaterial color="#ffffff" roughness={0.7} />
        </mesh>
        <Label size={B.label} color="#ffffff" anchorX="center" position={[0, 0, bd / 2 + 0.003]}>
          {block.label}
        </Label>
      </group>
    )
  }

  return (
    <group ref={ref} scale={0.0001}>
      <RoundedBox args={[w, B.size, B.size]} radius={B.radius} smoothness={3} castShadow>
        <meshStandardMaterial color={color} roughness={0.4} />
      </RoundedBox>
      <Label size={B.label} color={block.color === 'sun' ? PALETTE.ink : '#ffffff'} anchorX="center" position={[0, 0, B.size / 2 + 0.003]}>
        {block.label}
      </Label>
    </group>
  )
}

function Run({ spec, startedAt }: { spec: AbilitySpec; startedAt: number }) {
  // Negative priority: runs before the blocks' own frame callbacks (a positive
  // one would take over rendering).
  useFrame(() => routine(spec, secondsSince(startedAt)), -1)
  return (
    <group name={`evo-ability-${spec.id}`}>
      {spec.blocks.map((b, i) => (
        <Block key={i} block={b} index={i} spec={spec} />
      ))}
    </group>
  )
}

export function AbilityProps() {
  const run = useAbilityRun((s) => s.run)
  const spec = run ? abilityById(run.id) : null
  if (!run || !spec) return null
  return (
    <Suspense fallback={null}>
      <Run key={run.runId} spec={spec} startedAt={run.startedAt} />
    </Suspense>
  )
}
