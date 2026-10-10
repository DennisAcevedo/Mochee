import { Quaternion, Vector3, type Object3D } from 'three'
import { BLINK, BROW_LIFT, EYES, FACE_DAMP, MOUTH, SPEAK, type FaceState } from './config'
import type { RigNode, RigNodes } from './rigNodes'

// The face is driven in code, on top of whatever the clip does to the body:
// random blinks, the face state of the playing clip (happy arcs, closed or
// surprised eyes), the talking mouth and the brow lift while he speaks.
// Every write is absolute (rest x multiplier), so nothing accumulates.

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))

// The world's up axis in a node's parent space, so a brow lift reads as "up"
// whatever axes the Blender bone ended up with. Measured once, at rest.
function upInParent(n: RigNode, root: Object3D): Vector3 {
  const q = new Quaternion()
  const s = new Vector3(1, 1, 1)
  for (let o = n.node.parent; o && o !== root; o = o.parent) {
    q.premultiply(o.quaternion)
    s.multiply(o.scale)
  }
  const up = new Vector3(0, 1, 0).applyQuaternion(q.invert())
  return up.divideScalar((Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z)) / 3 || 1)
}

export class TutorFace {
  private eyeX = 1
  private eyeY = 1
  private brow = 0
  private mouth = 0
  private blinkIn: number
  private blinkT = -1 // seconds into the current blink, -1 when not blinking
  private readonly browUp: Vector3[]
  private readonly n: RigNodes

  constructor(nodes: RigNodes, root: Object3D) {
    this.n = nodes
    this.blinkIn = BLINK.gapMin + Math.random() * BLINK.gapRand
    this.browUp = [nodes.browL, nodes.browR].map((b) => (b ? upInParent(b, root) : new Vector3(0, 1, 0)))
    // The happy arcs only show for the happy face.
    for (const k of ['happyL', 'happyR'] as const) if (nodes[k]) nodes[k].node.visible = false
  }

  private blink(dt: number, canBlink: boolean): number {
    if (this.blinkT < 0) {
      this.blinkIn -= dt
      if (this.blinkIn <= 0 && canBlink) this.blinkT = 0
      return 1
    }
    this.blinkT += dt
    if (this.blinkT >= BLINK.duration) {
      this.blinkT = -1
      this.blinkIn = BLINK.gapMin + Math.random() * BLINK.gapRand
      return 1
    }
    return 1 - (1 - BLINK.closed) * Math.sin((Math.PI * this.blinkT) / BLINK.duration)
  }

  update(dt: number, t: number, face: FaceState, speaking: boolean): void {
    const n = this.n
    const happy = face === 'happy'

    // Eyes: damp toward the face's scale, blink on top (not while closed or happy).
    const [ex, ey] = EYES[face]
    this.eyeX = damp(this.eyeX, ex, FACE_DAMP.eyes, dt)
    this.eyeY = damp(this.eyeY, ey, FACE_DAMP.eyes, dt)
    const blink = this.blink(dt, !happy && face !== 'closed')
    for (const k of ['eyeL', 'eyeR'] as const) {
      const e = n[k]
      if (!e) continue
      e.node.visible = !happy
      e.node.scale.set(e.restScale.x * this.eyeX, e.restScale.y * this.eyeY * blink, e.restScale.z)
    }
    for (const k of ['happyL', 'happyR'] as const) if (n[k]) n[k].node.visible = happy

    // Brows: the face's lift, plus a lift and a wobble while he talks.
    const speakLift = speaking ? SPEAK.browLift + SPEAK.browWobble * Math.sin(t * SPEAK.browF) : 0
    this.brow = damp(this.brow, BROW_LIFT[face] + speakLift, FACE_DAMP.brows, dt)
    ;[n.browL, n.browR].forEach((b, i) => {
      if (b) b.node.position.copy(b.restPos).addScaledVector(this.browUp[i], this.brow)
    })

    // Mouth: flaps while speaking, stays open for happy / surprised, else the smile shows.
    const talk = SPEAK.mouthBase + SPEAK.mouthAmp * Math.abs(Math.sin(t * SPEAK.mouthF)) * (SPEAK.mouthMod + SPEAK.mouthModAmp * Math.sin(t * SPEAK.mouthModF))
    const open = speaking ? Math.min(1, Math.max(0, talk)) : happy ? MOUTH.happyOpen : face === 'surprised' ? MOUTH.surprisedOpen : 0
    this.mouth = damp(this.mouth, open, FACE_DAMP.mouth, dt)
    const showMouth = this.mouth > MOUTH.visible
    if (n.mouth) {
      const m = n.mouth
      m.node.visible = showMouth
      m.node.scale.set(m.restScale.x, m.restScale.y * Math.max(MOUTH.minScale, this.mouth), m.restScale.z)
    }
    if (n.smile) n.smile.node.visible = !showMouth || !n.mouth
  }
}
