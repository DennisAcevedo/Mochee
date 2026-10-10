import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { safeStorage, type Unlock } from '../state/progress'
import { CAP_COLORS, type PlayAction } from './config'

// Play-system state the 3D props, the effects and the HUD read: cooldowns,
// props in flight, the level-up banner, the cap colour and the party lights.
// Actions in ./actions.ts write it.

export type PropKind = 'ball' | 'snack'

export interface PlayProp {
  id: number
  kind: PropKind
  color: string
  born: number // performance.now() at launch
}

export interface LevelBanner {
  id: number
  level: number
  title: string
  unlocks: Unlock[]
}

export interface PlayState {
  cooldownUntil: Record<PlayAction, number> // performance.now() each action is ready again
  props: PlayProp[]
  banner: LevelBanner | null
  capIndex: number // into CAP_COLORS; 0 = the model's own colour
  partyUntil: number // performance.now() the party lights switch off

  startCooldown: (action: PlayAction, ms: number) => void
  spawnProp: (kind: PropKind, color: string) => PlayProp
  removeProp: (id: number) => void
  showBanner: (banner: Omit<LevelBanner, 'id'>) => void
  hideBanner: () => void
  nextCap: () => void
  startParty: (ms: number) => void
}

let nextId = 1

export const usePlay = create<PlayState>()(
  persist(
    (set) => ({
      cooldownUntil: { poke: 0, highfive: 0, catch: 0, snack: 0, dance: 0 },
      props: [],
      banner: null,
      capIndex: 0,
      partyUntil: 0,

      startCooldown: (action, ms) =>
        set((s) => ({ cooldownUntil: { ...s.cooldownUntil, [action]: performance.now() + ms } })),
      spawnProp: (kind, color) => {
        const prop = { id: nextId++, kind, color, born: performance.now() }
        set((s) => ({ props: [...s.props, prop] }))
        return prop
      },
      removeProp: (id) => set((s) => ({ props: s.props.filter((p) => p.id !== id) })),
      showBanner: (banner) => set({ banner: { ...banner, id: nextId++ } }),
      hideBanner: () => set({ banner: null }),
      nextCap: () => set((s) => ({ capIndex: (s.capIndex + 1) % CAP_COLORS.length })),
      startParty: (ms) => set({ partyUntil: performance.now() + ms }),
    }),
    {
      name: 'geminiguy-play',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ capIndex: s.capIndex }), // the chosen cap colour is the only thing worth keeping
    },
  ),
)

export function isCoolingDown(action: PlayAction, now = performance.now()): boolean {
  return now < usePlay.getState().cooldownUntil[action]
}
