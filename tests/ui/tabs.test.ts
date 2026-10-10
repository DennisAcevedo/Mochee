import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activateTab,
  activeTab,
  closedTabs,
  closeTab,
  ensureLessonTab,
  findLesson,
  initialTabs,
  openNewTab,
  reorderTab,
  trimNotes,
  turnInto,
  validateTabs,
  WIN,
  WIN_IDS,
  type TabsState,
} from '../../src/scene/windows/tabModel.ts'
import { closeShown, ellipsize, slotIndex, tabLook, tabTargetWidth, clampSize } from '../../src/scene/windows/tabLayout.ts'
import { WINDOW_UI } from '../../src/scene/windows/windowConfig.ts'
import { WINDOW } from '../../src/scene/layout3d.ts'

const ids = (s: TabsState) => s.notes.tabs.map((t) => t.id)
const kinds = (s: TabsState) => s.notes.tabs.map((t) => (t.kind === 'notes' ? `notes${t.note}` : t.kind))
const LESSON = ['notes0', 'notes1', 'notes2', 'board', 'quiz']

describe('tab model', () => {
  it('is one window, keyed by the old left window id', () => {
    assert.equal(WIN, 'notes')
    assert.deepEqual(WIN_IDS, ['notes'])
    assert.deepEqual(Object.keys(initialTabs()).sort(), ['notes', 'seq'])
  })

  it('starts with every lesson tab in one strip: three notes tabs, then board + Quick check', () => {
    const s = initialTabs()
    assert.deepEqual(kinds(s), LESSON)
    assert.equal(s.notes.active, 'n0')
    assert.equal(activeTab(s).id, 'n0')
  })

  it('+ opens a New tab at the end and activates it, with a fresh id', () => {
    const s0 = initialTabs()
    const s1 = openNewTab(s0)
    assert.equal(s1.notes.tabs.length, 6)
    const added = s1.notes.tabs[5]
    assert.equal(added.kind, 'newtab')
    assert.equal(s1.notes.active, added.id)
    const s2 = openNewTab(s1)
    assert.notEqual(s2.notes.tabs[6].id, added.id)
    assert.equal(s0.notes.tabs.length, 5, 'pure: the input is untouched')
  })

  it('caps the tabs', () => {
    let s = initialTabs()
    for (let i = 0; i < 40; i++) s = openNewTab(s)
    assert.equal(s.notes.tabs.length, WINDOW_UI.tabs.maxPerWindow)
  })

  it('closing the active tab activates the right neighbour, or the left one if it was last', () => {
    const s = initialTabs()
    const mid = closeTab(activateTab(s, 'n1'), 'n1')
    assert.equal(mid.notes.active, 'n2')
    const last = closeTab(activateTab(s, 'q0'), 'q0')
    assert.equal(last.notes.active, 'b0')
    const other = closeTab(s, 'n2')
    assert.equal(other.notes.active, 'n0', 'closing an inactive tab keeps the active one')
  })

  it('closing the last tab leaves a New tab, so the window is never empty', () => {
    let s = initialTabs()
    for (const id of ['n0', 'n1', 'n2', 'b0', 'q0']) s = closeTab(s, id)
    assert.equal(s.notes.tabs.length, 1)
    assert.equal(s.notes.tabs[0].kind, 'newtab')
    assert.equal(s.notes.active, s.notes.tabs[0].id)
  })

  it('returns the same object when nothing changes', () => {
    const s = initialTabs()
    assert.equal(closeTab(s, 'nope'), s)
    assert.equal(activateTab(s, 'n0'), s)
    assert.equal(activateTab(s, 'nope'), s)
    assert.equal(reorderTab(s, 'n0', 0), s)
    assert.equal(ensureLessonTab(s, { kind: 'notes', note: 0 }), s)
  })

  it('reorders within the strip, clamped to it', () => {
    const s = initialTabs()
    assert.deepEqual(ids(reorderTab(s, 'n0', 2)), ['n1', 'n2', 'n0', 'b0', 'q0'])
    assert.deepEqual(ids(reorderTab(s, 'q0', 0)), ['q0', 'n0', 'n1', 'n2', 'b0'])
    assert.deepEqual(ids(reorderTab(s, 'n0', 99)), ['n1', 'n2', 'b0', 'q0', 'n0'])
    assert.equal(reorderTab(s, 'n0', 1).notes.active, 'n0', 'reorder keeps the active tab')
  })

  it('a New tab pick turns the tab into the content and keeps lesson tabs unique', () => {
    let s = openNewTab(initialTabs())
    const nt = s.notes.active
    s = turnInto(s, nt, { kind: 'scratch' })
    assert.equal(s.notes.tabs.find((t) => t.id === nt)?.kind, 'scratch')
    s = openNewTab(s)
    const nt2 = s.notes.active
    s = turnInto(s, nt2, { kind: 'notes', note: 1 })
    assert.equal(findLesson(s, 'notes:1')?.tab.id, nt2, 'the picked tab is now Lecture 3')
    assert.ok(!ids(s).includes('n1'), 'the old copy is gone')
    assert.equal(s.notes.active, nt2)
    const pdf = turnInto(s, nt, { kind: 'pdf', docId: 'd1', page: 3, title: 'x.pdf' })
    assert.deepEqual(
      pdf.notes.tabs.find((t) => t.id === nt),
      { id: nt, kind: 'pdf', docId: 'd1', page: 3, title: 'x.pdf' },
    )
    assert.equal(turnInto(s, 'nope', { kind: 'scratch' }), s)
  })

  it('ensureLessonTab reopens a closed lesson tab in its lesson slot', () => {
    let s = closeTab(initialTabs(), 'n1')
    s = activateTab(s, 'n2')
    s = ensureLessonTab(s, { kind: 'notes', note: 1 })
    assert.deepEqual(kinds(s), LESSON)
    assert.equal(findLesson(s, 'notes:1')?.tab.id, s.notes.active)
  })

  it('ensureLessonTab puts the board after the notes and before the Quick check, among other tabs', () => {
    let s = openNewTab(closeTab(closeTab(initialTabs(), 'b0'), 'q0')) // notes x3 + a New tab
    s = ensureLessonTab(s, { kind: 'quiz' })
    s = ensureLessonTab(s, { kind: 'board' })
    assert.deepEqual(kinds(s), ['notes0', 'notes1', 'notes2', 'board', 'quiz', 'newtab'])
    assert.equal(s.notes.active, findLesson(s, 'board')?.tab.id)
  })

  it('ensureLessonTab just activates a tab that is open, wherever it was dragged', () => {
    const moved = reorderTab(initialTabs(), 'q0', 0)
    const s = ensureLessonTab(moved, { kind: 'quiz' })
    assert.deepEqual(ids(s), ids(moved), 'no move back')
    assert.equal(s.notes.active, 'q0')
  })
})

