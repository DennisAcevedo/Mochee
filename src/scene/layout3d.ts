// World-space layout of the lesson stage, in three.js units (Y up, +Z toward
// the camera). The single source of truth for where the floor, the tutor's
// spots, the platform, the browser window and the lesson camera are. Values are
// tuned by eye against design/sparkle-stage/Main.dc.html in its 16:9 frame;
// change them here, never inline.

export const FLOOR_Y = -1.55 // matches GROUND.y, so the classic character's shadow still lands on the floor

// The stage's invisible volume. Nothing draws its walls any more (the sparkle
// stage is open sky); physics keeps them as bounds and the party lights hang
// from its top.
export const ROOM = {
  width: 9.4, // x from -4.7 to 4.7
  height: 4.9, // floor to the light truss
  depth: 12, // back bound at z = -backZ
  backZ: 7,
} as const

// Where the tutor stands for each Spot (root x, root z). He roams the lane
// between them (x -0.74..1.05); the platform covers all of it.
// The left spot is where he teaches from, beside the browser window, just
// clear of its bottom-right corner (the resize grip) in the camera's focused
// pan: from x -0.74 his body's side (TUTOR_OUTLINE_LEFT) stays about 5 px
// clear of that corner at 1456 x 785 (from -0.8 it sat 4 px inside), so at
// TUTOR_SCALE he never covers the grip, the quiz keys or the notes table.
export const SPOTS = {
  left: { x: -0.74, z: 1.0 },
  center: { x: 0, z: 0.6 },
  right: { x: 1.05, z: 1.0 },
} as const

// The white platform with the rainbow rim under the tutor. An ellipse on the
// floor (rx across, rz in depth): from the camera it reads as the mock's flat
// disc, and it holds him at every spot with room for his feet.
export const PLATFORM = {
  x: 0,
  z: 0.7,
  rx: 1.5,
  rz: 1.05,
  thickness: 0.16, // the platform's top sits on FLOOR_Y, its body hangs below
} as const

// The mini browser window: centred position; yaw turns it toward the stage's
// middle. It stands left of the tutor, over the left 1.5%..34% of the frame
// and 18%..64% down (NDC x -0.97..-0.32, y -0.29..0.64 at rest; focused, with
// the camera panned to it, x -0.82..-0.13, y -0.32..0.67), clear of the play
// HUD, the caption and the bottom bar, with the right of the stage left free.
// The windows store keeps the student's drag offset and size on top.
export const WINDOW = { position: [-3.15, 0.33, -0.45] as [number, number, number], yaw: 0.26, width: 3.0, height: 2.5 } as const

export const WINDOWS = {
  notes: WINDOW,
  board: WINDOW, // the old right window's name: the one window (physics/config.ts still lists both)
  focusYaw: 0.14, // yaw when focused (turned further toward the camera)
  focusScale: 1.06,
} as const

// The Blender tutor's scale on the stage (model units are the classic rig's: body radius 0.8).
export const TUTOR_SCALE = 0.8

// The left edge of his settled idle outline at TUTOR_SCALE, from head to
// knee: per height, the point that reaches furthest left on screen, relative
// to his root (dx, dz from the root, up above the floor). Measured in the
// browser over every skinned vertex while he idles at the left spot. The body's
// side at up 0.86 is what meets the window's bottom-right corner (the resize
// grip); the hand at up 0.62 reaches further but passes under the window.
// tests/ui/windowPlace.test.ts keeps the window clear of all of them.
export const TUTOR_OUTLINE_LEFT = [
  { dx: -0.51, up: 1.57, dz: 0.05 },
  { dx: -0.45, up: 1.25, dz: 0.02 },
  { dx: -0.58, up: 1.07, dz: 0.07 },
  { dx: -0.64, up: 0.86, dz: 0.04 },
  { dx: -0.89, up: 0.62, dz: 0.23 },
  { dx: -0.8, up: 0.45, dz: 0.26 },
] as const

// Camera for the live lesson (the intro eases into this). CameraRig renders
// it into the 16:9 stage frame, so these numbers fix the whole composition.
export const LESSON_CAMERA = {
  fov: 40,
  position: [0, 0.55, 7.4] as [number, number, number],
  lookAt: [0, -0.12, 0] as [number, number, number], // tilted down a touch: the tutor clears the caption
  aspect: 16 / 9, // the stage frame's aspect (LessonPage letterboxes the stage to it)
  focusShift: 0.9, // how far the camera pans toward the window when it has focus (x, world units)
} as const

// Where the lesson camera pans (x, world units): left toward the window
// whenever the tutor focuses it (the notes, the board and the quiz all live
// there now), but held centred while it is maximized, because the maximized
// placement is fitted to the resting camera (a pan would slide it off centre).
// CameraRig eases to this; the tutor's aside spot is worked out against it.
export function cameraPan(focus: string | null, maximized: string | null): number {
  if (maximized) return 0
  return focus && focus !== 'none' ? -LESSON_CAMERA.focusShift : 0
}

// Bold accent palette for the stage, the windows and the effects.
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

// Google's four colours, for the platform's rainbow rim.
export const GEMINI = {
  blue: '#4285f4',
  red: '#ea4335',
  yellow: '#fbbc04',
  green: '#34a853',
} as const
