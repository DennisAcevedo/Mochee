import { create } from 'zustand'
import {
  activateTab,
  closedTabs,
  closeTab,
  ensureLessonTab,
  initialTabs,
  openNewTab,
  reorderTab,
  turnInto,
  validateTabs,
  WIN,
  type LessonContent,
  type TabContent,
  type TabsState,
  type WinId,
  type WinRef,
} from '../scene/windows/tabModel.ts'
import { closeWin, maximizeWin, minimizeWin, restoreWin, toggleMaximizeWin, type MinState } from '../scene/windows/minimize.ts'
import { WINDOW_UI } from '../scene/windows/windowConfig.ts'

// Tabs and layout of the room's one mini browser window: Chrome-style tabs
// (open, close, reorder) in a window that moves, resizes, maximizes (green),
// minimizes into a restore chip (yellow) and closes (red). Contract
// (docs/specs/2026-10-10-sparkle-stage.md): the windows builder owns this file
// and everything behind it; other code may only READ `maximized`,
// `minimized` and `closed`.
//
// Every action still takes the window's id first, as when there were two
// windows: there is one now, so any id ('notes', or the old right window's
// 'board') names it. The tab logic itself is pure
// (src/scene/windows/tabModel.ts); this store wraps it, adds the window's
// offset and size, and persists tabs + layout in localStorage
// (WINDOW_UI.storageKey) so a reload restores them. Imports carry their .ts
// extension so tests/ui/minimize.test.ts can load the store under plain Node.

export type { WinId, WinRef } from '../scene/windows/tabModel.ts'

export interface WinLayout {
  offset: [number, number] // world x, y from the window's default placement (WINDOW in layout3d.ts)
  size: [number, number] | null // width, height; null = the default size
}

export interface WindowsState {
  maximized: WinId | null // the tutor steps aside while the window is maximized
  minimized: boolean // folded into its restore chip; never true while maximized or closed
  closed: boolean // red light: gone with no chip until the lesson or the Reader opens it again
  tabs: TabsState
  layout: WinLayout

  openTab: (win: WinRef) => void
  closeTab: (win: WinRef, id: string) => void
  activateTab: (win: WinRef, id: string) => void
  reorderTab: (win: WinRef, id: string, index: number) => void
  turnInto: (win: WinRef, id: string, content: TabContent) => void
  ensureLessonTab: (content: LessonContent) => void
  setOffset: (win: WinRef, offset: [number, number]) => void
  setSize: (win: WinRef, size: [number, number] | null) => void
  toggleMaximize: (win: WinRef) => void
  setMaximized: (win: WinRef | null) => void // also opens a minimized or closed window
  minimize: (win: WinRef) => void // yellow light: shrink into the restore chip
  close: (win: WinRef) => void // red light: drop the window's own tabs, rebuild the lesson ones, hide it
  restore: (win: WinRef) => void // the chip, or the lesson needing the window: bring it back
  resetWindows: () => void
}

const defaultLayout = (): WinLayout => ({ offset: [0, 0], size: null })

// ---- Persistence (every access guarded: storage can be missing, full or blocked)

interface Stored {
  v: 2
  tabs: TabsState
  layout: WinLayout
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function readLayout(raw: unknown): WinLayout {
  const r = (raw ?? {}) as { offset?: unknown; size?: unknown }
  const [ox, oy] = WINDOW_UI.window.offsetLimit
  const o = Array.isArray(r.offset) && r.offset.length === 2 && r.offset.every(finite) ? (r.offset as [number, number]) : [0, 0]
  const s = Array.isArray(r.size) && r.size.length === 2 && r.size.every(finite) ? (r.size as [number, number]) : null
  const [minW, minH] = WINDOW_UI.window.minSize
  const [maxW, maxH] = WINDOW_UI.window.maxSize
  return {
    offset: [clamp(o[0], -ox, ox), clamp(o[1], -oy, oy)],
    size: s ? [clamp(s[0], minW, maxW), clamp(s[1], minH, maxH)] : null,
  }
}

function load(): Pick<WindowsState, 'tabs' | 'layout'> {
  try {
    const text = window.localStorage.getItem(WINDOW_UI.storageKey)
    if (!text) throw new Error('empty')
    const raw = JSON.parse(text) as Partial<Stored>
    if (raw?.v !== 2) throw new Error('version')
    const tabs = validateTabs(raw.tabs)
    if (!tabs) throw new Error('tabs')
    return { tabs, layout: readLayout(raw.layout) }
  } catch {
    return { tabs: initialTabs(), layout: defaultLayout() }
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      // The state when the timer fires: a listener may have updated it again since the change that scheduled this.
      const s = useWindows.getState()
      const data: Stored = { v: 2, tabs: s.tabs, layout: s.layout }
      window.localStorage.setItem(WINDOW_UI.storageKey, JSON.stringify(data))
    } catch {
      // Private mode or a full quota: the window still works, it just won't survive a reload.
    }
  }, WINDOW_UI.saveDebounceMs)
}

