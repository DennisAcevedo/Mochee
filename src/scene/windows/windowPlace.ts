import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { FLOOR_Y, LESSON_CAMERA, ROOM, WINDOW, WINDOWS } from '../layout3d.ts'
import { WINDOW_UI } from './windowConfig.ts'

// Where the window rests: WINDOW (layout3d.ts, the stage's default) plus the
// student's drag offset and size. It turns toward the stage centre the way
// the default does, so dragging it to the middle squares it up. Moves are
// clamped so the whole window stays inside the 16:9 frame of the resting
// lesson camera (not the live one, which pans toward a focused window),
// between the play HUD and the caption (WINDOW_UI.window.clampBox), and so
// its frame never passes through either side wall (WINDOW_UI.window.wallGap):
// dragged left or right it comes to rest against the wall the same way. Pushed
// down, its bottom edge stops just above the floor (floorGap).

const U = WINDOW_UI.window

export const defaultSize = (): [number, number] => [WINDOW.width, WINDOW.height]

// Yaw at world x: the default's turn, scaled by how far out the window sits.
export function yawAt(x: number): number {
  if (!U.yawFollowsX || !WINDOW.position[0]) return WINDOW.yaw
  const lim = Math.abs(WINDOW.yaw)
  return MathUtils.clamp((WINDOW.yaw / WINDOW.position[0]) * x, -lim, lim)
}

// Focused, the window turns from yawAt(x) to the same share of focusYaw (BrowserWindow3D).
export const focusYawAt = (x: number): number => yawAt(x) * (WINDOWS.focusYaw / Math.abs(WINDOW.yaw || 1))

// How far the focus ring reaches past the frame's edge.
export const RING_PAD = WINDOW_UI.focus.ring.gap + WINDOW_UI.focus.ring.stroke

// World x of the focused ring's left edge, for a window centred at world x, w wide.
export const ringLeftX = (x: number, w: number): number => x - (w / 2 + RING_PAD) * WINDOWS.focusScale * Math.cos(focusYawAt(x))

// The x offsets between which a w-wide window's frame stays U.wallGap inside
// both side walls (the turn depends on x, so settle each side in a few steps).
function wallOffsets(w: number): [number, number] {
  const wall = ROOM.width / 2 - U.wallGap
  let x = wall
  for (let i = 0; i < 4; i++) x = wall - (w / 2) * Math.cos(yawAt(x))
  return [-x - WINDOW.position[0], x - WINDOW.position[0]] // yawAt is odd in x: the left side mirrors the right
}

const cam = new PerspectiveCamera(LESSON_CAMERA.fov, LESSON_CAMERA.aspect, 0.1, 100)
cam.position.set(...LESSON_CAMERA.position)
cam.lookAt(...LESSON_CAMERA.lookAt)
cam.updateMatrixWorld()
cam.updateProjectionMatrix()
const halfTan = Math.tan(MathUtils.degToRad(LESSON_CAMERA.fov / 2))

const corner = new Vector3()
const bounds = { x0: 0, x1: 0, y0: 0, y1: 0, near: 0 } // near: the closest corner's depth

// NDC box of a window resting at offset (ox, oy) with size w x h.
function ndcBounds(ox: number, oy: number, w: number, h: number) {
  const [px, py, pz] = WINDOW.position
  const x = px + ox
  const y = py + oy
  const yaw = yawAt(x)
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  bounds.x0 = bounds.y0 = Infinity
  bounds.x1 = bounds.y1 = -Infinity
  bounds.near = Infinity
  for (let i = 0; i < 4; i++) {
    const lx = (i & 1 ? 0.5 : -0.5) * w
    const ly = (i & 2 ? 0.5 : -0.5) * h
    bounds.near = Math.min(bounds.near, cam.position.z - (pz - lx * s))
    corner.set(x + lx * c, y + ly, pz - lx * s).project(cam)
    bounds.x0 = Math.min(bounds.x0, corner.x)
    bounds.x1 = Math.max(bounds.x1, corner.x)
    bounds.y0 = Math.min(bounds.y0, corner.y)
    bounds.y1 = Math.max(bounds.y1, corner.y)
  }
  return bounds
}

// How far (NDC) to shift [a, b] so it sits inside [lo, hi]; centres it when too big.
function fit(a: number, b: number, lo: number, hi: number) {
  if (b - a > hi - lo) return -(a + b) / 2
  if (a < lo) return lo - a
  return b > hi ? hi - b : 0
}

const BOX = U.clampBox // NDC x0, y0, x1, y1

// Whether the window at (x, y) fits the box along one axis.
function fits(axisX: boolean, x: number, y: number, w: number, h: number): boolean {
  const b = ndcBounds(x, y, w, h)
  return Math.abs(axisX ? fit(b.x0, b.x1, BOX[0], BOX[2]) : fit(b.y0, b.y1, BOX[1], BOX[3])) < 1e-4
}

// From an offset that fits along one axis, the farthest one toward `to` along
// that axis that still fits (bisection: the projection is not linear in the offset).
function toEdge(axisX: boolean, from: number, to: number, other: number, w: number, h: number): number {
  if (from === to || !fitsAt(axisX, from, other, w, h)) return from
  if (fitsAt(axisX, to, other, w, h)) return to
  let lo = from
  let hi = to
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2
    if (fitsAt(axisX, mid, other, w, h)) lo = mid
    else hi = mid
  }
  return lo
}

