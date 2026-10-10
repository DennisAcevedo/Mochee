import { useEffect } from 'react'
import { useLessonPack } from '../../lesson/packSession'
import { useWalkthrough } from '../../lesson/runner'
import type { ResolvedStep } from '../../lesson/walkthrough'
import { useDirector } from '../../state/director'
import { useTutorStore } from '../../state/store'
import { useWindows } from '../../state/windows'
import { asStudent, reopenFor, revealsBoard, trimAfterClose } from './lessonNeed'
import { lessonNotes } from './tabInfo'
import { trimNotes, WIN, type LessonContent, type Tab } from './tabModel'

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
// The window -> lesson rule itself (reopenFor, trimAfterClose) lives in
// lessonNeed.ts, where the Node tests drive it.

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
// (five sections = five notes tabs), else the hand-written notes.
const noteOfLine = (id: string) => lessonNotes().findIndex((t) => t.lines.some((l) => l.id === id))

// A minimized or closed window comes back before the tutor points at it.
const need = (content: LessonContent) => reopenFor(content)

const needNotes = (i: number) => need({ kind: 'notes', note: Math.max(0, Math.min(lessonNotes().length - 1, i)) })
const needBoard = () => need(useTutorStore.getState().mode === 'quiz' ? { kind: 'quiz' } : { kind: 'board' })

function needStep(step: ResolvedStep | undefined) {
  if (!step) return
  if (step.focus === 'notes' || step.highlight) needNotes(step.notesTab)
  if (step.focus === 'board') need(step.mode === 'quiz' ? { kind: 'quiz' } : { kind: 'board' })
}

function connect(): () => void {
  const offDirector = useDirector.subscribe((s, p) => {
    if (s.notesTab !== p.notesTab) needNotes(s.notesTab)
    if (s.highlight && s.highlight !== p.highlight) {
      const i = noteOfLine(s.highlight)
      if (i >= 0) needNotes(i)
    }
    if (s.focus !== p.focus) {
      if (s.focus === 'notes') needNotes(s.notesTab)
      else if (s.focus === 'board') needBoard()
    }
    if (revealsBoard(s.boardReveal, p.boardReveal) && useTutorStore.getState().mode === 'lecture') needBoard()
  })
  const offTutor = useTutorStore.subscribe((s, p) => {
    if (s.mode !== p.mode) need(s.mode === 'quiz' ? { kind: 'quiz' } : { kind: 'board' })
  })
  // Every step the walkthrough (re)applies: catches a tab (or the window)
  // closed since the last time the lesson asked for it, even when the request is unchanged.
  const offWalk = useWalkthrough.subscribe((s, p) => {
    const applied = s.index !== p.index || (s.phase !== p.phase && (s.phase === 'walking' || (s.phase === 'speaking' && p.phase !== 'walking')))
    if (applied && s.started) needStep(s.steps[s.index])
  })
  // A pack started or ended: notes tabs past its last section go, and the
  // strip is republished even when none did, so every notes tab title
  // (tabInfo reads the pack) re-renders with the new document's sections.
  const offPack = useLessonPack.subscribe((s, p) => {
    if (s.pack === p.pack) return
    const tabs = trimNotes(useWindows.getState().tabs, lessonNotes().length)
    useWindows.setState({ tabs: { ...tabs, notes: { ...tabs.notes } } })
  })
  // The red light rebuilt the lesson tabs from the hand-written notes: fit
  // them to the running pack's sections.
  const offClose = useWindows.subscribe((s, p) => {
    if (s.closed && !p.closed) trimAfterClose(lessonNotes().length)
  })
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
