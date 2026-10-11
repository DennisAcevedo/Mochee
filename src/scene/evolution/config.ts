import { frameAt } from '../room/stageSpace'
import type { PaletteKey } from '../room/roomStyle'

// Placement and look of everything the growth system adds to the stage: the
// library shelf (one book per document), the trophy shelf (one trophy per
// mastered topic). The shelf islands are placed by where they land in the
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

