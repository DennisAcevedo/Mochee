import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { DOCS_ROUTES } from '../../src/lesson/docsTypes.ts'
import { hasGeminiKey, hasVoiceKey, KEY_FILES, readGeminiKey } from '../keys.ts'
import { refuseCrossSite } from '../requestGuard.ts'
import { DOCS_CONFIG } from './config.ts'
import { hasPdfMagic } from './pdf.ts'
import { createDocsService, type DocsService, type Reply, type ServiceOptions } from './service.ts'
import { decodeFilename } from './text.ts'

// The documents backend on the dev and preview servers (routes in
// src/lesson/docsTypes.ts DOCS_ROUTES). Bodies are size-capped while they
// stream, errors are short codes, and the data dir and key files are never
// served: the dev server serves the repo root, so this plugin refuses them first.

export interface DocsMiddlewareOptions {
  root: string
  dataDir?: string // default <root>/.data
  maxUploadBytes?: number // default DOCS_LIMITS.maxUploadBytes (tests lower it)
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
  res.statusCode = reply.status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(reply.body))
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

async function upload(service: DocsService, req: IncomingMessage, maxBytes: number): Promise<Reply> {
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  const filename = decodeFilename(String(req.headers['x-filename'] ?? ''))
  if (type !== 'application/pdf' || !/\.pdf$/i.test(filename)) return { status: 415, body: { error: 'not-pdf' } }
  const bytes = await readBody(req, maxBytes)
  if (!hasPdfMagic(bytes)) return { status: 415, body: { error: 'not-pdf' } }
  return service.ingest(bytes, filename)
}

async function route(service: DocsService, root: string, maxBytes: number, req: IncomingMessage): Promise<Reply | null> {
  const path = (req.url ?? '').split('?')[0]
  const method = req.method ?? 'GET'
  const methodNotAllowed: Reply = { status: 405, body: { error: 'method' } }

  if (path === DOCS_ROUTES.health) {
    if (method !== 'GET') return methodNotAllowed
    return { status: 200, body: { ok: true, geminiConfigured: hasGeminiKey(root), voiceConfigured: hasVoiceKey(root) } }
  }
  if (path === DOCS_ROUTES.documents) {
    if (method === 'GET') return service.list()
    if (method === 'POST') return upload(service, req, maxBytes)
    return methodNotAllowed
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
  if (path.startsWith(`${DOCS_ROUTES.documents}/`)) return { status: 404, body: { error: 'not-found' } }
  if (path === DOCS_ROUTES.chat) return method === 'POST' ? service.chat(await readJson(req)) : methodNotAllowed
  if (path === DOCS_ROUTES.quiz) return method === 'POST' ? service.quiz(await readJson(req)) : methodNotAllowed
  if (path === DOCS_ROUTES.quizSubmit) return method === 'POST' ? service.submit(await readJson(req)) : methodNotAllowed
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

  const handler = (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = req.url ?? ''
    if (isForbiddenPath(url)) return send(res, { status: 404, body: { error: 'not-found' } })
    if (!url.startsWith('/api/')) return next()
    if (req.method === 'POST') {
      // Uploads check their own content type (application/pdf) in upload().
      const isUpload = url.split('?')[0] === DOCS_ROUTES.documents
      const refused = refuseCrossSite(req, isUpload ? null : 'application/json')
      if (refused) return send(res, { status: refused.status, body: { error: refused.error } })
    }
    route(getService(), options.root, maxBytes, req)
      .then((reply) => {
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
