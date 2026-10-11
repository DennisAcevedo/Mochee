import { useEffect } from 'react'
import { tutorStatus } from '../character/blender/BlenderTutor'
import { hush, presenting, replayStep, shutLesson, useWalkthrough } from '../lesson/runner'
import { usePlayBody } from '../scene/physics/playBody'
import { useMode } from '../state/mode'
import { LESSON_RETURN } from './config'
import { createLessonMode } from './lessonMode'
import { cancelTutorAnswer } from '../lesson/askFlow'
import { cancelRecognition } from '../lesson/speech'
import { useTutorStore } from '../state/store'
import { useDirector } from '../state/director'
import { cancelDocumentSpeech } from '../ui/Drawers/tutorCues'

// Wires lessonMode.ts to the stores: the stage mode drives it, the walkthrough
// is what it pauses and resumes, the physics body tells it when he is home.
// Mounted once on the lesson page (UnlockWatcher calls it).
export function useLessonMode() {
  useEffect(() => {
    const ctl = createLessonMode({
      run: () => useWalkthrough.getState(),
      presenting,
      pause: () => useWalkthrough.getState().pause(),
      resume: () => useWalkthrough.getState().resume(),
      replay: replayStep,
      hush: () => {
        cancelTutorAnswer()
        cancelDocumentSpeech()
        cancelRecognition()
        hush()
        useTutorStore.setState({ mic: 'idle' })
        useDirector.getState().setCaption(null)
        useWalkthrough.getState().setLoopOverride(null)
      },
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
      ctl.dispose()
    }
  }, [])
}
