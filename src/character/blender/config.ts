import type { Clip, LoopClip, OneShotClip } from '../../state/director'

// Every timing, speed, angle and offset for the Blender tutor lives here.
// Model units are the classic rig's (body radius 0.8, about 2.6 tall to the
// cap top); world units are the room's (layout3d.ts). Nothing in
// src/character/blender should carry an inline magic number.

export const TUTOR_ASSETS = {
  model: '/models/tutor.glb',
  manifest: '/models/tutor.manifest.json',
} as const

export type FaceState = 'neutral' | 'happy' | 'closed' | 'surprised' | 'focused'

// Node names from the Blender contract (docs/specs/2026-10-10-whitebox-stage.md).
// GLTFLoader strips '.' from node names ('hand.L' -> 'handL'); rigNodes.ts
// resolves both spellings. If the real GLB names a part differently, add the
// alternative spelling to the list here and nowhere else.
export const NODE_NAMES = {
  root: ['root'],
  body: ['body'],
  cap: ['cap'],
  tassel: ['tassel'],
  handL: ['hand.L', 'hand_L'],
  handR: ['hand.R', 'hand_R'],
  footL: ['foot.L', 'foot_L'],
  footR: ['foot.R', 'foot_R'],
  eyeL: ['eye.L', 'eye_L'],
  eyeR: ['eye.R', 'eye_R'],
  happyL: ['happy.L', 'happy_L'],
  happyR: ['happy.R', 'happy_R'],
  browL: ['brow.L', 'brow_L'],
  browR: ['brow.R', 'brow_R'],
  smile: ['smile'],
  mouth: ['mouth'],
} as const
export type NodeKey = keyof typeof NODE_NAMES

export const CAP_MATERIAL = 'cap'
export const SNEAKER_MATERIAL = 'sneaker' // the feet's coral sole band (v2 GLB); recoloured by the sneakerColor prop

// When a clip is missing from the GLB, play the next one down this chain
// (one mapping table, so a renamed or dropped clip degrades instead of freezing).
export const CLIP_FALLBACK: Partial<Record<Clip, Clip>> = {
  talk: 'idle',
  think: 'idle',
  listen: 'think',
  point_left: 'talk',
  point_right: 'talk',
  walk: 'idle',
  sleep: 'idle',
  wake: 'hop',
  giggle: 'hop',
  highfive: 'wave',
  catch: 'hop',
  yum: 'giggle',
  levelup: 'celebrate',
  dance_spin: 'dance_bounce',
  dance_robot: 'dance_bounce',
  dance_bounce: 'celebrate',
  celebrate: 'hop',
  // v2 clips, so a GLB built before them still moves.
  dragged: 'listen',
  tumble: 'hop',
  recover: 'hop',
  surprise: 'shrug',
  hint: 'point_right',
  equip: 'wave',
}

// Face per clip when the manifest does not say (the manifest wins).
export const DEFAULT_FACE: Partial<Record<Clip, FaceState>> = {
  think: 'focused',
  listen: 'focused',
  sleep: 'closed',
  celebrate: 'happy',
  dance_bounce: 'happy',
  dance_spin: 'happy',
  dance_robot: 'happy',
  giggle: 'happy',
  highfive: 'happy',
  yum: 'happy',
  levelup: 'happy',
  catch: 'surprised',
  wake: 'surprised',
  dragged: 'surprised',
  tumble: 'closed',
  recover: 'happy',
  surprise: 'surprised',
  hint: 'happy',
  equip: 'happy',
}

// Animation state machine (animController.ts). Every director clip belongs to
// one state; the state carries the priority, cooldown and crossfade.
export const ANIM_STATE_NAMES = [
  'idle',
  'listen',
  'think',
  'explain',
  'hint',
  'correct',
  'incorrect',
  'dance',
  'celebrate',
  'play',
  'dragged',
  'tumble',
  'recover',
  'sleep',
  'surprise',
  'equip',
  'levelup',
] as const
export type AnimState = (typeof ANIM_STATE_NAMES)[number]

export interface AnimStateConfig {
  kind: 'loop' | 'oneshot'
  priority: number // a request below the state in progress never interrupts it
  // oneshot: seconds after a start before the state may start again (a request inside it is dropped).
  // loop: seconds the loop holds before an equal-or-lower loop replaces it (the change waits).
  cooldown: number
  fade: number // crossfade into the state, seconds
  clips: readonly Clip[] // director clips that mean this state; the first is what request(state) plays first
}

