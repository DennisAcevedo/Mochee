import type { Citation } from './docsTypes.ts'

export const TEACH_BACK_ROUTES = { start: '/api/teach-back/start', grade: '/api/teach-back/grade', transcribe: '/api/teach-back/transcribe' } as const
export const TEACH_BACK_LIMITS = { minChars: 60, maxChars: 3000, maxCoins: 50, maxAudioBytes: 4 * 1024 * 1024, maxRecordingSeconds: 120 } as const

export interface TeachBackChallenge {
  id: string
  documentId: string
  topicId: string
  topicTitle: string
  prompt: string
  firstPage: number
}

export type TeachBackVerdict = 'correct' | 'partial' | 'missing' | 'incorrect'
export interface TeachBackFeedback {
  concept: string
  status: TeachBackVerdict
  feedback: string
  studentQuote: string
  citation: Citation
}

export interface TeachBackResult {
  attemptId: string
  sessionId: string
  documentId: string
  topicId: string
  score: number
  summary: string
  items: TeachBackFeedback[]
  nextQuestion: string
}

export interface TeachBackSubmission {
  sessionId: string
  attemptId: string
  explanation: string
}
