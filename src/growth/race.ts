import type { PaletteKey } from './abilities'
import { RACE } from './config'

// The scheduler race's numbers, computed from the lesson's jobs rather than
// typed in: FCFS runs them in arrival order, SJF shortest burst first (stable,
// so equal bursts keep arrival order). All jobs arrive at 0, so a job's wait
// is its start time.

export type Policy = 'FCFS' | 'SJF'

export interface RaceJob {
  id: string
  burst: number // ms
  color: PaletteKey
  start: number // ms
  end: number // ms
  wait: number // ms
}

export interface Lane {
  policy: Policy
  jobs: RaceJob[] // in run order
  avgWait: number // ms
  total: number // ms when the last job finishes
}

function order(policy: Policy) {
  const jobs = RACE.jobs.map((j, arrival) => ({ ...j, arrival }))
  if (policy === 'SJF') jobs.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival)
  return jobs
}

export function buildLane(policy: Policy): Lane {
  let clock = 0
  const jobs: RaceJob[] = order(policy).map((j) => {
    const job = { id: j.id, burst: j.burst, color: j.color, start: clock, end: clock + j.burst, wait: clock }
    clock += j.burst
    return job
  })
  const avgWait = jobs.reduce((sum, j) => sum + j.wait, 0) / jobs.length
  return { policy, jobs, avgWait, total: clock }
}

export const LANES: readonly [Lane, Lane] = [buildLane('FCFS'), buildLane('SJF')]

// Real seconds the race takes on stage.
export const RACE_SECONDS = Math.max(LANES[0].total, LANES[1].total) / RACE.msPerSecond

// "17 ms", "5.67 ms": whole numbers stay whole.
export function formatMs(ms: number): string {
  return `${Number.isInteger(ms) ? ms : ms.toFixed(2)} ms`
}
