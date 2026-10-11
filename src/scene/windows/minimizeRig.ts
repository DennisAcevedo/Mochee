import { MathUtils, Vector3, type Camera, type Group, type Object3D } from 'three'
import { projectRect, quadTransform } from './domQuad'
import { chipPlace, chipReveal, closeScale, minimizeEase, type Box } from './minimize'
import { LIGHTS_BOX, LIGHTS_PX, type ControlParts } from './WindowControls'
import { WINDOW_UI } from './windowConfig'
import { WINDOW_STYLE } from './windowStyle'

// The window's minimize and close, run from its frame loop (BrowserWindow3D):
// - the fold (yellow): progress m runs 0 -> 1 in WINDOW_UI.minimize.ms (back
//   in restoreMs) and moves the `mini` group (between the window's outer
//   group and its pivot) along the camera ray onto the restore chip,
//   squashing the window to the chip's size, then parks it hidden;
// - the close (red): progress c runs 0 -> 1 in WINDOW_UI.close.ms (back in
//   openMs) and shrinks `mini` into the window's own centre, then parks it
//   hidden; no chip;
// - the chip: placed above the bottom bar's left end (chipPlace), it pops in
//   over the last part of the fold and out over the first part of a restore;
// - the DOM traffic lights: glued onto the 3D dots each frame, hidden while
//   the window is folded, closing, closed or off stage.
// Nothing here allocates per frame.

const M = WINDOW_UI.minimize
const C = WINDOW_UI.close
const S = WINDOW_STYLE.tabStrip
const LIGHT_Z = WINDOW_STYLE.z + WINDOW_STYLE.layer * 9 // just in front of the 3D dots

const world = new Vector3()
const ray = new Vector3()
const pa = new Vector3()
const pb = new Vector3()

function boxOf(el: Element | null | undefined): Box | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? r : null
}

// The room hides (an ancestor's visible = false) during the intro.
function onStage(o: Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false
  return true
}

let reduced: boolean | null = null
function reducedMotion(): boolean {
  if (reduced === null) {
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      reduced = false
    }
  }
  return reduced
}

export class MinimizeRig {
  m: number // fold progress: 0 the window, 1 the chip
  c: number // close progress: 0 the window, 1 gone
  private readonly parts: ControlParts
  // The chip's centre and size, and the canvas's box, in viewport px.
  private at = { cx: 0, cy: 0, w: 0, h: 0, ok: false, left: 0, top: 0, width: 1, height: 1 }
  private measuredAt = -Infinity
  private chipK = -1
  private chipEl: HTMLElement | null = null
  private lightsOn = false
  private lightsEl: HTMLElement | null = null
  private lightsT = ''
  private readonly q = new Float64Array(8)
  private readonly prev = new Float64Array(8)
  private parked = false

  constructor(parts: ControlParts, minimized: boolean, closed: boolean) {
    this.parts = parts
    this.m = minimized ? 1 : 0
    this.c = closed ? 1 : 0
  }

  // Advances the fold and the close and places `mini`. Call once a frame,
  // after the outer group is placed and before anything reads the window's
  // world position. cw, ch: the window's size; scale: its pivot's scale.
  step(dt: number, now: number, minimized: boolean, closed: boolean, outer: Group, mini: Group, cw: number, ch: number, scale: number, camera: Camera, canvas: HTMLCanvasElement) {
    const t = Math.min(dt, 0.25) * 1000 // time-based: a slow frame finishes it sooner, never later
    // Closing a minimized window: the chip just goes (the window is already hidden).
    if (closed && this.m > 0) {
      this.m = 0
      this.c = 1
    }
    const target = minimized ? 1 : 0
    if (this.m !== target) {
      if (this.m === 0) this.measuredAt = -Infinity // a fold starts: find the chip now
      const ms = reducedMotion() ? 1 : minimized ? M.ms : M.restoreMs
      this.m = minimized ? Math.min(1, this.m + t / ms) : Math.max(0, this.m - t / ms)
    }
    const shut = closed ? 1 : 0
    if (this.c !== shut) {
      const ms = reducedMotion() ? 1 : closed ? C.ms : C.openMs
      this.c = closed ? Math.min(1, this.c + t / ms) : Math.max(0, this.c - t / ms)
    }
    if ((this.m > 0 || minimized) && now - this.measuredAt >= M.chip.remeasureMs) this.measure(now, canvas)
    if (this.c > 0) this.placeClose(mini)
    else this.place(outer, mini, cw, ch, scale, camera)
    this.showChip(onStage(outer))
  }

