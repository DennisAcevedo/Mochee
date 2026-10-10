import { isLoopGesture } from '../../lesson/askTypes'
import type { GroundedAnswer } from '../../lesson/docsTypes'
import { useWalkthrough } from '../../lesson/runner'
import { readingMs, speak } from '../../lesson/speech'
import { useDirector } from '../../state/director'
import { unlockedDances, useProgress } from '../../state/progress'

// How the tutor on stage reacts to what happens in the drawers: he says a
// document answer (voice + caption) with its gesture, and dances or shrugs at
// quiz results. The guided lesson holds while he answers and picks back up after.

const CUES = {
  safetyMs: 8000, // past the reading estimate: give the stage back even if the voice never ended
} as const

let turn = 0

function finish(my: number) {
  if (my !== turn) return
  turn++
  useDirector.getState().setCaption(null)
  useWalkthrough.getState().setLoopOverride(null)
  useDirector.getState().setLoop('idle')
  useWalkthrough.getState().release()
}

// Says a grounded answer on stage. Loop cues play for the length of the line;
// one-shot cues fire once while he talks.
export function performAnswer(answer: GroundedAnswer) {
  const my = ++turn
  const d = useDirector.getState()
  useWalkthrough.getState().hold()
  const loop = isLoopGesture(answer.cue) ? answer.cue : 'talk'
  if (!isLoopGesture(answer.cue)) d.play(answer.cue)
  useWalkthrough.getState().setLoopOverride(loop)
  d.setLoop(loop)
  d.setCaption(answer.answer)
  speak(answer.answer, () => finish(my))
  setTimeout(() => finish(my), readingMs(answer.answer) + CUES.safetyMs)
}

// Quiz result on stage: an unlocked dance and confetti, or a shrug.
export function performQuizResult(correct: boolean) {
  const d = useDirector.getState()
  if (!correct) {
    d.play('shrug')
    return
  }
  const dances = unlockedDances(useProgress.getState().level)
  d.play(dances[Math.floor(Math.random() * dances.length)] ?? 'celebrate')
  d.burst('confetti')
}
