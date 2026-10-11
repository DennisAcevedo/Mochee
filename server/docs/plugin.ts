import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { DOCS_ROUTES, uploadFormat } from '../../shared/docsTypes.ts'
import { STUDY_LIMITS, STUDY_ROUTES } from '../../shared/lessonPack.ts'
import { TEACH_BACK_LIMITS, TEACH_BACK_ROUTES } from '../../shared/teachBack.ts'
import { hasGeminiKey, hasVoiceKey, KEY_FILES, readGeminiKey } from '../keys.ts'
import { refuseCrossSite } from '../requestGuard.ts'
import { DOCS_CONFIG } from './config.ts'
import { hasMagic } from './formats.ts'
import { audioType } from './lecture.ts'
import { createDocsService, docKindFrom, needsGemini, refusedFormat, tutorIdFrom, type DocsService, type Reply, type ServiceOptions } from './service.ts'
import { decodeFilename } from './text.ts'

// The documents backend on the dev and preview servers (routes in
// shared/docsTypes.ts DOCS_ROUTES). Bodies are size-capped while they
// stream, errors are short codes, and the data dir and key files are never
// served: the dev server serves the repo root, so this plugin refuses them first.

export interface DocsMiddlewareOptions {
  root: string
  dataDir?: string // default <root>/.data
  maxUploadBytes?: number // default DOCS_LIMITS.maxUploadBytes (tests lower it)
  maxAudioBytes?: number // default STUDY_LIMITS.maxAudioBytes (tests lower it)
  readKey?: ServiceOptions['readKey']
  gemini?: ServiceOptions['gemini']
}

class BodyError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

function send(res: ServerResponse, reply: Reply) {
  if (reply.file) return sendFile(res, reply.file)
  res.statusCode = reply.status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(reply.body))
}

// A stored original: inline so the browser's own viewer opens it (whole PDF,
// page jumps via #page=N; text; images), else a download (DOCX, PPTX, HTML).
// The sandbox CSP keeps a downloaded HTML page from ever running as this origin.
function sendFile(res: ServerResponse, file: NonNullable<Reply['file']>) {
  res.statusCode = 200
  res.setHeader('content-type', file.type)
  res.setHeader('content-length', statSync(file.path).size)
  res.setHeader('content-disposition', `${file.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`)
  if (!file.inline) res.setHeader('content-security-policy', 'sandbox')
  res.setHeader('cache-control', 'private, max-age=300')
  res.setHeader('x-content-type-options', 'nosniff')
  createReadStream(file.path)
    .on('error', () => res.destroy())
    .pipe(res)
}

// Buffers at most `limit` bytes. Past the limit it stops buffering at once and
// discards the rest (so the client finishes sending and can read the 413),
// up to drainBytes; a body bigger than that drops the connection.
function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > DOCS_CONFIG.drainBytes) {
      req.destroy()
      return reject(new BodyError(413, 'too-large'))
    }
    let size = 0
    let over = Number.isFinite(declared) && declared > limit
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > DOCS_CONFIG.drainBytes) {
        req.destroy()
        reject(new BodyError(413, 'too-large'))
        return
      }
      if (size > limit) over = true
      if (over) chunks.length = 0
      else chunks.push(chunk)
    })
    req.on('end', () => (over ? reject(new BodyError(413, 'too-large')) : resolve(Buffer.concat(chunks))))
    req.on('error', () => reject(new BodyError(400, 'bad-request')))
  })
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req, DOCS_CONFIG.maxJsonBytes)
  try {
    return JSON.parse(raw.toString('utf8')) as unknown
  } catch {
    throw new BodyError(400, 'bad-request')
  }
}

// Paths the dev server must never hand out: the data dir and the key files,
// however they are spelled (/@fs/ absolute paths, encoded dots, backslashes).
function isForbiddenPath(url: string): boolean {
  let path = url.split('?')[0]
  try {
    path = decodeURIComponent(path)
  } catch {
    return true
  }
  const p = path.replace(/\\/g, '/').toLowerCase()
  if (p.includes(`/${DOCS_CONFIG.dataDir}/`) || p.endsWith(`/${DOCS_CONFIG.dataDir}`)) return true
  return KEY_FILES.some((f) => p.endsWith(`/${f.toLowerCase()}`))
}

