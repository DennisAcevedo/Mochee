import { useMode } from '../../state/mode'
import { playHandlers, usePlayBody } from '../physics/playBody'
import type { MoveKind } from './config'
import { useHoops } from './hoopsStore'

// The Play tab's ball moves, for the HUD. Each asks BallProp (src/scene/hoops/BallProp.tsx)
// to run the move and returns false when it can't start: study mode, he is
// held or flying, someone holds the ball, or a move is already running.

export function startBallMove(kind: MoveKind): boolean {
  if (useMode.getState().mode === 'study') return false
  if (usePlayBody.getState().state !== 'idle') return false
  const ball = playHandlers.ball
  if (!ball?.body() || ball.busy()) return false
  return useHoops.getState().ask(kind)
}

export const shootHoops = () => startBallMove('shoot')
export const dribbleBall = () => startBallMove('dribble')
export const kickBall = () => startBallMove('kick')
export const juggleBall = () => startBallMove('juggle')
export const dunkBall = () => startBallMove('dunk')
