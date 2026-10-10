import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Quaternion,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'

// Geometry builders and surface placements, ported 1:1 from design/tutor-3d.js.

export const BODY_R = 0.8

const Z_AXIS = new Vector3(0, 0, 1)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// Sphere with a flattened, slightly flared base ("gumdrop").
export function buildBodyGeometry(): SphereGeometry {
  const g = new SphereGeometry(BODY_R, 96, 64)
  const pos = g.attributes.position
  const v = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    if (v.y < 0) {
      const k = 1 + 0.1 * (-v.y / BODY_R)
      v.x *= k
      v.z *= k
    }
    if (v.y < -0.58) v.y = -0.58 + (v.y + 0.58) * 0.45
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

// Vertical vertex-color gradient between two colors.
export function tint<G extends BufferGeometry>(geo: G, ylo: number, yhi: number, c0: Color | string, c1: Color | string): G {
  const p = geo.attributes.position
  const cols: number[] = []
  const a = new Color(c0)
  const b = new Color(c1)
  const t = new Color()
  for (let i = 0; i < p.count; i++) {
    const k = clamp((p.getY(i) - ylo) / (yhi - ylo), 0, 1)
    t.copy(a).lerp(b, k)
    cols.push(t.r, t.g, t.b)
  }
  geo.setAttribute('color', new Float32BufferAttribute(cols, 3))
  return geo
}

// Cap pieces, tinted per capColors() in look.ts (default: the indigo gradient).
export function buildSkullGeometry(c0: Color | string = '#3d5ad6', c1: Color | string = '#6a4fd0') {
  return tint(new CylinderGeometry(0.47, 0.52, 0.24, 64), -0.12, 0.12, c0, c1)
}

export function buildBoardGeometry(c0: Color | string = '#5a4cc8', c1: Color | string = '#7a5ce0') {
  return tint(new BoxGeometry(1.1, 0.05, 1.1), -0.025, 0.025, c0, c1)
}

// Necktie blade outline from tutor-3d.js.
export function buildTieBladeGeometry(): ExtrudeGeometry {
  const ts = new Shape()
  ts.moveTo(-0.045, 0)
  ts.lineTo(0.045, 0)
  ts.lineTo(0.085, -0.25)
  ts.lineTo(0, -0.33)
  ts.lineTo(-0.085, -0.25)
  ts.closePath()
  return new ExtrudeGeometry(ts, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 4 })
}

// Four-point sparkle, extruded with a bevel.
export function buildSparkleGeometry(): ExtrudeGeometry {
  const sh = new Shape()
  const k = 0.13
  const kx = 0.11
  const c = 0.012
  const e = 0.05
  sh.moveTo(0, k)
  sh.bezierCurveTo(c, e, e, c, kx, 0)
  sh.bezierCurveTo(e, -c, c, -e, 0, -k)
  sh.bezierCurveTo(-c, -e, -e, -c, -kx, 0)
  sh.bezierCurveTo(-e, c, -c, e, 0, k)
  return new ExtrudeGeometry(sh, {
    depth: 0.015,
    curveSegments: 24,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.008,
    bevelSegments: 6,
  })
}

// 128px radial gradient canvas, used for the cheeks and the ground blob.
export function radialTexture(inner: string, outer: string): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, inner)
  gr.addColorStop(1, outer)
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

export interface Placement {
  position: Vector3
  quaternion: Quaternion
}

// Puts a feature on the body sphere at (x, y), facing outward along the normal,
// `off` units above the surface, then rotates it about its own z by `rotZ`.
export function placeOnSphere(x: number, y: number, off = 0, rotZ = 0): Placement {
  const z = Math.sqrt(Math.max(0, BODY_R * BODY_R - x * x - y * y))
  const n = new Vector3(x, y, z).normalize()
  const position = n.clone().multiplyScalar(BODY_R + off)
  const quaternion = new Quaternion().setFromUnitVectors(Z_AXIS, n)
  if (rotZ) quaternion.multiply(new Quaternion().setFromAxisAngle(Z_AXIS, rotZ))
  return { position, quaternion }
}

export const FACE = {
  eyeL: placeOnSphere(-0.205, -0.01, -0.012),
  eyeR: placeOnSphere(0.205, -0.01, -0.012),
  happyL: placeOnSphere(-0.205, -0.02, 0.004, Math.PI * 0.075),
  happyR: placeOnSphere(0.205, -0.02, 0.004, Math.PI * 0.075),
  // Closed ∪ eyes for the sleep pose.
  sleepL: placeOnSphere(-0.205, 0.01, 0.004, Math.PI * 1.1),
  sleepR: placeOnSphere(0.205, 0.01, 0.004, Math.PI * 1.1),
  sparkL: placeOnSphere(-0.41, 0.16, 0.05),
  sparkR: placeOnSphere(0.41, 0.16, 0.05),
  browL: placeOnSphere(-0.21, 0.16, 0.004, Math.PI * 0.15 + 0.1),
  browR: placeOnSphere(0.21, 0.16, 0.004, Math.PI * 0.15 - 0.1),
  smile: placeOnSphere(0, -0.13, 0.004, -Math.PI * 0.9),
  mouth: placeOnSphere(0, -0.15, 0),
  cheekL: placeOnSphere(-0.37, -0.1, 0.008),
  cheekR: placeOnSphere(0.37, -0.1, 0.008),
} as const

const tiePlace = placeOnSphere(0, -0.36, 0.02)
tiePlace.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.12))

// Accessories that sit on the body, from tutor-3d.js.
export const ACCESSORY_PLACES = {
  rimL: placeOnSphere(-0.205, -0.01, 0.035),
  rimR: placeOnSphere(0.205, -0.01, 0.035),
  bridge: placeOnSphere(0, 0, 0.045),
  bowtie: placeOnSphere(0, -0.4, 0.06),
  tie: tiePlace,
} as const
