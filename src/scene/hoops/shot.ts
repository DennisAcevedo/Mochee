// The jump shot's math for the Play tab's "Shoot hoops": a ballistic solve from
// the release point to the rim, a small make/miss model (mostly swish, now and
// then a rim-in or a rim-out so it feels alive) and the shot's path as segments
// (flight, rim bounce, net) that BallProp samples every frame until the physics
// ball takes over. Pure: no three, React or store imports, so
// tests/character/hoops.test.ts runs it under plain Node.
// World units, y up; g > 0 pulls along -y.

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })

const set = (out: Vec3, x: number, y: number, z: number): Vec3 => {
  out.x = x
  out.y = y
  out.z = z
  return out
}

// Position `t` seconds into a free flight from p with launch velocity v.
export function pointAt(p: Vec3, v: Vec3, g: number, t: number, out: Vec3 = vec()): Vec3 {
  return set(out, p.x + v.x * t, p.y + v.y * t - 0.5 * g * t * t, p.z + v.z * t)
}

export function velocityAt(v: Vec3, g: number, t: number, out: Vec3 = vec()): Vec3 {
  return set(out, v.x, v.y - g * t, v.z)
}

// The launch velocity from p0 whose arc peaks at apexY and comes down through
// `to`, and the flight time. null when the apex is below either end.
export function solveApex(p0: Vec3, to: Vec3, apexY: number, g: number): { v: Vec3; t: number } | null {
  const up = apexY - p0.y
  const down = apexY - to.y
  if (!(g > 0) || up < 0 || down < 0) return null
  const vy = Math.sqrt(2 * g * up)
  const t = vy / g + Math.sqrt((2 * down) / g)
  if (!(t > 0)) return null
  return { v: vec((to.x - p0.x) / t, vy, (to.z - p0.z) / t), t }
}

// The launch velocity from p0 that reaches `to` exactly `t` seconds later.
export function solveTime(p0: Vec3, to: Vec3, t: number, g: number): Vec3 {
  return vec((to.x - p0.x) / t, (to.y - p0.y + 0.5 * g * t * t) / t, (to.z - p0.z) / t)
}

// ---------------------------------------------------------------------------
// Make or miss

export type Outcome = 'swish' | 'rimIn' | 'rimOut'
export interface Odds {
  swish: number
  rimIn: number
  rimOut: number
}
export interface ShotHistory {
  shots: number // attempts so far
  lastMissed: boolean
}

export const isMake = (o: Outcome): boolean => o !== 'rimOut'

// rand in [0, 1). The first shot always swishes (the first impression is a
// make) and he never misses twice in a row (a second miss rolls in off the
// rim instead); otherwise the odds decide.
export function pickOutcome(rand: number, history: ShotHistory, odds: Odds): Outcome {
  if (history.shots === 0) return 'swish'
  const total = odds.swish + odds.rimIn + odds.rimOut
  const r = Math.min(Math.max(rand, 0), 1 - 1e-9) * total
  if (r < odds.swish) return 'swish'
  if (r < odds.swish + odds.rimIn) return 'rimIn'
  return history.lastMissed ? 'rimIn' : 'rimOut'
}

// ---------------------------------------------------------------------------
// The shot's path

export interface HoopGeom {
  rim: Vec3 // rim centre
  rimRadius: number
  tube: number // the rim's tube radius
  netDepth: number
}

export interface ShotOptions {
  g: number
  ballRadius: number
  apexAboveRim: number // the arc peaks this far above the rim...
  ceilingY: number
  apexBelowCeil: number // ...and never closer than this to the ceiling
  contactAngle: number // a rim hit: the contact normal's tilt from straight up, radians
  rimInHop: number // rim-in: the pop off the rim peaks this far above the contact
  // rim-out: bounce speed away from the hoop and up; seconds before physics takes over; and the
  // bounce's horizontal direction (default: straight back toward the shooter; never back over the rim)
  rimOut: { out: number; up: number; clear: number; dir?: Vec3 }
  net: { k: number; keep: number; maxOff: number } // in the net: horizontal relax rate, share of the drop speed kept, max offset from the rim's axis
  exitSpeed: number // horizontal speed the ball drops out of the net with...
  exitToward: Vec3 // ...toward this point (the room's middle), so it rolls back into view
}

