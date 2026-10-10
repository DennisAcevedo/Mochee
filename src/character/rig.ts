import type { RefObject } from 'react'
import { Vector3, type Group, type Mesh } from 'three'
import { TICK, type Pose } from '../animation/config'

// Object3D handles for each independently animated part.
export interface RigRefs {
  root: RefObject<Group | null> // moves, turns, scales (tutor-3d's `root`)
  body: RefObject<Group | null> // squash and stretch
  eyeL: RefObject<Mesh | null>
  eyeR: RefObject<Mesh | null>
  happyL: RefObject<Mesh | null>
  happyR: RefObject<Mesh | null>
  sleepL: RefObject<Mesh | null> // closed ∪ eyes for the sleep pose
  sleepR: RefObject<Mesh | null>
  sparkL: RefObject<Mesh | null> // wake-up twinkles beside the eyes
  sparkR: RefObject<Mesh | null>
  book: RefObject<Group | null> // read pose
  mic: RefObject<Group | null> // held accessory, hidden while reading
  brows: RefObject<Group | null>
  browL: RefObject<Mesh | null>
  browR: RefObject<Mesh | null>
  smile: RefObject<Mesh | null>
  mouth: RefObject<Group | null> // the open-mouth group
  cap: RefObject<Group | null>
  tassel: RefObject<Group | null>
  hand_L: RefObject<Group | null> // world space, spring-driven
  hand_R: RefObject<Group | null>
  shadow: RefObject<Mesh | null>
}

export interface HandSim {
  vel: Vector3
  init: boolean
}

// Everything the tick reads and writes between frames. Mirrors tutor-3d's
// `this.p`, `this.state`, `this.look`, `this.tasselSwing` and hand userData.
export interface RigState {
  pose: Pose
  speaking: boolean
  happyOverride: boolean
  spinT: number | null
  look: { x: number; y: number; tx: number; ty: number }
  sim: {
    t: number
    blink: number
    blinkT: number
    speak: number
    brow: number
    yawPose: number
    inited: boolean
    s: number
    ex: [number, number, number]
    bl: number
    br: number
    calm: number // damped 0..1: cursor-follow is off while asleep or reading
    spinSpeed: number // intro spin speed, 0..1 of the peak
    prevSpin: number
  }
  vel: Vector3
  prev: Vector3
  tassel: { a: number; v: number; b: number; w: number }
  hands: [HandSim, HandSim]
}

export function createRigState(): RigState {
  return {
    pose: 'explain',
    speaking: false,
    happyOverride: false,
    spinT: null,
    look: { x: 0, y: 0, tx: 0, ty: 0 },
    sim: {
      t: Math.random() * TICK.randomStart,
      blink: 2.5,
      blinkT: -1,
      speak: 0,
      brow: 0,
      yawPose: 0,
      inited: false,
      s: 1,
      ex: [0, 0, 0],
      bl: 0,
      br: 0,
      calm: 0,
      spinSpeed: 0,
      prevSpin: 0,
    },
    vel: new Vector3(),
    prev: new Vector3(),
    tassel: { a: 0, v: 0, b: 0, w: 0 },
    hands: [
      { vel: new Vector3(), init: false },
      { vel: new Vector3(), init: false },
    ],
  }
}
