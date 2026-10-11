import type { Clip, LoopClip, OneShotClip } from '../../state/director'
import type { TumbleCause } from '../../state/tumbles'

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

// v3 GLB: one node per accessory (src/character/look.ts names), all present in
// the file; the tutor shows only the look's pick and tints its acc_<name>
// material with accColor. The book node shows while the 'read' clip plays
// (and the mic hides then). Older GLBs have none of these: nothing shows.
export const ACCESSORY_NODES = ['glasses', 'leaf', 'mic', 'bowtie', 'headphones', 'scarf', 'pencil'] as const
export const BOOK_NODE = 'book'
export const accessoryMaterial = (name: string) => `acc_${name}`
// Right-answer celebrations: one is picked at random, never the same twice in a
// row (src/lesson/runner.ts nextCelebration). Adding a dance is one line here:
// it joins the director's one-shot clips and the dance state below, and a GLB
// without the clip degrades through fallbackOf (dance_* -> dance_bounce).
export const CELEBRATIONS = [
  'celebrate',
  'dance_bounce',
  'dance_spin',
  'dance_robot',
  // v3 dances (BLENDER/tutor/author_dances.py)
  'dance_shuffle',
  'dance_wave',
  'dance_floss',
  'dance_disco',
  'dance_twist',
  'hop',
] as const
export type Celebration = (typeof CELEBRATIONS)[number]
const DANCE_FALLBACK: Clip = 'dance_bounce'

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
  read: 'think',
  // v3 dances: the closest older dance, so a GLB built before them still dances.
  dance_shuffle: 'dance_bounce',
  dance_wave: 'dance_robot',
  dance_floss: 'dance_bounce',
  dance_disco: 'dance_robot',
  dance_twist: 'dance_spin',
  // v4 tumbles: the tuck loop. tumbleLayer.ts checks the GLB first and, without
  // the clip, holds 'tumble' under the procedural tumbleOffset instead.
  tumble_knockback: 'tumble',
  tumble_spin: 'tumble',
  tumble_spin_l: 'tumble',
  tumble_splat: 'tumble',
  tumble_bonk: 'tumble',
  tumble_dizzy: 'tumble',
  tumble_dizzy_l: 'tumble',
  tumble_faceplant: 'tumble',
  // v4 emotes: the clip each one varies.
  emote_laugh: 'giggle',
  emote_shy: 'giggle',
  emote_doubletake: 'surprise',
  emote_fistpump: 'hop',
  emote_nod: 'hop',
  emote_thumbsup: 'hop',
  emote_facepalm: 'shrug',
  emote_headshake: 'shrug',
  emote_love: 'yum',
  emote_salute: 'wave',
  // Play-tab ball clips: a GLB built before them still reacts (src/scene/hoops gives the ball back).
  play_shoot: 'hop',
  play_dunk: 'hop',
  play_kick: 'hop',
  play_catch_throw: 'catch',
  play_dribble: 'idle',
  play_juggle: 'idle',
  play_jumprope: 'idle',
}

// What knocked him over -> the tumble clip that plays it (dir = 1, his right).
// TUMBLE_CLIPS_LEFT has the mirrored clip for the causes that have one (dir = -1).
export const TUMBLE_CLIPS = {
  boss: 'tumble_knockback',
  thrown: 'tumble_spin',
  dropped: 'tumble_splat',
  bonk: 'tumble_bonk',
  shaken: 'tumble_dizzy',
  flicked: 'tumble_faceplant',
} as const satisfies Record<TumbleCause, OneShotClip>
export const TUMBLE_CLIPS_LEFT: Partial<Record<TumbleCause, OneShotClip>> = {
  thrown: 'tumble_spin_l',
  shaken: 'tumble_dizzy_l',
}
// A reaction queued behind 'recover' once he is back up (the boss hit: his own "d'oh").
export const TUMBLE_FOLLOW_UP: Partial<Record<TumbleCause, OneShotClip>> = {
  boss: 'emote_facepalm',
}

