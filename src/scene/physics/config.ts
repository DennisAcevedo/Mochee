import { LOOP_CLIPS, ONESHOT_CLIPS, type LoopClip, type OneShotClip } from '../../state/director'
import { FLOOR_Y, PALETTE, ROOM, TUTOR_SCALE, WINDOW } from '../layout3d'

// Every number for physics play (drag, throw, bounce, toys) lives here. World
// units are the room's (layout3d.ts); the tutor's model units are the classic
// rig's (body radius 0.8, about 2.6 tall to the cap top).

const BODY_RADIUS = 0.8 // model units
const TUTOR_HEIGHT = 2.6 // model units, feet to cap top

// The room's inner faces, derived once from layout3d.
export const ROOM_BOX = {
  halfW: ROOM.width / 2,
  floorY: FLOOR_Y,
  ceilY: FLOOR_Y + ROOM.height,
  backZ: -ROOM.backZ,
  frontZ: 2.0, // invisible front wall: just inside the lesson camera's lower frame edge, so nothing rolls out of view
} as const

export const PHYSICS = {
  gravity: [0, -15, 0] as [number, number, number], // above 9.81: snappier cartoon arcs that stay under the ceiling
  timeStep: 1 / 60,
  maxDt: 0.05, // frame delta clamp for our own springs and timers
  wallThickness: 0.6, // thick fixed boxes so fast flings never tunnel through
  restitution: 0.45, // walls, floor and the tutor
  friction: 0.7,

  // Pointer pick-up: a press becomes a hold after this long or this far.
  grab: {
    holdMs: 160,
    movePx: 6,
    lift: 0.25, // world units: held things float a little above the pointer's plane point
    springRate: 16, // critically damped spring rate toward the pointer (1/s)
    velocityWindowMs: 90, // fling velocity = pointer travel over the last this-many ms
    samples: 8, // ring buffer size for the velocity window
  },

  tutor: {
    radius: BODY_RADIUS * TUTOR_SCALE, // capsule radius: the gumdrop body
    halfHeight: Math.max(0.05, (TUTOR_HEIGHT * TUTOR_SCALE) / 2 - BODY_RADIUS * TUTOR_SCALE), // straight part of the capsule
    centerY: (TUTOR_HEIGHT * TUTOR_SCALE) / 2, // capsule centre above his feet
    density: 1,
    linearDamping: 0.12,
    angularDamping: 0.7,
    maxFlingSpeed: 13, // world units per second
    spinPerSpeed: 0.9, // tumble rad/s per unit of fling speed
    maxSpin: 11,
    settleSpeed: 0.35, // under this speed (and spin) he counts as settled...
    settleSpin: 0.8,
    settleSeconds: 0.35, // ...for this long, then he recovers
    maxFlightSeconds: 6, // recover anyway after this long
    recoverSeconds: 0.5, // ease upright and onto the landing spot
    recoverHop: 0.22, // small hop while he pops upright
    returnDamp: 3, // study mode, without a Blender tutor to walk him: glide back onto the director's spot (exponential rate)
    swing: { gain: 0.07, max: 0.45, damp: 9 }, // held: lean against the drag velocity
    toss: { side: 3.2, up: 8.5, back: -0.6 }, // tossTutor(): launch velocity (side alternates)
    landing: { xMax: 3.4, zMin: -3.0, zMax: ROOM_BOX.frontZ - BODY_RADIUS * TUTOR_SCALE }, // where he may stand after a fling
    // What knocked him over (useTumbles), judged when he lands. First match wins: shaken, bonk, flicked, thrown, dropped.
    tumble: {
      shakeMinSpeed: 2.5, // held: a sideways drag faster than this (world u/s) counts toward a shake...
      shakeFlips: 4, // ...this many direction reversals...
      shakeWindow: 1.2, // ...within this many seconds = shaken
      bonkSpeed: 4, // flying: reaching a wall or the ceiling faster than this = bonk
      bonkMargin: 0.08, // world units of slack beyond the capsule when testing wall contact
      flickHeldSeconds: 0.3, // held for less than this...
      flickSpeed: 3, // ...and let go faster than this = flicked
      thrownSpeed: 5.5, // any other release (or toss) faster than this = thrown
      dropHeight: 0.9, // fell more than this (feet, world units) from his highest point = dropped
    },
  },

  // A basketball sized to the one in his hands in the play_* clips (model radius 0.2, BLENDER/tutor/author_play.py).
  ball: {
    radius: 0.2 * TUTOR_SCALE,
    color: '#F08A24', // basketball orange
    stripe: '#3A2416', // the seams
    density: 0.6,
    restitution: 0.72,
    friction: 0.5,
    linearDamping: 0.02,
    angularDamping: 0.3,
    spawn: [1.75, FLOOR_Y + 0.2 * TUTOR_SCALE, 1.3] as [number, number, number],
    spinPerSpeed: 2.5,
  },

  hoop: {
    // Rim centre: high on the right side wall, the free side of the stage.
    rim: [ROOM.width / 2 - 0.62, 2.05, -2.6] as [number, number, number],
    rimRadius: 0.45,
    tube: 0.035,
    rimColor: PALETTE.coral,
    rimBalls: 14, // the rim collider is a ring of small balls (Rapier has no torus)...
    rimBallRadius: 0.035 * 1.4, // ...a little fatter than the drawn tube, so the gaps between them stay narrow
    board: { width: 1.25, height: 0.85, thick: 0.06, above: 0.32, color: '#ffffff', edge: PALETTE.indigo },
    net: { depth: 0.36, bottomScale: 0.62, color: PALETTE.violet, opacity: 0.55 },
    aimBelow: 0.06, // shootBall() aims this far under the rim plane, at the rim's centre
    shot: { apexBelowCeil: 0.3, minRise: 1.1, minApexGap: 0.3, launchGap: 0.18, lead: 0.12 }, // shootBall(): pops off his head (gap above the cap), apex under the ceiling, aims `lead` past the rim centre so the arc clears the near rim
  },

  // A thin collider for the floating browser window so toys bounce off it.
  windows: [WINDOW].map((w) => ({ position: w.position, yaw: w.yaw, half: [w.width / 2, w.height / 2, 0.05] as [number, number, number] })),

  respawnMargin: 1.2, // a body this far outside the room is put back
} as const

