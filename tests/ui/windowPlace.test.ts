import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PerspectiveCamera, Vector3 } from 'three'
import { FLOOR_Y, LESSON_CAMERA, POINTING, ROOM, SPOTS, TUTOR_OUTLINES, WINDOW, WINDOW_TIGHT_POSES, WINDOWS } from '../../src/scene/layout3d.ts'
import { pointReadyAt } from '../../src/scene/windows/pointReady.ts'
import { WINDOW_UI } from '../../src/scene/windows/windowConfig.ts'
import { clampOffset, defaultSize, focusYawAt, maximizedPlace, RING_PAD, ringLeftX, yawAt } from '../../src/scene/windows/windowPlace.ts'

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
    assert.equal(focusYawAt(W.position[0]), WINDOWS.focusYaw)
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
  const LIFT = WINDOW_UI.focus.lift
  // The window's NDC box: at rest, or focused (turned to focusYaw, scaled, lifted toward the camera).
  const box = (cam: PerspectiveCamera, focused: boolean) => {
    const yaw = focused ? WINDOWS.focusYaw : W.yaw
    const s = focused ? WINDOWS.focusScale : 1
    const [px, py, pz] = W.position
    const z = pz + (focused ? LIFT : 0)
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

  // The drawn window's outline: by default the focus ring (the outermost
  // thing drawn, RING_PAD past the frame, whose corner radius is
  // WINDOW_UI.window.radius) with its rounded corners sampled; with pad 0 and
  // a depth offset along its normal, one face of the frame (the ring is
  // invisible while the window is not focused). Convex, in order around the
  // window. `wf` is how far the focus pose has eased in (1 = focused, 0 =
  // resting); `ox` / `w` a moved or resized window. `lay` defaults to today's
  // layout; the regression tests pass the old one.
  type Lay = { position: readonly [number, number, number]; width: number; height: number; focusScale: number; focusYaw: number }
  const NOW: Lay = { position: W.position, width: W.width, height: W.height, focusScale: WINDOWS.focusScale, focusYaw: WINDOWS.focusYaw }
  // The layout before the wall / pointing-hand fix (window x -3.15, 3.0 wide, zoomed 1.06 when focused).
  const OLD: Lay = { position: [-3.15, 0.33, -0.45], width: 3.0, height: 2.5, focusScale: 1.06, focusYaw: 0.14 }
  type Opts = { wf?: number; ox?: number; w?: number; pad?: number; zoff?: number }
  const ringWorld = (lay: Lay = NOW, { wf = 1, ox = 0, w = lay.width, pad = RING_PAD, zoff = 0 }: Opts = {}): Vector3[] => {
    const [px, py, pz] = lay.position
    const x = px + ox
    const rest = lay === NOW ? yawAt(x) : W.yaw
    const yaw = rest + (rest * (lay.focusYaw / Math.abs(W.yaw)) - rest) * wf
    const s = 1 + (lay.focusScale - 1) * wf
    const hw = w / 2 + pad
    const hh = lay.height / 2 + pad
    const r = WINDOW_UI.window.radius + pad
    const z = pz + LIFT * wf
    const pts: Vector3[] = []
    for (let k = 0; k < 96; k++) {
      const a = ((k + 0.5) / 96) * Math.PI * 2
      const lx = s * (Math.sign(Math.cos(a)) * (hw - r) + r * Math.cos(a))
      const ly = s * (Math.sign(Math.sin(a)) * (hh - r) + r * Math.sin(a))
      pts.push(new Vector3(x + lx * Math.cos(yaw) + zoff * Math.sin(yaw), py + ly, z - lx * Math.sin(yaw) + zoff * Math.cos(yaw)))
    }
    return pts
  }
  // Both faces of the frame (no ring), for the window when it is not focused.
  const frameFaces = (lay: Lay = NOW, wf = 0) => [1, -1].map((side) => ringWorld(lay, { wf, pad: 0, zoff: (side * WINDOW_UI.window.depth) / 2 }))
  const project = (pts: Vector3[], cam: PerspectiveCamera): [number, number][] =>
    pts.map((v) => {
      const p = v.clone().project(cam)
      return [p.x, p.y]
    })
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

  // How far (NDC) a pose's left outline, his root at x, stays outside the
  // window's outlines (the focused ring unless given); < 0 = overlap. 0.001
  // NDC is about 0.58 px at 1456 x 785 (stage frame 1170 px wide).
  type Pose = keyof typeof TUTOR_OUTLINES
  const clearance = (x: number, cam: PerspectiveCamera, pose: Pose, lay: Lay = NOW, shapes: Vector3[][] = [ringWorld(lay)]) =>
    Math.min(...shapes.map((shape) => {
      const poly = project(shape, cam)
      return Math.min(...TUTOR_OUTLINES[pose].map((o) => {
        const p = new Vector3(x + o.dx, FLOOR_Y + o.up, SPOTS.left.z + o.dz).project(cam)
        return signedDistance(poly, [p.x, p.y])
      }))
    }))
  const focusedCam = () => camAt(-LESSON_CAMERA.focusShift)

  it('focused (the camera pans to it), it stays on screen between the play HUD and the caption', () => {
    const b = box(focusedCam(), true)
    assert.ok(b.x0 >= -0.98 && b.y1 < HUD && b.y0 > CAPTION, JSON.stringify(b))
  })

  // He teaches from the left spot with the point_left loop; between lines he
  // idles or talks; the hop, levelup and celebrate one-shots, the dances and
  // the wrong-answer shrugs play there too. Each measured outline must stay
  // outside the focused window's ring: 0.02 NDC, point_left (the hand reaches
  // about 1.2 left of his root) 0.004. WINDOW_TIGHT_POSES are the known
  // exceptions: checked against their own floor, and the list must match.
  const tight = WINDOW_TIGHT_POSES.poses as readonly string[]
  const MIN = (pose: Pose) => (pose === 'point_left' ? 0.004 : 0.02)
  for (const pose of Object.keys(TUTOR_OUTLINES) as Pose[]) {
    const floor = tight.includes(pose) ? -0.002 : MIN(pose)
    it(`focused, his ${pose} outline at the left spot clears the window (>= ${floor} NDC)`, () => {
      const d = clearance(SPOTS.left.x, focusedCam(), pose)
      assert.ok(d >= floor, `${pose} is ${d.toFixed(4)} NDC clear of the window`)
    })
  }

  it('WINDOW_TIGHT_POSES lists exactly the outlines under the margin, and they clear `near` to the right', () => {
    const cam = focusedCam()
    const under = (Object.keys(TUTOR_OUTLINES) as Pose[]).filter((p) => clearance(SPOTS.left.x, cam, p) < MIN(p))
    assert.deepEqual(under.sort(), [...tight].sort())
    for (const p of tight as Pose[]) {
      const d = clearance(SPOTS.left.x + WINDOW_TIGHT_POSES.near, cam, p)
      assert.ok(d >= 0.02, `${p} ${d.toFixed(4)} NDC clear from the left spot + near`)
      // ... and with the window unfocused, the camera centred (the frame only).
      const rest = clearance(SPOTS.left.x + WINDOW_TIGHT_POSES.near, camAt(0), p, NOW, frameFaces())
      assert.ok(rest >= 0.01, `${p} ${rest.toFixed(4)} NDC clear of the resting frame from the left spot + near`)
    }
  })

  // Pointing waits for the camera to settle on the focused window
  // (pointGate.ts, pointReadyAt): mid-pan the window sits further right on
  // screen and his hand reaches into it. The window's own focus pose eases at
  // 7/s against the camera's 3/s, so by the time the camera is in the gate's
  // band it has finished turning (wf 1; 0.99 checked too).
  const panFor = (f: number) => -LESSON_CAMERA.focusShift * f
  it('mid-pan his point_left hand reaches into the window: the gate holds him until the pan settles', () => {
    const half = panFor(0.5)
    assert.ok(clearance(SPOTS.left.x, camAt(half), 'point_left') < 0)
    assert.equal(pointReadyAt(LESSON_CAMERA.position[0] + half, 'notes', null), false)
  })

  it('once the gate lets him point, the hand clears the window for the rest of the pan', () => {
    const from = 1 - (POINTING.panTolerance - 1e-9) / LESSON_CAMERA.focusShift // the band's far edge
    for (let f = from; f <= 1.0001; f += (1 - from) / 8) {
      const camX = LESSON_CAMERA.position[0] + panFor(Math.min(f, 1))
      assert.ok(pointReadyAt(camX, 'notes', null), `gate at pan ${f.toFixed(3)}`)
      for (const wf of [0.99, 1]) {
        const d = clearance(SPOTS.left.x, camAt(panFor(Math.min(f, 1))), 'point_left', NOW, [ringWorld(NOW, { wf })])
        assert.ok(d >= 0.004, `pan ${f.toFixed(3)} wf ${wf}: ${d.toFixed(4)} NDC`)
      }
    }
    assert.equal(pointReadyAt(LESSON_CAMERA.position[0] + panFor(from) + 0.01, 'notes', null), false, 'outside the band')
  })

  it('unfocused, with the camera centred, he does not point: talk and idle clear the resting frame', () => {
    const cam = camAt(0)
    // Pointing there would cover the frame's corner ...
    assert.ok(clearance(SPOTS.left.x, cam, 'point_left', NOW, frameFaces()) < 0)
    // ... so with no window focused the gate never lets him point (he talks instead) ...
    assert.equal(pointReadyAt(LESSON_CAMERA.position[0], 'none', null), false)
    // ... and talk and idle keep 0.02 NDC off it.
    for (const pose of ['talk', 'idle'] as const) {
      const d = clearance(SPOTS.left.x, cam, pose, NOW, frameFaces())
      assert.ok(d >= 0.02, `${pose} ${d.toFixed(4)} NDC clear of the resting frame`)
    }
  })

  it('the outline check catches the overlaps the browser saw under the old layout', () => {
    const cam = focusedCam()
    // From the old spot x -0.74 the point_left hand covered the window's
    // bottom-right corner by 24 px and hop by 41 px (round-3 probes) ...
    assert.ok(clearance(-0.74, cam, 'point_left', OLD) < -0.03)
    assert.ok(clearance(-0.74, cam, 'hop', OLD) < -0.05)
    // ... and from x -0.8 his idle side sat 4 px inside it (round 1).
    assert.ok(clearance(-0.8, cam, 'idle', OLD) < 0)
    // Today's window still catches a hand one step left of the spot.
    assert.ok(clearance(SPOTS.left.x - 0.1, cam, 'point_left') < 0)
  })

  // The side walls are at x = +-ROOM.width / 2 (+-4.70).
  const ringMinX = (opts: Opts = {}) => Math.min(...ringWorld(NOW, opts).map((v) => v.x))

  it('focused at rest, its ring stays inside the room', () => {
    assert.ok(ringMinX() >= -ROOM.width / 2 + 0.03, `ring min x ${ringMinX()}`)
    assert.ok(Math.abs(ringMinX() - ringLeftX(W.position[0], W.width)) < 1e-3, 'ringLeftX matches the drawn ring')
    // The old layout crossed the wall (the regression this guards).
    assert.ok(Math.min(...ringWorld(OLD).map((v) => v.x)) < -ROOM.width / 2)
  })

  // The resting frame's outer edge, world x, for a window w wide at offset ox.
  const outerEdge = (ox: number, w: number) => {
    const x = W.position[0] + ox
    return x + Math.sign(x) * (w / 2) * Math.cos(yawAt(x))
  }

  it('dragged against either side wall, it rests inside it, the left side mirroring the right (default and widest)', () => {
    const wall = ROOM.width / 2 - WINDOW_UI.window.wallGap
    for (const w of [W.width, WINDOW_UI.window.maxSize[0]]) {
      for (const oy of [0, 0.5]) {
        const [lx] = clamp(-20, oy, w, W.height)
        const [rx] = clamp(20, oy, w, W.height)
        const left = outerEdge(lx, w)
        const right = outerEdge(rx, w)
        assert.ok(left >= -wall - 1e-6 && right <= wall + 1e-6, `w ${w}, oy ${oy}: edges ${left} .. ${right} inside +-${wall}`)
        assert.ok(Math.abs(left + right) < 1e-3, `w ${w}, oy ${oy}: left ${left} mirrors right ${right}`)
      }
    }
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
