import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { laneZ } from '../../src/lesson/roam.ts'
import { fetchStop, segmentDistance, type FetchOpts } from '../../src/scene/hoops/staging.ts'

// Where he stops to take the ball (src/scene/hoops/staging.ts fetchStop). In Play
// his body is a kinematic capsule that shoves what it walks into, so the walk to
// the ball must keep his radius + the ball's + a margin from its centre the whole
// way, or he pushes it off and chases it round the room.

// The app's numbers, pinned (those modules pull in the stores): SPOTS (layout3d.ts),
// his capsule radius 0.8 * 0.8, the ball's 0.2 * 0.8, HOOPS.fetch's standOff / slack /
// margin / step, the landing range PHYSICS.tutor.landing.xMax 3.4, the ball's spawn.
const SPOTS = { left: { x: -0.2, z: 1.0 }, center: { x: 0, z: 0.6 }, right: { x: 1.05, z: 1.0 } }
const lane = (x: number) => laneZ(x, SPOTS)
const CLEAR = 0.64 + 0.16 + 0.08
const OPTS: FetchOpts = { standOff: 0.35, slack: 0.15, clear: CLEAR, step: 0.02, xMin: -3.4, xMax: 3.4 }
const SPAWN = { x: 1.75, z: 1.3 }

const at = (x: number) => ({ x, z: lane(x) })
// The walk from `from` to the stop keeps `gap` from the ball (straight, as motion.ts walks).
const walkGap = (from: { x: number; z: number }, x: number, ball: { x: number; z: number }) => segmentDistance(from, at(x), ball)

describe('fetch: he stops where his body clears the ball', () => {
  it('the ball at its spawn, from the lesson spot: stops clear of it, not 0.35 short (the shove)', () => {
    const from = at(SPOTS.left.x)
    const x = fetchStop(from, from, SPAWN, OPTS, lane)
    assert.ok(x !== null)
    assert.ok(walkGap(from, x, SPAWN) >= CLEAR - 1e-9, `gap ${walkGap(from, x, SPAWN)}`)
    assert.ok(x < SPAWN.x - OPTS.standOff, 'further out than the bare stand-off')
    assert.ok(x > SPAWN.x - CLEAR - 0.05, `but no further than it needs (${x})`)
  })

  it('a ball on the lane itself: he stops a full clearance short, on his side', () => {
    for (const bx of [1.5, -1.6]) {
      const ball = at(bx)
      const from = at(bx > 0 ? -0.2 : 1.05)
      const x = fetchStop(from, from, ball, OPTS, lane)
      assert.ok(x !== null)
      assert.ok(Math.sign(bx - x) === Math.sign(bx - from.x), 'on his side of it')
      assert.ok(walkGap(from, x, ball) >= CLEAR - 1e-9)
      assert.ok(Math.abs(bx - x) < CLEAR + OPTS.step + 1e-9, `no further than a step past the clearance (${x})`)
    }
  })

  it('a ball far behind the lane: the bare stand-off, the clearance is free', () => {
    const ball = { x: 2.2, z: -2.0 }
    const from = at(-0.2)
    const x = fetchStop(from, from, ball, OPTS, lane)
    assert.ok(x !== null)
    assert.ok(Math.abs(x - (ball.x - OPTS.standOff)) < 1e-9, `${x}`)
  })

  it('already close and clear of it: no walk', () => {
    const from = at(0.9)
    assert.equal(fetchStop(from, from, SPAWN, OPTS, lane), null)
    // Behind the lane within reach along x: no walk either.
    assert.equal(fetchStop(at(1.9), at(1.9), { x: 2.0, z: -2.5 }, OPTS, lane), null)
  })

  it('the walk he is on would end on the ball (a lesson spot it lies at): he stops short instead', () => {
    const ball = at(SPOTS.right.x)
    const from = at(SPOTS.left.x)
    const x = fetchStop(from, at(SPOTS.right.x), ball, OPTS, lane)
    assert.ok(x !== null)
    assert.ok(walkGap(from, x, ball) >= CLEAR - 1e-9)
  })

  it('standing nearer than the clearance already (the ball against him): the walk never takes him closer', () => {
    const from = at(1.0)
    const ball = { x: 1.3, z: from.z + 0.35 } // about 0.46 from his centre line
    const start = Math.hypot(ball.x - from.x, ball.z - from.z)
    const x = fetchStop(from, from, ball, OPTS, lane)
    if (x !== null) assert.ok(walkGap(from, x, ball) >= start - 1e-6)
  })

  it('a ball against the right wall, past the landing range: stops inside it, clear', () => {
    const ball = { x: 3.6, z: 1.74 } // where the old walk shoved it to
    const from = at(-0.2)
    const x = fetchStop(from, from, ball, OPTS, lane)
    assert.ok(x !== null)
    assert.ok(x <= OPTS.xMax)
    assert.ok(walkGap(from, x, ball) >= CLEAR - 1e-9)
  })

  it('segment distance: ends and the middle', () => {
    const a = { x: 0, z: 0 }
    const b = { x: 2, z: 0 }
    assert.equal(segmentDistance(a, b, { x: 1, z: 1 }), 1)
    assert.equal(segmentDistance(a, b, { x: -1, z: 0 }), 1)
    assert.equal(segmentDistance(a, b, { x: 3, z: 0 }), 1)
    assert.equal(segmentDistance(a, a, { x: 0, z: 2 }), 2)
  })
})
