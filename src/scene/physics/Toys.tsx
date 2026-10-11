import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { BallCollider, CuboidCollider, RigidBody, useAfterPhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import type { RigidBodyType } from '@dimforge/rapier3d-compat'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { DoubleSide, Quaternion, Vector3, type Group, type Object3D, type Vector3Tuple } from 'three'
import { Basketball } from '../hoops/Basketball'
import { armStudentShot, disarmStudentShot, HOOP_MAGNET, stepStudentShot } from '../hoops/studentShot'
import { useDirector } from '../../state/director'
import { useMode } from '../../state/mode'
import { HOOP_BOARD, PHYSICS, PLAY_CLIPS, ROOM_BOX } from './config'
import { clampLength, Grabber, spinFromVelocity, type GrabMagnet } from './grab'
import { playHandlers, usePlayBody } from './playBody'

// Play-mode toys: a basketball you can hold, carry, throw or drop, a hoop high
// on the right wall that counts the student's own baskets (hoops/studentShot.ts).
// Mounted only in play mode; each toy starts fresh.

const KINEMATIC = 2 as RigidBodyType // RigidBodyType.KinematicPositionBased
const DYNAMIC = 0 as RigidBodyType // RigidBodyType.Dynamic
const IDENTITY = new Quaternion()
const B = PHYSICS.ball
const HOOP = PHYSICS.hoop

interface ToyProps {
  name: string
  spawn: Vector3Tuple
  reach: number // bounding radius: how close to the walls it may be held
  spinPerSpeed: number
  linearDamping: number
  angularDamping: number
  children: ReactNode // colliders and meshes
  onReady?: (api: ToyApi) => void
  magnet?: GrabMagnet // a pull toward a point while held (the ball over the hoop)
  onPick?: () => void // picked up
  onRelease?: (pos: Vector3) => void // let go: a dynamic body again, flying from `pos`
  onRespawn?: () => void // escaped the room and put back at the spawn
}

// What a toy exposes to its owner (shootBall uses the ball's).
interface ToyApi {
  body: () => RapierRigidBody | null
  center: Vector3 // live, room space
  busy: () => boolean // held or pressed
}

// A dynamic body you can pick up (the same hold / fling as the tutor).
function GrabbableToy({ name, spawn, reach, spinPerSpeed, linearDamping, angularDamping, children, onReady, magnet, onPick, onRelease, onRespawn }: ToyProps) {
  const gl = useThree((s) => s.gl)
  const rb = useRef<RapierRigidBody>(null)
  const probe = useRef<Object3D>(null)
  const toy = useMemo(() => ({ grab: new Grabber(reach), center: new Vector3(...spawn), v: new Vector3(), spin: new Vector3(), hover: false }), [reach, spawn])
  toy.grab.magnet = magnet ?? null

  useEffect(() => {
    onReady?.({ body: () => rb.current, center: toy.center, busy: () => toy.grab.active })
  }, [onReady, toy])
  useEffect(
    () => () => {
      toy.grab.cancel()
      if (toy.hover) document.body.style.cursor = ''
    },
    [toy],
  )

  useFrame((state, delta) => {
    const r = rb.current
    const o = probe.current?.parent
    if (!r || !o) return
    const dt = Math.min(delta, PHYSICS.maxDt)
    toy.center.copy(o.position)
    const ev = toy.grab.update(dt, state.camera, state.size, toy.center, true)
    if (ev === 'pick') {
      r.setBodyType(KINEMATIC, true)
      onPick?.()
    }
    if (ev === 'pick' || ev === 'held') r.setNextKinematicTranslation(toy.grab.pos)
    if (ev === 'release') {
      clampLength(toy.v.copy(toy.grab.releaseVel), PHYSICS.tutor.maxFlingSpeed)
      r.setBodyType(DYNAMIC, true)
      r.setTranslation(toy.grab.pos, true)
      r.setLinvel(toy.v, true)
      r.setAngvel(spinFromVelocity(toy.v, spinPerSpeed, PHYSICS.tutor.maxSpin * 2, toy.spin), true)
      document.body.style.cursor = toy.hover ? 'grab' : ''
      onRelease?.(toy.grab.pos)
    }
    // Escaped the room somehow (a tunnelling fling): put it back.
    const m = PHYSICS.respawnMargin
    const c = toy.center
    if (!toy.grab.active && (!Number.isFinite(c.x + c.y + c.z) || c.y < ROOM_BOX.floorY - m || Math.abs(c.x) > ROOM_BOX.halfW + m || c.z > ROOM_BOX.frontZ + m)) {
      r.setTranslation(toy.v.set(...spawn), true)
      r.setRotation(IDENTITY, true)
      r.setLinvel(toy.v.set(0, 0, 0), true)
      r.setAngvel(toy.v, true)
      onRespawn?.()
    }
  })

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    toy.grab.press(e.nativeEvent.clientX, e.nativeEvent.clientY, e.pointerId, gl.domElement)
    document.body.style.cursor = 'grabbing'
  }
  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    toy.hover = true
    if (!toy.grab.active) document.body.style.cursor = 'grab'
  }
  const onPointerOut = () => {
    toy.hover = false
    if (!toy.grab.active) document.body.style.cursor = ''
  }

  return (
    <RigidBody ref={rb} name={name} colliders={false} position={spawn} ccd linearDamping={linearDamping} angularDamping={angularDamping}>
      <object3D ref={probe} />
      <group onPointerDown={onPointerDown} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
        {children}
      </group>
    </RigidBody>
  )
}

