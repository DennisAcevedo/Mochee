import { create } from 'zustand'
import type { TeachBackChallenge, TeachBackResult } from '../../shared/teachBack'
import { TEACH_BACK_LIMITS } from '../../shared/teachBack'
import { useProgress } from '../state/progress'
import { gradeTeachBack, startTeachBack } from '../ui/Drawers/docsClient'

interface Practice {
  documentId: string
  draft: string
  challenge: TeachBackChallenge | null
  result: TeachBackResult | null
  phase: 'preparing' | 'writing' | 'grading' | 'review' | 'error'
  error: string | null
  requestId: string
  submission?: { text: string; attemptId: string }
  earnedCoins: number
}

interface TeachBackState {
  inputMode: 'voice' | 'text'
  setInputMode: (mode: 'voice' | 'text') => void
  spokenFeedback: boolean
  setSpokenFeedback: (enabled: boolean) => void
  selectedTopic: string | null
  practices: Record<string, Practice>
  select: (topicId: string) => void
  start: (documentId: string, topicId: string) => Promise<void>
  edit: (topicId: string, draft: string) => void
  revise: (topicId: string) => void
  grade: (topicId: string) => Promise<void>
  forgetDocument: (documentId: string) => void
}

// Kept in memory so reading a cited page or changing tools doesn't lose a draft.
// Only the earned-coin ledger is persisted; student explanations stay out of localStorage.
export const useTeachBack = create<TeachBackState>((set, get) => {
  const update = (topicId: string, change: Partial<Practice>) => set((s) => {
    const previous = s.practices[topicId]
    return previous ? { practices: { ...s.practices, [topicId]: { ...previous, ...change } } } : {}
  })
  return {
    inputMode: 'voice',
    setInputMode: (inputMode) => set({ inputMode }),
    spokenFeedback: true,
    setSpokenFeedback: (spokenFeedback) => set({ spokenFeedback }),
    selectedTopic: null,
    practices: {},
    select: (selectedTopic) => set({ selectedTopic }),
    start: async (documentId, topicId) => {
      const previous = get().practices[topicId]
      if (previous && (previous.challenge || previous.phase === 'preparing')) return
      const requestId = crypto.randomUUID()
      set((s) => ({ practices: { ...s.practices, [topicId]: {
        documentId, draft: previous?.draft ?? '', challenge: null, result: null,
        phase: 'preparing', error: null, requestId, earnedCoins: 0,
      } } }))
      const response = await startTeachBack(documentId, topicId)
      if (get().practices[topicId]?.requestId !== requestId) return
      update(topicId, response.ok ? { challenge: response.data, phase: 'writing' } : { error: response.error, phase: 'error' })
    },
    edit: (topicId, draft) => {
      const p = get().practices[topicId]
      if (!p || p.phase === 'grading') return
      update(topicId, { draft: draft.slice(0, TEACH_BACK_LIMITS.maxChars), error: null })
    },
    revise: (topicId) => update(topicId, { phase: 'writing', error: null }),
    grade: async (topicId) => {
      const p = get().practices[topicId]
      if (!p?.challenge || p.phase === 'grading') return
      const text = p.draft.trim()
      if (text.length < TEACH_BACK_LIMITS.minChars || text.length > TEACH_BACK_LIMITS.maxChars) return
      // Retrying after a network failure reuses the same id; the server returns the saved grade.
      const submission = p.submission?.text === text ? p.submission : { text, attemptId: crypto.randomUUID() }
      const requestId = crypto.randomUUID()
      update(topicId, { phase: 'grading', error: null, submission, requestId })
      const response = await gradeTeachBack({ sessionId: p.challenge.id, attemptId: submission.attemptId, explanation: text })
      if (get().practices[topicId]?.requestId !== requestId) return
      if (!response.ok) {
        update(topicId, { phase: 'writing', error: response.error })
        return
      }
      const earnedCoins = useProgress.getState().awardTeachBack(topicId, response.data.score)
      update(topicId, { phase: 'review', result: response.data, earnedCoins })
    },
    forgetDocument: (documentId) => set((s) => ({
      practices: Object.fromEntries(Object.entries(s.practices).filter(([, p]) => p.documentId !== documentId)),
      selectedTopic: s.selectedTopic && s.practices[s.selectedTopic]?.documentId === documentId ? null : s.selectedTopic,
    })),
  }
})
