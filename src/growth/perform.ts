import { create } from 'zustand'
import { useDirector } from '../state/director'
import type { AbilityId } from '../state/growth'
import { useMode } from '../state/mode'
import { abilityById, type AbilitySpec, type Beat } from './abilities'
import { GROWTH } from './config'
import { runTimeline } from './timeline'

// Performs abilities on stage. The director beats fire from a timeline; the
// props (src/scene/evolution/AbilityProps.tsx) read the current run from
// useAbilityRun and animate from its start time, so both stay in step.

export interface AbilityRun {
  runId: number
  id: AbilityId
  startedAt: number // performance.now() ms
}

export const useAbilityRun = create<{ run: AbilityRun | null }>(() => ({ run: null }))

let nextRunId = 1
let cancelBeats: (() => void) | null = null

// Captions this module set, so it only ever clears its own line.
let ownCaption: string | null = null

function say(text: string | null) {
  ownCaption = text
  useDirector.getState().setCaption(text)
}

function clearOwnCaption() {
  if (ownCaption !== null && useDirector.getState().caption === ownCaption) useDirector.getState().setCaption(null)
  ownCaption = null
}

function applyBeat(beat: Beat) {
  const d = useDirector.getState()
  if ('play' in beat) d.play(beat.play)
  else if ('burst' in beat) d.burst(beat.burst)
  else if ('loop' in beat) d.setLoop(beat.loop)
  else say(beat.caption)
}

// Stops the running ability (props vanish, its caption clears).
export function stopAbility() {
  cancelBeats?.()
  cancelBeats = null
  if (useAbilityRun.getState().run) useAbilityRun.setState({ run: null })
  clearOwnCaption()
}

// Performs ability `id` now: about 3 s of scripted beats plus props. Returns
// false for an unknown id. Starting one while another runs restarts cleanly.
export function performAbility(id: AbilityId): boolean {
  const spec = abilityById(id)
  if (!spec) return false
  stopAbility()
  const runId = nextRunId++
  useAbilityRun.setState({ run: { runId, id, startedAt: performance.now() } })
  cancelBeats = runTimeline([
    ...spec.beats.map(([at, beat]): [number, () => void] => [at, () => applyBeat(beat)]),
    [
      spec.duration,
      () => {
        if (useAbilityRun.getState().run?.runId !== runId) return
        useAbilityRun.setState({ run: null })
        clearOwnCaption()
        cancelBeats = null
      },
    ],
  ])
  return true
}

// Seconds an ability takes, for scripts that chain after it.
export function abilitySeconds(id: AbilityId): number {
  return abilityById(id)?.duration ?? 0
}

let cancelCelebrate: (() => void) | null = null

// The stage beat for a new mastery. With a new ability, the mode switches to
// 'celebrate' as an invitation (the MasteryInvite card offers Play / Keep
// studying); the student is never pulled out of the lesson by force.
export function celebrateMastery(learned: AbilitySpec | null, topicTitle: string) {
  const d = useDirector.getState()
  d.play(GROWTH.celebrate.clip)
  d.burst(GROWTH.celebrate.fx)
  const line = learned ? `I learned **${learned.label}**!` : `I mastered **${topicTitle}**!`
  say(line)
  cancelCelebrate?.()
  cancelCelebrate = runTimeline([[GROWTH.celebrate.captionMs / 1000, () => ownCaption === line && clearOwnCaption()]])
  if (learned) useMode.getState().setMode('celebrate')
}
