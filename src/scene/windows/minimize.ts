import type { WinId } from './tabModel.ts'
import { WINDOW_UI } from './windowConfig.ts'

// The pure side of the window's three lights (no three, no React, so the Node
// tests read it): the store transitions for maximize (green), minimize
// (yellow) and close (red), the fold's easing and where the restore chip sits.
// Invariants: a maximized window is neither minimized nor closed, and a
// closed window is not minimized (it has no chip).

const M = WINDOW_UI.minimize

export interface MinState {
  maximized: WinId | null
  minimized: boolean // folded into its restore chip
  closed: boolean // gone, no chip, until the lesson or the Reader opens it again
}

// Folds the window into its chip. A maximized window gives the stage back first.
export function minimizeWin(s: MinState): MinState {
  if (s.minimized || s.closed) return s
  return { maximized: null, minimized: true, closed: false }
}

// Closes the window: no chip; a maximized one gives the stage back.
export function closeWin(s: MinState): MinState {
  if (s.closed) return s
  return { maximized: null, minimized: false, closed: true }
}

// Brings the window back, from its chip or from closed.
export function restoreWin(s: MinState): MinState {
  if (!s.minimized && !s.closed) return s
  return { maximized: s.maximized, minimized: false, closed: false }
}

// Maximizes `win` (null restores). A minimized or closed window comes back to be maximized.
export function maximizeWin(s: MinState, win: WinId | null): MinState {
  if (win === null) return s.maximized === null ? s : { ...s, maximized: null }
  if (s.maximized === win && !s.minimized && !s.closed) return s
  return { maximized: win, minimized: false, closed: false }
}

export const toggleMaximizeWin = (s: MinState, win: WinId): MinState => maximizeWin(s, s.maximized === win ? null : win)

// ---- Animation: the minimize progress m and the close progress c both run
// 0 (window) -> 1 (chip / gone) linearly in time.

// Ease in-out cubic: the window gathers speed into the chip and settles out of it.
export function minimizeEase(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

// The window's scale at close progress c: it shrinks into its own centre.
export function closeScale(c: number): number {
  return 1 + (WINDOW_UI.close.scale - 1) * minimizeEase(c)
}

// How much of the chip shows at progress m: none until the window is mostly
// folded, then in quickly with a little overshoot-free ease out.
export function chipReveal(m: number): number {
  if (m <= M.chipFrom) return 0
  const k = Math.min(1, (m - M.chipFrom) / (1 - M.chipFrom))
  return 1 - (1 - k) ** 3
}

// ---- Chip placement (CSS px, viewport coordinates)

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ChipPlace {
  x: number // from the host's left edge
  bottom: number // from the host's bottom edge to the chip's bottom
  maxW: number
}

// The window stands left of the tutor, so its chip sits on the left end of
// the bottom bar (`dock`) and just above it, or in the stage frame's
// bottom-left corner without one. A caption in the way narrows the chip; when
// that would leave less than minW, the chip sits above the caption.
export function chipPlace(host: Box, frame: Box | null, dock: Box | null, caption: Box | null, chipH: number): ChipPlace {
  const C = M.chip
  const b = frame ?? host
  const edge = dock ? dock.left : b.left + C.pad
  let bottom = dock ? dock.top - C.gap : b.bottom - C.pad
  let maxW: number = C.maxW
  if (caption && caption.right > caption.left && caption.top < bottom + C.gap && bottom - chipH < caption.bottom + C.gap) {
    const room = caption.left - C.gap - edge
    if (room >= C.minW) maxW = Math.min(maxW, room)
    else bottom = caption.top - C.gap
  }
  return { x: edge - host.left, bottom: host.bottom - bottom, maxW }
}
