import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TUMBLE, tumbleDuration, tumbleOffset } from '../../src/character/blender/tumbleLayer.ts'
import type { TumbleCause } from '../../src/state/tumbles.ts'

const CAUSES: TumbleCause[] = ['boss', 'thrown', 'dropped', 'bonk', 'shaken', 'flicked']
const STEP = 1 / 60

const isIdentity = (o: ReturnType<typeof tumbleOffset>, eps = 0) => {
  for (const v of [...o.pos, ...o.rot]) assert.ok(Math.abs(v) <= eps, `expected ~0, got ${v}`)
  for (const v of o.scale) assert.ok(Math.abs(v - 1) <= eps, `expected ~1, got ${v}`)
}

describe('tumbleOffset', () => {
  it('has a variant for every cause, 0.9 to 1.6 s long', () => {
    assert.deepEqual(Object.keys(TUMBLE.seconds).sort(), [...CAUSES].sort())
    for (const c of CAUSES) {
      const d = tumbleDuration(c)
      assert.ok(d >= 0.9 && d <= 1.6, `${c}: ${d}s`)
    }
  })

  it('reaches done within its duration and ends exactly at identity', () => {
    for (const c of CAUSES) {
      const d = tumbleDuration(c)
      let t = 0
      let o = tumbleOffset(c, 1, t)
      while (!o.done && t <= d + STEP) o = tumbleOffset(c, 1, (t += STEP))
      assert.ok(o.done, `${c} never finished`)
      assert.ok(t <= d + STEP, `${c} finished late: ${t}`)
      isIdentity(o)
      isIdentity(tumbleOffset(c, -1, d))
    }
  })

  it('starts at identity and eases into identity just before the end (no pop)', () => {
    for (const c of CAUSES) {
      isIdentity(tumbleOffset(c, 1, 0), 1e-9)
      isIdentity(tumbleOffset(c, 1, tumbleDuration(c) - 1e-4), 0.02)
    }
  })

  it('actually moves him mid-variant', () => {
    for (const c of CAUSES) {
      const d = tumbleDuration(c)
      let peak = 0
      for (let t = 0; t < d; t += STEP) {
        const o = tumbleOffset(c, 1, t)
        assert.equal(o.done, false)
        for (const v of [...o.pos, ...o.rot, ...o.scale.map((s) => s - 1)]) peak = Math.max(peak, Math.abs(v))
      }
      assert.ok(peak > 0.1, `${c} barely moves: ${peak}`)
    }
  })

  it('mirrors x (and the turns about y and z) for dir = -1', () => {
    for (const c of CAUSES) {
      const d = tumbleDuration(c)
      for (let t = 0; t < d; t += 0.07) {
        const a = tumbleOffset(c, 1, t)
        const b = tumbleOffset(c, -1, t)
        const close = (x: number, y: number) => {
          // Wrapped angles: pi and -pi are the same turn.
          const diff = Math.abs(x - y)
          return diff < 1e-9 || Math.abs(diff - 2 * Math.PI) < 1e-9
        }
        assert.ok(close(b.pos[0], -a.pos[0]), `${c} pos.x at ${t}`)
        assert.ok(close(b.pos[1], a.pos[1]) && close(b.pos[2], a.pos[2]), `${c} pos.yz at ${t}`)
        assert.ok(close(b.rot[0], a.rot[0]), `${c} rot.x at ${t}`)
        assert.ok(close(b.rot[1], -a.rot[1]) && close(b.rot[2], -a.rot[2]), `${c} rot.yz at ${t}`)
        assert.deepEqual(b.scale, a.scale)
      }
    }
  })

  it('keeps rotations wrapped and everything finite', () => {
    for (const c of CAUSES) {
      for (let t = 0; t < tumbleDuration(c); t += STEP) {
        const o = tumbleOffset(c, -1, t)
        for (const v of [...o.pos, ...o.rot, ...o.scale]) assert.ok(Number.isFinite(v))
        for (const r of o.rot) assert.ok(Math.abs(r) <= Math.PI + 1e-9)
        for (const s of o.scale) assert.ok(s > 0.3 && s < 1.7, `${c} scale ${s}`)
      }
    }
  })

  it('treats bad times as finished', () => {
    assert.equal(tumbleOffset('boss', 1, Number.NaN).done, true)
    assert.equal(tumbleOffset('boss', 1, 99).done, true)
  })
})
