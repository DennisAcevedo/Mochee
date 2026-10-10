import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PerspectiveCamera, Vector3 } from 'three'
import { FLOOR_Y, LESSON_CAMERA, SPOTS, TUTOR_OUTLINE_LEFT, WINDOW, WINDOWS } from '../../src/scene/layout3d.ts'
import { WINDOW_UI } from '../../src/scene/windows/windowConfig.ts'
import { clampOffset, defaultSize, maximizedPlace, yawAt } from '../../src/scene/windows/windowPlace.ts'

// Window placement: moves clamp to the stage box (no bounce back inward when
// dragged far past an edge) and the maximized window fills its box.

const W = WINDOW
const out: [number, number] = [0, 0]
const clamp = (ox: number, oy: number, w = W.width, h = W.height) => [...clampOffset(ox, oy, w, h, out)]

describe('window move clamp', () => {
  it('leaves an offset that fits alone', () => {
    assert.deepEqual(clamp(0, 0), [0, 0])
    assert.deepEqual(clamp(0.1, -0.1), [0.1, -0.1])
  })

  it('stops at the edge however far past it the pointer goes', () => {
    const left = clamp(-0.4, 0)[0]
    for (const ox of [-0.6, -1, -2, -6]) assert.ok(Math.abs(clamp(ox, 0)[0] - left) < 1e-3, `x ${ox}`)
    const top = clamp(0, 0.4)[1]
    for (const oy of [0.6, 1, 2, 3.9]) assert.ok(Math.abs(clamp(0, oy)[1] - top) < 1e-3, `y ${oy}`)
    assert.ok(left < 0 && top >= 0)
  })

  it('clamps both axes at a corner', () => {
    const [x, y] = clamp(-3, 3)
    assert.ok(Math.abs(x - clamp(-3, 0)[0]) < 0.02)
    assert.ok(Math.abs(y - clamp(0, 3)[1]) < 0.02)
  })

  it('a turned window faces the centre more the further out it sits', () => {
    assert.equal(yawAt(W.position[0]), W.yaw)
    assert.ok(Math.abs(yawAt(W.position[0] / 2)) < Math.abs(W.yaw))
    assert.equal(yawAt(W.position[0] * 3), W.yaw) // capped
    assert.deepEqual(defaultSize(), [W.width, W.height])
    assert.equal(WINDOWS.notes, WINDOW)
    assert.equal(WINDOWS.board, WINDOW, 'the old right window name is the one window')
  })
})

