import { create } from 'zustand'
import { exposeDev } from '../character/blender/actor'
import { introTargets } from '../intro/targets'
import { nextCelebration, useWalkthrough } from '../lesson/runner'
import { useDirector, type Focus, type LoopClip } from '../state/director'
import { useTumbles } from '../state/tumbles'
import { archetypeFor, type Archetype } from './archetypes'
import { ARENA, ARENA_Z, BEAT } from './arena/config'
import { wallMs, type Beat, type BeatKind, type Outcome } from './arena/timeline'
import { useBoss, type BossPhase, type BossState } from './bossStore'
import { bossCues } from './cues'

// The fight director: turns the boss store's answers into beats on the stage.
// While a fight is up it takes the stage over (the canvas is lifted above the
// lesson chrome, the lesson is held, Gemini Guy walks to his corner) and
// gives it back when the fight ends. The 3D arena (arena/BossArena.tsx) and
// the HUD (BossLayer.tsx) both read useFight, so they stay in step.

export interface FightState {
  on: boolean // a fight phase: ask, checking, answered, won, lost
  arch: Archetype | null
  beat: Beat | null // the current beat; the arena and HUD time everything from beat.at
  outcome: Outcome
  outcomeAt: number // performance.now() when the outcome was decided
  revealed: number // the store's hitId whose explanation may show (after the hit has landed)
  round: number // bumps per question shown, so the question card slides up again
  reduced: boolean // prefers-reduced-motion
}

export const useFight = create<FightState>(() => ({
  on: false,
  arch: null,
  beat: null,
  outcome: null,
  outcomeAt: 0,
  revealed: 0,
  round: 0,
  reduced: false,
}))

// The HUD root, for the arena's per-frame CSS variables (where the fighters' heads are on screen).
export const fightDom: { hud: HTMLElement | null } = { hud: null }

const FIGHT_PHASES: ReadonlySet<BossPhase> = new Set(['ask', 'checking', 'answered', 'won', 'lost'])
export const isFightPhase = (p: BossPhase) => FIGHT_PHASES.has(p)

// What the takeover changed, so stop() can give back exactly that.
interface Take {
  zIndex: string
  held: boolean // we held the walkthrough (and so release it)
  focus: Focus
  loop: LoopClip | null // the loop override we set
  hidden: { el: HTMLElement; visibility: string }[]
}

let take: Take | null = null
let beatId = 0
const timers: number[] = []
const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
const clearTimers = () => timers.splice(0).forEach((t) => window.clearTimeout(t))

// Dev readout on window.__gg.bossFight, for the probes and checks.
const readout = { on: false, beat: '' as BeatKind | '', beats: 0, knocks: 0, lastKnock: null as string | null, outcome: null as Outcome }
const publish = () => {
  const f = useFight.getState()
  readout.on = f.on
  readout.beat = f.beat?.kind ?? ''
  readout.outcome = f.outcome
  exposeDev('bossFight', readout)
}

function setLoop(loop: LoopClip | null) {
  if (!take) return
  useWalkthrough.getState().setLoopOverride(loop)
  take.loop = loop
}

function beat(kind: BeatKind) {
  readout.beats++
  useFight.setState({ beat: { id: ++beatId, kind, at: performance.now() } })
  publish()
}

function start(s: BossState) {
  const d = useDirector.getState()
  const wrap = introTargets.scene
  take = { zIndex: wrap?.style.zIndex ?? '', held: false, focus: d.focus, loop: null, hidden: [] }
  if (wrap) {
    wrap.style.zIndex = String(ARENA_Z.canvas)
    // DOM glued onto the 3D windows (traffic lights, restore chips, <Html>) lives next to the canvas: hide it too.
    const host = wrap.querySelector('canvas')?.parentElement
    for (const el of Array.from(host?.children ?? [])) {
      if (!(el instanceof HTMLElement) || el.tagName === 'CANVAS') continue
      take.hidden.push({ el, visibility: el.style.visibility })
      el.style.visibility = 'hidden'
    }
  }
  const w = useWalkthrough.getState()
  if (w.started && !w.held) {
    w.hold()
    take.held = useWalkthrough.getState().held
  }
  setLoop('idle')
  d.setFocus('none')
  d.stepAside(ARENA.guy.x)
  bossCues.hit = onHit
  bossCues.strike = onStrike
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  useFight.setState({ on: true, arch: s.topic ? archetypeFor(s.topic) : null, outcome: null, revealed: 0, round: 1, reduced })
  beat('enter')
}

