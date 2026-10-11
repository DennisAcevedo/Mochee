import { Vector3, type Camera, type Object3D } from 'three'
import { WINDOW_UI } from './windowConfig'

// The overlapping things on the stage: the browser (3D, in the canvas) and
// two DOM panels above the canvas, the lesson controls and the transcript.
// They form one front-to-back stack; pressing any of them brings it to the
// front. The DOM panels are reordered by z-index; every DOM panel the browser
// is in front of has the browser's projected frame cut out of it, so the
// browser shows through. What is left of a cut panel stays clickable to bring
// it forward again.
export type Layer = 'browser' | 'controls' | 'transcript'
type Panel = Exclude<Layer, 'browser'>

// `clip` is what gets the hole; `layer` is the element whose z-index orders it
// among the stage's overlays (the same element, unless the panel sits inside a
// positioned wrapper, like the transcript in its side column).
const panels: Record<Panel, { clip: HTMLElement; layer: HTMLElement } | null> = { controls: null, transcript: null }
let order: Layer[] = ['browser', 'transcript', 'controls'] // back to front
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

function restack() {
  let z = 0
  for (const id of order) {
    if (id === 'browser') continue
    const p = panels[id]
    if (p) p.layer.style.zIndex = String(z)
    z++
  }
}

export function bringForward(id: Layer) {
  if (order[order.length - 1] === id) return
  order = [...order.filter((l) => l !== id), id]
  restack()
  if (id !== 'browser') {
    const p = panels[id]
    if (p) p.clip.style.clipPath = ''
  }
}

// The browser drops to the back (it was hidden, or it left the view).
function sendBrowserBack() {
  if (order[0] === 'browser') return
  order = ['browser', ...order.filter((l) => l !== 'browser')]
  for (const id of ['controls', 'transcript'] as const) {
    const p = panels[id]
    if (p) p.clip.style.clipPath = ''
  }
}

export function registerPanel(id: Panel, clip: HTMLElement | null, layer: HTMLElement | null = clip) {
  const old = panels[id]
  if (old?.clip === clip && old?.layer === layer) return
  if (old) {
    old.clip.style.clipPath = ''
    old.layer.style.zIndex = ''
  }
  panels[id] = clip && layer ? { clip, layer } : null
  restack()
}

export function registerLessonControls(element: HTMLElement | null) {
  registerPanel('controls', element)
}

export function bringBrowserForward() {
  bringForward('browser')
}

export function bringLessonControlsForward() {
  bringForward('controls')
}

export function bringTranscriptForward() {
  bringForward('transcript')
}

// Cuts the browser's frame out of every DOM panel it is in front of. Returns
// whether any panel was cut, so the browser shows its opaque backing.
export function placeBrowserAboveControls(pivot: Object3D, width: number, height: number, camera: Camera, canvas: HTMLCanvasElement, visible: boolean): boolean {
  const at = order.indexOf('browser')
  const below = order.slice(0, at).filter((l): l is Panel => l !== 'browser' && !!panels[l])
  if (!below.length) return false
  if (!visible) {
    sendBrowserBack()
    return false
  }
  const view = canvas.getBoundingClientRect()
  if (!view.width || !view.height) return false
  pivot.updateWorldMatrix(true, false)
  camera.updateMatrixWorld()
  const screen: Pt[] = []
  for (let i = 0; i < 4; i++) {
    corner.set(i === 1 || i === 2 ? width / 2 + browserCutoutPad : -width / 2 - browserCutoutPad, i >= 2 ? -height / 2 - browserCutoutPad : height / 2 + browserCutoutPad, 0)
    corner.applyMatrix4(pivot.matrixWorld).project(camera)
    if (corner.z < -1 || corner.z > 1) {
      sendBrowserBack()
      return false
    }
    screen.push([view.left + ((corner.x + 1) / 2) * view.width, view.top + ((1 - corner.y) / 2) * view.height])
  }
  let cut = false
  for (const id of below) {
    const el = panels[id]!.clip
    const bar = el.getBoundingClientRect()
    if (!bar.width || !bar.height) continue
    const lo: Pt = [-SHADOW_PAD, -SHADOW_PAD]
    const hi: Pt = [bar.width + SHADOW_PAD, bar.height + SHADOW_PAD]
    const hole = clipToBox(
      screen.map(([x, y]) => [x - bar.left, y - bar.top] as Pt),
      lo,
      hi,
    ).map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`)
    const box = [`${lo[0]}px ${lo[1]}px`, `${hi[0]}px ${lo[1]}px`, `${hi[0]}px ${hi[1]}px`, `${lo[0]}px ${hi[1]}px`, `${lo[0]}px ${lo[1]}px`]
    // An even-odd polygon leaves a hole shaped like the perspective window (the
    // part of it over the panel).
    el.style.clipPath = hole.length ? `polygon(evenodd, ${box.join(', ')}, ${hole.join(', ')}, ${hole[0]})` : ''
    cut ||= hole.length > 0
  }
  return cut
}