describe('lesson pack notes tabs (notes tab N = section N)', () => {
  it('opens a section past the hand-written notes in the notes run, before the board and the Quick check', () => {
    let s = ensureLessonTab(initialTabs(), { kind: 'notes', note: 4 })
    s = ensureLessonTab(s, { kind: 'notes', note: 3 })
    s = ensureLessonTab(s, { kind: 'notes', note: 5 })
    assert.deepEqual(kinds(s), ['notes0', 'notes1', 'notes2', 'notes3', 'notes4', 'notes5', 'board', 'quiz'])
    assert.equal(s.notes.active, findLesson(s, 'notes:5')?.tab.id)
  })

  it('a later section lands after the board when the earlier notes tabs were closed, never after it', () => {
    let s = closeTab(closeTab(closeTab(initialTabs(), 'n0'), 'n1'), 'n2')
    s = ensureLessonTab(s, { kind: 'notes', note: 4 })
    assert.deepEqual(kinds(s), ['notes4', 'board', 'quiz'])
  })

  it('trimNotes drops notes tabs past the count and keeps every other tab', () => {
    let s = openNewTab(ensureLessonTab(initialTabs(), { kind: 'notes', note: 4 }))
    const nt = s.notes.active
    s = activateTab(s, findLesson(s, 'notes:4')!.tab.id)
    const t = trimNotes(s, 2)
    assert.deepEqual(kinds(t), ['notes0', 'notes1', 'board', 'quiz', 'newtab'])
    assert.equal(t.notes.active, 'b0', 'the active section went: its right neighbour takes over')
    assert.ok(t.notes.tabs.some((x) => x.id === nt))
    assert.equal(trimNotes(initialTabs(), 3).notes.tabs.length, 5)
    const same = initialTabs()
    assert.equal(trimNotes(same, 6), same, 'nothing past the count: the same state')
  })
})

