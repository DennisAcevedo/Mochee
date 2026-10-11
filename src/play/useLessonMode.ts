import { useEffect } from 'react'
import { tutorStatus } from '../character/blender/BlenderTutor'
import { hush, presenting, replayStep, shutLesson, useWalkthrough } from '../lesson/runner'
import { usePlayBody } from '../scene/physics/playBody'
import { useMode } from '../state/mode'
import { LESSON_RETURN } from './config'
import { createLessonMode } from './lessonMode'

// Wires lessonMode.ts to the stores: the stage mode drives it, the walkthrough
// is what it pauses and resumes, the physics body tells it when he is home.
// Mounted once on the lesson page (UnlockWatcher calls it).
export function useLessonMode() {
  useEffect(() => {
    // The walkthrough as the student last saw it in Study. zustand sets the new mode before
    // it calls any listener, so a change made while Play is coming on (another guard pausing
    // it, src/scene/hoops/lessonQuiet.ts) is not mistaken for the student's own pause.
    let left = useWalkthrough.getState()
    const offRun = useWalkthrough.subscribe((s) => {
      if (useMode.getState().mode === 'study') left = s
    })
    const ctl = createLessonMode({
      run: () => useWalkthrough.getState(),
      leaving: () => left,
      presenting,
      pause: () => useWalkthrough.getState().pause(),
      resume: () => useWalkthrough.getState().resume(),
      replay: replayStep,
      hush,
      shut: shutLesson,
      toStudy: () => useMode.getState().setMode('study'),
      // His body centre against where the director stands him (tutorStatus, written every frame).
      gap: () => {
        const body = usePlayBody.getState()
        if (body.state !== 'idle') return null
        return Math.hypot(body.position[0] - tutorStatus.x, body.position[2] - tutorStatus.z)
      },
      every: (ms, fn) => {
        const id = window.setInterval(fn, ms)
        return () => window.clearInterval(id)
      },
      now: () => performance.now(),
      tuning: LESSON_RETURN,
    })
    ctl.onMode(useMode.getState().mode)
    const off = useMode.subscribe((s, prev) => {
      if (s.mode !== prev.mode) ctl.onMode(s.mode)
    })
    return () => {
      off()
      offRun()
      ctl.dispose()
    }
  }, [])
}
