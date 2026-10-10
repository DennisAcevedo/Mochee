import { FLOOR_Y, ROOM } from '../layout3d'
import type { PaletteKey } from '../../growth/abilities'

// Placement and look of everything the growth system adds to the room: the
// library shelf (one book per document), topic posters on the upper side
// walls, the trophy shelf (one trophy per mastered topic), the ability props
// and the return experiment's scheduler race. Positions are world units and
// are chosen to stay clear of the two windows and the
// tutor's walking line (tuned against LESSON_CAMERA at 16:9).

const BACK_Z = -ROOM.backZ
const HALF_W = ROOM.width / 2
const CEIL_Y = FLOOR_Y + ROOM.height

export const EVOLUTION = {
  // Library: a floating shelf on the back wall, upper left of the arch.
  library: {
    position: [-1.75, 1.6, BACK_Z + 0.16] as [number, number, number], // shelf top centre
    width: 2.3,
    plank: { height: 0.08, depth: 0.26, color: '#ffffff', edge: 'violet' as PaletteKey },
    book: { width: 0.24, gap: 0.04, depth: 0.22, heights: [0.72, 0.64, 0.78, 0.68, 0.6], spineText: 0.07 },
    colors: ['violet', 'teal', 'coral', 'sun', 'indigo', 'lime', 'pink'] as PaletteKey[],
    max: 7, // books beyond this are left off the shelf
    plaque: { text: 'LIBRARY', size: 0.1, dy: -0.17 },
  },

  // Trophies: a matching shelf upper right of the arch, a pedestal per trophy.
  trophies: {
    position: [1.75, 1.6, BACK_Z + 0.16] as [number, number, number],
    width: 2.3,
    plank: { height: 0.08, depth: 0.26, color: '#ffffff', edge: 'sun' as PaletteKey },
    pedestal: { width: 0.4, height: 0.2, color: '#ffffff', band: 'indigo' as PaletteKey },
    cup: { color: '#f2b51e', metalness: 0.85, roughness: 0.22, scale: 0.5 },
    spacing: 0.54,
    max: 4,
    plaque: { text: 'TROPHIES', size: 0.1, dy: -0.17 },
  },

  // Posters on the upper side walls: above the windows on screen, below the
  // ceiling. Slots fill left wall then right wall, front to back.
  posters: {
    size: [1.2, 0.86] as [number, number], // along the wall (z), height
    y: CEIL_Y - 0.9, // centre height
    wallInset: 0.012,
    slots: [
      { side: -1, z: -2.4 },
      { side: 1, z: -2.4 },
      { side: -1, z: -3.85 },
      { side: 1, z: -3.85 },
      { side: -1, z: -5.3 },
      { side: 1, z: -5.3 },
    ] as { side: -1 | 1; z: number }[],
    halfWidth: HALF_W,
    frame: 0.07,
    colors: ['violet', 'coral', 'teal', 'indigo', 'pink', 'lime'] as PaletteKey[],
    keyword: { size: 0.22, maxWidth: 1.0, charWidth: 0.6 }, // size shrinks so the keyword fits on one line
    title: { size: 0.07, maxWidth: 1.0 },
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

// The return experiment's scheduler race: two vertical lanes flanking the
// tutor's centre spot (FCFS left, SJF right). A lane's bottom slot is the CPU;
// the job in it drains as it runs and the queue above drops into place.
export const RACE_SCENE = {
  lanes: [
    { x: -1.22, color: 'coral' as PaletteKey },
    { x: 1.22, color: 'lime' as PaletteKey },
  ],
  z: -0.15,
  baseY: FLOOR_Y + 0.08, // top of the CPU plate
  width: 0.62,
  unit: 0.05, // block height per ms of burst
  minHeight: 0.14,
  gap: 0.035,
  panel: { pad: 0.12, height: 0.62, opacity: 0.9, radius: 0.08 }, // header card behind title + readouts
  rail: { width: 0.025, color: 'ink' as const, opacity: 0.18 },
  title: { y: 1.12, size: 0.15 },
  avg: { y: 0.92, size: 0.085 },
  waits: { y: 0.8, size: 0.06 },
  clock: { y: 1.55, size: 0.13 },
  label: 0.075,
  cpu: { height: 0.07, color: 'ink' as const },
  skip: { y: 1.95 },
  inFor: 0.45, // scale-in seconds
  outFor: 0.4,
  startDelay: 0.8, // seconds after the lesson goes live before a pending experiment starts
} as const
