import { useDirector } from '../state/director'
import { isUnlocked, unlockedDances, useProgress, type Dance, type XpReason } from '../state/progress'
import { CAP_COLORS, PLAY, PROP_COLORS, type PlayAction } from './config'
import { isCoolingDown, usePlay } from './playStore'

// The ways a student plays with Gemini Guy. Each one fires a one-shot clip,
// an effect burst and an XP award (the HUD floats the "+N XP" toast off the
// award). Every action has a cooldown; calls during it are ignored and return
// false, so mashing a button cannot farm XP.

const director = () => useDirector.getState()
const award = (reason: XpReason) => useProgress.getState().award(reason)

let propColor = 0
const nextPropColor = () => PROP_COLORS[propColor++ % PROP_COLORS.length]

// Claims the action's cooldown, or reports that it is still running.
function claim(action: PlayAction): boolean {
  if (isCoolingDown(action)) return false
  usePlay.getState().startCooldown(action, PLAY.cooldownMs[action])
  return true
}

const after = (ms: number, fn: () => void) => window.setTimeout(fn, ms)

// Tickle: tap on him (or the hint chip).
export function poke(): boolean {
  if (!claim('poke')) return false
  director().play('giggle')
  director().burst('hearts')
  award('poke')
  return true
}

export function highFive(): boolean {
  if (!claim('highfive')) return false
  director().play('highfive')
  after(PLAY.highfive.contactMs, () => {
    director().burst('stars')
    director().burst('ring')
    award('highfive')
  })
  return true
}

// A beach ball arcs in from the front; he catches it, holds it, it pops.
export function playCatch(): boolean {
  if (!claim('catch')) return false
  const { flightMs, clipLeadMs } = PLAY.catch
  usePlay.getState().spawnProp('ball', nextPropColor())
  after(flightMs - clipLeadMs, () => director().play('catch'))
  after(flightMs, () => {
    director().burst('sparkles')
    award('catch')
  })
  return true
}

// A doughnut flies into his mouth.
export function feedSnack(): boolean {
  if (!claim('snack')) return false
  const { flightMs, clipLeadMs } = PLAY.snack
  usePlay.getState().spawnProp('snack', nextPropColor())
  after(flightMs - clipLeadMs, () => director().play('yum'))
  after(flightMs, () => {
    director().burst('hearts')
    award('snack')
  })
  return true
}

// Plays the given dance if it is unlocked, else a random unlocked one.
// Confetti, then stars and sparkles mid-dance; party lights from level 5.
export function danceParty(dance?: Dance): boolean {
  const level = useProgress.getState().level
  const unlocked = unlockedDances(level)
  const pick = dance && unlocked.includes(dance) ? dance : unlocked[Math.floor(Math.random() * unlocked.length)]
  if (!pick || !claim('dance')) return false
  director().play(pick)
  director().burst('confetti')
  if (isUnlocked('party_lights', level)) usePlay.getState().startParty(PLAY.dance.partyMs)
  after(PLAY.dance.starsAtMs, () => director().burst('stars'))
  after(PLAY.dance.sparklesAtMs, () => director().burst('sparkles'))
  award('dance')
  return true
}

// Level 4: cycles his cap through the palette (no XP, no cooldown).
export function cycleCap(): boolean {
  if (!isUnlocked('rainbow_cap', useProgress.getState().level)) return false
  usePlay.getState().nextCap()
  director().burst('sparkles')
  return true
}

// The cap colour to apply right now, or null for the model's own.
export function capColor(level: number, capIndex: number): string | null {
  if (!isUnlocked('rainbow_cap', level)) return null
  return CAP_COLORS[capIndex % CAP_COLORS.length] ?? null
}
