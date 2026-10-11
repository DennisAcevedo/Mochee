import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { abilityById, abilityToLearn, topicText } from '../growth/abilities'
import { GROWTH } from '../growth/config'
import { celebrateMastery } from '../growth/perform'
import { experimentFor, returnFlagOn } from '../growth/schedule'
import { keywordsFor } from '../growth/topics'
import { safeStorage } from './progress'

// Mochee grows with what the student actually learns (contract; the logic
// lives in src/growth/**, the 3D side in src/scene/evolution/**).
// - Topic mastery: answering a topic's question right on the first try (or 2 of
//   the last 3) masters it. Topics come from the built-in lesson and from
//   uploaded documents (docsTypes TopicInfo).
// - Abilities: each mastered topic teaches him a physical ability matched to
//   it (e.g. FCFS -> "Queue juggle": he lines up P1/P2/P3 job blocks in
//   arrival order). Abilities are new moves/props, never random rewards.
// - Room evolution: documents become books on a shelf, topics become posters,
//   mastered topics earn trophies. The room is built from the student's own
//   material.
// - Return experiments: on a later visit he presents something he built from a
//   topic mastered earlier (e.g. a physical FCFS vs SJF "scheduler race").
//   Deterministic and once-only per topic; eligible from the next calendar day
//   (dev: ?return=1 makes it eligible now).
//
// Quiz answers call recordAnswer once per submitted answer:
//   built-in quiz: recordAnswer(BUILTIN_TOPIC_REF, correct)   (src/growth/topics.ts)
//   document quiz: recordAnswer({ id: result.topicId, title, documentId }, result.correct)
// Keywords for ability matching are looked up from the documents list; pass
// `keywords` on the topic to override.

export interface TopicRef {
  id: string
  title: string
  documentId: string | null // null = the built-in lesson
}

export interface TopicMastery extends TopicRef {
  attempts: number
  correct: number
  recent: boolean[] // last answers, newest last
  mastered: boolean
  masteredAt: number | null // epoch ms
}

export type AbilityId = string

export interface AbilityDef {
  id: AbilityId
  label: string // e.g. "Queue juggle"
  blurb: string // one line shown when he learns it
  match: string[] // lowercase keywords; a mastered topic whose title/keywords hit one teaches this ability
}

export interface LearnedAbility {
  id: AbilityId
  topicId: string
  learnedAt: number
}

export interface ReturnExperiment {
  id: string // `${topicId}:${kind}`
  topicId: string
  topicTitle: string
  kind: string // e.g. 'scheduler_race'
  title: string // e.g. "I built a scheduler race!"
  eligibleAfter: number // epoch ms
  seenAt: number | null
}

export interface GrowthState {
  topics: Record<string, TopicMastery>
  abilities: LearnedAbility[]
  experiments: ReturnExperiment[]
  learnedId: number // bumps when a new ability is learned, so the UI can celebrate once
  lastLearned: LearnedAbility | null
  recordAnswer: (topic: TopicRef & { keywords?: string[] }, correct: boolean) => void
  pendingExperiment: () => ReturnExperiment | null // eligible and unseen, or null
  markExperimentSeen: (id: string) => void
  resetGrowth: () => void
}

// First-try correct, or enough correct answers in the recent window.
export function meetsMastery(attemptsBefore: number, correct: boolean, recent: readonly boolean[]): boolean {
  if (correct && attemptsBefore === 0) return true
  return recent.slice(-GROWTH.mastery.window).filter(Boolean).length >= GROWTH.mastery.need
}

const empty = () => ({
  topics: {} as Record<string, TopicMastery>,
  abilities: [] as LearnedAbility[],
  experiments: [] as ReturnExperiment[],
  learnedId: 0,
  lastLearned: null as LearnedAbility | null,
})

const latest = (abilities: LearnedAbility[]) =>
  abilities.reduce<LearnedAbility | null>((best, a) => (!best || a.learnedAt >= best.learnedAt ? a : best), null)

// Stored state is read back defensively: anything malformed is dropped.
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

function cleanTopic(v: unknown): TopicMastery | null {
  const t = v as TopicMastery
  if (!t || !isStr(t.id) || !isStr(t.title) || !isNum(t.attempts) || !Array.isArray(t.recent)) return null
  const recent = t.recent.filter((r): r is boolean => typeof r === 'boolean').slice(-GROWTH.mastery.window)
  const mastered = t.mastered === true
  return {
    id: t.id,
    title: t.title,
    documentId: isStr(t.documentId) ? t.documentId : null,
    attempts: t.attempts,
    correct: isNum(t.correct) ? t.correct : 0,
    recent,
    mastered,
    masteredAt: mastered ? (isNum(t.masteredAt) ? t.masteredAt : 0) : null,
  }
}

