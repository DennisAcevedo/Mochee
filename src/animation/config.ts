// Every duration, angle, amplitude, spring constant and pose target for the
// character lives here. All values are a direct lift from design/tutor-3d.js
// (the high-fidelity handoff); nothing in src/character or src/animation
// should carry an inline magic number.

export type Pose = 'explain' | 'point' | 'celebrate' | 'wave' | 'think' | 'listen' | 'shrug' | 'sleep' | 'read'
// tutor-3d.js derives the face from the pose; `happy` is the one explicit override
// (the ∩∩ eyes), kept so the app can still call setExpression().
export type Expression = 'neutral' | 'happy'

export const CHARACTER = {
  defaultSize: 1.15, // main-screen export prop `characterSize`
  defaultRoam: 0.75, // main-screen export prop `roam`
} as const

export const CAMERA = {
  fov: 28,
  near: 0.1,
  far: 100,
  distance: 9, // camera z; the region maths in the tick assume this
  position: [0, 0.5, 9] as [number, number, number],
  lookAt: [0, -0.1, 0] as [number, number, number],
} as const

export const RENDER = {
  exposure: 1.18,
  maxDpr: 2,
  shadowMapSize: 2048,
  envIntensity: 0.55,
  envBlur: 0.04,
} as const

export const LIGHTS = {
  hemi: { sky: '#ffffff', ground: '#e4e0d8', intensity: 1.2 },
  key: {
    color: '#fff5ea',
    intensity: 2.0,
    position: [2.5, 6, 5] as [number, number, number],
    shadow: { radius: 8, bias: -0.0004, normalBias: 0.02, left: -7, right: 7, top: 5, bottom: -5, near: 1, far: 20 },
  },
  fill: { color: '#e9f0ff', intensity: 0.6, position: [-5, 1.5, 3] as [number, number, number] },
  rim: { color: '#ffffff', intensity: 1.4, position: [-2, 4, -5] as [number, number, number] },
} as const

export const GROUND = {
  y: -1.55,
  blobSize: 1.9,
  blobLift: 0.002,
  blobScaleBase: 1.75,
  blobScalePerHeight: 0.25,
  blobScaleMin: 0.7,
  blobScaleMax: 1.6,
  blobOpacityBase: 1.15,
  blobOpacityPerHeight: 0.3,
  blobOpacityMin: 0.25,
} as const

export const TICK = {
  maxDt: 0.05,
  randomStart: 10, // initial t is random in [0, 10) so instances don't move in lockstep
} as const

export const SIZE = {
  regionWidthMin: 0.5,
  regionDivisor: 2.7, // size is capped at regionW / 2.7
  heightDivisor: 3.8, // and at (2 * halfH) / 3.8
  min: 0.45,
  max: 1.6,
  damp: 3,
} as const

export const ROAM = {
  xMax: 1.8,
  xClearance: 1.35, // roamX = min(xMax, regionW/2 - xClearance * s) * roam
  x: { a1: 0.65, f1: 0.31, a2: 0.35, f2: 0.83, p2: 1.3 },
  y: { base: 0.15, a1: 0.32, f1: 0.53, p1: 0.5, a2: 0.12, f2: 1.37, a3: 0.05, f3: 2.1 },
  z: { a1: 0.7, f1: 0.41, p1: 2.0, a2: 0.2, f2: 1.1 },
  dampX: 2.5,
  dampY: 4,
  dampZ: 2.5,
  velSmooth: 6,
  celebrateBounce: { amp: 0.35, f: 4.2 },
  shrugLift: { amp: 0.08, f: 2 },
} as const

export const LOOK = {
  damp: 4,
  maxNorm: 1.5, // pointer coords clamp to [-1.5, 1.5] of the canvas
  yaw: 0.45,
  pitch: 0.18,
  thinkYawScale: 0.3,
  thinkPitchScale: 0.2,
} as const

