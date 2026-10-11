import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Euler, Quaternion, Vector3, type Object3D } from 'three'
import { useDirector, type Clip, type OneShotClip } from '../../state/director.ts'
import { useTumbles, type TumbleCause } from '../../state/tumbles.ts'
import { usePlayBody } from '../../scene/physics/playBody.ts'
import { MOTION, TUMBLE_CLIPS, TUMBLE_CLIPS_LEFT, TUMBLE_FOLLOW_UP } from './config.ts'

// Tumble variants, one per TumbleCause. With a GLB that has the per-cause clip
// (TUMBLE_CLIPS, BLENDER/tutor/author_tumbles.py) the knock plays that clip,
// which carries its own travel and spin and ends on the 'tumble' loop's first
// frame, then hands off to 'recover'. An older GLB without it falls back to the
// procedural flourish: the 'tumble' loop held under tumbleOffset() on the
// tutor's root (Tumbles.dc.html), then 'recover'.
//
// Offset frame: his own, +x = his right (the dir = 1 side), +y up, +z his
// front. Positions are in tutor heights, rotations in radians (wrapped to
// [-pi, pi], so full flips and spins end at 0), scale is a multiplier.

export const TUMBLE = {
  // Seconds per cause: the clip lengths in the GLB (tests/character/tumbleLayer.test.ts pins them to the manifest).
  seconds: { boss: 1.4, thrown: 1.2, dropped: 1.1, bonk: 1.3, shaken: 1.6, flicked: 1.2 } satisfies Record<TumbleCause, number>,
  recoverAt: 1, // fraction of the clip when 'recover' takes over: at its end, on the tuck pose
  // TutorMotion starts fading a one-shot back to the loop MOTION.fadeBack before
  // it ends; 'recover' must take over before that (plus a frame of slack) or he
  // half-stands for a beat between the tuck and the recover.
  clipLead: MOTION.fadeBack + 0.05,
  offsetRecoverAt: 0.6, // no clip: fraction of the offset when the 'tumble' loop hands off to 'recover'
  pivot: 0.5, // rotations turn about this fraction of his height (his middle), squash stays on his feet
} as const

// The clip for a knock: the cause's clip, its mirror for a fall to his left when there is one.
export function tumbleClip(cause: TumbleCause, dir: 1 | -1): OneShotClip {
  return (dir < 0 ? TUMBLE_CLIPS_LEFT[cause] : undefined) ?? TUMBLE_CLIPS[cause]
}

export interface TumbleOffset {
  pos: [number, number, number]
  rot: [number, number, number]
  scale: [number, number, number]
  done: boolean
}

const TAU = Math.PI * 2
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const outCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3
const inOutCubic = (x: number) => {
  const u = clamp01(x)
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2
}
const hump = (x: number) => Math.sin(Math.PI * clamp01(x)) // 0 -> 1 -> 0
const span = (u: number, a: number, b: number) => clamp01((u - a) / (b - a)) // u's progress through [a, b]
const wrap = (a: number) => {
  const w = a - TAU * Math.round(a / TAU)
  return Math.abs(w) < 1e-9 ? 0 : w
}

export function tumbleDuration(cause: TumbleCause): number {
  return TUMBLE.seconds[cause]
}

