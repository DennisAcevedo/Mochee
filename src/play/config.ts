import { PALETTE } from '../scene/layout3d'
import type { CoinReason } from '../state/progress'

// Every timing and colour of the play system. Durations are in milliseconds
// and line up with the Blender one-shots (giggle, highfive, catch, yum, dances).

export type PlayAction = 'poke' | 'highfive' | 'catch' | 'snack' | 'dance'

export const PLAY = {
  // Minimum gap between two uses of the same action.
  // Roughly the length of each clip, so a new one never cuts the last one off.
  cooldownMs: { poke: 1100, highfive: 1700, catch: 2600, snack: 2400, dance: 2900 } as Record<PlayAction, number>,

  highfive: { contactMs: 300 }, // palm meets palm: stars
  catch: {
    flightMs: 900, // ball in the air
    clipLeadMs: 280, // start the catch clip this early so his hands are up on arrival
    holdMs: 1000, // he holds it, then it pops into sparkles
  },
  snack: {
    flightMs: 820,
    clipLeadMs: 90,
    gulpMs: 160, // shrinks into his mouth over this long after arrival
  },
  dance: {
    starsAtMs: 650, // second wave of effects mid-dance
    sparklesAtMs: 1500,
    partyMs: 3000, // how long the party lights stay on (once bought)
  },
  bannerMs: 4200, // the "Unlocked: ..." banner after a purchase
  toastMs: 1500,
  maxToasts: 4,
} as const

// Back to Study from play: the lesson waits until he has glided back onto his
// spot (src/play/lessonMode.ts). The world cross-fade is 360 ms (WORLD.fade);
// study mode pulls the body home at physics returnDamp 3/s (about 26% of the
// gap per 100 ms check), so a gap that moves under stillM is home or parked.
export const LESSON_RETURN = {
  pollMs: 100,
  minMs: 420,
  nearM: 0.1,
  stillM: 0.006,
  maxMs: 6000,
} as const

// Colour of each "+N coins" toast, by what earned it.
export const COIN_COLOR: Record<CoinReason, string> = {
  sectionDone: PALETTE.teal,
  quizCorrect: PALETTE.indigo,
  bossWin: PALETTE.coral,
  lessonDone: PALETTE.violet,
}

// Ball and snack colours rotate through these.
export const PROP_COLORS = [PALETTE.coral, PALETTE.teal, PALETTE.sun, PALETTE.violet, PALETTE.lime, PALETTE.pink] as const

// Rainbow cap (once bought): index 0 keeps the model's own indigo.
export const CAP_COLORS = [null, PALETTE.coral, PALETTE.teal, PALETTE.sun, PALETTE.lime, PALETTE.pink, PALETTE.violet] as const
