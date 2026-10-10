import { Suspense } from 'react'
import { WINDOWS } from '../layout3d'
import { BoardWindow } from '../windows/BoardWindow'
import { NotesWindow } from '../windows/NotesWindow'
import { BuildIn } from './build'
import { WhiteBoxRoom } from './WhiteBoxRoom'

// The whole lesson set in one element: the white-box room plus the notes
// window (left) and the board window (right). The windows suspend while
// their fonts load, so they sit in their own boundary and the room shows
// straight away.
export function LessonRoom() {
  return (
    <>
      <WhiteBoxRoom />
      <Suspense fallback={null}>
        <BuildIn part="notes" style="left" pivot={WINDOWS.notes.position} distance={3.2}>
          <NotesWindow />
        </BuildIn>
        <BuildIn part="board" style="right" pivot={WINDOWS.board.position} distance={3.2}>
          <BoardWindow />
        </BuildIn>
      </Suspense>
    </>
  )
}
