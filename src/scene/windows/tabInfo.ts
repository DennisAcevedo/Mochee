import { notesTabs } from '../../../shared/lessonNotes'
import type { TabContent } from './tabModel'
import { WINDOW_STYLE } from './windowStyle'

// What a tab shows in the strip and the omnibox: title, favicon colour, path.

const K = WINDOW_STYLE.kinds

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
      const n = notesTabs[c.note] ?? notesTabs[0]
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
