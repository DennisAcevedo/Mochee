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

// ---- The bodies of lessonSync's subscriptions, as plain handlers of
// (next, previous) so the Node tests fire them with real store updates.

// What a handler needs from the running lesson, read when it fires.
export interface LessonCtx {
  mode: string // the tutor store's mode: 'quiz' wants the Quick check, 'lecture' the board
  noteCount: number // notes tabs in the lesson (lessonNotes().length)
  noteOfLine: (id: string) => number // notes tab holding a line id, -1 if none
}

export interface DirectorSlice {
  notesTab: number
  highlight: string | null
  focus: string
  boardReveal: number
}

const boardOrQuiz = (mode: string): LessonContent => (mode === 'quiz' ? { kind: 'quiz' } : { kind: 'board' })
const needNotes = (i: number, ctx: LessonCtx) => reopenFor({ kind: 'notes', note: Math.max(0, Math.min(ctx.noteCount - 1, i)) })

// The director moved on: a notes tab, a highlighted line, a focus or a board
// reveal that shows more each bring the window (and the tab) up.
export function onDirector(s: DirectorSlice, p: DirectorSlice, ctx: LessonCtx) {
  if (s.notesTab !== p.notesTab) needNotes(s.notesTab, ctx)
  if (s.highlight && s.highlight !== p.highlight) {
    const i = ctx.noteOfLine(s.highlight)
    if (i >= 0) needNotes(i, ctx)
  }
  if (s.focus !== p.focus) {
    if (s.focus === 'notes') needNotes(s.notesTab, ctx)
    else if (s.focus === 'board') reopenFor(boardOrQuiz(ctx.mode))
  }
  if (revealsBoard(s.boardReveal, p.boardReveal) && ctx.mode === 'lecture') reopenFor(boardOrQuiz(ctx.mode))
}

// The tutor store's mode changed: the board or the Quick check.
export function onMode(s: { mode: string }, p: { mode: string }) {
  if (s.mode !== p.mode) reopenFor(boardOrQuiz(s.mode))
}

// A walkthrough update that (re)applies its step: a new index, or the step
// starting (walking, or speaking without a walk first).
export function stepApplied(s: { index: number; phase: string }, p: { index: number; phase: string }): boolean {
  return s.index !== p.index || (s.phase !== p.phase && (s.phase === 'walking' || (s.phase === 'speaking' && p.phase !== 'walking')))
}

// The step's own request, every time it is applied: catches a tab (or the
// window) closed since the lesson last asked, even when the request is unchanged.
export function onStep(step: { focus: string; highlight?: string | null; notesTab: number; mode?: string } | undefined, ctx: LessonCtx) {
  if (!step) return
  if (step.focus === 'notes' || step.highlight) needNotes(step.notesTab, ctx)
  if (step.focus === 'board') reopenFor(boardOrQuiz(step.mode === 'quiz' ? 'quiz' : 'lecture'))
}

// A pack started or ended: notes tabs past its last section go, and the strip
// is republished even when none did, so every notes tab title (tabInfo reads
// the pack) re-renders with the new document's sections.
export function onPack(noteCount: number) {
  const tabs = trimNotes(useWindows.getState().tabs, noteCount)
  useWindows.setState({ tabs: { ...tabs, notes: { ...tabs.notes } } })
}

// The red light rebuilt the lesson tabs: fit them to the running pack.
export function onWindows(s: { closed: boolean }, p: { closed: boolean }, noteCount: number) {
  if (s.closed && !p.closed) trimAfterClose(noteCount)
}
