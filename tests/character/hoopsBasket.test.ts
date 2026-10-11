import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { armWatch, disarmWatch, newWatch, segmentHitsBox, stepWatch, type BasketGeom, type BasketTuning, type BasketWatch } from '../../src/scene/hoops/basket.ts'
import { isMake, planShot, sampleShot, vec, type HoopGeom, type Outcome, type ShotOptions, type Vec3 } from '../../src/scene/hoops/shot.ts'

// The student's own baskets (src/scene/hoops/basket.ts): through the rim from
// above is a make, from below is not, a rim bounce that pops out is an attempt
// (a miss), and a throw that never reaches the hoop is no attempt at all.

// The hoop and ball as the app has them (src/scene/physics/config.ts + layout3d.ts), pinned
// here because those modules pull in the stores: rim [4.08, 2.05, -2.6], radius 0.45, the rim
// collider's tube 0.035 * 1.4, ball 0.2 * 0.8, the board 0.06 thick, 0.85 tall, 1.25 wide,
// 0.32 above the rim, against the right wall (x 4.7).
const G = 15
const DT = 1 / 60
const RIM = vec(4.08, 2.05, -2.6)
const BALL_R = 0.16
const GEOM: BasketGeom = {
  rim: RIM,
  rimRadius: 0.45,
  rimTube: 0.035 * 1.4,
  ballRadius: BALL_R,
  board: { center: vec(4.7 - 0.03, 2.05 + 0.32, -2.6), half: vec(0.03, 0.425, 0.625) },
}
// HOOPS.basket in src/scene/hoops/config.ts.
const TUNE: BasketTuning = { touch: 0.02, over: 0.45, leave: 0.12, rattle: 3, rest: { speed: 0.3, seconds: 0.5 }, maxSeconds: 6 }
const FLOOR = -1.55 + BALL_R

// Free flight under gravity, no collisions, stopping dead on the floor; the watch is stepped
// after every 60 Hz step like the hoop's after-physics hook. Returns every outcome it called.
function fly(w: BasketWatch, p0: Vec3, v0: Vec3, seconds = 4): Outcome[] {
  const out: Outcome[] = []
  const p = { ...p0 }
  const v = { ...v0 }
  for (let t = 0; t < seconds; t += DT) {
    v.y -= G * DT
    p.x += v.x * DT
    p.y += v.y * DT
    p.z += v.z * DT
    if (p.y < FLOOR) {
      p.y = FLOOR
      v.x = v.y = v.z = 0
    }
    const o = stepWatch(w, p, Math.hypot(v.x, v.y, v.z), DT, GEOM, TUNE)
    if (o) out.push(o)
  }
  return out
}

// A path given as positions (a planned jump shot): the watch sees each one in turn.
function follow(w: BasketWatch, path: Vec3[]): Outcome[] {
  const out: Outcome[] = []
  for (let i = 1; i < path.length; i++) {
    const speed = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y, path[i].z - path[i - 1].z) / DT
    const o = stepWatch(w, path[i], speed, DT, GEOM, TUNE)
    if (o) out.push(o)
  }
  return out
}

const armed = (p: Vec3) => {
  const w = newWatch()
  armWatch(w, p)
  return w
}

// shot.ts's planned shots, for paths that really come in over (and off) the rim.
const HOOP: HoopGeom = { rim: RIM, rimRadius: 0.45, tube: 0.035, netDepth: 0.36 }
const OPTS: ShotOptions = {
  g: G,
  ballRadius: BALL_R,
  apexAboveRim: 0.7,
  ceilingY: -1.55 + 4.9,
  apexBelowCeil: 0.25,
  contactAngle: 0.55,
  rimInHop: 0.24,
  rimOut: { out: 2.6, up: 2.0, clear: 0.12, dir: vec(-1, 0, 0.25) },
  net: { k: 10, keep: 0.55, maxOff: 0.12 },
  exitSpeed: 1.2,
  exitToward: vec(0, 0, 1),
}
const RELEASES = [vec(0.2, 0.45, 1.2), vec(1.9, 0.45, 1.3), vec(1.2, 0.6, 0.4)]
function planned(release: Vec3, outcome: Outcome): Vec3[] {
  const plan = planShot(release, HOOP, OPTS, outcome)
  const path: Vec3[] = []
  for (let t = 0; t <= plan.end + 1e-9; t += DT) path.push(sampleShot(plan, t, G))
  // Physics takes over at the end: let it fall freely for a while.
  const p = vec()
  const v = vec()
  sampleShot(plan, plan.end, G, p, v)
  for (let t = DT; t < 2; t += DT) path.push(vec(p.x + v.x * t, p.y + v.y * t - 0.5 * G * t * t, p.z + v.z * t))
  return path
}