// The backboard's box against the right wall (centre, half extents): the hoop's collider and
// the student-shot watch (src/scene/hoops/studentShot.ts) share it.
export const HOOP_BOARD = {
  center: [ROOM_BOX.halfW - PHYSICS.hoop.board.thick / 2, PHYSICS.hoop.rim[1] + PHYSICS.hoop.board.above, PHYSICS.hoop.rim[2]] as [number, number, number],
  half: [PHYSICS.hoop.board.thick / 2, PHYSICS.hoop.board.height / 2, PHYSICS.hoop.board.width / 2] as [number, number, number],
} as const

// Clips used while playing, read defensively from the director contract: the
// Blender pass adds dragged / tumble / recover / surprise later, so until
// then each one falls back to a clip that exists today.
const hasLoop = (name: string): name is LoopClip => (LOOP_CLIPS as readonly string[]).includes(name)
const hasOneShot = (name: string): name is OneShotClip => (ONESHOT_CLIPS as readonly string[]).includes(name)
const loopOr = (name: string, fallback: LoopClip): LoopClip => (hasLoop(name) ? name : fallback)
const oneShotOr = (name: string, fallback: OneShotClip | null): OneShotClip | null => (hasOneShot(name) ? name : fallback)

export const PLAY_CLIPS = {
  held: loopOr('dragged', 'listen'),
  flying: loopOr('tumble', 'listen'),
  recover: oneShotOr('recover', 'hop'),
  pickUp: oneShotOr('surprise', null),
  score: 'celebrate' as OneShotClip,
  shoot: oneShotOr('highfive', 'hop'), // he pops the ball off his head toward the hoop
} as const
