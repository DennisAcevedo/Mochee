import {
  DEFAULT_DOC_KIND,
  DOCS_LIMITS,
  DOCS_ROUTES,
  uploadFormat,
  type ApiError,
  type DocKind,
  type ChatRequest,
  type DocumentInfo,
  type GroundedAnswer,
  type PageText,
  type QuizResult,
  type QuizSet,
  type QuizSubmit,
} from '../../../shared/docsTypes'
import { DEFAULT_TUTOR_ID, STUDY_LIMITS, STUDY_ROUTES, type LessonPack } from '../../../shared/lessonPack'

// Browser client for the documents backend (server/docs/**). Every call
// resolves to { ok, data } or { ok: false, error } with a short code, never
// throws. A route that 404s, or the dev server's HTML fallback answering in
// place of JSON, reads as 'not-ready': the backend isn't mounted yet.

const CLIENT = {
  timeoutMs: 20_000,
  chatTimeoutMs: 30_000,
  uploadTimeoutMs: 240_000, // a scan or an image is read by Gemini during the upload (server cap 150 s)
  lessonTimeoutMs: 60_000,
  lectureTimeoutMs: 180_000,
} as const

export type DocsErrorCode = ApiError['error'] | 'not-ready' | 'offline'

export type DocsResult<T> = { ok: true; data: T } | { ok: false; error: DocsErrorCode }

// What the drawers say for each failure. Short, plain, no blame.
export const ERROR_TEXT: Record<string, string> = {
  'not-ready': "The documents backend isn't running yet.",
  offline: "Can't reach the server. Check the dev server is up.",
  'not-pdf': "That file isn't a working PDF. Try exporting it again.",
  unsupported: "That file type can't be read. Try PDF, Word, PowerPoint, text, Markdown, HTML or an image.",
  'bad-file': "That file looks damaged or isn't what its name says. Try saving it again.",
  'too-large': `That file is too big (over ${Math.round(DOCS_LIMITS.maxUploadBytes / 1024 / 1024)} MB or too many pages). Try a smaller one.`,
  'no-key': 'Gemini isn’t set up on the server, so this needs an API key.',
  'bad-request': 'The server could not read that request.',
  upstream: 'Gemini had a hiccup. Try again in a moment.',
  timeout: 'That took too long. Try again.',
  'not-found': "That document or page doesn't exist any more.",
  internal: 'Something broke on the server. Try again.',
  'no-text': 'Nothing readable was found in that file.',
  conflict: 'That answer was already sent differently. Get a new question.',
  method: 'The server does not take that request.',
  forbidden: 'The server refused a request from another site.',
  'not-audio': 'That recording format is not supported. Try webm, ogg, wav, mp3, m4a or mp4 audio.',
}

export const errorText = (code: string) => ERROR_TEXT[code] ?? ERROR_TEXT.internal

function codeFrom(status: number, body: unknown): DocsErrorCode {
  const code = (body as Partial<ApiError> | null)?.error
  if (typeof code === 'string' && code) return code as DocsErrorCode
  if (status === 404) return 'not-ready'
  if (status === 413) return 'too-large'
  if (status === 415) return 'unsupported'
  if (status === 504) return 'timeout'
  return 'internal'
}

const isJson = (res: Response) => (res.headers.get('content-type') ?? '').includes('application/json')

async function request<T>(url: string, init: RequestInit = {}, timeoutMs: number = CLIENT.timeoutMs): Promise<DocsResult<T>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, headers: { accept: 'application/json', ...init.headers }, signal: ctrl.signal })
    // Vite's SPA fallback answers unknown GETs with index.html (200): not mounted yet.
    if (!isJson(res)) return { ok: false, error: res.ok || res.status === 404 ? 'not-ready' : codeFrom(res.status, null) }
    const body: unknown = await res.json()
    if (!res.ok) return { ok: false, error: codeFrom(res.status, body) }
    return { ok: true, data: body as T }
  } catch (err) {
    return { ok: false, error: (err as Error).name === 'AbortError' ? 'timeout' : 'offline' }
  } finally {
    clearTimeout(timer)
  }
}

const postJson = <T>(url: string, body: unknown, timeoutMs?: number) =>
  request<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs)

