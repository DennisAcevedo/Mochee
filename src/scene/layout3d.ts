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
// between them (x -0.2..1.05); the platform covers all of it.
// The left spot is where he teaches from, beside the browser window. What
// tests/ui/windowPlace.test.ts checks, with the camera in its focused pan:
// standing here, each measured outline in TUTOR_OUTLINES (idle, talk, the
// point_left loop he teaches in, the hop, levelup and celebrate one-shots,
// the dances and the wrong-answer shrugs) stays outside the window's focus
// ring. The pointing hand is the tight one, about 1 px clear at 1456 x 785
// (the test asks for 0.004 NDC, about 2 px, in its model of the ring); most
// of the rest clear by 10 px or more. Two dances do not: see
// WINDOW_TIGHT_POSES. Left of here his pointing hand reaches into the
// window's bottom-right corner (from the old spot x -0.74 it covered the page
// footer by 24 px). The roam lane starts here too (CharacterDirector's
// laneMin), so roaming keeps the same clearance.
export const SPOTS = {
  left: { x: -0.2, z: 1.0 },
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
// middle. It stands left of the tutor, over the left edge of the frame to
// about a third across (NDC x up to -0.3 at rest), clear of the play HUD, the
// caption and the bottom bar, with the right of the stage left free.
// Focused (turned to focusYaw, focusScale 1, lifted toward the camera) its
// focus ring spans world x -4.60..-1.52: inside the room's left wall
// (-ROOM.width / 2) and the Blender study room's left rail (face at x -4.62),
// which a larger focused window used to cut through. BLENDER/rooms/contract.py
// mirrors these numbers in APP['window'].
// The windows store keeps the student's drag offset and size on top.
export const WINDOW = { position: [-3.06, 0.33, -0.45] as [number, number, number], yaw: 0.26, width: 2.98, height: 2.5 } as const

export const WINDOWS = {
  focusYaw: 0.14, // yaw when focused (turned further toward the camera)
  focusScale: 1.0, // no zoom when focused: a bigger window would cross the wall and the rail
} as const

// The Blender tutor's scale on the stage (model units are the classic rig's: body radius 0.8).
export const TUTOR_SCALE = 0.8

// The left edge of his outline at TUTOR_SCALE, per pose: for each 0.2 m height
// band, the point that projects furthest left with the camera in its focused
// pan, plus the point that reaches deepest toward the window. Relative to his
// root (dx, dz from the root, up above the floor; for the one-shots `up`
// includes the jump). Measured in the browser (GPU, ~60 fps, 140..230 frames
// a clip) over every skinned vertex on every frame of each clip at 1456 x 785
// and 1280 x 720 (1 cm grid). In point_left the pointing hand is the -1.2
// group at up 0.79..1.0. tests/ui/windowPlace.test.ts keeps the focused
// window clear of all of them at SPOTS.left. Re-measure when a clip or
// TUTOR_SCALE changes.
type OutlinePoint = { readonly dx: number; readonly up: number; readonly dz: number }
const outline = (pts: readonly (readonly [number, number, number])[]): readonly OutlinePoint[] => pts.map(([dx, up, dz]) => ({ dx, up, dz }))
export const TUTOR_OUTLINES = {
  idle: outline([[-0.31, 0.05, 0.08], [-0.52, 0.39, -0.09], [-0.89, 0.6, 0.25], [-0.9, 0.65, 0.24], [-0.89, 0.7, 0.21], [-0.64, 0.8, -0.05], [-0.61, 1.0, -0.08], [-0.52, 1.21, -0.01], [-0.52, 1.57, -0.06], [-0.52, 1.6, -0.06]]),
  talk: outline([[-0.31, 0.05, 0.08], [-0.54, 0.39, 0.02], [-0.88, 0.6, 0.3], [-0.89, 0.68, 0.3], [-0.87, 0.74, 0.27], [-0.81, 0.8, 0.32], [-0.61, 1.0, -0.07], [-0.52, 1.21, -0.06], [-0.53, 1.56, -0.06], [-0.52, 1.6, -0.11]]),
  point_left: outline([[-0.31, 0.05, 0.08], [-0.52, 0.39, -0.09], [-0.62, 0.6, -0.07], [-1.23, 0.79, 0.15], [-1.24, 0.84, 0.13], [-1.22, 0.9, 0.13], [-1.1, 1.0, 0.18], [-0.49, 1.21, -0.07], [-0.51, 1.56, -0.05], [-0.5, 1.6, -0.05]]),
  hop: outline([[-0.31, 0.05, 0.08], [-0.83, 0.39, 0.22], [-0.94, 0.6, 0.24], [-0.97, 0.79, 0.24], [-0.98, 0.99, 0.25], [-0.98, 1.03, 0.25], [-0.98, 1.08, 0.25], [-0.97, 1.21, 0.25], [-0.61, 1.4, -0.07], [-0.52, 1.66, -0.06], [-0.51, 1.98, -0.05], [-0.51, 2.0, -0.05]]),
  levelup: outline([[-0.31, 0.05, 0.08], [-0.84, 0.39, 0.31], [-0.9, 0.6, 0.23], [-0.92, 0.79, 0.25], [-0.94, 0.99, 0.25], [-0.97, 1.19, 0.25], [-0.99, 1.35, 0.25], [-0.99, 1.37, 0.25], [-0.98, 1.41, 0.25], [-0.63, 1.67, -0.07], [-0.55, 1.8, -0.09], [-0.54, 2.0, 0.21], [-0.74, 2.4, 0.11], [-0.75, 2.48, 0.18]]),
  celebrate: outline([[-0.31, 0.05, 0.08], [-0.85, 0.39, 0.23], [-0.89, 0.6, 0.25], [-0.89, 0.79, 0.24], [-0.89, 0.98, 0.24], [-0.89, 1.18, 0.26], [-0.9, 1.39, 0.27], [-0.9, 1.42, 0.27], [-0.82, 1.79, 0.05], [-0.84, 1.85, 0.04], [-0.65, 2.0, 0.02], [-0.47, 2.2, 0.25]]),
  // The right-answer dances (CELEBRATIONS) and the wrong-answer shrug with its variants.
  dance_bounce: outline([[-0.41, 0.06, 0.08], [-0.58, 0.39, -0.08], [-0.89, 0.6, 0.25], [-0.95, 0.79, 0.31], [-1.09, 0.98, 0.3], [-1.1, 1.0, 0.28], [-1.1, 1.02, 0.26], [-0.61, 1.36, 0.05], [-0.6, 1.41, 0.05], [-0.55, 1.6, 0.05]]),
  dance_spin: outline([[-0.39, 0.07, 0.08], [-0.58, 0.38, -0.07], [-1.13, 0.6, 0.31], [-1.23, 0.79, 0.18], [-1.25, 0.84, 0.17], [-1.22, 0.93, 0.16], [-1.16, 1.0, 0.21], [-0.6, 1.21, -0.08], [-0.8, 1.54, 0.11], [-0.69, 1.6, -0.04], [-0.56, 1.81, 0.03], [0.23, 2.0, -0.33]]),
  dance_robot: outline([[-0.73, 0.19, 0.35], [-0.87, 0.39, 0.3], [-1.18, 0.57, 0.18], [-1.17, 0.79, 0.24], [-1.17, 0.82, 0.24], [-1.16, 0.86, 0.2], [-1.09, 1.01, 0.25], [-0.56, 1.36, 0.1], [-0.67, 1.44, -0.01], [-0.52, 1.6, -0.05]]),
  dance_shuffle: outline([[-0.54, 0.07, 0.08], [-1.16, 0.39, -0.01], [-1.27, 0.53, -0.01], [-1.24, 0.61, 0.02], [-1.1, 0.77, 0.19], [-1.07, 0.8, 0.3], [-0.99, 1.0, 0.27], [-0.98, 1.21, 0.38], [-0.79, 1.42, -0.21], [-0.76, 1.63, -0.16], [-0.48, 1.8, -0.14]]),
  dance_wave: outline([[-0.31, 0.05, 0.08], [-0.54, 0.39, -0.01], [-0.93, 0.6, 0.24], [-1.16, 0.79, 0.2], [-1.2, 0.89, 0.21], [-1.19, 0.95, 0.19], [-1.18, 1.0, 0.19], [-1.12, 1.21, 0.23], [-0.89, 1.4, 0.3], [-0.54, 1.6, -0.06], [-0.49, 1.8, -0.13]]),
  dance_floss: outline([[-0.31, 0.05, 0.08], [-1.14, 0.39, 0.03], [-1.17, 0.47, 0.01], [-1.07, 0.72, 0.18], [-1.04, 0.94, 0.23], [-1.04, 0.97, 0.22], [-1.04, 0.98, 0.2], [-1.03, 1.0, 0.22], [-1.0, 1.23, 0.3], [-0.97, 1.41, 0.31], [-0.52, 1.6, -0.09], [-0.47, 1.8, -0.11]]),
  dance_disco: outline([[-0.55, 0.19, 0.69], [-0.6, 0.39, 0.0], [-0.92, 0.57, 0.15], [-0.91, 0.62, 0.2], [-0.9, 0.8, 0.19], [-0.89, 1.05, 0.24], [-0.88, 1.38, 0.28], [-0.88, 1.59, 0.27], [-0.88, 1.61, 0.28], [-0.94, 1.96, 0.24], [-0.94, 1.98, 0.24], [-0.93, 2.0, 0.26]]),
  dance_twist: outline([[-0.33, 0.08, 0.06], [-0.59, 0.39, -0.05], [-1.05, 0.59, -0.06], [-1.05, 0.63, -0.06], [-0.97, 0.99, 0.32], [-1.04, 1.16, 0.3], [-1.04, 1.18, 0.3], [-1.03, 1.21, 0.31], [-0.55, 1.4, -0.05], [-0.52, 1.6, -0.05]]),
  shrug: outline([[-0.31, 0.05, 0.08], [-0.53, 0.39, -0.06], [-0.92, 0.6, 0.28], [-1.03, 0.79, 0.38], [-1.05, 0.83, 0.35], [-1.04, 0.87, 0.33], [-0.62, 1.0, -0.04], [-0.55, 1.21, -0.05], [-0.59, 1.59, -0.11], [-0.59, 1.61, -0.11], [-0.47, 1.8, -0.15]]),
  emote_facepalm: outline([[-0.31, 0.05, 0.08], [-0.71, 0.39, 0.44], [-0.9, 0.6, 0.23], [-0.98, 0.79, 0.37], [-1.0, 0.85, 0.36], [-1.0, 0.89, 0.34], [-0.72, 1.0, 0.47], [-0.52, 1.21, -0.06], [-0.53, 1.43, 0.13], [-0.52, 1.6, -0.05]]),
  emote_headshake: outline([[-0.31, 0.05, 0.08], [-0.52, 0.39, -0.09], [-0.89, 0.6, 0.24], [-0.89, 0.65, 0.25], [-0.88, 0.69, 0.21], [-0.65, 0.8, -0.02], [-0.61, 1.0, -0.07], [-0.51, 1.21, -0.08], [-0.52, 1.55, -0.15], [-0.52, 1.6, -0.06]]),
} as const

// Poses whose outline does not clear the focused window at SPOTS.left by the
// test's 0.02 NDC: dance_spin's swung arm touches the ring (~1 px in) and
// dance_wave's raised hand stops ~1.5 px short of it. Both are right-answer
// dances picked at random (src/lesson/runner.ts nextCelebration); the drawer
// quiz re-rolls them while he stands within `near` of the left spot
// (src/scene/windows/pointGate.ts clearCelebration). The test pins this list
// to the outlines, so a re-measure that clears one fails until it is dropped.
export const WINDOW_TIGHT_POSES = { poses: ['dance_spin', 'dance_wave'] as const, near: 0.2 } as const

// He points at the window only once the camera has finished panning to it:
// mid-pan the window still sits further right on screen and his pointing hand
// reaches into it (the pan eases at 3/s, so it is clear only ~0.7 s after a
// focus change). Until then he talks. panTolerance: how close (world x) the
// camera must be to its target pan; pollMs: how often a waiting point checks.
export const POINTING = { panTolerance: 0.02, pollMs: 80 } as const

// Camera for the live lesson (the intro eases into this). CameraRig renders
// it into the 16:9 stage frame, so these numbers fix the whole composition.
export const LESSON_CAMERA = {
  fov: 40,
  position: [0, 0.55, 7.4] as [number, number, number],
  lookAt: [0, -0.12, 0] as [number, number, number], // tilted down a touch: the tutor clears the caption
  aspect: 16 / 9, // the stage frame's aspect (LessonPage letterboxes the stage to it)
  focusShift: 0.9, // how far the camera pans toward the window when it has focus (x, world units)
} as const

// Where the lesson camera pans (x, world units): toward the window whenever
// the tutor focuses it (the notes, the board and the quiz all live there
// now), on whichever side the student dragged it (`side`: -1 left, the
// default, +1 right; windows/pointAt pointSide), but held centred while it
// is maximized, because the maximized placement is fitted to the resting
// camera (a pan would slide it off centre). CameraRig eases to this; the
// tutor's aside spot is worked out against it.
export function cameraPan(focus: string | null, maximized: string | null, side: -1 | 1 = -1): number {
  if (maximized) return 0
  return focus && focus !== 'none' ? side * LESSON_CAMERA.focusShift : 0
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
