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

// How far past the controls' box the clip reaches, so their hard drop shadow
// stays drawn while the browser is in front.
const SHADOW_PAD = 16

type Pt = [number, number]

// Sutherland-Hodgman: the part of `poly` inside the box [lo, hi] on both axes.
// The hole must stay inside the outer rectangle: where it pokes past it, the
// even-odd rule would turn the poking part visible again (the bar's shadow
// showed through there as a black line across the browser).
function clipToBox(poly: Pt[], lo: Pt, hi: Pt): Pt[] {
  let out = poly
  for (const axis of [0, 1] as const) {
    for (const [edge, keepAbove] of [
      [lo[axis], true],
      [hi[axis], false],
    ] as const) {
      const inside = (p: Pt) => (keepAbove ? p[axis] >= edge : p[axis] <= edge)
      const next: Pt[] = []
      for (let i = 0; i < out.length; i++) {
        const a = out[i]
        const b = out[(i + 1) % out.length]
        if (inside(a)) next.push(a)
        if (inside(a) !== inside(b)) {
          const t = (edge - a[axis]) / (b[axis] - a[axis])
          next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
        }
      }
      out = next
      if (!out.length) return out
    }
  }
  return out
}

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
  const quad: Pt[] = []
  for (let i = 0; i < 4; i++) {
    corner.set(i === 1 || i === 2 ? width / 2 + browserCutoutPad : -width / 2 - browserCutoutPad, i >= 2 ? -height / 2 - browserCutoutPad : height / 2 + browserCutoutPad, 0)
    corner.applyMatrix4(pivot.matrixWorld).project(camera)
    if (corner.z < -1 || corner.z > 1) {
      bringLessonControlsForward()
      return false
    }
    const x = view.left + ((corner.x + 1) / 2) * view.width - bar.left
    const y = view.top + ((1 - corner.y) / 2) * view.height - bar.top
    quad.push([x, y])
  }
  const lo: Pt = [-SHADOW_PAD, -SHADOW_PAD]
  const hi: Pt = [bar.width + SHADOW_PAD, bar.height + SHADOW_PAD]
  const hole = clipToBox(quad, lo, hi).map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`)
  const box = [`${lo[0]}px ${lo[1]}px`, `${hi[0]}px ${lo[1]}px`, `${hi[0]}px ${hi[1]}px`, `${lo[0]}px ${hi[1]}px`, `${lo[0]}px ${lo[1]}px`]
  // An even-odd polygon leaves a hole shaped like the perspective window (the
  // part of it over the controls).
  controls.style.clipPath = hole.length ? `polygon(evenodd, ${box.join(', ')}, ${hole.join(', ')}, ${hole[0]})` : ''
  return true
}
