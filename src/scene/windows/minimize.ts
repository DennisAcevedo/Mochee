import type { WinId } from './tabModel.ts'
import { WINDOW_UI } from './windowConfig.ts'

// The pure side of minimizing a window (no three, no React, so the Node tests
// read it): the store transitions, the shrink's easing and where the restore
// chip sits. Invariant: a maximized window is never minimized.

const M = WINDOW_UI.minimize

export interface MinState {
  maximized: WinId | null
  minimized: Record<WinId, boolean>
}

// Folds `win` into its chip. A maximized window gives the stage back first.
export function minimizeWin(s: MinState, win: WinId): MinState {
  if (s.minimized[win]) return s
  return { maximized: s.maximized === win ? null : s.maximized, minimized: { ...s.minimized, [win]: true } }
}

// Brings `win` back from its chip, in front: a maximized other window steps back.
export function restoreWin(s: MinState, win: WinId): MinState {
  if (!s.minimized[win]) return s
  return { maximized: s.maximized && s.maximized !== win ? null : s.maximized, minimized: { ...s.minimized, [win]: false } }
}

// Maximizes `win` (null restores). A minimized window comes back to be maximized.
export function maximizeWin(s: MinState, win: WinId | null): MinState {
  const unfold = win !== null && s.minimized[win]
  if (s.maximized === win && !unfold) return s
  return { maximized: win, minimized: unfold ? { ...s.minimized, [win]: false } : s.minimized }
}

export const toggleMaximizeWin = (s: MinState, win: WinId): MinState => maximizeWin(s, s.maximized === win ? null : win)

// ---- Animation: progress m runs 0 (window) -> 1 (chip) linearly in time.

// Ease in-out cubic: the window gathers speed into the chip and settles out of it.
export function minimizeEase(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
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
  side: 'left' | 'right'
  x: number // from the host's left edge (left chip) or right edge (right chip)
  bottom: number // from the host's bottom edge to the chip's bottom
  maxW: number
}

// Notes on the left, board on the right: each chip on its own window's side,
// on the end of the bottom bar (`dock`) and just above it, or in the stage
// frame's bottom corner without one. A caption in the way narrows the chip;
// when that would leave less than minW, the chip sits above the caption.
export function chipPlace(win: WinId, host: Box, frame: Box | null, dock: Box | null, caption: Box | null, chipH: number): ChipPlace {
  const C = M.chip
  const side = win === 'notes' ? 'left' : 'right'
  const b = frame ?? host
  const edgeL = dock ? dock.left : b.left + C.pad
  const edgeR = dock ? dock.right : b.right - C.pad
  let bottom = dock ? dock.top - C.gap : b.bottom - C.pad
  let maxW: number = C.maxW
  if (caption && caption.right > caption.left && caption.top < bottom + C.gap && bottom - chipH < caption.bottom + C.gap) {
    const room = side === 'left' ? caption.left - C.gap - edgeL : edgeR - (caption.right + C.gap)
    if (room >= C.minW) maxW = Math.min(maxW, room)
    else bottom = caption.top - C.gap
  }
  return {
    side,
    x: side === 'left' ? edgeL - host.left : host.right - edgeR,
    bottom: host.bottom - bottom,
    maxW,
  }
}
