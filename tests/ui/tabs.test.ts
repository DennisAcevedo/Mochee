import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activateTab,
  closeTab,
  ensureLessonTab,
  findLesson,
  initialTabs,
  moveTab,
  openNewTab,
  reorderTab,
  turnInto,
  validateTabs,
  type TabsState,
  type WinId,
} from '../../src/scene/windows/tabModel.ts'
import { closeShown, dropIndex, ellipsize, slotIndex, tabLook, tabTargetWidth, clampSize } from '../../src/scene/windows/tabLayout.ts'
import { WINDOW_UI } from '../../src/scene/windows/windowConfig.ts'

const ids = (s: TabsState, win: WinId) => s[win].tabs.map((t) => t.id)
const kinds = (s: TabsState, win: WinId) => s[win].tabs.map((t) => (t.kind === 'notes' ? `notes${t.note}` : t.kind))

describe('tab model', () => {
  it('starts with the lesson tabs: three notes tabs, then board + Quick check', () => {
    const s = initialTabs()
    assert.deepEqual(kinds(s, 'notes'), ['notes0', 'notes1', 'notes2'])
    assert.deepEqual(kinds(s, 'board'), ['board', 'quiz'])
    assert.equal(s.notes.active, 'n0')
    assert.equal(s.board.active, 'b0')
  })

  it('+ opens a New tab at the end and activates it, with a fresh id', () => {
    const s0 = initialTabs()
    const s1 = openNewTab(s0, 'notes')
    assert.equal(s1.notes.tabs.length, 4)
    const added = s1.notes.tabs[3]
    assert.equal(added.kind, 'newtab')
    assert.equal(s1.notes.active, added.id)
    const s2 = openNewTab(s1, 'notes')
    assert.notEqual(s2.notes.tabs[4].id, added.id)
    assert.equal(s0.notes.tabs.length, 3, 'pure: the input is untouched')
  })

  it('caps the tabs per window', () => {
    let s = initialTabs()
    for (let i = 0; i < 40; i++) s = openNewTab(s, 'board')
    assert.equal(s.board.tabs.length, WINDOW_UI.tabs.maxPerWindow)
  })

  it('closing the active tab activates the right neighbour, or the left one if it was last', () => {
    const s = initialTabs()
    const mid = closeTab(activateTab(s, 'notes', 'n1'), 'notes', 'n1')
    assert.equal(mid.notes.active, 'n2')
    const last = closeTab(activateTab(s, 'notes', 'n2'), 'notes', 'n2')
    assert.equal(last.notes.active, 'n1')
    const other = closeTab(s, 'notes', 'n2')
    assert.equal(other.notes.active, 'n0', 'closing an inactive tab keeps the active one')
  })

  it('closing the last tab leaves a New tab, so a window is never empty', () => {
    let s = initialTabs()
    s = closeTab(s, 'board', 'b0')
    s = closeTab(s, 'board', 'q0')
    assert.equal(s.board.tabs.length, 1)
    assert.equal(s.board.tabs[0].kind, 'newtab')
    assert.equal(s.board.active, s.board.tabs[0].id)
  })

  it('returns the same object when nothing changes', () => {
    const s = initialTabs()
    assert.equal(closeTab(s, 'notes', 'nope'), s)
    assert.equal(activateTab(s, 'notes', 'n0'), s)
    assert.equal(reorderTab(s, 'notes', 'n0', 0), s)
    assert.equal(ensureLessonTab(s, { kind: 'notes', note: 0 }), s)
  })

  it('reorders within a window, clamped to the strip', () => {
    const s = initialTabs()
    assert.deepEqual(ids(reorderTab(s, 'notes', 'n0', 2), 'notes'), ['n1', 'n2', 'n0'])
    assert.deepEqual(ids(reorderTab(s, 'notes', 'n2', 0), 'notes'), ['n2', 'n0', 'n1'])
    assert.deepEqual(ids(reorderTab(s, 'notes', 'n0', 99), 'notes'), ['n1', 'n2', 'n0'])
    assert.equal(reorderTab(s, 'notes', 'n0', 1).notes.active, 'n0', 'reorder keeps the active tab')
  })

  it('moves a tab to the other window and activates it there', () => {
    const s = moveTab(initialTabs(), 'notes', 'n1', 'board', 1)
    assert.deepEqual(ids(s, 'notes'), ['n0', 'n2'])
    assert.deepEqual(ids(s, 'board'), ['b0', 'n1', 'q0'])
    assert.equal(s.board.active, 'n1')
    assert.equal(s.notes.active, 'n0')
  })

  it('moving the only tab out leaves a New tab behind', () => {
    let s = initialTabs()
    s = closeTab(s, 'board', 'q0')
    s = moveTab(s, 'board', 'b0', 'notes', 0)
    assert.equal(s.board.tabs[0].kind, 'newtab')
    assert.deepEqual(ids(s, 'notes').slice(0, 2), ['b0', 'n0'])
  })

  it('a New tab pick turns the tab into the content and keeps lesson tabs unique', () => {
    let s = openNewTab(initialTabs(), 'board')
    const nt = s.board.active
    s = turnInto(s, 'board', nt, { kind: 'scratch' })
    assert.equal(s.board.tabs.find((t) => t.id === nt)?.kind, 'scratch')
    s = openNewTab(s, 'board')
    const nt2 = s.board.active
    s = turnInto(s, 'board', nt2, { kind: 'notes', note: 1 })
    assert.equal(findLesson(s, 'notes:1')?.tab.id, nt2, 'the picked tab is now Lecture 3')
    assert.deepEqual(ids(s, 'notes'), ['n0', 'n2'], 'the old copy left the notes window')
    assert.equal(s.board.active, nt2)
    const pdf = turnInto(s, 'board', nt, { kind: 'pdf', docId: 'd1', page: 3, title: 'x.pdf' })
    assert.deepEqual(pdf.board.tabs.find((t) => t.id === nt), { id: nt, kind: 'pdf', docId: 'd1', page: 3, title: 'x.pdf' })
  })

  it('ensureLessonTab reopens a closed lesson tab in its home slot', () => {
    let s = closeTab(initialTabs(), 'notes', 'n1')
    s = activateTab(s, 'notes', 'n2')
    s = ensureLessonTab(s, { kind: 'notes', note: 1 })
    assert.deepEqual(kinds(s, 'notes'), ['notes0', 'notes1', 'notes2'])
    assert.equal(findLesson(s, 'notes:1')?.tab.id, s.notes.active)
  })

  it('ensureLessonTab brings a dragged-away tab home and activates it', () => {
    let s = moveTab(initialTabs(), 'board', 'q0', 'notes', 0)
    s = activateTab(s, 'board', 'b0')
    s = ensureLessonTab(s, { kind: 'quiz' })
    assert.deepEqual(ids(s, 'board'), ['b0', 'q0'])
    assert.ok(!ids(s, 'notes').includes('q0'))
    assert.equal(s.board.active, 'q0')
  })

  it('ensureLessonTab reopens the board before the Quick check, and into a window of other tabs', () => {
    let s = closeTab(closeTab(initialTabs(), 'board', 'b0'), 'board', 'q0') // board window: one New tab
    s = ensureLessonTab(s, { kind: 'quiz' })
    s = ensureLessonTab(s, { kind: 'board' })
    assert.deepEqual(kinds(s, 'board'), ['newtab', 'board', 'quiz'])
    assert.equal(s.board.active, findLesson(s, 'board')?.tab.id)
  })

  it('ensureLessonTab just activates a tab already home', () => {
    const s = ensureLessonTab(initialTabs(), { kind: 'notes', note: 2 })
    assert.equal(s.notes.active, 'n2')
  })
})

