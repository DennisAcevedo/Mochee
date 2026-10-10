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
}

// Toss the tutor into the air (play / celebrate mode only).
export function tossTutor(): boolean {
  return playHandlers.toss?.() ?? false
}

// Shoot the ball at the hoop on an arc that drops through the rim.
export function shootBall(): boolean {
  return playHandlers.shoot?.() ?? false
}
