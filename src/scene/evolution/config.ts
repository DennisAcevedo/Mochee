import { frameAt } from '../room/stageSpace'
import type { PaletteKey } from '../../growth/abilities'

// Placement and look of everything the growth system adds to the stage: the
// library shelf (one book per document), the trophy shelf (one trophy per
// mastered topic), the ability props and the return experiment's
// Skip pill. The shelf islands are placed by where they land in the
// 16:9 frame (frameAt, against LESSON_CAMERA), clear of the HUD, the browser
// window, the tutor and the caption.

// Shelf islands sit in the frame's lower corners (the left one below the
// browser window), turned a little toward the centre so their books read in 3D.
const LIBRARY_AT = frameAt(0.165, 0.775, 0.2)
const TROPHIES_AT = frameAt(0.835, 0.775, 0.2)

export const EVOLUTION = {
  // Library: a floating shelf island, lower left.
  library: {
    position: LIBRARY_AT, // shelf top centre
    yaw: 0.32, // toward the frame centre
    scale: 0.68,
    width: 2.3,
    plank: { height: 0.08, depth: 0.26, color: '#ffffff', edge: 'violet' as PaletteKey },
    book: { width: 0.24, gap: 0.04, depth: 0.22, heights: [0.72, 0.64, 0.78, 0.68, 0.6], spineText: 0.07 },
    colors: ['violet', 'teal', 'coral', 'sun', 'indigo', 'lime', 'pink'] as PaletteKey[],
    max: 7, // books beyond this are left off the shelf
    plaque: { text: 'LIBRARY', size: 0.12, dy: -0.2 }, // under the shelf's front edge
  },

  // Trophies: the matching island, lower right, a pedestal per trophy.
  trophies: {
    position: TROPHIES_AT,
    yaw: -0.32,
    scale: 0.68,
    width: 2.3,
    plank: { height: 0.08, depth: 0.26, color: '#ffffff', edge: 'sun' as PaletteKey },
    pedestal: { width: 0.4, height: 0.2, color: '#ffffff', band: 'indigo' as PaletteKey },
    cup: { color: '#f2b51e', metalness: 0.85, roughness: 0.22, scale: 0.5 },
    spacing: 0.54,
    max: 4,
    plaque: { text: 'TROPHIES', size: 0.12, dy: -0.2 },
  },

  // New items pop in: a damped spring on scale plus a sparkle burst.
  pop: { stiffness: 14, damping: 0.42, stagger: 0.09, sparkles: 14, sparkleLife: 0.9, sparkleSpeed: 1.6, sparkleSize: 0.05 },
} as const

// Ability props, relative to the tutor's head anchor (anchors.tutor) and hands.
export const PROPS = {
  block: { size: 0.3, radius: 0.05, label: 0.11 },
  front: 0.62, // routines run this far in front of his head anchor, clear of his body
  popIn: 0.25, // seconds to scale in
  popOut: 0.3, // seconds to scale out at the end
  juggle: { rate: 1.25, halfSpan: 0.42, lift: 0.18, arc: 0.85, lineupAt: 1.55, lineupFor: 0.45, lineY: 0.42, lineGap: 0.3, tadaAt: 2.0 },
  orbit: { radius: 0.6, y: 0.15, rate: 0.55, turn: 0.55, lift: 0.22 },
  sort: { y: 0.42, unit: 0.022, minWidth: 0.22, gap: 0.06, sortAt: 0.9, sortFor: 0.6, hop: 0.3, appearEvery: 0.18 },
  stack: { dropFrom: 1.4, every: 0.38, fall: 0.3, y: 0.1, popAt: 1.55, popFor: 0.6 },
  bounce: { dx: 0.75, dz: 0.45, dropFrom: 1.6, radius: 0.13, gravity: 9.8, restitution: 0.62, catchAt: 1.9, catchFor: 0.25 },
  flip: { y: 0.45, rise: 0.4, turns: 2, flipFor: 1.4, size: [0.34, 0.26, 0.07] as [number, number, number] },
} as const

// The return experiment's Skip pill, above the stage where the tutor performs.
export const EXPERIMENT_SCENE = {
  z: 0.35,
  skip: { y: 1.95 },
  startDelay: 0.8, // seconds after the lesson goes live before a pending experiment starts
} as const
