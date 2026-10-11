import { cycleCap, danceParty, feedSnack, highFive, playCatch } from '../../play/actions'
import { dribbleBall, dunkBall, juggleBall, kickBall, shootHoops } from '../../scene/hoops/actions'
import { PALETTE } from '../../scene/layout3d'
import type { LoopClip, OneShotClip } from '../../state/director'
import { DANCES, type Dance, type UnlockId } from '../../state/progress'

// Everything the animation shop lists, in the order the picker scrolls.
// `preview` is what the live tutor loops in the shop's stage: a loop clip
// plays as is, a one-shot is replayed on a timer. `run` is the real action,
// the same call the play bar's buttons used to make. An item with `unlock`
// is bought with coins first (its price is in src/state/progress.ts SHOP).

export interface ShopEntry {
  id: string
  name: string
  color: string
  preview: { loop: LoopClip } | { clip: OneShotClip }
  run: () => boolean
  unlock?: UnlockId
  cap?: boolean // the preview wears the next cap colour
}

const ORANGE = '#F08A24'

const DANCE_LOOK: Record<Dance, { name: string; color: string }> = {
  dance_bounce: { name: 'Bounce', color: PALETTE.pink },
  dance_spin: { name: 'Spin', color: PALETTE.teal },
  dance_shuffle: { name: 'Shuffle', color: PALETTE.coral },
  dance_robot: { name: 'Robot', color: PALETTE.indigo },
  dance_wave: { name: 'Wave', color: PALETTE.sun },
  dance_floss: { name: 'Floss', color: PALETTE.lime },
  dance_disco: { name: 'Disco', color: PALETTE.violet },
  dance_twist: { name: 'Twist', color: PALETTE.teal },
}

export const SHOP_ITEMS: ShopEntry[] = [
  { id: 'hoops', name: 'Shoot hoops', color: ORANGE, preview: { clip: 'play_shoot' }, run: shootHoops },
  { id: 'dribble', name: 'Dribble', color: PALETTE.sun, preview: { loop: 'play_dribble' }, run: dribbleBall },
  { id: 'kick', name: 'Kick', color: PALETTE.teal, preview: { clip: 'play_kick' }, run: kickBall },
  { id: 'juggle', name: 'Juggle', color: PALETTE.violet, preview: { loop: 'play_juggle' }, run: juggleBall },
  { id: 'dunk', name: 'Dunk', color: PALETTE.coral, preview: { clip: 'play_dunk' }, run: dunkBall },
  { id: 'highfive', name: 'High five', color: PALETTE.sun, preview: { clip: 'highfive' }, run: highFive },
  { id: 'catch', name: 'Catch', color: PALETTE.teal, preview: { clip: 'catch' }, run: playCatch },
  { id: 'snack', name: 'Snack', color: PALETTE.coral, preview: { clip: 'yum' }, run: feedSnack },
  { id: 'dance', name: 'Dance', color: PALETTE.violet, preview: { clip: 'dance_bounce' }, run: () => danceParty() },
  ...DANCES.map(
    (d): ShopEntry => ({
      id: d,
      name: `${DANCE_LOOK[d].name} dance`,
      color: DANCE_LOOK[d].color,
      preview: { clip: d },
      run: () => danceParty(d),
      unlock: d === 'dance_bounce' ? undefined : d,
    }),
  ),
  { id: 'cap', name: 'Rainbow cap', color: PALETTE.indigo, preview: { clip: 'wave' }, run: cycleCap, unlock: 'rainbow_cap', cap: true },
  { id: 'lights', name: 'Party lights', color: PALETTE.sun, preview: { clip: 'dance_disco' }, run: () => danceParty(), unlock: 'party_lights' },
]
