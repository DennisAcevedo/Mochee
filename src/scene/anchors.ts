import { Vector3 } from 'three'

// Live world positions shared between scene components without re-rendering:
// the tutor component writes `tutor` and `hands` every frame, the windows write
// their centers. The effects layer and the play props read them.
export const anchors = {
  tutor: new Vector3(0, 0, 0), // top of his head
  handL: new Vector3(-0.6, -0.4, 0.4),
  handR: new Vector3(0.6, -0.4, 0.4),
  notes: new Vector3(-3.35, 0.35, -0.6),
  board: new Vector3(3.35, 0.35, -0.6),
}
