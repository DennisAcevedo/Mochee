import { create } from 'zustand'
import { exposeDev } from '../character/blender/actor'
import { tutorStatus } from '../character/blender/BlenderTutor'
import { ANIM_STATES } from '../character/blender/config'
import { introTargets } from '../intro/targets'
import { nextCelebration, presenting, useWalkthrough } from '../lesson/runner'
import { useDirector, type Focus, type LoopClip } from '../state/director'
import { useTumbles } from '../state/tumbles'
import { archetypeFor, type Archetype } from './archetypes'
import { ARENA, ARENA_Z, BEAT } from './arena/config'
import { beatDone, wallMs, type Beat, type BeatKind, type Outcome } from './arena/timeline'
import { useBoss, type BossPhase, type BossState } from './bossStore'
import { bossCues } from './cues'

// The fight director: turns the boss store's answers into beats on the stage.
// While a fight is up it takes the stage over (the canvas is lifted above the
// lesson chrome, the lesson is held, Mochee walks to his corner) and
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
  ready: boolean // the beat has played out and he is on his feet: answers, Next and Try again wait for it
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
  ready: false,
}))

// The HUD root, for the arena's per-frame CSS variables (where the fighters' heads are on screen).
export const fightDom: { hud: HTMLElement | null } = { hud: null }

const FIGHT_PHASES: ReadonlySet<BossPhase> = new Set(['ask', 'checking', 'answered', 'won', 'lost'])
export const isFightPhase = (p: BossPhase) => FIGHT_PHASES.has(p)

// What the takeover changed, so stop() can give back exactly that.
interface Take {
  zIndex: string
  held: boolean // we held the walkthrough (and so release it)
  paused: boolean // we paused a playing lesson (and so resume it): a release by someone else mid-fight then plays nothing
  focus: Focus // the focus to give back (the latest one asked for during the fight)
  loop: LoopClip | null // the loop override we set
  hidden: { el: HTMLElement; opacity: string }[]
  offFocus: () => void
  offRun: () => void
}

let take: Take | null = null
let beatId = 0
const timers: number[] = []
const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
const clearTimers = () => timers.splice(0).forEach((t) => window.clearTimeout(t))

// Dev readout on window.__gg.bossFight, for the probes and checks.
const readout = { on: false, beat: '' as BeatKind | '', beats: 0, knocks: 0, lastKnock: null as string | null, outcome: null as Outcome, ready: false }
const publish = () => {
  const f = useFight.getState()
  readout.on = f.on
  readout.beat = f.beat?.kind ?? ''
  readout.outcome = f.outcome
  readout.ready = f.ready
  exposeDev('bossFight', readout)
}

function setLoop(loop: LoopClip | null) {
  if (!take) return
  useWalkthrough.getState().setLoopOverride(loop)
  take.loop = loop
}

// Every beat starts not ready; it gets ready once it has played out (settle).
function beat(kind: BeatKind) {
  readout.beats++
  const id = ++beatId
  useFight.setState({ beat: { id, kind, at: performance.now() }, ready: false })
  publish()
  const done = beatDone(kind)
  if (Number.isFinite(done)) later(done, () => settle(id, performance.now()))
}

// Knocked down or getting up: those clips outrank the high five, which would wait and expire behind them.
function downed(): boolean {
  const a = tutorStatus.anim
  return useTumbles.getState().hold !== null || (!!a?.oneShot && ANIM_STATES[a.state].priority >= ANIM_STATES.knocked.priority)
}

function settle(id: number, since: number) {
  if (!take || id !== beatId) return
  if (downed() && performance.now() - since < BEAT.settle.max) {
    later(BEAT.settle.every, () => settle(id, since))
    return
  }
  useFight.setState({ ready: true })
  publish()
}

