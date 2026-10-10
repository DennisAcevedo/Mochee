import { notesTabs, type NoteTab } from '../../../shared/lessonNotes'
import type { LessonPack } from '../../../shared/lessonPack'
import { packNotesTabs, useLessonPack } from '../../lesson/packSession'
import type { TabContent } from './tabModel'
import { WINDOW_STYLE } from './windowStyle'

// What a tab shows in the strip and the omnibox: title, favicon colour, path.

const K = WINDOW_STYLE.kinds

// The notes tabs the lesson has now: a running pack's sections (notes tab N =
// section N, as WindowContent renders them), else the hand-written notes.
// Cached per pack, since every tab title asks on every render.
let shown: { pack: LessonPack | null; tabs: NoteTab[] } = { pack: null, tabs: notesTabs }
export function lessonNotes(): NoteTab[] {
  const p = useLessonPack.getState().pack
  const pack = p && p.sections.length ? p : null
  if (pack !== shown.pack) shown = { pack, tabs: pack ? packNotesTabs(pack) : notesTabs }
  return shown.tabs
}

export const BOARD_TITLE = 'Board · FCFS'
export const QUIZ_TITLE = 'Quick check'

export interface TabInfo {
  title: string
  color: string
  path: string // after WINDOW_STYLE.urlHost
}

export function tabInfo(c: TabContent): TabInfo {
  switch (c.kind) {
    case 'notes': {
      const tabs = lessonNotes()
      const n = tabs[Math.min(Math.max(0, c.note), tabs.length - 1)]
      return { title: n.title, color: K.notes[c.note % K.notes.length], path: n.url }
    }
    case 'board':
      return { title: BOARD_TITLE, color: K.board, path: 'board/02-first-come-first-served' }
    case 'quiz':
      return { title: QUIZ_TITLE, color: K.quiz, path: 'board/05-quick-check' }
    case 'scratch':
      return { title: 'Scratch note', color: K.scratch, path: 'scratch' }
    case 'pdf':
      return { title: `${c.title} · p. ${c.page}`, color: K.pdf, path: `docs/${encodeURIComponent(c.docId)}/page/${c.page}` }
    case 'newtab':
      return { title: 'New tab', color: K.newtab, path: 'new-tab' }
  }
}
