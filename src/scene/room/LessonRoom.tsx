import { Suspense } from 'react'
import { BoardWindow } from '../windows/BoardWindow'
import { NotesWindow } from '../windows/NotesWindow'
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
        <NotesWindow />
        <BoardWindow />
      </Suspense>
    </>
  )
}
