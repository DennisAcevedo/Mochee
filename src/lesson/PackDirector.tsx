import { useEffect } from 'react'
import { useTutorStore } from '../state/store'
import { fetchLessonPack } from '../ui/Drawers/docsClient'
import { useWalkthrough } from './runner'
import { packToWalkthrough, resolvePackSteps, useLessonPack } from './packSession'
import { RESOLVED_STEPS } from './walkthrough'

// Swaps the walkthrough between the hand-written lesson and a LessonPack.
// Starting a pack (hub Start Tutor Session) restarts the walkthrough from the
// chosen section; clearing it, or leaving the lesson page (class switch),
// returns to the default steps. A tutor made from its own notes (`lessonDoc`)
// loads that document's pack with the page, so its guided lesson is its notes.
export function PackDirector({ lessonDoc }: { lessonDoc?: string }) {
  useEffect(() => {
    if (!lessonDoc) return
    let current = true
    void fetchLessonPack(lessonDoc).then((res) => {
      // A pack the student picked in the meantime (hub Start Tutor Session) wins.
      if (current && res.ok && res.data.sections.length && !useLessonPack.getState().pack) useLessonPack.getState().start(res.data, 0)
    })
    return () => {
      current = false
    }
  }, [lessonDoc])

  useEffect(() => {
    const unsub = useLessonPack.subscribe((s, prev) => {
      if (s.pack === prev.pack && s.section === prev.section) return
      const run = useWalkthrough.getState()
      run.stop()
      useWalkthrough.setState({ steps: s.pack ? resolvePackSteps(packToWalkthrough(s.pack, s.section)) : RESOLVED_STEPS })
      // Before the intro hands over (a tutor's own lesson, loaded with the
      // page), the runner's auto-start begins these steps instead.
      if (s.pack && useTutorStore.getState().phase === 'live') useWalkthrough.getState().start()
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