export const HEAD = {
  pointYaw: 0.5,
  pointYawDamp: 3,
  spinDuration: 1, // seconds for the celebrate 360
  velYaw: 0.35,
  velYawMax: 0.5,
  velPitch: 0.18,
  velPitchMax: 0.3,
  velPitchZ: 0.12,
  velPitchZMax: 0.2,
  velRoll: 0.28,
  velRollMax: 0.4,
  rollRoam: { amp: 0.05, f: 0.9 },
  rollIdle: { amp: 0.07, f: 0.7 },
  offsetDamp: 4,
  squashVel: 0.07,
  squashMin: -0.08,
  squashMax: 0.1,
  celebrateSquash: { amp: 0.03, f: 8.4 },
} as const

// Extra [pitch, yaw, roll] per pose, damped at HEAD.offsetDamp.
export const HEAD_OFFSETS: Record<Pose, (t: number) => [number, number, number]> = {
  explain: () => [0, 0, 0],
  point: () => [0, 0, 0],
  celebrate: () => [0, 0, 0],
  wave: (t) => [0, -0.12, 0.06 * Math.sin(t * 4.5)],
  think: () => [-0.22, 0.18, 0.12],
  listen: (t) => [0.04 * Math.sin(t * 2.2), -0.05, 0.28],
  shrug: (t) => [0, 0, 0.08 * Math.sin(t * 2)],
  sleep: (t) => [0.2, 0, 0.12 + 0.03 * Math.sin(t * 0.65)],
  read: (t) => [0.24, 0.1 * Math.sin(t * 0.6), 0.04 * Math.sin(t * 0.6)],
}

export const TASSEL = {
  stiffness: 60,
  damping: 5,
  velX: 0.45,
  velZ: 0.35,
  velY: 0.2,
  maxSwing: 1,
  maxPitch: 0.8,
  rest: 0.12,
} as const

export const BLINK = {
  gapMin: 2.5,
  gapRand: 3,
  duration: 0.16,
  open: 1.12,
  min: 0.1,
  max: 1.1,
  rate: 1.8,
  reopenFloor: 0.1,
} as const

export const BROWS = {
  happyLift: 0.05,
  speakLift: 0.015,
  speakWobble: 0.012,
  speakF: 3.1,
  damp: 6,
} as const

// [left, right] brow lift per pose.
export const BROW_LIFTS: Record<Pose, [number, number]> = {
  explain: [0, 0],
  point: [0, 0],
  celebrate: [0, 0],
  wave: [0.02, 0.02],
  think: [0.04, -0.01],
  listen: [0.02, -0.005],
  shrug: [0.05, 0.05],
  sleep: [-0.025, -0.025],
  read: [0, 0],
}

export const MOUTH = {
  happyOpen: 1,
  speakBase: 0.35,
  speakAmp: 0.55,
  speakF: 8.5,
  speakMod: 0.6,
  speakModAmp: 0.4,
  speakModF: 2.3,
  damp: 18,
  visibleThreshold: 0.06,
  happyWidth: 1.25,
  minHeight: 0.05,
} as const

export const HANDS = {
  stiffness: 70,
  damping: 9,
  rotDamp: 10,
} as const

