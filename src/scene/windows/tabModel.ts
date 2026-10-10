import { notesTabs } from '../../../shared/lessonNotes.ts'
import { WINDOW_UI } from './windowConfig.ts'

// The pure tab model of the room's one browser window, Chrome style: every
// tab has a stable id and a content kind, the window has an active tab and is
// never empty. Every operation returns a new state, or the SAME state object
// when nothing changed (so a store can skip the update). No React, no three:
// the Node tests in tests/ui/tabs.test.ts import this file directly.

// The one window's id. It kept the id of the old left-hand notes window (it
// stands in the same place), so state keyed by it, the 'notes-window' scene
// object and the director's focus on 'notes' all still name it. The old
// right-hand window's id, 'board', is still accepted where an id is passed
// in (WinRef) and means this same window.
export type WinId = 'notes'
export const WIN: WinId = 'notes'
export const WIN_IDS: readonly WinId[] = [WIN]
export type WinRef = WinId | 'board'

export type TabContent =
  | { kind: 'notes'; note: number } // lesson notes tab N: notesTabs[N], or section N while a lesson pack runs
  | { kind: 'board' } // the lecture board
  | { kind: 'quiz' } // the Quick check
  | { kind: 'scratch' } // the window's own editable note
  | { kind: 'pdf'; docId: string; page: number; title: string } // one page of an uploaded PDF
  | { kind: 'newtab' }

export type TabKind = TabContent['kind']
export type Tab = TabContent & { id: string }
export type LessonContent = Extract<TabContent, { kind: 'notes' | 'board' | 'quiz' }>

export interface WinTabs {
  tabs: Tab[]
  active: string // id of the active tab; always one of `tabs`
}

// Keyed by the window id (one key) so code that reads `tabs[win]` keeps working.
export interface TabsState {
  notes: WinTabs
  seq: number // last number used for a generated tab id ('t' + seq)
}

export const TAB_KINDS: readonly TabKind[] = ['notes', 'board', 'quiz', 'scratch', 'pdf', 'newtab']
const NOTE_COUNT = notesTabs.length

// ---- Lesson tabs: unique by content, in a fixed lesson order

export const isLesson = (c: TabContent): c is LessonContent => c.kind === 'notes' || c.kind === 'board' || c.kind === 'quiz'

// 'notes:0' | 'board' | 'quiz' for lesson content, null for everything else.
export function lessonKey(c: TabContent): string | null {
  if (c.kind === 'notes') return `notes:${c.note}`
  return c.kind === 'board' || c.kind === 'quiz' ? c.kind : null
}

// Lesson order in the strip: the notes tabs, then the board, then the Quick
// check. A pack can have more sections than notesTabs has tabs, so the board
// and the Quick check rank after any note index, not after NOTE_COUNT.
const AFTER_NOTES = Number.MAX_SAFE_INTEGER - 1
const rankOf = (c: LessonContent): number => (c.kind === 'notes' ? c.note : AFTER_NOTES + (c.kind === 'board' ? 0 : 1))

export const contentOf = (tab: Tab): TabContent => {
  const { id: _id, ...content } = tab
  return content as TabContent
}

// ---- Construction

const lessonTabs = (): Tab[] => [
  ...notesTabs.map((_, i): Tab => ({ id: `n${i}`, kind: 'notes', note: i })),
  { id: 'b0', kind: 'board' },
  { id: 'q0', kind: 'quiz' },
]

export function initialTabs(): TabsState {
  return { notes: { tabs: lessonTabs(), active: 'n0' }, seq: 0 }
}

// The red light: the window's own tabs (scratch, New tab, PDF pages) are gone
// and the lesson tabs come back fresh, as at the start. Ids keep counting up.
export function closedTabs(s: TabsState): TabsState {
  return { ...initialTabs(), seq: s.seq }
}

function withId(content: TabContent, id: string): Tab {
  return { ...content, id } as Tab
}