// The next clip down the chain: the table first, then any dance it does not
// list falls back to the base dance (so a new CELEBRATIONS entry never freezes him).
export function fallbackOf(clip: Clip): Clip | undefined {
  const mapped = CLIP_FALLBACK[clip]
  if (mapped) return mapped
  return clip.startsWith('dance_') && clip !== DANCE_FALLBACK ? DANCE_FALLBACK : undefined
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
  read: 'focused',
  dance_shuffle: 'happy',
  dance_wave: 'happy',
  dance_floss: 'happy',
  dance_disco: 'happy',
  dance_twist: 'happy',
  tumble_knockback: 'surprised',
  tumble_spin: 'closed',
  tumble_spin_l: 'closed',
  tumble_splat: 'surprised',
  tumble_bonk: 'closed',
  tumble_dizzy: 'focused',
  tumble_dizzy_l: 'focused',
  tumble_faceplant: 'surprised',
  emote_laugh: 'happy',
  emote_shy: 'happy',
  emote_doubletake: 'surprised',
  emote_fistpump: 'happy',
  emote_facepalm: 'closed',
  emote_nod: 'happy',
  emote_headshake: 'closed',
  emote_love: 'happy',
  emote_salute: 'focused',
  emote_thumbsup: 'happy',
}

// Face for a clip: the table, else happy for any celebration it does not list.
export function defaultFace(clip: Clip): FaceState | undefined {
  return DEFAULT_FACE[clip] ?? ((CELEBRATIONS as readonly Clip[]).includes(clip) ? 'happy' : undefined)
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
  'knocked',
  'recover',
  'sleep',
  'surprise',
  'equip',
  'levelup',
  'read',
  'ballMove',
  'ballLoop',
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
  // The per-cause tumble clips (TUMBLE_CLIPS). Same priority as recover, so the
  // hand-off to recover replaces the clip and a fresh knock replaces a recover.
  knocked: {
    kind: 'oneshot',
    priority: 90,
    cooldown: 0,
    fade: 0.08,
    clips: ['tumble_knockback', 'tumble_spin', 'tumble_spin_l', 'tumble_splat', 'tumble_bonk', 'tumble_dizzy', 'tumble_dizzy_l', 'tumble_faceplant'],
  },
  recover: { kind: 'oneshot', priority: 90, cooldown: 0.5, fade: 0.08, clips: ['recover'] },
  levelup: { kind: 'oneshot', priority: 80, cooldown: 3, fade: 0.12, clips: ['levelup'] },
  equip: { kind: 'oneshot', priority: 70, cooldown: 1.5, fade: 0.12, clips: ['equip'] },
  celebrate: { kind: 'oneshot', priority: 60, cooldown: 1.2, fade: 0.12, clips: ['celebrate'] },
  correct: { kind: 'oneshot', priority: 60, cooldown: 0.8, fade: 0.1, clips: ['hop', 'emote_fistpump', 'emote_thumbsup', 'emote_nod'] },
  dance: { kind: 'oneshot', priority: 60, cooldown: 1.2, fade: 0.15, clips: CELEBRATIONS.filter((c) => c.startsWith('dance_')) },
  surprise: { kind: 'oneshot', priority: 55, cooldown: 1, fade: 0.06, clips: ['surprise', 'wake', 'emote_doubletake'] },
  incorrect: { kind: 'oneshot', priority: 50, cooldown: 1, fade: 0.15, clips: ['shrug', 'emote_facepalm', 'emote_headshake'] },
  hint: { kind: 'oneshot', priority: 50, cooldown: 1.5, fade: 0.12, clips: ['hint'] },
  play: {
    kind: 'oneshot',
    priority: 50,
    cooldown: 0.35,
    fade: 0.1,
    clips: ['giggle', 'highfive', 'wave', 'catch', 'yum', 'emote_laugh', 'emote_shy', 'emote_love', 'emote_salute'],
  },
  // Play-tab ball moves (BLENDER/tutor/author_play.py; src/scene/hoops drives the ball).
  // The one-shots outrank a tickle (it waits in the queue) so a shot is never cut mid-jump;
  // the dribble / juggle loops sit over the lesson loops and a play one-shot can still play over them.
  ballMove: { kind: 'oneshot', priority: 60, cooldown: 0.3, fade: 0.08, clips: ['play_shoot', 'play_dunk', 'play_kick', 'play_catch_throw'] },
  ballLoop: { kind: 'loop', priority: 40, cooldown: 0, fade: 0.12, clips: ['play_dribble', 'play_juggle', 'play_jumprope'] },
  explain: { kind: 'loop', priority: 30, cooldown: 0.3, fade: 0.2, clips: ['talk', 'point_left', 'point_right'] },
  think: { kind: 'loop', priority: 30, cooldown: 0.3, fade: 0.2, clips: ['think'] },
  listen: { kind: 'loop', priority: 30, cooldown: 0.3, fade: 0.2, clips: ['listen'] },
  read: { kind: 'loop', priority: 30, cooldown: 0.3, fade: 0.3, clips: ['read'] },
  idle: { kind: 'loop', priority: 0, cooldown: 0.3, fade: 0.2, clips: ['idle', 'walk'] },
  sleep: { kind: 'loop', priority: 0, cooldown: 0.3, fade: 0.3, clips: ['sleep'] },
}