// [x, y, z, rotX, rotY, rotZ] in root-local space, left hand then right hand.
export type HandTarget = [number, number, number, number, number, number]
export const HAND_POSES: Record<Pose, (t: number) => [HandTarget, HandTarget]> = {
  explain: (t) => [
    [-0.98, -0.3 + 0.05 * Math.sin(t * 1.9), 0.3, -0.5, 0, 0.6],
    [0.96, 0.12 + 0.12 * Math.sin(t * 2.6), 0.35, 0.2, 0, -0.45 + 0.28 * Math.sin(t * 2.6)],
  ],
  point: (t) => [
    [-0.95, -0.38 + 0.04 * Math.sin(t * 1.7), 0.2, 0, 0, 0.3],
    [1.15 + 0.07 * Math.sin(t * 5), 0.08, 0.25, 0, 0.2, -Math.PI / 2],
  ],
  wave: (t) => [
    [-0.96, -0.36 + 0.04 * Math.sin(t * 1.8), 0.25, 0, 0, 0.4],
    [0.98, 0.62 + 0.04 * Math.sin(t * 9), 0.3, 0, 0, -0.25 + 0.55 * Math.sin(t * 9)],
  ],
  think: (t) => [
    [-0.5, -0.62, 0.62, -0.4, 0, 1.3],
    [0.3, -0.42 + 0.02 * Math.sin(t * 1.5), 0.82, -0.6, 0, 0.5 + 0.08 * Math.sin(t * 3)],
  ],
  listen: (t) => [
    [-0.98, -0.34 + 0.04 * Math.sin(t * 1.6), 0.25, 0, 0, 0.45],
    [0.9, 0.22 + 0.03 * Math.sin(t * 2.2), 0.05, 0, -0.9, -0.2],
  ],
  shrug: (t) => [
    [-1.08, 0.02 + 0.1 * Math.max(0, Math.sin(t * 2)), 0.4, -1.2, 0, 1.3],
    [1.08, 0.02 + 0.1 * Math.max(0, Math.sin(t * 2)), 0.4, -1.2, 0, -1.3],
  ],
  celebrate: (t) => [
    [-0.88, 0.95 + 0.12 * Math.sin(t * 8.4), 0.15, 0, 0, 0.35 + 0.15 * Math.sin(t * 8.4)],
    [0.88, 0.95 + 0.12 * Math.sin(t * 8.4 + 1), 0.15, 0, 0, -0.35 - 0.15 * Math.sin(t * 8.4 + 1)],
  ],
  sleep: (t) => [
    [-0.86, -0.5 + 0.03 * Math.sin(t * 1.3), 0.3, -0.3, 0, 0.9],
    [0.86, -0.5 + 0.03 * Math.sin(t * 1.3 + 0.4), 0.3, -0.3, 0, -0.9],
  ],
  // Both hands hold the open book.
  read: (t) => [
    [-0.38, -0.42, 1.0, -0.7, 0, 0.35],
    [0.38, -0.42 + 0.015 * Math.sin(t * 2), 1.0, -0.7, 0, -0.35],
  ],
}

// Asleep: the body breathes and the mouth hangs slightly open.
export const BREATH = { amp: 0.035, f: 1.3, xz: 0.4 } as const
export const SLEEP_MOUTH = { base: 0.18, amp: 0.04, f: 1.3 } as const

// Reading: stays put at the region centre with a gentle bob.
export const READ = { y: 0.2, amp: 0.02, f: 1.2 } as const

// Graduation cap rest transform, relative to the body (from tutor-3d.js).
export const CAP = {
  position: [0.02, -0.02, 0] as [number, number, number],
  rotation: [-0.06, 0, -0.12] as [number, number, number],
} as const

// ---------------------------------------------------------------------------
// Stage 2: the start-screen intro.

export const SLEEP = {
  size: 1, // start-screen <tutor-3d size="1">
  roam: 0.05, // start-screen <tutor-3d roam="0.05">
  lookDamp: 3, // cursor-follow fades back in this fast on waking (tutor-3d.js snaps it)
} as const

// ---------------------------------------------------------------------------
// Stage 3: card characters on Home idle at a lower tick rate.
export const LITE = { tickHz: 20 } as const

