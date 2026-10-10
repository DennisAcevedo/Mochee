import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AnimationController, stateOfClip, type AnimOutput, type AnimSyncInput } from '../../src/character/blender/animController.ts'
import { ANIM, ANIM_STATES, ANIM_STATE_NAMES, CLIP_FALLBACK } from '../../src/character/blender/config.ts'
import type { OneShotClip } from '../../src/state/director.ts'

// Clip lengths the motion layer would report (seconds).
const SECONDS: Record<string, number> = { celebrate: 2, hop: 0.9, shrug: 1.2, giggle: 1.4, recover: 0.9, surprise: 0.7, hint: 1.1, equip: 1, levelup: 2.6, wave: 1.4 }
const make = (loop: AnimSyncInput['loop'] = 'idle') => new AnimationController((c) => SECONDS[c] ?? null, loop, 0, 0)

let gid = 0
const frame = (over: Partial<AnimSyncInput> = {}): AnimSyncInput => ({ loop: 'idle', speaking: false, gesture: null, moving: false, ...over })
const play = (clip: OneShotClip) => ({ id: ++gid, clip })

describe('AnimationController', () => {
  it('maps every director clip to a state and covers all 20 states', () => {
    assert.equal(ANIM_STATE_NAMES.length, 20)
    assert.equal(stateOfClip('talk', 'loop'), 'explain')
    assert.equal(stateOfClip('point_left', 'loop'), 'explain')
    assert.equal(stateOfClip('dragged', 'loop'), 'dragged')
    assert.equal(stateOfClip('hop', 'oneshot'), 'correct')
    assert.equal(stateOfClip('shrug', 'oneshot'), 'incorrect')
    assert.equal(stateOfClip('dance_spin', 'oneshot'), 'dance')
    assert.equal(stateOfClip('giggle', 'oneshot'), 'play')
    assert.equal(stateOfClip('wake', 'oneshot'), 'surprise')
  })

  it('keeps the priority ladder from the spec', () => {
    const p = (s: keyof typeof ANIM_STATES) => ANIM_STATES[s].priority
    assert.ok(p('dragged') === 100 && p('tumble') === 100)
    assert.ok(p('recover') === 90 && p('levelup') === 80)
    assert.ok(p('celebrate') === 60 && p('correct') === 60 && p('dance') === 60)
    assert.ok(p('surprise') === 55 && p('incorrect') === 50 && p('hint') === 50)
    assert.ok(p('explain') === 30 && p('think') === 30 && p('listen') === 30)
    assert.ok(p('idle') === 0 && p('sleep') === 0)
  })

  it('plays a one-shot, then returns to the current base loop', () => {
    const c = make()
    let out = c.sync(0, frame({ gesture: play('hint') }))
    assert.equal(out.gesture?.clip, 'hint')
    assert.equal(c.state, 'hint')
    assert.equal(out.gesture?.fade, ANIM_STATES.hint.fade)
    out = c.sync(0.5, frame({ loop: 'think' })) // base changes underneath the one-shot
    assert.equal(c.state, 'hint')
    assert.equal(out.loop, 'think')
    out = c.sync(1.2, frame({ loop: 'think' }))
    assert.equal(out.gesture, null)
    assert.equal(c.state, 'think')
    assert.equal(c.last?.reason, 'done')
  })

  it('reads idle + speaking as explain (talk)', () => {
    const c = make()
    const out = c.sync(1, frame({ speaking: true }))
    assert.equal(out.loop, 'talk')
    assert.equal(c.state, 'explain')
  })

  it('never lets a lower priority interrupt a higher one: it queues once and plays after', () => {
    const c = make()
    c.sync(0, frame({ gesture: play('celebrate') })) // 60, 2 s
    let out = c.sync(0.3, frame({ gesture: play('shrug') })) // 50: queued
    assert.equal(out.gesture?.clip, 'celebrate')
    assert.equal(c.snapshot().queued, 'shrug')
    assert.equal(c.last?.reason, 'queued')
    out = c.sync(2.0, frame())
    assert.equal(out.gesture, null) // celebrate done, but the queued shrug is 1.7 s old > TTL
    assert.equal(c.snapshot().queued, null)
    assert.equal(c.last?.reason, 'expired')

    const d = make()
    d.sync(0, frame({ gesture: play('hop') })) // 60, 0.9 s
    d.sync(0.5, frame({ gesture: play('giggle') })) // 50: queued
    out = d.sync(0.95, frame())
    assert.equal(out.gesture?.clip, 'giggle') // fresh enough: dequeued when hop ends
    assert.equal(d.last?.reason, 'dequeued')
  })

  it('lets an equal or higher priority replace the one-shot in progress', () => {
    const c = make()
    const a = c.sync(0, frame({ gesture: play('hop') })).gesture
    const b = c.sync(0.2, frame({ gesture: play('celebrate') })).gesture // both 60
    assert.equal(b?.clip, 'celebrate')
    assert.notEqual(a?.id, b?.id)
    const l = c.sync(0.4, frame({ gesture: play('levelup') })).gesture // 80 > 60
    assert.equal(l?.clip, 'levelup')
    assert.equal(c.state, 'levelup')
  })

  it('drops a repeat inside the state cooldown', () => {
    const c = make()
    c.sync(0, frame({ gesture: play('hint') }))
    c.sync(1.3, frame()) // hint finished
    const out = c.sync(1.4, frame({ gesture: play('hint') })) // cooldown 1.5 s from the start at 0
    assert.equal(out.gesture, null)
    assert.equal(c.last?.reason, 'cooldown')
    assert.equal(c.dropped, 1)
    assert.equal(c.sync(1.6, frame({ gesture: play('hint') })).gesture?.clip, 'hint')
  })

  it('cuts a one-shot when a higher loop arrives (dragged), and blocks lower one-shots while held', () => {
    const c = make()
    c.sync(0, frame({ gesture: play('celebrate') }))
    let out = c.sync(0.3, frame({ loop: 'dragged' }))
    assert.equal(out.cut, true)
    assert.equal(out.gesture, null)
    assert.equal(out.loop, 'dragged')
    assert.equal(out.loopFade, ANIM_STATES.dragged.fade)
    assert.equal(c.state, 'dragged')
    assert.equal(c.last?.reason, 'interrupt')
    out = c.sync(0.4, frame({ loop: 'dragged', gesture: play('giggle') })) // 50 < 100
    assert.equal(out.gesture, null)
    assert.equal(c.state, 'dragged')
    out = c.sync(3, frame({ loop: 'dragged' }))
    assert.equal(c.snapshot().queued, null) // expired while held
  })

  it('hands off tumble -> recover in one frame (loop applied before the gesture)', () => {
    const c = make('tumble')
    const out = c.sync(1, frame({ loop: 'idle', gesture: play('recover') }))
    assert.equal(out.loop, 'idle')
    assert.equal(out.gesture?.clip, 'recover')
    assert.equal(c.state, 'recover')
    // recover (90) is not interrupted by a celebration (60): queued instead.
    c.sync(1.2, frame({ gesture: play('celebrate') }))
    assert.equal(c.state, 'recover')
    assert.equal(c.snapshot().queued, 'celebrate')
  })

  it('holds a loop for its dwell before an equal-or-lower loop replaces it', () => {
    const c = make()
    c.sync(0, frame({ loop: 'think' })) // 30 > 0: switches at once
    assert.equal(c.state, 'think')
    let out = c.sync(0.1, frame({ loop: 'listen' })) // 30 vs 30, inside the 0.3 s dwell
    assert.equal(out.loop, 'think')
    out = c.sync(0.35, frame({ loop: 'listen' }))
    assert.equal(out.loop, 'listen')
    out = c.sync(0.4, frame({ loop: 'think' }))
    out = c.sync(0.45, frame({ loop: 'listen' })) // flicker back before the dwell: no change at all
    assert.equal(out.loop, 'listen')
    out = c.sync(0.9, frame({ loop: 'listen' }))
    assert.equal(out.loop, 'listen')
  })

  it('waits for a walk to end before a one-shot, then plays it', () => {
    const c = make()
    let out = c.sync(0, frame({ moving: true, gesture: play('wave') }))
    assert.equal(out.gesture, null)
    assert.equal(c.last?.reason, 'walk')
    out = c.sync(2.5, frame({ moving: true })) // long walk: the request stays fresh
    assert.equal(out.gesture, null)
    out = c.sync(2.6, frame())
    assert.equal(out.gesture?.clip, 'wave')
  })

  it('request(state) rotates the state clips deterministically', () => {
    const c = make()
    const got: string[] = []
    for (let i = 0; i < 3; i++) {
      c.request('dance', i * 10)
      got.push(c.snapshot().oneShot ?? '')
    }
    assert.deepEqual(got, ['dance_bounce', 'dance_spin', 'dance_robot'])
  })

  it('ignores a director gesture that predates the controller', () => {
    const c = new AnimationController(() => 1, 'idle', 0, 7)
    const out: AnimOutput = c.sync(0, frame({ gesture: { id: 7, clip: 'wave' } }))
    assert.equal(out.gesture, null)
  })

  it('uses the default length for a clip the GLB lacks', () => {
    const c = new AnimationController(() => null)
    c.sync(0, frame({ gesture: play('equip') }))
    c.sync(ANIM.defaultOneShotSeconds - 0.01, frame())
    assert.equal(c.state, 'equip')
    c.sync(ANIM.defaultOneShotSeconds, frame())
    assert.equal(c.state, 'idle')
  })

  it('falls back from every v2 clip to a v1 clip', () => {
    assert.equal(CLIP_FALLBACK.dragged, 'listen')
    assert.equal(CLIP_FALLBACK.tumble, 'hop')
    assert.equal(CLIP_FALLBACK.recover, 'hop')
    assert.equal(CLIP_FALLBACK.surprise, 'shrug')
    assert.equal(CLIP_FALLBACK.hint, 'point_right')
    assert.equal(CLIP_FALLBACK.equip, 'wave')
  })
})