  // Closing (or opening again): shrink into the window's own centre, then park hidden.
  private placeClose(mini: Group) {
    mini.position.set(0, 0, 0)
    if (this.c >= 1) {
      mini.visible = false
      mini.scale.setScalar(1e-4) // collapsed so its meshes catch no raycasts (R3F ignores `visible`)
      this.parked = true
      return
    }
    mini.visible = true
    this.parked = true // place() resets the scale once the window is fully open
    mini.scale.setScalar(closeScale(this.c))
  }

  // Where the chip goes (CSS px), written onto it; its centre and size read back.
  private measure(now: number, canvas: HTMLCanvasElement) {
    this.measuredAt = now
    const { host, chip } = this.parts
    if (!host || !chip) {
      this.at.ok = false
      return
    }
    const ask = document.querySelector('[data-gg-part="ask"]')
    const p = chipPlace(
      host.getBoundingClientRect(),
      boxOf(document.querySelector('[data-gg-part="stage"]')),
      boxOf(ask?.parentElement) ?? boxOf(ask), // the bottom bar: walkthrough + ask
      boxOf(document.querySelector('[data-gg-part="caption"]')),
      chip.offsetHeight,
    )
    const st = chip.style
    st.left = `${p.x}px`
    st.right = ''
    st.bottom = `${p.bottom}px`
    st.maxWidth = `${p.maxW}px`
    const r = chip.getBoundingClientRect() // scaled about its centre: the centre holds
    const c = canvas.getBoundingClientRect()
    const a = this.at
    a.cx = (r.left + r.right) / 2
    a.cy = (r.top + r.bottom) / 2
    a.w = chip.offsetWidth
    a.h = chip.offsetHeight
    a.left = c.left
    a.top = c.top
    a.width = Math.max(1, c.width)
    a.height = Math.max(1, c.height)
    a.ok = a.w > 0 && a.h > 0
  }

  private place(outer: Group, mini: Group, cw: number, ch: number, scale: number, camera: Camera) {
    if (this.m === 0) {
      if (this.parked || mini.scale.x !== 1 || mini.position.lengthSq() > 0) {
        mini.position.set(0, 0, 0)
        mini.scale.set(1, 1, 1)
        mini.visible = true
        this.parked = false
      }
      return
    }
    if (this.m === 1 && this.at.ok) {
      // Parked in the chip: hidden, and collapsed so its meshes catch no raycasts (R3F ignores `visible`).
      mini.visible = false
      mini.scale.setScalar(1e-4)
      this.parked = true
      return
    }
    mini.visible = true
    this.parked = false
    const e = minimizeEase(this.m)
    const a = this.at
    let sx = 0.1
    let sy = 0.1
    if (a.ok) {
      // The chip's centre on the camera ray through it, at the flight depth (in front of the tutor).
      world.set(((a.cx - a.left) / a.width) * 2 - 1, -((a.cy - a.top) / a.height) * 2 + 1, 0.5).unproject(camera)
      ray.copy(world).sub(camera.position)
      world.copy(camera.position).addScaledVector(ray, Math.abs(ray.z) > 1e-6 ? (M.z - camera.position.z) / ray.z : 0)
      // Px per world unit there, to squash the window onto the chip.
      pa.copy(world).setX(world.x - 0.5).project(camera)
      pb.copy(world).setX(world.x + 0.5).project(camera)
      const ppuX = ((pb.x - pa.x) / 2) * a.width
      pa.copy(world).setY(world.y - 0.5).project(camera)
      pb.copy(world).setY(world.y + 0.5).project(camera)
      const ppuY = ((pb.y - pa.y) / 2) * a.height
      sx = MathUtils.clamp(a.w / Math.max(1e-3, cw * scale * ppuX), 0.01, 1)
      sy = MathUtils.clamp(a.h / Math.max(1e-3, ch * scale * ppuY), 0.01, 1)
      if (outer.parent) outer.parent.worldToLocal(world)
    } else world.copy(outer.position) // no chip yet: shrink in place
    mini.position.set((world.x - outer.position.x) * e, (world.y - outer.position.y) * e, (world.z - outer.position.z) * e)
    mini.scale.set(MathUtils.lerp(1, sx, e), MathUtils.lerp(1, sy, e), MathUtils.lerp(1, Math.min(sx, sy), e))
  }

