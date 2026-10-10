import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import {
  chipPlace,
  chipReveal,
  closeScale,
  closeWin,
  maximizeWin,
  minimizeEase,
  minimizeWin,
  restoreWin,
  toggleMaximizeWin,
  type Box,
  type MinState,
} from '../../src/scene/windows/minimize.ts'
import { WINDOW_UI } from '../../src/scene/windows/windowConfig.ts'

// The window's yellow light (minimize into a restore chip) and red light
// (close, no chip): the pure transitions, the store that runs them with the
// tabs, the timing, and where the restore chip lands on the stage.

const C = WINDOW_UI.minimize.chip
const base: MinState = { maximized: null, minimized: false, closed: false }

// A localStorage stand-in, installed before the store loads (it reads storage once, at creation).
const mem = new Map<string, string>()
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
}
// A save from the two-window layout (v1): must not crash the store or bring back a second window.
mem.set(
  'gg.windows.v1',
  JSON.stringify({ v: 1, tabs: { notes: { tabs: [{ id: 'n0', kind: 'notes', note: 0 }], active: 'n0' }, board: { tabs: [{ id: 'b0', kind: 'board' }], active: 'b0' }, seq: 0 } }),
)
;(globalThis as { window?: unknown }).window = { localStorage: storage }
const { useWindows } = await import('../../src/state/windows.ts')
const initial = useWindows.getState()
after(() => useWindows.getState().resetWindows())
// A v2 save that still carries a second window's tabs (a hand-edited or
// half-migrated payload): a second store instance (the query makes Node load
// the module again) reads it, keeps the one window's tabs and drops the rest.
const TWO = {
  v: 2,
  tabs: {
    notes: { tabs: [{ id: 'n0', kind: 'notes', note: 0 }, { id: 't3', kind: 'scratch' }], active: 't3' },
    board: { tabs: [{ id: 'b0', kind: 'board' }, { id: 'q0', kind: 'quiz' }], active: 'b0' },
    seq: 3,
  },
  layout: { offset: [0.1, 0], size: null },
}
mem.set(WINDOW_UI.storageKey, JSON.stringify(TWO))
const twoShaped = (await import('../../src/state/windows.ts?two-window-v2')).useWindows.getState()
mem.delete(WINDOW_UI.storageKey)
const { noteEpoch, saveNote } = await import('../../src/scene/windows/scratchNote.ts')
const { asStudent, reopenFor, revealsBoard, trimAfterClose } = await import('../../src/scene/windows/lessonNeed.ts')

const fresh = () => {
  useWindows.getState().resetWindows()
  return useWindows.getState()
}
const kinds = () => useWindows.getState().tabs.notes.tabs.map((t) => (t.kind === 'notes' ? `notes${t.note}` : t.kind))
const LESSON = ['notes0', 'notes1', 'notes2', 'board', 'quiz']

describe('minimize and close state', () => {
  it('minimize folds the window; twice is a no-op (same object)', () => {
    const s = minimizeWin(base)
    assert.deepEqual(s, { maximized: null, minimized: true, closed: false })
    assert.equal(minimizeWin(s), s)
  })

  it('close hides the window with no chip, from any state', () => {
    assert.deepEqual(closeWin(base), { maximized: null, minimized: false, closed: true })
    assert.deepEqual(closeWin(minimizeWin(base)), { maximized: null, minimized: false, closed: true }, 'a minimized window loses its chip')
    assert.deepEqual(closeWin({ ...base, maximized: 'notes' }), { maximized: null, minimized: false, closed: true }, 'closing while maximized un-maximizes')
    const c = closeWin(base)
    assert.equal(closeWin(c), c)
    assert.equal(minimizeWin(c), c, 'a closed window cannot be minimized')
  })

  it('a maximized window gives the stage back when minimized', () => {
    assert.deepEqual(minimizeWin({ ...base, maximized: 'notes' }), { maximized: null, minimized: true, closed: false })
  })

  it('restore reopens a minimized or a closed window; otherwise a no-op', () => {
    assert.deepEqual(restoreWin(minimizeWin(base)), base)
    assert.deepEqual(restoreWin(closeWin(base)), base)
    assert.equal(restoreWin(base), base)
  })

  it('maximize opens a minimized or closed window; the invariants hold for every transition', () => {
    assert.deepEqual(maximizeWin(minimizeWin(base), 'notes'), { maximized: 'notes', minimized: false, closed: false })
    assert.deepEqual(maximizeWin(closeWin(base), 'notes'), { maximized: 'notes', minimized: false, closed: false })
    assert.deepEqual(toggleMaximizeWin({ ...base, maximized: 'notes' }, 'notes'), base)
    assert.equal(maximizeWin(base, null), base)
    const ops = [minimizeWin, closeWin, restoreWin, (s: MinState) => maximizeWin(s, 'notes'), (s: MinState) => maximizeWin(s, null), (s: MinState) => toggleMaximizeWin(s, 'notes')]
    // Every sequence of 5 operations from the start state.
    const walk = (s: MinState, depth: number) => {
      assert.ok(!(s.minimized && s.closed), 'never both minimized and closed')
      if (s.maximized) assert.ok(!s.minimized && !s.closed, 'a maximized window is open')
      if (depth === 0) return
      for (const op of ops) walk(op(s), depth - 1)
    }
    walk(base, 5)
  })
})

