import type { RigidBodyType } from '@dimforge/rapier3d-compat'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Matrix3, Quaternion, Vector3, type Group, type Object3D } from 'three'
import { tutorStatus } from '../../character/blender/BlenderTutor'
import { MOTION, TUTOR_ASSETS, WALK } from '../../character/blender/config'
import { manifestUrl } from '../../character/blender/manifest'
import { collectRigNodes } from '../../character/blender/rigNodes'
import { laneZ } from '../../lesson/roam'
import { presenting, useWalkthrough } from '../../lesson/runner'
import { useDirector, type LoopClip, type OneShotClip } from '../../state/director'
import { useMode } from '../../state/mode'
import { useProgress } from '../../state/progress'
import { SPOTS } from '../layout3d'
import { PHYSICS, ROOM_BOX } from '../physics/config'
import { clampLength, spinFromVelocity } from '../physics/grab'
import { playHandlers, usePlayBody } from '../physics/playBody'
import { Basketball } from './Basketball'
import { HOOPS, MOVE_CLIPS, type MoveKind } from './config'
import { DunkHoop, DunkHoopState } from './DunkHoop'
import { useHoops } from './hoopsStore'
import { driveAt, nextEventTime, parseBallClips, startPos, type BallClip, type BallClips, type BallEvent } from './moves'
import { approachX, faceYaw, isMake, pickOutcome, planShot, sampleShot, solveApex, vec, type HoopGeom, type Outcome, type ShotOptions, type ShotPlan, type Vec3 } from './shot'
import { afterStep, fetchStop, lessonTakesStage, outranks, walkTarget } from './staging'
import { disarmStudentShot } from './studentShot'

// The Play tab's ball moves, drawn: "Shoot hoops", dribble, kick, juggle and
// dunk (src/scene/hoops/actions.ts asks for one through useHoops).
//
// A move borrows the physics ball (src/scene/physics/Toys.tsx): it turns the
// body kinematic and hides its mesh, and this component draws the same
// basketball instead, so only one ball ever shows. He first walks along the
// lane to wherever the ball lies (fetch), then the ball hops into his hands,
// rides the hand / foot the clip's "ball" block names
// (public/models/tutor.manifest.json, read through moves.ts) and, at the
// release or the kick, flies: the jump shot along shot.ts's arc through (or
// off) the hoop's rim and out of the net, the rest straight back to physics.
// At the hand-off the body turns dynamic with the drawn ball's velocity and
// the drawn ball keeps going for two frames while physics catches up.
//
// A shot from out of range carries the ball toward the hoop first (carry) and
// turns to face it (the director's roamTo / faceTo); after it he turns back and
// celebrates or shrugs. The move keeps the stage (HUD busy) until that reaction
// has played out (staging.ts). The move never resumes the lesson: in Play the
// runner's gate keeps it silent and it picks up back in Study (src/play/
// lessonMode.ts). If the lesson takes the stage mid-move anyway, the move
// yields at once: a ball on him drops to physics where it is, one in flight
// finishes its path, and no reaction plays.
// Mounted inside the physics world after the tutor, so it reads his bones
// after this frame's mixer update.

const KINEMATIC = 2 as RigidBodyType // RigidBodyType.KinematicPositionBased
const DYNAMIC = 0 as RigidBodyType // RigidBodyType.Dynamic
const G = -PHYSICS.gravity[1]
const B = PHYSICS.ball
const H = PHYSICS.hoop
const S = HOOPS.shot
const TAU = Math.PI * 2
const UP = new Vector3(0, 1, 0)
// The gap the fetch walk keeps between his centre line and the ball's centre: his capsule, the ball, a margin.
const FETCH_CLEAR = PHYSICS.tutor.radius + B.radius + HOOPS.fetch.margin

const HOOP_GEOM: HoopGeom = { rim: vec(H.rim[0], H.rim[1], H.rim[2]), rimRadius: H.rimRadius, tube: H.tube, netDepth: H.net.depth }
const SHOT_OPTS: ShotOptions = {
  g: G,
  ballRadius: B.radius,
  apexAboveRim: S.apexAboveRim,
  ceilingY: ROOM_BOX.ceilY,
  apexBelowCeil: S.apexBelowCeil,
  contactAngle: S.contactAngle,
  rimInHop: S.rimInHop,
  rimOut: S.rimOut,
  net: S.net,
  exitSpeed: S.exitSpeed,
  exitToward: S.exitToward,
}

