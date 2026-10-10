import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, PlaneGeometry, Shape, ShapeGeometry, type Path } from 'three'

// Flat geometry helpers shared by the windows and the room: rounded
// rectangles (with per-corner radii) and rounded-rect outlines. Geometries
// are cached by their dimensions, so a re-render never rebuilds them.

const CURVE_SEGMENTS = 8
const cache = new Map<string, BufferGeometry>()

// Corner radii, clockwise from top-left.
export type Radii = number | [number, number, number, number]

function corners(r: Radii, w: number, h: number): [number, number, number, number] {
  const max = Math.min(w, h) / 2
  const [tl, tr, br, bl] = typeof r === 'number' ? [r, r, r, r] : r
  return [Math.min(tl, max), Math.min(tr, max), Math.min(br, max), Math.min(bl, max)]
}

// Rounded-rect path centred on the origin.
export function roundedRectPath<T extends Path>(target: T, w: number, h: number, r: Radii) {
  const [tl, tr, br, bl] = corners(r, w, h)
  const x = -w / 2
  const y = -h / 2
  target.moveTo(x + bl, y)
  target.lineTo(x + w - br, y)
  if (br) target.quadraticCurveTo(x + w, y, x + w, y + br)
  target.lineTo(x + w, y + h - tr)
  if (tr) target.quadraticCurveTo(x + w, y + h, x + w - tr, y + h)
  target.lineTo(x + tl, y + h)
  if (tl) target.quadraticCurveTo(x, y + h, x, y + h - tl)
  target.lineTo(x, y + bl)
  if (bl) target.quadraticCurveTo(x, y, x + bl, y)
  return target
}

const key = (kind: string, ...n: (number | Radii)[]) => kind + ':' + n.map((v) => (Array.isArray(v) ? v.join('/') : v.toFixed(4))).join(',')

export function roundedRect(w: number, h: number, r: Radii = 0): ShapeGeometry {
  const k = key('rr', w, h, r)
  let g = cache.get(k) as ShapeGeometry | undefined
  if (!g) {
    g = new ShapeGeometry(roundedRectPath(new Shape(), w, h, r), CURVE_SEGMENTS)
    cache.set(k, g)
  }
  return g
}

// Outline of a rounded rect, `stroke` wide, drawn outside the w x h box.
export function roundedRectRing(w: number, h: number, r: number, stroke: number): ShapeGeometry {
  const k = key('ring', w, h, r, stroke)
  let g = cache.get(k) as ShapeGeometry | undefined
  if (!g) {
    const outer = roundedRectPath(new Shape(), w + stroke * 2, h + stroke * 2, r + stroke)
    outer.holes.push(roundedRectPath(new Shape(), w, h, r))
    g = new ShapeGeometry(outer, CURVE_SEGMENTS)
    cache.set(k, g)
  }
  return g
}

// Unit plane whose left edge sits on the origin, so scale.x sweeps it rightward.
export function leftAnchoredPlane(): PlaneGeometry {
  const k = 'left-plane'
  let g = cache.get(k) as PlaneGeometry | undefined
  if (!g) {
    g = new PlaneGeometry(1, 1)
    g.translate(0.5, 0, 0)
    cache.set(k, g)
  }
  return g
}

// A rounded slab (the window frame): w x h x depth, centred on the origin,
// with a small bevel on the front and back edges.
export function roundedSlab(w: number, h: number, r: number, depth: number, bevel: number): ExtrudeGeometry {
  const k = key('slab', w, h, r, depth, bevel)
  let g = cache.get(k) as ExtrudeGeometry | undefined
  if (!g) {
    const shape = roundedRectPath(new Shape(), w - bevel * 2, h - bevel * 2, Math.max(0, r - bevel))
    g = new ExtrudeGeometry(shape, {
      depth: depth - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: CURVE_SEGMENTS,
    })
    g.translate(0, 0, -(depth - bevel * 2) / 2)
    g.computeVertexNormals()
    cache.set(k, g)
  }
  return g
}

// A hand-drawn ellipse stroke: a constant-width ribbon around rx x ry that
// runs `sweep` turns and grows by `spiral` (a share of the radius) so the
// overlap does not close neatly. setDrawRange(0, n * 6) draws it on.
export function ellipseStroke(rx: number, ry: number, stroke: number, segments: number, sweep: number, spiral: number): BufferGeometry {
  const k = key('ellipse', rx, ry, stroke, segments, sweep, spiral)
  let g = cache.get(k)
  if (!g) {
    const pos: number[] = []
    const idx: number[] = []
    const start = Math.PI * 0.62
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const a = start - t * sweep * Math.PI * 2
      const grow = 1 + spiral * (t - 0.5)
      const x = Math.cos(a) * rx * grow
      const y = Math.sin(a) * ry * grow
      // Ellipse normal, so the stroke keeps its width all the way round.
      let nx = Math.cos(a) / rx
      let ny = Math.sin(a) / ry
      const len = Math.hypot(nx, ny)
      nx /= len
      ny /= len
      const half = (stroke / 2) * (0.75 + 0.25 * Math.sin(t * Math.PI)) // thinner at the ends, like a pen
      pos.push(x - nx * half, y - ny * half, 0, x + nx * half, y + ny * half, 0)
      if (i < segments) {
        const b = i * 2
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
      }
    }
    g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    cache.set(k, g)
  }
  return g
}