describe('the windows store: close vs minimize', () => {
  it('ignores a two-window (v1) save: one window, the lesson tabs, open', () => {
    assert.equal(WINDOW_UI.storageKey, 'gg.windows.v2')
    assert.deepEqual(Object.keys(initial.tabs).sort(), ['notes', 'seq'])
    assert.deepEqual(initial.tabs.notes.tabs.map((t) => t.kind), ['notes', 'notes', 'notes', 'board', 'quiz'])
    assert.equal(initial.minimized, false)
    assert.equal(initial.closed, false)
  })

  it('a v2 save shaped like two windows loads the one window and drops the stray second one', () => {
    assert.deepEqual(Object.keys(twoShaped.tabs).sort(), ['notes', 'seq'])
    assert.deepEqual(twoShaped.tabs.notes.tabs.map((t) => t.id), ['n0', 't3'], 'only the window\'s own tabs; the board window\'s b0 / q0 are not merged in')
    assert.equal(twoShaped.tabs.notes.active, 't3')
    assert.deepEqual(twoShaped.layout, { offset: [0.1, 0], size: null })
    assert.equal(twoShaped.closed, false)
  })

  it('minimize keeps every tab, the active one included, and restore brings them back', () => {
    const s = fresh()
    s.openTab('notes')
    const nt = useWindows.getState().tabs.notes.active
    s.turnInto('notes', nt, { kind: 'scratch' })
    s.openTab('board') // the old id names the same window
    const before = useWindows.getState().tabs
    s.minimize('notes')
    assert.equal(useWindows.getState().minimized, true)
    assert.equal(useWindows.getState().closed, false)
    assert.equal(useWindows.getState().tabs, before, 'tabs untouched')
    s.restore('notes')
    assert.equal(useWindows.getState().minimized, false)
    assert.equal(useWindows.getState().tabs, before)
  })

  it('close drops the non-lesson tabs, rebuilds the lesson tabs fresh and shows no chip', () => {
    const s = fresh()
    s.openTab('notes')
    const st = useWindows.getState()
    s.turnInto('notes', st.tabs.notes.active, { kind: 'pdf', docId: 'd1', page: 2, title: 'x.pdf' })
    s.openTab('notes')
    s.turnInto('notes', useWindows.getState().tabs.notes.active, { kind: 'scratch' })
    s.openTab('notes')
    s.closeTab('notes', 'n1')
    s.reorderTab('notes', 'q0', 0)
    mem.set(WINDOW_UI.scratchKey + 'notes', 'my note')
    s.close('notes')
    const after = useWindows.getState()
    assert.equal(after.closed, true)
    assert.equal(after.minimized, false, 'no restore chip')
    assert.deepEqual(kinds(), LESSON)
    assert.equal(after.tabs.notes.active, 'n0')
    assert.equal(mem.has(WINDOW_UI.scratchKey + 'notes'), false, 'the scratch note goes with its tab')
  })

  it('a scratch page open at close time cannot write its note back (the real save order)', () => {
    const s = fresh()
    const key = WINDOW_UI.scratchKey + 'notes'
    s.openTab('notes')
    s.turnInto('notes', useWindows.getState().tabs.notes.active, { kind: 'scratch' })
    // ScratchPage mounts (remembers the epoch) and saves as the student types.
    const page = noteEpoch()
    saveNote('notes', 'draft', page)
    assert.equal(mem.get(key), 'draft')
    // Red light: the store drops the key at once ...
    s.close('notes')
    assert.equal(mem.has(key), false)
    // ... then React drops the tab and the page's unmount save runs, or a debounced keystroke save fires late.
    saveNote('notes', 'draft', page)
    assert.equal(mem.has(key), false, 'the unmount save is skipped')
    // Even if the page outlives the close (held for the close animation) until the window is back open.
    s.restore('notes')
    saveNote('notes', 'draft', page)
    assert.equal(mem.has(key), false, 'a page from before the close never saves again')
    // A scratch tab opened after that saves normally.
    saveNote('notes', 'new note', noteEpoch())
    assert.equal(mem.get(key), 'new note')
    mem.delete(key)
  })

  it('close is one update: a listener sees closed and the fresh tabs together, the old tabs as previous', () => {
    const s = fresh()
    s.openTab('notes')
    const old = useWindows.getState().tabs
    const seen: [boolean, string[], boolean][] = []
    const off = useWindows.subscribe((n, p) => seen.push([n.closed, n.tabs.notes.tabs.map((t) => t.kind), p.tabs === old]))
    s.close('notes')
    off()
    assert.deepEqual(seen, [[true, ['notes', 'notes', 'notes', 'board', 'quiz'], true]])
  })
  it('closing while maximized un-maximizes; closing a minimized window drops its chip', () => {
    const s = fresh()
    s.toggleMaximize('notes')
    assert.equal(useWindows.getState().maximized, 'notes')
    s.close('notes')
    assert.equal(useWindows.getState().maximized, null)
    assert.equal(useWindows.getState().closed, true)
    const t = fresh()
    t.minimize('notes')
    t.close('notes')
    assert.equal(useWindows.getState().minimized, false)
    assert.equal(useWindows.getState().closed, true)
  })

  it('a lesson need reopens a closed window on the tab it needs (lessonNeed.reopenFor, what lessonSync runs)', () => {
    const s = fresh()
    s.closeTab('notes', 'q0')
    s.close('notes')
    reopenFor({ kind: 'quiz' })
    const st = useWindows.getState()
    assert.equal(st.closed, false)
    assert.equal(st.minimized, false)
    assert.equal(st.tabs.notes.tabs.find((t) => t.id === st.tabs.notes.active)?.kind, 'quiz')
  })

  it('a lesson need unfolds a minimized window and keeps its tabs', () => {
    const s = fresh()
    s.openTab('notes')
    s.turnInto('notes', useWindows.getState().tabs.notes.active, { kind: 'scratch' })
    s.minimize('notes')
    reopenFor({ kind: 'notes', note: 1 })
    const st = useWindows.getState()
    assert.equal(st.minimized, false)
    assert.ok(st.tabs.notes.tabs.some((t) => t.kind === 'scratch'), 'the scratch tab is still there')
    assert.equal(st.tabs.notes.active, 'n1')
  })

  it('a student\'s own tab click (asStudent) does not reopen or switch anything', () => {
    const s = fresh()
    s.close('notes')
    asStudent(() => reopenFor({ kind: 'board' }))
    assert.equal(useWindows.getState().closed, true)
    s.restore('notes')
  })

  it('only a board reveal that shows more asks for the Board tab (revealsBoard: the lesson-start reset Infinity -> 0 does not)', () => {
    assert.equal(revealsBoard(0, Number.POSITIVE_INFINITY), false, 'walkthrough start resets the board')
    assert.equal(revealsBoard(0, 5), false, 'a new pack section resets the board')
    assert.equal(revealsBoard(2, 5), false, 'any shrink is a reset, not a reveal')
    assert.equal(revealsBoard(Number.POSITIVE_INFINITY, 3), false, 'show-all is not a lesson step')
    assert.equal(revealsBoard(1, 0), true)
    assert.equal(revealsBoard(4, 3), true)
  })

  it('after a close, the rebuilt notes tabs fit a pack with fewer sections', () => {
    const s = fresh()
    s.close('notes')
    trimAfterClose(2)
    assert.deepEqual(kinds(), ['notes0', 'notes1', 'board', 'quiz'])
    const same = useWindows.getState().tabs
    trimAfterClose(2)
    assert.equal(useWindows.getState().tabs, same, 'no update when nothing to trim')
  })

  it('the Reader opening a page reopens a closed window (openTab + turnInto + setMaximized, as PageViewer calls them)', () => {
    const s = fresh()
    s.close('notes')
    s.openTab('notes')
    const id = useWindows.getState().tabs.notes.active
    s.turnInto('notes', id, { kind: 'pdf', docId: 'd9', page: 4, title: 'Reader.pdf' })
    s.setMaximized('notes')
    const st = useWindows.getState()
    assert.equal(st.closed, false)
    assert.equal(st.maximized, 'notes')
    assert.deepEqual(st.tabs.notes.tabs.find((t) => t.id === st.tabs.notes.active), { id, kind: 'pdf', docId: 'd9', page: 4, title: 'Reader.pdf' })
  })

  it('persists tabs and layout, never closed or minimized', async () => {
    const s = fresh()
    s.close('notes')
    await new Promise((r) => setTimeout(r, WINDOW_UI.saveDebounceMs + 50))
    const saved = JSON.parse(mem.get(WINDOW_UI.storageKey) ?? '{}') as Record<string, unknown>
    assert.equal(saved.v, 2)
    assert.deepEqual(Object.keys(saved).sort(), ['layout', 'tabs', 'v'])
    s.restore('notes')
  })
})