const angleDiff = (a: number, b: number) => ((((b - a) % TAU) + TAU + Math.PI) % TAU) - Math.PI

// The ball blocks, one fetch per page (the file the tutor reads its clip metadata from).
let clipsPromise: Promise<BallClips> | null = null
function loadBallClips(): Promise<BallClips> {
  clipsPromise ??= fetch(manifestUrl(TUTOR_ASSETS.model), { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then(parseBallClips)
    .catch(() => ({}))
  return clipsPromise
}

interface Rig {
  root: Object3D
  limbs: Partial<Record<string, Object3D>> // handL, handR, footL, footR
}

function findRig(scene: Object3D): Rig | null {
  const tutor = scene.getObjectByName('blender-tutor')
  const nodes = tutor ? collectRigNodes(tutor) : null
  const root = nodes?.root?.node
  if (!nodes || !root) return null
  return { root, limbs: { handL: nodes.handL?.node, handR: nodes.handR?.node, footL: nodes.footL?.node, footR: nodes.footR?.node } }
}

function attached(o: Object3D, scene: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (p === scene) return true
  return false
}

type Phase = 'idle' | 'fetch' | 'ready' | 'gather' | 'carry' | 'clip' | 'flight' | 'handoff' | 'done' | 'react'

// Phases with the ball still on him (or about to be): a grab of him or the ball ends the move there.
const ON_HIM: ReadonlySet<Phase> = new Set(['fetch', 'ready', 'gather', 'carry', 'clip'])

// One move's scratch state; preallocated so the frame loop never allocates.
class Move {
  phase: Phase = 'idle'
  id = 0
  kind: MoveKind = 'shoot'
  clip: BallClip | null = null
  rig: Rig | null = null
  t = 0 // seconds in the phase
  shown = false // the drawn ball is the one showing
  held = false // riding his hands / feet (no roll)
  backspin = false
  readonly p = new Vector3() // drawn ball, world
  readonly v = new Vector3()
  readonly last = new Vector3()
  readonly q = new Quaternion()
  // Where he stands and faces next (motion coords: the director's frame, before his landing offset).
  readonly spot = { x: 0, z: 0 }
  face: number | null = null
  ox = 0 // his landing offset (play mode leaves him where a fling dropped him): world = motion + offset
  oz = 0
  ballX = 0 // the ball's world x / z the fetch walk aims at
  ballZ = 0
  carryX: number | null = null // an out-of-range shot carries the ball here first (motion x)
  budget = 0 // seconds the fetch / carry walk may take
  // The hop into his hands.
  readonly from = new Vector3()
  readonly launch = new Vector3()
  readonly aim = new Vector3()
  gatherT = 0
  asked = false // the clip was requested...
  started = false // ...and seen playing
  // Loops.
  prevLoop: LoopClip = 'idle'
  cycles = 0
  lastTime = 0
  endAt: number | null = null
  // The jump shot.
  plan: ShotPlan | null = null
  outcome: Outcome = 'swish'
  flightT = 0
  rimDone = false
  scoreDone = false
  // After.
  frames = 0
  react: OneShotClip | null = null
  reactAsked = false
  reactSeen = false
  reactDropped = false
  reactMark = 0 // the animation controller's transition count when the reaction was asked
  levelMark = 0 // the last useProgress.levelUpId seen (the move's start: bumps before it are not its own)
  levelOwed = false // the move's XP levelled him up and LevelWatcher's 'levelup' has not started yet
  levelOn = false // a 'levelup' clip is playing
  unwatch: (() => void) | null = null // the walkthrough watch (the lesson taking the stage back)
  yield = false // the lesson took the stage: yield on the next frame...
  yielded = false // ...and, with the ball already in flight, end without a reaction once physics has it

  reset(kind: MoveKind, clip: BallClip, rig: Rig): void {
    Object.assign(this, { kind, clip, rig, t: 0, held: false, backspin: false, face: null, asked: false, started: false, carryX: null, yield: false, yielded: false })
    Object.assign(this, { cycles: 0, lastTime: 0, endAt: null, plan: null, flightT: 0, rimDone: false, scoreDone: false, frames: 0, react: null })
    Object.assign(this, { reactAsked: false, reactSeen: false, reactDropped: false, reactMark: 0, levelOwed: false, levelOn: false })
  }

  get clipName(): OneShotClip | LoopClip {
    return MOVE_CLIPS[this.kind]
  }
}

export function BallProp() {
  const scene = useThree((st) => st.scene)
  const drawn = useRef<Group>(null)
  const clips = useRef<BallClips | null>(null)
  const s = useMemo(() => new Move(), [])
  const dunkHoop = useMemo(() => new DunkHoopState(), [])
  const tmp = useMemo(() => ({ a: new Vector3(), b: new Vector3(), m3: new Matrix3(), dq: new Quaternion() }), [])

  useEffect(() => {
    let live = true
    void loadBallClips().then((c) => {
      if (live) clips.current = c
    })
    return () => {
      live = false
    }
  }, [])

  // Root-frame point / vector -> world, through his root's live world matrix.
  const rootPoint = (p: Vec3, out: Vector3) => out.set(p.x, p.y, p.z).applyMatrix4(s.rig!.root.matrixWorld)
  const rootVector = (v: Vec3, out: Vector3) => out.set(v.x, v.y, v.z).applyMatrix3(tmp.m3.setFromMatrix4(s.rig!.root.matrixWorld))
  // The gravity the app-driven arcs between authored touches fly under (model units / s^2).
  const arcG = () => (s.kind === 'juggle' ? HOOPS.juggle.g : HOOPS.modelG)
  const startPoint = (out: Vector3) => rootPoint(startPos(s.clip!, arcG()) ?? vec(), out)
  const followPoint = (out: Vector3) => {
    const f = s.clip!.follow
    const node = f ? s.rig!.limbs[f.node] : undefined
    if (!f || !node) return startPoint(out)
    return out.set(node.position.x + f.offset.x, node.position.y + f.offset.y, node.position.z + f.offset.z).applyMatrix4(s.rig!.root.matrixWorld)
  }

  // Hand the stage back: the HUD unlocks. Never resumes the lesson (that made lines start
  // mid-play): it picks up back in Study (src/play/lessonMode.ts).
  const finish = () => {
    if (s.shown) playHandlers.ball?.show(true)
    s.shown = false
    s.phase = 'idle'
    s.rig = null
    s.unwatch?.()
    s.unwatch = null
    useHoops.getState().finish()
  }

  // The loop a ball loop hands back to, unless something else (the lesson) set his loop meanwhile.
  const restoreLoop = () => {
    const d = useDirector.getState()
    if (s.clip?.loop && s.asked && d.loop === s.clipName) d.setLoop(s.prevLoop)
  }

  // End the move here: a ball on him drops to physics where it is, moving the way it was, he
  // turns back, his loop comes back.
  const abort = () => {
    const ball = playHandlers.ball
    const body = ball?.body()
    if (s.shown && ball && body && !ball.busy()) {
      if (!Number.isFinite(s.v.x + s.v.y + s.v.z)) s.v.set(0, 0, 0)
      clampLength(s.v, PHYSICS.tutor.maxFlingSpeed)
      body.setBodyType(DYNAMIC, true)
      body.setTranslation(s.p, true)
      body.setRotation(s.q, true)
      body.setLinvel(s.v, true)
      body.setAngvel(spinFromVelocity(s.v, B.spinPerSpeed, PHYSICS.tutor.maxSpin * 2, tmp.b), true)
    }
    useDirector.getState().faceTo(null)
    restoreLoop()
    finish()
  }

  // The lesson took the stage mid-move (staging.ts lessonTakesStage). True when the move is over.
  const yieldStage = (): boolean => {
    s.yield = false
    s.react = null
    if (s.phase === 'flight' || s.phase === 'handoff') {
      useDirector.getState().faceTo(null)
      s.yielded = true // the ball finishes its path to physics, then the move ends without a reaction
      return false
    }
    if (s.phase === 'done' || s.phase === 'react') {
      useDirector.getState().faceTo(null)
      finish()
      return true
    }
    abort()
    return true
  }

  // Unmounted mid-move: tidy up the same way.
  const abortRef = useRef(abort)
  abortRef.current = abort
  useEffect(
    () => () => {
      if (s.phase !== 'idle') abortRef.current()
    },
    [s],
  )

  const start = (kind: MoveKind, id: number) => {
    s.id = id
    const clip = clips.current?.[MOVE_CLIPS[kind]]
    const rig = findRig(scene)
    const ball = playHandlers.ball
    if (!clip || !rig || !ball?.body() || ball.busy() || useMode.getState().mode === 'study' || usePlayBody.getState().state !== 'idle') {
      useHoops.getState().finish()
      return
    }
    useHoops.getState().begin(kind)
    s.reset(kind, clip, rig)
    s.levelMark = useProgress.getState().levelUpId
    s.levelOn = tutorStatus.anim?.oneShot === 'levelup' // one already playing is not the move's
    // The move takes the floor: a lesson still playing pauses, a held one too (so the answer's release
    // can't pick it up under the move). In Play the runner's gate has already paused it; this is the
    // backstop. Should the lesson take the stage back mid-move, the move yields.
    const w = useWalkthrough.getState()
    if (w.started && w.playing && w.phase !== 'done') w.pause()
    s.unwatch = useWalkthrough.subscribe((now, prev) => {
      if (lessonTakesStage({ playing: prev.playing, presenting: presenting(prev.phase) }, { playing: now.playing, presenting: presenting(now.phase) })) s.yield = true
    })
    const d = useDirector.getState()
    // The loop a ball loop hands back to. Not a walk: asked mid-walk, d.loop is still the paused lesson's
    // walk (StageDirector drops it a render later), and he would walk in place after the dribble.
    s.prevLoop = d.loop.startsWith('play_') || d.loop === 'walk' ? 'idle' : d.loop

    rig.root.updateWorldMatrix(true, false)
    const here = tmp.a.setFromMatrixPosition(rig.root.matrixWorld)
    s.ox = here.x - tutorStatus.x
    s.oz = here.z - tutorStatus.z
    // Where he is headed: a walk already under way (the lesson crossing between spots) still lands.
    const spot = walkTarget(d, SPOTS)
    s.spot.x = spot.x
    s.spot.z = spot.z
    d.faceTo(null)
    const at = ball.body()!.translation()
    walkToBall(at.x, at.z)
    s.phase = 'fetch'
  }

  // Walk along the lane to the ball at world (`bx`, `bz`): short of it on his side, where his body
  // clears it (staging.ts fetchStop: he is kinematic in Play and would shove it away), within the
  // landing range. Not when the walk he is on already ends close enough, or while stepped aside
  // (that wins over roaming).
  const walkToBall = (bx: number, bz: number) => {
    s.ballX = bx
    s.ballZ = bz
    const F = HOOPS.fetch
    const d = useDirector.getState()
    if (d.asideX === null) {
      const xMax = PHYSICS.tutor.landing.xMax
      const opts = { standOff: F.standOff, slack: F.slack, clear: FETCH_CLEAR, step: F.step, xMin: -xMax - s.ox, xMax: xMax - s.ox }
      const x = fetchStop({ x: tutorStatus.x, z: tutorStatus.z }, s.spot, { x: bx - s.ox, z: bz - s.oz }, opts, (x) => laneZ(x, SPOTS))
      if (x !== null) {
        s.spot.x = x
        s.spot.z = laneZ(x, SPOTS)
        d.roamTo(x)
      }
    }
    s.budget = Math.min(s.t + walkSeconds(), F.maxSeconds)
  }
  const walkSeconds = () => Math.hypot(s.spot.x - tutorStatus.x, s.spot.z - tutorStatus.z) / WALK.maxSpeed + HOOPS.fetch.spare
  const standing = () => tutorStatus.phase === 'still' && Math.hypot(tutorStatus.x - s.spot.x, tutorStatus.z - s.spot.z) < HOOPS.arriveEps
  const turned = () => Math.abs(angleDiff(tutorStatus.yaw, s.face ?? 0)) < HOOPS.settleYaw

  // At the ball: decide where he plays it from and which way he faces.
  const arrive = () => {
    const d = useDirector.getState()
    s.carryX = null
    s.face = null
    if (s.kind === 'shoot') {
      // Out of range: he will carry the ball along the lane toward the hoop first (not while stepped
      // aside: that wins over roaming, so he could never get there). Facing the hoop comes after.
      const rim = vec(H.rim[0] - s.ox, H.rim[1], H.rim[2] - s.oz)
      if (d.asideX === null && Math.hypot(rim.x - s.spot.x, rim.z - s.spot.z) > S.maxRange) {
        const x = approachX(s.spot.x, rim, S.approach, S.laneMaxX - s.ox, (x) => laneZ(x, SPOTS))
        if (Math.abs(x - s.spot.x) > 1e-3) s.carryX = x
      }
      if (s.carryX === null) s.face = faceYaw(vec(s.spot.x + s.ox, 0, s.spot.z + s.oz), HOOP_GEOM.rim, S.faceMax)
    } else if (s.kind === 'kick') {
      s.face = s.spot.x + s.ox <= 0 ? HOOPS.kick.face : -HOOPS.kick.face // side-on (face still showing), toward the far side of the room
    }
    d.faceTo(s.face)
    s.phase = 'ready'
    s.t = 0
  }

  // Ball in hand, out of range: walk it toward the hoop, then turn to face it.
  const beginCarry = (x: number) => {
    const d = useDirector.getState()
    s.carryX = null
    s.spot.x = x
    s.spot.z = laneZ(x, SPOTS)
    s.face = faceYaw(vec(x + s.ox, 0, s.spot.z + s.oz), HOOP_GEOM.rim, S.faceMax)
    d.roamTo(x)
    d.faceTo(s.face)
    s.phase = 'carry'
    s.t = 0
    s.budget = Math.min(walkSeconds(), HOOPS.fetch.maxSeconds) + HOOPS.timeouts.approach
  }

  // Take the ball: the body goes kinematic and hidden, the drawn ball hops from it to where the clip starts it.
  const beginGather = () => {
    const ball = playHandlers.ball!
    const body = ball.body()!
    const at = body.translation()
    const rot = body.rotation()
    s.from.set(at.x, at.y, at.z)
    startPoint(s.aim)
    const lift = Math.min(HOOPS.gather.lift + HOOPS.gather.liftPerUnit * s.from.distanceTo(s.aim), HOOPS.gather.maxLift)
    const apex = Math.min(Math.max(s.from.y, s.aim.y) + lift, ROOM_BOX.ceilY - B.radius - 0.1)
    const arc = solveApex(s.from, s.aim, apex, G)
    if (!arc) return abort()
    disarmStudentShot() // his move now, not a student's throw
    body.setBodyType(KINEMATIC, true)
    ball.show(false)
    s.shown = true
    s.p.copy(s.from)
    s.q.set(rot.x, rot.y, rot.z, rot.w)
    s.launch.set(arc.v.x, arc.v.y, arc.v.z)
    s.gatherT = arc.t
    s.phase = 'gather'
    s.t = 0
  }

  // A one-shot that ranks above the move's clip (a level-up) is on or waiting: the clip would expire in the
  // queue behind it (a one-shot move) or play unseen under it (a loop), so the move holds until it is over.
  const blocked = () => {
    const a = tutorStatus.anim
    const kind = s.clip!.loop ? 'loop' : 'oneshot'
    return outranks(a?.oneShot ?? null, s.clipName, kind) || outranks(a?.queued ?? null, s.clipName, kind)
  }

  const requestClip = () => {
    const d = useDirector.getState()
    if (s.clip!.loop) d.setLoop(s.clipName as LoopClip)
    else d.play(s.clipName as OneShotClip)
    s.asked = true
  }

  // Physics takes the ball back with the drawn ball's position, spin and velocity.
  const handoff = () => {
    const body = playHandlers.ball?.body()
    if (!body) return abort()
    body.setBodyType(DYNAMIC, true)
    body.setTranslation(s.p, true)
    body.setRotation(s.q, true)
    body.setLinvel(s.v, true)
    body.setAngvel(spinFromVelocity(s.v, B.spinPerSpeed, PHYSICS.tutor.maxSpin * 2, tmp.b), true)
    restoreLoop()
    if (s.kind !== 'shoot') {
      useProgress.getState().award('trick')
      s.react = HOOPS.react.trick
    }
    s.held = false
    s.frames = 0
    s.phase = 'handoff'
    s.t = 0
  }

  // A one-shot's release / contact: the jump shot flies its planned arc, the rest go straight to physics.
  const release = (e: BallEvent, time: number) => {
    const late = Math.max(0, (time - e.t) / MOTION.timeScale)
    rootPoint(e.pos ?? vec(), s.p)
    s.held = false
    if (s.kind === 'shoot') {
      const h = useHoops.getState()
      s.outcome = pickOutcome(Math.random(), { shots: h.attempts, lastMissed: h.lastOutcome === 'rimOut' }, S.odds)
      try {
        s.plan = planShot(s.p, HOOP_GEOM, SHOT_OPTS, s.outcome)
      } catch {
        s.plan = null
      }
      if (s.plan) {
        s.flightT = late
        s.backspin = true
        s.phase = 'flight'
        s.t = 0
        sampleShot(s.plan, s.flightT, G, s.p, s.v)
        return
      }
    }
    const speed = s.kind === 'dunk' ? HOOPS.dunk.speed : s.kind === 'kick' ? HOOPS.kick.speed : 4
    rootVector(s.clip!.launch ?? vec(0, 1, 0), s.v).normalize().multiplyScalar(speed)
    s.p.addScaledVector(s.v, late)
    if (s.kind === 'dunk') dunkHoop.slamAt = dunkHoop.t
    handoff()
  }

  // The dunk's hoop pops up beside him just before the slam, a little along the slam from the release.
  const maybePopHoop = (time: number) => {
    const c = s.clip!
    const rel = c.events.find((e) => e.kind === 'release')
    if (dunkHoop.active || !rel?.pos || time < rel.t - HOOPS.dunk.popLead) return
    const l = c.launch ?? vec(0, -1, 0)
    const k = HOOPS.dunk.rimDrop
    dunkHoop.pop({ x: rel.pos.x + l.x * k, y: rel.pos.y + l.y * k, z: rel.pos.z + l.z * k }, s.rig!.root.matrixWorld)
  }

  // The clip is playing: the ball rides the clip's ball block (or lets go).
  const ride = (dt: number) => {
    const c = s.clip!
    const time = tutorStatus.time
    if (c.loop) {
      if (time < s.lastTime - c.duration / 2) s.cycles++
      s.lastTime = time
      const cfg = s.kind === 'juggle' ? HOOPS.juggle : HOOPS.dribble
      const unwrapped = s.cycles * c.duration + time
      if (s.endAt === null && unwrapped >= cfg.loops * c.duration) s.endAt = nextEventTime(c, cfg.endOn, unwrapped)
      if (s.endAt !== null && unwrapped >= s.endAt) {
        // Let go: the ball keeps the arc it is on (a juggle's last touch kicks it higher), nudged toward the camera.
        const drive = driveAt(c, time, arcG())
        if (drive.mode === 'path') {
          rootPoint(drive.pos, s.p)
          rootVector(drive.vel, s.v).multiplyScalar(MOTION.timeScale)
        }
        if (s.kind === 'juggle') s.v.multiplyScalar(HOOPS.juggle.pop)
        s.v.addScaledVector(rootVector(vec(0, 0, 1), tmp.a).setY(0).normalize(), cfg.nudge)
        return handoff()
      }
    } else if (s.t > HOOPS.timeouts.clip) return abort()
    if (s.kind === 'dunk') maybePopHoop(time)

    const drive = driveAt(c, time, arcG())
    if (drive.mode === 'free') return release(drive.event, time)
    if (drive.mode === 'path') {
      s.held = false
      rootPoint(drive.pos, s.p)
      rootVector(drive.vel, s.v).multiplyScalar(MOTION.timeScale)
      return
    }
    s.held = true
    if (drive.mode === 'hold') rootPoint(drive.pos, s.p)
    else followPoint(s.p)
    if (dt > 0) s.v.subVectors(s.p, s.last).divideScalar(dt)
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, PHYSICS.maxDt)
    if (s.phase === 'idle') {
      const req = useHoops.getState().request
      if (req && req.id !== s.id) start(req.kind, req.id)
      if (s.phase === 'idle') return draw()
    }

    // Lost him, the ball, or play mode: stop where we are. Once the ball has left him it finishes on its own,
    // and once physics has it back (done, react) a student grabbing it no longer cuts his reaction.
    const ball = playHandlers.ball
    const ours = s.phase !== 'done' && s.phase !== 'react'
    if (
      (ours && (!ball || ball.busy())) ||
      useMode.getState().mode === 'study' ||
      !s.rig ||
      !attached(s.rig.root, scene) ||
      (ON_HIM.has(s.phase) && usePlayBody.getState().state !== 'idle')
    ) {
      abort()
      return draw()
    }
    // The lesson took the stage back mid-move: yield now rather than fight its walk or line.
    if (s.yield && yieldStage()) return draw()

    s.rig.root.updateWorldMatrix(true, false)
    s.t += dt
    s.last.copy(s.p)
    const d = useDirector.getState()
    // A level-up off the move's XP is owed until its clip starts (LevelWatcher plays one per burst of bumps),
    // so the reaction beat can stand aside for it.
    const levelUpId = useProgress.getState().levelUpId
    if (levelUpId !== s.levelMark) {
      s.levelMark = levelUpId
      s.levelOwed = true
    }
    const levelOn = tutorStatus.anim?.oneShot === 'levelup'
    if (levelOn && !s.levelOn) s.levelOwed = false
    s.levelOn = levelOn

    switch (s.phase) {
      case 'fetch': {
        // Walking to the ball; it may still be rolling: re-aim when it has moved on.
        const body = ball?.body()
        if (!body) {
          abort()
          break
        }
        const at = body.translation()
        if (Math.hypot(at.x - s.ballX, at.z - s.ballZ) > HOOPS.fetch.retarget) walkToBall(at.x, at.z)
        if (s.t > 0.1 && standing()) arrive()
        else if (s.t > s.budget) abort()
        break
      }
      case 'ready': {
        if (s.t > 0.1 && standing() && turned() && !blocked()) beginGather()
        else if (s.t > HOOPS.timeouts.approach) abort()
        break
      }
      case 'gather': {
        const tt = Math.min(s.t, s.gatherT)
        s.p.copy(s.from).addScaledVector(s.launch, tt)
        s.p.y -= 0.5 * G * tt * tt
        s.v.copy(s.launch).setY(s.launch.y - G * tt)
        // Aim where his hands are now, not where they were: blend the drift in along the way.
        s.p.addScaledVector(startPoint(tmp.a).sub(s.aim), s.gatherT > 0 ? tt / s.gatherT : 1)
        // A one-shot starts a beat early so his hands come in as the ball arrives; a loop starts on arrival.
        // Not when he carries it toward the hoop first: the clip waits for the carry.
        const lead = s.clip!.loop ? 0 : Math.min(0.1, s.gatherT)
        if (s.carryX === null && !s.asked && s.t >= s.gatherT - lead && !blocked()) requestClip()
        if (s.t >= s.gatherT) {
          if (s.carryX !== null) beginCarry(s.carryX)
          else {
            s.phase = 'clip'
            s.t = 0
          }
        }
        break
      }
      case 'carry': {
        // The ball rides in his hands while he walks it in, then he turns to the hoop and shoots.
        s.held = true
        startPoint(s.p)
        if (dt > 0) s.v.subVectors(s.p, s.last).divideScalar(dt)
        if (s.t > 0.1 && standing() && turned() && !blocked()) {
          requestClip()
          s.phase = 'clip'
          s.t = 0
        } else if (s.t > s.budget) abort()
        break
      }
      case 'clip': {
        // Something that outranks the clip came in during the hop (a level-up): hold the ball until it is over,
        // then ask again unless the request is still waiting in the controller's queue slot.
        if (!s.started && blocked()) {
          s.t = 0
          if (tutorStatus.anim?.queued !== s.clipName) s.asked = false
        } else if (!s.asked) requestClip()
        if (tutorStatus.playing === s.clipName) {
          s.started = true
          ride(dt)
        } else if (s.started) handoff() // the clip ended or was cut with the ball still on him: drop it
        else if (s.t > HOOPS.timeouts.start) abort()
        else {
          s.held = true
          startPoint(s.p)
          s.v.set(0, 0, 0)
        }
        break
      }
      case 'flight': {
        const plan = s.plan!
        s.flightT += dt
        sampleShot(plan, s.flightT, G, s.p, s.v)
        if (plan.rimAt !== null && !s.rimDone && s.flightT >= plan.rimAt) {
          s.rimDone = true
          if (!isMake(s.outcome)) {
            useHoops.getState().recordShot(s.outcome)
            useProgress.getState().award('trick')
            s.react = HOOPS.react.miss
          }
        }
        if (plan.scoreAt !== null && !s.scoreDone && s.flightT >= plan.scoreAt) {
          s.scoreDone = true
          useHoops.getState().recordShot(s.outcome)
          useProgress.getState().award('hoops')
          d.burst('confetti', 'tutor')
          s.react = HOOPS.react.make
        }
        if (s.flightT >= plan.end) handoff()
        break
      }
      case 'handoff': {
        // Keep flying while physics catches up, then show its ball.
        s.p.addScaledVector(s.v, dt)
        s.v.y -= G * dt
        if (++s.frames >= HOOPS.handoffFrames) {
          playHandlers.ball?.show(true)
          s.shown = false
          // Yielded to the lesson mid-flight: physics has the ball, the move is over (no turn-back or reaction).
          if (s.yielded) {
            finish()
            return draw()
          }
          s.phase = 'done'
          s.t = 0
        }
        break
      }
      case 'done': {
        // Turn back once his own clip is over (a reaction must not cut the move's clip).
        const busy = !s.clip!.loop && tutorStatus.playing === s.clipName
        if (!busy || s.t > HOOPS.timeouts.react) {
          d.faceTo(null)
          s.phase = 'react'
          s.t = 0
        }
        break
      }
      case 'react': {
        // React where he stands, and keep the stage until it has played out (staging.ts).
        const a = tutorStatus.anim
        if (s.reactAsked && s.react) {
          if (a?.oneShot === s.react || tutorStatus.clip === s.react) s.reactSeen = true
          const last = a && a.transitions > s.reactMark ? a.last : null
          if (last?.clip === s.react && (last.reason === 'cooldown' || last.reason === 'blocked' || last.reason === 'expired')) s.reactDropped = true
        }
        const step = afterStep(
          {
            react: s.react,
            moveClip: s.clip!.loop ? null : (s.clipName as OneShotClip),
            asked: s.reactAsked,
            seen: s.reactSeen,
            dropped: s.reactDropped,
            oneShot: a?.oneShot ?? null,
            queued: a?.queued ?? null,
            still: tutorStatus.phase === 'still',
            levelUp: s.levelOwed,
            t: s.t,
          },
          HOOPS.timeouts,
        )
        if (step === 'ask' && s.react) {
          s.reactMark = a?.transitions ?? 0
          d.play(s.react)
          s.reactAsked = true
        } else if (step === 'skip') s.react = null
        else if (step === 'finish') finish()
        break
      }
    }

    // The hidden physics body rides along, so the hand-off starts from the same spot.
    if (s.shown && s.phase !== 'handoff') ball?.body()?.setNextKinematicTranslation(s.p)
    spin(dt)
    draw()
  })

  // Roll with the motion (backspin on the jump shot); a held ball keeps still.
  const spin = (dt: number) => {
    const speed = s.v.length()
    if (s.held || speed < 0.05) return
    const axis = tmp.b.crossVectors(UP, s.v)
    if (axis.lengthSq() < 1e-8) return
    axis.normalize()
    if (s.backspin) axis.negate()
    s.q.premultiply(tmp.dq.setFromAxisAngle(axis, speed * HOOPS.spinPerSpeed * dt))
  }

  const draw = () => {
    const g = drawn.current
    if (!g) return
    g.visible = s.shown
    if (!s.shown) return
    g.position.copy(s.p)
    g.quaternion.copy(s.q)
  }

  return (
    <>
      <group ref={drawn} visible={false} name="hoops-ball">
        <Basketball radius={B.radius} />
      </group>
      <DunkHoop state={dunkHoop} />
    </>
  )
}