function start(s: BossState) {
  const d = useDirector.getState()
  const wrap = introTargets.scene
  take = { zIndex: wrap?.style.zIndex ?? '', held: false, paused: false, focus: d.focus, loop: null, hidden: [], offFocus: () => {}, offRun: () => {} }
  if (wrap) {
    wrap.style.zIndex = String(ARENA_Z.canvas)
    // DOM glued onto the 3D windows (traffic lights, restore chips, <Html>) lives next to the canvas: hide it too.
    // Opacity, not visibility: the lights and the chip set their own visibility inline, which would show through.
    const host = wrap.querySelector('canvas')?.parentElement
    for (const el of Array.from(host?.children ?? [])) {
      if (!(el instanceof HTMLElement) || el.tagName === 'CANVAS') continue
      take.hidden.push({ el, opacity: el.style.opacity })
      el.style.opacity = '0'
    }
  }
  // The coin toast a win earns (and an "Unlocked" banner) show over the fight.
  document.documentElement.style.setProperty('--gg-over-fight', String(ARENA_Z.over))
  const w = useWalkthrough.getState()
  if (w.started && !w.held) {
    w.hold()
    take.held = useWalkthrough.getState().held
  }
  // The hold is one flag that a chat answer also releases: paused as well, a
  // release mid-fight does not pick the lesson back up under the fight.
  const run = useWalkthrough.getState()
  if (run.started && run.playing && run.phase !== 'done') {
    run.pause()
    take.paused = true
  }
  setLoop('idle')
  d.setFocus('none')
  d.stepAside(ARENA.guy.x)
  // Nothing else frames the stage while the fight is up (a chat answer pointing
  // at the notes, a quick check handed back): that focus waits for the end.
  take.offFocus = useDirector.subscribe((n, prev) => {
    if (!take || n.focus === prev.focus || n.focus === 'none') return
    take.focus = n.focus
    n.setFocus('none')
  })
  // Whatever plays a step while the fight is up (the lesson's auto-start or a toy
  // handing the lesson back) is paused again once the step has been set up,
  // so no line is said under the fight; the end of the fight resumes it.
  take.offRun = useWalkthrough.subscribe((n, prev) => {
    if (!take || !presenting(n.phase) || presenting(prev.phase)) return
    queueMicrotask(() => {
      const r = useWalkthrough.getState()
      if (!take || !presenting(r.phase)) return
      if (r.playing) take.paused = true
      r.pause()
    })
  })
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
  useFight.setState({ on: false, beat: null, outcome: null, ready: false })
  publish()
  if (!t) return
  t.offFocus()
  t.offRun()
  const wrap = introTargets.scene
  if (wrap) wrap.style.zIndex = t.zIndex
  for (const h of t.hidden) h.el.style.opacity = h.opacity
  document.documentElement.style.removeProperty('--gg-over-fight')
  const w = useWalkthrough.getState()
  if (t.loop !== null && w.loopOverride === t.loop) w.setLoopOverride(null)
  if (t.held) w.release()
  const d = useDirector.getState()
  if (d.asideX === ARENA.guy.x) d.stepAside(null)
  if (d.focus === 'none' && t.focus !== 'none') d.setFocus(t.focus)
  // Last: picking the step back up walks him from where the fight left him. Not when the
  // lesson has gone meanwhile (leaving the page stops it first) or someone already played it:
  // resume() would start it over, on the next page.
  const run = useWalkthrough.getState()
  if (t.paused && run.started && !run.playing) run.resume()
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
  if (kind === 'ko') later(wallMs(kind, BEAT.hit.impact + BEAT.koBurst), () => victoryDance(0))
}

// The victory: a dance as the boss bursts, then another as each one ends while
// the won card is up, each with its own confetti or stars.
function victoryDance(n: number) {
  if (!take || (n > 0 && useBoss.getState().phase !== 'won')) return
  // A one-shot that outranks a dance may be playing (a purchase's 'equip'):
  // wait it out rather than queue a dance that expires behind it.
  const a = tutorStatus.anim
  if (n > 0 && a?.oneShot && ANIM_STATES[a.state].priority > ANIM_STATES.dance.priority) {
    later(BEAT.victory.retry, () => victoryDance(n))
    return
  }
  const d = useDirector.getState()
  if (!useFight.getState().reduced) d.burst(n % 2 ? 'stars' : 'confetti')
  d.play(nextCelebration())
  if (n + 1 < BEAT.victory.dances) later(BEAT.victory.every, () => victoryDance(n + 1))
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
