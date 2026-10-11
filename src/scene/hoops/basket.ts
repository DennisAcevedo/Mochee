import type { Outcome, Vec3 } from './shot.ts'

// The student's own baskets: the physics ball after they throw or drop it
// (Toys.tsx arms the watch on release), stepped after every physics step.
//  - A make: the ball's centre passes DOWN through the rim plane inside the rim
//    radius. Not one coming up from below, and not one whose step cut through
//    the backboard. Clean = 'swish', off the rim first = 'rimIn'.
//  - A miss ('rimOut'): the ball reached the hoop (touched the rim or the
//    board, or passed just over the opening) and then left without dropping
//    in, or sat on the rim past `rattle` seconds (`stuck`: the caller nudges it off).
//  - No attempt at all: a throw that never got there. The watch disarms once
//    the ball comes to rest away from the hoop, or after `maxSeconds`.
// One result per throw: the watch disarms when it calls one.
// Pure: tests/character/hoopsBasket.test.ts runs it under Node.

export interface BasketGeom {
  rim: Vec3 // the rim's centre
  rimRadius: number // to the rim tube's centre line
  rimTube: number // the rim collider's tube radius
  ballRadius: number
  board: { center: Vec3; half: Vec3 } // the backboard's box (axis-aligned)
}

export interface BasketTuning {
  touch: number // slack on a rim or board contact (world units)
  over: number // passing this far (centre) over the opening counts as reaching the hoop
  leave: number // margin past the rim and the ball before the ball has left the hoop
  rattle: number // seconds at the hoop before a ball still there is called a miss
  rest: { speed: number; seconds: number } // slower than this for this long, away from the hoop: the throw is over
  maxSeconds: number // an armed throw that never reaches the hoop is dropped after this long
}

export interface BasketWatch {
  armed: boolean
  prev: Vec3 // the ball's centre after the last step
  reached: boolean
  rimTouched: boolean
  fromBelow: boolean // came up through the opening; cleared once it is away from the hoop
  t: number // seconds since armed
  atHoop: number // seconds at the hoop since it reached it
  still: number // seconds slow, away from the hoop
  stuck: boolean // the last result was a rattle timeout: the caller nudges the ball off the rim
}

export const newWatch = (): BasketWatch => ({
  armed: false,
  prev: { x: 0, y: 0, z: 0 },
  reached: false,
  rimTouched: false,
  fromBelow: false,
  t: 0,
  atHoop: 0,
  still: 0,
  stuck: false,
})

// The ball just left the student's hand (or shootBall's pop) at `p`.
export function armWatch(w: BasketWatch, p: Vec3): void {
  Object.assign(w, { armed: true, reached: false, rimTouched: false, fromBelow: false, t: 0, atHoop: 0, still: 0, stuck: false })
  w.prev.x = p.x
  w.prev.y = p.y
  w.prev.z = p.z
}

// Grabbed again, or a ball move took it: whatever it was doing is not a shot any more.
export function disarmWatch(w: BasketWatch): void {
  w.armed = false
}

const hdist = (x: number, z: number, c: Vec3) => Math.hypot(x - c.x, z - c.z)

function boxDistance(p: Vec3, b: BasketGeom['board']): number {
  const dx = Math.max(0, Math.abs(p.x - b.center.x) - b.half.x)
  const dy = Math.max(0, Math.abs(p.y - b.center.y) - b.half.y)
  const dz = Math.max(0, Math.abs(p.z - b.center.z) - b.half.z)
  return Math.hypot(dx, dy, dz)
}

// Does the segment a -> b pass through the box grown by `grow` (slab test)?
export function segmentHitsBox(a: Vec3, b: Vec3, box: BasketGeom['board'], grow: number): boolean {
  let t0 = 0
  let t1 = 1
  for (const k of ['x', 'y', 'z'] as const) {
    const d = b[k] - a[k]
    const lo = box.center[k] - box.half[k] - grow
    const hi = box.center[k] + box.half[k] + grow
    if (Math.abs(d) < 1e-12) {
      if (a[k] < lo || a[k] > hi) return false
      continue
    }
    let ta = (lo - a[k]) / d
    let tb = (hi - a[k]) / d
    if (ta > tb) [ta, tb] = [tb, ta]
    t0 = Math.max(t0, ta)
    t1 = Math.min(t1, tb)
    if (t0 > t1) return false
  }
  return true
}

// One physics step: `p` is the ball's centre after it, `speed` its speed. Returns the shot's
// outcome on the step that decides it, else null.
export function stepWatch(w: BasketWatch, p: Vec3, speed: number, dt: number, g: BasketGeom, k: BasketTuning): Outcome | null {
  if (!w.armed) return null
  w.stuck = false
  w.t += dt
  const c = g.rim
  const R = g.rimRadius
  const y0 = w.prev.y - c.y
  const y1 = p.y - c.y

  // Through the rim plane this step, at the interpolated crossing point.
  let made = false
  if ((y0 > 0 && y1 <= 0) || (y0 < 0 && y1 >= 0)) {
    const f = y0 / (y0 - y1)
    const inside = hdist(w.prev.x + (p.x - w.prev.x) * f, w.prev.z + (p.z - w.prev.z) * f, c) < R
    if (inside && y0 < 0) w.fromBelow = true
    // Grown by a little less than the ball: a bank shot's contact slop is not "through the board".
    else if (inside && !w.fromBelow && !segmentHitsBox(w.prev, p, g.board, g.ballRadius - k.touch)) made = true
  }
  w.prev.x = p.x
  w.prev.y = p.y
  w.prev.z = p.z

  // Reaching the hoop: the rim, the board, or just over the opening.
  const h = hdist(p.x, p.z, c)
  if (Math.hypot(h - R, y1) <= g.ballRadius + g.rimTube + k.touch) {
    w.rimTouched = true
    w.reached = true
  }
  if (boxDistance(p, g.board) <= g.ballRadius + k.touch) w.reached = true
  if (!w.fromBelow && y1 > 0 && y1 <= k.over && h < R) w.reached = true

  if (made) {
    w.armed = false
    return w.rimTouched ? 'rimIn' : 'swish'
  }

  // At the hoop: within reach of the rim, from just under the rim up.
  const margin = g.ballRadius + g.rimTube + k.leave
  const atHoop = h <= R + margin && y1 >= -margin
  if (!atHoop) w.fromBelow = false
  if (w.reached) {
    if (!atHoop) {
      w.armed = false
      return 'rimOut'
    }
    w.atHoop += dt
    if (w.atHoop > k.rattle) {
      w.armed = false
      w.stuck = true
      return 'rimOut'
    }
    return null
  }
  w.still = speed < k.rest.speed && !atHoop ? w.still + dt : 0
  if (w.still > k.rest.seconds || w.t > k.maxSeconds) w.armed = false
  return null
}
