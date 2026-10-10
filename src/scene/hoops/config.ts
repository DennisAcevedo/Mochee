import type { LoopClip, OneShotClip } from '../../state/director'
import { PALETTE } from '../layout3d'

// Every number for the Play tab's ball moves (src/scene/hoops). World units
// (src/scene/layout3d.ts) unless a line says model units (the Blender rig's,
// BLENDER/tutor/author_play.py); seconds; radians. The ball itself, the hoop,
// gravity and the room are the physics toys' (src/scene/physics/config.ts).

export type MoveKind = 'shoot' | 'dribble' | 'kick' | 'juggle' | 'dunk'

// The Blender clip each move plays (one-shots, or a loop held for `loops` cycles).
export const MOVE_CLIPS = {
  shoot: 'play_shoot',
  dunk: 'play_dunk',
  kick: 'play_kick',
  dribble: 'play_dribble',
  juggle: 'play_juggle',
} as const satisfies Record<MoveKind, OneShotClip | LoopClip>

export const HOOPS = {
  modelG: 9.8, // model units / s^2: the authored dribble and juggle arcs (author_play.py)

  // Before a move the ball hops from wherever it lies into his hands (or onto his kick spot):
  // an arc peaking this far above the higher end, plus a share of the distance, at most `maxLift`.
  gather: { lift: 0.3, liftPerUnit: 0.12, maxLift: 1.1 },

  shot: {
    maxRange: 4.4, // horizontal distance to the rim he shoots from; farther and he steps in first...
    approach: 4.1, // ...to this distance
    laneMaxX: 2.1, // but never further toward the hoop than this (world x)
    faceMax: 1.4, // he turns at most this far from the camera to face the hoop (about 80 deg: side-on, his face still shows)
    apexAboveRim: 0.7, // the arc peaks this far above the rim (keeps it in the lesson camera's frame)...
    apexBelowCeil: 0.25, // ...and at least this far under the ceiling (ball top)
    odds: { swish: 0.62, rimIn: 0.2, rimOut: 0.18 },
    contactAngle: 0.55, // a rim hit's contact normal, tilted this far from straight up
    rimInHop: 0.24, // rim-in: the pop off the rim peaks this far above the contact
    // Rim-out: bounce speed out and up; seconds before physics takes over; the bounce's horizontal
    // direction. Sideways toward the room's middle (screen-left): straight back toward him runs at
    // the camera, which from the front reads as dropping over the rim into the net. A low bounce:
    // a high one hides behind the Play HUD bar, which sits just above the hoop at laptop sizes.
    rimOut: { out: 2.6, up: 2.0, clear: 0.12, dir: { x: -1, y: 0, z: 0.25 } },
    net: { k: 10, keep: 0.55, maxOff: 0.12 }, // in the net: horizontal relax rate, drop speed kept, max offset from the rim axis
    exitSpeed: 1.2, // drops out of the net drifting this fast toward the room's middle...
    exitToward: { x: 0, y: 0, z: 1 }, // ...this point, so it bounces back into view
  },

  dribble: { loops: 4, endOn: 'push', nudge: 1.3 }, // loop cycles (0.8 s, two dribbles each), then he lets go on a push; the ball rolls off toward the camera this fast
  // Loop cycles (0.8 s, two touches each), then the last touch pops it up this much harder and forward.
  // `g` (model units / s^2) is the arc between touches: the clip's 0.4 s touches under real gravity only
  // lift the ball 0.2 (the authored apex keeps it clear of his belly), too little to read as keepy-uppy,
  // so it flies a stiffer arc between the same touches: up about 0.4, to his chest (higher hides his face).
  juggle: { loops: 4, endOn: 'contact', pop: 1.5, nudge: 1.6, g: 20 },
  kick: { speed: 8.5, face: 1.3 }, // the kick's launch speed along the authored direction; he first turns this far (rad) toward the far side of the room, side-on with his face still showing
  dunk: {
    speed: 6.5, // the slam's launch speed along the authored direction
    rimDrop: 0.3, // model units: the pop-up hoop's rim sits this far along the slam from the release
    rimRadius: 0.34, // model units
    tube: 0.035,
    netDepth: 0.36,
    boardGap: 0.12, // model units between the rim and the board (on his left, the viewer's right)
    board: { width: 0.9, height: 0.66, thick: 0.05, above: 0.24 },
    pole: 0.05, // model units: the stand's radius
    popLead: 0.5, // seconds before the slam the hoop springs up...
    popSeconds: 0.28, // ...taking this long
    stayAfter: 0.9, // seconds it stays after the slam, then sinks away as fast
    colors: { rim: PALETTE.coral, net: PALETTE.violet, board: '#ffffff', frame: PALETTE.indigo, pole: '#cfd3e6' },
  },

  handoffFrames: 2, // frames the drawn ball keeps flying after physics takes over, so the swap never jumps back
  spinPerSpeed: 2.5, // the drawn ball's roll, rad/s per unit of speed

  // Seconds a phase may wait before the move gives up (he was grabbed, a clip went missing).
  // react: for the move's clip to end, then for the reaction to start; after: the whole
  // reaction beat (a level-up that cuts in included) before the move hands the stage back.
  timeouts: { approach: 5, start: 3, clip: 8, react: 3, after: 6 },
  settleYaw: 0.14, // facing within this of the target counts as turned
  arriveEps: 0.06, // standing within this of the approach spot counts as arrived

  // What he does after a move.
  react: { make: 'celebrate', miss: 'shrug', trick: 'hop' } as const satisfies Record<string, OneShotClip>,
} as const
