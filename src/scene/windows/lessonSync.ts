import { useEffect } from 'react'
import { notesTabs } from '../../../shared/lessonNotes'
import { useWalkthrough } from '../../lesson/runner'
import type { ResolvedStep } from '../../lesson/walkthrough'
import { useDirector } from '../../state/director'
import { useTutorStore } from '../../state/store'
import { useWindows } from '../../state/windows'
import { homeOf, type LessonContent, type Tab, type WinId } from './tabModel'

// Keeps the guided lesson working whatever the student did to the tabs.
//
// Lesson -> tabs: when the walkthrough switches the notes tab, focuses a
// window, highlights a line, reveals the board or opens the Quick check, the
// window it needs is restored if it was minimized, and the tab it needs is
// reopened if it was closed, brought home if it was dragged to the other
// window, and activated (ensureLessonTab).
//
// Tabs -> lesson: a student click on a lesson tab drives the director and the
// tutor store the way the old tab buttons did (setNotesTab, setMode), inside
// asStudent() so the subscriptions below don't treat it as a lesson request
// and drag the tab back home.

let student = 0
export function asStudent(fn: () => void) {
  student++
  try {
    fn()
  } finally {
    student--
  }
}

// A student activated `tab`: show it, and tell the lesson for lesson tabs.
export function activateByStudent(win: WinId, tab: Tab) {
  asStudent(() => {
    useWindows.getState().activateTab(win, tab.id)
    if (tab.kind === 'notes') useDirector.getState().setNotesTab(tab.note)
    else if (tab.kind === 'board') useTutorStore.getState().setMode('lecture')
    else if (tab.kind === 'quiz') useTutorStore.getState().setMode('quiz')
  })
}

const noteOfLine = (id: string) => notesTabs.findIndex((t) => t.lines.some((l) => l.id === id))

function need(content: LessonContent) {
  if (student) return
  const w = useWindows.getState()
  const home = homeOf(content)
  // The lesson needs the other window: a maximized one gives the stage back.
  if (w.maximized && w.maximized !== home) w.setMaximized(null)
  // A minimized window comes back out of its chip before the tutor points at it.
  w.restore(home)
  w.ensureLessonTab(content)
}

const needNotes = (i: number) => need({ kind: 'notes', note: Math.max(0, Math.min(notesTabs.length - 1, i)) })
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
    if (s.boardReveal !== p.boardReveal && Number.isFinite(s.boardReveal) && useTutorStore.getState().mode === 'lecture') needBoard()
  })
  const offTutor = useTutorStore.subscribe((s, p) => {
    if (s.mode !== p.mode) need(s.mode === 'quiz' ? { kind: 'quiz' } : { kind: 'board' })
  })
  // Every step the walkthrough (re)applies: catches a tab closed since the
  // last time the lesson asked for it, even when the request is unchanged.
  const offWalk = useWalkthrough.subscribe((s, p) => {
    const applied = s.index !== p.index || (s.phase !== p.phase && (s.phase === 'walking' || (s.phase === 'speaking' && p.phase !== 'walking')))
    if (applied && s.started) needStep(s.steps[s.index])
  })
  return () => {
    offDirector()
    offTutor()
    offWalk()
  }
}

// Both windows call this; one live connection between them.
let users = 0
let disconnect: (() => void) | null = null
export function useLessonTabs() {
  useEffect(() => {
    if (users++ === 0) disconnect = connect()
    return () => {
      if (--users === 0) {
        disconnect?.()
        disconnect = null
      }
    }
  }, [])
}