// Aim point: just under the rim plane, at the rim's centre.
const AIM = new Vector3(HOOP.rim[0], HOOP.rim[1] - HOOP.aimBelow, HOOP.rim[2])
const shotVel = new Vector3()
const shotSpin = new Vector3()
const shotFrom = new Vector3()
const aim = new Vector3()

export function Ball() {
  const api = useRef<ToyApi | null>(null)
  const onReady = useMemo(() => (a: ToyApi) => (api.current = a), [])
  const look = useRef<Group>(null)

  // The Play tab's ball moves borrow it (src/scene/hoops/BallProp.tsx). The student-shot watch is
  // module state: a fresh ball starts unwatched, and one going away (Study, leaving the page) drops
  // its throw, or the next visit's first step would read the jump to the spawn as the ball's flight.
  useEffect(() => {
    disarmStudentShot()
    playHandlers.ball = {
      body: () => api.current?.body() ?? null,
      busy: () => api.current?.busy() ?? false,
      show: (shown) => {
        if (look.current) look.current.visible = shown
      },
    }
    return () => {
      playHandlers.ball = null
      disarmStudentShot()
    }
  }, [])

  // shootBall(): a ballistic arc whose apex stays under the ceiling and that
  // comes down through the rim (the HUD's keyboard alternative to throwing).
  useEffect(() => {
    playHandlers.shoot = () => {
      const a = api.current
      const r = a?.body()
      if (!a || !r || a.busy()) return false
      const g = -PHYSICS.gravity[1]
      // Standing tutor: the ball pops off the top of his head (a clear path
      // over him); otherwise it leaves from where it lies.
      const body = usePlayBody.getState()
      const p0 = shotFrom
      if (body.state === 'idle') {
        const [x, y, z] = body.position
        p0.set(x, y + PHYSICS.tutor.centerY + B.radius + HOOP.shot.launchGap, z)
        r.setTranslation(p0, true)
        r.setRotation(IDENTITY, true)
        if (PLAY_CLIPS.shoot) useDirector.getState().play(PLAY_CLIPS.shoot)
      } else p0.copy(a.center)
      // Aim a little past the rim centre along the throw (the arc comes in shallow).
      aim.copy(AIM).sub(p0).setY(0).normalize().multiplyScalar(HOOP.shot.lead).add(AIM)
      const top = Math.max(p0.y, aim.y)
      const apex = Math.max(top + HOOP.shot.minApexGap, Math.min(ROOM_BOX.ceilY - HOOP.shot.apexBelowCeil, top + HOOP.shot.minRise))
      const vy = Math.sqrt(2 * g * (apex - p0.y))
      const t = vy / g + Math.sqrt((2 * (apex - aim.y)) / g)
      const drag = 1 / Math.max(0.5, 1 - (B.linearDamping * t) / 2) // make up for linear damping over the flight
      shotVel.set(((aim.x - p0.x) / t) * drag, vy, ((aim.z - p0.z) / t) * drag)
      r.setLinvel(shotVel, true)
      r.setAngvel(spinFromVelocity(shotVel, B.spinPerSpeed, PHYSICS.tutor.maxSpin * 2, shotSpin), true)
      armStudentShot(p0) // a shot like any throw: the hoop counts it
      return true
    }
    return () => {
      playHandlers.shoot = null
    }
  }, [])

  return (
    <GrabbableToy
      name="physics-ball"
      spawn={B.spawn}
      reach={B.radius}
      spinPerSpeed={B.spinPerSpeed}
      linearDamping={B.linearDamping}
      angularDamping={B.angularDamping}
      onReady={onReady}
      magnet={HOOP_MAGNET}
      onPick={disarmStudentShot}
      onRelease={armStudentShot}
      onRespawn={disarmStudentShot}
    >
      <BallCollider args={[B.radius]} density={B.density} restitution={B.restitution} friction={B.friction} />
      {/* A basketball: the seams make the spin read. */}
      <group ref={look}>
        <Basketball radius={B.radius} />
      </group>
    </GrabbableToy>
  )
}

