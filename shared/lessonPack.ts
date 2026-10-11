// Contract for per-class materials, per-PDF tutor sessions and recorded lectures.
// server/docs/** implements these routes; src/ consumes them.

// Every document belongs to one class (Tutor.id in src/state/library.ts).
// GET /api/documents?tutorId=<id> lists that class only; POST /api/documents
// takes an x-tutor-id header. Rows saved before classes existed belong to
// DEFAULT_TUTOR_ID, so nothing already uploaded disappears.
export const DEFAULT_TUTOR_ID = 'cs111'

export const STUDY_ROUTES = {
  // POST, empty body -> LessonPack. Built on the first call, then cached per document.
  lesson: (documentId: string) => `/api/documents/${encodeURIComponent(documentId)}/lesson`,
  // POST raw audio bytes (content-type audio/webm | audio/ogg | audio/wav | audio/mp4,
  // headers x-tutor-id and x-filename) -> DocumentInfo: the transcript saved as a document.
  lectures: '/api/lectures',
} as const

export const STUDY_LIMITS = {
  maxAudioBytes: 12 * 1024 * 1024,
  maxSections: 6,
} as const

export interface LessonLine {
  text: string
  page: number // the page this line comes from
}

export interface LessonSection {
  title: string // the topic title
  topicId: string | null
  page: number // first page of the topic
  mins: number // 2-8
  say: string[] // 2-4 short spoken lines, grounded in the pages
  notes: { head: string; lines: LessonLine[] } // 2-4 lines for the notes window
  board: { head: string; lines: string[] } // 1-3 short board lines (rule, formula, worked example)
}

export interface LessonPack {
  documentId: string
  title: string
  sections: LessonSection[] // one per topic, in order, at most STUDY_LIMITS.maxSections
  checkQuestionIds: string[] // the Quick check reuses the document's stored quiz questions
  source: 'gemini' | 'outline' // outline = no Gemini key: built from the topics and page text alone
  createdAt: string // ISO
}