function nextId(s: TabsState): [string, number] {
  const seq = s.seq + 1
  return [`t${seq}`, seq]
}

// ---- Queries

export interface Found {
  index: number
  tab: Tab
}

export function findLesson(s: TabsState, key: string): Found | null {
  const index = s.notes.tabs.findIndex((t) => lessonKey(t) === key)
  return index >= 0 ? { index, tab: s.notes.tabs[index] } : null
}

export const activeTab = (s: TabsState): Tab => s.notes.tabs.find((t) => t.id === s.notes.active) ?? s.notes.tabs[0]

const put = (s: TabsState, w: WinTabs, seq = s.seq): TabsState => ({ ...s, notes: w, seq })

// Takes tab `index` out: the tab to the right becomes active (or the left one
// if it was last); an emptied window gets a New tab.
function removeAt(s: TabsState, index: number): TabsState {
  const w = s.notes
  const gone = w.tabs[index]
  if (!gone) return s
  const tabs = w.tabs.filter((_, i) => i !== index)
  if (!tabs.length) {
    const [id, seq] = nextId(s)
    return put(s, { tabs: [{ id, kind: 'newtab' }], active: id }, seq)
  }
  const active = w.active === gone.id ? tabs[Math.min(index, tabs.length - 1)].id : w.active
  return put(s, { tabs, active })
}

function insertAt(s: TabsState, tab: Tab, index: number): TabsState {
  const w = s.notes
  const at = Math.max(0, Math.min(index, w.tabs.length))
  return put(s, { tabs: [...w.tabs.slice(0, at), tab, ...w.tabs.slice(at)], active: tab.id })
}

// ---- Operations

// The + button: a New tab page at the end of the strip, active.
export function openNewTab(s: TabsState): TabsState {
  if (s.notes.tabs.length >= WINDOW_UI.tabs.maxPerWindow) return s
  const [id, seq] = nextId(s)
  return insertAt({ ...s, seq }, { id, kind: 'newtab' }, s.notes.tabs.length)
}

export function closeTab(s: TabsState, id: string): TabsState {
  const index = s.notes.tabs.findIndex((t) => t.id === id)
  return index < 0 ? s : removeAt(s, index)
}

export function activateTab(s: TabsState, id: string): TabsState {
  const w = s.notes
  if (w.active === id || !w.tabs.some((t) => t.id === id)) return s
  return put(s, { ...w, active: id })
}

// Drag a tab sideways: it lands at `to` (clamped) among the tabs.
export function reorderTab(s: TabsState, id: string, to: number): TabsState {
  const w = s.notes
  const from = w.tabs.findIndex((t) => t.id === id)
  if (from < 0) return s
  const at = Math.max(0, Math.min(to, w.tabs.length - 1))
  if (at === from) return s
  const tabs = w.tabs.filter((t) => t.id !== id)
  tabs.splice(at, 0, w.tabs[from])
  return put(s, { ...w, tabs })
}

// A New tab page pick (or a page opened from the Reader): this tab turns into
// `content` and is activated. A lesson tab is unique, so another copy of it goes away.
export function turnInto(s: TabsState, id: string, content: TabContent): TabsState {
  const key = lessonKey(content)
  let next = s
  if (key) {
    const other = findLesson(next, key)
    if (other && other.tab.id !== id) next = removeAt(next, other.index)
  }
  const index = next.notes.tabs.findIndex((t) => t.id === id)
  if (index < 0) return s
  const tabs = next.notes.tabs.map((t, i) => (i === index ? withId(content, id) : t))
  return put(next, { tabs, active: id })
}

// Where a closed lesson tab comes back: after the lesson tabs that come before
// it, before the ones after it, else at the end.
function lessonIndex(tabs: Tab[], content: LessonContent): number {
  const rank = rankOf(content)
  let after = -1
  let before = -1
  tabs.forEach((t, i) => {
    if (!isLesson(t)) return
    if (rankOf(t) < rank) after = i
    else if (before < 0) before = i
  })
  if (after >= 0) return after + 1
  return before >= 0 ? before : tabs.length
}

