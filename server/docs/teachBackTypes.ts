import type { Citation } from '../../shared/docsTypes.ts'
import type { TeachBackChallenge, TeachBackResult } from '../../shared/teachBack.ts'

export interface TeachBackSession extends TeachBackChallenge {
  criteria: { id: string; concept: string; expected: string; citation: Citation }[]
}

export interface TeachBackAttempt {
  attemptId: string
  sessionId: string
  explanationHash: string
  result: TeachBackResult
}
