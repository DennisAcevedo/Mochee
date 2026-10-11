import { create } from 'zustand'
import { useDirector } from '../state/director'
import { useGrowth, type ReturnExperiment } from '../state/growth'
import { abilityById, FALLBACK_ABILITY } from './abilities'
import { SHOWCASE } from './config'
import { performAbility, stopAbility } from './perform'
import { returnFlagOn, SHOWCASE_PREFIX } from './schedule'
import { runTimeline, type Step } from './timeline'

// Return experiments: what he practised while the student was away. The
// scripted run (a showcase of an ability he learned), skipping and replay;
// scheduling and eligibility live in schedule.ts. <ReturnExperiment/> starts
// a pending one when the lesson goes live; replayExperiment(id) runs any
// scheduled one again.

// Experiments already stored when this page loaded: only these auto-start,
// so one scheduled during this visit waits for the student to come back
// (even with ?return=1, which only skips the calendar-day wait).
const fromEarlierVisit = new Set(useGrowth.getState().experiments.map((e) => e.id))

// The experiment <ReturnExperiment/> should start: growth.pendingExperiment()
// limited to ones scheduled on an earlier visit.
export function pendingFromEarlierVisit(): ReturnExperiment | null {
  const pending = useGrowth.getState().pendingExperiment()
  if (pending && fromEarlierVisit.has(pending.id)) return pending
  const anyTime = returnFlagOn()
  const now = Date.now()
  return (
    useGrowth.getState().experiments.find((e) => e.seenAt === null && fromEarlierVisit.has(e.id) && (anyTime || e.eligibleAfter <= now)) ?? null
  )
}

export interface ExperimentRun {
  runId: number
  experiment: ReturnExperiment
  startedAt: number // performance.now() ms
  endsAt: number // seconds from start
}

export const useExperimentRun = create<{ run: ExperimentRun | null }>(() => ({ run: null }))

export function isExperimentRunning(): boolean {
  return useExperimentRun.getState().run !== null
}

let nextRunId = 1
let cancel: (() => void) | null = null
let ownCaption: string | null = null

function say(text: string | null) {
  ownCaption = text
  useDirector.getState().setCaption(text)
}

function finish(runId: number) {
  const run = useExperimentRun.getState().run
  if (!run || run.runId !== runId) return
  cancel?.()
  cancel = null
  stopAbility()
  const d = useDirector.getState()
  if (ownCaption !== null && d.caption === ownCaption) d.setCaption(null)
  ownCaption = null
  d.setLoop('idle')
  useExperimentRun.setState({ run: null })
  useGrowth.getState().markExperimentSeen(run.experiment.id)
}

const showcaseAbility = (kind: string) => abilityById(kind.slice(SHOWCASE_PREFIX.length)) ?? abilityById(FALLBACK_ABILITY)!

function showcaseSteps(runId: number, kind: string): { steps: Step[]; endsAt: number } {
  const ability = showcaseAbility(kind)
  const at = SHOWCASE.walkSeconds
  const endsAt = at + ability.duration + SHOWCASE.holdAfterSeconds
  return {
    endsAt,
    steps: [
      [0, () => useDirector.getState().play('wave')],
      [at, () => performAbility(ability.id)],
      [at + ability.duration, () => useDirector.getState().play('celebrate')],
      [endsAt, () => finish(runId)],
    ],
  }
}

// Runs an experiment on stage now. It is marked seen when it ends or is skipped.
export function startExperiment(experiment: ReturnExperiment): void {
  skipExperiment()
  const runId = nextRunId++
  const d = useDirector.getState()
  d.walkTo('center')
  d.setFocus('none')
  say(`While you were away I practised my **${showcaseAbility(experiment.kind).label}**!`)
  const { steps, endsAt } = showcaseSteps(runId, experiment.kind)
  useExperimentRun.setState({
    run: { runId, experiment, startedAt: performance.now(), endsAt },
  })
  cancel = runTimeline(steps)
}

// Ends the running experiment now (Esc, the Skip pill) and marks it seen.
export function skipExperiment(): void {
  const run = useExperimentRun.getState().run
  if (run) finish(run.runId)
}

// Runs a scheduled experiment again by id (seen or not). False if unknown.
export function replayExperiment(id: string): boolean {
  const experiment = useGrowth.getState().experiments.find((e) => e.id === id)
  if (!experiment) return false
  startExperiment(experiment)
  return true
}
