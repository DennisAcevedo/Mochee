import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ANIM_STATES, CELEBRATIONS, CLIP_FALLBACK, fallbackOf } from '../../src/character/blender/config.ts'
import { asideSpot, initialRoam, laneZ, openCelebrations, pickNoRepeat, ROAM, roamStep, roamTarget, type RoamAction, type RoamState } from '../../src/lesson/roam.ts'
import { ONESHOT_CLIPS, type Clip } from '../../src/state/director.ts'
import { canCelebrate, SHOP, type UnlockId } from '../../src/state/progress.ts'

// Seeded uniform rng (mulberry32), so every property check is reproducible.
function rngOf(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A symmetric test lane (the stage's runs SPOTS.left.x .. SPOTS.right.x in src/scene/layout3d.ts).
const LANE = { laneMin: -1.05, laneMax: 1.05 }
const SPOTS = { left: { x: -1.05, z: 1.0 }, center: { x: 0, z: 0.6 }, right: { x: 1.05, z: 1.0 } }

const free = (now: number, over: Partial<RoamState> = {}): RoamState => ({ ...initialRoam(now), ...LANE, enabled: true, ...over })

// Runs the scheduler from `t0` to `t1` in ROAM.tickMs steps. He arrives at a
// walk target at once (moving stays false), so only the gaps are measured.
function run(t0: number, t1: number, s: RoamState, rng: () => number, world: (t: number, s: RoamState) => Partial<RoamState> = () => ({})) {
  const log: { t: number; action: RoamAction }[] = []
  for (let t = t0; t <= t1 + 1e-9; t += ROAM.tickMs / 1000) {
    const out = roamStep(t, { ...s, ...world(t, s) }, rng)
    s = out.state
    if (out.action.kind === 'walk') s = { ...s, x: out.action.x }
    if (out.action.kind !== 'none') log.push({ t, action: out.action })
  }
  return { s, log }
}

describe('pickNoRepeat', () => {
  it('never picks the same entry twice in a row and reaches every entry', () => {
    const rng = rngOf(7)
    let last: (typeof CELEBRATIONS)[number] | null = null
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const c: (typeof CELEBRATIONS)[number] = pickNoRepeat(CELEBRATIONS, last, rng)
      assert.notEqual(c, last, `repeat at draw ${i}`)
      seen.add(c)
      last = c
    }
    assert.deepEqual([...seen].sort(), [...CELEBRATIONS].sort())
  })

  it('a one-entry list returns that entry, and an rng of 0.9999 stays in range', () => {
    assert.equal(pickNoRepeat(['hop'], 'hop', () => 0.5), 'hop')
    assert.equal(pickNoRepeat(['a', 'b'], 'a', () => 0.99999), 'b')
    assert.equal(pickNoRepeat(['a', 'b', 'c'], null, () => 0.99999), 'c')
  })
})

describe('CELEBRATIONS', () => {
  it('lists celebrate, the eight dances and hop', () => {
    assert.deepEqual([...CELEBRATIONS], [
      'celebrate', 'dance_bounce', 'dance_spin', 'dance_robot',
      'dance_shuffle', 'dance_wave', 'dance_floss', 'dance_disco', 'dance_twist', 'hop',
    ])
  })

  it('every celebration is a director one-shot, listed once', () => {
    for (const c of CELEBRATIONS) assert.ok(ONESHOT_CLIPS.includes(c), c)
    assert.equal(new Set(ONESHOT_CLIPS).size, ONESHOT_CLIPS.length)
  })

  it('the dance state plays exactly the dance_* celebrations, in order', () => {
    assert.deepEqual([...ANIM_STATES.dance.clips], [
      'dance_bounce', 'dance_spin', 'dance_robot', 'dance_shuffle', 'dance_wave', 'dance_floss', 'dance_disco', 'dance_twist',
    ])
  })

  it('a dance the GLB lacks degrades to dance_bounce, then down CLIP_FALLBACK, and the chain ends', () => {
    assert.equal(fallbackOf('dance_conga' as Clip), 'dance_bounce')
    assert.equal(fallbackOf('dance_spin'), CLIP_FALLBACK.dance_spin)
    for (const start of [...CELEBRATIONS, 'dance_conga' as Clip]) {
      const seen = new Set<Clip>()
      for (let c: Clip | undefined = start; c; c = fallbackOf(c)) {
        assert.ok(!seen.has(c), `fallback loop at ${c}`)
        seen.add(c)
      }
      assert.ok(seen.size <= 6, `${start}: chain of ${seen.size}`)
    }
  })

  it('only the dances he owns join the celebrations; celebrate, hop and bounce always do', () => {
    const open = (owned: UnlockId[]) => openCelebrations(CELEBRATIONS, (c) => canCelebrate(owned, c))
    assert.deepEqual(open([]), ['celebrate', 'dance_bounce', 'hop'])
    assert.deepEqual(open(['dance_disco', 'dance_spin', 'rainbow_cap']), ['celebrate', 'dance_bounce', 'dance_spin', 'dance_disco', 'hop'])
    const all = SHOP.map((i) => i.id)
    assert.deepEqual(open(all), [...CELEBRATIONS])
    // A clip that is not a shop dance is open from the start.
    assert.deepEqual(openCelebrations([...CELEBRATIONS, 'dance_conga'], (c) => canCelebrate([], c)), ['celebrate', 'dance_bounce', 'hop', 'dance_conga'])
    // Nothing open falls back to the whole list rather than an empty pick.
    assert.deepEqual(openCelebrations(CELEBRATIONS, () => false), [...CELEBRATIONS])
  })
})

describe('laneZ', () => {
  it('follows the spots and stays flat past the ends', () => {
    assert.equal(laneZ(-1.05, SPOTS), 1.0)
    assert.equal(laneZ(0, SPOTS), 0.6)
    assert.equal(laneZ(1.05, SPOTS), 1.0)
    assert.ok(Math.abs(laneZ(0.525, SPOTS) - 0.8) < 1e-9)
    assert.equal(laneZ(3.4, SPOTS), 1.0)
    assert.equal(laneZ(-3.4, SPOTS), 1.0)
  })
})

describe('roamTarget', () => {
  it('always lands inside the lane, a real step away', () => {
    const rng = rngOf(11)
    const width = LANE.laneMax - LANE.laneMin
    for (let i = 0; i < 5000; i++) {
      const x = LANE.laneMin + rng() * width
      const t = roamTarget({ x, ...LANE }, rng)
      assert.ok(t.x >= LANE.laneMin && t.x <= LANE.laneMax, `x ${t.x} out of the lane`)
      if (t.how === 'wander') assert.ok(Math.abs(t.x - x) >= ROAM.wanderMinStep * width - 1e-9, `wander step ${Math.abs(t.x - x)}`)
    }
  })

  it('a pace crosses to the far side', () => {
    const pace = () => 0 // below paceChance
    const width = LANE.laneMax - LANE.laneMin
    assert.ok(Math.abs(roamTarget({ x: -0.9, ...LANE }, pace).x - (LANE.laneMax - ROAM.paceInset * width)) < 1e-9)
    assert.ok(Math.abs(roamTarget({ x: 0.9, ...LANE }, pace).x - (LANE.laneMin + ROAM.paceInset * width)) < 1e-9)
  })

  it('uses both kinds of move', () => {
    const rng = rngOf(3)
    const kinds = new Set<string>()
    for (let i = 0; i < 200; i++) kinds.add(roamTarget({ x: 0, ...LANE }, rng).how)
    assert.deepEqual([...kinds].sort(), ['pace', 'wander'])
  })
})

describe('roamStep', () => {
  it('does nothing while disabled (intro, Play mode, held, experiment)', () => {
    const s = { ...free(0), enabled: false }
    const { log } = run(0, 60, s, rngOf(1))
    assert.deepEqual(log, [])
  })

  it('roams every 4 to 9 s while free, inside the lane', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      // Input every 10 s keeps the idle emote out of this check.
      const { log } = run(0, 120, free(0), rngOf(seed), (t) => ({ lastInput: Math.floor(t / 10) * 10 }))
      const walks = log.filter((e) => e.action.kind === 'walk')
      assert.ok(walks.length >= 12, `seed ${seed}: only ${walks.length} walks in 120 s`)
      let prev = 0
      for (const w of walks) {
        const gap = w.t - prev
        // Scheduled on the tick after arrival, then due on a tick boundary.
        assert.ok(gap >= ROAM.gapMin - 1e-9 && gap <= ROAM.gapMax + (2 * ROAM.tickMs) / 1000 + 1e-9, `seed ${seed}: gap ${gap.toFixed(2)}`)
        const a = w.action as Extract<RoamAction, { kind: 'walk' }>
        assert.ok(a.x >= LANE.laneMin && a.x <= LANE.laneMax)
        prev = w.t
      }
    }
  })

  it('never roams while busy, and starts a fresh gap after', () => {
    const rng = rngOf(9)
    const busyUntil = 30
    const { log } = run(0, 45, free(0), rng, (t) => ({ busy: t < busyUntil, lastInput: t }))
    const first = log.find((e) => e.action.kind === 'walk')
    assert.ok(first, 'no walk after the busy spell')
    assert.ok(first.t >= busyUntil + ROAM.gapMin - 1e-9, `walked at ${first.t} while or right after busy`)
  })

  it('waits while he is still walking', () => {
    const s = free(0, { nextAt: 1, moving: true })
    assert.equal(roamStep(5, s, rngOf(1)).action.kind, 'none')
  })

  it('a walk clears the schedule until he has arrived', () => {
    const out = roamStep(10, free(0, { nextAt: 9, lastInput: 9 }), rngOf(2))
    assert.equal(out.action.kind, 'walk')
    assert.equal(out.state.nextAt, null)
  })

  it('steps aside to the right of the maximized window (its home is left), waits, and comes back on restore', () => {
    const rng = rngOf(4)
    let s = free(0, { lastInput: 0 })
    let out = roamStep(1, { ...s, maximized: 'notes' }, rng)
    assert.deepEqual(out.action, { kind: 'aside', side: 1 })
    s = out.state
    // Waiting: no walks or emotes, however long.
    for (let t = 1.2; t < 60; t += 0.2) {
      out = roamStep(t, { ...s, maximized: 'notes' }, rng)
      assert.equal(out.action.kind, 'none', `t=${t}`)
      s = out.state
    }
    out = roamStep(61, { ...s, maximized: null }, rng)
    assert.deepEqual(out.action, { kind: 'back' })
    assert.equal(out.state.aside, null)
  })

  it('steps aside even while busy (the maximized window covers the lane)', () => {
    const out = roamStep(1, free(0, { busy: true, maximized: 'notes' }), rngOf(1))
    assert.deepEqual(out.action, { kind: 'aside', side: 1 })
  })

  it('drops the aside when roaming switches off', () => {
    const out = roamStep(1, free(0, { aside: 'notes', maximized: 'notes', enabled: false }), rngOf(1))
    assert.deepEqual(out.action, { kind: 'back' })
  })

  it('emotes after about 20 s with no input, never the same twice in a row', () => {
    const { log } = run(0, 200, free(0), rngOf(5))
    const emotes = log.filter((e) => e.action.kind === 'emote')
    assert.ok(emotes.length >= 8, `only ${emotes.length} emotes in 200 s`)
    let last: string | null = null
    let prevT = 0
    for (const e of emotes) {
      const clip = (e.action as Extract<RoamAction, { kind: 'emote' }>).clip
      assert.ok((ROAM.idleEmotes as readonly string[]).includes(clip))
      assert.notEqual(clip, last)
      assert.ok(e.t - prevT >= ROAM.idleEmoteSeconds - 1e-9, `emote ${e.t - prevT}s after the last`)
      last = clip
      prevT = e.t
    }
  })

  it('student input holds the idle emote off', () => {
    const { log } = run(0, 120, free(0), rngOf(6), (t) => ({ lastInput: t - 1 }))
    assert.equal(log.filter((e) => e.action.kind === 'emote').length, 0)
  })

  it('is pure: the input state is never mutated', () => {
    const s = free(0, { nextAt: 1 })
    const copy = structuredClone(s)
    roamStep(5, s, rngOf(1))
    assert.deepEqual(s, copy)
  })
})

