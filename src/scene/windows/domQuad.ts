import { Vector3, type Camera, type Object3D } from 'three'

// DOM elements glued onto 3D quads (the scratch note's textarea, the window's
// traffic lights): the element is laid out at its own px size and a CSS
// matrix3d maps it onto the quad's four projected corners.

// CSS matrix3d taking a w x h element onto the quad q = TL, TR, BR, BL (Heckbert's square-to-quad).
export function quadTransform(q: Float64Array, w: number, h: number): string {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const dy3 = y0 - y1 + y2 - y3
  const den = dx1 * dy2 - dx2 * dy1
  const g = den ? (dx3 * dy2 - dx2 * dy3) / den : 0
  const k = den ? (dx1 * dy3 - dx3 * dy1) / den : 0
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + k * x3
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + k * y3
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1]
  return `matrix3d(${m.map((v) => v.toFixed(6)).join(',')})`
}

const corner = new Vector3()

// The local rectangle x0..x1, y0..y1 (at local z) of `obj` on screen, as the
// quad TL, TR, BR, BL in px from the canvas's offset parent. Writes `out`;
// false when a corner falls outside the camera's depth range.
export function projectRect(obj: Object3D, x0: number, x1: number, y0: number, y1: number, z: number, camera: Camera, canvas: HTMLCanvasElement, out: Float64Array): boolean {
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  for (let i = 0; i < 4; i++) {
    corner.set(i === 1 || i === 2 ? x1 : x0, i >= 2 ? y0 : y1, z).applyMatrix4(obj.matrixWorld).project(camera)
    if (corner.z < -1 || corner.z > 1) return false
    out[i * 2] = canvas.offsetLeft + ((corner.x + 1) / 2) * cw
    out[i * 2 + 1] = canvas.offsetTop + ((1 - corner.y) / 2) * ch
  }
  return true
}
