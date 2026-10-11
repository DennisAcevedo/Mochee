import { stateOfClip } from '../../character/blender/animController.ts'
import { ANIM_STATES } from '../../character/blender/config.ts'
import { laneZ } from '../../lesson/roam.ts'
import type { Clip, OneShotClip, Spot } from '../../state/director.ts'

// Where a ball move starts, how it hands the stage back afterwards, and when
// it yields to the lesson (BallProp.tsx). Pure: tests/character/hoops.test.ts
// and hoopsLesson.test.ts run it in node.

type Spots = Record<Spot, { x: number; z: number }>

// Where his feet are headed: BlenderTutor's walk target (stepped aside, then
// roaming, then the lesson's spot; free x's ride the lane's depth). A move asked
// for while the lesson walks him between spots starts there, not where he
// happens to be: pausing the lesson does not stop a walk already under way.
export function walkTarget(d: { spot: Spot; roamX: number | null; asideX: number | null }, spots: Spots): { x: number; z: number } {
  const free = d.asideX ?? d.roamX
  return free === null ? { x: spots[d.spot].x, z: spots[d.spot].z } : { x: free, z: laneZ(free, spots) }
}

// ---- Fetching the ball. In Play his body is a kinematic capsule that shoves whatever it walks
// into, so he stops where it clears the ball: on his side of it, at least `standOff` short along
// x, and far enough that the straight walk there (motion.ts heads straight at its target) keeps
// `clear` (his radius + the ball's + a margin) between his centre line and the ball's centre. If
// he already stands nearer than that, the walk only may not take him any closer. Motion
// coordinates (the director's, before his landing offset); `lane(x)` is the lane's depth at x.
type XZ = { x: number; z: number }

export interface FetchOpts {
  standOff: number // the least he stops short of the ball, along x
  slack: number // a walk already ending this much further out still counts as close enough
  clear: number // centre-to-centre gap the walk keeps from the ball (horizontal)
  step: number // search step for the stop, along x
  xMin: number // the landing range he may stand in
  xMax: number
}

// Horizontal distance from `p` to the segment a -> b.
export function segmentDistance(a: XZ, b: XZ, p: XZ): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z)
}

// Where he stops for the ball (motion x), or null when the walk he is on (`at` -> `dest`) already
// ends close enough and clear of it.
export function fetchStop(at: XZ, dest: XZ, ball: XZ, o: FetchOpts, lane: (x: number) => number): number | null {
  const keep = Math.min(o.clear, Math.hypot(at.x - ball.x, at.z - ball.z)) - 1e-6
  const clearTo = (x: number, z: number) => segmentDistance(at, { x, z }, ball) >= keep
  const side = ball.x >= at.x ? 1 : -1
  let x = ball.x
  for (let sx = o.standOff; sx <= o.standOff + o.clear + 1; sx += o.step) {
    x = Math.min(Math.max(ball.x - side * sx, o.xMin), o.xMax)
    if (clearTo(x, lane(x))) break
  }
  const close = Math.abs(ball.x - dest.x) <= Math.abs(ball.x - x) + o.slack
  return close && clearTo(dest.x, dest.z) ? null : x
}

// The beat after a move. He turns back to the camera and reacts (celebrate,
// shrug, hop); only once that has played out does the move hand the stage back,
// so a resumed lesson can't walk him off mid-reaction (a walk cuts a one-shot)
// and a new move's clip can't cut it either.
export type AfterStep = 'ask' | 'skip' | 'wait' | 'finish'

export interface AfterState {
  react: OneShotClip | null // the reaction still to play (null: none, or skipped)
  moveClip: OneShotClip | null // the move's own one-shot, which may still be fading out
  asked: boolean // the reaction has been requested...
  seen: boolean // ...and seen playing
  dropped: boolean // the animation controller dropped it (cooldown, blocked, expired)
  oneShot: OneShotClip | null // the one-shot playing now (tutorStatus.anim)
  queued: OneShotClip | null // the one waiting in the controller's queue slot
  still: boolean // standing, turned back to the camera
  levelUp: boolean // the move's XP levelled him up and LevelWatcher's 'levelup' has not started yet (once it plays, oneShot holds the beat)
  t: number // seconds since the beat began
}

const priority = (clip: Clip, kind: 'loop' | 'oneshot') => ANIM_STATES[stateOfClip(clip, kind)].priority

// Whether a one-shot playing or queued (`other`, e.g. a level-up) keeps `clip` from showing: it ranks
// above it. A one-shot clip asked for under it waits in the queue and expires there (a level-up's
// 2.6 s outlasts the queue's 1.2 s); a loop plays on underneath it.
export function outranks(other: OneShotClip | null, clip: Clip, kind: 'loop' | 'oneshot' = 'oneshot'): boolean {
  return other !== null && other !== clip && priority(other, 'oneshot') > priority(clip, kind)
}

// timeouts.react: how long an asked reaction may take to start; timeouts.after: the whole beat at most.
export function afterStep(s: AfterState, timeouts: { react: number; after: number }): AfterStep {
  if (s.t > timeouts.after) return 'finish'
  if (s.react && !s.asked) {
    // A level-up off this move's XP (LevelWatcher asks for it a beat after the award) outranks the
    // reaction and would cut it a moment in: it stands in for the reaction. So does anything else that outranks it.
    if (s.levelUp) return 'skip'
    const rival = (s.oneShot !== s.moveClip ? s.oneShot : null) ?? (s.queued !== s.moveClip ? s.queued : null)
    return outranks(rival, s.react) ? 'skip' : 'ask'
  }
  // Asked but not started: he is still turning back, or it waits in the queue.
  if (s.react && !s.seen && !s.dropped && s.t <= timeouts.react) return 'wait'
  // The level-up is on its way.
  if (s.levelUp && s.t <= timeouts.react) return 'wait'
  // Whatever plays now (the reaction, or a level-up that cut in) plays out first.
  if (s.oneShot || s.queued || !s.still) return 'wait'
  return 'finish'
}

// ---- The lesson around play. The walkthrough as these rules see it: `presenting` is
// runner.ts's presenting(phase) (walking him to a spot, saying a line, the gap between).
export interface LessonView {
  playing: boolean
  presenting: boolean
}

// The lesson took the stage mid-move: it started presenting where it wasn't. That already
// walked him off or started a line (resume() runs the step at once), so a ball move yields
// right away instead of fighting it: a ball still on him drops to physics where it is, one
// already in flight finishes its path, and no reaction plays (BallProp.tsx). In Play the
// runner's gate (src/play/lessonMode.ts) keeps the lesson from presenting at all and its own
// controls take the student back to Study, which ends a move at once; this is the backstop.
export function lessonTakesStage(prev: LessonView, now: LessonView): boolean {
  return now.presenting && !prev.presenting
}
