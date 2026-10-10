// World-space layout of the lesson stage, in three.js units (Y up, +Z toward
// the camera). The single source of truth for where the floor, the tutor's
// spots, the platform, the two windows and the lesson camera are. Values are
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
// between them (x -1.05..1.05); the platform covers all of it.
// Side spots sit inside the windows' inner edges and toward the camera, so at
// TUTOR_SCALE he never covers the board's quiz keys or the notes table.
export const SPOTS = {
  left: { x: -1.05, z: 1.0 },
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

// Mini browser windows, centered positions; yaw turns them toward the stage's
// middle. The defaults put them where the mock does (left 3%..33% and right
// 67%..97% of the frame, 18%..62% down); the windows store keeps the student's
// drag offsets and sizes on top of these.
export const WINDOWS = {
  notes: { position: [-3.15, 0.4, -0.3] as [number, number, number], yaw: 0.28, width: 2.6, height: 2.35 },
  board: { position: [3.15, 0.4, -0.3] as [number, number, number], yaw: -0.28, width: 2.6, height: 2.35 },
  focusYaw: 0.14, // yaw when focused (turned further toward the camera)
  focusScale: 1.06,
} as const

// The Blender tutor's scale on the stage (model units are the classic rig's: body radius 0.8).
export const TUTOR_SCALE = 0.8

// Camera for the live lesson (the intro eases into this). CameraRig renders
// it into the 16:9 stage frame, so these numbers fix the whole composition.
export const LESSON_CAMERA = {
  fov: 40,
  position: [0, 0.55, 7.4] as [number, number, number],
  lookAt: [0, -0.12, 0] as [number, number, number], // tilted down a touch: the tutor clears the caption
  aspect: 16 / 9, // the stage frame's aspect (LessonPage letterboxes the stage to it)
  focusShift: 0.9, // how far the camera pans toward a focused window (x, world units)
} as const

// Where the lesson camera pans (x, world units): toward the focused window,
// but held centred while a window is maximized, because the maximized
// placement is fitted to the resting camera (a pan would slide it off centre).
// CameraRig eases to this; the tutor's aside spot is worked out against it.
export function cameraPan(focus: string | null, maximized: string | null): number {
  if (maximized) return 0
  return focus === 'notes' ? -LESSON_CAMERA.focusShift : focus === 'board' ? LESSON_CAMERA.focusShift : 0
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
