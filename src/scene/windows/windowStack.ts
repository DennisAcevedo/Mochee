import { Vector3, type Camera, type Object3D } from 'three'
import { WINDOW_UI } from './windowConfig'

// The lesson controls are DOM above the 3D canvas. When the student selects
// the browser, cut its projected frame out of the controls so the browser
// shows through. The remaining controls stay clickable to bring them forward.
let controls: HTMLElement | null = null
let browserFront = false
const corner = new Vector3()
// Match the outer edge of the focus ring. The browser fills this cutout with
// an opaque backing, so no part of the room shows through beside the frame.
export const browserCutoutPad = WINDOW_UI.focus.ring.gap + WINDOW_UI.focus.ring.stroke

export function registerLessonControls(element: HTMLElement | null) {
  if (controls === element) return
  if (controls) controls.style.clipPath = ''
  controls = element
  browserFront = false
}

export function bringBrowserForward() {
  browserFront = true
}

export function bringLessonControlsForward() {
  browserFront = false
  if (controls) controls.style.clipPath = ''
}

export function placeBrowserAboveControls(pivot: Object3D, width: number, height: number, camera: Camera, canvas: HTMLCanvasElement, visible: boolean): boolean {
  if (!controls || !browserFront) return false
  if (!visible) {
    bringLessonControlsForward()
    return false
  }
  const bar = controls.getBoundingClientRect()
  const view = canvas.getBoundingClientRect()
  if (!bar.width || !bar.height || !view.width || !view.height) return false
  pivot.updateWorldMatrix(true, false)
  camera.updateMatrixWorld()
  const points: string[] = []
  for (let i = 0; i < 4; i++) {
    corner.set(i === 1 || i === 2 ? width / 2 + browserCutoutPad : -width / 2 - browserCutoutPad, i >= 2 ? -height / 2 - browserCutoutPad : height / 2 + browserCutoutPad, 0)
    corner.applyMatrix4(pivot.matrixWorld).project(camera)
    if (corner.z < -1 || corner.z > 1) {
      bringLessonControlsForward()
      return false
    }
    const x = view.left + ((corner.x + 1) / 2) * view.width - bar.left
    const y = view.top + ((1 - corner.y) / 2) * view.height - bar.top
    points.push(`${x.toFixed(1)}px ${y.toFixed(1)}px`)
  }
  // An even-odd polygon leaves a hole shaped like the perspective window.
  controls.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${points.join(', ')}, ${points[0]})`
  return true
}
