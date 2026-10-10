import { useWindows } from '../../state/windows.ts'
import { trimNotes, WIN, type LessonContent } from './tabModel.ts'

// What the lesson does to the window when it needs one of its tabs, kept
// apart from lessonSync.ts (which wires it to the runner, the director and
// React) so tests/ui/minimize.test.ts can drive it under plain Node.

let student = 0

// Runs a student's own tab change: the lesson subscriptions it sets off are
// not lesson requests, so they don't reopen or switch anything.
export function asStudent(fn: () => void) {
  student++
  try {
    fn()
  } finally {
    student--
  }
}

// The lesson needs `content` on screen: a minimized window unfolds, a closed
// one opens again (red light), and the tab comes back if it was closed and is
// activated. Ignored while a student's own click is being applied.
export function reopenFor(content: LessonContent) {
  if (student) return
  const w = useWindows.getState()
  w.restore(WIN)
  w.ensureLessonTab(content)
}

// A director.boardReveal change asks for the board only when it shows more
// of it. The lesson's start (Infinity -> 0), a new pack section (n -> 0) and
// any other reset hide parts, so they leave the active tab alone; otherwise
// step 1 would swap the notes for an empty board.
export function revealsBoard(next: number, prev: number): boolean {
  return Number.isFinite(next) && next > 0 && next > prev
}

// The red light rebuilt the lesson tabs from the hand-written notes; a lesson
// pack with fewer sections (noteCount) has nothing to show past its last one.
export function trimAfterClose(noteCount: number) {
  const s = useWindows.getState()
  const tabs = trimNotes(s.tabs, noteCount)
  if (tabs !== s.tabs) useWindows.setState({ tabs })
}
