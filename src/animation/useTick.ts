import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { Euler, Quaternion, Vector3, type PerspectiveCamera } from 'three'
import { FACE } from '../character/geometry'
import type { RigRefs, RigState } from '../character/rig'
import { sceneRig } from '../scene/sceneRig'
import {
  BLINK,
  BREATH,
  BROWS,
  BROW_LIFTS,
  CAMERA,
  CAP,
  GROUND,
  HAND_POSES,
  HANDS,
  HEAD,
  HEAD_OFFSETS,
  INTRO,
  LITE,
  LOOK,
  MOUTH,
  READ,
  ROAM,
  SIZE,
  SLEEP,
  SLEEP_MOUTH,
  SPIN_PEAK_SPEED,
  TASSEL,
  TICK,
} from './config'
import type { Accessory } from '../character/look'
import { intro, INTRO_REST, type IntroState } from './introState'

interface Props {
  size: number
  roam: number
  rleft: number
  rright: number
  accessory: Accessory
  introDriven: boolean
  lite: boolean
}

// Characters outside the lesson ignore the intro entirely.
const NO_INTRO: IntroState = { ...INTRO_REST, active: false, snap: false, out: { rise: 0 } }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))
const Y_AXIS = new Vector3(0, 1, 0)

// The [rleft, rright] slice of the frame, in world units at the character's depth.
function region(halfW: number, rleft: number, rright: number) {
  const x0 = (clamp(rleft, 0, 1) * 2 - 1) * halfW
  const x1 = (clamp(rright, 0, 1) * 2 - 1) * halfW
  return { regionW: Math.max(SIZE.regionWidthMin, x1 - x0), cx: (x0 + x1) / 2 }
}

function sizeFor(regionW: number, halfH: number, size: number) {
  return clamp(Math.min(size, regionW / SIZE.regionDivisor, (halfH * 2) / SIZE.heightDivisor), SIZE.min, SIZE.max)
}

// Roaming: layered sines, scaled by `A`. `s` is the current (damped) size.
function roamTarget(out: Vector3, t: number, cx: number, regionW: number, s: number, A: number, bob: number) {
  const roamX = Math.min(ROAM.xMax, Math.max(0, regionW / 2 - ROAM.xClearance * s)) * A
  out.set(
    cx + roamX * (ROAM.x.a1 * Math.sin(t * ROAM.x.f1) + ROAM.x.a2 * Math.sin(t * ROAM.x.f2 + ROAM.x.p2)),
    ROAM.y.base + A * (ROAM.y.a1 * Math.sin(t * ROAM.y.f1 + ROAM.y.p1) + ROAM.y.a2 * Math.sin(t * ROAM.y.f2)) + bob,
    A * (ROAM.z.a1 * Math.sin(t * ROAM.z.f1 + ROAM.z.p1) + ROAM.z.a2 * Math.sin(t * ROAM.z.f2)),
  )
}

