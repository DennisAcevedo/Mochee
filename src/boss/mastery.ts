import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { safeStorage } from '../state/progress'

// Topics whose boss has been beaten, by topic id. progress.ts only tracks XP,
// so mastery lives here, persisted through the same never-throwing storage.

interface MasteryState {
  mastered: Record<string, number> // topicId -> ms epoch first beaten
  master: (topicId: string) => void
}

export const useBossMastery = create<MasteryState>()(
  persist(
    (set) => ({
      mastered: {},
      master: (topicId) => set((s) => (s.mastered[topicId] ? s : { mastered: { ...s.mastered, [topicId]: Date.now() } })),
    }),
    { name: 'geminiguy-boss-mastery', version: 1, storage: createJSONStorage(() => safeStorage) },
  ),
)
