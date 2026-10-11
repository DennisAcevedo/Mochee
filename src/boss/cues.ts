import { useTumbles } from '../state/tumbles'

// The store calls these the moment an answer comes back. The fight director
// (fight.ts) registers its handlers while it is bound, so a hit plays the dash
// and star bolt and a strike times the knock to the boss's lunge. Unbound
// (the store used on its own), a strike still knocks him into the boss tumble.

type Cue = () => void
export const bossCues: { hit: Cue | null; strike: Cue | null } = { hit: null, strike: null }

export function onBossHit() {
  bossCues.hit?.()
}

export function onBossStrike() {
  if (bossCues.strike) bossCues.strike()
  else useTumbles.getState().knock('boss', 1)
}
