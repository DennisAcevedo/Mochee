import { isLoopGesture } from '../../lesson/askGestures'
import type { GroundedAnswer } from '../../../shared/docsTypes'
import { nextCelebration, useWalkthrough } from '../../lesson/runner'
import { readingMs, speak } from '../../lesson/speech'
import { useDirector } from '../../state/director'
import type { LatencyTrace } from '../../lesson/latency'
import { startLoop } from '../../scene/windows/pointGate'

// How the tutor on stage reacts to what happens in the drawers: he thinks
// while a document question is pending, says the answer (voice + caption)
// with its gesture, and celebrates or shrugs at quiz results. The guided
// lesson holds while he answers and picks back up after.

const CUES = {
  safetyMs: 15_000, // allow the speech transport's 14-second deadline before releasing the stage
} as const

let turn = 0
let thinking = false // the think loop is ours, for a pending chat question

function finish(my: number) {
  if (my !== turn) return
  turn++
  useDirector.getState().setCaption(null)
  useWalkthrough.getState().setLoopOverride(null)
  useDirector.getState().setLoop('idle')
  useWalkthrough.getState().release()
}

// A chat question went out (pending) or came back (not pending). He thinks
// until the answer arrives; performAnswer then takes over. Called by
// CharacterDirector, which watches the chat store.
export function thinkWhileChatPending(pending: boolean) {
  if (pending) {
    if (thinking) return
    thinking = true
    useWalkthrough.getState().hold()
    useWalkthrough.getState().setLoopOverride('think')
    return
  }
  // The answer, if any, is performed in the same task the pending flag drops
  // in (chatStore.send); look once that has run. A failed question just stops thinking.
  queueMicrotask(() => {
    if (!thinking) return
    thinking = false
    if (useWalkthrough.getState().loopOverride === 'think') useWalkthrough.getState().setLoopOverride(null)
    useWalkthrough.getState().release()
  })
}

// Says a grounded answer on stage. Loop cues play for the length of the line;
// one-shot cues fire once while he talks.
export function performAnswer(answer: GroundedAnswer, trace?: LatencyTrace) {
  const my = ++turn
  thinking = false // the answer replaces the think
  const d = useDirector.getState()
  useWalkthrough.getState().hold()
  // Everything he can point at is the window on his left: a 'point_right' cue means it too.
  const cue = answer.cue === 'point_right' ? 'point_left' : answer.cue
  const loop = isLoopGesture(cue) ? cue : 'talk'
  if (!isLoopGesture(cue)) d.play(cue)
  // A point waits for the camera to settle on the focused window, talking until then; with none focused he talks.
  startLoop(loop, (l) => {
    useWalkthrough.getState().setLoopOverride(l)
    useDirector.getState().setLoop(l)
  }, () => my === turn && useWalkthrough.getState().loopOverride === 'talk')
  d.setCaption(answer.answer)
  speak(answer.answer, () => finish(my), trace)
  setTimeout(() => finish(my), readingMs(answer.answer) + CUES.safetyMs)
}

// Quiz result on stage: a celebration (never the same twice running) and
// confetti, or a shrug.
export function performQuizResult(correct: boolean) {
  const d = useDirector.getState()
  if (!correct) {
    d.play('shrug', { urgent: true }) // the student's answer wins over anything still queued
    return
  }
  d.play(nextCelebration())
  d.burst('confetti')
}
