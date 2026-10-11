import { nextCelebration } from '../../lesson/runner'
import { useDirector, type LoopClip, type OneShotClip } from '../../state/director'
import { useWindows } from '../../state/windows'
import { anchors } from '../anchors'
import { POINTING, SPOTS, WINDOW_TIGHT_POSES } from '../layout3d'
import { pointSide } from './pointAt'
import { pointReadyAt } from './pointReady'

// Keeps his gestures out of the browser window on his left:
// - startLoop: he points (point_left) only while the window has focus and the
//   camera has finished panning to it (pointReadyAt); until the pan settles he
//   talks, then switches to the point if the line is still his.
// - clearCelebration: a right-answer dance that does not reach into the window
//   from where he stands (WINDOW_TIGHT_POSES).

export const pointReady = (): boolean => pointReadyAt(anchors.camera.x, useDirector.getState().focus, useWindows.getState().maximized, pointSide())

// Plays `loop` through `set`. A point_left waits for pointReady() with talk in
// its place; `stillMine` (checked on each poll) says the caller's line is
// still the one playing, so a finished or replaced line stops the wait.
export function startLoop(loop: LoopClip, set: (loop: LoopClip) => void, stillMine: () => boolean): void {
  if (loop !== 'point_left' || pointReady()) return set(loop)
  set('talk')
  if (useDirector.getState().focus === 'none') return // nothing to point at: he talks the line through
  const timer = setInterval(() => {
    if (!stillMine() || useDirector.getState().focus === 'none') return clearInterval(timer)
    if (!pointReady()) return
    clearInterval(timer)
    set('point_left')
  }, POINTING.pollMs)
}

// The next right-answer celebration (runner.ts nextCelebration: random, never
// the same twice running), re-rolled a few times while he stands near the left
// spot (anchors.tutor: his head, over his root while he stands) and it is one
// of the WINDOW_TIGHT_POSES; 'celebrate' if every roll is.
export function clearCelebration(): OneShotClip {
  const tight = WINDOW_TIGHT_POSES.poses as readonly string[]
  if (anchors.tutor.x > SPOTS.left.x + WINDOW_TIGHT_POSES.near) return nextCelebration()
  for (let i = 0; i < 4; i++) {
    const c = nextCelebration()
    if (!tight.includes(c)) return c
  }
  return 'celebrate'
}
