import { useDirector } from '../state/director'
import { owns, ownedDances, useProgress, type Dance, type UnlockId } from '../state/progress'
import { CAP_COLORS, PLAY, PROP_COLORS, type PlayAction } from './config'
import { isCoolingDown, usePlay } from './playStore'

// The ways a student plays with Mochee. Each one fires a one-shot clip
// and an effect burst. Playing pays no coins (only learning does, see
// src/state/progress.ts); every action still has a cooldown, so a new clip
// never cuts the last one off. Calls during it are ignored and return false.

const director = () => useDirector.getState()
const owned = (id: UnlockId) => owns(useProgress.getState().owned, id)

let propColor = 0
const nextPropColor = () => PROP_COLORS[propColor++ % PROP_COLORS.length]

// Claims the action's cooldown, or reports that it is still running.
function claim(action: PlayAction): boolean {
  if (isCoolingDown(action)) return false
  usePlay.getState().startCooldown(action, PLAY.cooldownMs[action])
  return true
}

const after = (ms: number, fn: () => void) => window.setTimeout(fn, ms)

// Tickle: tap on him (or the hint chip). Either way the student knows now: the hint goes.
export function poke(): boolean {
  usePlay.getState().seeTickleHint()
  if (!claim('poke')) return false
  director().play('giggle', { vary: true }) // giggle, laugh, shy in turn (CLIP_VARIANTS)
  director().burst('hearts')
  return true
}

export function highFive(): boolean {
  if (!claim('highfive')) return false
  director().play('highfive')
  after(PLAY.highfive.contactMs, () => {
    director().burst('stars')
    director().burst('ring')
  })
  return true
}

// A beach ball arcs in from the front; he catches it, holds it, it pops.
export function playCatch(): boolean {
  if (!claim('catch')) return false
  const { flightMs, clipLeadMs } = PLAY.catch
  usePlay.getState().spawnProp('ball', nextPropColor())
  after(flightMs - clipLeadMs, () => director().play('catch'))
  after(flightMs, () => director().burst('sparkles'))
  return true
}

// A doughnut flies into his mouth.
export function feedSnack(): boolean {
  if (!claim('snack')) return false
  const { flightMs, clipLeadMs } = PLAY.snack
  usePlay.getState().spawnProp('snack', nextPropColor())
  after(flightMs - clipLeadMs, () => director().play('yum', { vary: true }))
  after(flightMs, () => director().burst('hearts'))
  return true
}

// Plays the given dance if he owns it, else a random one he owns.
// Confetti, then stars and sparkles mid-dance; party lights once bought.
export function danceParty(dance?: Dance): boolean {
  const unlocked = ownedDances(useProgress.getState().owned)
  const pick = dance && unlocked.includes(dance) ? dance : unlocked[Math.floor(Math.random() * unlocked.length)]
  if (!pick || !claim('dance')) return false
  director().play(pick)
  director().burst('confetti')
  if (owned('party_lights')) usePlay.getState().startParty(PLAY.dance.partyMs)
  after(PLAY.dance.starsAtMs, () => director().burst('stars'))
  after(PLAY.dance.sparklesAtMs, () => director().burst('sparkles'))
  return true
}

// Once the rainbow cap is bought: cycles his cap through the palette (no cooldown).
export function cycleCap(): boolean {
  if (!owned('rainbow_cap')) return false
  usePlay.getState().nextCap()
  director().burst('sparkles')
  return true
}

// The cap colour to apply right now, or null for the model's own.
export function capColor(hasCap: boolean, capIndex: number): string | null {
  if (!hasCap) return null
  return CAP_COLORS[capIndex % CAP_COLORS.length] ?? null
}
