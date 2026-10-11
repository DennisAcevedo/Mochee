import { FLOOR_Y, PALETTE } from '../layout3d'

// Every number of the effects layer. Distances are world units (the tutor's
// body is ~1 unit tall in the room), speeds units/s, times seconds.
// Ranges are [min, max] and are sampled uniformly.

type Range = readonly [number, number]
type Vec3 = readonly [number, number, number]

export const FX = {
  maxDt: 1 / 20, // clamp long frames so a hitch never teleports particles
  // The same kind at the same anchor within this window plays once. Play
  // actions and the Blender clips' own fx (clips.json) both fire bursts for one
  // moment (a giggle's hearts, the levelup burst); this keeps it to one.
  dedupeSeconds: 0.7,

  // Pool sizes. A burst that would overflow recycles the oldest particles.
  capacity: { confetti: 420, sparkles: 220, hearts: 48, stars: 96, overlays: 12 },

  // Where bursts start, relative to their anchor. The tutor anchor is the top
  // of his head; window anchors are window centres (pushed toward the camera).
  origin: {
    tutor: [0, 0.05, 0.1] as Vec3,
    face: [0, -0.32, 0.38] as Vec3, // hearts come from his face
    window: [0, 0, 0.35] as Vec3,
  },

  // Scale envelope shared by every particle: pop in with overshoot, shrink out.
  popIn: 0.12, // fraction of life spent popping in
  popOvershoot: 1.9, // easeOutBack strength
  fadeOut: 0.3, // fraction of life spent shrinking away

  confetti: {
    count: 110,
    size: [0.09, 0.14] as Range, // long side; the short side is `aspect` of it
    aspect: 0.5,
    speedUp: [2.8, 5.2] as Range,
    spreadX: 3.6,
    spreadZ: 2.2,
    towardCamera: 0.6,
    gravity: -6.5,
    drag: 1.5,
    spin: 14, // rad/s, per axis, either direction
    life: [1.9, 2.8] as Range,
    sway: 0.9, // side-to-side flutter while falling
  },
  sparkles: {
    count: 34,
    size: [0.14, 0.32] as Range,
    speed: [0.9, 2.6] as Range,
    gravity: -0.5,
    drag: 2.4,
    life: [0.7, 1.3] as Range,
    twinkle: 22, // rad/s
    twinkleDepth: 0.35,
  },
  hearts: {
    count: 9,
    size: [0.13, 0.22] as Range,
    speedUp: [1.0, 1.8] as Range,
    spreadX: 1.1,
    towardCamera: [0.3, 0.8] as Range,
    gravity: 0.5, // positive: they float up
    drag: 1.4,
    life: [1.3, 1.9] as Range,
    sway: 1.6,
    wobble: 0.5, // rad of left-right rock
    rock: 0.9, // rad/s of turn, kept low so a heart never goes edge-on
  },
  stars: {
    count: 16,
    size: [0.11, 0.18] as Range,
    speed: [2.2, 3.6] as Range,
    towardCamera: 0.6,
    gravity: -3.2,
    drag: 1.7,
    spin: 9,
    life: [1.0, 1.5] as Range,
  },
  ring: {
    count: 2,
    stagger: 0.1,
    radius: [0.2, 1.05] as Range, // grows from..to
    life: 0.6,
    opacity: 0.95,
    width: 0.07, // inner radius = 1 - width
  },
  levelup: {
    confetti: 170,
    confettiBoost: 1.35, // faster, wider than a normal confetti pop
    stars: 26,
    sparkles: 34,
    sparkleScale: 0.85,
    sparkleColumn: { radius: 0.95, rise: [1.4, 3.0] as Range, turns: 1.5 },
    rings: 3,
    ringStagger: 0.12,
    ringRadius: [0.3, 1.7] as Range,
    flash: { size: [0.4, 3.0] as Range, life: 0.5, opacity: 0.8 },
  },

  // How long each event stays in director.fx before the layer clears it
  // (the longest particle life of its kind, plus a margin).
  holdSeconds: { confetti: 3, sparkles: 1.5, hearts: 2.1, stars: 1.7, ring: 1, levelup: 3.2 },
} as const

// Colours each kind draws from.
export const FX_COLORS = {
  confetti: [PALETTE.coral, PALETTE.teal, PALETTE.sun, PALETTE.violet, PALETTE.lime, PALETTE.pink, PALETTE.indigo],
  sparkles: [PALETTE.sun, PALETTE.teal, PALETTE.pink, PALETTE.violet, PALETTE.lime],
  hearts: [PALETTE.pink, PALETTE.coral, '#ff4f7e'],
  stars: [PALETTE.sun, PALETTE.sun, '#ffb020', PALETTE.violet, PALETTE.teal],
  rings: [PALETTE.teal, PALETTE.pink, PALETTE.sun, PALETTE.violet],
  flash: PALETTE.sun,
} as const

// Party lights (level 5): coloured beams sweeping from the ceiling and pools
// of colour on the floor while a dance party runs.
export const PARTY = {
  colors: [PALETTE.pink, PALETTE.teal, PALETTE.sun, PALETTE.violet, PALETTE.lime],
  beamLength: 4.2,
  beamRadius: 0.42, // at the floor end
  beamOpacity: 0.32, // at the ceiling end; fades to nothing at the floor end
  spotRadius: 0.62,
  spotOpacity: 0.6,
  spread: 4.2, // x range the beams sit across
  sweep: 0.55, // rad of swing
  sweepSpeed: 2.2, // rad/s
  fadeIn: 0.25,
  fadeOut: 0.6,
} as const

// The ball and the snack thrown to him (timings live in PLAY, src/play/config.ts).
export const PROPS = {
  ball: {
    radius: 0.17,
    from: [-2.7, FLOOR_Y + 0.6, 3.6] as Vec3, // lower left, as if the student threw it
    arc: 1.5, // peak height above the straight line
    spin: 9, // rad/s in flight
    gores: [PALETTE.coral, PALETTE.sun, PALETTE.teal, PALETTE.violet, PALETTE.lime, PALETTE.pink],
    poleCap: 0.94, // |y| / radius above which the ball is white
    tilt: 0.45, // rad: spins about a tipped axis so the gores, not a pole, face the camera
    hands: 'both' as 'both' | 'right', // aim between both hands, or at his right hand
    handsForward: 0.12, // held slightly in front of the hands
    squash: 0.18, // squash on landing in his hands
    tossBackMs: 650, // after the hold he tosses it back out of frame
    tossTo: [2.9, FLOOR_Y + 0.4, 4.2] as Vec3,
  },
  snack: {
    size: 0.3, // doughnut outer diameter
    from: [2.6, FLOOR_Y + 0.5, 3.6] as Vec3,
    arc: 1.1,
    spin: 7,
    mouth: [0, -0.36, 0.34] as Vec3, // from the tutor anchor (top of head) to his mouth
    dough: '#e8a967',
    sprinkles: 14,
    sprinkleColors: [PALETTE.teal, PALETTE.sun, PALETTE.violet, PALETTE.lime, '#ffffff', PALETTE.indigo],
  },
} as const