describe('stored state validation', () => {
  it('round-trips a real state', () => {
    let s = openNewTab(moveTab(initialTabs(), 'notes', 'n2', 'board', 0), 'notes')
    s = turnInto(s, 'notes', s.notes.active, { kind: 'pdf', docId: 'abc', page: 2, title: 'Notes.pdf' })
    assert.deepEqual(validateTabs(JSON.parse(JSON.stringify(s))), s)
  })

  it('rejects junk and drops bad tabs, duplicates and unknown kinds', () => {
    assert.equal(validateTabs(null), null)
    assert.equal(validateTabs('x'), null)
    assert.equal(validateTabs({ notes: { tabs: [] } }), null)
    const v = validateTabs({
      seq: 3,
      notes: {
        active: 'gone',
        tabs: [
          { id: 'a', kind: 'notes', note: 0 },
          { id: 'a', kind: 'scratch' }, // duplicate id
          { id: 'b', kind: 'notes', note: 0 }, // duplicate lesson tab
          { id: 'c', kind: 'notes', note: 99 }, // out of range
          { id: 'd', kind: 'video' }, // unknown kind
          { id: 't9', kind: 'pdf', docId: 'z', page: 0 }, // bad page
          { id: 't7', kind: 'pdf', docId: 'z', page: 4 }, // missing title -> default
        ],
      },
      board: { active: 'q', tabs: [{ id: 'q', kind: 'quiz' }] },
    })
    assert.ok(v)
    assert.deepEqual(v.notes.tabs, [
      { id: 'a', kind: 'notes', note: 0 },
      { id: 't7', kind: 'pdf', docId: 'z', page: 4, title: 'PDF' },
    ])
    assert.equal(v.notes.active, 'a')
    assert.equal(v.board.active, 'q')
    assert.equal(v.seq, 7, 'seq moves past every stored t<n> id')
  })

  it('refills an emptied window with a New tab', () => {
    const v = validateTabs({ notes: { tabs: [{ id: 'x', kind: 'nope' }] }, board: { tabs: [{ id: 'q', kind: 'quiz' }] } })
    assert.ok(v)
    assert.equal(v.notes.tabs.length, 1)
    assert.equal(v.notes.tabs[0].kind, 'newtab')
    assert.equal(v.notes.active, v.notes.tabs[0].id)
  })
})

