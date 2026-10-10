import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AnimationController, type AnimSyncInput } from '../../src/character/blender/animController.ts'
import type { Gesture, OneShotClip } from '../../src/state/director.ts'

// The quiz's wrong-answer shrug against a step gesture still queued from his
// walk in (the quick check's entry hop, priority 60 > the shrug's 50). Found in
// the browser: answering before he reached the quiz spot dropped the shrug
// ('blocked') and he hopped on a wrong answer.

const SECONDS: Record<string, number> = { hop: 0.9, shrug: 1.2 }
const make = () => new AnimationController((c) => SECONDS[c] ?? null, 'idle', 0, 0)
const frame = (over: Partial<AnimSyncInput> = {}): AnimSyncInput => ({ loop: 'idle', speaking: false, gesture: null, moving: false, ...over })
let gid = 0
const play = (clip: OneShotClip, urgent?: boolean): Gesture => (urgent ? { id: ++gid, clip, urgent } : { id: ++gid, clip })

describe('quiz reactions vs a queued step gesture', () => {
  it('a plain lower-priority request is still blocked by the queued one (the ladder holds)', () => {
    const c = make()
    c.sync(0, frame({ gesture: play('hop'), moving: true }))
    c.sync(0.2, frame({ gesture: play('shrug'), moving: true }))
    assert.equal(c.snapshot().queued, 'hop')
    assert.equal(c.last?.reason, 'blocked')
  })

  it('an urgent shrug takes the queue and plays on arrival instead of the stale hop', () => {
    const c = make()
    c.sync(0, frame({ gesture: play('hop'), moving: true }))
    c.sync(0.2, frame({ gesture: play('shrug', true), moving: true }))
    assert.equal(c.snapshot().queued, 'shrug')
    assert.equal(c.last?.reason, 'walk')
    const out = c.sync(0.6, frame()) // arrived
    assert.equal(out.gesture?.clip, 'shrug')
    assert.equal(c.last?.reason, 'dequeued')
  })

  it('urgent does not interrupt a running higher-priority one-shot: it waits in the slot', () => {
    const c = make()
    c.sync(0, frame({ gesture: play('hop') })) // 60, 0.9 s, playing
    const out = c.sync(0.3, frame({ gesture: play('shrug', true) }))
    assert.equal(out.gesture?.clip, 'hop')
    assert.equal(c.snapshot().queued, 'shrug')
    assert.equal(c.sync(0.95, frame()).gesture?.clip, 'shrug')
  })
})
