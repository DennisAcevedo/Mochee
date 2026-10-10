import { useMemo } from 'react'
import { notesTabs } from '../../../shared/lessonNotes'
import { packNotesTabs, useLessonPack } from '../../lesson/packSession'
import { useDirector } from '../../state/director'
import { BoardQuiz } from './BoardQuiz'
import { LectureBoard } from './LectureBoard'
import { NewTabPage } from './NewTabPage'
import { NotesPage } from './NotesPage'
import { PdfPage } from './PdfPage'
import { ScratchPage } from './ScratchPage'
import type { Tab, TabKind, WinId } from './tabModel'
import { WINDOW_STYLE } from './windowStyle'

// What a window shows under its toolbar: the active tab's page. Every page
// draws from the content's top-left corner at the origin, inside `box`.

export interface ContentBox {
  w: number
  h: number
}

const C = WINDOW_STYLE.content

export const CONTENT_BG: Record<TabKind, string> = {
  notes: C.notesBg,
  board: C.boardBg,
  quiz: C.boardBg,
  scratch: C.notesBg,
  pdf: C.notesBg,
  newtab: C.newTabBg,
}

function NotesContent({ tabId, note, box, reloads }: { tabId: string; note: number; box: ContentBox; reloads: number }) {
  const highlight = useDirector((s) => s.highlight)
  const pack = useLessonPack((p) => p.pack)
  const tabs = useMemo(() => (pack && pack.sections.length ? packNotesTabs(pack) : notesTabs), [pack])
  const tab = tabs[Math.min(Math.max(0, note), tabs.length - 1)]
  return <NotesPage key={`${tabId}-${note}-${reloads}`} tab={tab} box={box} highlight={highlight} />
}

function BoardContent({ box }: { box: ContentBox }) {
  const reveal = useDirector((s) => s.boardReveal)
  return <LectureBoard box={box} reveal={reveal} />
}

export function WindowContent({ win, tab, box, reloads }: { win: WinId; tab: Tab; box: ContentBox; reloads: number }) {
  switch (tab.kind) {
    case 'notes':
      return <NotesContent tabId={tab.id} note={tab.note} box={box} reloads={reloads} />
    case 'board':
      return <BoardContent box={box} />
    case 'quiz':
      return <BoardQuiz box={box} />
    case 'scratch':
      return <ScratchPage win={win} box={box} />
    case 'pdf':
      return <PdfPage key={`${tab.id}-${tab.docId}-${tab.page}-${reloads}`} win={win} tab={tab} box={box} />
    case 'newtab':
      return <NewTabPage key={tab.id} win={win} tabId={tab.id} box={box} />
  }
}
