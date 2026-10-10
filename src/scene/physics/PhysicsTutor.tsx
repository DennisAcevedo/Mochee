import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import type { RigidBodyType } from '@dimforge/rapier3d-compat'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { MathUtils, Quaternion, Vector3, type Group, type Object3D, type Vector3Tuple } from 'three'
import { useDirector, type LoopClip } from '../../state/director'
import { useMode } from '../../state/mode'
import { PHYSICS, PLAY_CLIPS, ROOM_BOX } from './config'
import { clampLength, Grabber, spinFromVelocity } from './grab'
import { playHandlers, usePlayBody, type PlayBodyState } from './playBody'

// The tutor as one physical body. In study mode he is kinematic and simply
// follows wherever the director puts him. In play / celebrate mode a held
// press picks him up (he dangles on a spring under the pointer, playing the
// 'dragged' loop), letting go flings him as a whole-body dynamic capsule that
// tumbles and bounces around the room, and once he settles he pops back
// upright with a 'recover' one-shot and a burst of stars, standing where he
// landed. A quick tap is passed to onTap (the existing tickle / poke).
//
// Drop it around the existing tutor: <PhysicsTutor onTap={poke}><BlenderTutorSafe /></PhysicsTutor>.
// The child may place itself (BlenderTutor moves its own root to the director's
// spot: leave `position` unset and its first object's position is read as his
// feet), or draw at its local origin (pass `position` = his feet).
// Do not pass onPoke to BlenderTutor as well: it stops the press reaching here.
// Must sit inside <PhysicsRoom>, in room space (no transformed parent).

const C = PHYSICS.tutor
const ROT_KINEMATIC = 2 as RigidBodyType // RigidBodyType.KinematicPositionBased
const ROT_DYNAMIC = 0 as RigidBodyType // RigidBodyType.Dynamic
const IDENTITY = new Quaternion()

export interface PhysicsTutorProps {
  children: ReactNode
  onTap?: () => void
  position?: Vector3Tuple // his feet, when the children draw at their local origin
}

// Scratch state for one tutor; preallocated so the frame loop never allocates.
class TutorBody {
  state: PlayBodyState = 'idle'
  readonly grab = new Grabber(C.radius + C.halfHeight)
  readonly offset = new Vector3() // where he landed, relative to his director-driven home
  readonly pivot = new Vector3() // body centre in the pose group's local space
  readonly base = new Vector3()
  readonly center = new Vector3() // body centre, world
  readonly quat = new Quaternion()
  readonly prevCenter = new Vector3()
  readonly prevQuat = new Quaternion()
  readonly from = new Vector3() // recovery start / end
  readonly to = new Vector3()
  readonly fromQuat = new Quaternion()
  readonly swingQuat = new Quaternion()
  readonly v = new Vector3()
  readonly spin = new Vector3()
  readonly euler = { x: 0, z: 0 } // held swing
  settle = 0
  flight = 0
  recover = 0
  placed = false // body teleported onto him at least once
  savedLoop: LoopClip | null = null
  tossSide = 1
}