// Any accepted file (shared/docsTypes.ts UPLOAD_FORMATS). Format, class and
// kind are checked before any bytes are read; an image needs the key too.
async function upload(service: DocsService, req: IncomingMessage, maxBytes: number): Promise<Reply> {
  const type = String(req.headers['content-type'] ?? '')
  const filename = decodeFilename(String(req.headers['x-filename'] ?? ''))
  const format = uploadFormat(filename, type)
  if (!format) return { status: 415, body: { error: refusedFormat(filename, type, null) } }
  const tutorId = tutorIdFrom(headerOf(req, 'x-tutor-id'))
  const kind = docKindFrom(headerOf(req, 'x-doc-kind'))
  if (!tutorId || !kind) return { status: 400, body: { error: 'bad-request' } }
  if (needsGemini(format) && !service.hasKey()) {
    req.resume() // discard the body; the reply goes out with connection: close
    return { status: 503, body: { error: 'no-key' } }
  }
  const bytes = await readBody(req, maxBytes)
  if (!hasMagic(format, bytes)) return { status: 415, body: { error: refusedFormat(filename, type, format) } }
  return service.ingest(bytes, filename, tutorId, kind, type)
}

const headerOf = (req: IncomingMessage, name: string): string | undefined => {
  const v = req.headers[name]
  return Array.isArray(v) ? v[0] : v
}

// Raw audio -> transcript document. Type, class and key are checked before any bytes are read.
async function lectureUpload(service: DocsService, req: IncomingMessage, maxBytes: number): Promise<Reply> {
  const contentType = String(req.headers['content-type'] ?? '')
  if (!audioType(contentType)) return { status: 415, body: { error: 'not-audio' } }
  const tutorId = tutorIdFrom(headerOf(req, 'x-tutor-id'))
  if (!tutorId) return { status: 400, body: { error: 'bad-request' } }
  if (!service.hasKey()) {
    req.resume() // discard the body; the reply goes out with connection: close
    return { status: 503, body: { error: 'no-key' } }
  }
  const bytes = await readBody(req, maxBytes)
  return service.lecture(bytes, contentType, headerOf(req, 'x-filename') ?? '', tutorId)
}

async function route(service: DocsService, root: string, maxBytes: number, maxAudioBytes: number, req: IncomingMessage): Promise<Reply | null> {
  const [path, query = ''] = (req.url ?? '').split('?')
  const method = req.method ?? 'GET'
  const methodNotAllowed: Reply = { status: 405, body: { error: 'method' } }

  if (path === DOCS_ROUTES.health) {
    if (method !== 'GET') return methodNotAllowed
    return { status: 200, body: { ok: true, geminiConfigured: hasGeminiKey(root), voiceConfigured: hasVoiceKey(root) } }
  }
  if (path === DOCS_ROUTES.documents) {
    if (method === 'GET') {
      const raw = new URLSearchParams(query).get('tutorId')
      if (raw === null) return service.list()
      const tutorId = tutorIdFrom(raw)
      return tutorId && raw.trim() ? service.list(tutorId) : { status: 400, body: { error: 'bad-request' } }
    }
    if (method === 'POST') return upload(service, req, maxBytes)
    return methodNotAllowed
  }
  const document = /^\/api\/documents\/([^/]+)$/.exec(path)
  if (document) {
    if (method !== 'DELETE') return methodNotAllowed
    try {
      return service.remove(decodeURIComponent(document[1]))
    } catch (e) {
      if (e instanceof URIError) return { status: 400, body: { error: 'bad-request' } }
      throw e
    }
  }
  const page = /^\/api\/documents\/([^/]+)\/pages\/([^/]+)$/.exec(path)
  if (page) {
    if (method !== 'GET') return methodNotAllowed
    let id: string
    try {
      id = decodeURIComponent(page[1])
    } catch {
      return { status: 400, body: { error: 'bad-request' } }
    }
    return service.page(id, page[2])
  }
  const file = /^\/api\/documents\/([^/]+)\/file$/.exec(path)
  if (file) {
    if (method !== 'GET') return methodNotAllowed
    let id: string
    try {
      id = decodeURIComponent(file[1])
    } catch {
      return { status: 400, body: { error: 'bad-request' } }
    }
    return service.file(id)
  }
  const lesson = /^\/api\/documents\/([^/]+)\/lesson$/.exec(path)
  if (lesson) {
    if (method !== 'POST') return methodNotAllowed
    let id: string
    try {
      id = decodeURIComponent(lesson[1])
    } catch {
      return { status: 400, body: { error: 'bad-request' } }
    }
    return service.lesson(id)
  }
  if (path === STUDY_ROUTES.lectures) return method === 'POST' ? lectureUpload(service, req, maxAudioBytes) : methodNotAllowed
  if (path.startsWith(`${DOCS_ROUTES.documents}/`)) return { status: 404, body: { error: 'not-found' } }
  if (path === DOCS_ROUTES.chat) return method === 'POST' ? service.chat(await readJson(req)) : methodNotAllowed
  if (path === DOCS_ROUTES.quiz) return method === 'POST' ? service.quiz(await readJson(req)) : methodNotAllowed
  if (path === DOCS_ROUTES.quizSubmit) return method === 'POST' ? service.submit(await readJson(req)) : methodNotAllowed
  if (path === TEACH_BACK_ROUTES.start) return method === 'POST' ? service.teachBackStart(await readJson(req)) : methodNotAllowed
  if (path === TEACH_BACK_ROUTES.grade) return method === 'POST' ? service.teachBackGrade(await readJson(req)) : methodNotAllowed
  if (path === TEACH_BACK_ROUTES.transcribe) {
    if (method !== 'POST') return methodNotAllowed
    const type = String(req.headers['content-type'] ?? '')
    if (!audioType(type)) return { status: 415, body: { error: 'not-audio' } }
    if (!service.hasKey()) { req.resume(); return { status: 503, body: { error: 'no-key' } } }
    return service.teachBackTranscribe(await readBody(req, TEACH_BACK_LIMITS.maxAudioBytes), type)
  }
  return null
}

