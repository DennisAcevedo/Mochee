import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three'
import { PHYSICS, ROOM_BOX } from './config'

// Pointer pick-up for anything you can hold: a press on the object starts
// it, holding past PHYSICS.grab.holdMs or moving past movePx picks it up,
// and from then on it follows the pointer on a camera-facing plane through
// its centre with a critically damped spring. Release reports the pointer's
// recent velocity for the fling; a press that never became a hold is a tap.
// Works for mouse, pen and touch (pointer events on window, so a drag that
// leaves the canvas keeps going). The owner calls update() once per frame;
// nothing here allocates after construction.

export type GrabEvent = 'none' | 'tap' | 'pick' | 'held' | 'release'

// An optional pull toward a point (the ball over the hoop's rim): when the pointer's ray passes
// within `outer` of it, the target slides from the drag plane toward the ray's closest point to
// it, all the way within `inner`, so a held thing can reach that depth (the drag plane stays
// at the depth it was picked up from). Both points lie on the pointer's ray, so on screen the
// held thing stays under the pointer while its depth changes; the spring stiffens toward `rate`
// as the pull engages, so it gets there in a blink rather than lagging metres behind. A release
// while engaged lets go from the pulled target (not the lagging spring) and keeps only `keep` of
// the throw: over the hoop, letting go is a drop. The fling velocity never counts the pull's own
// depth jump (it is measured on the drag plane).
export interface GrabMagnet {
  point: Vector3
  inner: number
  outer: number
  rate: number // spring rate (1/s) once fully engaged
  keep: number // share of the release velocity kept once fully engaged
}

const G = PHYSICS.grab

interface CanvasRect {
  left: number
  top: number
  width: number
  height: number
}

export class Grabber {
  phase: 'none' | 'pressing' | 'held' = 'none'
  readonly pos = new Vector3() // spring position (world): where the held thing's centre is
  readonly vel = new Vector3() // spring velocity
  readonly target = new Vector3() // pointer point on the drag plane, lifted and clamped
  readonly releaseVel = new Vector3() // pointer velocity at release (world units / s)
  magnet: GrabMagnet | null = null
  engaged = 0 // how far the magnet's pull is engaged this frame (0..1)

  private readonly free = new Vector3() // the target without the magnet's pull: what the fling velocity is measured on
  private readonly plane = new Plane()
  private readonly near = new Vector3()
  private readonly ray = new Raycaster()
  private readonly ndc = new Vector2()
  private readonly hit = new Vector3()
  private readonly normal = new Vector3()
  private readonly min = new Vector3()
  private readonly max = new Vector3()
  private readonly samples: Float64Array // [t, x, y, z] ring
  private sampleHead = 0
  private sampleCount = 0
  private pointerId = -1
  private dom: HTMLElement | null = null
  private startX = 0
  private startY = 0
  private startT = 0
  private x = 0
  private y = 0
  private moved = 0
  private upPending = false

  constructor(radius: number) {
    // Keep the held object's whole body inside the room.
    this.min.set(-ROOM_BOX.halfW + radius, ROOM_BOX.floorY + radius, ROOM_BOX.backZ + radius)
    this.max.set(ROOM_BOX.halfW - radius, ROOM_BOX.ceilY - radius, ROOM_BOX.frontZ - radius)
    this.samples = new Float64Array(G.samples * 4)
  }

  get active() {
    return this.phase !== 'none'
  }

  // Pointer down on the object. `dom` is the canvas (pointer capture + touch-action).
  press(clientX: number, clientY: number, pointerId: number, dom: HTMLElement) {
    if (this.phase !== 'none') return
    this.phase = 'pressing'
    this.pointerId = pointerId
    this.dom = dom
    this.startX = this.x = clientX
    this.startY = this.y = clientY
    this.startT = performance.now()
    this.moved = 0
    this.upPending = false
    try {
      dom.setPointerCapture(pointerId)
    } catch {
      // Capture is a nicety; window listeners still see the drag.
    }
    window.addEventListener('pointermove', this.onMove, { passive: false })
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
  }

  // Drop whatever is held without a fling (mode switch, unmount).
  cancel() {
    this.detach()
    this.phase = 'none'
    this.engaged = 0
    this.releaseVel.set(0, 0, 0)
  }

  // Start holding right away at `center` (programmatic pick-ups and catches mid-flight).
  private pick(center: Vector3, camera: Camera) {
    this.phase = 'held'
    camera.getWorldDirection(this.normal)
    this.plane.setFromNormalAndCoplanarPoint(this.normal, center)
    this.pos.copy(center)
    this.vel.set(0, 0, 0)
    this.target.copy(center)
    this.free.copy(center)
    this.engaged = 0
    this.sampleCount = 0
  }

