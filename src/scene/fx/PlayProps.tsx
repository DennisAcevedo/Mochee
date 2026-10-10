import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Float32BufferAttribute, SphereGeometry, Vector3, type Group } from 'three'
import { PLAY } from '../../play/config'
import { usePlay, type PlayProp } from '../../play/playStore'
import { anchors } from '../anchors'
import { PROPS } from './config'

// The things thrown to Gemini Guy: a beach ball that arcs into his hands (he
// holds it, then tosses it back out of frame) and a doughnut that arcs into
// his mouth and shrinks away. Timings come from PLAY, so the flight lands
// exactly when actions.ts fires the catch / yum clip and the XP.

const from = new Vector3()
const to = new Vector3()
const tmp = new Vector3()

// Parabolic hop from `a` to `b`, `arc` above the straight line at the middle.
function arcPoint(a: Vector3, b: Vector3, arc: number, t: number, out: Vector3) {
  out.lerpVectors(a, b, t)
  out.y += arc * 4 * t * (1 - t)
  return out
}

const easeIn = (t: number) => t * t

function ballTarget(out: Vector3) {
  const B = PROPS.ball
  if (B.hands === 'right') out.copy(anchors.handR)
  else out.addVectors(anchors.handL, anchors.handR).multiplyScalar(0.5)
  out.z += B.handsForward
  return out
}

// Six-gore beach ball with white poles, coloured per vertex.
function beachBallGeometry() {
  const B = PROPS.ball
  const g = new SphereGeometry(B.radius, 36, 24)
  const pos = g.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const gores = B.gores.map((c) => new Color(c))
  const white = new Color('#ffffff')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const angle = Math.atan2(z, x) + Math.PI
    const c = Math.abs(y) / B.radius > B.poleCap ? white : gores[Math.floor((angle / (Math.PI * 2)) * gores.length) % gores.length]
    colors.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}

function Ball({ prop }: { prop: PlayProp }) {
  const ref = useRef<Group>(null)
  const geometry = useMemo(beachBallGeometry, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const B = PROPS.ball
  const { flightMs, holdMs } = PLAY.catch

  useFrame(() => {
    const g = ref.current
    if (!g) return
    const ms = performance.now() - prop.born
    from.set(...B.from)
    ballTarget(to)

    if (ms < flightMs) {
      const t = ms / flightMs
      arcPoint(from, to, B.arc, t, g.position)
      g.rotation.set(B.tilt, ms * 0.001 * B.spin, 0)
      g.scale.setScalar(1)
    } else if (ms < flightMs + holdMs) {
      // In his hands: follow them, with a squash on landing that settles.
      const k = (ms - flightMs) / holdMs
      g.position.copy(to)
      const squash = B.squash * Math.exp(-k * 8) * Math.cos(k * 30)
      g.scale.set(1 + squash, 1 - squash, 1 + squash)
    } else {
      // Tossed back out of frame.
      const k = Math.min(1, (ms - flightMs - holdMs) / B.tossBackMs)
      tmp.set(...B.tossTo)
      arcPoint(to, tmp, B.arc * 0.8, k, g.position)
      g.rotation.y -= B.spin / 60
      g.scale.setScalar(1)
      if (k >= 1) usePlay.getState().removeProp(prop.id)
    }
  })

  return (
    <group ref={ref} position={B.from}>
      <mesh geometry={geometry} castShadow>
        {/* Not tone-mapped, so the gores stay as bold as the palette. */}
        <meshPhysicalMaterial vertexColors roughness={0.42} clearcoat={0.4} clearcoatRoughness={0.25} toneMapped={false} />
      </mesh>
    </group>
  )
}

// Doughnut facing the camera: dough ring, glossy icing on the front, sprinkles.
function Snack({ prop }: { prop: PlayProp }) {
  const ref = useRef<Group>(null)
  const S = PROPS.snack
  const { flightMs, gulpMs } = PLAY.snack
  const r = S.size / 2
  const sprinkles = useMemo(
    () =>
      Array.from({ length: S.sprinkles }, (_, i) => {
        const a = (i / S.sprinkles) * Math.PI * 2 + Math.random() * 0.3
        const d = r * (0.48 + Math.random() * 0.36)
        return {
          position: [Math.cos(a) * d, Math.sin(a) * d, r * 0.3] as [number, number, number],
          rotation: [0, 0, Math.random() * Math.PI] as [number, number, number],
          color: S.sprinkleColors[i % S.sprinkleColors.length],
        }
      }),
    [S.sprinkles, S.sprinkleColors, r],
  )

  useFrame(() => {
    const g = ref.current
    if (!g) return
    const ms = performance.now() - prop.born
    from.set(...S.from)
    to.copy(anchors.tutor).add(tmp.set(...S.mouth))

    if (ms < flightMs) {
      arcPoint(from, to, S.arc, ms / flightMs, g.position)
      g.rotation.set(0.35, 0, -ms * 0.001 * S.spin)
      g.scale.setScalar(1)
    } else {
      const k = Math.min(1, (ms - flightMs) / gulpMs)
      g.position.copy(to)
      g.scale.setScalar(1 - easeIn(k))
      if (k >= 1) usePlay.getState().removeProp(prop.id)
    }
  })

  return (
    <group ref={ref} position={S.from}>
      <mesh castShadow>
        <torusGeometry args={[r * 0.68, r * 0.32, 18, 40]} />
        <meshPhysicalMaterial color={S.dough} roughness={0.7} sheen={0.6} />
      </mesh>
      <mesh position={[0, 0, r * 0.1]} scale={[1, 1, 0.62]}>
        <torusGeometry args={[r * 0.68, r * 0.335, 18, 40]} />
        <meshPhysicalMaterial color={prop.color} roughness={0.25} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
      {sprinkles.map((s, i) => (
        <mesh key={i} position={s.position} rotation={s.rotation}>
          <capsuleGeometry args={[r * 0.035, r * 0.12, 3, 6]} />
          <meshStandardMaterial color={s.color} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

export function PlayProps() {
  const props = usePlay((s) => s.props)
  return (
    <group name="play-props">
      {props.map((p) => (p.kind === 'ball' ? <Ball key={p.id} prop={p} /> : <Snack key={p.id} prop={p} />))}
    </group>
  )
}
