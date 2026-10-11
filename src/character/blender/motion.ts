import { LoopOnce, LoopRepeat, type AnimationAction } from 'three'
import type { Clip, FxKind, Gesture, LoopClip, OneShotClip } from '../../state/director'
import { MOTION, WALK, defaultFace, fallbackOf, type FaceState } from './config'
import type { ClipMeta, Manifest } from './manifest'

// The tutor's motion controller: which clip plays, crossfades, one-shots and
// walking between spots. Pure logic over the mixer's actions; BlenderTutor
// feeds it the director state every frame (before the mixer update) and reads
// back the placement, the face and the fx to fire.

export type MotionPhase = 'still' | 'walking' | 'settling'

export interface MotionInput {
  target: { x: number; z: number } // the spot he should stand on (world)
  loop: LoopClip
  speaking: boolean
  gesture: (Gesture & { fade?: number }) | null // a new id starts it; fade defaults to MOTION.fadeGesture
  loopFade?: number // crossfade between base loops (defaults to MOTION.fadeLoop)
  cut?: boolean // drop the one-shot in progress (or waiting) and fade to the loop now
  face?: number | null // the yaw he settles to when standing (null / unset = the camera, 0): the Play tab turns him to the hoop
}

const TAU = Math.PI * 2

// Shortest signed angle from a to b.
function angleDiff(a: number, b: number): number {
  return ((((b - a) % TAU) + TAU + Math.PI) % TAU) - Math.PI
}

function dampAngle(a: number, b: number, k: number, dt: number): number {
  return a + angleDiff(a, b) * (1 - Math.exp(-k * dt))
}

// Contract clip name -> the GLB's animation name. Blender can prefix action
// names ('Armature|idle') or change case; match on the last '|' segment.
export function mapClipNames(glbNames: string[]): Map<Clip, string> {
  const out = new Map<Clip, string>()
  const norm = (n: string) => (n.split('|').pop() ?? n).trim().toLowerCase().replace(/[\s-]+/g, '_')
  for (const name of glbNames) {
    const key = norm(name) as Clip
    if (!out.has(key)) out.set(key, name)
  }
  return out
}

export class TutorMotion {
  // Placement in the room (world units, radians).
  readonly pos = { x: 0, z: 0 }
  yaw = 0
  phase: MotionPhase = 'still'

  // What is playing. `requested` is the contract name asked for, `playing` the
  // clip actually used after fallbacks.
  requested: Clip | null = null
  playing: Clip | null = null
  current: AnimationAction | null = null
  gesture: { clip: OneShotClip; elapsed: number; total: number } | null = null

  private speed = 0
  private pending: OneShotClip | null = null
  private pendingFade: number = MOTION.fadeGesture
  private lastGestureId: number
  private fxPrevT = -1
  readonly missing = new Set<Clip>()

  private readonly getAction: (glbName: string) => AnimationAction | null | undefined
  private readonly names: Map<Clip, string>
  private readonly manifest: Manifest

  constructor(
    getAction: (glbName: string) => AnimationAction | null | undefined,
    names: Map<Clip, string>,
    manifest: Manifest,
    start: { x: number; z: number },
    lastGestureId: number,
  ) {
    this.getAction = getAction
    this.names = names
    this.manifest = manifest
    this.pos.x = start.x
    this.pos.z = start.z
    // Gestures requested before he mounted are history, not commands.
    this.lastGestureId = lastGestureId
  }

  meta(clip: Clip | null): ClipMeta | undefined {
    return clip ? this.manifest[clip] : undefined
  }

  // Follow the fallback chain (CLIP_FALLBACK, then dance_* -> dance_bounce) until a clip the GLB actually has.
  private resolve(clip: Clip): { clip: Clip; action: AnimationAction } | null {
    const seen = new Set<Clip>()
    for (let c: Clip | undefined = clip; c && !seen.has(c); c = fallbackOf(c)) {
      seen.add(c)
      const glb = this.names.get(c)
      const action = glb ? this.getAction(glb) : null
      if (action) return { clip: c, action }
      this.missing.add(c)
    }
    return null
  }

  private fadeTo(clip: Clip, fade: number, once?: { reps: number }): boolean {
    const hit = this.resolve(clip)
    if (!hit) return false
    const next = hit.action
    const prev = this.current
    this.requested = clip
    this.playing = hit.clip
    this.fxPrevT = -1
    if (once) {
      next.setLoop(once.reps > 1 ? LoopRepeat : LoopOnce, once.reps)
      next.clampWhenFinished = true
    } else {
      next.setLoop(LoopRepeat, Infinity)
      next.clampWhenFinished = false
    }
    // A loop that resolves to the clip already playing keeps its phase.
    if (prev === next && !once) return true
    next.reset()
    next.setEffectiveTimeScale(MOTION.timeScale)
    next.setEffectiveWeight(1)
    next.play()
    if (prev && prev !== next) next.crossFadeFrom(prev, fade, false)
    else if (!prev) next.fadeIn(fade)
    this.current = next
    return true
  }

  // How many times a one-shot plays: a dance the manifest marks as looping
  // repeats until it reads as a dance.
  private reps(clip: Clip, duration: number): number {
    return this.meta(clip)?.loop && duration > 0 ? Math.max(1, Math.ceil(MOTION.minGestureSeconds / duration)) : 1
  }

