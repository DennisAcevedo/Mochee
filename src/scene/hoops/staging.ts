import { stateOfClip } from '../../character/blender/animController.ts'
import { ANIM_STATES } from '../../character/blender/config.ts'
import { laneZ } from '../../lesson/roam.ts'
import type { Clip, OneShotClip, Spot } from '../../state/director.ts'

// Where a ball move starts, and how it hands the stage back afterwards
// (BallProp.tsx). Pure: tests/character/hoops.test.ts runs it in node.

type Spots = Record<Spot, { x: number; z: number }>

// Where his feet are headed: BlenderTutor's walk target (stepped aside, then
// roaming, then the lesson's spot; free x's ride the lane's depth). A move asked
// for while the lesson walks him between spots starts there, not where he
// happens to be: pausing the lesson does not stop a walk already under way.
export function walkTarget(d: { spot: Spot; roamX: number | null; asideX: number | null }, spots: Spots): { x: number; z: number } {
  const free = d.asideX ?? d.roamX
  return free === null ? { x: spots[d.spot].x, z: spots[d.spot].z } : { x: free, z: laneZ(free, spots) }
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
