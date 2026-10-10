import type { ReturnExperiment } from '../state/growth'
import { abilityForTopic, topicText } from './abilities'
import { GROWTH } from './config'

// When and what a newly mastered topic schedules as its return experiment.
// Kept free of store imports so src/state/growth.ts can use it directly.

export const RACE_KIND = 'scheduler_race'
export const SHOWCASE_PREFIX = 'showcase:'

// True when the page URL carries ?return=1 (dev/e2e: experiments are eligible now).
export function returnFlagOn(): boolean {
  try {
    return new URLSearchParams(window.location.search).get(GROWTH.returnFlag) === '1'
  } catch {
    return false
  }
}

// Start of the next local calendar day after `now`.
export function nextLocalDay(now: number): number {
  const d = new Date(now)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

// The race for scheduling topics, otherwise a showcase of the ability the
// topic stands for. Eligible from tomorrow (now with ?return=1).
export function experimentFor(topicId: string, title: string, keywords: readonly string[], now: number): ReturnExperiment {
  const ability = abilityForTopic(topicText(title, keywords))
  const kind = ability.experiment === 'scheduler_race' ? RACE_KIND : `${SHOWCASE_PREFIX}${ability.id}`
  return {
    id: `${topicId}:${kind}`,
    topicId,
    topicTitle: title,
    kind,
    title: kind === RACE_KIND ? 'I built a scheduler race!' : `I practised my ${ability.label}!`,
    eligibleAfter: returnFlagOn() ? now : nextLocalDay(now),
    seenAt: null,
  }
}
