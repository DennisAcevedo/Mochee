import { CAMERA } from '../animation/config'

// One fullscreen canvas serves both screens. Its camera projects as if the
// canvas were only the "frame" rect (the start-screen character box, or the
// stage), so the start framing matches the design's 300px <tutor-3d> and the
// teaching framing matches Stage 1 exactly. The intro tweens these values;
// CameraRig applies them every frame.

export interface CameraPose {
  px: number
  py: number
  pz: number
  tx: number
  ty: number
  tz: number
}

export const CAMERA_REST: CameraPose = {
  px: CAMERA.position[0],
  py: CAMERA.position[1],
  pz: CAMERA.position[2],
  tx: CAMERA.lookAt[0],
  ty: CAMERA.lookAt[1],
  tz: CAMERA.lookAt[2],
}

export const sceneRig = {
  frameT: 0, // 0 = start-screen box, 1 = stage
  clipT: 0, // 0 = canvas unclipped, 1 = clipped to the stage's rounded rect
  canvasOpacity: 1,
  roomT: 0, // 0 = intro camera, 1 = the room's lesson camera (CameraRig blends; live holds it at 1)
  cam: { ...CAMERA_REST },
  charScreen: { x: 0, y: 0 }, // character root in viewport px, written by the tick
}

// The current frame rect in viewport px, written by CameraRig, read by useLook.
export const sceneFrame = { x: 0, y: 0, w: 0, h: 0 }

export function resetSceneRig() {
  sceneRig.frameT = 0
  sceneRig.clipT = 0
  sceneRig.canvasOpacity = 1
  sceneRig.roomT = 0
  Object.assign(sceneRig.cam, CAMERA_REST)
}
