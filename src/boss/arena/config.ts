import { FLOOR_Y } from '../../scene/layout3d'

// Every position, size, timing and amplitude of the Beat the Boss arena lives
// here (src/boss/arena/*, the HUD in BossLayer.tsx reads the timings too).
// World units are the room's (layout3d.ts); times are milliseconds from the
// moment the answer comes back. Look target: design/study-hub/Boss.dc.html
// and Tumbles.dc.html.

// The fight takes over the stage: the HUD's backdrop paints over the lesson
// chrome, the 3D canvas is lifted above it, and the HUD sits on top.
// Keep in sync with Boss.module.css (.backdrop 60, .fight 62). `over` is for
// the page overlays that must still show during a fight (the level-up banner,
// toasts): fight.ts sets it as --gg-over-fight, which their z-index reads.
export const ARENA_Z = { backdrop: 60, canvas: 61, hud: 62, over: 63 } as const

export const ARENA = {
  // Gemini Guy's fight spot: he walks there through director.stepAside, so his
  // effects (stars, confetti) follow him. Past the lane's end his depth is the left spot's.
  guy: { x: -1.85 },
  face: 0.42, // rad he turns toward the boss once he stands still
  faceDamp: 7, // 1/s
  takeDamp: 7, // fight on/off blend (windows away, framing, offsets), 1/s
  boss: {
    x: 2.0,
    z: 0.7,
    yaw: -0.42, // turned toward him, face still to the camera
    scale: 0.86,
    enterFrom: 6.5, // drives in from off-stage right (world units from its spot)
    contact: 1.3, // centre-to-centre distance where the lunge connects
    height: 2.15, // boss units, for the damage number anchor
  },
  // The two arena discs (the lesson's platform pops away with the windows).
  disc: { guy: 0.78, boss: 1.18, base: 0.12, line: [0.84, 0.87] as [number, number], lineColor: '#e6e4ef', pop: 260 },
  room: { popMs: 320 }, // how fast the lesson room pops away (and back)
  floorY: FLOOR_Y,
  // Fight framing on top of the lesson camera, over the whole window: zoom
  // about its centre (< 1 pulls back) and a pan in screen px (+y = down), so
  // both fighters stand between the HUD cards and the question card.
  // fit: when the cards leave less room than that (a long question, the
  // explanation after an answer), the shot pulls back and pans up so the
  // fighters, discs included, stay in the free band, keeping `gap` px off each
  // card. The band is measured off the HUD every `everyMs`.
  frame: { zoom: 0.78, dx: 0, dy: -130, fit: { gap: 12, minScale: 0.7, damp: 9, everyMs: 120 } },
  // The lesson room is found through these (their top-level group); each of its
  // pieces (the browser window, platform, shelves) pops away during a fight.
  // The window only scales: its own code moves it every frame.
  windows: ['notes-window'] as const,
  tutorName: 'blender-tutor', // the Blender tutor's placement group (BlenderTutor.tsx)
} as const

// Boss geometry in boss units (scaled by ARENA.boss.scale). Modelled on the
// bus monster in Boss.dc.html: a rounded block on two wheels, lighter top
// band, angry brows, white eyes, a toothy grin.
export const BOSS_SHAPE = {
  body: { w: 2.2, h: 1.55, d: 1.3, radius: 0.36, bottom: 0.48 },
  band: { h: 0.62, radius: 0.28, grow: 0.04 },
  eye: { r: 0.2, depth: 0.45, y: 1.4, xs: [-0.42, 0.32] as [number, number], squash: 0.88 },
  pupil: { r: 0.085, look: [-0.06, -0.02, 0.09] as [number, number, number] },
  brow: { w: 0.5, h: 0.1, d: 0.1, y: 1.67, tilt: 0.38 },
  teeth: { w: 0.95, h: 0.3, d: 0.1, y: 0.92, x: -0.05, gaps: [-0.24, 0, 0.24], gap: 0.035 },
  wheel: { r: 0.38, len: 0.3, x: 0.7, z: 0.48, hub: 0.15, spoke: 0.05 },
  pipe: { r: 0.08, h: 0.36, x: 0.62, z: -0.25 },
  tire: '#2b2d3d',
  hubColor: '#9a9db8',
  ink: '#1d1b24',
  eyeWhite: '#ffffff',
  discBase: '#3a3b52',
  roughness: 0.55,
} as const

// Beat timings (ms after the answer comes back). Everything is a 150-600 ms
// beat: snappy, with a short hit-stop (the whole arena freezes) on impact.
export const BEAT = {
  hitStop: 80,
  tense: 90, // ms time constant of the brace while the answer is checked
  enter: { drive: 520, skid: 680, settle: 920 },
  hit: { windup: 110, dash: 250, launch: 170, impact: 380, back: 620, done: 900 },
  miss: { windup: 240, impact: 400, back: 840, done: 1000 },
  koBurst: 420, // after the final hit's impact the boss shakes this long, then bursts
  reveal: { hit: 560, miss: 640 }, // the explanation shows once the hit has landed
  taunt: 1200, // the boss's laugh after it wins
  // Dances in a row after a KO, one per `every` ms (the longest dance is 2.4 s);
  // a level-up clip in the way is re-checked every `retry` ms.
  victory: { dances: 3, every: 2500, retry: 250 },
  // Answers (and Next) wait until the beat has played out and he is back on his
  // feet (a tumble and its recover outlast the beat): re-checked every `every`
  // ms, and never held longer than `max` after the beat ends.
  settle: { every: 100, max: 4000 },
  idle: { bob: 900, blink: 2800, blinkLen: 110, rev: 700, ready: 380 },
} as const

// Screen shake (px, also applied to the 3D shot) and flash strengths.
export const JUICE = {
  shake: { hit: 5, ko: 12, miss: 14, burst: 10 },
  shakeDecay: 95, // ms time constant
  flash: { hit: 0.22, ko: 0.6, miss: 0.32 },
  reduced: { shake: 0.15, flash: 0.3, bob: 0.4 }, // prefers-reduced-motion multipliers
} as const

// Projectile (Gemini Guy's star bolt) and impact effects.
export const BOLT = {
  size: 0.42,
  arc: 0.85, // world units the bolt rises above the straight line
  spin: 4 * Math.PI,
  trail: 6, // ghost stars behind it
  trailGap: 18, // ms between ghosts
  from: [0.45, 1.05, 0.35] as [number, number, number], // from his feet: hand height, toward the boss
  dashAt: 0.66, // how far into his dash (of DASH) he is when it leaves his hand
  to: [-0.3, 1.15, 0.45] as [number, number, number], // where it lands, from the boss's spot
  clash: [0.5, 0.85, 0.15] as [number, number, number], // where the boss's lunge connects, from his feet
  glow: 2.4, // glow size, x the star's
  ring: { inner: 0.3, outer: 0.42, grow: 3.2, ms: 320 },
  sparks: { n: 8, dist: 1.1, size: 0.16, ms: 380 },
  colors: { hit: '#fbbc04', miss: '#ea4335', burst: '#ffffff' },
} as const

// The boss bursting into pieces and confetti on a KO.
export const BURST = {
  pieces: 16,
  gravity: 9.8,
  bounce: 0.38,
  life: 1.6, // seconds before the pieces have shrunk away
  confetti: 70,
  confettiLife: 2.4,
  confettiGravity: 3.2,
  colors: ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#7c5cf2'],
} as const

export const GEMINI_SPARK = 'M12 0Q13.9 10.1 24 12Q13.9 13.9 12 24Q10.1 13.9 0 12Q10.1 10.1 12 0Z'