describe('student baskets: makes', () => {
  it('a ball dropped over the opening falls through: a swish, once', () => {
    for (const off of [vec(0, 0.6, 0), vec(0.1, 0.3, -0.08), vec(-0.05, 1.2, 0.05)]) {
      const w = armed(vec(RIM.x + off.x, RIM.y + off.y, RIM.z + off.z))
      assert.deepEqual(fly(w, w.prev, vec()), ['swish'])
      assert.equal(w.armed, false, 'one result per throw')
    }
  })

  it('a planned shot that drops in counts as a make; one off the rim first is a rim-in', () => {
    for (const r of RELEASES) {
      const swish = follow(armed(r), planned(r, 'swish'))
      assert.equal(swish.length, 1, `swish from ${r.x}`)
      assert.ok(isMake(swish[0]), `swish from ${r.x}: ${swish[0]}`)
      assert.deepEqual(follow(armed(r), planned(r, 'rimIn')), ['rimIn'], `rimIn from ${r.x}`)
    }
  })

  it('a lob from the floor that comes down through the rim is a make', () => {
    // Launched at the rim's centre so the arc peaks 0.8 above it and drops straight-ish in.
    const p0 = vec(2.6, -1.0, -1.2)
    const apex = RIM.y + 0.8
    const vy = Math.sqrt(2 * G * (apex - p0.y))
    const t = vy / G + Math.sqrt((2 * (apex - RIM.y)) / G)
    const out = fly(armed(p0), p0, vec((RIM.x - p0.x) / t, vy, (RIM.z - p0.z) / t))
    assert.equal(out.length, 1)
    assert.ok(isMake(out[0]), out[0])
  })
})

describe('student baskets: not makes', () => {
  it('up through the opening from below and back down: no make, and no attempt', () => {
    const p0 = vec(RIM.x, RIM.y - 1, RIM.z)
    const w = armed(p0)
    assert.deepEqual(fly(w, p0, vec(0, 6, 0), 6.5), []) // peaks 0.2 over the rim, falls back through
    assert.equal(w.armed, false, 'dropped once it was over')
  })

  it('cutting down through the backboard into the rim is not a make', () => {
    // A tunnelling step from inside the board: crosses the rim plane inside the rim.
    const w = armed(vec(4.66, 2.2, -2.6))
    assert.equal(stepWatch(w, vec(4.4, 1.95, -2.6), 8, DT, GEOM, TUNE), null)
    // The same drop from in front of the board is a make (off the rim).
    const ok = armed(vec(4.4, 2.2, -2.6))
    assert.ok(isMake(stepWatch(ok, vec(4.3, 1.95, -2.6), 8, DT, GEOM, TUNE) ?? 'rimOut'))
  })

  it('a bank shot that touches the board and drops in still counts', () => {
    // Touching the board's face, then down through the rim near its back edge.
    const w = armed(vec(4.48 - 0.005, 2.25, -2.6))
    assert.equal(stepWatch(w, vec(4.42, 2.12, -2.6), 6, DT, GEOM, TUNE), null)
    assert.ok(w.reached)
    assert.ok(isMake(stepWatch(w, vec(4.36, 2.0, -2.6), 6, DT, GEOM, TUNE) ?? 'rimOut'))
  })
})

