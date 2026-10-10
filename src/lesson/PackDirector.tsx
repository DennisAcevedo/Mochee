import { useEffect } from 'react'
import { useWalkthrough } from './runner'
import { packToWalkthrough, resolvePackSteps, useLessonPack } from './packSession'
import { RESOLVED_STEPS } from './walkthrough'

// Swaps the walkthrough between the hand-written lesson and a LessonPack.
// Starting a pack (hub Start Tutor Session) restarts the walkthrough from the
// chosen section; clearing it, or leaving the lesson page (class switch),
// returns to the default steps.
export function PackDirector() {
  useEffect(() => {
    const unsub = useLessonPack.subscribe((s, prev) => {
      if (s.pack === prev.pack && s.section === prev.section) return
      const run = useWalkthrough.getState()
      run.stop()
      useWalkthrough.setState({ steps: s.pack ? resolvePackSteps(packToWalkthrough(s.pack, s.section)) : RESOLVED_STEPS })
      if (s.pack) useWalkthrough.getState().start()
    })
    return () => {
      unsub()
      if (useLessonPack.getState().pack) {
        useLessonPack.getState().clear()
        useWalkthrough.getState().stop()
        useWalkthrough.setState({ steps: RESOLVED_STEPS })
      }
    }
  }, [])
  return null
}
