import { create } from 'zustand'

export type ShopPhase = 'closed' | 'approaching' | 'open' | 'returning'

interface ShopState {
  phase: ShopPhase
  afterReturn: (() => void) | null
  skipping: boolean // the camera jumps the current trip to its end
  enter: () => void
  skip: () => void
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
  skipping: false,
  enter: () => {
    if (get().phase === 'closed') set({ phase: 'approaching', afterReturn: null, skipping: false })
  },
  skip: () => {
    const phase = get().phase
    if (phase === 'approaching' || phase === 'returning') set({ skipping: true })
  },
  arrived: () => {
    if (get().phase === 'approaching') set({ phase: 'open', skipping: false })
  },
  leave: (afterReturn) => {
    if (get().phase === 'open' || get().phase === 'approaching') set({ phase: 'returning', afterReturn: afterReturn ?? null, skipping: false })
  },
  returned: () => {
    if (get().phase !== 'returning') return
    const action = get().afterReturn
    set({ phase: 'closed', afterReturn: null, skipping: false })
    action?.()
  },
  reset: () => set({ phase: 'closed', afterReturn: null, skipping: false }),
}))
