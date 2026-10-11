import type { RapierRigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { useDirector } from '../../state/director'
import { HOOP_BOARD, PHYSICS } from '../physics/config'
import type { GrabMagnet } from '../physics/grab'
import { usePlayBody } from '../physics/playBody'
import { armWatch, disarmWatch, newWatch, stepWatch, type BasketGeom } from './basket'
import { HOOPS } from './config'
import { useHoops } from './hoopsStore'
import { vec, type Vec3 } from './shot'

// The student's own shots at the wall hoop (basket.ts decides them). Toys.tsx
// arms the watch when the student lets go of the ball (and when shootBall pops
// it), disarms it when they grab it again, and steps it after every physics
// step; BallProp disarms it when one of his moves takes the ball. A make goes
// on the SHOTS chip (useHoops.recordShot, mirrored into the gym's board) with
// confetti, and he celebrates (shots pay no coins: only learning does); a miss off
// the rim or the board counts as an attempt and he shrugs. A throw that never
// reaches the hoop counts for nothing.

const H = PHYSICS.hoop
const B = HOOPS.basket

const GEOM: BasketGeom = {
  rim: vec(H.rim[0], H.rim[1], H.rim[2]),
  rimRadius: H.rimRadius,
  rimTube: H.rimBallRadius,
  ballRadius: PHYSICS.ball.radius,
  board: { center: vec(...HOOP_BOARD.center), half: vec(...HOOP_BOARD.half) },
}

const watch = newWatch()
const at: Vec3 = vec()
const nudge = new Vector3()

// The grab's pull toward the hoop, for the ball (Toys.tsx): just over the rim.
export const HOOP_MAGNET: GrabMagnet = {
  point: new Vector3(H.rim[0], H.rim[1] + B.magnet.above, H.rim[2]),
  inner: B.magnet.inner,
  outer: B.magnet.outer,
  rate: B.magnet.rate,
  keep: B.magnet.keep,
}

export function armStudentShot(p: { x: number; y: number; z: number }): void {
  armWatch(watch, p)
}

export function disarmStudentShot(): void {
  disarmWatch(watch)
}

// Whether a throw is being watched (browser checks read it).
export const studentShotArmed = (): boolean => watch.armed

// After every physics step, with the ball's body.
export function stepStudentShot(body: RapierRigidBody, dt: number): void {
  if (!watch.armed) return
  const t = body.translation()
  const v = body.linvel()
  at.x = t.x
  at.y = t.y
  at.z = t.z
  const outcome = stepWatch(watch, at, Math.hypot(v.x, v.y, v.z), dt, GEOM, B)
  if (!outcome) return
  const made = outcome !== 'rimOut'
  useHoops.getState().recordShot(outcome)
  const d = useDirector.getState()
  if (made) {
    usePlayBody.getState().scoreHoop()
    d.burst('confetti', 'tutor')
  }
  // He reacts when he is free to: on his feet, no ball move of his running or asked for.
  const h = useHoops.getState()
  if (!h.move && !h.request && usePlayBody.getState().state === 'idle') d.play(made ? HOOPS.react.make : HOOPS.react.miss, { vary: true })
  // Left sitting on the rim: roll it off, away from the hoop's axis.
  if (watch.stuck) {
    nudge.set(t.x - GEOM.rim.x, 0, t.z - GEOM.rim.z)
    if (nudge.lengthSq() < 1e-6) nudge.set(-1, 0, 0)
    nudge.normalize().multiplyScalar(B.nudge)
    nudge.y = B.nudge * 0.5
    body.setLinvel(nudge, true)
  }
}
