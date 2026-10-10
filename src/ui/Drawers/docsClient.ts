import {
  DOCS_LIMITS,
  DOCS_ROUTES,
  type ApiError,
  type ChatRequest,
  type DocumentInfo,
  type GroundedAnswer,
  type PageText,
  type QuizResult,
  type QuizSet,
  type QuizSubmit,
} from '../../lesson/docsTypes'

// Browser client for the documents backend (server/docs/**). Every call
// resolves to { ok, data } or { ok: false, error } with a short code, never
// throws. A route that 404s, or the dev server's HTML fallback answering in
// place of JSON, reads as 'not-ready': the backend isn't mounted yet.

const CLIENT = {
  timeoutMs: 20_000,
  chatTimeoutMs: 30_000,
  uploadTimeoutMs: 120_000,
} as const

export type DocsErrorCode = ApiError['error'] | 'not-ready' | 'offline'

export type DocsResult<T> = { ok: true; data: T } | { ok: false; error: DocsErrorCode }

// What the drawers say for each failure. Short, plain, no blame.
export const ERROR_TEXT: Record<string, string> = {
  'not-ready': "The documents backend isn't running yet.",
  offline: "Can't reach the server. Check the dev server is up.",
  'not-pdf': "That file isn't a PDF. Try a .pdf export of your notes.",
  'too-large': `That PDF is over ${Math.round(DOCS_LIMITS.maxUploadBytes / 1024 / 1024)} MB. Try a smaller one.`,
  'no-key': 'Gemini isn’t set up on the server, so this needs an API key.',
  'bad-request': 'The server could not read that request.',
  upstream: 'Gemini had a hiccup. Try again in a moment.',
  timeout: 'That took too long. Try again.',
  'not-found': "That document or page doesn't exist any more.",
  internal: 'Something broke on the server. Try again.',
  'no-text': 'That PDF has no text layer (a scan?), so there is nothing to read.',
  conflict: 'That answer was already sent differently. Get a new question.',
  method: 'The server does not take that request.',
  forbidden: 'The server refused a request from another site.',
}

export const errorText = (code: string) => ERROR_TEXT[code] ?? ERROR_TEXT.internal

function codeFrom(status: number, body: unknown): DocsErrorCode {
  const code = (body as Partial<ApiError> | null)?.error
  if (typeof code === 'string' && code) return code as DocsErrorCode
  if (status === 404) return 'not-ready'
  if (status === 413) return 'too-large'
  if (status === 415) return 'not-pdf'
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

export const listDocuments = () => request<DocumentInfo[]>(DOCS_ROUTES.documents)
export const fetchPage = (documentId: string, page: number) => request<PageText>(DOCS_ROUTES.page(documentId, page))
export const askDocument = (req: ChatRequest) => postJson<GroundedAnswer>(DOCS_ROUTES.chat, req, CLIENT.chatTimeoutMs)
export const fetchQuiz = (documentId: string, topicId?: string) =>
  postJson<QuizSet>(DOCS_ROUTES.quiz, topicId ? { documentId, topicId } : { documentId }, CLIENT.chatTimeoutMs)
export const submitQuiz = (submit: QuizSubmit) => postJson<QuizResult>(DOCS_ROUTES.quizSubmit, submit)

// Client-side checks before any bytes leave the browser.
export function checkPdf(file: File): DocsErrorCode | null {
  const pdfName = file.name.toLowerCase().endsWith('.pdf')
  if (file.type !== 'application/pdf' && !pdfName) return 'not-pdf'
  if (file.size > DOCS_LIMITS.maxUploadBytes) return 'too-large'
  return null
}

// Raw PDF bytes, with upload progress (fetch has none, so XHR).
export function uploadPdf(file: File, onProgress: (fraction: number) => void): Promise<DocsResult<DocumentInfo>> {
  const early = checkPdf(file)
  if (early) return Promise.resolve({ ok: false, error: early })
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', DOCS_ROUTES.documents)
    xhr.timeout = CLIENT.uploadTimeoutMs
    xhr.setRequestHeader('content-type', 'application/pdf')
    xhr.setRequestHeader('accept', 'application/json')
    // Header values must be ASCII: non-ASCII names travel percent-encoded.
    xhr.setRequestHeader('x-filename', encodeURIComponent(file.name))
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