export function PhysicsTutor({ children, onTap, position }: PhysicsTutorProps) {
  const gl = useThree((s) => s.gl)
  const playing = useMode((s) => s.mode !== 'study')
  const rb = useRef<RapierRigidBody>(null)
  const probe = useRef<Object3D>(null)
  const pose = useRef<Group>(null)
  const body = useMemo(() => new TutorBody(), [])
  const props = useRef({ onTap, position })
  useEffect(() => {
    props.current = { onTap, position }
  }, [onTap, position])

  const setState = (s: PlayBodyState) => {
    body.state = s
    usePlayBody.getState().setState(s)
  }

  const enterHeld = () => {
    const r = rb.current
    if (!r) return
    const d = useDirector.getState()
    if (body.state === 'idle') body.savedLoop = d.loop
    r.setBodyType(ROT_KINEMATIC, true)
    if (PLAY_CLIPS.pickUp) d.play(PLAY_CLIPS.pickUp)
    if (d.loop !== PLAY_CLIPS.held) d.setLoop(PLAY_CLIPS.held)
    body.euler.x = body.euler.z = 0
    setState('held')
  }

  const enterFlying = (vel: Vector3) => {
    const r = rb.current
    if (!r) return
    const d = useDirector.getState()
    if (body.state === 'idle') body.savedLoop = d.loop
    clampLength(vel, C.maxFlingSpeed)
    spinFromVelocity(vel, C.spinPerSpeed, C.maxSpin, body.spin)
    r.setBodyType(ROT_DYNAMIC, true)
    r.setTranslation(body.center, true)
    r.setRotation(body.quat, true)
    r.setLinvel(vel, true)
    r.setAngvel(body.spin, true)
    if (d.loop !== PLAY_CLIPS.flying) d.setLoop(PLAY_CLIPS.flying)
    body.settle = 0
    body.flight = 0
    body.prevCenter.copy(body.center)
    body.prevQuat.copy(body.quat)
    setState('flying')
  }

  const enterRecovering = () => {
    const r = rb.current
    if (!r) return
    r.setBodyType(ROT_KINEMATIC, true)
    body.grab.cancel()
    body.from.copy(body.center)
    body.fromQuat.copy(body.quat)
    // Land inside the floor area, standing on the floor.
    const L = C.landing
    const feetY = body.base.y + body.pivot.y - C.centerY
    body.to.set(MathUtils.clamp(body.center.x, -L.xMax, L.xMax), feetY + C.centerY, MathUtils.clamp(body.center.z, L.zMin, L.zMax))
    body.recover = 0
    const d = useDirector.getState()
    // Hand-off rule (animController): setLoop then play in one tick, or the tumble loop (100) blocks the recover (90).
    d.setLoop(body.savedLoop ?? 'idle')
    body.savedLoop = null
    if (PLAY_CLIPS.recover) d.play(PLAY_CLIPS.recover)
    setState('recovering')
  }

  // Keyboard / HUD toss.
  useEffect(() => {
    playHandlers.toss = () => {
      if (useMode.getState().mode === 'study' || body.state !== 'idle' || body.grab.active) return false
      const t = C.toss
      body.tossSide = -body.tossSide
      // Toss toward the room's middle when he stands off to one side.
      const side = Math.abs(body.center.x) > 1 ? -Math.sign(body.center.x) : body.tossSide
      body.quat.identity()
      enterFlying(body.v.set(side * t.side, t.up, t.back))
      return true
    }
    return () => {
      playHandlers.toss = null
    }
  }, [body])

  // Touch drags must never scroll the page; restore on leaving play.
  useEffect(() => {
    if (!playing) return
    const el = gl.domElement
    const prev = el.style.touchAction
    el.style.touchAction = 'none'
    return () => {
      el.style.touchAction = prev
    }
  }, [gl, playing])

  // Leaving or unmounting mid-drag: drop the pointer and the cursor.
  useEffect(
    () => () => {
      body.grab.cancel()
      document.body.style.cursor = ''
    },
    [body],
  )

  // Before the mixer and the anchors (priority -1, subscribed after the
  // BlenderTutor's own -1 placement), so his head anchor follows the body.
  useFrame((state, delta) => {
    const p = pose.current
    const r = rb.current
    if (!p || !r) return
    const dt = Math.min(delta, PHYSICS.maxDt)
    const play = useMode.getState().mode !== 'study'
    const given = props.current.position

    // Home: where the director has him (his feet) plus the landing offset.
    const child = given ? null : p.children[0]
    if (given) body.base.set(given[0], given[1], given[2])
    else body.base.set(0, 0, 0)
    if (child) body.pivot.copy(child.position)
    else body.pivot.set(0, 0, 0)
    body.pivot.y += C.centerY

    // Pointer.
    const canPick = play && (body.state === 'idle' || body.state === 'flying')
    const ev = body.grab.update(dt, state.camera, state.size, body.center, canPick)
    if (ev === 'tap' && body.state === 'idle') props.current.onTap?.()
    else if (ev === 'pick') enterHeld()
    else if (ev === 'release') enterFlying(body.v.copy(body.grab.releaseVel))
    if (!play && (body.state === 'held' || body.state === 'flying')) enterRecovering()

    switch (body.state) {
      case 'idle': {
        if (!play) body.offset.multiplyScalar(Math.exp(-C.returnDamp * dt))
        p.position.copy(body.base).add(body.offset)
        p.quaternion.identity()
        body.center.copy(p.position).add(body.pivot)
        body.quat.identity()
        // Paused world in study mode: teleport. Playing: move, so he shoves toys.
        if (play && body.placed) r.setNextKinematicTranslation(body.center)
        else r.setTranslation(body.center, false)
        r.setNextKinematicRotation(IDENTITY)
        body.placed = true
        break
      }
      case 'held': {
        const g = body.grab
        body.center.copy(g.pos)
        const s = C.swing
        const k = 1 - Math.exp(-s.damp * dt)
        body.euler.z += (MathUtils.clamp(-g.vel.x * s.gain, -s.max, s.max) - body.euler.z) * k
        body.euler.x += (MathUtils.clamp(g.vel.z * s.gain, -s.max, s.max) - body.euler.x) * k
        body.quat.setFromAxisAngle(body.v.set(0, 0, 1), body.euler.z)
        body.quat.multiply(body.swingQuat.setFromAxisAngle(body.v.set(1, 0, 0), body.euler.x))
        r.setNextKinematicTranslation(body.center)
        r.setNextKinematicRotation(body.quat)
        break
      }
      case 'flying': {
        const o = probe.current?.parent
        if (o) {
          body.center.copy(o.position)
          body.quat.copy(o.quaternion)
        }
        body.flight += dt
        const speed = body.center.distanceTo(body.prevCenter) / Math.max(dt, 1e-4)
        const spin = (2 * Math.acos(Math.min(1, Math.abs(body.quat.dot(body.prevQuat))))) / Math.max(dt, 1e-4)
        body.settle = speed < C.settleSpeed && spin < C.settleSpin ? body.settle + dt : 0
        body.prevCenter.copy(body.center)
        body.prevQuat.copy(body.quat)
        const lost =
          !Number.isFinite(body.center.x + body.center.y + body.center.z) ||
          Math.abs(body.center.x) > ROOM_BOX.halfW + PHYSICS.respawnMargin ||
          body.center.y < ROOM_BOX.floorY - PHYSICS.respawnMargin
        if (lost) body.center.set(body.base.x + body.pivot.x, ROOM_BOX.floorY + C.centerY, body.base.z + body.pivot.z)
        if (lost || body.settle >= C.settleSeconds || body.flight >= C.maxFlightSeconds) enterRecovering()
        break
      }
      case 'recovering': {
        body.recover = Math.min(1, body.recover + dt / C.recoverSeconds)
        const t = body.recover
        const e = 1 - (1 - t) ** 3
        body.center.lerpVectors(body.from, body.to, e)
        body.center.y += C.recoverHop * Math.sin(Math.PI * t)
        body.quat.slerpQuaternions(body.fromQuat, IDENTITY, e)
        r.setNextKinematicTranslation(body.center)
        r.setNextKinematicRotation(body.quat)
        if (t >= 1) {
          // Stand here from now on: home + offset == the landing spot.
          body.offset.copy(body.to).sub(body.base).sub(body.pivot)
          body.offset.y = 0
          useDirector.getState().burst('stars', 'tutor')
          setState('idle')
        }
        break
      }
    }

    // Pose: rotate the children about his body centre and put that centre on the body.
    if (body.state !== 'idle') {
      p.quaternion.copy(body.quat)
      p.position.copy(body.pivot).applyQuaternion(body.quat)
      p.position.subVectors(body.center, p.position)
    }
    const out = usePlayBody.getState().position
    out[0] = body.center.x
    out[1] = body.center.y
    out[2] = body.center.z
  }, -1)

  const hover = useRef(false)
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    body.grab.press(e.nativeEvent.clientX, e.nativeEvent.clientY, e.pointerId, gl.domElement)
    if (useMode.getState().mode !== 'study') document.body.style.cursor = 'grabbing'
  }
  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hover.current = true
    if (!body.grab.active) document.body.style.cursor = useMode.getState().mode === 'study' ? 'pointer' : 'grab'
  }
  const onPointerOut = () => {
    hover.current = false
    if (!body.grab.active) document.body.style.cursor = ''
  }
  // Cursor after a release: back to grab while still over him.
  useFrame(() => {
    if (body.grab.active || document.body.style.cursor !== 'grabbing') return
    document.body.style.cursor = hover.current ? 'grab' : ''
  })

  // The body never re-renders (its mutable props are constants), so the
  // imperative type switches made above are never reset by React.
  const physicsBody = useMemo(
    () => (
      <RigidBody
        ref={rb}
        type="kinematicPosition"
        colliders={false}
        name="physics-tutor"
        ccd
        linearDamping={C.linearDamping}
        angularDamping={C.angularDamping}
        position={[0, ROOM_BOX.floorY + C.centerY, 0]}
      >
        <CapsuleCollider args={[C.halfHeight, C.radius]} density={C.density} restitution={PHYSICS.restitution} friction={PHYSICS.friction} />
        <object3D ref={probe} />
      </RigidBody>
    ),
    [],
  )

  return (
    <>
      {physicsBody}
      <group ref={pose} name="physics-tutor-pose" onPointerDown={onPointerDown} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
        {children}
      </group>
    </>
  )
}
