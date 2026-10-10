import { useFrame } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { INTRO } from '../animation/config'
import { intro } from '../animation/introState'
import { introTargets } from '../intro/targets'
import { theme } from '../theme'
import { sceneFrame, sceneRig } from './sceneRig'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const slotRect: Rect = { x: 0, y: 0, w: 0, h: 0 }
const stageRect: Rect = { x: 0, y: 0, w: 0, h: 0 }

function measure(el: HTMLElement | undefined, out: Rect, fallback: Rect) {
  if (el) {
    const r = el.getBoundingClientRect()
    if (r.width && r.height) {
      out.x = r.left
      out.y = r.top
      out.w = r.width
      out.h = r.height
      return out
    }
  }
  return Object.assign(out, fallback)
}

let lastClip = ''
let lastOpacity = ''

// Runs before the character tick (negative priority, which R3F treats as
// "before" without taking over rendering). Projects the fullscreen canvas as
// if it were the current frame rect, moves the camera, and clips the canvas.
export function CameraRig() {
  useFrame((state) => {
    const cam = state.camera as PerspectiveCamera
    const vw = state.size.width
    const vh = state.size.height
    if (!vw || !vh) return

    const box = INTRO.slotSize
    const a = measure(introTargets.slot, slotRect, { x: (vw - box) / 2, y: (vh - box) / 2, w: box, h: box })
    const b = measure(introTargets.stage, stageRect, { x: 0, y: 0, w: vw, h: vh })
    const t = sceneRig.frameT
    const f = sceneFrame
    f.x = lerp(a.x, b.x, t)
    f.y = lerp(a.y, b.y, t)
    f.w = lerp(a.w, b.w, t)
    f.h = lerp(a.h, b.h, t)

    cam.aspect = f.w / f.h
    cam.setViewOffset(f.w, f.h, -f.x, -f.y, vw, vh)
    const c = sceneRig.cam
    // Track the spin's rise, and the arc while the camera is still in close.
    const follow = (intro.out.rise + intro.lift * (1 - t)) * INTRO.spin.cameraFollow
    cam.position.set(c.px, c.py + follow, c.pz)
    cam.lookAt(c.tx, c.ty + follow, c.tz)
    cam.updateMatrixWorld()

    const wrap = introTargets.scene
    if (wrap) {
      const k = sceneRig.clipT
      const clip =
        k <= 0
          ? 'none'
          : `inset(${lerp(0, b.y, k)}px ${lerp(0, vw - b.x - b.w, k)}px ${lerp(0, vh - b.y - b.h, k)}px ${lerp(0, b.x, k)}px round ${lerp(0, theme.radii.stage, k)}px)`
      if (clip !== lastClip) wrap.style.clipPath = lastClip = clip
      const opacity = String(sceneRig.canvasOpacity)
      if (opacity !== lastOpacity) wrap.style.opacity = lastOpacity = opacity
    }
  }, -1)

  return null
}
