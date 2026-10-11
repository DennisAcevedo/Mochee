import { Vector3 } from 'three'
import { LESSON_CAMERA, WINDOW } from './layout3d.ts'

// Live world positions shared between scene components without re-rendering:
// the tutor component writes `tutor` and `hands` every frame, the browser
// window writes its centre and the camera's position. The effects layer, the
// play props and the pointing gate (windows/pointGate.ts) read them.
export const anchors = {
  tutor: new Vector3(0, 0, 0), // top of his head
  handL: new Vector3(-0.6, -0.4, 0.4),
  handR: new Vector3(0.6, -0.4, 0.4),
  notes: new Vector3(...WINDOW.position), // the browser window's centre (BrowserWindow3D writes it every frame)
  board: new Vector3(...WINDOW.position), // same window: the board is one of its tabs (kept for FxTarget 'board')
  camera: new Vector3(...LESSON_CAMERA.position), // the live camera (BrowserWindow3D writes it every frame, after CameraRig)
}