// Every timing in seconds, distance in world units (or px for HTML), angle in
// radians, easing as a GSAP ease string. The sequence is built in intro.ts.
export const INTRO = {
  slotSize: 300, // the start-screen character box, px

  // 1. Start screen leaves.
  exit: {
    duration: 0.3,
    ease: 'power2.in',
    squishScale: 0.92, // button press
    squishPortion: 0.35, // share of the duration spent squishing
    ctaEndScale: 0.75, // button + rings shrink to this as they fade
    titleRise: 26, // px the logo and subtitle float up
    titleStagger: 0.04,
    zPopScale: 1.45,
    zPopPortion: 0.4, // share of the duration spent popping before vanishing
  },

  // 2. Camera pushes in on the face.
  push: {
    at: 0.2, // starts this long after the click (overlaps the exit)
    duration: 0.8,
    ease: 'power2.out',
    position: [0, 0.42, 2.9] as [number, number, number], // headroom for the hop and cap pop
    target: [0, 0.3, 0] as [number, number, number],
  },

  // 3. Wake up.
  wake: {
    duration: 0.6,
    eyePopIn: 0.14,
    eyePopHold: 0.18,
    eyePopOut: 0.3,
    eyePopEase: 'back.out(3)',
    eyePopScale: 0.32, // eyes grow by this much at the peak
    mouthOpen: 0.55, // little surprised "o"
    browLift: 0.05,
    sparkleIn: 0.18,
    sparkleOut: 0.32,
    sparkleSize: 0.7,
    sparkleTurn: Math.PI / 2,
    sparkleColor: '#36b3c2',
    hop: 0.42,
    hopUp: 0.2,
    hopDown: 0.22,
    hopStretch: 0.12,
    landSquash: 0.1,
    landDuration: 0.18,
    capPop: 0.42, // cap lifts this far off the head
    capTilt: 0.55, // and tips this much per unit of lift
    capDelay: 0.03,
    capUp: 0.2,
    capDown: 0.42,
    capLandEase: 'bounce.out',
  },

  // 4. Wind-up.
  windup: { duration: 0.2, squash: 0.16, twist: -0.45, ease: 'power2.out' },

  // 5. Spin.
  spin: {
    turns: 6,
    duration: 2,
    ease: 'power3.inOut',
    twistRelease: 0.3, // wind-up twist unwinds over this, whipping into the spin
    overshoot: 0.35, // past the final angle, then wobble back
    wobbleDuration: 0.6,
    wobbleEase: 'elastic.out(1, 0.35)',
    // The rest scale with spin speed (0 at rest, 1 at peak).
    stretch: 0.24, // taller and thinner, times speed squared
    rise: 0.5, // lifts like a top
    cameraFollow: 0.85, // share of the rise (and, while still close, the arc) the camera tracks
    handSpread: 0.5, // hands fly out by this share of their reach
    handLift: 0.28,
    handLag: 0.75, // hands trail the body rotation by this angle
    handSnapPower: 0.35, // < 1 keeps hands out until the spin is nearly done, then snaps
    handGrip: 4, // hands are fully pinned once spread passes 1 / handGrip
    speedSmoothing: 16,
    wrapGuard: 6, // a per-frame spin jump bigger than this is a reset, not motion
  },

  // 6. Pull out to the teaching shot while arcing over.
  pull: {
    overlap: 0.15, // starts this long before the spin ends
    duration: 0.95,
    ease: 'power2.inOut', // camera and frame
    travelEase: 'power2.inOut',
    arc: 0.65, // peak height of the hop across
    arcPeak: 0.5, // share of the duration spent rising
    arcUpEase: 'sine.inOut',
    arcDownEase: 'power2.in', // lands with some speed so the squash reads
  },

  // 7. Land.
  land: {
    squash: 0.15,
    squashDuration: 0.09,
    settleDuration: 0.75,
    settleEase: 'elastic.out(1, 0.4)',
    clipDuration: 0.3, // canvas clip tightens to the stage
  },
  backdrop: { lead: 0.35, duration: 0.7, ease: 'sine.inOut' }, // starts this long before landing

  // 8. UI.
  ui: {
    delay: 0.05, // after landing
    duration: 0.55,
    stagger: 0.08,
    ease: 'power3.out',
    topBarY: -36,
    boardScale: 0.55,
    sidebarXPercent: 105,
    inputBarY: 44,
  },

  // 9. Wave, greet, settle.
  greet: { lead: 0.7, charsPerSecond: 48 }, // wave this long before typing starts
  roam: { duration: 1.6, ease: 'sine.inOut' },

  skip: { duration: 0.35, ease: 'power2.out' },
  reduced: { fade: 0.25, wakeHold: 0.35, eyePopIn: 0.12, eyePopOut: 0.25, cutFade: 0.2, reveal: 0.35 },

  bodyPivotY: -0.64, // squash and stretch keep the body's base here
} as const

// power3.inOut peaks at 3x the average rate, at the halfway point.
export const SPIN_PEAK_SPEED = (3 * INTRO.spin.turns * Math.PI * 2) / INTRO.spin.duration