export function tumbleOffset(cause: TumbleCause, dir: 1 | -1, tSec: number): TumbleOffset {
  const dur = TUMBLE.seconds[cause]
  if (!(tSec < dur)) return { pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], done: true }
  const u = clamp01(tSec / dur)
  const fade = (1 - u) * (1 - u) // envelope that reaches 0 at the end
  let px = 0
  let py = 0
  let pz = 0
  let rx = 0
  let ry = 0
  let rz = 0
  let sx = 1
  let sy = 1
  let sz = 1

  switch (cause) {
    case 'boss': {
      // Knocked back off his feet, a full backflip in the air, a squash on landing, then he steps back in.
      const air = span(u, 0, 0.6)
      pz = -0.55 * outCubic(span(u, 0, 0.45)) * (1 - inOutCubic(span(u, 0.6, 1)))
      py = 0.7 * hump(air)
      rx = -TAU * inOutCubic(air)
      rz = 0.18 * hump(air)
      const land = hump(span(u, 0.58, 0.82))
      sy = 1 - 0.28 * land
      sx = sz = 1 + 0.14 * land
      break
    }
    case 'thrown': {
      // A sideways roll along the throw: out and back on a little bounce.
      const roll = outCubic(u)
      px = 0.45 * hump(u)
      py = 0.22 * Math.abs(Math.sin(TAU * u)) * fade
      rz = -TAU * roll // rolling toward his right turns him clockwise from the front
      const land = hump(span(u, 0.85, 1))
      sy = 1 - 0.12 * land
      sx = sz = 1 + 0.06 * land
      break
    }
    case 'dropped': {
      // Splat flat, pop up tall, wobble back to shape.
      const splat = outCubic(span(u, 0, 0.3)) * (1 - span(u, 0.3, 0.45))
      const pop = hump(span(u, 0.35, 0.75))
      const wobble = Math.sin(TAU * 2 * span(u, 0.7, 1)) * (1 - span(u, 0.7, 1))
      sy = 1 - 0.55 * splat + 0.22 * pop + 0.08 * wobble
      sx = sz = 1 + 0.45 * splat - 0.1 * pop - 0.05 * wobble
      py = 0.4 * pop
      rz = 0.12 * hump(span(u, 0.3, 0.8))
      break
    }
    case 'bonk': {
      // Smack: flattened against the wall, recoil away from it, then a dizzy head wobble.
      const hit = hump(span(u, 0, 0.18))
      const away = outCubic(span(u, 0.05, 0.3)) * (1 - inOutCubic(span(u, 0.55, 1)))
      px = -0.22 * away
      sx = 1 - 0.22 * hit
      sy = sz = 1 + 0.1 * hit
      const dizzy = span(u, 0.15, 1)
      const env = (1 - dizzy) * (1 - dizzy) * Math.min(1, dizzy * 6)
      rz = 0.3 * hit + 0.28 * Math.sin(TAU * 3 * dizzy) * env
      rx = 0.16 * Math.cos(TAU * 3 * dizzy) * env
      break
    }
    case 'shaken': {
      // Dizzy spiral: two slowing spins while his top traces shrinking circles.
      ry = TAU * 2 * outCubic(u)
      const circ = TAU * 2.5 * u
      const env = fade * Math.min(1, u * 5)
      rx = 0.3 * Math.sin(circ) * env
      rz = 0.3 * Math.cos(circ) * env
      px = 0.1 * Math.cos(circ) * env
      pz = 0.1 * Math.sin(circ) * env
      py = 0.05 * hump(u)
      break
    }
    case 'flicked': {
      // Spin-out: three fast turns that wind down, on a small hop, leaning into the spin.
      ry = TAU * 3 * outCubic(u)
      py = 0.2 * hump(span(u, 0, 0.7))
      rz = 0.22 * hump(u) * (1 - u)
      px = 0.12 * hump(u)
      break
    }
  }

  // Mirror for a fall to his left: x and the rotations that move x (y, z) flip.
  const m = dir
  return {
    pos: [px * m, py, pz],
    rot: [wrap(rx), wrap(ry * m), wrap(rz * m)],
    scale: [sx, sy, sz],
    done: false,
  }
}

export interface TumbleLayerOptions {
  height?: number // his height in the root's parent units (world); offsets are in heights
  priority?: number // useFrame priority; 0 keeps R3F auto-rendering (call after useAnimations so it runs after the mixer)
  hasClip?: (clip: Clip) => boolean // the GLB has this clip; without it every knock uses the procedural fallback
}

