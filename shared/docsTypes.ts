import type { AskGesture } from './askTypes.ts'

// Contract between the document-grounded backend (server/docs/**) and the UI.
// PDFs are uploaded, split into page-numbered chunks, indexed with SQLite FTS5,
// and every tutor answer cites exact quotes the server has checked against the
// stored text. The client never receives quiz answers before it submits.

export const DOCS_ROUTES = {
  health: '/api/health', // GET -> Health
  documents: '/api/documents', // GET -> DocumentInfo[]; POST raw PDF bytes (content-type application/pdf, x-filename header) -> DocumentInfo
  page: (documentId: string, page: number) => `/api/documents/${encodeURIComponent(documentId)}/pages/${page}`, // GET -> PageText
  chat: '/api/tutor/chat', // POST ChatRequest -> GroundedAnswer
  quiz: '/api/quiz', // POST { documentId, topicId? } -> QuizSet
  quizSubmit: '/api/quiz/submit', // POST QuizSubmit -> QuizResult
} as const

export const DOCS_LIMITS = {
  maxUploadBytes: 15 * 1024 * 1024,
  maxPages: 300,
  chunkMinChars: 700,
  chunkMaxChars: 1200,
  chunkOverlapChars: 120,
  topK: 5, // passages retrieved per question
  maxQuestionChars: 600,
} as const

export interface Health {
  ok: true
  geminiConfigured: boolean
  voiceConfigured: boolean
}

export interface TopicInfo {
  id: string
  documentId: string
  title: string // short, e.g. "First-come, first-served"
  keywords: string[] // 2-5 key terms, used for posters in the room
  firstPage: number
}

export interface DocumentInfo {
  id: string
  title: string
  pageCount: number
  createdAt: string // ISO
  topics: TopicInfo[]
}

export interface ChunkRef {
  id: string // `${documentId}:${page}:${startOffset}-${endOffset}`
  page: number
  startOffset: number
  endOffset: number
}

export interface PageText {
  documentId: string
  page: number
  text: string
  chunks: ChunkRef[]
}

export interface Citation {
  chunkId: string
  page: number
  quote: string // verified: contained (whitespace-normalised) in that chunk's stored text
}

export interface ChatRequest {
  documentId: string
  question: string
}

export interface GroundedAnswer {
  answer: string // 1-3 spoken-friendly sentences, **bold** allowed
  citations: Citation[] // empty only when abstained
  cue: AskGesture // animation cue for the tutor
  confidence: 'high' | 'medium' | 'low'
  nextQuestion: string | null
  abstained: boolean // true = the document does not support an answer; say so honestly
  source: 'gemini' | 'demo' // demo = no API key: a clearly labelled offline answer
}

export interface QuizQuestion {
  id: string
  topicId: string
  prompt: string
  choices: string[] // multiple choice; the correct index stays on the server
  page: number // where the answer is; the citation itself proves the answer, so it arrives only in QuizResult
}

export interface QuizSet {
  documentId: string
  questions: QuizQuestion[]
}

export interface QuizSubmit {
  questionId: string
  choice: number
  attemptId: string // client-generated idempotency key
}

export interface QuizResult {
  correct: boolean
  firstTry: boolean
  correctChoice: number // revealed only after the submit
  explanation: string
  citation: Citation
  topicId: string
}

export interface ApiError {
  error: string // short code: bad-request, too-large, not-pdf, no-text, no-key, upstream, timeout, not-found, conflict, forbidden, method, internal
  status?: number
}
