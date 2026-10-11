import { create } from 'zustand'

// Lesson cards the learner has closed to cut the clutter. Temporary on
// purpose: kept in memory only, so a reload brings everything back. Each
// closed card leaves a small chip in its place that reopens it.

export type PanelId = 'caption' | 'walkthrough' | 'transcript'

interface HiddenState {
  hidden: Partial<Record<PanelId, true>>
  hide: (id: PanelId) => void
  show: (id: PanelId) => void
}

// The transcript starts closed (its chip in the corner reopens it).
export const useHidden = create<HiddenState>((set) => ({
  hidden: { transcript: true },
  hide: (id) => set((s) => ({ hidden: { ...s.hidden, [id]: true } })),
  show: (id) =>
    set((s) => {
      const hidden = { ...s.hidden }
      delete hidden[id]
      return { hidden }
    }),
}))

export const useIsHidden = (id: PanelId) => useHidden((s) => !!s.hidden[id])
