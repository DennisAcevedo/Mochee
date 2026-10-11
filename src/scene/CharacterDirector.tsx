import { useEffect } from 'react'
import { ROAM_LOG_CAP, tutorActor, exposeDev } from '../character/blender/actor'
import { tutorRig, tutorStatus } from '../character/blender/BlenderTutor'
import { useFight } from '../boss/fight'
import { performAction, setExpression } from '../character/controller'
import { presenting, useWalkthrough } from '../lesson/runner'
import { asideSpot, initialRoam, ROAM, roamStep, type AsideFrom, type RoamAction, type RoamState } from '../lesson/roam'
import { useDirector, type Focus } from '../state/director'
import { useMode } from '../state/mode'
import { selectExpression, selectPose, selectSpeaking, useTutorStore } from '../state/store'
import { useWindows } from '../state/windows'
import { useChat } from '../ui/Drawers/chatStore'
import { thinkWhileChatPending } from '../ui/Drawers/tutorCues'
import { cameraPan, LESSON_CAMERA, SPOTS } from './layout3d'
import { sceneFrame } from './sceneRig'
import { windowFrames } from './windows'
import { usePlayBody } from './physics'

// The single bridge from app state to the character. Renders nothing.
// - The classic character (only on stage as the GLB fallback) follows the
//   store's pose, speech and expression through its controller.
// - The Blender tutor's intro beats: asleep on the start screen, wake at the
//   intro's wake beat, wave at the greeting (StageDirector owns his loop once live).
// - Roaming and idle emotes between beats (src/lesson/roam.ts).
// - He thinks while a document chat question is pending (tutorCues.ts).

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const
const ASIDE_EPS = 0.05 // re-aim the aside when the camera pan moves it further than this

const clock = () => performance.now() / 1000

// Dev-only handle on the stores roaming reads, for checks that drive them
// (maximize a window, then watch him step aside, inside the stage frame):
// window.__gg.tutorWorld.
const tutorWorld = { windows: useWindows, frame: sceneFrame }

const asideView = { camX: 0, camZ: LESSON_CAMERA.position[2], fov: LESSON_CAMERA.fov, aspect: LESSON_CAMERA.aspect }

// Where he waits beside a maximized window: in the screen gap beside it,
// against the window's live frame and the pan the camera is easing to
// (CameraRig), so he stays clear of it and in frame. The window's home is
// left, so on a tie he waits in the gap to its right (past the lane's right
// end its depth is flat: the right spot's z).
function asideX(from: AsideFrom, focus: Focus): number {
  asideView.camX = cameraPan(focus, from)
  const f = windowFrames[from]
  return asideSpot({ cx: f.center.x, halfW: f.halfW, z: f.center.z }, 1, SPOTS.right.z, asideView)
}

function logAction(a: RoamAction, now: number) {
  if (a.kind === 'none') return
  const log = tutorActor.roam.log
  log.push({ t: now, kind: a.kind, x: a.kind === 'walk' ? a.x : undefined, clip: a.kind === 'emote' ? a.clip : undefined })
  if (log.length > ROAM_LOG_CAP) log.shift()
}

function useIntroBeats() {
  const phase = useTutorStore((s) => s.phase)
  const introPose = useTutorStore((s) => s.introPose)
  useEffect(() => {
    const d = useDirector.getState()
    if (phase === 'start') {
      d.resetStage()
      d.setLoop('sleep')
    } else if (phase === 'intro' && introPose === 'explain') {
      d.setLoop('idle')
      d.play('wake')
    } else if (phase === 'intro' && introPose === 'wave') {
      d.play('wave')
    }
  }, [phase, introPose])
}

function useRoam() {
  useEffect(() => {
    let lastInput = clock()
    const onInput = () => {
      lastInput = clock()
    }
    for (const e of INPUT_EVENTS) window.addEventListener(e, onInput, { passive: true, capture: true })

    let mem: RoamState = initialRoam(clock())
    const id = window.setInterval(() => {
      // A boss fight owns his spot (fight.ts steps him into his corner): no roaming or
      // stepping aside from a maximized window until it ends, when this picks the aside back up.
      if (useFight.getState().on) return
      const now = clock()
      const t = useTutorStore.getState()
      const w = useWalkthrough.getState()
      const d = useDirector.getState()
      const anim = tutorStatus.anim
      const enabled =
        t.phase === 'live' &&
        useMode.getState().mode === 'study' &&
        usePlayBody.getState().state === 'idle' &&
        tutorStatus.loaded &&
        !tutorActor.classic
      const busy =
        t.mic !== 'idle' ||
        t.awaitingReply ||
        Object.values(useChat.getState().pending).some(Boolean) ||
        w.held ||
        w.loopOverride !== null ||
        presenting(w.phase) ||
        d.loop !== 'idle'
      const moving = tutorStatus.phase !== 'still' || !!anim?.oneShot || !!anim?.queued
      // A stage reset (restart, replay) drops the aside: let the scheduler issue it again.
      if (mem.aside && d.asideX === null) mem = { ...mem, aside: null }

      const out = roamStep(
        now,
        { ...mem, enabled, busy, moving, x: tutorStatus.x, laneMin: SPOTS.left.x, laneMax: SPOTS.right.x, maximized: useWindows.getState().maximized, lastInput },
        Math.random,
      )
      mem = out.state
      const a = out.action
      if (a.kind === 'walk') d.roamTo(a.x)
      else if (a.kind === 'back') d.stepAside(null)
      else if (a.kind === 'emote') d.play(a.clip, { vary: true }) // wave / hop rotate through salute and the cheers
      if (mem.aside) {
        const x = asideX(mem.aside, d.focus)
        if (d.asideX === null || Math.abs(d.asideX - x) > ASIDE_EPS) d.stepAside(x)
      }

      const r = tutorActor.roam
      r.enabled = enabled
      r.busy = busy
      r.moving = moving
      r.aside = mem.aside
      r.nextAt = mem.nextAt
      logAction(a, now)
      exposeDev('tutorRig', tutorRig)
      exposeDev('tutorWorld', tutorWorld)
    }, ROAM.tickMs)

    return () => {
      window.clearInterval(id)
      for (const e of INPUT_EVENTS) window.removeEventListener(e, onInput, { capture: true })
    }
  }, [])
}

function useChatThink() {
  useEffect(() => {
    let was = false
    return useChat.subscribe((s) => {
      const pending = Object.values(s.pending).some(Boolean)
      if (pending === was) return
      was = pending
      thinkWhileChatPending(pending)
    })
  }, [])
}

export function CharacterDirector() {
  const pose = useTutorStore(selectPose)
  const expression = useTutorStore(selectExpression)
  const speaking = useTutorStore(selectSpeaking)

  useEffect(() => {
    performAction('pose', { pose })
  }, [pose])

  useEffect(() => {
    performAction('speak', { on: speaking })
  }, [speaking])

  useEffect(() => {
    setExpression(expression)
  }, [expression])

  useIntroBeats()
  useRoam()
  useChatThink()

  return null
}
