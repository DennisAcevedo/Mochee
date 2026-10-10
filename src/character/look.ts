import { Color } from 'three'

// Customization from design/tutor-3d.js (cap, accessory, acccolor attributes).

export type Accessory = 'none' | 'glasses' | 'leaf' | 'mic' | 'bowtie' | 'headphones' | 'scarf' | 'pencil'

export interface TutorLook {
  cap: string // hex, '' = the default indigo gradient
  accessory: Accessory
  accColor: string // hex, '' = the accessory's default
}

export const DEFAULT_LOOK: TutorLook = { cap: '', accessory: 'none', accColor: '' }

// tutor-3d.js accMats defaults: the colour each accessory has when acccolor is unset.
export const ACCESSORY_DEFAULT_COLORS: Record<Exclude<Accessory, 'none'>, string> = {
  glasses: '#2b2b33',
  leaf: '#62b46e',
  mic: '#5cc4c9',
  bowtie: '#7c5cf2',
  headphones: '#e0607a',
  scarf: '#f2b84b',
  pencil: '#5cc4c9',
}

// tutor-3d.js treats 'beaker' as the mic.
export function normalizeAccessory(a: string | undefined): Accessory {
  if (a === 'beaker') return 'mic'
  return (a && a in ACCESSORY_DEFAULT_COLORS ? a : 'none') as Accessory
}

export interface CapColors {
  skull: [Color, Color]
  board: [Color, Color]
}

// applyLook() in tutor-3d.js: skull from 0.8x to 1x the colour, board from
// 0.92x to the colour lifted 15% toward white. '' keeps the indigo gradient.
export function capColors(cap: string): CapColors {
  let base: Color | null = null
  if (cap) {
    try {
      base = new Color(cap)
    } catch {
      base = null
    }
  }
  if (!base) {
    return {
      skull: [new Color(0x3d5ad6), new Color(0x6a4fd0)],
      board: [new Color(0x5a4cc8), new Color(0x7a5ce0)],
    }
  }
  return {
    skull: [base.clone().multiplyScalar(0.8), base.clone()],
    board: [base.clone().multiplyScalar(0.92), base.clone().lerp(new Color(0xffffff), 0.15)],
  }
}
