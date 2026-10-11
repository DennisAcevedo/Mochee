import { useEffect } from 'react'
import { useLessonPack } from '../../lesson/packSession'
import { useWalkthrough } from '../../lesson/runner'
import { useDirector } from '../../state/director'
import { useTutorStore } from '../../state/store'
import { useWindows } from '../../state/windows'
import { asStudent, onDirector, onMode, onPack, onStep, onWindows, stepApplied, type LessonCtx } from './lessonNeed'
import { lessonNotes } from './tabInfo'
import { WIN, type Tab } from './tabModel'

// Keeps the guided lesson working whatever the student did to the window.
//
// Lesson -> window: when the walkthrough switches the notes tab, focuses the
// window ('notes' or 'board'), highlights a line, reveals the board or opens
// the Quick check, the window comes back if it was minimized or closed, and
// the tab it needs is reopened if it was closed and activated (ensureLessonTab).
//
// Tabs -> lesson: a student click on a lesson tab drives the director and the
// tutor store the way the old tab buttons did (setNotesTab, setMode), inside
// asStudent() so the subscriptions below don't treat it as a lesson request.
//
// The subscription bodies (onDirector, onMode, onStep, onPack, onWindows)
// live in lessonNeed.ts, where the Node tests fire them with real store updates.

// A student activated `tab`: show it, and tell the lesson for lesson tabs.
export function activateByStudent(tab: Tab) {
  asStudent(() => {
    useWindows.getState().activateTab(WIN, tab.id)
    if (tab.kind === 'notes') useDirector.getState().setNotesTab(tab.note)
    else if (tab.kind === 'board') useTutorStore.getState().setMode('lecture')
    else if (tab.kind === 'quiz') useTutorStore.getState().setMode('quiz')
  })
}

// Notes tab indexes run over lessonNotes(): a pack's sections while one runs
// (five sections = five notes tabs), else the hand-written notes. Read when a
// handler fires, so a pack that starts later is seen.
const ctx = (): LessonCtx => ({
  mode: useTutorStore.getState().mode,
  noteCount: lessonNotes().length,
  noteOfLine: (id) => lessonNotes().findIndex((t) => t.lines.some((l) => l.id === id)),
})

function connect(): () => void {
  const offDirector = useDirector.subscribe((s, p) => onDirector(s, p, ctx()))
  const offTutor = useTutorStore.subscribe(onMode)
  const offWalk = useWalkthrough.subscribe((s, p) => {
    if (stepApplied(s, p) && s.started) onStep(s.steps[s.index], ctx())
  })
  const offPack = useLessonPack.subscribe((s, p) => {
    if (s.pack !== p.pack || s.empty !== p.empty) onPack(lessonNotes().length)
  })
  const offClose = useWindows.subscribe((s, p) => onWindows(s, p, lessonNotes().length))
  return () => {
    offDirector()
    offTutor()
    offWalk()
    offPack()
    offClose()
  }
}

// The window calls this while it is mounted: one live connection.
export function useLessonTabs() {
  useEffect(connect, [])
}
