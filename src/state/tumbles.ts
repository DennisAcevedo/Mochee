import { create } from 'zustand'
import type { LoopClip } from './director'

// What knocked Gemini Guy over. Each cause plays its own tumble variant.
export type TumbleCause = 'boss' | 'thrown' | 'dropped' | 'bonk' | 'shaken' | 'flicked'

export interface TumbleEvent {
  id: number // increments per knock, so the same cause twice still retriggers
  cause: TumbleCause
  dir: 1 | -1 // which way he falls: 1 = to his right
}

interface TumblesState {
  last: TumbleEvent | null
  knock: (cause: TumbleCause, dir?: 1 | -1) => void
  // While set, the tutor plays this loop instead of the director's. The lesson
  // keeps setting director.loop every step, which would cut a tumble short.
  hold: LoopClip | null
  setHold: (clip: LoopClip | null) => void
}

export const useTumbles = create<TumblesState>((set, get) => ({
  last: null,
  knock: (cause, dir = 1) => set({ last: { id: (get().last?.id ?? 0) + 1, cause, dir } }),
  hold: null,
  setHold: (hold) => set({ hold }),
}))
