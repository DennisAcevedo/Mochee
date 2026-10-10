import { notesTabs } from '../../../shared/lessonNotes.ts'
import { WINDOW_UI } from './windowConfig.ts'

// The pure tab model of the two windows, Chrome style: every tab has a stable
// id and a content kind, each window has an active tab and is never empty.
// Every operation returns a new state, or the SAME state object when nothing
// changed (so a store can skip the update). No React, no three: the Node
// tests in tests/ui/tabs.test.ts import this file directly.

export type WinId = 'notes' | 'board'
export const WIN_IDS: readonly WinId[] = ['notes', 'board']
export const otherWin = (win: WinId): WinId => (win === 'notes' ? 'board' : 'notes')

export type TabContent =
  | { kind: 'notes'; note: number } // lesson notes tab N (index into notesTabs)
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

export interface TabsState {
  notes: WinTabs
  board: WinTabs
  seq: number // last number used for a generated tab id ('t' + seq)
}

export const TAB_KINDS: readonly TabKind[] = ['notes', 'board', 'quiz', 'scratch', 'pdf', 'newtab']
const NOTE_COUNT = notesTabs.length

// ---- Lesson tabs: unique by content, each with a home window

export const isLesson = (c: TabContent): c is LessonContent => c.kind === 'notes' || c.kind === 'board' || c.kind === 'quiz'

// 'notes:0' | 'board' | 'quiz' for lesson content, null for everything else.
export function lessonKey(c: TabContent): string | null {
  if (c.kind === 'notes') return `notes:${c.note}`
  return c.kind === 'board' || c.kind === 'quiz' ? c.kind : null
}

export const homeOf = (c: LessonContent): WinId => (c.kind === 'notes' ? 'notes' : 'board')

// Order of lesson tabs inside their home window.
const rankOf = (c: TabContent): number => (c.kind === 'notes' ? c.note : c.kind === 'board' ? 0 : c.kind === 'quiz' ? 1 : -1)

export const contentOf = (tab: Tab): TabContent => {
  const { id: _id, ...content } = tab
  return content as TabContent
}

// ---- Construction

export function initialTabs(): TabsState {
  return {
    notes: { tabs: notesTabs.map((_, i): Tab => ({ id: `n${i}`, kind: 'notes', note: i })), active: 'n0' },
    board: {
      tabs: [
        { id: 'b0', kind: 'board' },
        { id: 'q0', kind: 'quiz' },
      ],
      active: 'b0',
    },
    seq: 0,
  }
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
  win: WinId
  index: number
  tab: Tab
}

export function findTab(s: TabsState, id: string): Found | null {
  for (const win of WIN_IDS) {
    const index = s[win].tabs.findIndex((t) => t.id === id)
    if (index >= 0) return { win, index, tab: s[win].tabs[index] }
  }
  return null
}

export function findLesson(s: TabsState, key: string): Found | null {
  for (const win of WIN_IDS) {
    const index = s[win].tabs.findIndex((t) => lessonKey(t) === key)
    if (index >= 0) return { win, index, tab: s[win].tabs[index] }
  }
  return null
}

export const activeTab = (s: TabsState, win: WinId): Tab => s[win].tabs.find((t) => t.id === s[win].active) ?? s[win].tabs[0]

const put = (s: TabsState, win: WinId, w: WinTabs, seq = s.seq): TabsState => ({ ...s, [win]: w, seq })

// Takes tab `index` out of a window: the tab to the right becomes active (or
// the left one if it was last); an emptied window gets a New tab.
function removeAt(s: TabsState, win: WinId, index: number): TabsState {
  const w = s[win]
  const gone = w.tabs[index]
  if (!gone) return s
  const tabs = w.tabs.filter((_, i) => i !== index)
  if (!tabs.length) {
    const [id, seq] = nextId(s)
    return put(s, win, { tabs: [{ id, kind: 'newtab' }], active: id }, seq)
  }
  const active = w.active === gone.id ? tabs[Math.min(index, tabs.length - 1)].id : w.active
  return put(s, win, { tabs, active })
}

function insertAt(s: TabsState, win: WinId, tab: Tab, index: number, activate = true): TabsState {
  const w = s[win]
  const at = Math.max(0, Math.min(index, w.tabs.length))
  const tabs = [...w.tabs.slice(0, at), tab, ...w.tabs.slice(at)]
  return put(s, win, { tabs, active: activate ? tab.id : w.active })
}

// ---- Operations

// The + button: a New tab page at the end of the strip, active.
export function openNewTab(s: TabsState, win: WinId): TabsState {
  if (s[win].tabs.length >= WINDOW_UI.tabs.maxPerWindow) return s
  const [id, seq] = nextId(s)
  return insertAt({ ...s, seq }, win, { id, kind: 'newtab' }, s[win].tabs.length)
}