// The walkthrough needs `content` on screen: reopen it in its lesson slot if
// it was closed, and activate it.
export function ensureLessonTab(s: TabsState, content: LessonContent): TabsState {
  const found = findLesson(s, lessonKey(content) as string)
  if (found) return activateTab(s, found.tab.id)
  const [id, seq] = nextId(s)
  return insertAt({ ...s, seq }, withId(content, id), lessonIndex(s.notes.tabs, content))
}

// The lesson now has `count` notes tabs (a pack started or ended): a notes tab
// past the last one has nothing to show and goes. Missing ones are not added
// here; ensureLessonTab opens each when the walkthrough reaches it.
export function trimNotes(s: TabsState, count: number): TabsState {
  let next = s
  // Right to left, so the indexes still to visit stay put.
  for (let i = s.notes.tabs.length - 1; i >= 0; i--) {
    const t = s.notes.tabs[i]
    if (t.kind === 'notes' && t.note >= count) next = removeAt(next, i)
  }
  return next
}

// ---- Validation of stored state (localStorage is user-editable and versioned)

const MAX_ID = 40
const MAX_TITLE = 200
const MAX_PAGE = 100_000

function readContent(raw: unknown): TabContent | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  switch (r.kind) {
    case 'notes':
      return Number.isInteger(r.note) && (r.note as number) >= 0 && (r.note as number) < NOTE_COUNT ? { kind: 'notes', note: r.note as number } : null
    case 'board':
    case 'quiz':
    case 'scratch':
    case 'newtab':
      return { kind: r.kind }
    case 'pdf':
      if (typeof r.docId !== 'string' || !r.docId || r.docId.length > MAX_ID * 4) return null
      if (!Number.isInteger(r.page) || (r.page as number) < 1 || (r.page as number) > MAX_PAGE) return null
      return { kind: 'pdf', docId: r.docId, page: r.page as number, title: typeof r.title === 'string' ? r.title.slice(0, MAX_TITLE) : 'PDF' }
    default:
      return null // unknown kinds are dropped
  }
}

// Rebuilds a TabsState from untrusted JSON: drops unknown kinds and bad
// fields, duplicate ids and duplicate lesson tabs, caps the tab count, fixes
// the active tab, refills an empty window with a New tab. Any other key (a
// second window's tabs from an older layout) is ignored. Null if the shape is unusable.
export function validateTabs(raw: unknown): TabsState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const w = r.notes as Record<string, unknown> | undefined
  if (!w || typeof w !== 'object' || !Array.isArray(w.tabs)) return null
  const ids = new Set<string>()
  const keys = new Set<string>()
  let seq = Number.isInteger(r.seq) && (r.seq as number) >= 0 ? (r.seq as number) : 0
  const tabs: Tab[] = []
  for (const t of w.tabs as unknown[]) {
    if (tabs.length >= WINDOW_UI.tabs.maxPerWindow) break
    const id = (t as { id?: unknown } | null)?.id
    const content = readContent(t)
    if (typeof id !== 'string' || !id || id.length > MAX_ID || ids.has(id) || !content) continue
    const key = lessonKey(content)
    if (key && keys.has(key)) continue
    if (key) keys.add(key)
    ids.add(id)
    const n = /^t(\d+)$/.exec(id)
    if (n) seq = Math.max(seq, Number(n[1]))
    tabs.push(withId(content, id))
  }
  if (!tabs.length) {
    seq += 1
    const id = `t${seq}`
    return { notes: { tabs: [{ id, kind: 'newtab' }], active: id }, seq }
  }
  const active = typeof w.active === 'string' && tabs.some((t) => t.id === w.active) ? w.active : tabs[0].id
  return { notes: { tabs, active }, seq }
}