// Variety for the app's reactions: when a trigger asks for a key clip with
// director.play(clip, { vary: true }), the controller plays this list in turn
// instead (deterministic rotation, first entry first), so the same trigger reads
// differently each time. Choreography (ability beats, lesson steps) plays
// without `vary` and gets the exact clip. Every entry has the key's priority.
export const CLIP_VARIANTS: Partial<Record<OneShotClip, readonly OneShotClip[]>> = {
  giggle: ['giggle', 'emote_laugh', 'emote_shy'], // tickle (src/play/actions.ts poke)
  hop: ['hop', 'emote_fistpump', 'emote_thumbsup', 'emote_nod'], // a right answer's hop
  celebrate: ['celebrate', 'emote_fistpump', 'emote_thumbsup'], // a right answer's celebration
  shrug: ['shrug', 'emote_facepalm', 'emote_headshake'], // a wrong answer
  surprise: ['surprise', 'emote_doubletake'],
  yum: ['yum', 'emote_love'], // snack
  wave: ['wave', 'emote_salute'], // hello
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

// The start spin on the Blender tutor (introLayer.ts): the intro timeline's
// values (src/animation/introState.ts, INTRO in src/animation/config.ts) mapped
// onto his placement and bones. World units unless noted. He stays on the
// centre spot for the whole intro; the camera does the framing.
export const INTRO_LAYER = {
  // Camera push for the wake and the spin: in on him, but with his feet,
  // the hop, the rise and the cap pop all in the start box.
  push: {
    position: [0, -0.32, 3.9] as [number, number, number],
    target: [0, -0.62, 0.6] as [number, number, number],
  },
  rise: 0.36, // lifts like a top at full spin speed
  stretch: 0.2, // taller and thinner at full spin speed (times speed squared)
  hopScale: 0.5, // intro.hop (classic units) -> world
  liftScale: 0.55, // intro.lift, the hop across the pull -> world (he hops in place)
  handSpread: 0.45, // hands fly out by this share of their reach (model units scale with it)
  handLift: 0.22, // model units
  capScale: 1, // intro.capPop is already in model units
  maxSquash: 0.45, // |stretch - squash| clamp, so no frame flattens him through the floor
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
  returnSpeed: 0.9, // top speed walking back to his spot after a fling or a drag: an unhurried waddle
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
