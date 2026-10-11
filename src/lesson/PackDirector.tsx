import { useEffect } from 'react'
import { useTutorStore } from '../state/store'
import { fetchLessonPack } from '../ui/Drawers/docsClient'
import { useDocs } from '../ui/Drawers/docsStore'
import { useWalkthrough } from './runner'
import { emptyWalkthrough, packToWalkthrough, resolvePackSteps, useLessonPack } from './packSession'
import { RESOLVED_STEPS } from './walkthrough'

// Picks the lesson a tutor teaches and swaps the walkthrough to match:
// - the built-in CS111 tutor (or one made from the sample CS111 notes) plays
//   the hand-written lesson;
// - any other tutor plays a LessonPack: the document it was made from
//   (`lessonDoc`), else the newest document in its class that has topics;
// - a tutor with no notes at all gets the one-step "add your notes" lesson,
//   and switches to a real one as soon as a document lands in its class.
// Starting a pack from the hub (Start Tutor Session) restarts the walkthrough
// from the chosen section. Leaving the page returns to the default steps.

interface Props {
  tutorId: string
  name: string
  builtIn: boolean
  lessonDoc?: string
}

const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) => Date.parse(b.createdAt) - Date.parse(a.createdAt)

export function PackDirector({ tutorId, name, builtIn, lessonDoc }: Props) {
  useEffect(() => {
    const unsub = useLessonPack.subscribe((s, prev) => {
      if (s.pack === prev.pack && s.section === prev.section && s.empty === prev.empty) return
      const run = useWalkthrough.getState()
      run.stop()
      const steps = s.pack ? packToWalkthrough(s.pack, s.section) : s.empty !== null ? emptyWalkthrough(s.empty) : null
      useWalkthrough.setState({ steps: steps ? resolvePackSteps(steps) : RESOLVED_STEPS })
      // Before the intro hands over, the runner's auto-start begins these steps instead.
      if (s.pack && useTutorStore.getState().phase === 'live') useWalkthrough.getState().start()
    })
    return () => {
      unsub()
      const lp = useLessonPack.getState()
      if (lp.pack || lp.empty !== null) {
        lp.clear()
        useWalkthrough.getState().stop()
        useWalkthrough.setState({ steps: RESOLVED_STEPS })
      }
    }
  }, [])

  useEffect(() => {
    if (builtIn) return
    let current = true
    const failed = new Set<string>() // documents whose lesson could not be built
    let trying: string | null = null

    // Plays a document's lesson; false if it has none.
    const play = async (documentId: string) => {
      trying = documentId
      const res = await fetchLessonPack(documentId)
      if (trying === documentId) trying = null
      if (!current) return true
      if (!res.ok || !res.data.sections.length) {
        failed.add(documentId)
        return false
      }
      // A pack the student picked in the meantime (hub Start Tutor Session) wins.
      if (!useLessonPack.getState().pack) useLessonPack.getState().start(res.data, 0)
      return true
    }

    // The class's newest document with topics, once its list is in.
    const fromClass = () => {
      const docs = useDocs.getState()
      if (!current || docs.tutorId !== tutorId || docs.status !== 'ready' || trying || useLessonPack.getState().pack) return
      const next = [...docs.documents].sort(newestFirst).find((d) => d.topics.length > 0 && !failed.has(d.id))
      if (next) void play(next.id).then((ok) => !ok && fromClass())
      else useLessonPack.getState().setEmpty(name)
    }

    // No notes until shown otherwise, so this tutor never opens on someone else's lesson.
    useLessonPack.getState().setEmpty(name)
    useDocs.getState().setTutor(tutorId)
    if (lessonDoc) void play(lessonDoc).then((ok) => !ok && fromClass())
    else fromClass()
    // A document arriving in the class (an upload in Learning) becomes the lesson.
    const unsub = useDocs.subscribe((s, prev) => {
      if (s.documents !== prev.documents || s.status !== prev.status) fromClass()
    })
    return () => {
      current = false
      unsub()
    }
  }, [tutorId, name, builtIn, lessonDoc])

  return null
}
