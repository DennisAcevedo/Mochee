import { pointAt, solveTime, vec, velocityAt, type Vec3 } from './shot.ts'

// Where the ball is during a play_* clip, read off the clip's "ball" block in
// public/models/tutor.manifest.json (written by BLENDER/tutor/build_tutor.py
// from BLENDER/tutor/author_play.py). Positions are model units in the tutor's
// root frame (x = his left, y up, z = his front); BallProp turns them into
// world space with the root node's live world matrix. Pure: no three, React or
// store imports (tests/character/hoops.test.ts runs it under Node).
//
// Events: grab / catch = the ball rides the `follow` node (+ offset);
// release = it leaves the hands (one-shot: free flight, the app's job);
// rest = it waits on the floor; contact = a foot strikes it (one-shot: free
// flight; loop: the arc to the next contact); push = the dribble hand lets go
// downward; bounce = it meets the floor; apex = a marker inside an arc.

export interface BallEvent {
  kind: string
  t: number
  pos: Vec3 | null
  bone: string | null
}

export interface BallClip {
  name: string
  duration: number
  loop: boolean
  radius: number // model units
  events: BallEvent[] // by time
  follow: { node: string; offset: Vec3 } | null
  launch: Vec3 | null // unit direction for the flight after a release / contact (root frame)
}

export type BallClips = Record<string, BallClip>

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const vec3 = (v: unknown): Vec3 | null => (Array.isArray(v) && v.length === 3 && v.every(num) ? vec(v[0], v[1], v[2]) : null)

// Every clip with a ball block, from the manifest JSON (malformed entries are skipped).
export function parseBallClips(json: unknown): BallClips {
  const out: BallClips = {}
  const clips = (json as { clips?: unknown } | null)?.clips
  if (!Array.isArray(clips)) return out
  for (const c of clips) {
    const ball = c?.ball
    if (typeof c?.name !== 'string' || !num(c.duration) || !ball || !Array.isArray(ball.events)) continue
    const events: BallEvent[] = []
    for (const e of ball.events) {
      if (typeof e?.kind !== 'string' || !num(e.t)) continue
      events.push({ kind: e.kind, t: e.t, pos: vec3(e.pos), bone: typeof e.bone === 'string' ? e.bone : null })
    }
    if (!events.length) continue
    events.sort((a, b) => a.t - b.t)
    const f = ball.follow
    const offset = vec3(f?.offset)
    out[c.name] = {
      name: c.name,
      duration: c.duration,
      loop: !!c.loop,
      radius: num(ball.radius) ? ball.radius : 0.2,
      events,
      follow: typeof f?.node === 'string' && offset ? { node: f.node, offset } : null,
      launch: vec3(ball.launch),
    }
  }
  return out
}

// What moves the ball at clip time t:
// hold   = sits at `pos` (root frame)
// follow = rides clip.follow.node + offset
// path   = an app-driven arc: `pos` / `vel` (root frame, model units per second)
// free   = it has left him: the app's flight takes over (one-shots only)
export type BallDrive =
  | { mode: 'hold'; pos: Vec3 }
  | { mode: 'follow' }
  | { mode: 'path'; pos: Vec3; vel: Vec3 }
  | { mode: 'free'; event: BallEvent }

const HELD = new Set(['grab', 'catch'])
const FREE = new Set(['release', 'contact'])

// The first event after index i (wrapping a loop) that the ball is aimed at: apex markers are skipped.
function nextTarget(clip: BallClip, i: number): { e: BallEvent; t: number } | null {
  const n = clip.events.length
  for (let k = 1; k <= n; k++) {
    const j = i + k
    if (!clip.loop && j >= n) return null
    const e = clip.events[j % n]
    if (e.kind === 'apex' || !e.pos) continue
    return { e, t: e.t + (j >= n ? clip.duration : 0) }
  }
  return null
}

export function driveAt(clip: BallClip, time: number, g: number): BallDrive {
  const ev = clip.events
  const t = clip.loop ? ((time % clip.duration) + clip.duration) % clip.duration : time
  // The event in force: the last one at or before t (a loop wraps to its last event).
  let i = -1
  for (let k = 0; k < ev.length; k++) if (ev[k].t <= t + 1e-9) i = k
  if (i < 0) {
    if (!clip.loop) {
      const first = ev.find((e) => e.pos)
      return first?.pos ? { mode: 'hold', pos: first.pos } : { mode: 'follow' }
    }
    i = ev.length - 1
  }
  // An apex is a marker inside the arc that started at the event before it.
  while (ev[i].kind === 'apex' && i > 0) i--
  const e = ev[i]
  const since = t - e.t + (t < e.t ? clip.duration : 0)

  if (HELD.has(e.kind)) return clip.follow ? { mode: 'follow' } : e.pos ? { mode: 'hold', pos: e.pos } : { mode: 'follow' }
  if (e.kind === 'rest' && e.pos) return { mode: 'hold', pos: e.pos }
  if (FREE.has(e.kind) && !clip.loop) return { mode: 'free', event: e }

  // An app-driven arc from this event's spot to the next target's, in exactly the time between them.
  const next = nextTarget(clip, i)
  if (!e.pos || !next?.e.pos) return clip.follow ? { mode: 'follow' } : { mode: 'hold', pos: e.pos ?? vec() }
  const span = next.t - e.t
  const v0 = solveTime(e.pos, next.e.pos, span, g)
  return { mode: 'path', pos: pointAt(e.pos, v0, g, since), vel: velocityAt(v0, g, since) }
}

// Where the ball should be when the clip starts (t = 0): the gather target.
export function startPos(clip: BallClip, g: number): Vec3 | null {
  const d = driveAt(clip, 0, g)
  if (d.mode === 'hold' || d.mode === 'path') return d.pos
  return clip.events.find((e) => e.pos)?.pos ?? null
}

// The next time at or after `now` (clip seconds, unwrapped) that a loop passes an event of `kind`.
export function nextEventTime(clip: BallClip, kind: string, now: number): number | null {
  const hits = clip.events.filter((e) => e.kind === kind)
  if (!hits.length) return null
  const cycle = Math.floor(now / clip.duration)
  for (let c = cycle; c <= cycle + 1; c++) {
    for (const e of hits) {
      const at = c * clip.duration + e.t
      if (at >= now - 1e-9) return at
    }
  }
  return null
}