describe('strip layout', () => {
  const span = { left: -0.96, right: 1.22 }

  it('tabs share the strip up to a max width and shrink evenly', () => {
    const one = tabTargetWidth(1, span)
    assert.equal(one, WINDOW_UI.tabs.maxW)
    const many = [2, 3, 5, 8].map((n) => tabTargetWidth(n, span))
    for (let i = 1; i < many.length; i++) assert.ok(many[i] <= many[i - 1])
    const n = 8
    const w = tabTargetWidth(n, span)
    const used = n * w + (n - 1) * WINDOW_UI.tabs.gap + WINDOW_UI.tabs.plus.size + WINDOW_UI.tabs.plus.gap
    assert.ok(used <= span.right - span.left + 1e-9, 'tabs + the + button never overflow the strip')
  })

  it('narrow tabs show the x only on the active tab, tiny ones lose the title', () => {
    assert.equal(tabLook(0.9), 'full')
    assert.equal(tabLook(0.4), 'compact')
    assert.equal(tabLook(0.25), 'tiny')
    assert.equal(closeShown(0.9, false, true), true)
    assert.equal(closeShown(0.9, false, false), false)
    assert.equal(closeShown(0.4, false, true), false)
    assert.equal(closeShown(0.25, true, false), true)
  })

  it('a dragged tab swaps slots as its centre passes a neighbour', () => {
    const w = 0.5
    const centre = (i: number) => span.left + i * (w + WINDOW_UI.tabs.gap) + w / 2
    assert.equal(slotIndex(centre(0), span, w, 3), 0)
    assert.equal(slotIndex(centre(1) - 0.2, span, w, 3), 1)
    assert.equal(slotIndex(centre(2) + 5, span, w, 3), 2)
    assert.equal(slotIndex(-9, span, w, 3), 0)
    assert.equal(dropIndex(span.left - 1, span, w, 3), 0)
    assert.equal(dropIndex(span.left + 1.01 * (w + WINDOW_UI.tabs.gap), span, w, 3), 1)
    assert.equal(dropIndex(9, span, w, 3), 3)
  })

  it('titles ellipsize to their width', () => {
    assert.equal(ellipsize('CS111 Lecture 4.pdf', 9, 0.068), 'CS111 Lecture 4.pdf')
    const short = ellipsize('Scheduling cheat sheet.pdf', 0.5, 0.068)
    assert.ok(short.endsWith('…') && short.length < 'Scheduling cheat sheet.pdf'.length)
    assert.equal(ellipsize('Anything', 0.02, 0.068), '')
  })

  it('clamps and steps live resizes', () => {
    const [minW, minH] = WINDOW_UI.window.minSize
    const [maxW, maxH] = WINDOW_UI.window.maxSize
    assert.deepEqual(clampSize(0, 0), [minW, minH])
    assert.deepEqual(clampSize(99, 99), [maxW, maxH])
    const [w] = clampSize(2.6049, 2.3)
    assert.ok(Math.abs(w - 2.6) < 1e-9)
  })
})
