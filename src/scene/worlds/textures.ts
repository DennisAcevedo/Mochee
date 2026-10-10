import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from 'three'
import { WORLD } from './worldConfig'

// Textures for the two worlds, painted once on a 2D canvas (no downloads):
// the classroom's floor tiles, the gym's planks, the window's sky, the soft
// daylight patch and the scoreboard face.

function canvas2d(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, ctx: c.getContext('2d')! }
}

function finish(c: HTMLCanvasElement, repeat = false) {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping
  return t
}

// One floor tile with a hairline seam on two edges; repeat it across the floor.
export function tileTexture(): CanvasTexture {
  const { px, seam, seamPx } = WORLD.study.tiles
  const { c, ctx } = canvas2d(px, px)
  ctx.fillStyle = WORLD.study.floor
  ctx.fillRect(0, 0, px, px)
  ctx.fillStyle = seam
  ctx.fillRect(0, 0, px, seamPx)
  ctx.fillRect(0, 0, seamPx, px)
  const t = finish(c, true)
  t.userData.tile = [WORLD.study.tiles.size, WORLD.study.tiles.size]
  return t
}

// Deterministic 0..1 noise, so the planks look the same on every load.
function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

function shade(hex: string, k: number) {
  const col = new Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  col.getHSL(hsl)
  return `#${col.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l * (1 + k)))).getHexString()}`
}

// A patch of court: `rows` planks deep, two plank lengths wide, end seams
// staggered row to row, a faint grain line per plank.
export function plankTexture(): CanvasTexture {
  const P = WORLD.play.planks
  const tileW = P.length * 2
  const tileD = P.width * P.rows
  const pxW = P.px
  const pxD = Math.round((P.px * tileD) / tileW)
  const sx = pxW / tileW
  const sz = pxD / tileD
  const { c, ctx } = canvas2d(pxW, pxD)
  for (let r = 0; r < P.rows; r++) {
    const y0 = r * P.width * sz
    const h = P.width * sz
    const offset = ((r * 0.37) % 1) * P.length // stagger
    for (let i = -1; i < 3; i++) {
      const x0 = (i * P.length + offset) * sx
      const w = P.length * sx
      ctx.fillStyle = shade(WORLD.play.floor, (hash(r * 7 + i) - 0.5) * 2 * P.vary)
      ctx.fillRect(x0, y0, w, h)
      // a faint grain line along the plank
      ctx.globalAlpha = 0.18
      ctx.fillStyle = P.grain
      ctx.fillRect(x0, y0 + h * (0.3 + hash(r * 13 + i) * 0.4), w, 2)
      ctx.globalAlpha = 1
      // end seam
      ctx.fillStyle = P.seam
      ctx.fillRect(x0 - 1, y0, 2, h)
    }
    ctx.fillStyle = P.seam
    ctx.fillRect(0, y0, pxW, P.seamPx)
  }
  const t = finish(c, true)
  t.userData.tile = [tileW, tileD]
  return t
}

// Window glass: sky at the top fading paler toward the sill, with two soft
// diagonal glints across it.
export function glassTexture(): CanvasTexture {
  const [top, bottom] = WORLD.study.window.glass
  const w = 512
  const h = 240
  const { c, ctx } = canvas2d(w, h)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.32)'
  for (const [x, width] of WORLD.study.window.glints) {
    ctx.beginPath()
    ctx.moveTo(x * w, h)
    ctx.lineTo((x + width) * w, h)
    ctx.lineTo((x + width + 0.22) * w, 0)
    ctx.lineTo((x + 0.22) * w, 0)
    ctx.closePath()
    ctx.fill()
  }
  return finish(c)
}

// A rectangle of light with feathered edges (white; the material tints it).
export function softRectTexture(feather = 0.22): CanvasTexture {
  const n = 256
  const { c, ctx } = canvas2d(n, n)
  const img = ctx.createImageData(n, n)
  const edge = (t: number) => Math.min(1, Math.min(t, 1 - t) / feather)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = edge((x + 0.5) / n) * edge((y + 0.5) / n)
      const i = (y * n + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(255 * a * a * (3 - 2 * a))
    }
  }
  ctx.putImageData(img, 0, 0)
  return finish(c)
}

// Sunlight through the window on the floor: the window's panes as soft
// bright rectangles with the mullions' gaps between them (white; the
// material tints it). Image top = the patch's far edge.
export function sunPanesTexture(): CanvasTexture {
  const { cols, rows } = WORLD.study.window
  const { px, gap, blur } = WORLD.study.light.panes
  const [w, h] = px
  const { c, ctx } = canvas2d(w, h)
  const pad = blur * 2
  const pw = (w - pad * 2 - gap * (cols - 1)) / cols
  const ph = (h - pad * 2 - gap * (rows - 1)) / rows
  ctx.filter = `blur(${blur}px)`
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) ctx.fillRect(pad + i * (pw + gap), pad + j * (ph + gap), pw, ph)
  }
  return finish(c)
}

// Light shaft: bright at the window end (top), fading out toward the floor.
export function shaftTexture(): CanvasTexture {
  const { c, ctx } = canvas2d(64, 256)
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 256)
  const side = ctx.createLinearGradient(0, 0, 64, 0)
  side.addColorStop(0, 'rgba(0,0,0,1)')
  side.addColorStop(0.25, 'rgba(0,0,0,0)')
  side.addColorStop(0.75, 'rgba(0,0,0,0)')
  side.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = side
  ctx.fillRect(0, 0, 64, 256)
  return finish(c)
}

// The scoreboard's face; call draw(makes, attempts) whenever the tally changes.
export function scoreboardFace() {
  const S = WORLD.play.scoreboard
  const [w, h] = S.px
  const { c, ctx } = canvas2d(w, h)
  const tex = finish(c)
  const draw = (makes: number, attempts: number) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = S.body
    ctx.fillRect(0, 0, w, h)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = S.label
    ctx.font = `800 ${Math.round(h * 0.25)}px ${S.font}`
    ctx.fillText(S.text, w / 2, h * 0.27)
    ctx.fillStyle = S.digits
    ctx.font = `800 ${Math.round(h * 0.42)}px ${S.font}`
    ctx.fillText(`${makes} / ${attempts}`, w / 2, h * 0.68)
    tex.needsUpdate = true
  }
  return { tex, draw }
}
