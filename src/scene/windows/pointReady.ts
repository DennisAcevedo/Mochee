import { cameraPan, LESSON_CAMERA, POINTING } from '../layout3d.ts'

// Whether he may point at the window with the camera at world x `camX`: the
// window has focus and the camera is within POINTING.panTolerance of the pan
// it eases to (CameraRig). Mid-pan his pointing hand reaches into the window
// (tests/ui/windowPlace.test.ts measures the sweep). Pure, for the Node tests.
export function pointReadyAt(camX: number, focus: string, maximized: string | null, side: -1 | 1 = -1): boolean {
  if (focus === 'none') return false
  return Math.abs(camX - (LESSON_CAMERA.position[0] + cameraPan(focus, maximized, side))) <= POINTING.panTolerance
}
