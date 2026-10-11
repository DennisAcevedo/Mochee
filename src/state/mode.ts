import { create } from 'zustand'

// Stage mode, switched by the pill in the header.
// study:     the tutor walks the lesson; camera soft-locked; physics toys parked.
// play:      drag, throw and bounce him; toys (ball + hoop, blocks) are live.

export type StageMode = 'study' | 'play'

interface ModeState {
  mode: StageMode
  setMode: (mode: StageMode) => void
}

export const useMode = create<ModeState>((set) => ({
  mode: 'study',
  setMode: (mode) => set({ mode }),
}))