export function closeTab(s: TabsState, win: WinId, id: string): TabsState {
  const index = s[win].tabs.findIndex((t) => t.id === id)
  return index < 0 ? s : removeAt(s, win, index)
}

export function activateTab(s: TabsState, win: WinId, id: string): TabsState {
  const w = s[win]
  if (w.active === id || !w.tabs.some((t) => t.id === id)) return s
  return put(s, win, { ...w, active: id })
}

// Drag a tab sideways: it lands at `to` (clamped) among the window's tabs.
export function reorderTab(s: TabsState, win: WinId, id: string, to: number): TabsState {
  const w = s[win]
  const from = w.tabs.findIndex((t) => t.id === id)
  if (from < 0) return s
  const at = Math.max(0, Math.min(to, w.tabs.length - 1))
  if (at === from) return s
  const tabs = w.tabs.filter((t) => t.id !== id)
  tabs.splice(at, 0, w.tabs[from])
  return put(s, win, { ...w, tabs })
}

// Drag a tab onto the other window's strip: it leaves `from` (which stays
// non-empty) and becomes the active tab of `to` at `index`.
export function moveTab(s: TabsState, from: WinId, id: string, to: WinId, index: number): TabsState {
  if (from === to) {
    const moved = reorderTab(s, from, id, index)
    return activateTab(moved, from, id)
  }
  const at = s[from].tabs.findIndex((t) => t.id === id)
  if (at < 0) return s
  const tab = s[from].tabs[at]
  return insertAt(removeAt(s, from, at), to, tab, index)
}

// A New tab page pick: this tab turns into `content` and is activated. A
// lesson tab is unique, so if it is open elsewhere that copy goes away.
export function turnInto(s: TabsState, win: WinId, id: string, content: TabContent): TabsState {
  const key = lessonKey(content)
  let next = s
  if (key) {
    const other = findLesson(next, key)
    if (other && other.tab.id !== id) next = removeAt(next, other.win, other.index)
  }
  const index = next[win].tabs.findIndex((t) => t.id === id)
  if (index < 0) return s
  const tabs = next[win].tabs.map((t, i) => (i === index ? withId(content, id) : t))
  return put(next, win, { tabs, active: id })
}

// Where a lesson tab goes back into its home window: after the lesson tabs
// that come before it, before the ones after it, else at the end.
function homeIndex(tabs: Tab[], content: LessonContent): number {
  const rank = rankOf(content)
  const home = homeOf(content)
  let after = -1
  let before = -1
  tabs.forEach((t, i) => {
    if (!isLesson(t) || homeOf(t) !== home) return
    if (rankOf(t) < rank) after = i
    else if (before < 0) before = i
  })
  if (after >= 0) return after + 1
  return before >= 0 ? before : tabs.length
}

// The walkthrough needs `content` on screen: reopen it if it was closed, bring
// it back to its home window if it was dragged away, and activate it.
export function ensureLessonTab(s: TabsState, content: LessonContent): TabsState {
  const key = lessonKey(content) as string
  const home = homeOf(content)
  const found = findLesson(s, key)
  if (!found) {
    const [id, seq] = nextId(s)
    return insertAt({ ...s, seq }, home, withId(content, id), homeIndex(s[home].tabs, content))
  }
  if (found.win !== home) {
    const removed = removeAt(s, found.win, found.index)
    return insertAt(removed, home, found.tab, homeIndex(removed[home].tabs, content))
  }
  return activateTab(s, home, found.tab.id)
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
// fields, duplicate ids and duplicate lesson tabs, fixes the active tab,
// refills an empty window with a New tab. Null if the shape is unusable.
export function validateTabs(raw: unknown): TabsState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const ids = new Set<string>()
  const keys = new Set<string>()
  let seq = Number.isInteger(r.seq) && (r.seq as number) >= 0 ? (r.seq as number) : 0
  const wins: Partial<Record<WinId, { tabs: Tab[]; active: unknown }>> = {}
  for (const win of WIN_IDS) {
    const w = r[win] as Record<string, unknown> | undefined
    if (!w || typeof w !== 'object' || !Array.isArray(w.tabs)) return null
    const tabs: Tab[] = []
    for (const t of w.tabs as unknown[]) {
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
    wins[win] = { tabs, active: w.active }
  }
  const out: TabsState = { ...initialTabs(), seq }
  for (const win of WIN_IDS) {
    const { tabs, active } = wins[win]!
    if (!tabs.length) {
      out.seq += 1
      const id = `t${out.seq}`
      out[win] = { tabs: [{ id, kind: 'newtab' }], active: id }
      continue
    }
    out[win] = { tabs, active: typeof active === 'string' && tabs.some((t) => t.id === active) ? active : tabs[0].id }
  }
  return out
}
