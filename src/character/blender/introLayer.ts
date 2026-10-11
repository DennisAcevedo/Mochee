import { INTRO, SPIN_PEAK_SPEED } from '../../animation/config'
import type { IntroState } from '../../animation/introState'
import { INTRO_LAYER } from './config'

// The start spin on the Blender tutor: turns the intro timeline's values
// (introState.ts, tweened by src/intro/intro.ts) into what BlenderTutor layers
// on top of the mixer. Spin speed drives the stretch, the rise and the
// flung-out hands, the same way the classic tick does (useTick.ts).

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))

export class IntroLayer {
  // Outputs, read by BlenderTutor after update().
  yaw = 0 // extra yaw on his placement (spin + wind-up twist), radians
  y = 0 // lift off the floor (rise + hop + the hop across the pull), world units
  k = 0 // > 0 stretches (taller, thinner), < 0 squashes; pivots on his feet
  handOut = 0 // 0..1, how far the hands are flung out
  lag = 0 // radians the hands trail the spin
  capPop = 0 // cap lift, model units

  private prevSpin = 0
  private speed = 0
  private primed = false

  update(dt: number, I: IntroState): this {
    if (I.snap || !this.primed) {
      this.prevSpin = I.spin
      this.speed = 0
      this.primed = true
      I.snap = false
    }
    // A jump bigger than the guard is the timeline unwinding the spin, not motion.
    let dSpin = I.spin - this.prevSpin
    this.prevSpin = I.spin
    if (Math.abs(dSpin) > INTRO.spin.wrapGuard) dSpin = 0
    const S = INTRO.spin
    this.speed = damp(this.speed, clamp(Math.abs(dSpin) / Math.max(dt, 1e-4) / SPIN_PEAK_SPEED, 0, 1), S.speedSmoothing, dt)
    const sp = this.speed
    const rise = INTRO_LAYER.rise * sp
    I.out.rise = rise // the camera rig follows it

    if (!I.active) return this.rest()
    this.handOut = sp > 1e-3 ? Math.pow(sp, S.handSnapPower) : 0
    this.lag = S.handLag * this.handOut
    this.yaw = I.spin + I.twist
    this.y = rise + I.hop * INTRO_LAYER.hopScale + I.lift * INTRO_LAYER.liftScale
    this.k = clamp(INTRO_LAYER.stretch * sp * sp - I.squash, -INTRO_LAYER.maxSquash, INTRO_LAYER.maxSquash)
    this.capPop = I.capPop * INTRO_LAYER.capScale
    return this
  }

  rest(): this {
    this.yaw = 0
    this.y = 0
    this.k = 0
    this.handOut = 0
    this.lag = 0
    this.capPop = 0
    return this
  }
}
