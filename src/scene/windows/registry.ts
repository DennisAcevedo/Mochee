import { Box3, Vector3, type Camera, type Mesh, type Object3D } from 'three'
import { useWindows } from '../../state/windows'
import { WINDOW } from '../layout3d'
import { WIN, type TabKind, type WinId } from './tabModel'

// Live, non-reactive bookkeeping of the window (written every frame, never
// re-renders): the meshes its strip and chrome hit on, the strip's current
// layout and the window's world placement. The e2e helper rects() projects them.

export interface TabHit {
  hit: Mesh // the tab's background hit plane
  close: Object3D // the x button's hit disc
  closeVisible: boolean
  kind: TabKind
  title: string
}

// Where the strip's empty area is (window-local), for the e2e's stripEmpty rect.
export interface StripLayout {
  end: number // the strip's right edge (the empty area runs from plusRight to here)
  plusRight: number // right edge of the + button (window-local x)
  top: number // strip band, window-local y
  bottom: number
}

export interface WinHits {
  pivot: Object3D | null // the window's rotated / scaled group; its local frame is the window's
  strip: Mesh | null // empty tab-strip area (window move + double-click maximize)
  plus: Object3D | null
  max: Object3D | null
  grip: Object3D | null
  omni: Object3D | null // the omnibox, the window's other drag handle
  frame: Mesh | null
  tabs: Map<string, TabHit>
  strip0: StripLayout
}

const hits = (): WinHits => ({
  pivot: null,
  strip: null,
  plus: null,
  max: null,
  grip: null,
  omni: null,
  frame: null,
  tabs: new Map(),
  strip0: { end: 0, plusRight: 0, top: 0, bottom: 0 },
})

export const windowHits: WinHits = hits()

// The window's placement this frame (world), for anyone who needs to keep
// clear of it or aim at it (the roaming tutor, effects). Keyed by its id.
export interface WindowFrame {
  center: Vector3
  halfW: number // half width x scale
  halfH: number
  yaw: number
}
export const windowFrames: Record<WinId, WindowFrame> = {
  [WIN]: { center: new Vector3(...WINDOW.position), halfW: WINDOW.width / 2, halfH: WINDOW.height / 2, yaw: WINDOW.yaw }, // WINDOW in layout3d.ts until the first frame
}

// ---- Screen rects for the e2e (dev hook window.__gg.windows.rects())

export interface ScreenRect {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
}

const box = new Box3()
const p = new Vector3()

function rectOfPoints(points: Vector3[], camera: Camera, canvas: HTMLElement): ScreenRect | null {
  const r = canvas.getBoundingClientRect()
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const pt of points) {
    p.copy(pt).project(camera)
    if (p.z < -1 || p.z > 1) return null
    const sx = r.left + ((p.x + 1) / 2) * r.width
    const sy = r.top + ((1 - p.y) / 2) * r.height
    x0 = Math.min(x0, sx)
    y0 = Math.min(y0, sy)
    x1 = Math.max(x1, sx)
    y1 = Math.max(y1, sy)
  }
  const round = (v: number) => Math.round(v * 10) / 10
  return { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0), cx: round((x0 + x1) / 2), cy: round((y0 + y1) / 2) }
}

const corners = Array.from({ length: 8 }, () => new Vector3())

// Drawn only if it and every ancestor are visible: a closed or folded window
// hides its parent group (minimizeRig), not the meshes themselves. GGHooks'
// screenOf uses it too.
export function shown(obj: Object3D): boolean {
  for (let o: Object3D | null = obj; o; o = o.parent) if (!o.visible) return false
  return true
}

function rectOf(obj: Object3D | null, camera: Camera, canvas: HTMLElement): ScreenRect | null {
  if (!obj || !shown(obj)) return null
  obj.updateWorldMatrix(true, true)
  box.setFromObject(obj)
  if (box.isEmpty()) return null
  const { min, max } = box
  for (let i = 0; i < 8; i++) corners[i].set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z)
  return rectOf8(camera, canvas)
}

const rectOf8 = (camera: Camera, canvas: HTMLElement) => rectOfPoints(corners, camera, canvas)

// A window-local rectangle (x0..x1, y0..y1 in the pivot's frame) on screen.
function localRect(pivot: Object3D, x0: number, x1: number, y0: number, y1: number, camera: Camera, canvas: HTMLElement) {
  pivot.updateWorldMatrix(true, false)
  const pts = corners.slice(0, 4)
  pts[0].set(x0, y0, 0.04)
  pts[1].set(x1, y0, 0.04)
  pts[2].set(x1, y1, 0.04)
  pts[3].set(x0, y1, 0.04)
  for (const v of pts) v.applyMatrix4(pivot.matrixWorld)
  return rectOfPoints(pts, camera, canvas)
}

// In strip order: each tab (id, kind, title, active, rect, its x button), then
// the + button, maximize, the resize grip, the omnibox, the empty strip area
// and the whole window, in viewport CSS px.
export function windowRects(camera: Camera, canvas: HTMLElement) {
  camera.updateMatrixWorld()
  const wt = useWindows.getState().tabs[WIN]
  const h = windowHits
  const s = h.strip0
  const tabs = wt.tabs.map((tab) => {
    const t = h.tabs.get(tab.id)
    return {
      id: tab.id,
      kind: tab.kind,
      title: t?.title ?? '',
      active: wt.active === tab.id,
      rect: t ? rectOf(t.hit, camera, canvas) : null,
      close: t ? rectOf(t.close, camera, canvas) : null,
      closeVisible: t?.closeVisible ?? false,
    }
  })
  return {
    tabs,
    plus: rectOf(h.plus, camera, canvas),
    maximize: rectOf(h.max, camera, canvas),
    grip: rectOf(h.grip, camera, canvas),
    omnibox: rectOf(h.omni, camera, canvas),
    window: rectOf(h.frame, camera, canvas),
    stripEmpty: h.pivot && s.end - s.plusRight > 0.12 ? localRect(h.pivot, s.plusRight + 0.04, s.end - 0.04, s.bottom + 0.03, s.top - 0.03, camera, canvas) : null,
  }
}
