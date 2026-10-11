import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { FLOOR_Y, LESSON_CAMERA, ROOM } from '../../src/scene/layout3d.ts'
import { shopCameraPose, WALL_SHOP } from '../../src/scene/shop/shopCamera.ts'
import { useShop } from '../../src/state/shop.ts'

describe('wooden shop camera journey', () => {
  for (const shift of [-0.9, 0, 0.9]) {
    const start = { px: shift, py: LESSON_CAMERA.position[1], pz: LESSON_CAMERA.position[2], tx: shift, ty: LESSON_CAMERA.lookAt[1], tz: 0 }
    it(`sweeps left and forward from a lesson pan of ${shift}, ending face-on to the left wall`, () => {
      assert.deepEqual(shopCameraPose(start, 0), start)
      const end = shopCameraPose(start, 1)
      for (const key of Object.keys(end) as (keyof typeof end)[]) assert.ok(Math.abs(end[key] - WALL_SHOP.camera[key]) < 1e-10)
      const middle = shopCameraPose(start, 0.5)
      assert.ok(middle.px < (start.px + WALL_SHOP.camera.px) / 2 - 0.5, 'the path must arc left instead of sliding in a straight line')
      let previousZ = start.pz
      for (let n = 1; n <= 100; n++) {
        const pose = shopCameraPose(start, n / 100)
        assert.ok(pose.px > -ROOM.width / 2 + 0.8 && pose.px < ROOM.width / 2)
        assert.ok(pose.py > FLOOR_Y && pose.py < FLOOR_Y + ROOM.height)
        assert.ok(pose.pz <= previousZ, 'the camera should keep moving forward')
        previousZ = pose.pz
      }
      assert.equal(WALL_SHOP.camera.pz, WALL_SHOP.camera.tz)
      assert.ok(WALL_SHOP.camera.tx < WALL_SHOP.camera.px)
    })
  }
})

describe('shop visit lifecycle', () => {
  beforeEach(() => useShop.getState().reset())

  it('waits for camera arrival, ignores duplicate clicks, and cannot reopen after cancellation', () => {
    useShop.getState().enter()
    useShop.getState().enter()
    assert.equal(useShop.getState().phase, 'approaching')
    useShop.getState().leave()
    useShop.getState().arrived()
    useShop.getState().enter()
    assert.equal(useShop.getState().phase, 'returning')
    useShop.getState().returned()
    assert.equal(useShop.getState().phase, 'closed')
  })

  it('runs a selected animation exactly once, after the camera has returned', () => {
    let runs = 0
    useShop.getState().enter()
    useShop.getState().arrived()
    assert.equal(useShop.getState().phase, 'open')
    useShop.getState().leave(() => { assert.equal(useShop.getState().phase, 'closed'); runs++ })
    useShop.getState().leave()
    assert.equal(runs, 0)
    useShop.getState().returned()
    useShop.getState().returned()
    assert.equal(runs, 1)
  })

  it('discards a pending action when the lesson unmounts', () => {
    useShop.getState().enter()
    useShop.getState().leave(() => assert.fail('an old lesson must not trigger an action'))
    useShop.getState().reset()
    useShop.getState().returned()
    assert.equal(useShop.getState().phase, 'closed')
  })
})
