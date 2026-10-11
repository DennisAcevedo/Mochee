import { FLOOR_Y } from '../layout3d'
import { frameAt } from '../room/stageSpace'
import type { PaletteKey } from '../../growth/abilities'

// Placement and look of everything the growth system adds to the stage: the
// library shelf (one book per document), topic posters, the trophy shelf (one
// trophy per mastered topic), the ability props and the return experiment's
// scheduler race. The shelf islands are placed by where they land in the
// 16:9 frame (frameAt, against LESSON_CAMERA), clear of the HUD, the browser
// window, the tutor and the caption; the posters hang on the white box's back
// wall beside the study room's window.

// Shelf islands sit in the frame's lower corners (the left one below the
// browser window), turned a little toward the centre so their books read in 3D.
const LIBRARY_AT = frameAt(0.165, 0.775, 0.2)
const TROPHIES_AT = frameAt(0.835, 0.775, 0.2)

// Poster slots on the white box's back wall, right of the study room's window
// (x -1.52..1.52, world y 0.33..2.87) and above its trophy shelf (top near
// world y 1.0): three across, two rows, top row first. World units, a little
// off the wall so a poster turned toward the camera never cuts into it.
const POSTER_Z = -6.8
const POSTER_SLOTS: [number, number, number][] = [
  [2.2, 2.55, POSTER_Z],
  [3.1, 2.55, POSTER_Z],
  [4.0, 2.55, POSTER_Z],
  [2.2, 1.78, POSTER_Z],
  [3.1, 1.78, POSTER_Z],
  [4.0, 1.78, POSTER_Z],
]

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

  // Posters hang on the back wall right of the study window, facing the camera.
  posters: {
    size: [1.2, 0.86] as [number, number], // width, height
    scale: 0.68, // three fit across the wall between the window and the corner
    slots: POSTER_SLOTS,
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
// tutor's centre spot (FCFS left, SJF right), standing on the platform. A
// lane's bottom slot is the CPU; the job in it drains as it runs and the
// queue above drops into place.
export const RACE_SCENE = {
  lanes: [
    { x: -0.98, color: 'coral' as PaletteKey },
    { x: 0.98, color: 'lime' as PaletteKey },
  ],
  z: 0.35, // inside the platform's ellipse at both lanes
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
