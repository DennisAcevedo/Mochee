import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { driveAt, nextEventTime, parseBallClips, startPos } from '../../src/scene/hoops/moves.ts'
import {
  approachX,
  faceYaw,
  isMake,
  pickOutcome,
  planShot,
  pointAt,
  sampleShot,
  solveApex,
  solveTime,
  vec,
  velocityAt,
  type HoopGeom,
  type Outcome,
  type ShotOptions,
  type Vec3,
} from '../../src/scene/hoops/shot.ts'
import { afterStep, outranks, walkTarget, type AfterState } from '../../src/scene/hoops/staging.ts'

// The Play tab's basketball: the ballistic solve, the make/miss model, the
// shot's path through (or off) the rim, and the ball's ride through the
// play_* clips as the built manifest describes it.

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} (eps ${eps})`)
const nearV = (a: Vec3, b: Vec3, eps = 1e-6) => {
  near(a.x, b.x, eps)
  near(a.y, b.y, eps)
  near(a.z, b.z, eps)
}
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const hdist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z)

// The room as the app has it (src/scene/physics/config.ts + layout3d.ts), pinned here
// because those modules pull in the stores.
const G = 15
const FLOOR_Y = -1.55
const CEIL_Y = FLOOR_Y + 4.9
const HOOP: HoopGeom = { rim: vec(4.08, 2.05, -2.6), rimRadius: 0.45, tube: 0.035, netDepth: 0.36 }
const BALL_R = 0.16
const OPTS: ShotOptions = {
  g: G,
  ballRadius: BALL_R,
  apexAboveRim: 0.85,
  ceilingY: CEIL_Y,
  apexBelowCeil: 0.25,
  contactAngle: 0.55,
  rimInHop: 0.24,
  rimOut: { out: 2.3, up: 2.8, clear: 0.12 },
  net: { k: 10, keep: 0.55, maxOff: 0.12 },
  exitSpeed: 1.2,
  exitToward: vec(0, 0, 1),
}
// Release points: in front of him at the top of his jump, from the middle and from the right of the lane.
const RELEASES = [vec(0.2, 0.45, 1.2), vec(1.9, 0.45, 1.3), vec(1.2, 0.6, 0.4)]

// Every frame of a plan at 120 Hz.
function frames(plan: ReturnType<typeof planShot>) {
  const out: { t: number; p: Vec3; v: Vec3 }[] = []
  for (let t = 0; t <= plan.end + 1e-9; t += 1 / 120) {
    const p = vec()
    const v = vec()
    sampleShot(plan, t, G, p, v)
    out.push({ t, p, v })
  }
  return out
}

describe('ballistic solve', () => {
  it('solveApex peaks at the apex and comes down through the target', () => {
    const p0 = vec(0, 0.45, 1.2)
    const s = solveApex(p0, HOOP.rim, 2.9, G)
    assert.ok(s)
    nearV(pointAt(p0, s.v, G, s.t), HOOP.rim, 1e-9)
    const tTop = s.v.y / G
    near(pointAt(p0, s.v, G, tTop).y, 2.9, 1e-9)
    assert.ok(velocityAt(s.v, G, s.t).y < 0, 'comes down through the target')
  })

  it('solveApex refuses an apex under either end', () => {
    assert.equal(solveApex(vec(0, 1, 0), vec(1, 3, 0), 2.5, G), null)
    assert.equal(solveApex(vec(0, 3, 0), vec(1, 1, 0), 2.5, G), null)
  })

  it('solveTime lands on the target at exactly t', () => {
    const p0 = vec(0.36, 0.46, 0.93)
    const p1 = vec(-0.36, 0.46, 0.93)
    const v = solveTime(p0, p1, 0.4, 9.8)
    nearV(pointAt(p0, v, 9.8, 0.4), p1, 1e-9)
    near(pointAt(p0, v, 9.8, 0.2).y, 0.656, 1e-3) // the authored juggle apex
  })
})

describe('make / miss model', () => {
  const odds = OPTS && { swish: 0.62, rimIn: 0.2, rimOut: 0.18 }

  it('the first shot always swishes', () => {
    for (const r of [0, 0.5, 0.99]) assert.equal(pickOutcome(r, { shots: 0, lastMissed: false }, odds), 'swish')
  })

  it('follows the odds bands', () => {
    const h = { shots: 3, lastMissed: false }
    assert.equal(pickOutcome(0.1, h, odds), 'swish')
    assert.equal(pickOutcome(0.61, h, odds), 'swish')
    assert.equal(pickOutcome(0.7, h, odds), 'rimIn')
    assert.equal(pickOutcome(0.9, h, odds), 'rimOut')
    assert.equal(pickOutcome(1, h, odds), 'rimOut') // clamped into the last band
  })

  it('never misses twice in a row', () => {
    assert.equal(pickOutcome(0.95, { shots: 4, lastMissed: true }, odds), 'rimIn')
  })

  it('mostly makes: over a long run of rolls the make rate sits near the odds', () => {
    // mulberry32: a seeded, decorrelated stream (a stride sequence correlates neighbours and hides misses)
    let seed = 0x9e3779b9
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296
    }
    let makes = 0
    let lastMissed = false
    const n = 4000
    for (let i = 0; i < n; i++) {
      const o = pickOutcome(rand(), { shots: i, lastMissed }, odds)
      lastMissed = !isMake(o)
      if (!lastMissed) makes++
    }
    assert.ok(Math.abs(makes / n - 1 / 1.18) < 0.03, `make rate ${makes / n}`) // no back-to-back misses: 1 / (1 + p(rimOut))
  })
})

describe('shot path', () => {
  for (const release of RELEASES) {
    for (const outcome of ['swish', 'rimIn', 'rimOut'] as Outcome[]) {
      it(`${outcome} from (${release.x}, ${release.z}): continuous, under the ceiling, through or off the rim as promised`, () => {
        const plan = planShot(release, HOOP, OPTS, outcome)
        const fs = frames(plan)
        nearV(fs[0].p, release, 1e-9)
        // No teleports: consecutive frames stay within the fastest speed's reach.
        for (let i = 1; i < fs.length; i++) assert.ok(dist(fs[i].p, fs[i - 1].p) < 0.2, `jump at t=${fs[i].t}`)
        for (const f of fs) assert.ok(f.p.y + BALL_R <= CEIL_Y - OPTS.apexBelowCeil + 1e-6, `above the ceiling at t=${f.t}`)
        // Before the rim is reached the ball never cuts through the rim's tube.
        const firstTouch = plan.rimAt ?? plan.scoreAt ?? plan.end
        for (const f of fs) {
          if (f.t >= firstTouch - 1e-9) break
          const h = hdist(f.p, HOOP.rim)
          const ringDist = Math.hypot(h - HOOP.rimRadius, f.p.y - HOOP.rim.y)
          assert.ok(ringDist >= BALL_R + HOOP.tube - 1e-6, `through the rim tube at t=${f.t} (${ringDist})`)
        }
        if (outcome === 'rimOut') {
          assert.equal(plan.scoreAt, null)
          // Never drops through the rim plane inside the rim.
          for (let i = 1; i < fs.length; i++) {
            const a = fs[i - 1].p
            const b = fs[i].p
            if (a.y >= HOOP.rim.y && b.y < HOOP.rim.y) assert.ok(hdist(b, HOOP.rim) > HOOP.rimRadius, `fell in at t=${fs[i].t}`)
          }
          // Physics takes over heading back away from the hoop.
          const v = vec()
          sampleShot(plan, plan.end, G, vec(), v)
          const u = vec(HOOP.rim.x - release.x, 0, HOOP.rim.z - release.z)
          assert.ok(v.x * u.x + v.z * u.z < 0, 'bounces back out')
        } else {
          assert.ok(plan.scoreAt !== null)
          const p = vec()
          const v = vec()
          sampleShot(plan, plan.scoreAt, G, p, v)
          near(p.y, HOOP.rim.y, 1e-6)
          assert.ok(hdist(p, HOOP.rim) <= HOOP.rimRadius - BALL_R - HOOP.tube, 'clears the rim on the way in')
          assert.ok(v.y < 0, 'drops in, not up through')
          // Out the bottom of the net, inside it all the way down.
          sampleShot(plan, plan.end, G, p, v)
          assert.ok(p.y < HOOP.rim.y - HOOP.netDepth, 'leaves through the net')
          for (const f of fs) if (f.t >= plan.scoreAt) assert.ok(hdist(f.p, HOOP.rim) <= OPTS.net.maxOff + 1e-6, `outside the net at t=${f.t}`)
        }
        if (outcome !== 'swish') {
          // The rim hit really touches the rim: centre at ball + tube radius from the ring.
          const p = sampleShot(plan, plan.rimAt as number, G)
          const ringDist = Math.hypot(hdist(p, HOOP.rim) - HOOP.rimRadius, p.y - HOOP.rim.y)
          near(ringDist, BALL_R + HOOP.tube, 1e-6)
        }
      })
    }
  }

  it('the arc peaks above the rim but under the ceiling', () => {
    const plan = planShot(RELEASES[0], HOOP, OPTS, 'swish')
    assert.ok(plan.apexY > HOOP.rim.y + BALL_R && plan.apexY + BALL_R <= CEIL_Y - OPTS.apexBelowCeil + 1e-9)
  })

  // The app's rim-out bounces sideways toward the room's middle (src/scene/hoops/config.ts).
  const SIDEWAYS: ShotOptions = { ...OPTS, rimOut: { ...OPTS.rimOut, dir: vec(-1, 0, 0.25) } }
  const handoff = (plan: ReturnType<typeof planShot>) => {
    const p = vec()
    const v = vec()
    sampleShot(plan, plan.end, G, p, v)
    return { p, v }
  }

  for (const release of RELEASES) {
    it(`rimOut along rimOut.dir from (${release.x}, ${release.z}): bounces that way, out and away from the rim`, () => {
      const plan = planShot(release, HOOP, SIDEWAYS, 'rimOut')
      const fs = frames(plan)
      for (let i = 1; i < fs.length; i++) assert.ok(dist(fs[i].p, fs[i - 1].p) < 0.2, `jump at t=${fs[i].t}`)
      for (let i = 1; i < fs.length; i++) {
        const a = fs[i - 1].p
        const b = fs[i].p
        if (a.y >= HOOP.rim.y && b.y < HOOP.rim.y) assert.ok(hdist(b, HOOP.rim) > HOOP.rimRadius, `fell in at t=${fs[i].t}`)
      }
      const { p, v } = handoff(plan)
      const d = Math.hypot(-1, 0.25)
      near(v.x / Math.hypot(v.x, v.z), -1 / d, 1e-9)
      near(v.z / Math.hypot(v.x, v.z), 0.25 / d, 1e-9)
      near(Math.hypot(v.x, v.z), OPTS.rimOut.out, 1e-9)
      // Physics takes over further from the rim's axis than the contact, still heading out.
      const c = sampleShot(plan, plan.rimAt as number, G)
      assert.ok(hdist(p, HOOP.rim) > hdist(c, HOOP.rim), 'moved out from the rim')
      assert.ok(v.x * (p.x - HOOP.rim.x) + v.z * (p.z - HOOP.rim.z) > 0, 'heading away from the rim axis')
    })
  }

  it('rimOut ignores a rimOut.dir that would carry it back over the rim, and bounces straight back', () => {
    const release = RELEASES[1]
    const inward: ShotOptions = { ...OPTS, rimOut: { ...OPTS.rimOut, dir: vec(1, 0, -0.25) } } // toward the rim's far side
    const { v } = handoff(planShot(release, HOOP, inward, 'rimOut'))
    const { v: back } = handoff(planShot(release, HOOP, OPTS, 'rimOut'))
    nearV(v, back, 1e-9)
  })
})

describe('facing and approach', () => {
  it('faces the hoop, clamped so his face still shows', () => {
    near(faceYaw(vec(0, 0, 0), vec(1, 0, 0), 2), Math.PI / 2)
    near(faceYaw(vec(0, 0, 0), vec(4.08, 0, -2.6), 1.75), 1.75)
    near(faceYaw(vec(0, 0, 0), vec(-1, 0, 1), 2), -Math.PI / 4)
  })

  it('steps toward the hoop only as far as needed, never past the lane max', () => {
    const zOf = (x: number) => (x >= 1.05 ? 1 : 0.6 + (0.4 * Math.max(0, x)) / 1.05)
    const x = approachX(0, HOOP.rim, 4.1, 2.1, zOf)
    assert.ok(x > 0 && x <= 2.1)
    assert.ok(Math.hypot(HOOP.rim.x - x, HOOP.rim.z - zOf(x)) <= 4.1 || x === 2.1)
    assert.equal(approachX(3, HOOP.rim, 4.1, 2.1, zOf), 3) // already in range: stays
    assert.equal(approachX(0, HOOP.rim, 1, 2.1, zOf), 2.1) // out of reach: as close as allowed
  })
})

describe('staging: where a move starts, and the beat after it', () => {
  const SPOTS = { left: { x: -0.2, z: 1.0 }, center: { x: 0, z: 0.6 }, right: { x: 1.05, z: 1.0 } }

  it('starts from where his walk is taking him: aside > roaming > the lesson spot', () => {
    // The lesson crossing from center to right when the move is asked: the right spot, not where he is.
    assert.deepEqual(walkTarget({ spot: 'right', roamX: null, asideX: null }, SPOTS), { x: 1.05, z: 1.0 })
    const roam = walkTarget({ spot: 'right', roamX: 0.5, asideX: null }, SPOTS)
    near(roam.x, 0.5)
    near(roam.z, 0.6 + (0.4 * 0.5) / 1.05) // on the lane between center and right
    assert.deepEqual(walkTarget({ spot: 'right', roamX: 0.5, asideX: -2 }, SPOTS), { x: -2, z: 1.0 }) // past the lane's end: flat
  })

  it('a level-up keeps a move clip from showing; equal ranks and the clip itself do not', () => {
    for (const clip of ['play_shoot', 'play_kick', 'play_dunk'] as const) assert.ok(outranks('levelup', clip), clip)
    assert.ok(outranks('levelup', 'play_dribble', 'loop'))
    assert.ok(outranks('hop', 'play_juggle', 'loop')) // any reaction plays over a ball loop
    assert.ok(!outranks('play_shoot', 'play_shoot'))
    assert.ok(!outranks('celebrate', 'play_shoot')) // same rank: the newer request plays
    assert.ok(!outranks('shrug', 'play_kick'))
    assert.ok(!outranks(null, 'play_dunk'))
  })

  const T = { react: 3, after: 6 }
  const base: AfterState = {
    react: 'celebrate',
    moveClip: 'play_shoot',
    asked: false,
    seen: false,
    dropped: false,
    oneShot: null,
    queued: null,
    still: true,
    t: 0,
  }
  const step = (o: Partial<AfterState>) => afterStep({ ...base, ...o }, T)

  it('asks for the reaction first, even while the move clip is still fading out', () => {
    assert.equal(step({}), 'ask')
    assert.equal(step({ oneShot: 'play_shoot' }), 'ask')
    assert.equal(step({ react: 'shrug', oneShot: 'play_shoot' }), 'ask') // the move's own clip never cancels a lower reaction
    assert.equal(step({ react: 'hop', still: false }), 'ask') // a reaction asked mid-turn waits in the queue for him
  })

  it('a one-shot that outranks the reaction (a purchase\'s equip) stands in for it', () => {
    for (const react of ['celebrate', 'shrug', 'hop'] as const) {
      assert.equal(step({ react, oneShot: 'equip' }), 'skip')
      assert.equal(step({ react, queued: 'equip' }), 'skip')
    }
    // Skipped for one that is playing: wait for it to play out.
    assert.equal(step({ react: null, oneShot: 'equip', t: 0.5 }), 'wait')
  })

  it('holds the stage until the reaction has started and played out', () => {
    const asked = { asked: true, t: 0.2 }
    assert.equal(step({ ...asked, still: false }), 'wait') // turning back to the camera
    assert.equal(step({ ...asked, queued: 'celebrate' }), 'wait') // queued behind the turn
    assert.equal(step({ ...asked }), 'wait') // asked this frame: not seen yet
    assert.equal(step({ ...asked, seen: true, oneShot: 'celebrate', t: 1 }), 'wait')
    assert.equal(step({ ...asked, seen: true, t: 2.4 }), 'finish')
  })

  it('a level-up that cuts into the reaction plays out too', () => {
    assert.equal(step({ asked: true, seen: true, oneShot: 'levelup', t: 2 }), 'wait')
    assert.equal(step({ asked: true, seen: false, queued: 'levelup', t: 3.5 }), 'wait')
    assert.equal(step({ react: null, oneShot: 'levelup', t: 1 }), 'wait') // skipped for it
    assert.equal(step({ react: null, t: 3 }), 'finish')
  })

  it('gives up waiting: a dropped reaction, one that never starts, and a hard cap', () => {
    assert.equal(step({ asked: true, dropped: true, t: 0.1 }), 'finish')
    assert.equal(step({ asked: true, t: 3.01 }), 'finish')
    assert.equal(step({ asked: true, seen: true, oneShot: 'levelup', t: 6.01 }), 'finish')
    assert.equal(step({ react: null, still: false, t: 6.01 }), 'finish')
  })

  it('no reaction: hands back as soon as he stands still', () => {
    assert.equal(step({ react: null, still: false }), 'wait')
    assert.equal(step({ react: null, oneShot: 'play_shoot' }), 'wait')
    assert.equal(step({ react: null }), 'finish')
  })
})

describe('ball clips from the built manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../public/models/tutor.manifest.json', import.meta.url), 'utf8'))
  const clips = parseBallClips(manifest)
  const g = 9.8

  it('has a ball block for every ball move', () => {
    for (const name of ['play_shoot', 'play_dribble', 'play_dunk', 'play_kick', 'play_juggle', 'play_catch_throw']) assert.ok(clips[name], name)
    assert.equal(clips.play_jumprope, undefined) // the rope has no ball
  })

  it('shoot: waits at the gather point, rides the right hand, then flies free at the release', () => {
    const c = clips.play_shoot
    assert.deepEqual(c.follow, { node: 'handR', offset: vec(0.31, 0.03, 0) })
    const d0 = driveAt(c, 0.05, g)
    assert.equal(d0.mode, 'hold')
    nearV((d0 as { pos: Vec3 }).pos, vec(0, 0.7, 1.08))
    assert.equal(driveAt(c, 0.3, g).mode, 'follow')
    const free = driveAt(c, 0.5, g)
    assert.equal(free.mode, 'free')
    nearV((free as { event: { pos: Vec3 } }).event.pos, vec(0, 2.5, 1.04))
    nearV(startPos(c, g) as Vec3, vec(0, 0.7, 1.08))
  })

  it('dribble: in the left hand, pushed down to the floor at the bounce, back up into the hand at the catch', () => {
    const c = clips.play_dribble
    assert.ok(c.loop)
    assert.equal(driveAt(c, 0.05, g).mode, 'follow')
    const bounce = driveAt(c, 0.2 - 1e-4, g) as { mode: string; pos: Vec3; vel: Vec3 }
    assert.equal(bounce.mode, 'path')
    near(bounce.pos.y, 0.2, 1e-3) // ball radius: resting on the floor
    assert.ok(bounce.vel.y < 0)
    const up = driveAt(c, 0.4 - 1e-4, g) as { mode: string; pos: Vec3 }
    assert.equal(up.mode, 'path')
    nearV(up.pos, vec(1.18, 0.74, 0.42), 1e-3)
    assert.equal(driveAt(c, 0.85, g).mode, 'follow') // the next cycle starts in the hand again
    near(nextEventTime(c, 'push', 2.0) as number, 2.1, 1e-9)
  })

  it('juggle: a closed loop of arcs from foot to foot through the authored apex', () => {
    const c = clips.play_juggle
    assert.equal(c.follow, null)
    for (const [t, want] of [
      [0, vec(0.36, 0.46, 0.93)],
      [0.2, vec(0, 0.656, 0.93)],
      [0.4, vec(-0.36, 0.46, 0.93)],
      [0.6, vec(0, 0.656, 0.93)],
      [0.8 - 1e-4, vec(0.36, 0.46, 0.93)],
    ] as [number, Vec3][]) {
      const d = driveAt(c, t, g) as { mode: string; pos: Vec3 }
      assert.equal(d.mode, 'path')
      nearV(d.pos, want, 1e-3)
    }
  })

  it('kick: waits on its spot, then flies free at the contact along the authored launch', () => {
    const c = clips.play_kick
    const d = driveAt(c, 0.2, g) as { mode: string; pos: Vec3 }
    assert.equal(d.mode, 'hold')
    nearV(d.pos, vec(0.3, 0.2, 0.72))
    assert.equal(driveAt(c, 0.36, g).mode, 'free')
    near(Math.hypot(c.launch!.x, c.launch!.y, c.launch!.z), 1, 1e-3)
  })

  it('dunk: rides the left hand to the slam release', () => {
    const c = clips.play_dunk
    assert.equal(c.follow?.node, 'handL')
    assert.equal(driveAt(c, 0.5, g).mode, 'follow')
    assert.equal(driveAt(c, 0.8, g).mode, 'free')
  })

  it('skips malformed entries', () => {
    assert.deepEqual(parseBallClips(null), {})
    assert.deepEqual(parseBallClips({ clips: [{ name: 'x', duration: 1, ball: { events: 'no' } }, { name: 'y' }] }), {})
  })
})
