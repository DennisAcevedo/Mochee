import { create } from 'zustand'

// The gym scoreboard's tally (SHOTS made / attempted). The "Shoot hoops"
// action calls recordShot(made) once per shot; the scoreboard in PlayWorld
// reads it. Lives for the session, like the other play stores.

interface GymState {
  attempts: number
  makes: number
  recordShot: (made: boolean) => void
  reset: () => void
}

export const useGym = create<GymState>((set) => ({
  attempts: 0,
  makes: 0,
  recordShot: (made) => set((s) => ({ attempts: s.attempts + 1, makes: s.makes + (made ? 1 : 0) })),
  reset: () => set({ attempts: 0, makes: 0 }),
}))
