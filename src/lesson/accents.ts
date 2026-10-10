import type { CSSProperties } from 'react'
import { PALETTE } from '../scene/layout3d'
import type { StepColor } from './walkthrough'

// The room's bold palette as CSS variables (--teal, --coral, ...) so the
// lesson UI (walkthrough bar, captions) shares one source with the 3D scene.

// Order the caption cycles through for **bold** terms.
export const ACCENT_ORDER: StepColor[] = ['teal', 'coral', 'violet', 'pink', 'indigo', 'lime', 'sun']

// Light accents need dark text on top of them.
export const INK_ON: ReadonlySet<StepColor> = new Set<StepColor>(['sun', 'lime'])

export function paletteVars(extra: Record<string, string> = {}): CSSProperties {
  const vars: Record<string, string> = {}
  for (const [name, value] of Object.entries(PALETTE)) vars[`--${name}`] = value
  return { ...vars, ...extra } as CSSProperties
}