export interface FlightSegment {
  kind: 'flight'
  t0: number
  t1: number
  p: Vec3 // position at t0
  v: Vec3 // velocity at t0
}

export interface NetSegment {
  kind: 'net'
  t0: number
  t1: number
  p: Vec3 // entry (the ball centre on the rim plane)
  v: Vec3 // entry velocity
  axis: Vec3 // the rim centre: the net hangs round its vertical axis
  exit: Vec3 // horizontal velocity the ball relaxes toward
  k: number
  keep: number
  maxOff: number
}

export type Segment = FlightSegment | NetSegment

export interface ShotPlan {
  outcome: Outcome
  segments: Segment[]
  apexY: number
  rimAt: number | null // seconds after release the ball hits the rim
  scoreAt: number | null // the ball centre drops through the rim plane inside the rim
  end: number // the physics ball takes over here
}

const horizontalUnit = (from: Vec3, to: Vec3): Vec3 => {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const len = Math.hypot(dx, dz)
  return len > 1e-6 ? vec(dx / len, 0, dz / len) : vec(1, 0, 0)
}

// The ball centre resting on the rim at `side` (-1 = the near rim, +1 = the far
// rim, along u), its contact normal tilted `toward` the rim's centre (+1) or away (-1).
function rimContact(h: HoopGeom, u: Vec3, side: number, toward: number, angle: number, ballRadius: number): Vec3 {
  const s = Math.sin(angle) * toward * -side // horizontal part of the normal, along u
  const c = Math.cos(angle)
  const reach = ballRadius + h.tube
  return vec(h.rim.x + u.x * (side * h.rimRadius + s * reach), h.rim.y + c * reach, h.rim.z + u.z * (side * h.rimRadius + s * reach))
}

function netSegment(t0: number, p: Vec3, v: Vec3, h: HoopGeom, o: ShotOptions): NetSegment {
  const away = horizontalUnit(h.rim, o.exitToward)
  const exit = vec(away.x * o.exitSpeed, 0, away.z * o.exitSpeed)
  const a = v.y * o.net.keep // the net slows the drop
  const bottom = h.rim.y - h.netDepth - o.ballRadius * 0.3
  const drop = bottom - p.y // negative
  const dt = (a + Math.sqrt(a * a - 2 * o.g * drop)) / o.g // y(dt) = bottom
  return { kind: 'net', t0, t1: t0 + dt, p: { ...p }, v: { ...v }, axis: { ...h.rim }, exit, k: o.net.k, keep: o.net.keep, maxOff: o.net.maxOff }
}

// The whole shot from the release point, for a given outcome.
export function planShot(release: Vec3, h: HoopGeom, o: ShotOptions, outcome: Outcome): ShotPlan {
  const u = horizontalUnit(release, h.rim)
  const top = Math.max(release.y, h.rim.y + o.ballRadius + h.tube)
  const apexY = Math.max(top + 0.05, Math.min(h.rim.y + o.apexAboveRim, o.ceilingY - o.apexBelowCeil - o.ballRadius))
  const segments: Segment[] = []
  const flight = (t0: number, p: Vec3, to: Vec3, apex: number) => {
    const s = solveApex(p, to, apex, o.g)
    if (!s) throw new Error('shot: no arc reaches the target')
    segments.push({ kind: 'flight', t0, t1: t0 + s.t, p: { ...p }, v: s.v })
    return { t: t0 + s.t, v: velocityAt(s.v, o.g, s.t) }
  }

  if (outcome === 'swish') {
    const hit = flight(0, release, h.rim, apexY)
    const net = netSegment(hit.t, h.rim, hit.v, h, o)
    segments.push(net)
    return { outcome, segments, apexY, rimAt: null, scoreAt: hit.t, end: net.t1 }
  }

  if (outcome === 'rimIn') {
    // Clips the near rim, pops up and drops in through the middle.
    const c = rimContact(h, u, -1, 1, o.contactAngle, o.ballRadius)
    const hit = flight(0, release, c, apexY)
    const drop = flight(hit.t, c, h.rim, c.y + o.rimInHop)
    const net = netSegment(drop.t, h.rim, drop.v, h, o)
    segments.push(net)
    return { outcome, segments, apexY, rimAt: hit.t, scoreAt: drop.t, end: net.t1 }
  }

  // rimOut: off the front of the near rim and out (back toward him, or along rimOut.dir); physics takes it from there.
  const c = rimContact(h, u, -1, -1, o.contactAngle, o.ballRadius)
  const hit = flight(0, release, c, apexY)
  const back = vec(-u.x, 0, -u.z)
  const dir = o.rimOut.dir ? horizontalUnit(vec(), o.rimOut.dir) : back
  // Only a direction that carries it further from the rim's axis than the contact is: never back over the rim.
  const out = dir.x * (c.x - h.rim.x) + dir.z * (c.z - h.rim.z) > 0 ? dir : back
  const v = vec(out.x * o.rimOut.out, o.rimOut.up, out.z * o.rimOut.out)
  segments.push({ kind: 'flight', t0: hit.t, t1: hit.t + o.rimOut.clear, p: c, v })
  return { outcome, segments, apexY, rimAt: hit.t, scoreAt: null, end: hit.t + o.rimOut.clear }
}