  // Seconds a one-shot will play (after fallbacks and repeats); null if the GLB has nothing for it.
  gestureSeconds(clip: OneShotClip): number | null {
    const hit = this.resolve(clip)
    if (!hit) return null
    const duration = hit.action.getClip().duration
    return (duration * this.reps(hit.clip, duration)) / MOTION.timeScale
  }

  // Whether he is walking, settling, or about to start toward `target` (or to turn to `face`).
  willMove(target: { x: number; z: number }, face?: number | null): boolean {
    return (
      this.phase !== 'still' ||
      Math.hypot(target.x - this.pos.x, target.z - this.pos.z) > WALK.arriveEps ||
      Math.abs(angleDiff(this.yaw, face ?? 0)) > WALK.settleAngle
    )
  }

  private startGesture(clip: OneShotClip, fade: number): void {
    const hit = this.resolve(clip)
    if (!hit) return
    const duration = hit.action.getClip().duration
    const reps = this.reps(hit.clip, duration)
    if (!this.fadeTo(clip, fade, { reps })) return
    this.gesture = { clip, elapsed: 0, total: (duration * reps) / MOTION.timeScale }
  }

  // Walking: turn toward the travel direction, accelerate, ease into the spot,
  // then turn back to the camera (or to `face`). Returns true while he is not settled.
  private walk(dt: number, target: { x: number; z: number }, face = 0): boolean {
    const dx = target.x - this.pos.x
    const dz = target.z - this.pos.z
    const dist = Math.hypot(dx, dz)
    if (dist > WALK.arriveEps) {
      this.phase = 'walking'
      const heading = Math.atan2(dx, dz)
      this.yaw = dampAngle(this.yaw, heading, WALK.turnK, dt)
      if (Math.abs(angleDiff(this.yaw, heading)) < WALK.startAngle) {
        this.speed = Math.min(this.speed + WALK.accel * dt, WALK.maxSpeed, Math.max(WALK.minSpeed, dist * WALK.arriveK))
        const step = this.speed * dt
        if (step >= dist - WALK.arriveEps) {
          this.pos.x = target.x
          this.pos.z = target.z
          this.speed = 0
          this.phase = 'settling'
        } else {
          this.pos.x += (dx / dist) * step
          this.pos.z += (dz / dist) * step
        }
      }
      return true
    }
    this.speed = 0
    this.yaw = dampAngle(this.yaw, face, WALK.turnBackK, dt)
    if (Math.abs(angleDiff(this.yaw, face)) > WALK.settleAngle) {
      this.phase = 'settling'
      return true
    }
    this.phase = 'still'
    return false
  }

  update(dt: number, input: MotionInput): void {
    if (input.gesture && input.gesture.id !== this.lastGestureId) {
      this.lastGestureId = input.gesture.id
      this.pending = input.gesture.clip
      this.pendingFade = input.gesture.fade ?? MOTION.fadeGesture
    }
    const cut = !!input.cut && (this.gesture !== null || this.pending !== null)
    if (cut) {
      this.gesture = null
      this.pending = null
    }

    const moving = this.walk(dt, input.target, input.face ?? 0)

    if (moving) {
      // A spot change cuts a one-shot; requests made mid-walk wait for arrival.
      this.gesture = null
    } else if (this.pending) {
      const clip = this.pending
      this.pending = null
      this.startGesture(clip, this.pendingFade)
    }

    let fromGesture = cut
    if (this.gesture) {
      this.gesture.elapsed += dt
      if (this.gesture.elapsed < this.gesture.total - MOTION.fadeBack) return
      this.gesture = null
      fromGesture = true
    }

    const base: LoopClip = moving ? 'walk' : input.loop === 'idle' && input.speaking ? 'talk' : input.loop
    if (base === this.requested && !fromGesture && this.current) return
    const walkFade = base === 'walk' || this.requested === 'walk'
    const loopFade = input.loopFade ?? MOTION.fadeLoop
    this.fadeTo(base, cut ? loopFade : fromGesture ? MOTION.fadeBack : walkFade ? MOTION.fadeWalk : loopFade)
  }

  // Face for the dominant clip (the manifest wins over DEFAULT_FACE).
  face(): FaceState {
    if (this.phase === 'walking') return 'neutral'
    const asked = this.requested ? defaultFace(this.requested) : undefined
    const own = this.meta(this.playing)?.face
    // A stand-in clip plays the requested clip's mood (sleep -> idle keeps closed eyes).
    if (this.playing !== this.requested) return asked ?? own ?? 'neutral'
    return own ?? asked ?? 'neutral'
  }

  // Fx whose time the dominant clip crossed since the last call (after the mixer update).
  collectFx(out: FxKind[]): void {
    const action = this.current
    const fx = this.meta(this.playing)?.fx
    if (!action || !fx?.length) return
    const t = action.time
    const prev = this.fxPrevT
    this.fxPrevT = t
    const looped = t < prev // a loop (or a repeating dance) wrapped around
    for (const [at, kind] of fx) {
      if (looped ? at > prev || at <= t : at > prev && at <= t) out.push(kind)
    }
  }
}