  private showChip(stage: boolean) {
    const chip = this.parts.chip
    if (!chip) return
    if (chip !== this.chipEl) {
      this.chipEl = chip // a fresh element (remount): style it from scratch
      this.chipK = -1
      this.measuredAt = -Infinity
    }
    const k = stage && this.at.ok ? chipReveal(this.m) : 0
    if (k === this.chipK) return
    this.chipK = k
    const st = chip.style
    st.visibility = k > 0 ? 'visible' : 'hidden'
    st.opacity = String(k)
    st.transform = k >= 1 ? '' : `scale(${0.82 + 0.18 * k})`
    if (k >= 1 && this.parts.focus === 'chip') {
      this.parts.focus = null
      chip.focus({ preventScroll: true })
    }
  }

  // Glues the DOM lights onto the 3D dots of `pivot` (placed this frame).
  // Hidden while the window folds, closes or is gone, and off stage.
  glue(pivot: Group, cw: number, ch: number, camera: Camera, canvas: HTMLCanvasElement) {
    const el = this.parts.lights
    if (!el) return
    if (el !== this.lightsEl) {
      this.lightsEl = el // a fresh element (remount): style it from scratch
      this.lightsOn = false
      this.lightsT = ''
    }
    let on = this.m === 0 && this.c === 0 && onStage(pivot)
    if (on) {
      pivot.updateWorldMatrix(true, false)
      const left = -cw / 2
      const yc = ch / 2 - S.height / 2 + LIGHTS_BOX.dy
      on = projectRect(pivot, left + LIGHTS_BOX.x0, left + LIGHTS_BOX.x1, yc - LIGHTS_BOX.h / 2, yc + LIGHTS_BOX.h / 2, LIGHT_Z, camera, canvas, this.q)
    }
    if (on !== this.lightsOn) {
      el.style.visibility = on ? 'visible' : 'hidden'
      this.lightsOn = on
      this.lightsT = ''
    }
    if (!on) return
    // Only rebuild the transform when a corner moved (a resting window costs nothing).
    let moved = this.lightsT === ''
    for (let i = 0; i < 8 && !moved; i++) moved = Math.abs(this.q[i] - this.prev[i]) > 0.05
    if (moved) {
      this.prev.set(this.q)
      this.lightsT = quadTransform(this.q, LIGHTS_PX.w, LIGHTS_PX.h)
      el.style.transform = this.lightsT
    }
    if (this.parts.focus === 'lights') {
      this.parts.focus = null
      // Only if focus is still where the keyboard press left it (the chip, the
      // stage after a close, or nowhere): a reopen by the lesson never steals it.
      const a = document.activeElement
      if (!a || a === document.body || a === this.parts.chip || a === this.parts.host?.parentElement || el.contains(a)) {
        el.querySelector<HTMLButtonElement>('[data-light="minimize"]')?.focus({ preventScroll: true })
      }
    }
  }
}
