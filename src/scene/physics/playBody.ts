import type { RapierRigidBody } from '@react-three/rapier'
import { create } from 'zustand'

// Where the tutor's physics body is and what it is doing, for the camera,
// the anchors and the HUD. `position` (his body centre, world units) is
// mutated in place every frame and never replaced: read it with
// usePlayBody.getState().position inside useFrame, do not subscribe to it.
// `state` and `hoops` change only on transitions, so subscribing to them is cheap.

export type PlayBodyState = 'idle' | 'held' | 'flying' | 'recovering'

interface PlayBodyStore {
  position: [number, number, number]
  state: PlayBodyState
  hoops: number // balls scored through the hoop this visit
  setState: (state: PlayBodyState) => void
  scoreHoop: () => void
}

export const usePlayBody = create<PlayBodyStore>((set) => ({
  position: [0, 0, 0],
  state: 'idle',
  hoops: 0,
  setState: (state) => set((s) => (s.state === state ? s : { state })),
  scoreHoop: () => set((s) => ({ hoops: s.hoops + 1 })),
}))

// Keyboard / HUD alternative to dragging: PhysicsTutor and the toys register
// their handlers here while mounted. Each returns false when it cannot act
// (study mode, already in the air, not mounted).
export const playHandlers = {
  toss: null as (() => boolean) | null,
  shoot: null as (() => boolean) | null,
  ball: null as BallHandle | null,
}

// The ball, for the Play tab's ball moves (src/scene/hoops/BallProp.tsx): they
// take its body over (kinematic) and hide its mesh while they draw the ball in
// his hands, then hand it back mid-flight, so only one ball ever shows.
export interface BallHandle {
  body: () => RapierRigidBody | null
  busy: () => boolean // a pointer holds it
  show: (shown: boolean) => void
}

// Toss the tutor into the air (play / celebrate mode only).
export function tossTutor(): boolean {
  return playHandlers.toss?.() ?? false
}

// Shoot the ball at the hoop on an arc that drops through the rim.
export function shootBall(): boolean {
  return playHandlers.shoot?.() ?? false
}
