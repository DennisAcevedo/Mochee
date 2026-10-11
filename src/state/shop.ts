import { create } from 'zustand'

export type ShopPhase = 'closed' | 'approaching' | 'open' | 'returning'

interface ShopState {
  phase: ShopPhase
  afterReturn: (() => void) | null
  enter: () => void
  arrived: () => void
  leave: (afterReturn?: () => void) => void
  returned: () => void
  reset: () => void
}

// The camera owns arrival/return, so the popup can never beat the camera to
// the shelves. Repeated clicks and a cancelled approach cannot reopen it.
export const useShop = create<ShopState>((set, get) => ({
  phase: 'closed',
  afterReturn: null,
  enter: () => {
    if (get().phase === 'closed') set({ phase: 'approaching', afterReturn: null })
  },
  arrived: () => {
    if (get().phase === 'approaching') set({ phase: 'open' })
  },
  leave: (afterReturn) => {
    if (get().phase === 'open' || get().phase === 'approaching') set({ phase: 'returning', afterReturn: afterReturn ?? null })
  },
  returned: () => {
    if (get().phase !== 'returning') return
    const action = get().afterReturn
    set({ phase: 'closed', afterReturn: null })
    action?.()
  },
  reset: () => set({ phase: 'closed', afterReturn: null }),
}))
