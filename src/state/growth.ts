import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { celebrateMastery } from '../growth/celebrate'
import { GROWTH } from '../growth/config'
import { safeStorage } from './progress'

// Mochee grows with what the student actually learns (contract; the logic
// lives in src/growth/**, the 3D side in src/scene/evolution/**).
// - Topic mastery: answering a topic's question right on the first try (or 2 of
//   the last 3) masters it. Topics come from the built-in lesson and from
//   uploaded documents (docsTypes TopicInfo).
//   Mastering one gets a short cheer from him (src/growth/celebrate.ts).
// - Room evolution: documents become books on a shelf and mastered topics
//   earn trophies. The room is built from the student's own material.
//
// Quiz answers call recordAnswer once per submitted answer:
//   built-in quiz: recordAnswer(BUILTIN_TOPIC_REF, correct)   (src/growth/topics.ts)
//   document quiz: recordAnswer({ id: result.topicId, title, documentId }, result.correct)

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

export interface GrowthState {
  topics: Record<string, TopicMastery>
  recordAnswer: (topic: TopicRef, correct: boolean) => void
  resetGrowth: () => void
}

// First-try correct, or enough correct answers in the recent window.
export function meetsMastery(attemptsBefore: number, correct: boolean, recent: readonly boolean[]): boolean {
  if (correct && attemptsBefore === 0) return true
  return recent.slice(-GROWTH.mastery.window).filter(Boolean).length >= GROWTH.mastery.need
}

const empty = () => ({
  topics: {} as Record<string, TopicMastery>,
})

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
        set({ topics: { ...s.topics, [topic.id]: next } })
        if (newlyMastered) celebrateMastery(next.title)
      },

      resetGrowth: () => set(empty()),
    }),
    {
      name: GROWTH.storageKey,
      version: GROWTH.storageVersion,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ topics: s.topics }),
      // Anything else older saves kept (learned abilities, return experiments) is dropped.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<GrowthState, 'topics'>>
        const topics: Record<string, TopicMastery> = {}
        for (const t of Object.values(p.topics ?? {}).map(cleanTopic).filter(notNull)) topics[t.id] = t
        return { ...current, topics }
      },
    },
  ),
)
