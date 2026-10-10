import {
  CanvasTexture,
  ExtrudeGeometry,
  PlaneGeometry,
  RingGeometry,
  Shape,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three'
import { FX } from './config'

// Geometry and textures for the effects, built once in code (no downloads).
// Every geometry is normalised to a 1-unit height and centred, so a particle's
// `size` is its height in world units.

function normalise(geometry: BufferGeometry): BufferGeometry {
  geometry.center()
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const h = box.max.y - box.min.y
  geometry.scale(1 / h, 1 / h, 1 / h)
  geometry.computeVertexNormals()
  return geometry
}

const HEART_EXTRUDE = { depth: 4, bevelEnabled: true, bevelSegments: 4, bevelSize: 2, bevelThickness: 2, curveSegments: 18 }
const STAR = { points: 5, outer: 1, inner: 0.46 }
const STAR_EXTRUDE = { depth: 0.22, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.1, bevelThickness: 0.12, curveSegments: 4 }

// Puffy heart (the classic three.js heart path, flipped point-down).
export function heartGeometry(): BufferGeometry {
  const s = new Shape()
  s.moveTo(5, 5)
  s.bezierCurveTo(5, 5, 4, 0, 0, 0)
  s.bezierCurveTo(-6, 0, -6, 7, -6, 7)
  s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19)
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7)
  s.bezierCurveTo(16, 7, 16, 0, 10, 0)
  s.bezierCurveTo(7, 0, 5, 5, 5, 5)
  const g = new ExtrudeGeometry(s, HEART_EXTRUDE)
  g.rotateZ(Math.PI)
  return normalise(g)
}

// Chunky five-point star.
export function starGeometry(): BufferGeometry {
  const s = new Shape()
  const n = STAR.points * 2
  for (let i = 0; i < n; i++) {
    const r = i % 2 === 0 ? STAR.outer : STAR.inner
    const a = Math.PI / 2 + (i / n) * Math.PI * 2
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  s.closePath()
  return normalise(new ExtrudeGeometry(s, STAR_EXTRUDE))
}

export function confettiGeometry(): BufferGeometry {
  return new PlaneGeometry(1, FX.confetti.aspect)
}

export function quadGeometry(): BufferGeometry {
  return new PlaneGeometry(1, 1)
}

export function ringGeometry(): BufferGeometry {
  return new RingGeometry(1 - FX.ring.width, 1, 64)
}

const SPRITE_PX = 128

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SPRITE_PX
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx, SPRITE_PX)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

// Four-point twinkle: a soft halo, a long thin cross and a hot white core.
// White, so the per-particle colour tints it.
export function sparkleTexture(): CanvasTexture {
  return canvasTexture((ctx, size) => {
    const c = size / 2
    const halo = ctx.createRadialGradient(c, c, 0, c, c, c)
    halo.addColorStop(0, 'rgba(255,255,255,0.9)')
    halo.addColorStop(0.25, 'rgba(255,255,255,0.35)')
    halo.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#fff'
    const arm = c * 0.98
    const waist = c * 0.13
    ctx.beginPath()
    ctx.moveTo(c, c - arm)
    ctx.quadraticCurveTo(c + waist * 0.3, c - waist * 0.3, c + arm, c)
    ctx.quadraticCurveTo(c + waist * 0.3, c + waist * 0.3, c, c + arm)
    ctx.quadraticCurveTo(c - waist * 0.3, c + waist * 0.3, c - arm, c)
    ctx.quadraticCurveTo(c - waist * 0.3, c - waist * 0.3, c, c - arm)
    ctx.fill()
  })
}

// Soft round glow for the level-up flash.
export function glowTexture(): CanvasTexture {
  return canvasTexture((ctx, size) => {
    const c = size / 2
    const g = ctx.createRadialGradient(c, c, 0, c, c, c)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  })
}
