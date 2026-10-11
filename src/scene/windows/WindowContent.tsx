import { useMemo } from 'react'
import { notesTabs } from '../../../shared/lessonNotes'
import { emptyNotesTab, packNotesTabs, useLessonPack } from '../../lesson/packSession'
import { currentBoard, PackBoardPage } from './PackBoard'
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
  const empty = useLessonPack((p) => p.empty)
  const tabs = useMemo(() => (pack && pack.sections.length ? packNotesTabs(pack) : empty !== null ? [emptyNotesTab(empty)] : notesTabs), [pack, empty])
  const tab = tabs[Math.min(Math.max(0, note), tabs.length - 1)]
  return <NotesPage key={`${tabId}-${note}-${reloads}`} tab={tab} box={box} highlight={highlight} />
}

// A document lesson's board for the section on the notes tab, the empty
// board, or the hand-written lecture board.
function BoardContent({ box }: { box: ContentBox }) {
  const reveal = useDirector((s) => s.boardReveal)
  useDirector((s) => s.notesTab)
  useLessonPack((p) => p.pack)
  useLessonPack((p) => p.empty)
  const board = currentBoard()
  if (board) return <PackBoardPage key={board.sectionLabel} board={board} box={box} reveal={reveal} />
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