// A closed window's scratch tab is discarded, its note with it.
function dropScratch() {
  try {
    window.localStorage.removeItem(WINDOW_UI.scratchKey + WIN)
  } catch {
    // Storage blocked: nothing was saved either.
  }
}

// ---- Store

export const useWindows = create<WindowsState>((set, get) => {
  // Applies a pure tab operation; no store update when it returned the same state.
  const tabsOp = (op: (s: TabsState) => TabsState) => {
    const prev = get().tabs
    const next = op(prev)
    if (next !== prev) set({ tabs: next })
  }
  const layoutOp = (patch: Partial<WinLayout>) => set((s) => ({ layout: { ...s.layout, ...patch } }))
  // Applies a pure maximize / minimize / close transition (minimize.ts); no update when nothing changed.
  const winOp = (op: (s: MinState) => MinState) => {
    const { maximized, minimized, closed } = get()
    const prev: MinState = { maximized, minimized, closed }
    const next = op(prev)
    if (next !== prev) set({ maximized: next.maximized, minimized: next.minimized, closed: next.closed })
  }

  return {
    maximized: null,
    minimized: false,
    closed: false,
    ...load(),

    openTab: () => tabsOp(openNewTab),
    closeTab: (_win, id) => tabsOp((s) => closeTab(s, id)),
    activateTab: (_win, id) => tabsOp((s) => activateTab(s, id)),
    reorderTab: (_win, id, index) => tabsOp((s) => reorderTab(s, id, index)),
    turnInto: (_win, id, content) => tabsOp((s) => turnInto(s, id, content)),
    ensureLessonTab: (content) => tabsOp((s) => ensureLessonTab(s, content)),

    setOffset: (_win, offset) => {
      const o = get().layout.offset
      if (o[0] !== offset[0] || o[1] !== offset[1]) layoutOp({ offset })
    },
    setSize: (_win, size) => {
      const s = get().layout.size
      if (s === size || (s && size && s[0] === size[0] && s[1] === size[1])) return
      layoutOp({ size })
    },
    toggleMaximize: () => winOp((s) => toggleMaximizeWin(s, WIN)),
    setMaximized: (win) => winOp((s) => maximizeWin(s, win === null ? null : WIN)),
    minimize: () => winOp(minimizeWin),
    close: () => {
      const s = get()
      if (s.closed) return
      // One update: whoever sees `closed` flip also sees the fresh tabs (and the old ones as the previous state).
      const next = closeWin({ maximized: s.maximized, minimized: s.minimized, closed: s.closed })
      set({ maximized: next.maximized, minimized: next.minimized, closed: next.closed, tabs: closedTabs(s.tabs) })
      dropScratch()
    },
    restore: () => winOp(restoreWin),
    resetWindows: () => set({ maximized: null, minimized: false, closed: false, tabs: initialTabs(), layout: defaultLayout() }),
  }
})

// Persist tabs and layout, not `maximized`, `minimized` or `closed`: like a
// browser started again, a reload brings the window back open, with the
// tutor in the middle.
useWindows.subscribe((s, prev) => {
  if (s.tabs !== prev.tabs || s.layout !== prev.layout) scheduleSave()
})
