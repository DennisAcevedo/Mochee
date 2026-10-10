import { Suspense } from 'react'
import { BoardWindow } from '../windows/BoardWindow'
import { NotesWindow } from '../windows/NotesWindow'
import { SparkleStage } from './SparkleStage'

// The whole lesson set in one element: the sparkle stage (the platform)
// plus the notes window (left) and the board window (right). The windows
// suspend while their fonts load, so they sit in their own boundary and the
// stage shows straight away.
export function LessonRoom() {
  return (
    <>
      <SparkleStage />
      <Suspense fallback={null}>
        <NotesWindow />
        <BoardWindow />
      </Suspense>
    </>
  )
}