describe('minimize and close timing', () => {
  it('is snappy: every direction finishes within 300 ms', () => {
    assert.ok(WINDOW_UI.minimize.ms <= 300 && WINDOW_UI.minimize.restoreMs <= 300)
    assert.ok(WINDOW_UI.close.ms <= 300 && WINDOW_UI.close.openMs <= 300)
    assert.ok(WINDOW_UI.minimize.ms >= 120 && WINDOW_UI.close.ms >= 120, 'but not so fast it reads as a blink')
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

  it('a closing window shrinks into its centre, from full size to almost nothing', () => {
    assert.equal(closeScale(0), 1)
    assert.ok(Math.abs(closeScale(1) - WINDOW_UI.close.scale) < 1e-12)
    for (let i = 1; i <= 100; i++) assert.ok(closeScale(i / 100) <= closeScale((i - 1) / 100))
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
  const left = on.left + p.x
  return { left, right: left + p.maxW, top: bottom - h, bottom }
}
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

describe('restore chip placement', () => {
  it('sits on the bottom bar\'s left end, just above it, clear of the caption', () => {
    const n = chipPlace(host, frame, dock, caption, H)
    assert.equal(n.x, dock.left)
    assert.equal(n.bottom, host.bottom - (dock.top - C.gap))
    assert.equal(n.maxW, caption.left - C.gap - dock.left)
    assert.ok(!overlaps(boxOf(n, H), caption), 'clear of the caption')
    assert.ok(!overlaps(boxOf(n, H), dock), 'above the bottom bar')
  })

  it('without a bottom bar it uses the stage frame\'s bottom-left corner', () => {
    const n = chipPlace(host, frame, null, null, H)
    assert.equal(n.x, frame.left + C.pad)
    assert.equal(n.bottom, host.bottom - (frame.bottom - C.pad))
    assert.equal(n.maxW, C.maxW)
    assert.equal(chipPlace(host, null, null, null, H).x, C.pad)
  })

  it('lifts above the caption when the caption leaves too little room beside it', () => {
    const wide: Box = { left: 200, top: 600, right: 1260, bottom: 660 }
    const n = chipPlace(host, frame, dock, wide, H)
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
      const p = chipPlace(hb, null, d, c, H)
      const box = boxOf(p, H, hb)
      assert.ok(!overlaps(box, c), `caption overlap: ${JSON.stringify({ box, c })}`)
      assert.ok(!overlaps(box, d), `dock overlap: ${JSON.stringify({ box, d })}`)
      assert.ok(p.maxW >= C.minW || p.bottom === h - (c.top - C.gap), 'narrow chips are lifted instead')
    }
  })
})