// Plays the newest knock on `rootRef`.
// - The GLB has the cause's clip: play it through the director, then 'recover'
//   (then the cause's TUMBLE_FOLLOW_UP). The play waits for this layer's frame
//   callback: a physics landing knocks and then plays 'recover' in the same
//   tick (PhysicsTutor, priority -1), and the director keeps only the last
//   request per frame, so the clip has to come after it.
// - No clip: 'tumble' then 'recover' (unless physics already owns his clips
//   mid-fling) and the variant's offset on the root every frame after the
//   mixer. The root's own transform is kept as the base; if nobody else
//   rewrites it each frame, the offset is undone before the next one so
//   nothing accumulates.
export function useTumbleLayer(rootRef: RefObject<Object3D | null>, opts: TumbleLayerOptions = {}): void {
  const height = opts.height ?? 1
  const hasClip = useRef(opts.hasClip)
  useEffect(() => {
    hasClip.current = opts.hasClip
  }, [opts.hasClip])
  const s = useMemo(
    () => ({
      cause: null as TumbleCause | null,
      dir: 1 as 1 | -1,
      t: 0,
      clip: null as OneShotClip | null, // the GLB clip playing this knock (null = the procedural fallback)
      play: false, // the clip waits for this layer's next frame callback
      followUp: null as OneShotClip | null, // queued behind 'recover' on the frame after the hand-off
      clips: false, // this layer drives the clips for the current knock
      handedOff: false,
      seen: useTumbles.getState().last?.id ?? 0,
      applied: false,
      basePos: new Vector3(),
      baseQuat: new Quaternion(),
      baseScale: new Vector3(),
      setPos: new Vector3(),
      setQuat: new Quaternion(),
      setScale: new Vector3(),
      q: new Quaternion(),
      e: new Euler(0, 0, 0, 'YXZ'),
      v: new Vector3(),
      piv: new Vector3(),
    }),
    [],
  )

  // Knocks: start (or restart) the variant.
  useEffect(
    () =>
      useTumbles.subscribe((st) => {
        const ev = st.last
        if (!ev || ev.id === s.seen) return
        s.seen = ev.id
        s.cause = ev.cause
        s.dir = ev.dir
        s.t = 0
        s.handedOff = false
        s.followUp = null
        const clip = tumbleClip(ev.cause, ev.dir)
        s.clip = hasClip.current?.(clip) ? clip : null
        s.play = s.clip !== null
        // A clip always hands off to 'recover' itself (it replaces the one a landing plays).
        s.clips = s.clip !== null || usePlayBody.getState().state === 'idle'
        if (s.clips && !s.clip) useTumbles.getState().setHold('tumble')
      }),
    [s],
  )

  // Unmount mid-variant: hand the loop back.
  useEffect(
    () => () => {
      if (s.cause && s.clips && !s.clip && !s.handedOff) useTumbles.getState().setHold(null)
    },
    [s],
  )

  useFrame((_, delta) => {
    const root = rootRef.current
    if (!root) return
    // Undo last frame's offset when nobody else reset the root since.
    if (s.applied) {
      if (root.position.equals(s.setPos) && root.quaternion.equals(s.setQuat) && root.scale.equals(s.setScale)) {
        root.position.copy(s.basePos)
        root.quaternion.copy(s.baseQuat)
        root.scale.copy(s.baseScale)
      }
      s.applied = false
    }
    if (s.followUp) {
      // One frame after 'recover' started: waits in the controller's queue until it ends.
      useDirector.getState().play(s.followUp)
      s.followUp = null
    }
    if (!s.cause) return
    if (s.clip && s.play) {
      s.play = false
      useDirector.getState().play(s.clip, { urgent: true })
    }
    s.t += Math.min(delta, 0.05)
    const dur = TUMBLE.seconds[s.cause]
    if (s.clip) {
      // The clip carries the motion: no offset. Hand off to 'recover' on the tuck,
      // unless he was picked up again mid-clip (the next landing knocks anew).
      if (!s.handedOff && s.t >= dur * TUMBLE.recoverAt - TUMBLE.clipLead) {
        s.handedOff = true
        const body = usePlayBody.getState().state
        if (body !== 'held' && body !== 'flying') {
          useDirector.getState().play('recover')
          s.followUp = TUMBLE_FOLLOW_UP[s.cause] ?? null
        }
      }
      if (s.t >= dur) s.cause = null
      return
    }
    if (s.clips && !s.handedOff && s.t >= dur * TUMBLE.offsetRecoverAt) {
      // Hand-off rule (animController): drop the hold and play in one tick, or the tumble loop blocks the recover.
      useTumbles.getState().setHold(null)
      useDirector.getState().play('recover')
      s.handedOff = true
    }
    const o = tumbleOffset(s.cause, s.dir, s.t)
    if (o.done) {
      s.cause = null
      return
    }
    s.basePos.copy(root.position)
    s.baseQuat.copy(root.quaternion)
    s.baseScale.copy(root.scale)
    // His frame -> the model's: the model faces +Z, so his right is -X (mirror x, and the y / z turns).
    s.e.set(o.rot[0], -o.rot[1], -o.rot[2], 'YXZ')
    s.q.setFromEuler(s.e)
    // Turn about his middle: keep the pivot point where it was.
    s.piv.set(0, height * TUMBLE.pivot, 0)
    s.v.copy(s.piv).applyQuaternion(s.q).sub(s.piv).negate() // pivot - q * pivot, in his frame
    s.v.x += -o.pos[0] * height
    s.v.y += o.pos[1] * height
    s.v.z += o.pos[2] * height
    s.v.applyQuaternion(s.baseQuat)
    root.position.add(s.v)
    root.quaternion.multiply(s.q)
    root.scale.set(s.baseScale.x * o.scale[0], s.baseScale.y * o.scale[1], s.baseScale.z * o.scale[2])
    s.setPos.copy(root.position)
    s.setQuat.copy(root.quaternion)
    s.setScale.copy(root.scale)
    s.applied = true
  }, opts.priority ?? 0)
}