describe('student baskets: attempts and non-attempts', () => {
  it('a rim bounce that pops back out is an attempt: one miss', () => {
    for (const r of RELEASES) assert.deepEqual(follow(armed(r), planned(r, 'rimOut')), ['rimOut'], `from ${r.x}`)
  })

  it('a ball that sails just over the opening and away is an attempt', () => {
    // Across the opening parallel to the board, about 0.3 over the rim, and out the other side.
    const p0 = vec(RIM.x, RIM.y + 0.3, RIM.z + 1.2)
    assert.deepEqual(fly(armed(p0), p0, vec(0, 2, -7)), ['rimOut'])
  })

  it('a throw that falls short never reaches the hoop: no attempt', () => {
    const p0 = vec(0, -1, 1)
    const w = armed(p0)
    assert.deepEqual(fly(w, p0, vec(2.5, 6, -1.5)), [])
    assert.equal(w.armed, false, 'over once it came to rest')
  })

  it('an airball that goes past the side of the hoop is no attempt', () => {
    const p0 = vec(1, 0, -2.6 + 1.5)
    assert.deepEqual(fly(armed(p0), p0, vec(2.5, 7.5, 0)), [])
  })

  it('a ball left sitting on the rim is called a miss after the rattle time, and flagged stuck', () => {
    const p = vec(RIM.x + 0.45, RIM.y + 0.19, RIM.z) // on the far side of the rim
    const w = armed(p)
    let out: Outcome | null = null
    let t = 0
    for (; t < 4 && !out; t += DT) out = stepWatch(w, p, 0, DT, GEOM, TUNE)
    assert.equal(out, 'rimOut')
    assert.ok(w.stuck)
    assert.ok(t > TUNE.rattle && t < TUNE.rattle + 0.1)
  })

  it('disarmed (grabbed again, or a move took the ball): nothing counts', () => {
    const p0 = vec(RIM.x, RIM.y + 0.6, RIM.z)
    const w = armed(p0)
    disarmWatch(w)
    assert.deepEqual(fly(w, p0, vec()), [])
    assert.deepEqual(fly(newWatch(), p0, vec()), [])
  })

  it('a watch armed when the visit ended is disarmed (Toys unmount / mount): the jump to the spawn never counts', () => {
    const SPAWN = vec(1.75, FLOOR, 1.3) // PHYSICS.ball.spawn
    const overOpening = vec(RIM.x, RIM.y + 0.3, RIM.z)
    // The leak: still armed 0.3 over the opening, the next visit's first step sees the ball back
    // at the spawn, and that jump crosses the rim plane inside the rim.
    assert.ok(isMake(stepWatch(armed(overOpening), SPAWN, 0, DT, GEOM, TUNE) ?? 'rimOut'), 'what a leaked watch scores')
    const onRim = armed(vec(RIM.x - 0.45, RIM.y + 0.19, RIM.z))
    assert.equal(stepWatch(onRim, onRim.prev, 0, DT, GEOM, TUNE), null)
    assert.equal(stepWatch(onRim, SPAWN, 0, DT, GEOM, TUNE), 'rimOut', 'and a rim touch left armed calls a miss')
    // Disarmed when the toys went away: the same steps count nothing...
    for (const from of [overOpening, vec(RIM.x - 0.45, RIM.y + 0.19, RIM.z)]) {
      const w = armed(from)
      stepWatch(w, from, 0, DT, GEOM, TUNE)
      disarmWatch(w)
      assert.equal(stepWatch(w, SPAWN, 0, DT, GEOM, TUNE), null)
      // ...and the next throw, armed far from the hoop, starts from there: a ball at rest is no attempt.
      armWatch(w, SPAWN)
      const out: Outcome[] = []
      for (let t = 0; t < 1.5; t += DT) {
        const o = stepWatch(w, SPAWN, 0, DT, GEOM, TUNE)
        if (o) out.push(o)
      }
      assert.deepEqual(out, [])
      assert.equal(w.reached, false)
      assert.equal(w.armed, false, 'over once it sat still')
    }
  })
})

describe('segment vs box', () => {
  const box = { center: vec(0, 0, 0), half: vec(1, 1, 1) }
  it('hits through, misses beside, grows with the margin', () => {
    assert.ok(segmentHitsBox(vec(-2, 0, 0), vec(2, 0, 0), box, 0))
    assert.ok(!segmentHitsBox(vec(-2, 1.5, 0), vec(2, 1.5, 0), box, 0))
    assert.ok(segmentHitsBox(vec(-2, 1.5, 0), vec(2, 1.5, 0), box, 0.6))
    assert.ok(!segmentHitsBox(vec(-3, 0, 0), vec(-2, 0, 0), box, 0)) // ends short of it
    assert.ok(segmentHitsBox(vec(0.5, 0.5, 0.5), vec(0.6, 0.6, 0.6), box, 0)) // inside
  })
})