// A static hoop on the right wall: the board and a rim collider made of a ring
// of small balls; the net is drawn only, so a ball that drops through falls
// straight out of it. After every physics step the student-shot watch reads
// the ball (hoops/basket.ts: down through the rim plane inside the rim = a
// make), stepped per step rather than per frame so a fast ball can't cross the
// rim between two looks on a slow frame. `drawn` false keeps the colliders and
// the watch but draws nothing: the play room's Blender hoop (room/RoomProps)
// sits on the same rim and board.
export function Hoop({ drawn = true }: { drawn?: boolean }) {
  const [rx, ry, rz] = HOOP.rim
  const rimBalls = useMemo(
    () =>
      Array.from({ length: HOOP.rimBalls }, (_, i) => {
        const a = (i / HOOP.rimBalls) * Math.PI * 2
        return [rx + Math.cos(a) * HOOP.rimRadius, ry, rz + Math.sin(a) * HOOP.rimRadius] as Vector3Tuple
      }),
    [rx, ry, rz],
  )

  useAfterPhysicsStep(() => {
    const body = playHandlers.ball?.body()
    if (body && !body.isKinematic()) stepStudentShot(body, PHYSICS.timeStep)
  })

  return (
    <RigidBody type="fixed" colliders={false} name="physics-hoop">
      <CuboidCollider args={HOOP_BOARD.half} position={HOOP_BOARD.center} restitution={PHYSICS.restitution} />
      {rimBalls.map((p, i) => (
        <BallCollider key={i} args={[HOOP.rimBallRadius]} position={p} restitution={0.5} />
      ))}

      {drawn && <HoopArt />}
    </RigidBody>
  )
}

// The code-drawn hoop: board, frame, target square, bracket, rim and net.
function HoopArt() {
  const [rx, ry, rz] = HOOP.rim
  const bd = HOOP.board
  const [boardX, boardY] = HOOP_BOARD.center
  const netH = HOOP.net.depth
  return (
    <>
      {/* Backboard: white glass slab with a cobalt frame and target square. */}
      <mesh position={[boardX, boardY, rz]} castShadow>
        <boxGeometry args={[bd.thick, bd.height, bd.width]} />
        <meshStandardMaterial color={bd.color} roughness={0.2} transparent opacity={0.92} />
      </mesh>
      <mesh position={[boardX - bd.thick / 2 - 0.002, boardY, rz]} rotation={[0, -Math.PI / 2, 0]}>
        <ringGeometry args={[bd.height * 0.5 - 0.05, bd.height * 0.5, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial color={bd.edge} side={DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[boardX - bd.thick / 2 - 0.002, ry + 0.17, rz]} rotation={[0, -Math.PI / 2, 0]}>
        <ringGeometry args={[0.15, 0.19, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial color={bd.edge} side={DoubleSide} toneMapped={false} />
      </mesh>
      {/* Bracket from the board to the rim. */}
      <mesh position={[(rx + HOOP.rimRadius + boardX) / 2, ry - 0.02, rz]}>
        <boxGeometry args={[boardX - rx - HOOP.rimRadius, 0.05, 0.12]} />
        <meshStandardMaterial color={HOOP.rimColor} roughness={0.35} />
      </mesh>
      <mesh position={[rx, ry, rz]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[HOOP.rimRadius, HOOP.tube, 12, 48]} />
        <meshStandardMaterial color={HOOP.rimColor} roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Net: an open tapered tube in wireframe. */}
      <mesh position={[rx, ry - netH / 2, rz]}>
        <cylinderGeometry args={[HOOP.rimRadius, HOOP.rimRadius * HOOP.net.bottomScale, netH, 16, 3, true]} />
        <meshBasicMaterial color={HOOP.net.color} wireframe transparent opacity={HOOP.net.opacity} toneMapped={false} />
      </mesh>
    </>
  )
}

// Every toy, live only in play mode.
export function Toys() {
  const playing = useMode((s) => s.mode !== 'study')
  if (!playing) return null
  return (
    <>
      <Ball />
      <Hoop drawn={false} />
    </>
  )
}
