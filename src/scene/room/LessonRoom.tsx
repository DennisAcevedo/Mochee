import { Suspense } from 'react'
import { useMode } from '../../state/mode'
import { WINDOW } from '../layout3d'
import { NotesWindow } from '../windows/NotesWindow'
import { BuildIn } from './build'
import { RoomProps } from './RoomProps'
import { WhiteBoxRoom } from './WhiteBoxRoom'

// The whole lesson set in one element: the white-box room, Ronil's Study or
// Play furniture inside it (RoomProps follows the mode) and, in Study only,
// the browser window left of the tutor (every tab lives in it). Play has no
// browser: just him, the room and the play props. The props and the window suspend
// while their GLBs and fonts load, so each sits in its own boundary and the
// box shows straight away. During the intro each piece builds itself in.
export function LessonRoom() {
  const study = useMode((m) => m.mode === 'study')
  return (
    <>
      <WhiteBoxRoom />
      <Suspense fallback={null}>
        <BuildIn part="props" style="rise" distance={2.4}>
          <RoomProps />
        </BuildIn>
      </Suspense>
      <Suspense fallback={null}>
        <BuildIn part="window" style="left" pivot={WINDOW.position} distance={3.2}>
          {study && <NotesWindow />}
        </BuildIn>
      </Suspense>
    </>
  )
}
