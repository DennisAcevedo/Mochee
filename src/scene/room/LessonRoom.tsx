import { Suspense } from 'react'
import { NotesWindow } from '../windows/NotesWindow'
import { SparkleStage } from './SparkleStage'

// The whole lesson set in one element: the sparkle stage (the platform)
// plus the browser window left of the tutor (every tab lives in it). The
// window suspends while its fonts load, so it sits in its own boundary and
// the stage shows straight away.
export function LessonRoom() {
  return (
    <>
      <SparkleStage />
      <Suspense fallback={null}>
        <NotesWindow />
      </Suspense>
    </>
  )
}