export const ANIM_STATES: Record<AnimState, AnimStateConfig> = {
  dragged: { kind: 'loop', priority: 100, cooldown: 0, fade: 0.1, clips: ['dragged'] },
  tumble: { kind: 'loop', priority: 100, cooldown: 0, fade: 0.08, clips: ['tumble'] },
  recover: { kind: 'oneshot', priority: 90, cooldown: 0.5, fade: 0.08, clips: ['recover'] },
  levelup: { kind: 'oneshot', priority: 80, cooldown: 3, fade: 0.12, clips: ['levelup'] },
  equip: { kind: 'oneshot', priority: 70, cooldown: 1.5, fade: 0.12, clips: ['equip'] },
  celebrate: { kind: 'oneshot', priority: 60, cooldown: 1.2, fade: 0.12, clips: ['celebrate'] },
  correct: { kind: 'oneshot', priority: 60, cooldown: 0.8, fade: 0.1, clips: ['hop'] },
  dance: { kind: 'oneshot', priority: 60, cooldown: 1.2, fade: 0.15, clips: ['dance_bounce', 'dance_spin', 'dance_robot'] },
  surprise: { kind: 'oneshot', priority: 55, cooldown: 1, fade: 0.06, clips: ['surprise', 'wake'] },
  incorrect: { kind: 'oneshot', priority: 50, cooldown: 1, fade: 0.15, clips: ['shrug'] },
  hint: { kind: 'oneshot', priority: 50, cooldown: 1.5, fade: 0.12, clips: ['hint'] },
  play: { kind: 'oneshot', priority: 50, cooldown: 0.35, fade: 0.1, clips: ['giggle', 'highfive', 'wave', 'catch', 'yum'] },
  explain: { kind: 'loop', priority: 30, cooldown: 0.3, fade: 0.2, clips: ['talk', 'point_left', 'point_right'] },
  think: { kind: 'loop', priority: 30, cooldown: 0.3, fade: 0.2, clips: ['think'] },
  listen: { kind: 'loop', priority: 30, cooldown: 0.3, fade: 0.2, clips: ['listen'] },
  idle: { kind: 'loop', priority: 0, cooldown: 0.3, fade: 0.2, clips: ['idle', 'walk'] },
  sleep: { kind: 'loop', priority: 0, cooldown: 0.3, fade: 0.3, clips: ['sleep'] },
}

export const ANIM = {
  queueTtl: 1.2, // a blocked request waits in the single queue slot this long, then it is dropped
  defaultOneShotSeconds: 1.2, // one-shot length when the GLB cannot say (clip missing)
  maxDt: 1, // the state machine's clock runs on real seconds (like the mixer), capped per frame
} as const


export const MOTION = {
  timeScale: 1, // global playback speed for every clip
  fadeLoop: 0.2, // crossfade between base loops, seconds
  fadeGesture: 0.15, // into a one-shot
  fadeBack: 0.18, // one-shot back to the loop (starts this long before the clip ends)
  fadeWalk: 0.15, // into and out of the walk cycle
  minGestureSeconds: 1.6, // a one-shot the manifest marks as looping repeats until at least this long
  maxDt: 0.05,
} as const

export const WALK = {
  maxSpeed: 2.4, // world units per second
  accel: 9, // world units per second squared
  arriveK: 5, // speed cap near the target: dist * arriveK
  minSpeed: 0.35, // floor for the arrive cap so he never crawls in
  arriveEps: 0.012, // snap onto the spot inside this distance
  turnK: 16, // yaw damping toward the travel direction (exponential rate)
  turnBackK: 12, // yaw damping back to the camera on arrival
  startAngle: 0.55, // start moving once the yaw error is under this (rad)
  settleAngle: 0.08, // facing the camera again under this (rad): resume loop + gestures
} as const

export const BLINK = {
  gapMin: 2.5,
  gapRand: 3, // next blink in [gapMin, gapMin + gapRand) seconds
  duration: 0.16,
  closed: 0.1, // eye scale Y at the bottom of a blink
} as const

// Eye scale per face (x, y multipliers on the rest scale), damped at FACE_DAMP.eyes.
export const EYES: Record<FaceState, [number, number]> = {
  neutral: [1, 1],
  happy: [1, 1], // eyes hidden, the ∩ arcs show
  closed: [1.05, 0.12],
  surprised: [1.15, 1.22],
  focused: [1, 0.72],
}

// Brow lift per face, model units along the body's up axis.
export const BROW_LIFT: Record<FaceState, number> = {
  neutral: 0,
  happy: 0.05,
  closed: -0.025,
  surprised: 0.08,
  focused: -0.02,
}

export const SPEAK = {
  browLift: 0.03,
  browWobble: 0.015,
  browF: 3.1,
  mouthBase: 0.35,
  mouthAmp: 0.55,
  mouthF: 8.5,
  mouthMod: 0.6,
  mouthModAmp: 0.4,
  mouthModF: 2.3,
} as const

export const MOUTH = {
  happyOpen: 0.75, // happy face shows the open mouth even when quiet
  surprisedOpen: 0.55,
  visible: 0.06, // below this the open mouth hides and the smile shows
  minScale: 0.08,
} as const

export const FACE_DAMP = {
  eyes: 22,
  brows: 10,
  mouth: 18,
} as const

// Small cursor look, layered on the body bone after the mixer.
export const LOOK = {
  yaw: 0.32, // rad at full deflection
  pitch: 0.14,
  gain: 1.1, // NDC distance from his head to the cursor that reaches full deflection
  damp: 5,
  duringClip: 0.3, // multiplier while a one-shot or a walk plays
} as const

// Anchor offsets: the top-of-head point sits this far above the cap node, model units.
export const ANCHOR = {
  headAboveCap: 0.32,
  headAboveBody: 1.25, // used if the GLB has no cap node
} as const

export type { Clip, LoopClip, OneShotClip }
