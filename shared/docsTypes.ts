import type { AskGesture } from './askTypes.ts'

// Contract between the document-grounded backend (server/docs/**) and the UI.
// Files (UPLOAD_FORMATS) are uploaded, read into page text (a scan or an image
// is read by Gemini), split into page-numbered chunks, indexed with SQLite FTS5,
// and every tutor answer cites exact quotes the server has checked against the
// stored text. The client never receives quiz answers before it submits.

export const DOCS_ROUTES = {
  health: '/api/health', // GET -> Health
  documents: '/api/documents', // GET -> DocumentInfo[]; POST raw file bytes (x-filename, x-tutor-id, x-doc-kind headers) -> DocumentInfo
  document: (documentId: string) => `/api/documents/${encodeURIComponent(documentId)}`, // DELETE -> { ok: true }
  page: (documentId: string, page: number) => `/api/documents/${encodeURIComponent(documentId)}/pages/${page}`, // GET -> PageText
  file: (documentId: string) => `/api/documents/${encodeURIComponent(documentId)}/file`, // GET -> the original upload: inline for PDF, text and images, a download otherwise
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

// Every file type an upload can be, keyed by the extension it is stored under.
// `types` are the content types a browser may label it with; an unlabelled file
// ('' or application/octet-stream, common for .md and .docx) is judged by its
// extension, and the server checks its magic bytes either way.
export const UPLOAD_FORMATS = {
  pdf: { label: 'PDF', types: ['application/pdf'] },
  docx: { label: 'DOCX', types: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  pptx: { label: 'PPTX', types: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'] },
  txt: { label: 'TXT', types: ['text/plain'] },
  md: { label: 'MD', types: ['text/markdown', 'text/x-markdown', 'text/plain'] },
  html: { label: 'HTML', types: ['text/html'] },
  png: { label: 'PNG', types: ['image/png'] },
  jpg: { label: 'JPG', types: ['image/jpeg'] },
  webp: { label: 'WEBP', types: ['image/webp'] },
} as const satisfies Record<string, { label: string; types: readonly string[] }>

export type UploadFormat = keyof typeof UPLOAD_FORMATS

// File extension (lower case, no dot) -> format.
export const UPLOAD_EXTENSIONS: Readonly<Record<string, UploadFormat>> = {
  pdf: 'pdf',
  docx: 'docx',
  pptx: 'pptx',
  txt: 'txt',
  md: 'md',
  markdown: 'md',
  html: 'html',
  htm: 'html',
  png: 'png',
  jpg: 'jpg',
  jpeg: 'jpg',
  webp: 'webp',
}

// The file pickers' accept attribute.
export const UPLOAD_ACCEPT = [
  ...Object.keys(UPLOAD_EXTENSIONS).map((e) => `.${e}`),
  ...new Set(Object.values(UPLOAD_FORMATS).flatMap((f) => f.types)),
].join(',')

const UNLABELLED = new Set(['', 'application/octet-stream'])
const typesOf = (f: UploadFormat): readonly string[] => UPLOAD_FORMATS[f].types

// The format of an upload from its name and content type: the extension
// decides, and a specific content type that names another format is refused
// (null). A name without an extension falls back to the content type.
export function uploadFormat(filename: string, contentType: string): UploadFormat | null {
  const type = contentType.split(';')[0].trim().toLowerCase()
  const ext = /\.([a-z0-9]{1,8})$/i.exec(filename.trim())?.[1]?.toLowerCase()
  if (ext) {
    const byExt = UPLOAD_EXTENSIONS[ext]
    return byExt && (UNLABELLED.has(type) || typesOf(byExt).includes(type)) ? byExt : null
  }
  return (Object.keys(UPLOAD_FORMATS) as UploadFormat[]).find((f) => typesOf(f)[0] === type) ?? null
}

// A file icon's label from a filename or a stored extension: 'notes.docx' or
// 'docx' -> 'DOCX'; anything unknown -> 'FILE'.
export function formatLabel(nameOrExt: string): string {
  const format = UPLOAD_EXTENSIONS[nameOrExt.slice(nameOrExt.lastIndexOf('.') + 1).toLowerCase()]
  return format ? UPLOAD_FORMATS[format].label : 'FILE'
}

// What a document is studied as. A class document is taught topic by topic;
// a research paper is walked through as question, method, data, results and
// limitations. Sent as the x-doc-kind upload header; rows from before kinds
// existed read as 'class'.
export const DOC_KINDS = ['class', 'paper'] as const
export type DocKind = (typeof DOC_KINDS)[number]
export const DEFAULT_DOC_KIND: DocKind = 'class'

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
  tutorId: string // the class (Tutor.id) it belongs to; see shared/lessonPack.ts DEFAULT_TUTOR_ID
  original: string // extension of the stored original served at DOCS_ROUTES.file: an UploadFormat key ('txt' also for a lecture transcript)
  kind: DocKind
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
  error: string // short code: bad-request, too-large, not-pdf, unsupported, bad-file, not-audio, no-text, no-key, upstream, timeout, not-found, conflict, forbidden, method, internal
  status?: number
}