// No tutorId = every class (back-compat); with one = that class only.
export const listDocuments = (tutorId?: string) =>
  request<DocumentInfo[]>(tutorId ? `${DOCS_ROUTES.documents}?tutorId=${encodeURIComponent(tutorId)}` : DOCS_ROUTES.documents)
// Built on the first call (one Gemini call, or an outline from the pages), cached after.
export const fetchLessonPack = (documentId: string) =>
  postJson<LessonPack>(STUDY_ROUTES.lesson(documentId), {}, CLIENT.lessonTimeoutMs)
export const fetchPage = (documentId: string, page: number) => request<PageText>(DOCS_ROUTES.page(documentId, page))
export const askDocument = (req: ChatRequest) => postJson<GroundedAnswer>(DOCS_ROUTES.chat, req, CLIENT.chatTimeoutMs)
export const fetchQuiz = (documentId: string, topicId?: string) =>
  postJson<QuizSet>(DOCS_ROUTES.quiz, topicId ? { documentId, topicId } : { documentId }, CLIENT.chatTimeoutMs)
export const submitQuiz = (submit: QuizSubmit) => postJson<QuizResult>(DOCS_ROUTES.quizSubmit, submit)

// Client-side checks before any bytes leave the browser (the same format rule
// as the server: the extension decides, a contradicting type is refused).
export function checkFile(file: File): DocsErrorCode | null {
  if (!uploadFormat(file.name, file.type)) return /\.pdf$/i.test(file.name) ? 'not-pdf' : 'unsupported'
  if (file.size > DOCS_LIMITS.maxUploadBytes) return 'too-large'
  return null
}

// Raw file bytes, with upload progress (fetch has none, so XHR). `kind` picks
// how the server builds the lesson: class material or a research paper.
export function uploadFile(
  file: File,
  onProgress: (fraction: number) => void,
  tutorId: string = DEFAULT_TUTOR_ID,
  kind: DocKind = DEFAULT_DOC_KIND,
): Promise<DocsResult<DocumentInfo>> {
  const early = checkFile(file)
  if (early) return Promise.resolve({ ok: false, error: early })
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', DOCS_ROUTES.documents)
    xhr.timeout = CLIENT.uploadTimeoutMs
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('accept', 'application/json')
    // Header values must be ASCII: non-ASCII names travel percent-encoded.
    xhr.setRequestHeader('x-filename', encodeURIComponent(file.name))
    xhr.setRequestHeader('x-tutor-id', encodeURIComponent(tutorId))
    xhr.setRequestHeader('x-doc-kind', kind)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      let body: unknown = null
      const json = (xhr.getResponseHeader('content-type') ?? '').includes('application/json')
      try {
        body = json ? JSON.parse(xhr.responseText) : null
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && json) resolve({ ok: true, data: body as DocumentInfo })
      else resolve({ ok: false, error: json ? codeFrom(xhr.status, body) : xhr.status === 413 ? 'too-large' : 'not-ready' })
    }
    xhr.onerror = () => resolve({ ok: false, error: 'offline' })
    xhr.ontimeout = () => resolve({ ok: false, error: 'timeout' })
    xhr.send(file)
  })
}

// A recorded lecture: raw audio bytes -> the transcript saved as a document in that class.
export async function uploadLecture(blob: Blob, tutorId: string, filename: string): Promise<DocsResult<DocumentInfo>> {
  if (blob.size === 0) return { ok: false, error: 'bad-request' }
  if (blob.size > STUDY_LIMITS.maxAudioBytes) return { ok: false, error: 'too-large' }
  const type = (blob.type || 'audio/webm').toLowerCase()
  if (!/^audio\/(webm|ogg|wav|x-wav|wave|vnd\.wave|mp4|m4a|x-m4a|mpeg|mp3|x-mp3|aac|x-aac|flac|x-flac)(;|$)/.test(type)) return { ok: false, error: 'not-audio' }
  return request<DocumentInfo>(
    STUDY_ROUTES.lectures,
    {
      method: 'POST',
      headers: { 'content-type': type, 'x-tutor-id': encodeURIComponent(tutorId), 'x-filename': encodeURIComponent(filename) },
      body: blob,
    },
    CLIENT.lectureTimeoutMs,
  )
}
