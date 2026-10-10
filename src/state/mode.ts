import { create } from 'zustand'

// Stage mode, switched by the pill in the header.
// study:     the tutor walks the lesson; camera soft-locked; physics toys parked.
// play:      drag, throw and bounce him; toys (ball + hoop, blocks) are live.
// celebrate: after a topic is mastered: an optional free-play invitation with
//            no countdown; the student leaves it whenever they like.

export type StageMode = 'study' | 'play' | 'celebrate'

interface ModeState {
  mode: StageMode
  setMode: (mode: StageMode) => void
}

export const useMode = create<ModeState>((set) => ({
  mode: 'study',
  setMode: (mode) => set({ mode }),
}))
