import { useWindows } from '../../state/windows'
import { ROOM, SPOTS, WINDOW } from '../layout3d'
import { yawAt } from './windowPlace'

// He teaches beside the browser window wherever the student dragged it. The
// window only really moves in x (its height on screen barely changes), so
// this is one number: which side of the stage it is on. The lesson keeps
// asking for 'point_left' and the 'left' spot ("at the window"); the tutor
// reads them through here:
// - pointSide: -1 when the window is on his left (the default), +1 on his right.
// - pointClip: the point loop that aims at it.
// - pointStand: where he stands while teaching from it, beside its nearer
//   edge with the same gap as the default layout (SPOTS.left beside WINDOW).

const halfWidth = (x: number, w: number) => (w / 2) * Math.cos(yawAt(x))

// The default layout's gap from the window's right edge to his centre.
const GAP = SPOTS.left.x - (WINDOW.position[0] + halfWidth(WINDOW.position[0], WINDOW.width))
const LANE = ROOM.width / 2 - 0.9 // keep him (and his reach) inside the walls

// The window's centre x and half width now, or null while it is not on the stage.
function windowSpan(): { x: number; half: number } | null {
  const w = useWindows.getState()
  if (w.minimized || w.closed || w.maximized) return null
  const x = WINDOW.position[0] + w.layout.offset[0]
  return { x, half: halfWidth(x, w.layout.size?.[0] ?? WINDOW.width) }
}

export function pointSide(): -1 | 1 {
  const s = windowSpan()
  return s && s.x > SPOTS.center.x ? 1 : -1
}

export function pointClip(): 'point_left' | 'point_right' {
  return pointSide() > 0 ? 'point_right' : 'point_left'
}

export function pointStand(out = { x: 0, z: 0 }): { x: number; z: number } {
  const s = windowSpan()
  out.z = SPOTS.left.z
  if (!s) {
    out.x = SPOTS.left.x
    return out
  }
  const x = s.x - pointSide() * (s.half + GAP)
  out.x = Math.max(-LANE, Math.min(LANE, x))
  return out
}