function stop() {
  clearTimers()
  bossCues.hit = null
  bossCues.strike = null
  const t = take
  take = null
  useFight.setState({ on: false, beat: null, outcome: null })
  publish()
  if (!t) return
  const wrap = introTargets.scene
  if (wrap) wrap.style.zIndex = t.zIndex
  for (const h of t.hidden) h.el.style.visibility = h.visibility
  const w = useWalkthrough.getState()
  if (t.loop !== null && w.loopOverride === t.loop) w.setLoopOverride(null)
  if (t.held) w.release()
  const d = useDirector.getState()
  if (d.asideX === ARENA.guy.x) d.stepAside(null)
  if (d.focus === 'none' && t.focus !== 'none') d.setFocus(t.focus)
}

// A right answer: he dashes in with a high five and fires the star bolt. The
// last one knocks the boss out: it shakes, bursts, and he dances.
function onHit() {
  const s = useBoss.getState()
  const kind: BeatKind = s.hp === 0 ? 'ko' : 'hit'
  const hitId = s.hitId
  beat(kind)
  const d = useDirector.getState()
  d.play('highfive', { urgent: true })
  later(wallMs(kind, BEAT.reveal.hit), () => useFight.setState({ revealed: hitId }))
  if (kind === 'ko') {
    later(wallMs(kind, BEAT.hit.impact + BEAT.koBurst), () => {
      const dd = useDirector.getState()
      dd.burst('confetti')
      dd.play(nextCelebration())
    })
  }
}

// A wrong answer: the boss winds up and lunges; on contact he tumbles away
// (dir 1 = to his right, screen left, away from the boss) and a heart breaks.
function onStrike() {
  const hitId = useBoss.getState().hitId
  beat('miss')
  later(BEAT.miss.impact, () => {
    readout.knocks++
    readout.lastKnock = 'boss'
    useTumbles.getState().knock('boss', 1)
    publish()
  })
  later(wallMs('miss', BEAT.reveal.miss), () => useFight.setState({ revealed: hitId }))
}

function onPhase(s: BossState, prev: BossState) {
  const was = isFightPhase(prev.phase)
  const is = isFightPhase(s.phase)
  if (is && !was) return start(s)
  if (!is && was) return stop()
  if (!is || s.phase === prev.phase) return
  if (s.phase === 'ask' && prev.phase === 'answered') useFight.setState({ round: useFight.getState().round + 1 })
  if (s.phase === 'won') {
    useFight.setState({ outcome: 'won', outcomeAt: performance.now() })
    publish()
  } else if (s.phase === 'lost') {
    useFight.setState({ outcome: 'lost', outcomeAt: performance.now() })
    setLoop('sleep') // the sad slump, cap over his eyes
    publish()
  } else if (prev.phase === 'lost' && s.phase === 'ask') {
    // Try again: back on his feet.
    useFight.setState({ outcome: null, beat: null, round: useFight.getState().round + 1 })
    setLoop('idle')
    useDirector.getState().play('hop')
    publish()
  }
}

// Binds the director to the boss store (BossLayer mounts it). Returns the unbind.
export function bindFight(): () => void {
  const s = useBoss.getState()
  if (isFightPhase(s.phase) && !take) start(s)
  const off = useBoss.subscribe(onPhase)
  return () => {
    off()
    if (take) stop()
  }
}