describe('red light: closedTabs', () => {
  it('drops the window\'s own tabs and rebuilds the lesson tabs fresh', () => {
    let s = openNewTab(initialTabs())
    const nt = s.notes.active
    s = turnInto(s, nt, { kind: 'pdf', docId: 'd1', page: 2, title: 'x.pdf' })
    s = openNewTab(s)
    s = turnInto(s, s.notes.active, { kind: 'scratch' })
    s = closeTab(reorderTab(s, 'q0', 0), 'n1')
    const c = closedTabs(s)
    assert.deepEqual(kinds(c), LESSON)
    assert.deepEqual(ids(c), ids(initialTabs()))
    assert.equal(c.notes.active, 'n0')
    assert.ok(!c.notes.tabs.some((t) => t.kind === 'pdf' || t.kind === 'scratch' || t.kind === 'newtab'))
    assert.equal(c.seq, s.seq, 'ids keep counting up, so a reused id never meets an old one')
  })

  it('then fits a running pack with fewer sections (lessonSync trims after a close)', () => {
    const c = trimNotes(closedTabs(openNewTab(initialTabs())), 2)
    assert.deepEqual(ids(c), ['n0', 'n1', 'b0', 'q0'])
    assert.equal(c.notes.active, 'n0')
  })
})

describe('stored state validation', () => {
  it('round-trips a real state', () => {
    let s = openNewTab(reorderTab(initialTabs(), 'n2', 0))
    s = turnInto(s, s.notes.active, { kind: 'pdf', docId: 'abc', page: 2, title: 'Notes.pdf' })
    assert.deepEqual(validateTabs(JSON.parse(JSON.stringify(s))), s)
  })

  it('reads a two-window save as one window and drops the other window\'s tabs', () => {
    const v = validateTabs({
      seq: 2,
      notes: { active: 'n1', tabs: [{ id: 'n0', kind: 'notes', note: 0 }, { id: 'n1', kind: 'notes', note: 1 }] },
      board: { active: 'q0', tabs: [{ id: 'b0', kind: 'board' }, { id: 'q0', kind: 'quiz' }] },
    })
    assert.ok(v)
    assert.deepEqual(Object.keys(v).sort(), ['notes', 'seq'])
    assert.deepEqual(ids(v), ['n0', 'n1'])
    assert.equal(v.notes.active, 'n1')
  })

  it('rejects junk and drops bad tabs, duplicates and unknown kinds', () => {
    assert.equal(validateTabs(null), null)
    assert.equal(validateTabs('x'), null)
    assert.equal(validateTabs({ board: { tabs: [] } }), null)
    assert.equal(validateTabs({ notes: { tabs: 'x' } }), null)
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
    })
    assert.ok(v)
    assert.deepEqual(v.notes.tabs, [
      { id: 'a', kind: 'notes', note: 0 },
      { id: 't7', kind: 'pdf', docId: 'z', page: 4, title: 'PDF' },
    ])
    assert.equal(v.notes.active, 'a')
    assert.equal(v.seq, 7, 'seq moves past every stored t<n> id')
  })

  it('refills an emptied window with a New tab', () => {
    const v = validateTabs({ notes: { tabs: [{ id: 'x', kind: 'nope' }] } })
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

  it('the one window fits five or six tabs with their titles showing', () => {
    // The real strip: WINDOW.width (layout3d.ts) less the lights (WINDOW_STYLE.tabStrip.tabsX, pinned) and rightPad.
    const width = WINDOW.width
    const strip = { left: -width / 2 + 0.38, right: width / 2 - WINDOW_UI.tabs.rightPad }
    for (const n of [5, 6]) assert.notEqual(tabLook(tabTargetWidth(n, strip)), 'tiny', `${n} tabs keep their titles`)
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
