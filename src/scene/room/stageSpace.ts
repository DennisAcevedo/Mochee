import { PerspectiveCamera, Vector3 } from 'three'
import { LESSON_CAMERA } from '../layout3d'

// The lesson camera at rest, as a plain three camera, so stage dressing can be
// placed the way the mock places it: by where it lands in the 16:9 frame
// (u across, v down, both 0..1) at a chosen world depth. Only for layout at
// build time; nothing here runs per frame.

const cam = new PerspectiveCamera(LESSON_CAMERA.fov, LESSON_CAMERA.aspect, 0.1, 100)
cam.position.set(...LESSON_CAMERA.position)
cam.lookAt(...LESSON_CAMERA.lookAt)
cam.updateMatrixWorld()
cam.updateProjectionMatrix()

const near = new Vector3()
const far = new Vector3()
const rel = new Vector3()

// World point at world depth z that lands at frame (u, v).
export function framePoint(u: number, v: number, z: number, out = new Vector3()): Vector3 {
  near.set(u * 2 - 1, 1 - v * 2, -1).unproject(cam)
  far.set(u * 2 - 1, 1 - v * 2, 1).unproject(cam).sub(near)
  return out.copy(near).addScaledVector(far, (z - near.z) / far.z)
}

// The same point as a tuple, for config objects.
export function frameAt(u: number, v: number, z: number): [number, number, number] {
  return framePoint(u, v, z, rel).toArray() as [number, number, number]
}

// Yaw that turns something standing at p to face the resting camera.
export function yawToCamera(p: Vector3): number {
  return Math.atan2(cam.position.x - p.x, cam.position.z - p.z)
}