// Direct port of Tutor3D.tick(dt) from design/tutor-3d.js, plus the Stage 2
// intro layer (src/animation/introState.ts).
export function useTick(refs: RigRefs, state: RigState, props: Props) {
  const camera = useThree((s) => s.camera as PerspectiveCamera)
  const tmp = useMemo(
    () => ({ v: new Vector3(), goal: new Vector3(), start: new Vector3(), q: new Quaternion(), lagQ: new Quaternion(), e: new Euler() }),
    [],
  )
  const liteClock = useMemo(() => ({ acc: 0 }), [])

  useFrame((frame, delta) => {
    const root = refs.root.current
    const body = refs.body.current
    if (!root || !body) return

    // Idle Home cards tick at a lower rate; the view still redraws each frame.
    let step = delta
    if (props.lite && state.sim.inited) {
      liteClock.acc += delta
      if (liteClock.acc < 1 / LITE.tickHz) return
      step = liteClock.acc
    }
    liteClock.acc = 0

    const I = props.introDriven ? intro : NO_INTRO
    const S = state.sim
    if (I.snap) {
      S.inited = false
      state.hands[0].init = false
      state.hands[1].init = false
      I.snap = false
    }

    const dt = Math.min(TICK.maxDt, step)
    S.t += dt
    const t = S.t
    const pose = state.pose
    const reading = pose === 'read'
    // tutor-3d.js zeroes cursor-follow while asleep or reading; this fades it.
    const calmTarget = pose === 'sleep' || reading ? 1 : 0
    S.calm = S.inited ? damp(S.calm, calmTarget, SLEEP.lookDamp, dt) : calmTarget
    const awake = 1 - S.calm

    // Visible half-extents at the character's depth, and the allowed region.
    const halfH = Math.tan(((camera.fov / 2) * Math.PI) / 180) * CAMERA.distance
    const halfW = halfH * camera.aspect
    const { regionW, cx } = region(halfW, props.rleft, props.rright)
    const sTarget = sizeFor(regionW, halfH, props.size)
    S.s = S.inited ? damp(S.s, sTarget, SIZE.damp, dt) : sTarget
    let s = S.s

    // Roaming target. While the intro runs, roaming fades in through I.roam.
    const A = clamp(props.roam, 0, 1) * (I.active ? I.roam : 1)
    const bob = ROAM.y.a3 * Math.sin(t * ROAM.y.f3)
    const goal = tmp.goal
    roamTarget(goal, t, cx, regionW, S.s, A, bob)
    if (pose === 'celebrate') goal.y += Math.abs(Math.sin(t * ROAM.celebrateBounce.f)) * ROAM.celebrateBounce.amp
    if (pose === 'shrug') goal.y += ROAM.shrugLift.amp * Math.max(0, Math.sin(t * ROAM.shrugLift.f))
    if (reading) goal.set(cx, READ.y + READ.amp * Math.sin(t * READ.f), 0)

    // Intro spin speed drives the stretch, the rise and the flung-out hands.
    let dSpin = I.spin - S.prevSpin
    S.prevSpin = I.spin
    if (Math.abs(dSpin) > INTRO.spin.wrapGuard) dSpin = 0
    S.spinSpeed = damp(S.spinSpeed, clamp(Math.abs(dSpin) / dt / SPIN_PEAK_SPEED, 0, 1), INTRO.spin.speedSmoothing, dt)
    const sp = S.spinSpeed
    const rise = INTRO.spin.rise * sp
    const stretch = INTRO.spin.stretch * sp * sp
    const handOut = sp > 1e-3 ? Math.pow(sp, INTRO.spin.handSnapPower) : 0
    I.out.rise = rise

    if (I.active) {
      // Start-screen spot: the design's <tutor-3d size="1" roam="0.05" rleft="0" rright="1">.
      const r0 = region(halfW, 0, 1)
      const s0 = sizeFor(r0.regionW, halfH, SLEEP.size)
      roamTarget(tmp.start, t, r0.cx, r0.regionW, s0, SLEEP.roam, bob)
      goal.lerpVectors(tmp.start, goal, I.travel)
      goal.y += I.lift + I.hop + rise
      s = s0 + (S.s - s0) * I.travel
    }

    if (!S.inited) {
      root.position.copy(goal)
      state.prev.copy(root.position)
      S.inited = true
    }
    if (I.active) {
      root.position.copy(goal)
    } else {
      root.position.x = damp(root.position.x, goal.x, ROAM.dampX, dt)
      root.position.y = damp(root.position.y, goal.y, ROAM.dampY, dt)
      root.position.z = damp(root.position.z, goal.z, ROAM.dampZ, dt)
    }
    tmp.v.copy(root.position).sub(state.prev).divideScalar(Math.max(dt, 1e-4))
    state.prev.copy(root.position)
    state.vel.lerp(tmp.v, 1 - Math.exp(-ROAM.velSmooth * dt))
    const vel = state.vel

    // Head: cursor follow, pose yaw, celebrate spin, per-pose offsets, velocity lean.
    // Asleep, he ignores the cursor.
    const L = state.look
    L.x = damp(L.x, L.tx, LOOK.damp, dt)
    L.y = damp(L.y, L.ty, LOOK.damp, dt)
    const lookYaw = clamp((L.x * halfW - root.position.x) / halfW, -1, 1) * LOOK.yaw * awake
    S.yawPose = damp(S.yawPose, pose === 'point' ? HEAD.pointYaw : 0, HEAD.pointYawDamp, dt)
    let spin = 0
    if (state.spinT !== null) {
      state.spinT += dt
      const k = clamp(state.spinT / HEAD.spinDuration, 0, 1)
      spin = (1 - Math.pow(1 - k, 3)) * Math.PI * 2
      if (k >= 1) state.spinT = null
    }
    const ex = HEAD_OFFSETS[pose](t)
    for (let q = 0; q < 3; q++) S.ex[q] = damp(S.ex[q], ex[q], HEAD.offsetDamp, dt)
    const isThink = pose === 'think'
    const yaw =
      clamp(vel.x * HEAD.velYaw, -HEAD.velYawMax, HEAD.velYawMax) +
      (pose === 'point' ? S.yawPose : lookYaw * (isThink ? LOOK.thinkYawScale : 1) + S.yawPose) +
      spin +
      S.ex[1] +
      I.spin +
      I.twist
    const pitch =
      clamp(-vel.y * HEAD.velPitch, -HEAD.velPitchMax, HEAD.velPitchMax) +
      L.y * LOOK.pitch * (isThink ? LOOK.thinkPitchScale : 1) * awake +
      clamp(vel.z * HEAD.velPitchZ, -HEAD.velPitchZMax, HEAD.velPitchZMax) +
      S.ex[0]
    const roll =
      clamp(-vel.x * HEAD.velRoll, -HEAD.velRollMax, HEAD.velRollMax) +
      Math.sin(t * HEAD.rollRoam.f) * HEAD.rollRoam.amp * A +
      Math.sin(t * HEAD.rollIdle.f) * HEAD.rollIdle.amp +
      S.ex[2]
    root.rotation.set(pitch, yaw, roll, 'YXZ')
    root.scale.setScalar(s)

    // Body: velocity squash, celebrate pulse, sleepy breathing, then the intro's
    // squash/stretch, which pivots on the base so landings read as grounded.
    const sq =
      clamp(vel.y * HEAD.squashVel, HEAD.squashMin, HEAD.squashMax) +
      (pose === 'celebrate' ? Math.sin(t * HEAD.celebrateSquash.f) * HEAD.celebrateSquash.amp : 0)
    const br = pose === 'sleep' ? Math.sin(t * BREATH.f) * BREATH.amp : 0
    const ki = stretch - I.squash
    body.scale.set(
      (1 - sq * 0.5 - br * BREATH.xz) * (1 - ki * 0.5),
      (1 + sq + br) * (1 + ki),
      (1 - sq * 0.5 - br * BREATH.xz) * (1 - ki * 0.5),
    )
    body.position.y = -INTRO.bodyPivotY * ki
    const cap = refs.cap.current
    if (cap) {
      cap.position.y = CAP.position[1] + I.capPop
      cap.rotation.z = CAP.rotation[2] + I.capPop * INTRO.wake.capTilt
    }
    root.updateMatrixWorld(true)

    // Tassel: spring driven by velocity.
    const ts = state.tassel
    ts.v += (-clamp(vel.x * TASSEL.velX, -TASSEL.maxSwing, TASSEL.maxSwing) - ts.a) * TASSEL.stiffness * dt - ts.v * TASSEL.damping * dt
    ts.a += ts.v * dt
    ts.w +=
      (clamp(vel.z * TASSEL.velZ + vel.y * TASSEL.velY, -TASSEL.maxPitch, TASSEL.maxPitch) - ts.b) * TASSEL.stiffness * dt -
      ts.w * TASSEL.damping * dt
    ts.b += ts.w * dt
    refs.tassel.current?.rotation.set(ts.b, 0, ts.a + TASSEL.rest)

    // Blink.
    S.blink -= dt
    if (S.blink <= 0) {
      S.blinkT = 0
      S.blink = BLINK.gapMin + Math.random() * BLINK.gapRand
    }
    let eyeY = BLINK.open
    if (S.blinkT >= 0) {
      S.blinkT += dt
      const k = S.blinkT / BLINK.duration
      eyeY = BLINK.open * (k < 0.5 ? 1 - k * BLINK.rate : (k - 0.5) * BLINK.rate + BLINK.reopenFloor)
      if (k >= 1) {
        S.blinkT = -1
        eyeY = BLINK.open
      }
    }
    const happy = pose === 'celebrate' || state.happyOverride
    const asleep = pose === 'sleep' && !happy
    const eyeScaleY = clamp(eyeY, BLINK.min, BLINK.max)
    const pop = 1 + I.eyePop * INTRO.wake.eyePopScale
    for (const e of [refs.eyeL.current, refs.eyeR.current]) {
      if (!e) continue
      e.visible = !happy && !asleep
      e.scale.set(pop, eyeScaleY * pop, 0.5)
    }
    for (const a of [refs.happyL.current, refs.happyR.current]) if (a) a.visible = happy
    for (const a of [refs.sleepL.current, refs.sleepR.current]) if (a) a.visible = asleep
    if (refs.book.current) refs.book.current.visible = reading
    if (refs.mic.current) refs.mic.current.visible = props.accessory === 'mic' && !reading
    const sparkScale = I.sparkle * INTRO.wake.sparkleSize
    for (const m of [refs.sparkL.current, refs.sparkR.current]) {
      if (!m) continue
      m.visible = sparkScale > 1e-3
      m.scale.setScalar(Math.max(1e-3, sparkScale))
      m.rotation.z = I.sparkle * INTRO.wake.sparkleTurn
    }

    // Brows: shared lift plus per-pose left/right lifts, plus the wake-up surprise.
    S.brow = damp(
      S.brow,
      (happy ? BROWS.happyLift : state.speaking ? BROWS.speakLift + BROWS.speakWobble * Math.sin(t * BROWS.speakF) : 0) +
        I.eyePop * INTRO.wake.browLift,
      BROWS.damp,
      dt,
    )
    if (refs.brows.current) refs.brows.current.position.y = S.brow
    const bt = BROW_LIFTS[pose]
    S.bl = damp(S.bl, bt[0], BROWS.damp, dt)
    S.br = damp(S.br, bt[1], BROWS.damp, dt)
    if (refs.browL.current) refs.browL.current.position.y = FACE.browL.position.y + S.bl
    if (refs.browR.current) refs.browR.current.position.y = FACE.browR.position.y + S.br

    // Mouth: smile at rest, a little open breathing "o" asleep, closed while
    // reading, open while speaking, happy, or startled awake.
    const target = Math.max(
      happy
        ? MOUTH.happyOpen
        : asleep
          ? SLEEP_MOUTH.base + SLEEP_MOUTH.amp * Math.sin(t * SLEEP_MOUTH.f)
          : reading
            ? 0
            : state.speaking
          ? MOUTH.speakBase +
            MOUTH.speakAmp * Math.abs(Math.sin(t * MOUTH.speakF)) * (MOUTH.speakMod + MOUTH.speakModAmp * Math.sin(t * MOUTH.speakModF))
          : 0,
      I.eyePop * INTRO.wake.mouthOpen,
    )
    S.speak = damp(S.speak, target, MOUTH.damp, dt)
    const open = refs.mouth.current
    const smile = refs.smile.current
    if (open && smile) {
      open.visible = S.speak > MOUTH.visibleThreshold
      smile.visible = !open.visible
      open.scale.set(happy ? MOUTH.happyWidth : 1, Math.max(MOUTH.minHeight, S.speak), 1)
    }

    // Hands: spring toward root-local targets, in world space. While spinning
    // they fly outward, trail the body by `lag`, and are pinned there; as the
    // spin dies the spring takes back over and snaps them in.
    const hp = HAND_POSES[pose](t)
    const handRefs = [refs.hand_L.current, refs.hand_R.current]
    const lag = INTRO.spin.handLag * handOut
    const grip = clamp(handOut * INTRO.spin.handGrip, 0, 1)
    if (handOut > 0) tmp.lagQ.setFromAxisAngle(Y_AXIS, -lag)
    for (let i = 0; i < 2; i++) {
      const h = handRefs[i]
      if (!h) continue
      const [lx, ly, lz, rx, ry, rz] = hp[i]
      const handTarget = tmp.start.set(lx * (1 + INTRO.spin.handSpread * handOut), ly + INTRO.spin.handLift * handOut, lz)
      root.localToWorld(handTarget)
      if (handOut > 0) handTarget.sub(root.position).applyQuaternion(tmp.lagQ).add(root.position)
      const u = state.hands[i]
      if (!u.init) {
        h.position.copy(handTarget)
        u.init = true
      }
      u.vel.addScaledVector(tmp.v.copy(handTarget).sub(h.position), HANDS.stiffness * dt)
      u.vel.multiplyScalar(Math.exp(-HANDS.damping * dt))
      h.position.addScaledVector(u.vel, dt)
      if (grip > 0) {
        h.position.lerp(handTarget, grip)
        u.vel.multiplyScalar(1 - grip)
      }
      tmp.e.set(rx, ry, rz)
      tmp.q.setFromEuler(tmp.e).premultiply(root.quaternion)
      if (handOut > 0) tmp.q.premultiply(tmp.lagQ)
      h.quaternion.slerp(tmp.q, Math.max(grip, 1 - Math.exp(-HANDS.rotDamp * dt)))
      h.scale.setScalar(s)
    }

    // Ground blob shrinks and fades as he rises.
    const blob = refs.shadow.current
    if (blob) {
      const hgt = root.position.y - GROUND.y
      blob.position.set(root.position.x, GROUND.y + GROUND.blobLift, root.position.z)
      blob.scale.setScalar(s * clamp(GROUND.blobScaleBase - GROUND.blobScalePerHeight * hgt, GROUND.blobScaleMin, GROUND.blobScaleMax))
      const mat = blob.material as { opacity: number }
      mat.opacity = clamp(GROUND.blobOpacityBase - GROUND.blobOpacityPerHeight * hgt, GROUND.blobOpacityMin, 1)
    }

    // Where he is on screen, so the board can grow out of him.
    if (!props.introDriven) return
    tmp.v.copy(root.position).project(camera)
    sceneRig.charScreen.x = ((tmp.v.x + 1) / 2) * frame.size.width
    sceneRig.charScreen.y = ((1 - tmp.v.y) / 2) * frame.size.height
  })
}
