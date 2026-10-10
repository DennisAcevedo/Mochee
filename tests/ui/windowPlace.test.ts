import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PerspectiveCamera, Vector3 } from 'three'
import { LESSON_CAMERA, WINDOWS } from '../../src/scene/layout3d.ts'
import { WINDOW_UI } from '../../src/scene/windows/windowConfig.ts'
import { clampOffset, maximizedPlace, yawAt } from '../../src/scene/windows/windowPlace.ts'

// Window placement: moves clamp to the stage box (no bounce back inward when
// dragged far past an edge) and the maximized window fills its box.

const W = WINDOWS.notes
const out: [number, number] = [0, 0]
const clamp = (ox: number, oy: number, w = W.width, h = W.height) => [...clampOffset('notes', ox, oy, w, h, out)]

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
    assert.equal(yawAt('notes', W.position[0]), W.yaw)
    assert.ok(Math.abs(yawAt('notes', W.position[0] / 2)) < Math.abs(W.yaw))
    assert.equal(yawAt('notes', W.position[0] * 3), W.yaw) // capped
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
    assert.ok(mp.w > W.width && mp.scale > 1)
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
