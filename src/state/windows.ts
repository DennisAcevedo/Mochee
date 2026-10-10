import { create } from 'zustand'
import {
  activateTab,
  closeTab,
  ensureLessonTab,
  initialTabs,
  moveTab,
  openNewTab,
  reorderTab,
  turnInto,
  validateTabs,
  type LessonContent,
  type TabContent,
  type TabsState,
  type WinId,
} from '../scene/windows/tabModel'
import { maximizeWin, minimizeWin, restoreWin, toggleMaximizeWin, type MinState } from '../scene/windows/minimize'
import { WINDOW_UI } from '../scene/windows/windowConfig'

// Tabs and layout of the two mini browser windows: Chrome-style tabs (open,
// close, reorder, drag between windows) and windows that move, resize and
// maximize or minimize. Contract (docs/specs/2026-10-10-sparkle-stage.md): the
// windows builder owns this file and everything behind it; other code may only
// READ `maximized` and `minimized`. Keep those fields' names and types.
//
// The tab logic itself is pure (src/scene/windows/tabModel.ts); this store
// wraps it, adds window offsets and sizes, and persists tabs + layout in
// localStorage (WINDOW_UI.storageKey) so a reload restores them.

export type { WinId } from '../scene/windows/tabModel'

export interface WinLayout {
  offset: [number, number] // world x, y from the window's default placement (WINDOWS in layout3d.ts)
  size: [number, number] | null // width, height; null = the default size
}

export interface WindowsState {
  maximized: WinId | null // the tutor steps aside while a window is maximized
  minimized: Record<WinId, boolean> // folded into its restore chip; never true for the maximized window
  tabs: TabsState
  layout: Record<WinId, WinLayout>

  openTab: (win: WinId) => void
  closeTab: (win: WinId, id: string) => void
  activateTab: (win: WinId, id: string) => void
  reorderTab: (win: WinId, id: string, index: number) => void
  moveTab: (from: WinId, id: string, to: WinId, index: number) => void
  turnInto: (win: WinId, id: string, content: TabContent) => void
  ensureLessonTab: (content: LessonContent) => void
  setOffset: (win: WinId, offset: [number, number]) => void
  setSize: (win: WinId, size: [number, number] | null) => void
  toggleMaximize: (win: WinId) => void
  setMaximized: (win: WinId | null) => void
  minimize: (win: WinId) => void // yellow (and red) light: shrink into the restore chip
  restore: (win: WinId) => void // the chip, or the lesson needing the window: bring it back
  resetWindows: () => void
}

const defaultLayout = (): Record<WinId, WinLayout> => ({
  notes: { offset: [0, 0], size: null },
  board: { offset: [0, 0], size: null },
})

// ---- Persistence (every access guarded: storage can be missing, full or blocked)

interface Stored {
  v: 1
  tabs: TabsState
  layout: Record<WinId, WinLayout>
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
    if (raw?.v !== 1) throw new Error('version')
    const tabs = validateTabs(raw.tabs)
    if (!tabs) throw new Error('tabs')
    const l = (raw.layout ?? {}) as Partial<Record<WinId, unknown>>
    return { tabs, layout: { notes: readLayout(l.notes), board: readLayout(l.board) } }
  } catch {
    return { tabs: initialTabs(), layout: defaultLayout() }
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave(s: WindowsState) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const data: Stored = { v: 1, tabs: s.tabs, layout: s.layout }
      window.localStorage.setItem(WINDOW_UI.storageKey, JSON.stringify(data))
    } catch {
      // Private mode or a full quota: the windows still work, they just won't survive a reload.
    }
  }, WINDOW_UI.saveDebounceMs)
}

// ---- Store

export const useWindows = create<WindowsState>((set, get) => {
  // Applies a pure tab operation; no store update when it returned the same state.
  const tabsOp = (op: (s: TabsState) => TabsState) => {
    const prev = get().tabs
    const next = op(prev)
    if (next !== prev) set({ tabs: next })
  }
  const layoutOp = (win: WinId, patch: Partial<WinLayout>) => set((s) => ({ layout: { ...s.layout, [win]: { ...s.layout[win], ...patch } } }))
  // Applies a pure maximize / minimize transition (minimize.ts); no update when nothing changed.
  const winOp = (op: (s: MinState) => MinState) => {
    const { maximized, minimized } = get()
    const prev: MinState = { maximized, minimized }
    const next = op(prev)
    if (next !== prev) set({ maximized: next.maximized, minimized: next.minimized })
  }

  return {
    maximized: null,
    minimized: { notes: false, board: false },
    ...load(),

    openTab: (win) => tabsOp((s) => openNewTab(s, win)),
    closeTab: (win, id) => tabsOp((s) => closeTab(s, win, id)),
    activateTab: (win, id) => tabsOp((s) => activateTab(s, win, id)),
    reorderTab: (win, id, index) => tabsOp((s) => reorderTab(s, win, id, index)),
    moveTab: (from, id, to, index) => tabsOp((s) => moveTab(s, from, id, to, index)),
    turnInto: (win, id, content) => tabsOp((s) => turnInto(s, win, id, content)),
    ensureLessonTab: (content) => tabsOp((s) => ensureLessonTab(s, content)),

    setOffset: (win, offset) => {
      const o = get().layout[win].offset
      if (o[0] !== offset[0] || o[1] !== offset[1]) layoutOp(win, { offset })
    },
    setSize: (win, size) => {
      const s = get().layout[win].size
      if (s === size || (s && size && s[0] === size[0] && s[1] === size[1])) return
      layoutOp(win, { size })
    },
    toggleMaximize: (win) => winOp((s) => toggleMaximizeWin(s, win)),
    setMaximized: (maximized) => winOp((s) => maximizeWin(s, maximized)),
    minimize: (win) => winOp((s) => minimizeWin(s, win)),
    restore: (win) => winOp((s) => restoreWin(s, win)),
    resetWindows: () => set({ maximized: null, minimized: { notes: false, board: false }, tabs: initialTabs(), layout: defaultLayout() }),
  }
})

// Persist tabs and layout (not `maximized` or `minimized`: a reload starts with
// both windows out and the tutor in the middle).
useWindows.subscribe((s, prev) => {
  if (s.tabs !== prev.tabs || s.layout !== prev.layout) scheduleSave(s)
})