describe('resting placement (one window, left of the tutor)', () => {
  const camAt = (panX: number) => {
    const c = new PerspectiveCamera(LESSON_CAMERA.fov, LESSON_CAMERA.aspect, 0.1, 100)
    c.position.set(LESSON_CAMERA.position[0] + panX, LESSON_CAMERA.position[1], LESSON_CAMERA.position[2])
    c.lookAt(LESSON_CAMERA.lookAt[0] + panX, LESSON_CAMERA.lookAt[1], LESSON_CAMERA.lookAt[2])
    c.updateMatrixWorld()
    c.updateProjectionMatrix()
    return c
  }
  // The window's NDC box: at rest, or focused (turned to focusYaw, scaled, lifted W.focus.lift 0.25 toward the camera).
  const box = (cam: PerspectiveCamera, focused: boolean) => {
    const yaw = focused ? WINDOWS.focusYaw : W.yaw
    const s = focused ? WINDOWS.focusScale : 1
    const [px, py, pz] = W.position
    const z = pz + (focused ? 0.25 : 0)
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = (sx * W.width * s) / 2
      const p = new Vector3(px + lx * Math.cos(yaw), py + (sy * W.height * s) / 2, z - lx * Math.sin(yaw)).project(cam)
      x0 = Math.min(x0, p.x)
      x1 = Math.max(x1, p.x)
      y0 = Math.min(y0, p.y)
      y1 = Math.max(y1, p.y)
    }
    return { x0, x1, y0, y1 }
  }
  // Stage bands at 1456 x 785 (stage frame y 66..724): the play HUD ends at
  // y 160 (NDC 0.71), the caption starts at y 587 (NDC -0.58).
  const HUD = 0.71
  const CAPTION = -0.58

  it('rests on the left of the stage, on screen, between the play HUD and the caption', () => {
    const b = box(camAt(0), false)
    assert.ok(b.x0 >= -0.98 && b.x1 <= -0.3, JSON.stringify(b))
    assert.ok(b.y1 < HUD && b.y0 > CAPTION, JSON.stringify(b))
  })

  // The drawn window's outline on screen in the focused pose: the focus ring
  // (the outermost thing drawn: gap 0.03 + stroke 0.035 past the frame, whose
  // corner radius is 0.1, pinned from windowStyle.ts, which Node cannot load)
  // with its rounded corners sampled. Convex, in order around the window.
  const RING_PAD = 0.03 + 0.035
  const outline = (cam: PerspectiveCamera): [number, number][] => {
    const hw = W.width / 2 + RING_PAD
    const hh = W.height / 2 + RING_PAD
    const r = 0.1 + RING_PAD
    const s = WINDOWS.focusScale
    const yaw = WINDOWS.focusYaw
    const [px, py, pz] = W.position
    const z = pz + 0.25 // focus lift
    const pts: [number, number][] = []
    for (let k = 0; k < 96; k++) {
      const a = ((k + 0.5) / 96) * Math.PI * 2
      const lx = s * (Math.sign(Math.cos(a)) * (hw - r) + r * Math.cos(a))
      const ly = s * (Math.sign(Math.sin(a)) * (hh - r) + r * Math.sin(a))
      const p = new Vector3(px + lx * Math.cos(yaw), py + ly, z - lx * Math.sin(yaw)).project(cam)
      pts.push([p.x, p.y])
    }
    return pts
  }
  // Signed distance from a point to a convex polygon: > 0 outside, < 0 inside.
  const signedDistance = (poly: [number, number][], [x, y]: [number, number]) => {
    let area = 0
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i]
      const [bx, by] = poly[(i + 1) % poly.length]
      area += ax * by - bx * ay
    }
    let inside = true
    let d = Infinity
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i]
      const [bx, by] = poly[(i + 1) % poly.length]
      const ex = bx - ax
      const ey = by - ay
      if (Math.sign(area) * (ex * (y - ay) - ey * (x - ax)) < 0) inside = false
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)))
      d = Math.min(d, Math.hypot(x - (ax + t * ex), y - (ay + t * ey)))
    }
    return inside ? -d : d
  }

  // How far (NDC) the tutor's left outline, standing at root x, stays outside the window; < 0 = overlap.
  const clearance = (x: number, cam: PerspectiveCamera) => {
    const poly = outline(cam)
    return Math.min(...TUTOR_OUTLINE_LEFT.map((o) => {
      const p = new Vector3(x + o.dx, FLOOR_Y + o.up, SPOTS.left.z + o.dz).project(cam)
      return signedDistance(poly, [p.x, p.y])
    }))
  }

  it('focused (the camera pans to it), it still clears the tutor at the left spot', () => {
    const cam = camAt(-LESSON_CAMERA.focusShift)
    const b = box(cam, true)
    // His real outline at several heights, not one floor point under his
    // root: his side is widest at mid height, level with the window's
    // bottom-right corner (the resize grip). 0.004 NDC is about 2.3 px at
    // 1456 x 785 (stage frame 1170 px wide).
    const d = clearance(SPOTS.left.x, cam)
    assert.ok(d >= 0.004, `the tutor's outline is ${d} NDC clear of the window`)
    assert.ok(b.x0 >= -0.98 && b.y1 < HUD && b.y0 > CAPTION, JSON.stringify(b))
  })

  it('the outline check catches the overlap the browser saw from the old left spot (x -0.8)', () => {
    const cam = camAt(-LESSON_CAMERA.focusShift)
    assert.ok(clearance(-0.8, cam) < 0, 'x -0.8 overlaps the corner (3.8-4 px deep in the real render)')
    // The old model (one floor point 0.64 left of his root) called x -0.8 clear.
    const floorPoint = new Vector3(-0.8 - 0.64, 0, SPOTS.left.z).project(cam).x
    assert.ok(box(cam, true).x1 <= floorPoint + 0.005)
  })


  it('is bigger than either of the old two windows (2.6 x 2.35)', () => {
    assert.ok(W.width * W.height > 2.6 * 2.35 * 1.2)
  })
})

describe('maximized placement', () => {
  const M = WINDOW_UI.maximize
  const mp = maximizedPlace()
  const cam = new PerspectiveCamera(LESSON_CAMERA.fov, LESSON_CAMERA.aspect, 0.1, 100)
  cam.position.set(...LESSON_CAMERA.position)
  cam.lookAt(...LESSON_CAMERA.lookAt)
  cam.updateMatrixWorld()
  cam.updateProjectionMatrix()

  it('is centred, in front of the tutor, wider than a default window and as tall', () => {
    assert.ok(Math.abs(mp.x) < 1e-6)
    assert.equal(mp.z, M.z)
    assert.equal(mp.h, M.height)
    assert.equal(M.height, W.height, 'as tall as a default window, so pages render at 1:1 when maximized')
    // Wider than a default window in its own units (pages reflow into more room);
    // its world scale is about 1 (it is bigger on screen because it flies at z 2.3).
    assert.ok(mp.w > W.width, `w ${mp.w}`)
    assert.ok(mp.scale > 0.9 && mp.scale < 1.1, `scale ${mp.scale}`)
  })

  it('fills its NDC box without spilling out of it', () => {
    const p = new Vector3()
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      p.set(mp.x + (sx * mp.w * mp.scale) / 2, mp.y + (sy * mp.h * mp.scale) / 2, mp.z).project(cam)
      x0 = Math.min(x0, p.x)
      x1 = Math.max(x1, p.x)
      y0 = Math.min(y0, p.y)
      y1 = Math.max(y1, p.y)
    }
    const [bx0, by0, bx1, by1] = M.box
    const tol = 0.02
    assert.ok(x0 >= bx0 - tol && x1 <= bx1 + tol && y0 >= by0 - tol && y1 <= by1 + tol, JSON.stringify({ x0, x1, y0, y1 }))
    assert.ok(y1 - y0 > (by1 - by0) * 0.95, 'as tall as the box')
    assert.ok(x1 - x0 > (bx1 - bx0) * 0.9, 'about as wide as the box')
  })
})
