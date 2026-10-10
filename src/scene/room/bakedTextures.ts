import { CanvasTexture, SRGBColorSpace } from 'three'
import { ROOM_STYLE } from './roomStyle'

// Gradient textures painted once on a 2D canvas: the room's soft white tones
// and corner falloff are baked here, so the surfaces can use unlit materials
// and look exactly like the mock whatever the light rig does.

export type Edge = 'top' | 'right' | 'bottom' | 'left'

export interface SurfacePaint {
  // Linear gradient from `from` to `to` along `axis` (x: left to right, y: top
  // to bottom), or a radial one from the centre out when `radial` is set.
  from: string
  to: string
  axis?: 'x' | 'y'
  radial?: boolean
  edges: Edge[] // edges that meet another surface and get the dark falloff
  width: number // world size of the surface, to keep the falloff band constant
  height: number
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return { canvas, ctx: canvas.getContext('2d')! }
}

function finish(canvas: HTMLCanvasElement) {
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function surfaceTexture(p: SurfacePaint): CanvasTexture {
  const size = ROOM_STYLE.textureSize
  const { canvas, ctx } = makeCanvas(size, size)

  // Base tone.
  let g: CanvasGradient
  if (p.radial) {
    g = ctx.createRadialGradient(size / 2, size * 0.46, 0, size / 2, size * 0.46, size * 0.72)
  } else if (p.axis === 'x') {
    g = ctx.createLinearGradient(0, 0, size, 0)
  } else {
    g = ctx.createLinearGradient(0, 0, 0, size)
  }
  g.addColorStop(0, p.from)
  g.addColorStop(1, p.to)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  // Corner falloff, a band of constant world width along each touching edge.
  const { color, alpha, width } = ROOM_STYLE.falloff
  for (const edge of p.edges) {
    const across = edge === 'left' || edge === 'right' ? p.width : p.height
    const band = Math.min(0.5, width / across) * size
    let eg: CanvasGradient
    if (edge === 'top') eg = ctx.createLinearGradient(0, 0, 0, band)
    else if (edge === 'bottom') eg = ctx.createLinearGradient(0, size, 0, size - band)
    else if (edge === 'left') eg = ctx.createLinearGradient(0, 0, band, 0)
    else eg = ctx.createLinearGradient(size, 0, size - band, 0)
    eg.addColorStop(0, `rgba(${color}, ${alpha})`)
    eg.addColorStop(0.35, `rgba(${color}, ${alpha * 0.35})`)
    eg.addColorStop(1, `rgba(${color}, 0)`)
    ctx.fillStyle = eg
    ctx.fillRect(0, 0, size, size)
  }
  return finish(canvas)
}

// Soft round glow (white centre fading out), tinted by the material colour.
export function glowTexture(): CanvasTexture {
  const size = 256
  const { canvas, ctx } = makeCanvas(size, size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return finish(canvas)
}

// Soft dark blob for contact shadows under floating things.
export function blobTexture(): CanvasTexture {
  const size = 256
  const { canvas, ctx } = makeCanvas(size, size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(30,30,40,0.9)')
  g.addColorStop(0.45, 'rgba(30,30,40,0.35)')
  g.addColorStop(1, 'rgba(30,30,40,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return finish(canvas)
}
