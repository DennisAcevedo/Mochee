import { useContext, useEffect } from 'react'
import { CurrentTutorContext } from '../state/currentTutor'
import { useDirector, type LoopClip } from '../state/director'
import { useTutorStore, type TutorState } from '../state/store'
import { connectLesson, useWalkthrough } from './runner'

// Bridges the tutor store to the director's loop clip and connects the guided
// lesson (voice, quick-check reactions, auto-start after the intro). Renders
// nothing. While the lesson or an answer is presenting, its loopOverride wins;
// otherwise: speaking -> talk, listening -> listen, waiting on a reply -> think.
// The intro owns the stage until the tutor phase is 'live'.

const loopFor = (s: TutorState): LoopClip =>
  s.mic === 'speaking' ? 'talk' : s.mic === 'listening' ? 'listen' : s.awaitingReply ? 'think' : 'idle'

export function StageDirector({ autoStart = true }: { autoStart?: boolean }) {
  const tutorId = useContext(CurrentTutorContext)?.id
  const override = useWalkthrough((s) => s.loopOverride)
  const fallback = useTutorStore(loopFor)
  const live = useTutorStore((s) => s.phase === 'live')
  const loop = override ?? fallback

  useEffect(() => connectLesson({ autoStart, tutorId }), [autoStart, tutorId])

  useEffect(() => {
    if (live) useDirector.getState().setLoop(loop)
  }, [live, loop])

  return null
}
