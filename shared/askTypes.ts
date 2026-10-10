import { notesTabs } from './lessonNotes.ts'

// The /api/ask contract, shared by the browser client (src/lesson/askGemini.ts)
// and the Vite server plugin (server/geminiProxy.ts). Keep it free of browser
// and node APIs, and of imports from src/ or server/, so both sides can use it.

// Clips Gemini may pick to go with an answer. Loops play for the length of the
// answer; one-shots fire once while he talks.
export const ASK_GESTURES = ['talk', 'point_left', 'point_right', 'hop', 'celebrate', 'shrug', 'think'] as const
export type AskGesture = (typeof ASK_GESTURES)[number]

export const ASK_FOCUS = ['notes', 'board', 'none'] as const

// Every highlightable line in the notes window, with the tab it lives on.
export const ASK_LINES = notesTabs.flatMap((tab, tabIndex) =>
  tab.lines.map((line) => ({ id: line.id, tabIndex, tab: tab.title, text: line.cells ? line.cells.join(' | ') : line.text })),
)

export const ASK_LIMITS = {
  question: 500, // characters
  context: 1500, // characters per context field
  history: 6, // most recent turns sent upstream
  historyText: 400, // characters per history turn
  answer: 600, // characters kept from the model's answer
} as const

export interface AskTurn {
  who: 'student' | 'tutor'
  text: string
}

export interface AskRequest {
  question: string
  context: { step: string; notes: string; board: string }
  history?: AskTurn[]
}

export interface AskReply {
  answer: string
  gesture: AskGesture
  focus: (typeof ASK_FOCUS)[number]
  highlight: string | null
  model?: string
}

// Coerces anything (model output, a stale server) into a safe AskReply, or null.
export function sanitizeReply(raw: unknown): AskReply | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const answer = typeof r.answer === 'string' ? r.answer.trim().slice(0, ASK_LIMITS.answer) : ''
  if (!answer) return null
  const gesture = ASK_GESTURES.includes(r.gesture as AskGesture) ? (r.gesture as AskGesture) : 'talk'
  const focus = ASK_FOCUS.includes(r.focus as AskReply['focus']) ? (r.focus as AskReply['focus']) : 'none'
  const highlight = ASK_LINES.some((l) => l.id === r.highlight) ? (r.highlight as string) : null
  const model = typeof r.model === 'string' ? r.model : undefined
  return { answer, gesture, focus, highlight, ...(model ? { model } : {}) }
}