// Connect middleware for the documents API; also used directly by the tests.
export function docsMiddleware(options: DocsMiddlewareOptions): Connect.NextHandleFunction & { service: () => DocsService } {
  let service: DocsService | null = null
  const getService = () =>
    (service ??= createDocsService({
      dataDir: options.dataDir ?? join(options.root, DOCS_CONFIG.dataDir),
      readKey: options.readKey ?? (() => readGeminiKey(options.root)),
      gemini: options.gemini,
    }))
  const maxBytes = options.maxUploadBytes ?? DOCS_CONFIG.limits.maxUploadBytes
  const maxAudioBytes = options.maxAudioBytes ?? STUDY_LIMITS.maxAudioBytes

  const handler = (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = req.url ?? ''
    if (isForbiddenPath(url)) return send(res, { status: 404, body: { error: 'not-found' } })
    if (!url.startsWith('/api/')) return next()
    if (req.method === 'POST' || req.method === 'DELETE') {
      // Uploads check their own content type (an UPLOAD_FORMATS type in upload(), audio/* in lectureUpload()).
      const postPath = url.split('?')[0]
      const isUpload = postPath === DOCS_ROUTES.documents || postPath === STUDY_ROUTES.lectures || postPath === TEACH_BACK_ROUTES.transcribe
      const refused = refuseCrossSite(req, isUpload || req.method === 'DELETE' ? null : 'application/json')
      if (refused) return send(res, { status: refused.status, body: { error: refused.error } })
    }
    route(getService(), options.root, maxBytes, maxAudioBytes, req)
      .then((reply) => {
        if (reply?.status === 503) res.setHeader('connection', 'close')
        if (reply) send(res, reply)
        else next()
      })
      .catch((e: unknown) => {
        if (res.headersSent) return
        if (e instanceof BodyError) {
          if (e.status === 413) res.setHeader('connection', 'close')
          return send(res, { status: e.status, body: { error: e.code } })
        }
        send(res, { status: 500, body: { error: 'internal' } })
      })
  }
  return Object.assign(handler, { service: getService })
}

export function docsApi(): Plugin {
  let root = process.cwd()
  let mw: ReturnType<typeof docsMiddleware> | null = null
  const middleware = () => (mw ??= docsMiddleware({ root }))
  return {
    name: 'docs-api',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use(middleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware())
    },
  }
}