  // One frame. `center` is the object's current centre; `canPick` gates the
  // pick-up (study mode only taps). Returns what happened this frame.
  update(dt: number, camera: Camera, rect: CanvasRect, center: Vector3, canPick: boolean): GrabEvent {
    if (this.phase === 'none') return 'none'
    const now = performance.now()

    if (this.phase === 'pressing') {
      if (this.upPending) {
        const tap = this.moved < G.movePx
        this.cancel()
        return tap ? 'tap' : 'none'
      }
      if (canPick && (now - this.startT > G.holdMs || this.moved > G.movePx)) {
        this.pick(center, camera)
        this.pointTarget(camera, rect)
        this.pushSample(now)
        return 'pick'
      }
      return 'none'
    }

    // Held: chase the pointer (stiffer as a magnet's pull engages).
    this.pointTarget(camera, rect)
    this.pushSample(now)
    const m = this.magnet
    const w = m ? this.engaged : 0
    const k = m ? G.springRate + (Math.max(m.rate, G.springRate) - G.springRate) * w : G.springRate
    const decay = Math.exp(-k * dt)
    springAxis(this, 'x', k, dt, decay)
    springAxis(this, 'y', k, dt, decay)
    springAxis(this, 'z', k, dt, decay)
    if (!this.upPending) return 'held'
    this.measureVelocity(now)
    if (m && w > 0) {
      // Let go over the magnet: from where the pull puts it, mostly dropped rather than flung.
      this.pos.lerp(this.target, w)
      this.releaseVel.multiplyScalar(1 - w * (1 - m.keep))
    }
    this.detach()
    this.phase = 'none'
    this.engaged = 0
    return 'release'
  }

  // Pointer -> ray -> drag plane, lifted, clamped to the room.
  private pointTarget(camera: Camera, rect: CanvasRect) {
    if (!rect.width || !rect.height) return
    this.ndc.set(((this.x - rect.left) / rect.width) * 2 - 1, -((this.y - rect.top) / rect.height) * 2 + 1)
    this.ray.setFromCamera(this.ndc, camera)
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return
    this.free.copy(this.hit)
    this.free.y += G.lift
    this.free.clamp(this.min, this.max)
    this.pull()
    this.hit.y += G.lift
    this.target.copy(this.hit).clamp(this.min, this.max)
  }

  // The magnet: blend the plane point toward the ray's closest point to it (smoothstep in the miss distance).
  private pull() {
    this.engaged = 0
    const m = this.magnet
    if (!m || !(m.outer > m.inner)) return
    const r = this.ray.ray
    r.closestPointToPoint(m.point, this.near)
    const miss = this.near.distanceTo(m.point)
    if (miss >= m.outer) return
    const u = Math.min(1, (m.outer - miss) / (m.outer - m.inner))
    this.engaged = u * u * (3 - 2 * u)
    this.hit.lerp(this.near, this.engaged)
  }

  // The fling velocity's samples: the drag-plane point (the magnet's pull is not the student's throw).
  private pushSample(now: number) {
    const i = this.sampleHead * 4
    this.samples[i] = now
    this.samples[i + 1] = this.free.x
    this.samples[i + 2] = this.free.y
    this.samples[i + 3] = this.free.z
    this.sampleHead = (this.sampleHead + 1) % G.samples
    this.sampleCount = Math.min(this.sampleCount + 1, G.samples)
  }

  // Velocity of the pointer target over the last velocityWindowMs.
  private measureVelocity(now: number) {
    this.releaseVel.set(0, 0, 0)
    const n = this.sampleCount
    if (n < 2) return
    const newest = ((this.sampleHead - 1 + G.samples) % G.samples) * 4
    let oldest = newest
    for (let back = 1; back < n; back++) {
      const j = ((this.sampleHead - 1 - back + G.samples * 2) % G.samples) * 4
      if (now - this.samples[j] > G.velocityWindowMs) break
      oldest = j
    }
    const span = (this.samples[newest] - this.samples[oldest]) / 1000
    if (span < 1e-3) return
    this.releaseVel.set(
      (this.samples[newest + 1] - this.samples[oldest + 1]) / span,
      (this.samples[newest + 2] - this.samples[oldest + 2]) / span,
      (this.samples[newest + 3] - this.samples[oldest + 3]) / span,
    )
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return
    this.x = e.clientX
    this.y = e.clientY
    this.moved = Math.max(this.moved, Math.hypot(this.x - this.startX, this.y - this.startY))
    if (this.phase === 'held' && e.cancelable) e.preventDefault() // no page scroll or text selection while dragging
  }

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return
    this.x = e.clientX
    this.y = e.clientY
    this.upPending = true
  }

  private detach() {
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    if (this.dom && this.pointerId >= 0) {
      try {
        if (this.dom.hasPointerCapture(this.pointerId)) this.dom.releasePointerCapture(this.pointerId)
      } catch {
        // Already released.
      }
    }
    this.dom = null
    this.pointerId = -1
    this.upPending = false
  }
}

// Exact critically damped spring step on one axis (stable at any dt).
function springAxis(g: Grabber, axis: 'x' | 'y' | 'z', k: number, dt: number, decay: number) {
  const x0 = g.pos[axis] - g.target[axis]
  const j = g.vel[axis] + k * x0
  g.pos[axis] = g.target[axis] + (x0 + j * dt) * decay
  g.vel[axis] = (g.vel[axis] - k * j * dt) * decay
}

// Scratch helpers shared by the tutor and the toys.
export function clampLength(v: Vector3, max: number): Vector3 {
  const l = v.length()
  if (l > max) v.multiplyScalar(max / l)
  return v
}

// Tumble from a fling: spin about (up x velocity), so he rolls the way he flies.
const UP = new Vector3(0, 1, 0)
export function spinFromVelocity(vel: Vector3, perSpeed: number, max: number, out: Vector3): Vector3 {
  return clampLength(out.crossVectors(UP, vel).multiplyScalar(perSpeed), max)
}
