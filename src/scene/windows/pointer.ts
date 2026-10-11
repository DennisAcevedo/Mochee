import { Plane, Raycaster, Vector2, Vector3, type Camera, type Object3D } from 'three'
import { WINDOW_UI } from './windowConfig'

// Pointer plumbing for the window drags (tabs, window moves, resizes). A press
// on a mesh starts a PointerTrack; window-level listeners follow the pointer
// even when it leaves the mesh or the canvas (and the canvas holds pointer
// capture), so a drag survives fast moves. The owner reads the track once a
// frame in useFrame and turns the pointer into a point on a plane. Nothing
// here allocates after construction.

export class PointerTrack {
  active = false
  dragging = false // moved past the dead zone
  up = false // released; the owner handles it on its next frame, then calls end()
  button = 0
  pointerId = -1
  startX = 0
  startY = 0
  x = 0
  y = 0
  private dom: HTMLElement | null = null

  press(e: PointerEvent, dom: HTMLElement) {
    this.end()
    this.active = true
    this.dragging = false
    this.up = false
    this.button = e.button
    this.pointerId = e.pointerId
    this.startX = this.x = e.clientX
    this.startY = this.y = e.clientY
    this.dom = dom
    try {
      dom.setPointerCapture(e.pointerId)
    } catch {
      // Capture is a nicety; the window listeners still see the drag.
    }
    window.addEventListener('pointermove', this.onMove, { passive: false })
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
  }

  end() {
    if (!this.active) return
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    try {
      if (this.dom?.hasPointerCapture(this.pointerId)) this.dom.releasePointerCapture(this.pointerId)
    } catch {
      // Already released.
    }
    this.dom = null
    this.active = false
    this.dragging = false
    this.up = false
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return
    this.x = e.clientX
    this.y = e.clientY
    if (!this.dragging && Math.hypot(this.x - this.startX, this.y - this.startY) > WINDOW_UI.deadZonePx) this.dragging = true
    if (this.dragging && e.cancelable) e.preventDefault() // no text selection or scroll while dragging
  }

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return
    this.x = e.clientX
    this.y = e.clientY
    this.up = true
  }
}

// Pointer (client px) -> ray -> plane. Reused objects; returns false on a miss.
const ndc = new Vector2()
const caster = new Raycaster()
export function pointerOnPlane(x: number, y: number, camera: Camera, canvas: HTMLElement, plane: Plane, out: Vector3): boolean {
  const r = canvas.getBoundingClientRect()
  if (!r.width || !r.height) return false
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
  caster.setFromCamera(ndc, camera)
  return caster.ray.intersectPlane(plane, out) !== null
}

// The plane of an object's local XY (a window face), through its origin.
const n = new Vector3()
const o = new Vector3()
export function facePlane(obj: Object3D, out: Plane): Plane {
  obj.updateWorldMatrix(true, false)
  n.set(0, 0, 1).transformDirection(obj.matrixWorld)
  obj.getWorldPosition(o)
  return out.setFromNormalAndCoplanarPoint(n, o)
}

// Body cursor while a drag or a hover owns it; restores only what it set.
let mine: string | null = null
export function setCursor(cursor: string | null) {
  const body = document.body.style
  if (cursor) {
    body.cursor = cursor
    mine = cursor
  } else if (mine !== null) {
    if (body.cursor === mine) body.cursor = ''
    mine = null
  }
}
