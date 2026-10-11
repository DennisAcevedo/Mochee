import { useEffect } from 'react'
import { sayLine, useWalkthrough } from '../lesson/runner'
import { useDirector } from '../state/director'
import { useMode } from '../state/mode'
import { useTutorStore } from '../state/store'
import { PLAY_WELCOME } from './playLines'

// He welcomes the student each time they walk into the play room (playLines.ts).
let visits = 0

export function usePlayGreeting() {
  useEffect(() => {
    let timer = 0
    const off = useMode.subscribe((s, prev) => {
      if (s.mode === prev.mode) return
      window.clearTimeout(timer)
      if (s.mode !== 'play') return // celebrate has its own invite; Study has the lesson
      timer = window.setTimeout(() => {
        // Still in play, live, and not already answering a question.
        if (useMode.getState().mode !== 'play') return
        const t = useTutorStore.getState()
        if (t.phase !== 'live' || t.awaitingReply) return
        const line = visits === 0 ? PLAY_WELCOME.first : PLAY_WELCOME.again[(visits - 1) % PLAY_WELCOME.again.length]
        visits++
        useDirector.getState().play('wave', { vary: true })
        useWalkthrough.getState().hold()
        sayLine(line, () => useWalkthrough.getState().release())
      }, PLAY_WELCOME.delayMs)
    })
    return () => {
      off()
      window.clearTimeout(timer)
    }
  }, [])
}
