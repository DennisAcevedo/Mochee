import { create } from 'zustand'
import { DOCS_LIMITS, type GroundedAnswer } from '../../../shared/docsTypes'
import { askDocument, type DocsErrorCode } from './docsClient'
import { performAnswer } from './tutorCues'

// Grounded chat history per uploaded document, kept while the page is open so
// switching tabs or documents never loses the conversation.

const CHAT = {
  keepTurns: 40, // per document
} as const

export interface ChatTurn {
  id: number
  who: 'student' | 'tutor'
  text: string
  answer?: GroundedAnswer
  error?: DocsErrorCode
}

interface ChatState {
  logs: Record<string, ChatTurn[]>
  pending: Record<string, boolean>
  send: (documentId: string, question: string) => Promise<void>
}

let nextId = 1

export const useChat = create<ChatState>((set, get) => ({
  logs: {},
  pending: {},

  send: async (documentId, raw) => {
    const question = raw.trim().slice(0, DOCS_LIMITS.maxQuestionChars)
    if (!question || get().pending[documentId]) return
    const push = (turn: Omit<ChatTurn, 'id'>) =>
      set((s) => ({ logs: { ...s.logs, [documentId]: [...(s.logs[documentId] ?? []), { ...turn, id: nextId++ }].slice(-CHAT.keepTurns) } }))
    push({ who: 'student', text: question })
    set((s) => ({ pending: { ...s.pending, [documentId]: true } }))
    const res = await askDocument({ documentId, question })
    set((s) => ({ pending: { ...s.pending, [documentId]: false } }))
    if (!res.ok) {
      push({ who: 'tutor', text: '', error: res.error })
      return
    }
    push({ who: 'tutor', text: res.data.answer, answer: res.data })
    performAnswer(res.data)
  },
}))
