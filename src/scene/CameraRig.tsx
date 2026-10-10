import { useFrame } from '@react-three/fiber'
import { MathUtils, type PerspectiveCamera } from 'three'
import { CAMERA, INTRO } from '../animation/config'
import { intro } from '../animation/introState'
import { introTargets } from '../intro/targets'
import { useDirector } from '../state/director'
import { useTutorStore } from '../state/store'
import { useWindows } from '../state/windows'
import { cameraPan, LESSON_CAMERA } from './layout3d'
import { usePlayBody } from './physics'
import { sceneFrame, sceneRig } from './sceneRig'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Hand-off from the intro's camera to the room's lesson camera, and the
// sideways pan toward a focused window (exponential damping rates, 1/s).
const LESSON_EASE = { blend: 2.6, focus: 3, maxDt: 0.1 } as const

// Live lesson blend (0 = intro camera, 1 = room camera) and the current pan.
const lesson = { t: 0, shift: 0 }

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const slotRect: Rect = { x: 0, y: 0, w: 0, h: 0 }
const stageRect: Rect = { x: 0, y: 0, w: 0, h: 0 }

function measure(el: HTMLElement | undefined, out: Rect, fallback: Rect) {
  if (el) {
    const r = el.getBoundingClientRect()
    if (r.width && r.height) {
      out.x = r.left
      out.y = r.top
      out.w = r.width
      out.h = r.height
      return out
    }
  }
  return Object.assign(out, fallback)
}

let lastOpacity = ''

// Runs before the character tick (negative priority, which R3F treats as
// "before" without taking over rendering). Projects the fullscreen canvas as
// if it were the current frame rect (the shot lands in the frame, the scene
// carries on past it) and moves the camera.
export function CameraRig() {
  useFrame((state, delta) => {
    const cam = state.camera as PerspectiveCamera
    const vw = state.size.width
    const vh = state.size.height
    if (!vw || !vh) return

    const box = INTRO.slotSize
    const a = measure(introTargets.slot, slotRect, { x: (vw - box) / 2, y: (vh - box) / 2, w: box, h: box })
    const b = measure(introTargets.stage, stageRect, { x: 0, y: 0, w: vw, h: vh })
    const t = sceneRig.frameT
    const f = sceneFrame
    f.x = lerp(a.x, b.x, t)
    f.y = lerp(a.y, b.y, t)
    f.w = lerp(a.w, b.w, t)
    f.h = lerp(a.h, b.h, t)

    // Once live, ease from the intro's pose into LESSON_CAMERA, panned toward the focused window.
    const live = useTutorStore.getState().phase === 'live'
    const dt = Math.min(delta, LESSON_EASE.maxDt)
    lesson.t = live ? MathUtils.damp(lesson.t, 1, LESSON_EASE.blend, dt) : 0
    if (lesson.t > 0.999) lesson.t = 1
    const want = cameraPan(useDirector.getState().focus, useWindows.getState().maximized)
    // The pan holds still while he is held, so the drag plane under the pointer stays put.
    if (usePlayBody.getState().state !== 'held') lesson.shift = live ? MathUtils.damp(lesson.shift, want, LESSON_EASE.focus, dt) : 0
    const k = lesson.t
    const P = LESSON_CAMERA.position
    const A = LESSON_CAMERA.lookAt

    cam.fov = lerp(CAMERA.fov, LESSON_CAMERA.fov, k)
    cam.aspect = f.w / f.h
    cam.setViewOffset(f.w, f.h, -f.x, -f.y, vw, vh)
    const c = sceneRig.cam
    // Track the spin's rise, and the arc while the camera is still in close.
    const follow = (intro.out.rise + intro.lift * (1 - t)) * INTRO.spin.cameraFollow * (1 - k)
    cam.position.set(lerp(c.px, P[0] + lesson.shift, k), lerp(c.py, P[1], k) + follow, lerp(c.pz, P[2], k))
    cam.lookAt(lerp(c.tx, A[0] + lesson.shift, k), lerp(c.ty, A[1], k) + follow, lerp(c.tz, A[2], k))
    cam.updateMatrixWorld()

    const wrap = introTargets.scene
    if (wrap) {
      // Full-bleed stage: the canvas is never clipped to the frame, so the scene
      // runs on to the window's edges (this also drops a clip a hot reload kept).
      if (wrap.style.clipPath) wrap.style.clipPath = ''
      const opacity = String(sceneRig.canvasOpacity)
      if (opacity !== lastOpacity) wrap.style.opacity = lastOpacity = opacity
    }
  }, -1)

  return null
}
