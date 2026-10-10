import { ARENA, BEAT, JUICE } from './config'

// The fight as pure functions of time: what the boss, Gemini Guy, the bolt and
// the camera do at t ms into a beat. The 3D arena and the HUD both read these,
// so the two layers stay in step (and a screenshot at a given time is stable).

export type BeatKind = 'enter' | 'hit' | 'ko' | 'miss'
export type Outcome = 'won' | 'lost' | null

export interface Beat {
  id: number
  kind: BeatKind
  at: number // performance.now() ms when it started
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
export const outCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3
const inQuad = (x: number) => clamp01(x) ** 2
const inOutCubic = (x: number) => {
  const u = clamp01(x)
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2
}
export const outBack = (x: number, s = 1.7) => {
  const u = clamp01(x) - 1
  return 1 + (s + 1) * u * u * u + s * u * u
}
export const hump = (x: number) => Math.sin(Math.PI * clamp01(x))
const TAU = Math.PI * 2

// When a beat lands (ms), or null for a beat with no impact.
export function impactOf(kind: BeatKind): number | null {
  if (kind === 'hit' || kind === 'ko') return BEAT.hit.impact
  if (kind === 'miss') return BEAT.miss.impact
  return null
}

// Beat time with the hit-stop folded in: the arena freezes for BEAT.hitStop
// ms on the impact frame, then carries on where it left off.
export function beatTime(kind: BeatKind, elapsed: number): number {
  const at = impactOf(kind)
  if (at === null || elapsed < at) return elapsed
  return elapsed < at + BEAT.hitStop ? at : elapsed - BEAT.hitStop
}

// Real (wall-clock) ms from the answer to a beat-time moment after the impact.
export function wallMs(kind: BeatKind, beatMs: number): number {
  const at = impactOf(kind)
  return at !== null && beatMs >= at ? beatMs + BEAT.hitStop : beatMs
}

// ---- The boss

export interface BossPose {
  x: number // along the arena (world x), from its spot
  y: number
  lean: number // rad, + tips its top toward Gemini Guy
  sx: number
  sy: number
  sz: number
  flash: number // 0..1 white flash
  hurt: number // 0..1 squeezed eyes
  glare: number // 0..1 wide eyes (wind-up)
  spin: number // extra wheel spin, rad/s (the arena adds the roll from x itself)
  jitter: number // world units of hit shake (x)
  gone: boolean // burst after a KO
  burstAge: number // ms since the burst, or -1
  disc: number // 0..1 disc scale (pops in on entry, shrinks after a KO)
}

export function newBossPose(): BossPose {
  return { x: 0, y: 0, lean: 0, sx: 1, sy: 1, sz: 1, flash: 0, hurt: 0, glare: 0, spin: 0, jitter: 0, gone: false, burstAge: -1, disc: 1 }
}

// The boss's idle loop: a menacing bob with squash at the bottom, a slow lean
// toward him and the wheels revving back and forth.
function bossIdle(now: number, motion: number, out: BossPose) {
  const b = (now / BEAT.idle.bob) * TAU
  out.x = 0
  out.y = 0.05 * motion * (0.5 - 0.5 * Math.cos(b))
  const s = 0.04 * motion * Math.cos(b)
  out.sy = 1 - s
  out.sx = out.sz = 1 + s * 0.5
  out.lean = 0.05 + 0.025 * Math.sin(b * 0.5)
  const w = TAU / (BEAT.idle.rev / 1000)
  out.spin = 0.5 * w * Math.cos((now / BEAT.idle.rev) * TAU) * motion
  out.flash = 0
  out.hurt = 0
  out.glare = 0
  out.jitter = 0
  out.gone = false
  out.burstAge = -1
  out.disc = 1
}

// How long a beat drives the boss; after that it is back on its idle loop.
function bossBeatEnd(kind: BeatKind): number {
  if (kind === 'enter') return BEAT.enter.settle + 200
  if (kind === 'miss') return BEAT.miss.done
  if (kind === 'hit') return BEAT.hit.done
  return Number.POSITIVE_INFINITY // a KO'd boss stays gone
}

// Distance (world x) the lunge travels to reach him.
export const LUNGE = ARENA.boss.x - ARENA.guy.x - ARENA.boss.contact

export function bossPose(beat: Beat | null, outcome: Outcome, outcomeAge: number, now: number, motion: number, out: BossPose): BossPose {
  bossIdle(now, motion, out)
  const t = beat ? beatTime(beat.kind, now - beat.at) : 0
  if (beat && t < bossBeatEnd(beat.kind)) switch (beat.kind) {
    case 'enter': {
      const { drive, skid, settle } = BEAT.enter
      out.x = ARENA.boss.enterFrom * (1 - outBack(span(t, 0, drive), 1.3))
      out.spin *= span(t, skid, settle)
      out.lean = 0.14 * (1 - span(t, drive - 120, drive)) - 0.18 * hump(span(t, drive - 80, skid)) + out.lean * span(t, skid, settle)
      const sq = hump(span(t, drive - 60, skid))
      out.sx = out.sz = 1 + 0.14 * sq
      out.sy = 1 - 0.14 * sq
      const hop = hump(span(t, skid, settle))
      out.y = 0.28 * hop
      out.sy += 0.06 * hop
      out.disc = outBack(span(t, 0, ARENA.disc.pop), 2)
      out.glare = hump(span(t, skid, settle + 200))
      break
    }
    case 'hit':
    case 'ko': {
      const at = BEAT.hit.impact
      out.glare = span(t, 200, at)
      if (t < at) break
      const u = t - at
      if (beat.kind === 'ko' && u >= BEAT.koBurst) {
        out.gone = true
        out.burstAge = u - BEAT.koBurst
        out.disc = 1 - span(out.burstAge, 700, 1000)
        out.spin = 0
        break
      }
      out.x = 0.34 * outCubic(span(u, 0, 90)) * (1 - inOutCubic(span(u, 160, 480)))
      out.lean -= 0.24 * hump(span(u, 0, 280))
      const sq = hump(span(u, 0, 150))
      out.sx *= 1 - 0.14 * sq
      out.sz = out.sx
      out.sy *= 1 + 0.12 * sq
      out.flash = u < 170 ? 1 - u / 170 : 0
      out.hurt = u < 520 ? 1 : 0
      out.jitter = 0.07 * Math.exp(-u / 130) * Math.sin(u * 0.09)
      out.glare = 0
      if (beat.kind === 'ko') {
        // Shakes harder and harder, swells and flickers, then bursts.
        const k = span(u, 0, BEAT.koBurst)
        out.jitter = 0.09 * Math.sin(u * 0.16) * (0.4 + k)
        out.flash = Math.max(out.flash, (0.5 + 0.5 * Math.sin(u * 0.07)) * k)
        const swell = 1 + 0.2 * outCubic(span(u, 120, BEAT.koBurst))
        out.sx *= swell
        out.sy *= swell
        out.sz *= swell
        out.hurt = 1
        out.spin = 30 * k
      }
      break
    }
    case 'miss': {
      const { windup, impact, back } = BEAT.miss
      out.glare = 1
      if (t < windup) {
        // Backs up, crouches, leans back, revs (a burnout in place).
        const w = outCubic(span(t, 0, windup))
        out.x = 0.3 * w
        out.lean -= 0.18 * w
        out.sy *= 1 - 0.14 * w
        out.sx *= 1 + 0.1 * w
        out.sz = out.sx
        out.spin = 45 * w
        break
      }
      if (t < impact) {
        // The charge (the roll comes from x).
        out.x = 0.3 + (-LUNGE - 0.3) * inQuad(span(t, windup, impact))
        out.lean = 0.24
        out.sx = out.sz = 1.14
        out.sy = 0.88
        out.spin = 0
        break
      }
      const u = t - impact
      const sq = hump(span(u, 0, 130))
      out.x = -LUNGE * (1 - outBack(span(u, 110, back - impact), 1.15))
      out.lean = 0.24 * (1 - span(u, 0, 260)) - 0.1 * hump(span(u, 150, 420)) + out.lean * span(u, 300, back - impact)
      out.sx *= 1 - 0.16 * sq
      out.sz = out.sx
      out.sy *= 1 + 0.12 * sq
      out.spin *= span(u, 300, back - impact)
      out.glare = 1 - span(u, 200, 500)
      break
    }
  }

  // After it wins: a bouncing laugh.
  if (outcome === 'lost' && outcomeAge < BEAT.taunt) {
    const k = 1 - span(outcomeAge, BEAT.taunt * 0.6, BEAT.taunt)
    out.y += 0.16 * Math.abs(Math.sin((outcomeAge / 360) * TAU)) * k * motion
    out.lean += 0.08 * Math.sin((outcomeAge / 180) * Math.PI) * k
  }
  return out
}

// ---- Gemini Guy (offsets layered on the Blender tutor, his parent's frame)

export interface GuyPose {
  dx: number // toward the boss (world x)
  dy: number
  pitch: number // rad, + leans forward
  sx: number
  sy: number
}

export function newGuyPose(): GuyPose {
  return { dx: 0, dy: 0, pitch: 0, sx: 1, sy: 1 }
}

// Distance of the dash toward the boss.
export const DASH = 0.75

export function guyPose(beat: Beat | null, outcome: Outcome, outcomeAge: number, now: number, motion: number, out: GuyPose): GuyPose {
  // A boxer's bounce while he waits for the answer.
  const r = Math.abs(Math.sin((now / BEAT.idle.ready) * Math.PI))
  out.dx = 0
  out.dy = 0.03 * r * motion
  out.pitch = 0.04
  out.sy = 1 - 0.025 * (1 - r) * motion
  out.sx = 1 + 0.015 * (1 - r) * motion

  if (beat && (beat.kind === 'hit' || beat.kind === 'ko')) {
    const t = beatTime(beat.kind, now - beat.at)
    const { windup, dash, impact, back } = BEAT.hit
    const wind = outCubic(span(t, 0, windup)) * (1 - span(t, windup, dash))
    const go = outCubic(span(t, windup, dash))
    const ret = inOutCubic(span(t, impact + 40, back))
    out.dx = -0.1 * wind + DASH * go * (1 - ret)
    out.dy += 0.22 * hump(span(t, windup, impact)) * (1 - ret)
    out.sy *= 1 - 0.1 * wind + 0.08 * hump(span(t, windup, dash + 60)) - 0.08 * hump(span(t, impact, impact + 140))
    out.sx *= 1 + 0.06 * wind
    out.pitch += 0.2 * go * (1 - ret)
  } else if (beat && beat.kind === 'miss') {
    const t = beatTime(beat.kind, now - beat.at)
    const { impact } = BEAT.miss
    // Startled stretch as the boss charges, then knocked away from it (the 'boss' tumble flips him on top).
    out.sy *= 1 + 0.06 * hump(span(t, 160, impact))
    const u = t - impact
    if (u >= 0 && u < 1400) {
      const k = 1 - span(u, 1100, 1400)
      out.dx = -0.55 * outCubic(span(u, 0, 220)) * (1 - inOutCubic(span(u, 900, 1400)))
      out.dy *= 1 - k
      out.pitch *= 1 - k
    }
  }

  // Out of hearts: a sad slump (the 'sleep' loop plays underneath).
  if (outcome === 'lost') {
    const k = outCubic(span(outcomeAge, 0, 420))
    out.dy = -0.03 * k
    out.pitch = 0.2 * k
    out.sy = 1 - 0.07 * k
    out.sx = 1 + 0.04 * k
  }
  return out
}

// While the answer is being checked (k 0..1, eased by the arena): he crouches,
// ready to spring; the boss rocks back a touch, eyes wide. Layered on both poses.
export function tense(k: number, guy: GuyPose, boss: BossPose) {
  if (k <= 0.001) return
  guy.sy *= 1 - 0.08 * k
  guy.sx *= 1 + 0.05 * k
  guy.dx -= 0.06 * k
  guy.pitch += 0.1 * k
  boss.glare = Math.max(boss.glare, k)
  boss.x += 0.08 * k
  boss.lean -= 0.05 * k
  boss.sy *= 1 - 0.05 * k
  boss.sx *= 1 + 0.03 * k
  boss.sz *= 1 + 0.03 * k
}

// ---- The star bolt: 0..1 along its arc, or -1 when not in flight.

export function boltProgress(beat: Beat | null, now: number): number {
  if (!beat || (beat.kind !== 'hit' && beat.kind !== 'ko')) return -1
  const t = beatTime(beat.kind, now - beat.at)
  const { launch, impact } = BEAT.hit
  if (t < launch || t >= impact) return -1
  return (t - launch) / (impact - launch)
}

// ms since the beat's impact (hit-stop excluded), or -1 before it.
export function sinceImpact(beat: Beat | null, now: number): number {
  if (!beat) return -1
  const at = impactOf(beat.kind)
  if (at === null) return -1
  const t = beatTime(beat.kind, now - beat.at)
  return t >= at ? t - at : -1
}

// ---- Screen shake (px), applied to the 3D shot; the HUD runs the CSS twin.

export function shake(beat: Beat | null, now: number, reduced: boolean, out: { x: number; y: number }): { x: number; y: number } {
  out.x = 0
  out.y = 0
  if (!beat) return out
  const u = sinceImpact(beat, now)
  if (u < 0) return out
  let amp: number = beat.kind === 'miss' ? JUICE.shake.miss : beat.kind === 'ko' ? JUICE.shake.ko : JUICE.shake.hit
  let age = u
  if (beat.kind === 'ko' && u >= BEAT.koBurst) {
    amp = JUICE.shake.burst
    age = u - BEAT.koBurst
  } else if (beat.kind === 'ko') {
    // A rumble while it shakes, before the burst.
    amp = JUICE.shake.hit * (0.6 + span(u, 0, BEAT.koBurst))
    age = Math.min(u, 60)
  }
  const a = amp * Math.exp(-age / JUICE.shakeDecay) * (reduced ? JUICE.reduced.shake : 1)
  out.x = a * Math.sin(age * 0.11 + 1.3)
  out.y = a * Math.cos(age * 0.137)
  return out
}
