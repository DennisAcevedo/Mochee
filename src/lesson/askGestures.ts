import type { AskGesture } from '../../shared/askTypes'
import type { LoopClip, OneShotClip } from '../state/director'

// Which of Gemini's answer gestures loop for the length of the answer and which
// fire once. Frontend only: the clip types belong to the animation side, so they
// stay out of the shared /api/ask contract.
export const isLoopGesture = (g: AskGesture): g is AskGesture & LoopClip =>
  g === 'talk' || g === 'point_left' || g === 'point_right' || g === 'think'
export const isOneShotGesture = (g: AskGesture): g is AskGesture & OneShotClip => !isLoopGesture(g)