function cleanAbility(v: unknown): LearnedAbility | null {
  const a = v as LearnedAbility
  return a && isStr(a.id) && abilityById(a.id) && isStr(a.topicId) && isNum(a.learnedAt) ? { id: a.id, topicId: a.topicId, learnedAt: a.learnedAt } : null
}

function cleanExperiment(v: unknown): ReturnExperiment | null {
  const e = v as ReturnExperiment
  if (!e || !isStr(e.id) || !isStr(e.topicId) || !isStr(e.kind) || !isNum(e.eligibleAfter)) return null
  return {
    id: e.id,
    topicId: e.topicId,
    topicTitle: isStr(e.topicTitle) ? e.topicTitle : e.topicId,
    kind: e.kind,
    title: isStr(e.title) ? e.title : '',
    eligibleAfter: e.eligibleAfter,
    seenAt: isNum(e.seenAt) ? e.seenAt : null,
  }
}

const notNull = <T>(v: T | null): v is T => v !== null

export const useGrowth = create<GrowthState>()(
  persist(
    (set, get) => ({
      ...empty(),

      recordAnswer: (topic, correct) => {
        const s = get()
        const now = Date.now()
        const prev: TopicMastery = s.topics[topic.id] ?? {
          id: topic.id,
          title: topic.title,
          documentId: topic.documentId,
          attempts: 0,
          correct: 0,
          recent: [],
          mastered: false,
          masteredAt: null,
        }
        const recent = [...prev.recent, correct].slice(-GROWTH.mastery.window)
        const newlyMastered = !prev.mastered && meetsMastery(prev.attempts, correct, recent)
        const next: TopicMastery = {
          ...prev,
          title: topic.title || prev.title,
          attempts: prev.attempts + 1,
          correct: prev.correct + (correct ? 1 : 0),
          recent,
          mastered: prev.mastered || newlyMastered,
          masteredAt: prev.masteredAt ?? (newlyMastered ? now : null),
        }
        const topics = { ...s.topics, [topic.id]: next }
        if (!newlyMastered) {
          set({ topics })
          return
        }

        const keywords = topic.keywords ?? keywordsFor(topic.id)
        const experiments = s.experiments.some((e) => e.topicId === topic.id)
          ? s.experiments
          : [...s.experiments, experimentFor(topic.id, next.title, keywords, now)]
        const spec = abilityToLearn(topicText(next.title, keywords), new Set(s.abilities.map((a) => a.id)))
        if (!spec) {
          set({ topics, experiments })
          celebrateMastery(null, next.title)
          return
        }
        const learned: LearnedAbility = { id: spec.id, topicId: topic.id, learnedAt: now }
        set({ topics, experiments, abilities: [...s.abilities, learned], learnedId: s.learnedId + 1, lastLearned: learned })
        celebrateMastery(spec, next.title)
      },

      pendingExperiment: () => {
        const now = Date.now()
        const anyTime = returnFlagOn()
        return get().experiments.find((e) => e.seenAt === null && (anyTime || e.eligibleAfter <= now)) ?? null
      },

      markExperimentSeen: (id) =>
        set((s) => ({ experiments: s.experiments.map((e) => (e.id === id && e.seenAt === null ? { ...e, seenAt: Date.now() } : e)) })),

      resetGrowth: () => set(empty()),
    }),
    {
      name: GROWTH.storageKey,
      version: GROWTH.storageVersion,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ topics: s.topics, abilities: s.abilities, experiments: s.experiments }),
      // Rebuild derived values on load: lastLearned from the stored abilities,
      // learnedId back to 0 so a reload never re-celebrates.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<GrowthState, 'topics' | 'abilities' | 'experiments'>>
        const topics: Record<string, TopicMastery> = {}
        for (const t of Object.values(p.topics ?? {}).map(cleanTopic).filter(notNull)) topics[t.id] = t
        const abilities = (Array.isArray(p.abilities) ? p.abilities : []).map(cleanAbility).filter(notNull)
        const experiments = (Array.isArray(p.experiments) ? p.experiments : []).map(cleanExperiment).filter(notNull)
        return { ...current, topics, abilities, experiments, learnedId: 0, lastLearned: latest(abilities) }
      },
    },
  ),
)
