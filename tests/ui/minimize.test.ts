import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chipPlace, chipReveal, maximizeWin, minimizeEase, minimizeWin, restoreWin, toggleMaximizeWin, type Box, type MinState } from '../../src/scene/windows/minimize.ts'
import { WINDOW_UI } from '../../src/scene/windows/windowConfig.ts'

// Minimize: the store transitions (a maximized window is never minimized),
// the shrink timing, and where the restore chip lands on the stage.

const C = WINDOW_UI.minimize.chip
const both = (notes: boolean, board: boolean) => ({ notes, board })
const base: MinState = { maximized: null, minimized: both(false, false) }

describe('minimize state', () => {
  it('minimizes one window and leaves the other alone', () => {
    const s = minimizeWin(base, 'notes')
    assert.deepEqual(s, { maximized: null, minimized: both(true, false) })
    assert.equal(minimizeWin(s, 'notes'), s, 'minimizing twice is a no-op (same object)')
  })

  it('a maximized window gives the stage back when minimized', () => {
    assert.deepEqual(minimizeWin({ ...base, maximized: 'board' }, 'board'), { maximized: null, minimized: both(false, true) })
    assert.deepEqual(minimizeWin({ ...base, maximized: 'board' }, 'notes'), { maximized: 'board', minimized: both(true, false) })
  })

  it('restore brings the window back in front: the other maximized window steps back', () => {
    const s = { maximized: 'board' as const, minimized: both(true, false) }
    assert.deepEqual(restoreWin(s, 'notes'), { maximized: null, minimized: both(false, false) })
    assert.equal(restoreWin(base, 'notes'), base, 'restoring a window that is not minimized is a no-op')
  })

  it('maximizing a minimized window restores it; the invariant holds for every transition', () => {
    assert.deepEqual(maximizeWin({ ...base, minimized: both(true, true) }, 'notes'), { maximized: 'notes', minimized: both(false, true) })
    assert.deepEqual(toggleMaximizeWin({ ...base, maximized: 'notes' }, 'notes'), base)
    assert.equal(maximizeWin(base, null), base)
    const ops = [
      (s: MinState) => minimizeWin(s, 'notes'),
      (s: MinState) => minimizeWin(s, 'board'),
      (s: MinState) => restoreWin(s, 'notes'),
      (s: MinState) => restoreWin(s, 'board'),
      (s: MinState) => maximizeWin(s, 'notes'),
      (s: MinState) => maximizeWin(s, 'board'),
      (s: MinState) => maximizeWin(s, null),
      (s: MinState) => toggleMaximizeWin(s, 'notes'),
      (s: MinState) => toggleMaximizeWin(s, 'board'),
    ]
    // Every sequence of 4 operations from the start state.
    const walk = (s: MinState, depth: number) => {
      if (s.maximized) assert.equal(s.minimized[s.maximized], false, `maximized ${s.maximized} is minimized`)
      if (depth === 0) return
      for (const op of ops) walk(op(s), depth - 1)
    }
    walk(base, 4)
  })
})

describe('minimize timing', () => {
  it('is snappy: both directions finish within 300 ms', () => {
    assert.ok(WINDOW_UI.minimize.ms <= 300 && WINDOW_UI.minimize.restoreMs <= 300)
    assert.ok(WINDOW_UI.minimize.ms >= 120, 'but not so fast it reads as a blink')
  })

  it('eases from 0 to 1 without overshoot, monotonically', () => {
    assert.equal(minimizeEase(0), 0)
    assert.equal(minimizeEase(1), 1)
    let prev = 0
    for (let i = 1; i <= 100; i++) {
      const v = minimizeEase(i / 100)
      assert.ok(v >= prev && v <= 1, `ease(${i / 100}) = ${v}`)
      prev = v
    }
  })

  it('the chip appears only once the window is mostly folded, fully at the end', () => {
    assert.equal(chipReveal(0), 0)
    assert.equal(chipReveal(WINDOW_UI.minimize.chipFrom), 0)
    assert.equal(chipReveal(1), 1)
    assert.ok(chipReveal((1 + WINDOW_UI.minimize.chipFrom) / 2) > 0)
  })
})

