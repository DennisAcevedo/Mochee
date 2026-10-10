// Values the intro timeline tweens and the character tick reads every frame.
// One character, one intro, so this is a module singleton like the controller.
// When `active` is false the tick ignores all of it and behaves exactly as Stage 1.

export interface IntroState {
  active: boolean
  snap: boolean // set to make the tick re-place the root and hands without springing
  travel: number // 0 = start-screen spot, 1 = teaching spot
  lift: number // extra height, used for the arc across
  roam: number // multiplies the roam amplitude while active
  spin: number // extra yaw
  twist: number // extra yaw for the wind-up
  hop: number
  squash: number // > 0 flattens, < 0 stretches; pivots on the body's base
  capPop: number
  eyePop: number
  sparkle: number
  out: { rise: number } // written by the tick, read by the camera rig
}

export const INTRO_REST = {
  active: true,
  travel: 0,
  lift: 0,
  roam: 0,
  spin: 0,
  twist: 0,
  hop: 0,
  squash: 0,
  capPop: 0,
  eyePop: 0,
  sparkle: 0,
}

export const intro: IntroState = { ...INTRO_REST, snap: false, out: { rise: 0 } }

// The Blender tutor's entrance into the room (read by BlenderTutor): how far
// above his spot he is, and a landing squash pivoting on his feet. Both rest
// at 0, which leaves his normal placement untouched.
export const entrance = { dropY: 0, squash: 0 }
