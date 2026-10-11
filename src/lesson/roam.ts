// Roaming between lesson beats and the idle emotes (design/sparkle-stage/Roam.dc.html),
// as a pure scheduler: roamStep(now, state, rng) -> the next action and the
// next state. No React, three or store imports, so tests/ui/roam.test.ts runs
// it under plain Node; src/scene/CharacterDirector.tsx feeds it the world on a
// timer and turns its actions into director calls.
//
// Rules:
// - Only while enabled (live lesson, study mode, not held) and free (not speaking, pointing, thinking or performing a step).
// - Every 4 to 9 s he paces to the other side of the lane or wanders to a
//   random spot in it, always a real step away from where he stands.
// - The maximized window wins over all of it: he steps aside to the right,
//   away from its home on the left, and waits there until it is restored.
// - About 20 s with no student input: a small emote, never the same twice in a row.
// The walkthrough winning at once is the director's job: walkTo clears the roam target.

export const ROAM = {
  tickMs: 200, // how often CharacterDirector asks the scheduler
  gapMin: 4, // seconds between roams, randomised in [gapMin, gapMax)
  gapMax: 9,
  paceChance: 0.5, // pace to the other side vs wander to a random spot
  paceInset: 0.15, // pace targets sit this share of the lane in from its far edge (Roam.dc.html: 36% / 64% of a 30%..70% lane)
  wanderInset: 0.05, // wander targets keep this share of the lane clear at each edge (32%..68%)
  wanderMinStep: 0.25, // a wander moves at least this share of the lane
  idleEmoteSeconds: 20, // no student input for this long: wave or hop
  idleEmotes: ['wave', 'hop'] as const,
  // Where he waits beside a maximized window (asideSpot): this share of the way
  // from the window's edge to the stage frame's edge, on screen.
  asideGapShare: 0.5,
  asideTieNdc: 0.05, // gaps closer than this (NDC) count as equal: he takes the side away from the window's home
} as const

export type IdleEmote = (typeof ROAM.idleEmotes)[number]
// The window he steps aside from: the room has one, under the left window's
// old id ('notes'), standing left of him.
export type AsideFrom = 'notes'

export interface RoamState {
  // The world, refreshed by the caller every tick.
  enabled: boolean // live lesson, study mode, not held, tutor loaded
  busy: boolean // speaking, pointing, thinking, a step in progress, a question pending
  moving: boolean // walking, settling or playing a one-shot (his own, so the idle clock keeps running)
  x: number // where he stands (world x)
  laneMin: number
  laneMax: number
  maximized: AsideFrom | null
  lastInput: number // seconds, same clock as `now`
  // The scheduler's memory, carried from tick to tick.
  nextAt: number | null // when the next roam is due; null = not scheduled
  aside: AsideFrom | null // stepped aside from this maximized window
  quietSince: number // last time he was busy
  lastEmote: IdleEmote | null
  lastEmoteAt: number
}

export type RoamAction =
  | { kind: 'none' }
  | { kind: 'walk'; how: 'pace' | 'wander'; x: number }
  | { kind: 'aside'; side: 1 | -1 } // +1 = toward the viewer's right
  | { kind: 'back' } // the maximized window was restored (or roaming stopped): drop the aside
  | { kind: 'emote'; clip: IdleEmote }

export type Rng = () => number // uniform in [0, 1)

const NONE: RoamAction = { kind: 'none' }

export function initialRoam(now: number): RoamState {
  return {
    enabled: false,
    busy: false,
    moving: false,
    x: 0,
    laneMin: -1,
    laneMax: 1,
    maximized: null,
    lastInput: now,
    nextAt: null,
    aside: null,
    quietSince: now,
    lastEmote: null,
    lastEmoteAt: now,
  }
}

// A uniform pick from `list` that is never `last` (unless nothing else is left).
export function pickNoRepeat<T>(list: readonly T[], last: T | null, rng: Rng): T {
  const pool = list.length > 1 ? list.filter((c) => c !== last) : list
  const from = pool.length ? pool : list
  return from[Math.min(from.length - 1, Math.floor(rng() * from.length))]
}

// The celebrations the student has unlocked: an entry with no unlock level is always open.
export function openCelebrations<T extends string>(list: readonly T[], isOpen: (c: T) => boolean): T[] {
  const open = list.filter(isOpen)
  return open.length ? open : [...list]
}

// What asideSpot needs to know about the camera and the maximized window.
export interface AsideView {
  camX: number // the camera's x, with its pan toward a focused window
  camZ: number
  fov: number // vertical, degrees
  aspect: number // the stage frame's
}
export interface AsideWindow {
  cx: number // world centre x
  halfW: number // world half width
  z: number
}

