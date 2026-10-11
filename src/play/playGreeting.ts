import { useContext, useEffect } from 'react'
import { sayLine, useWalkthrough } from '../lesson/runner'
import { useDirector } from '../state/director'
import { useMode } from '../state/mode'
import { useTutorStore } from '../state/store'
import { PLAY_WELCOME } from './playLines'
import { CurrentTutorContext } from '../state/currentTutor'
import { roomVisits } from './roomVisits'

// One automatic welcome per tutor, even if it is interrupted or the page reloads.
export function usePlayGreeting() {
  const tutorId = useContext(CurrentTutorContext)?.id ?? 'session'
  useEffect(() => {
    let timer = 0
    let disposed = false
    const enter = () => {
      window.clearTimeout(timer)
      timer = 0
      if (useMode.getState().mode !== 'play' || useTutorStore.getState().phase !== 'live') return
      if (!roomVisits.enter(tutorId, 'play')) return
      timer = window.setTimeout(() => {
        // Still in play, live, and not already answering a question.
        if (useMode.getState().mode !== 'play') return
        const t = useTutorStore.getState()
        if (t.phase !== 'live' || t.awaitingReply) return
        const line = PLAY_WELCOME.first
        useDirector.getState().play('wave', { vary: true })
        useWalkthrough.getState().hold()
        sayLine(line, () => useWalkthrough.getState().release())
      }, PLAY_WELCOME.delayMs)
    }
    const off = useMode.subscribe((s, prev) => {
      if (s.mode !== prev.mode) enter()
    })
    const offPhase = useTutorStore.subscribe((s, prev) => { if (s.phase !== prev.phase) enter() })
    // StrictMode runs setup/cleanup once before the real mounted effect.
    queueMicrotask(() => { if (!disposed && !timer) enter() })
    return () => {
      disposed = true
      off()
      offPhase()
      window.clearTimeout(timer)
    }
  }, [tutorId])
}