// The lesson page at 1456 x 785 (measured in the browser): the 16:9 stage
// frame, the bottom bar (walkthrough + ask) and the caption over the stage.
const host: Box = { left: 0, top: 0, right: 1456, bottom: 785 }
const frame: Box = { left: 206, top: 68, right: 1251, bottom: 656 }
const dock: Box = { left: 154, top: 668, right: 1303, bottom: 765 }
const caption: Box = { left: 373, top: 585, right: 1084, bottom: 641 }
const H = 40

// The chip's box in viewport px when it takes its full allowed width.
function boxOf(p: ReturnType<typeof chipPlace>, h: number, on: Box = host): Box {
  const bottom = on.bottom - p.bottom
  const left = p.side === 'left' ? on.left + p.x : on.right - p.x - p.maxW
  return { left, right: left + p.maxW, top: bottom - h, bottom }
}
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

describe('restore chip placement', () => {
  it('sits on its own side, on the bottom bar end, just above it, clear of the caption', () => {
    const n = chipPlace('notes', host, frame, dock, caption, H)
    assert.equal(n.side, 'left')
    assert.equal(n.x, dock.left)
    assert.equal(n.bottom, host.bottom - (dock.top - C.gap))
    assert.equal(n.maxW, caption.left - C.gap - dock.left)
    const b = chipPlace('board', host, frame, dock, caption, H)
    assert.equal(b.side, 'right')
    assert.equal(b.x, host.right - dock.right)
    assert.equal(b.maxW, dock.right - (caption.right + C.gap))
    for (const p of [n, b]) {
      assert.ok(!overlaps(boxOf(p, H), caption), 'clear of the caption')
      assert.ok(!overlaps(boxOf(p, H), dock), 'above the bottom bar')
    }
  })

  it('without a bottom bar it uses the stage frame corners', () => {
    const n = chipPlace('notes', host, frame, null, null, H)
    assert.equal(n.x, frame.left + C.pad)
    assert.equal(n.bottom, host.bottom - (frame.bottom - C.pad))
    assert.equal(n.maxW, C.maxW)
    const b = chipPlace('board', host, null, null, null, H)
    assert.equal(b.x, C.pad)
  })

  it('lifts above the caption when the caption leaves too little room beside it', () => {
    const wide: Box = { left: 200, top: 600, right: 1260, bottom: 660 }
    const n = chipPlace('notes', host, frame, dock, wide, H)
    assert.equal(n.bottom, host.bottom - (wide.top - C.gap))
    assert.equal(n.maxW, C.maxW)
    assert.ok(!overlaps(boxOf(n, H), wide))
  })

  it('never overlaps the caption or the bottom bar (random layouts)', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 500; i++) {
      const w = 900 + rnd() * 1200
      const h = 600 + rnd() * 500
      const hb: Box = { left: 0, top: 0, right: w, bottom: h }
      const dTop = h - 80 - rnd() * 40
      const d: Box = { left: 20 + rnd() * 150, top: dTop, right: w - 20 - rnd() * 150, bottom: dTop + 70 }
      const cw = 200 + rnd() * (w - 300)
      const cl = (w - cw) / 2
      const cTop = dTop - 30 - rnd() * 120
      const c: Box = { left: cl, top: cTop, right: cl + cw, bottom: cTop + 40 + rnd() * 20 }
      for (const win of ['notes', 'board'] as const) {
        const p = chipPlace(win, hb, null, d, c, H)
        const box = boxOf(p, H, hb)
        assert.ok(!overlaps(box, c), `caption overlap: ${JSON.stringify({ box, c })}`)
        assert.ok(!overlaps(box, d), `dock overlap: ${JSON.stringify({ box, d })}`)
        assert.ok(p.maxW >= C.minW || p.bottom === h - (c.top - C.gap), 'narrow chips are lifted instead')
      }
    }
  })
})