// The world x he waits at beside a maximized window, at depth z: the middle
// of the screen gap between the window's edge and the stage frame's edge, on
// the side with more room (away from the window's home when the gaps tie, as
// they do with the camera centred). Worked out on screen because the
// maximized window stays put in the world while the camera pans toward a
// focused window, sliding it across the frame; it also follows whatever size
// the windows give it.
export function asideSpot(win: AsideWindow, home: 1 | -1, z: number, view: AsideView): number {
  const perNdc = (depth: number) => (view.camZ - depth) * Math.tan((view.fov * Math.PI) / 360) * view.aspect
  const atWin = perNdc(win.z)
  const left = (win.cx - win.halfW - view.camX) / atWin
  const right = (win.cx + win.halfW - view.camX) / atWin
  const gapL = left + 1
  const gapR = 1 - right
  const side = Math.abs(gapR - gapL) < ROAM.asideTieNdc ? home : gapR > gapL ? 1 : -1
  const edge = Math.max(-1, Math.min(1, side > 0 ? right : left))
  return view.camX + (edge + (side - edge) * ROAM.asideGapShare) * perNdc(z)
}

// Lane depth at x: straight lines between the left, centre and right spots, flat past the ends.
export function laneZ(x: number, spots: { left: { x: number; z: number }; center: { x: number; z: number }; right: { x: number; z: number } }): number {
  const { left: l, center: c, right: r } = spots
  if (x <= l.x) return l.z
  if (x >= r.x) return r.z
  const [a, b] = x < c.x ? [l, c] : [c, r]
  return a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x || 1)
}

// Where to walk next. A pace crosses to the far side; a wander lands anywhere
// in the lane at least wanderMinStep away (one rng draw over the two allowed
// stretches, so it never loops). A lane too short to wander in paces instead.
export function roamTarget(s: Pick<RoamState, 'x' | 'laneMin' | 'laneMax'>, rng: Rng): { how: 'pace' | 'wander'; x: number } {
  const width = s.laneMax - s.laneMin
  const mid = (s.laneMin + s.laneMax) / 2
  const pace = { how: 'pace' as const, x: s.x < mid ? s.laneMax - ROAM.paceInset * width : s.laneMin + ROAM.paceInset * width }
  if (rng() < ROAM.paceChance) return pace
  const lo = s.laneMin + ROAM.wanderInset * width
  const hi = s.laneMax - ROAM.wanderInset * width
  const step = ROAM.wanderMinStep * width
  const left = Math.max(0, Math.min(hi, s.x - step) - lo)
  const right = Math.max(0, hi - Math.max(lo, s.x + step))
  if (left + right <= 0) return pace
  const u = rng() * (left + right)
  return { how: 'wander', x: u < left ? lo + u : Math.max(lo, s.x + step) + (u - left) }
}

// One scheduler tick. Never mutates `s`.
export function roamStep(now: number, s: RoamState, rng: Rng): { action: RoamAction; state: RoamState } {
  const next = { ...s }
  if (!s.enabled) {
    next.nextAt = null
    next.quietSince = now
    if (!s.aside) return { action: NONE, state: next }
    next.aside = null
    return { action: { kind: 'back' }, state: next }
  }

  // The maximized window: step aside, away from its home on the left, then wait.
  if (s.maximized !== s.aside) {
    next.aside = s.maximized
    next.nextAt = null
    if (s.maximized) return { action: { kind: 'aside', side: 1 }, state: next }
    return { action: { kind: 'back' }, state: next }
  }
  if (s.aside) return { action: NONE, state: next }

  if (s.busy) {
    next.nextAt = null
    next.quietSince = now
    return { action: NONE, state: next }
  }
  if (s.moving) return { action: NONE, state: next }

  // A long quiet spell with no input: a small emote, then a fresh gap.
  if (now - Math.max(s.lastInput, s.quietSince, s.lastEmoteAt) >= ROAM.idleEmoteSeconds) {
    const clip = pickNoRepeat(ROAM.idleEmotes, s.lastEmote, rng)
    next.lastEmote = clip
    next.lastEmoteAt = now
    next.nextAt = null
    return { action: { kind: 'emote', clip }, state: next }
  }

  if (s.nextAt === null) {
    next.nextAt = now + ROAM.gapMin + rng() * (ROAM.gapMax - ROAM.gapMin)
    return { action: NONE, state: next }
  }
  if (now < s.nextAt) return { action: NONE, state: next }

  next.nextAt = null // rescheduled once he has arrived (moving clears first)
  return { action: { kind: 'walk', ...roamTarget(s, rng) }, state: next }
}