// The lesson camera (layout3d.ts LESSON_CAMERA) and a maximized window like
// windowConfig.ts's: centred at world z 2.3, 76% of the frame either side.
describe('asideSpot', () => {
  const VIEW = { camX: 0, camZ: 7.4, fov: 40, aspect: 16 / 9 }
  const perNdc = (z: number, v = VIEW) => (v.camZ - z) * Math.tan((v.fov * Math.PI) / 360) * v.aspect
  const WIN = { cx: 0, halfW: 0.76 * perNdc(2.3), z: 2.3 }
  const ndcAt = (x: number, z: number, v = VIEW) => (x - v.camX) / perNdc(z, v)

  it('stands in the middle of the gap on the side away from the window home, centred camera', () => {
    const right = asideSpot(WIN, 1, 1, VIEW)
    const left = asideSpot(WIN, -1, 1, VIEW)
    assert.ok(Math.abs(ndcAt(right, 1) - 0.88) < 1e-9, `right at ndc ${ndcAt(right, 1)}`)
    assert.ok(Math.abs(ndcAt(left, 1) + 0.88) < 1e-9, `left at ndc ${ndcAt(left, 1)}`)
  })

  it('takes the side with room when a camera pan slides the window over the other side', () => {
    const panned = { ...VIEW, camX: -0.9 } // focus on the notes: the camera pans left, the window slides right on screen
    const x = asideSpot(WIN, 1, 1, panned) // notes home: he would go right, but the right gap is gone
    const n = ndcAt(x, 1, panned)
    const edge = ndcAt(WIN.cx - WIN.halfW, WIN.z, panned)
    assert.ok(n < edge && n > -1, `ndc ${n} should sit between the frame edge -1 and the window edge ${edge}`)
  })

  it('keeps him on screen when the window covers a whole side', () => {
    const wide = { ...WIN, cx: 2 }
    const x = asideSpot(wide, 1, 1, VIEW)
    const n = ndcAt(x, 1)
    assert.ok(n >= -1 && n <= 1, `ndc ${n}`)
    assert.ok(n < ndcAt(wide.cx - wide.halfW, wide.z), 'left of the window')
  })
})
