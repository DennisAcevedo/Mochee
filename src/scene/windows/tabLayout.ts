import { WINDOW_UI } from './windowConfig.ts'

// Pure geometry of a tab strip (no React, no three; unit-tested in
// tests/ui/tabs.test.ts). Tabs pack from the left like Chrome: they share the
// strip up to a max width, shrink evenly as more open, and the + button rides
// right after the last one.

const T = WINDOW_UI.tabs

export interface StripSpan {
  left: number // x where the first tab starts (window-local)
  right: number // x where the strip's usable area ends
}

// Width every live tab gets when `count` tabs share the strip. Below
// T.minW tabs keep shrinking (never overlap) instead of overflowing.
export function tabTargetWidth(count: number, span: StripSpan): number {
  if (count <= 0) return T.maxW
  const room = span.right - span.left - T.plus.size - T.plus.gap
  const w = (room - T.gap * (count - 1)) / count
  return Math.max(0.04, Math.min(T.maxW, w))
}

export type TabLook = 'full' | 'compact' | 'tiny'

// full: dot + title + x (on hover or active); compact: x only on the active
// tab; tiny: just the dot, or just the x on the active tab.
export function tabLook(width: number): TabLook {
  if (width < T.tinyW) return 'tiny'
  return width < T.narrowW ? 'compact' : 'full'
}

export function closeShown(width: number, active: boolean, hover: boolean): boolean {
  if (active) return true
  return hover && tabLook(width) === 'full'
}

// Slot a dragged tab lands in when its centre is at `center` among `count`
// equal tabs (the dragged one included). Swaps once it passes a neighbour's middle.
export function slotIndex(center: number, span: StripSpan, width: number, count: number): number {
  if (count <= 1) return 0
  const i = Math.round((center - span.left - width / 2) / (width + T.gap))
  return Math.max(0, Math.min(count - 1, i))
}

// Insertion index when dropping into a strip that has `count` tabs of `width`
// at pointer x: 0..count (between tabs).
export function dropIndex(x: number, span: StripSpan, width: number, count: number): number {
  const i = Math.round((x - span.left) / (width + T.gap))
  return Math.max(0, Math.min(count, i))
}

// Rough Figtree-bold advance per character, in ems: titles ellipsize to fit.
const CHAR_EM = 0.56

export function ellipsize(text: string, width: number, size: number): string {
  if (width <= 0) return ''
  const max = Math.floor(width / (size * CHAR_EM))
  if (max <= 1) return ''
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…'
}

// Size step and clamping for live resizes. Pass `out` to reuse a tuple per frame.
const quantize = (v: number, lo: number, hi: number) => {
  const step = WINDOW_UI.window.sizeStep
  const q = Math.round(Math.max(lo, Math.min(hi, v)) / step) * step
  return Math.round(q * 1e4) / 1e4 // drop float dust (1.9000000000000001)
}
export function clampSize(w: number, h: number, out: [number, number] = [0, 0]): [number, number] {
  const [minW, minH] = WINDOW_UI.window.minSize
  const [maxW, maxH] = WINDOW_UI.window.maxSize
  out[0] = quantize(w, minW, maxW)
  out[1] = quantize(h, minH, maxH)
  return out
}
