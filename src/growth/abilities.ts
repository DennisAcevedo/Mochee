import type { FxKind, LoopClip, OneShotClip } from '../state/director'
import type { AbilityDef, AbilityId } from '../state/growth'
import type { PALETTE } from '../scene/layout3d'

// Abilities Mochee learns from mastered topics. Each one is a short,
// deterministic stage performance: timed director beats (clips, bursts,
// caption) plus a prop routine drawn by src/scene/evolution/AbilityProps.tsx.
// A mastered topic teaches the ability whose `match` keywords hit its title or
// keywords; any other topic teaches the generic fallback.

export type PaletteKey = keyof typeof PALETTE

// Prop routines AbilityProps knows how to draw. Several abilities can reuse
// one with different blocks.
export type PropRoutine = 'juggle' | 'orbit' | 'sort' | 'stack' | 'bounce' | 'flip'

export interface PropBlock {
  label: string
  color: PaletteKey
  size?: number // relative width (sort uses the burst length)
}

export type Beat = { play: OneShotClip } | { burst: FxKind } | { loop: LoopClip } | { caption: string | null }

export interface AbilitySpec extends AbilityDef {
  routine: PropRoutine
  blocks: PropBlock[]
  duration: number // seconds; the props and the beats both end by then
  beats: [number, Beat][] // [seconds from start, beat]
}

const JOBS: PropBlock[] = [
  { label: 'P1', color: 'teal', size: 24 },
  { label: 'P2', color: 'sun', size: 3 },
  { label: 'P3', color: 'violet', size: 3 },
]

export const FALLBACK_ABILITY: AbilityId = 'study_buddy_flip'

export const ABILITIES: AbilitySpec[] = [
  {
    id: 'queue_juggle',
    label: 'Queue juggle',
    blurb: 'He juggles job blocks, then lines them up in arrival order.',
    match: ['fcfs', 'first-come', 'first come', 'queue', 'arrival', 'convoy', 'scheduling'],
    routine: 'juggle',
    blocks: JOBS,
    duration: 2.9,
    beats: [
      [0, { caption: 'Queue juggle: **first come, first served**!' }],
      [0, { play: 'hop' }],
      [1.75, { play: 'hop' }],
      [2.05, { burst: 'stars' }],
    ],
  },
  {
    id: 'round_robin_spin',
    label: 'Round-robin spin',
    blurb: 'Jobs orbit his head and each one gets a turn in the spotlight.',
    match: ['round robin', 'round-robin', 'quantum', 'time slice', 'time-slice', 'preempt', 'preemption', 'preemptive'],
    routine: 'orbit',
    blocks: [
      { label: 'P1', color: 'coral' },
      { label: 'P2', color: 'teal' },
      { label: 'P3', color: 'lime' },
    ],
    duration: 2.6,
    beats: [
      [0, { caption: 'Round-robin spin: **everyone gets a turn**!' }],
      [0.1, { play: 'dance_spin' }],
      [2.2, { burst: 'ring' }],
    ],
  },
  {
    id: 'shortest_sprint',
    label: 'Shortest sprint',
    blurb: 'He re-sorts the jobs so the shortest ones go first.',
    match: ['sjf', 'shortest', 'shortest job', 'burst', 'srtf'],
    routine: 'sort',
    blocks: JOBS,
    duration: 2.7,
    beats: [
      [0, { caption: 'Shortest sprint: **short jobs first**!' }],
      [0.9, { play: 'hop' }],
      [1.9, { burst: 'sparkles' }],
    ],
  },
  {
    id: 'stack_tower',
    label: 'Stack tower',
    blurb: 'He pushes blocks onto a tower and pops the last one off the top.',
    match: ['stack', 'lifo', 'push', 'pop', 'call stack'],
    routine: 'stack',
    blocks: [
      { label: 'A', color: 'indigo' },
      { label: 'B', color: 'coral' },
      { label: 'C', color: 'lime' },
    ],
    duration: 2.8,
    beats: [
      [0, { caption: 'Stack tower: **last in, first out**!' }],
      [1.75, { play: 'hop' }],
      [2.1, { burst: 'stars' }],
    ],
  },
  {
    id: 'newton_bounce',
    label: 'Newton bounce',
    blurb: 'A ball drops, bounces lower each time, and he catches it.',
    match: ['force', 'newton', 'momentum', 'physics', 'gravity', 'acceleration', 'velocity'],
    routine: 'bounce',
    blocks: [{ label: 'F=ma', color: 'coral' }],
    duration: 2.8,
    beats: [
      [0, { caption: 'Newton bounce: **F = ma**!' }],
      [1.9, { play: 'catch' }],
      [2.5, { burst: 'sparkles' }],
    ],
  },
  {
    id: FALLBACK_ABILITY,
    label: 'Study-buddy flip',
    blurb: 'He flips a book over his head: one more topic in the bag.',
    match: [],
    routine: 'flip',
    blocks: [{ label: 'A+', color: 'violet' }],
    duration: 2.4,
    beats: [
      [0, { caption: 'Study-buddy flip: **one more topic in the bag**!' }],
      [0.2, { play: 'hop' }],
      [1.6, { burst: 'sparkles' }],
    ],
  },
]

const BY_ID = new Map(ABILITIES.map((a) => [a.id, a]))

export function abilityById(id: AbilityId): AbilitySpec | null {
  return BY_ID.get(id) ?? null
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Keywords match as whole words, so 'pop' does not hit 'population'.
const keywordRe = new Map<string, RegExp>()
function hits(text: string, keyword: string): boolean {
  let re = keywordRe.get(keyword)
  if (!re) {
    re = new RegExp(`(^|[^a-z0-9])${escape(keyword)}([^a-z0-9]|$)`)
    keywordRe.set(keyword, re)
  }
  return re.test(text)
}

// Lowercased text a topic is matched on: its title plus its keywords.
export function topicText(title: string, keywords: readonly string[] = []): string {
  return [title, ...keywords].join(' | ').toLowerCase()
}

// Specific abilities whose keywords hit `text`, best first (most keyword
// hits; ties keep table order). The fallback is never included.
export function rankAbilities(text: string): AbilitySpec[] {
  return ABILITIES.filter((a) => a.match.length > 0)
    .map((a, order) => ({ a, order, score: a.match.filter((k) => hits(text, k)).length }))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score || x.order - y.order)
    .map((r) => r.a)
}

// The ability a topic stands for, learned or not (picks its return experiment).
export function abilityForTopic(text: string): AbilitySpec {
  return rankAbilities(text)[0] ?? BY_ID.get(FALLBACK_ABILITY)!
}

// The ability a newly mastered topic teaches, or null if what it stands for is
// already learned. Each ability is learned once.
export function abilityToLearn(text: string, learned: ReadonlySet<AbilityId>): AbilitySpec | null {
  const ranked = rankAbilities(text)
  if (ranked.length > 0) return ranked.find((a) => !learned.has(a.id)) ?? null
  return learned.has(FALLBACK_ABILITY) ? null : BY_ID.get(FALLBACK_ABILITY)!
}