function sampleNet(s: NetSegment, tau: number, g: number, outP: Vec3, outV: Vec3): void {
  const a = s.v.y * s.keep
  const y = s.p.y + a * tau - 0.5 * g * tau * tau
  const vy = a - g * tau
  const e = Math.exp(-s.k * tau)
  const relax = (1 - e) / s.k
  // Offset from the rim's axis: drifts from the entry velocity toward the exit velocity, held inside the net.
  let ox = s.p.x - s.axis.x + s.exit.x * tau + (s.v.x - s.exit.x) * relax
  let oz = s.p.z - s.axis.z + s.exit.z * tau + (s.v.z - s.exit.z) * relax
  const off = Math.hypot(ox, oz)
  if (off > s.maxOff) {
    ox *= s.maxOff / off
    oz *= s.maxOff / off
  }
  set(outP, s.axis.x + ox, y, s.axis.z + oz)
  set(outV, s.exit.x + (s.v.x - s.exit.x) * e, vy, s.exit.z + (s.v.z - s.exit.z) * e)
}

// Where the ball is `t` seconds after release (clamped to the plan's span), and its velocity.
export function sampleShot(plan: ShotPlan, t: number, g: number, outP: Vec3 = vec(), outV: Vec3 = vec()): Vec3 {
  const time = Math.min(Math.max(t, 0), plan.end)
  let seg = plan.segments[plan.segments.length - 1]
  for (const s of plan.segments) {
    if (time < s.t1) {
      seg = s
      break
    }
  }
  const tau = Math.min(time, seg.t1) - seg.t0
  if (seg.kind === 'net') sampleNet(seg, tau, g, outP, outV)
  else {
    pointAt(seg.p, seg.v, g, tau, outP)
    velocityAt(seg.v, g, tau, outV)
  }
  return outP
}

// The facing (yaw about +y, 0 = +z) from `from` toward `to`, clamped to +-max.
export function faceYaw(from: Vec3, to: Vec3, max: number): number {
  const yaw = Math.atan2(to.x - from.x, to.z - from.z)
  return Math.max(-max, Math.min(max, yaw))
}

// Where on a lane he should stand to shoot from within `range` of the hoop:
// the first x from `x0` toward the hoop (in `step`s, never past xMax) whose
// spot is in range; xMax when none is. zOf maps a lane x to its depth.
export function approachX(x0: number, rim: Vec3, range: number, xMax: number, zOf: (x: number) => number, step = 0.05): number {
  const dist = (x: number) => Math.hypot(rim.x - x, rim.z - zOf(x))
  if (dist(x0) <= range) return x0
  const dir = rim.x >= x0 ? 1 : -1
  for (let x = x0; dir > 0 ? x <= xMax : x >= -xMax; x += dir * step) if (dist(x) <= range) return x
  return dir > 0 ? Math.max(x0, xMax) : Math.min(x0, -xMax)
}
