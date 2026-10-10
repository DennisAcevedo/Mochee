// World-space layout of the lesson room, in three.js units (Y up, +Z toward
// the camera). The single source of truth for where the floor, the tutor's
// spots, the two windows and the lesson camera are. Values are tuned by eye
// against the white-box mock; change them here, never inline.

export const FLOOR_Y = -1.55 // matches GROUND.y, so the classic character's shadow still lands on the floor

export const ROOM = {
  width: 9.4, // x from -4.7 to 4.7: wide enough that the tilted windows clear the side walls
  height: 4.9, // floor to ceiling
  depth: 12, // back wall at z = -backZ, side walls run forward past the camera's frame edges
  backZ: 7, // deep enough that the back wall is roughly the middle half of the frame
} as const

// Where the tutor stands for each Spot (root x, root z).
// Side spots sit inside the windows' inner edges and toward the camera, so at
// TUTOR_SCALE he never covers the board's quiz keys or the notes table.
export const SPOTS = {
  left: { x: -1.05, z: 1.0 },
  center: { x: 0, z: 0.6 },
  right: { x: 1.05, z: 1.0 },
} as const

// Mini browser windows, centered positions; yaw turns them toward the room's middle.
export const WINDOWS = {
  notes: { position: [-2.95, 0.45, -0.6] as [number, number, number], yaw: 0.28, width: 2.6, height: 2.35 },
  board: { position: [2.95, 0.45, -0.6] as [number, number, number], yaw: -0.28, width: 2.6, height: 2.35 },
  focusYaw: 0.14, // yaw when focused (turned further toward the camera)
  focusScale: 1.06,
} as const

// The Blender tutor's scale in the room (model units are the classic rig's: body radius 0.8).
export const TUTOR_SCALE = 0.8

// Camera for the live lesson inside the room (the intro eases into this).
export const LESSON_CAMERA = {
  fov: 40,
  position: [0, 0.55, 7.4] as [number, number, number],
  lookAt: [0, -0.12, 0] as [number, number, number], // tilted down a touch: the tutor clears the caption
  focusShift: 0.9, // how far the camera pans toward a focused window (x, world units)
} as const

// Bold accent palette for the room, the windows and the effects.
export const PALETTE = {
  teal: '#12a4b4',
  coral: '#ff6b5b',
  sun: '#ffc83d',
  violet: '#7c5cf2',
  lime: '#4cc76a',
  pink: '#ff6fae',
  indigo: '#3d5ad6',
  ink: '#1d1b24',
  wall: '#f4f3f1',
  floor: '#ecebe8',
} as const
