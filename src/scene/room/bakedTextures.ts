import { CanvasTexture, SRGBColorSpace } from 'three'

// Small textures painted once on a 2D canvas: soft glows and blob shadows for
// the stage and the windows.

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

// Soft blob for contact shadows: white centre fading to clear, so the
// material colour sets the shadow's tint.
export function blobTexture(): CanvasTexture {
  const size = 256
  const { canvas, ctx } = makeCanvas(size, size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.4)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return finish(canvas)
}
