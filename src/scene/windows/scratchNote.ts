import { useWindows } from '../../state/windows.ts'
import type { WinId } from './tabModel.ts'
import { WINDOW_UI } from './windowConfig.ts'

// The window's Scratch note text in localStorage (ScratchPage.tsx edits it).
// The red light discards it: the store's close() removes the key at once,
// and a scratch page that was open before that close never saves again,
// whatever order React runs things in. Its unmount save (after the tab is
// dropped), a debounced keystroke save still pending, or a save after the
// window has already reopened would otherwise write the note straight back.
// No React, no three: tests/ui/minimize.test.ts loads it under plain Node.

const storageKey = (win: WinId) => WINDOW_UI.scratchKey + win

// Counts the window's closes; a page remembers the count it opened under.
let closes = 0
useWindows.subscribe((s, p) => {
  if (s.closed && !p.closed) closes++
})

export const noteEpoch = (): number => closes

export function loadNote(win: WinId): string {
  try {
    return window.localStorage.getItem(storageKey(win)) ?? ''
  } catch {
    return ''
  }
}

// `epoch`: noteEpoch() when the page opened. A close since then discarded the note.
export function saveNote(win: WinId, text: string, epoch: number) {
  if (epoch !== closes || useWindows.getState().closed) return
  try {
    window.localStorage.setItem(storageKey(win), text)
  } catch {
    // Private mode or a full quota: the note lasts until the tab closes.
  }
}
