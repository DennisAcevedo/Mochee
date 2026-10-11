import { FLOOR_Y, ROOM } from '../layout3d.ts'
import type { CameraPose } from '../sceneRig'

export const WALL_SHOP = {
  position: [-ROOM.width / 2 + 0.13, FLOOR_Y + 0.48, -2.5] as [number, number, number],
  width: 5.4,
  approachSeconds: 5,
  returnSeconds: 3.5,
  arrivalHoldSeconds: 0.65,
  camera: { px: -0.35, py: 0.55, pz: -2.5, tx: -4.5, ty: 0.45, tz: -2.5 } satisfies CameraPose,
  fov: 44,
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const curve = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
}

// An inward sweep around the left floor area. The camera moves left before
// turning to face the shelves, keeping the path inside the room. Sampling
// the same path backwards also lets Escape reverse a partially flown visit.
export function shopCameraPose(start: CameraPose, progress: number): CameraPose {
  const p = Math.max(0, Math.min(1, progress))
  const t = p * p * (3 - 2 * p)
  const end = WALL_SHOP.camera
  return {
    px: curve(start.px, start.px - 2.5, -2.0, end.px, t),
    py: lerp(start.py, end.py, t),
    pz: curve(start.pz, start.pz - 2.2, 0.6, end.pz, t),
    tx: lerp(start.tx, end.tx, t),
    ty: lerp(start.ty, end.ty, t),
    tz: lerp(start.tz, end.tz, t),
  }
}
