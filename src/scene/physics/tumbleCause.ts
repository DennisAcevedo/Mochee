import type { TumbleCause } from '../../state/tumbles.ts'
import { PHYSICS, ROOM_BOX } from './config.ts'

// Judges what knocked the tutor over from one pick-up / fling / landing, so
// the tumble layer can play the matching variant. Pure bookkeeping (no three,
// no React): PhysicsTutor feeds it plain numbers each frame.

const C = PHYSICS.tutor
const T = C.tumble

export interface TumbleVerdict {
  cause: TumbleCause
  dir: 1 | -1 // 1 = he falls to his right (world -x while he faces the camera)
}

// Travelling toward world -x is falling to his right.
const dirOfVx = (vx: number): 1 | -1 => (vx <= 0 ? 1 : -1)

export class TumbleJudge {
  private heldFor = 0
  private flips: number[] = [] // times of drag reversals
  private lastSign = 0
  private shaken = false
  private shakeDir: 1 | -1 = 1
  private releaseSpeed = 0
  private releaseDir: 1 | -1 = 1
  private flick = false
  private bonk: TumbleVerdict | null = null
  private peakFeet = -Infinity
  private clock = 0

  reset() {
    this.heldFor = 0
    this.flips.length = 0
    this.lastSign = 0
    this.shaken = false
    this.releaseSpeed = 0
    this.flick = false
    this.bonk = null
    this.peakFeet = -Infinity
  }

  // Picked up: a new episode.
  pick() {
    this.reset()
  }

  // Each held frame: the drag velocity (world u/s).
  held(dt: number, vx: number) {
    this.clock += dt
    this.heldFor += dt
    if (Math.abs(vx) < T.shakeMinSpeed) return
    const sign = Math.sign(vx)
    if (this.lastSign !== 0 && sign !== this.lastSign) this.flips.push(this.clock)
    this.lastSign = sign
    while (this.flips.length && this.clock - this.flips[0] > T.shakeWindow) this.flips.shift()
    if (this.flips.length >= T.shakeFlips) {
      this.shaken = true
      this.shakeDir = dirOfVx(vx)
    }
  }

  // Let go (heldFor = Infinity for a keyboard / HUD toss).
  release(vx: number, vy: number, vz: number, toss = false) {
    this.releaseSpeed = Math.hypot(vx, vy, vz)
    this.releaseDir = dirOfVx(vx)
    this.flick = !toss && this.heldFor < T.flickHeldSeconds && this.releaseSpeed >= T.flickSpeed
  }

  // Each flying frame: body centre and its velocity (world).
  flying(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    this.peakFeet = Math.max(this.peakFeet, y - C.centerY)
    if (this.bonk) return
    const speed = Math.hypot(vx, vy, vz)
    if (speed < T.bonkSpeed) return
    const r = C.radius + T.bonkMargin
    const top = y + C.halfHeight + C.radius + T.bonkMargin
    if (Math.abs(x) + r >= ROOM_BOX.halfW) this.bonk = { cause: 'bonk', dir: x > 0 ? -1 : 1 } // the wall is on that side of him: he reels the other way
    else if (z - r <= ROOM_BOX.backZ || z + r >= ROOM_BOX.frontZ || top >= ROOM_BOX.ceilY) this.bonk = { cause: 'bonk', dir: dirOfVx(vx) }
  }

  // Landed with his feet at feetY: the verdict, or null for a gentle set-down.
  land(feetY: number): TumbleVerdict | null {
    let v: TumbleVerdict | null = null
    if (this.shaken) v = { cause: 'shaken', dir: this.shakeDir }
    else if (this.bonk) v = this.bonk
    else if (this.flick) v = { cause: 'flicked', dir: this.releaseDir }
    else if (this.releaseSpeed >= T.thrownSpeed) v = { cause: 'thrown', dir: this.releaseDir }
    else if (this.peakFeet - feetY >= T.dropHeight) v = { cause: 'dropped', dir: this.releaseDir }
    this.reset()
    return v
  }
}
