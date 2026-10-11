import { create } from 'zustand'
import type { DocumentInfo, QuizQuestion, QuizResult, TopicInfo } from '../../shared/docsTypes'
import { fetchQuiz, listDocuments, submitQuiz, type DocsErrorCode } from '../ui/Drawers/docsClient'
import { COIN_REWARD, useProgress } from '../state/progress'
import { useBossMastery } from './mastery'
import { onBossHit, onBossStrike } from './cues'

// Beat the Boss: pick a document -> pick a topic -> fight that topic's boss.
// Boss HP = number of questions; each right answer deals 1. Three hearts; a
// wrong answer costs one and the missed question goes to the back of the line.
// Answers are checked on the server: the client sees the correct index only
// in the QuizResult that comes back from submitQuiz.

export const BOSS = {
  hearts: 3,
  wonDelayMs: 1300,
  lostDelayMs: 1800,
} as const

export type BossPhase =
  | 'closed'
  | 'loading' // listing documents
  | 'empty' // the class has no documents
  | 'error'
  | 'pickDoc'
  | 'pickTopic'
  | 'loadingQuiz'
  | 'ask'
  | 'checking' // answer sent, waiting for the server
  | 'answered'
  | 'won'
  | 'lost'

export interface BossState {
  phase: BossPhase
  tutorId: string | null // the class whose documents are listed; set by <BossLayer tutorId>
  error: DocsErrorCode | null
  docs: DocumentInfo[]
  doc: DocumentInfo | null
  topic: TopicInfo | null
  queue: QuizQuestion[] // questions still to beat; [0] is on screen
  maxHp: number
  hp: number
  hearts: number
  streak: number
  picked: number | null
  result: QuizResult | null
  hitId: number // bumps on every hit / strike, so animations retrigger
  lastHit: 'hit' | 'miss' | null
  open: (documentId?: string, tutorId?: string) => Promise<void>
  setTutor: (tutorId: string | null) => void
  close: () => void
  pickDoc: (documentId: string) => void
  pickTopic: (topicId: string) => Promise<void>
  answer: (choice: number) => Promise<void>
  next: () => void
  retry: () => void
  backToTopics: () => void
}

let session = 0 // bumps on open/close so late responses from an old fight are dropped
const timers: number[] = []
const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
const clearTimers = () => timers.splice(0).forEach((t) => window.clearTimeout(t))

const attemptId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `a-${Date.now()}-${Math.random().toString(36).slice(2)}`

const FIGHT_RESET = { queue: [], maxHp: 0, hp: 0, hearts: BOSS.hearts, streak: 0, picked: null, result: null, lastHit: null } as const

export const useBoss = create<BossState>((set, get) => ({
  phase: 'closed',
  tutorId: null,
  error: null,
  docs: [],
  doc: null,
  topic: null,
  ...FIGHT_RESET,
  queue: [],
  hitId: 0,

  setTutor: (tutorId) => set({ tutorId }),

  open: async (documentId, tutorId) => {
    const my = ++session
    if (tutorId) set({ tutorId })
    clearTimers()
    set({ phase: 'loading', error: null, doc: null, topic: null, ...FIGHT_RESET, queue: [] })
    const res = await listDocuments(get().tutorId ?? undefined)
    if (my !== session) return
    if (!res.ok) return set({ phase: 'error', error: res.error })
    const docs = res.data
    if (docs.length === 0) return set({ phase: 'empty', docs })
    const doc = docs.find((d) => d.id === documentId) ?? (docs.length === 1 ? docs[0] : null)
    set({ docs, doc, phase: doc ? 'pickTopic' : 'pickDoc' })
  },

  close: () => {
    session++
    clearTimers()
    set({ phase: 'closed', error: null, ...FIGHT_RESET, queue: [] })
  },

  pickDoc: (documentId) => {
    const doc = get().docs.find((d) => d.id === documentId)
    if (doc) set({ doc, topic: null, phase: 'pickTopic' })
  },

  pickTopic: async (topicId) => {
    const { doc } = get()
    const topic = doc?.topics.find((t) => t.id === topicId)
    if (!doc || !topic) return
    const my = ++session
    clearTimers()
    set({ topic, phase: 'loadingQuiz', error: null, ...FIGHT_RESET, queue: [] })
    const res = await fetchQuiz(doc.id, topic.id)
    if (my !== session) return
    if (!res.ok) return set({ phase: 'error', error: res.error })
    const questions = res.data.questions.filter((q) => q.topicId === topic.id || !q.topicId)
    const use = questions.length ? questions : res.data.questions
    if (use.length === 0) return set({ phase: 'error', error: 'not-found' })
    set({ phase: 'ask', queue: use, maxHp: use.length, hp: use.length })
  },

  answer: async (choice) => {
    const s = get()
    const q = s.queue[0]
    if (s.phase !== 'ask' || !q || choice < 0 || choice >= q.choices.length) return
    const my = session
    set({ phase: 'checking', picked: choice })
    const res = await submitQuiz({ questionId: q.id, choice, attemptId: attemptId() })
    if (my !== session) return
    if (!res.ok) return set({ phase: 'ask', picked: null, error: res.error })
    const result = res.data
    const hitId = get().hitId + 1
    if (result.correct) {
      const hp = Math.max(0, get().hp - 1)
      set({ phase: 'answered', result, hp, streak: get().streak + 1, hitId, lastHit: 'hit', error: null })
      onBossHit()
      if (hp === 0) {
        later(BOSS.wonDelayMs, () => {
          if (my !== session) return
          const topic = get().topic
          if (topic) useBossMastery.getState().master(topic.id)
          useProgress.getState().award('bossWin', COIN_REWARD.bossWin)
          set({ phase: 'won' })
        })
      }
    } else {
      const hearts = Math.max(0, get().hearts - 1)
      set({ phase: 'answered', result, hearts, streak: 0, hitId, lastHit: 'miss', error: null })
      onBossStrike()
      if (hearts === 0) later(BOSS.lostDelayMs, () => my === session && set({ phase: 'lost' }))
    }
  },

  next: () => {
    const s = get()
    if (s.phase !== 'answered' || s.hp === 0 || s.hearts === 0) return
    const [cur, ...rest] = s.queue
    // A missed question comes back later; a beaten one is gone.
    const queue = s.lastHit === 'miss' && cur ? [...rest, cur] : rest
    if (queue.length === 0) return
    set({ phase: 'ask', queue, picked: null, result: null, lastHit: null })
  },

  // Out of hearts: same boss, full hearts. The boss keeps the damage dealt.
  retry: () => {
    const s = get()
    if (s.phase !== 'lost') return
    const [cur, ...rest] = s.queue
    const queue = cur && s.lastHit === 'miss' ? [...rest, cur] : s.queue
    set({ phase: 'ask', queue, hearts: BOSS.hearts, streak: 0, picked: null, result: null, lastHit: null })
  },

  backToTopics: () => {
    session++
    clearTimers()
    set({ phase: get().doc ? 'pickTopic' : 'pickDoc', topic: null, ...FIGHT_RESET, queue: [] })
  },
}))