// `fits` with the searched axis's value first.
const fitsAt = (axisX: boolean, v: number, other: number, w: number, h: number) => (axisX ? fits(true, v, other, w, h) : fits(false, other, v, w, h))
// The nearest offset at which the whole window is on screen. Writes `out`.
export function clampOffset(ox: number, oy: number, w: number, h: number, out: [number, number]): [number, number] {
  let x = ox
  let y = oy
  // Linear steps (world units per NDC unit at the window's depth) bring an
  // outside window in; the camera's perspective and tilt make them land a bit
  // past the edge, so then walk back out toward the request to the exact edge.
  for (let pass = 0; pass < 6; pass++) {
    const b = ndcBounds(x, y, w, h)
    const dx = fit(b.x0, b.x1, BOX[0], BOX[2])
    const dy = fit(b.y0, b.y1, BOX[1], BOX[3])
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) break
    const per = Math.max(0.5, b.near) * halfTan
    x += dx * per * LESSON_CAMERA.aspect
    y += dy * per
  }
  x = toEdge(true, x, ox, y, w, h)
  y = toEdge(false, y, oy, x, w, h)
  const [lo, hi] = wallOffsets(w)
  x = MathUtils.clamp(x, lo, hi) // the side walls, wherever the frame's edge would allow
  y = Math.max(y, FLOOR_Y + U.floorGap + h / 2 - WINDOW.position[1]) // never into the floor
  out[0] = MathUtils.clamp(x, -U.offsetLimit[0], U.offsetLimit[0])
  out[1] = MathUtils.clamp(y, -U.offsetLimit[1], U.offsetLimit[1])
  return out
}
// ---- Resizing: the largest size toward a request whose frame still fits
// (walls, floor, the stage box), so a corner drag stops at the wall instead
// of stretching through it and sliding back on release. `at` gives the
// offset a w x h window has while the opposite corner stays put. Width is
// limited first at the starting height, then height at that width, so
// meeting a side wall never stops the window growing taller.

const probe: [number, number] = [0, 0]
const step = U.sizeStep

function fitsAt2(w: number, h: number, at: (w: number, h: number) => [number, number]): boolean {
  const [ox, oy] = at(w, h)
  clampOffset(ox, oy, w, h, probe)
  return Math.abs(probe[0] - ox) < 1e-3 && Math.abs(probe[1] - oy) < 1e-3
}

// From a fitting `from` toward `to` along one dimension: the farthest that fits.
function reach(from: number, to: number, fits: (v: number) => boolean): number {
  if (fits(to)) return to
  let lo = from
  let hi = to
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  // Snap back toward `from` onto the size step, so it never rounds past the edge.
  return to > from ? Math.floor(lo / step + 1e-6) * step : Math.ceil(lo / step - 1e-6) * step
}

export function resizeWithin(w0: number, h0: number, w: number, h: number, at: (w: number, h: number) => [number, number], out: [number, number]): [number, number] {
  out[0] = w
  out[1] = h
  if (fitsAt2(w, h, at) || !fitsAt2(w0, h0, at)) return out // nothing to stop, or no fitting start to grow from
  out[0] = reach(w0, w, (v) => fitsAt2(v, h0, at))
  out[1] = reach(h0, h, (v) => fitsAt2(out[0], v, at))
  return out
}

// ---- Maximized: centre, scale and own size of a maximized window, filling
// WINDOW_UI.maximize.box of the resting lesson frame on the plane z = M.z.

export interface MaxPlace {
  x: number
  y: number
  z: number
  scale: number
  w: number // the maximized window's width and height (window units, before scale)
  h: number
}

const M = WINDOW_UI.maximize
const ray = new Vector3()
let maxPlace: MaxPlace | null = null

function ndcOnPlane(nx: number, ny: number, z: number): Vector3 {
  const p = new Vector3(nx, ny, 0.5).unproject(cam)
  ray.copy(p).sub(cam.position)
  return p.copy(cam.position).addScaledVector(ray, (z - cam.position.z) / ray.z)
}

export function maximizedPlace(): MaxPlace {
  if (maxPlace) return maxPlace
  const [nx0, ny0, nx1, ny1] = M.box
  const tl = ndcOnPlane(nx0, ny1, M.z)
  const tr = ndcOnPlane(nx1, ny1, M.z)
  const bl = ndcOnPlane(nx0, ny0, M.z)
  const br = ndcOnPlane(nx1, ny0, M.z)
  // The camera tilts down a touch, so the box lands as a slight trapezoid: keep its inner rectangle.
  const x0 = Math.max(tl.x, bl.x)
  const x1 = Math.min(tr.x, br.x)
  const y0 = Math.max(bl.y, br.y)
  const y1 = Math.min(tl.y, tr.y)
  const scale = (y1 - y0) / M.height
  const w = Math.max(U.minSize[0], Math.round(((x1 - x0) / scale) * 100) / 100)
  maxPlace = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: M.z, scale, w, h: M.height }
  return maxPlace
}
