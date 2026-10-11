import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { DEFAULT_DOC_KIND, DOC_KINDS, uploadFormat, type DocKind, type DocumentInfo, type PageText, type TopicInfo, type UploadFormat } from '../../shared/docsTypes.ts'
import { DEFAULT_TUTOR_ID, type LessonSection } from '../../shared/lessonPack.ts'
import { DOCS_CONFIG } from './config.ts'
import { FormatError, hasMagic, readLocal } from './formats.ts'
import { callGemini } from './gemini.ts'
import { audioType, isSilentPcmWav, lectureTitle, transcribe } from './lecture.ts'
import { lessonPack } from './lesson.ts'
import { paperWalkthrough } from './paper.ts'
import { extractPages, PdfError } from './pdf.ts'
import { buildQuiz, submitAnswer, ATTEMPT_ID, QUESTION_ID } from './quiz.ts'
import { openStore, type DocsStore, type DocumentRow } from './store.ts'
import { chunkPage, decodeFilename, titleFromFilename, type Chunk } from './text.ts'
import { extractTopics } from './topics.ts'
import { groundedChat, type GeminiFn } from './tutor.ts'
import { isScanned, readImage, readScannedPdf, type VisionOutcome } from './vision.ts'

// The documents backend as plain operations (no HTTP): ingest, list, page,
// chat, quiz, submit. Each returns { status, body } so plugin.ts only moves
// bytes, and the tests drive the same code without a server.

export const DOC_ID = /^[a-f0-9]{16}$/
export const TOPIC_ID = /^[a-f0-9]{16}-t\d{1,2}$/

export interface Reply {
  status: number
  body: unknown
  file?: { path: string; type: string; name: string; inline: boolean } // set = plugin.ts streams this file instead of JSON
}

export interface ServiceOptions {
  dataDir: string // absolute
  readKey: () => string | null // Gemini key, read per call; null = demo mode
  gemini?: GeminiFn // injectable for tests
}

const fail = (status: number, error: string): Reply => ({ status, body: { error } })
const extOf = (savedPath: string) => savedPath.slice(savedPath.lastIndexOf('.') + 1).toLowerCase()

// x-tutor-id header value -> a class id; missing = DEFAULT_TUTOR_ID, malformed = null.
export function tutorIdFrom(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null || raw.trim() === '') return DEFAULT_TUTOR_ID
  let id: string
  try {
    id = decodeURIComponent(raw).trim()
  } catch {
    return null
  }
  return DOCS_CONFIG.tutorIdPattern.test(id) ? id : null
}

// x-doc-kind header value -> a kind; missing = DEFAULT_DOC_KIND, anything else = null.
export function docKindFrom(raw: string | undefined | null): DocKind | null {
  const v = (raw ?? '').trim().toLowerCase()
  if (!v) return DEFAULT_DOC_KIND
  return (DOC_KINDS as readonly string[]).includes(v) ? (v as DocKind) : null
}

// The refusal for a file that is not (or does not look like) an accepted format:
// a PDF keeps its old code, everything else is unsupported / bad-file.
export function refusedFormat(filename: string, contentType: string, format: UploadFormat | null): string {
  const pdfish = format === 'pdf' || /\.pdf$/i.test(filename.trim()) || /^application\/pdf\b/i.test(contentType.trim())
  return pdfish ? 'not-pdf' : format ? 'bad-file' : 'unsupported'
}

const IMAGE_FORMATS = new Set<UploadFormat>(['png', 'jpg', 'webp'])
export const needsGemini = (format: UploadFormat) => IMAGE_FORMATS.has(format)

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function createDocsService(opts: ServiceOptions) {
  const uploadsDir = join(opts.dataDir, DOCS_CONFIG.uploadsDir)
  mkdirSync(uploadsDir, { recursive: true })
  const store: DocsStore = openStore(join(opts.dataDir, DOCS_CONFIG.dbFile))
  const gemini = opts.gemini ?? callGemini

  const info = (doc: DocumentRow): DocumentInfo => ({
    id: doc.id,
    title: doc.title,
    pageCount: doc.pageCount,
    createdAt: doc.createdAt,
    topics: store.topics(doc.id),
    tutorId: doc.tutorId,
    original: extOf(doc.savedPath),
    kind: doc.kind,
  })

  // The shared tail of every ingest (any file or a lecture): chunk, find topics,
  // save the original next to the db, store it all in one transaction. A paper
  // gets its topics and lesson pack from one walkthrough call (paper.ts); if
  // that fails it is indexed like class material and the pack is retried later.
  async function ingestPages(title: string, pages: string[], tutorId: string, original: { bytes: Uint8Array; ext: string }, kind: DocKind = DEFAULT_DOC_KIND): Promise<Reply> {
    const id = randomBytes(8).toString('hex')
    const savedPath = `${DOCS_CONFIG.uploadsDir}/${id}.${original.ext}`
    const chunks: Chunk[] = pages.flatMap((text, i) => chunkPage(id, i + 1, text))
    const key = opts.readKey()
    let topics: TopicInfo[] | null = null
    let walkthrough: LessonSection[] | null = null
    if (kind === 'paper' && key) {
      const pdf = original.ext === 'pdf' ? original.bytes : null
      const paper = await paperWalkthrough({ documentId: id, title, pages, pdf, key, gemini, timeoutMs: DOCS_CONFIG.paperTimeoutMs })
      if (paper) [topics, walkthrough] = [paper.topics, paper.sections]
    }
    topics ??= await extractTopics({ documentId: id, title, pages, key, gemini })
    const createdAt = new Date().toISOString()
    const doc: DocumentRow = { id, title, savedPath, pageCount: pages.length, createdAt, tutorId, kind }
    const file = join(uploadsDir, `${id}.${original.ext}`)
    writeFileSync(file, original.bytes, { flag: 'wx' })
    try {
      store.insertDocument(doc, pages, chunks, topics)
    } catch (e) {
      rmSync(file, { force: true })
      throw e
    }
    if (walkthrough) store.putLessonPack({ documentId: id, title, sections: walkthrough, checkQuestionIds: [], source: 'gemini', createdAt })
    return { status: 201, body: info(doc) }
  }

  // A stored original's bytes (path from the db row, kept inside the uploads dir).
  function originalBytes(doc: DocumentRow): Uint8Array | null {
    const path = resolve(opts.dataDir, doc.savedPath)
    if (!path.startsWith(resolve(uploadsDir) + sep) || !existsSync(path)) return null
    return readFileSync(path)
  }

  // Bytes of one format -> page text: locally, or by Gemini for an image or a
  // scanned PDF. Failures are { status, error } replies.
  async function readPages(format: UploadFormat, bytes: Uint8Array): Promise<{ pages: string[] } | Reply> {
    try {
      if (format === 'pdf') {
        const own = await extractPages(bytes)
        if (!isScanned(own)) return { pages: own }
        const key = opts.readKey()
        if (!key) return own.some(Boolean) ? { pages: own } : fail(503, 'no-key')
        return fromVision(await readScannedPdf({ bytes, textLayer: own, key, gemini }))
      }
      if (needsGemini(format)) {
        const key = opts.readKey()
        if (!key) return fail(503, 'no-key')
        return fromVision(await readImage({ bytes, mimeType: DOCS_CONFIG.imageMimeTypes[format], key, gemini }))
      }
      return { pages: readLocal(format as Parameters<typeof readLocal>[0], bytes) }
    } catch (e) {
      if (e instanceof PdfError) return fail(e.code === 'too-large' ? 413 : 415, e.code)
      if (e instanceof FormatError) return fail(e.code === 'too-large' ? 413 : 415, e.code)
      throw e
    }
  }
  const fromVision = (out: VisionOutcome): { pages: string[] } | Reply => (out.ok ? { pages: out.pages } : fail(out.status, out.error))

  return {
    store,
    close: () => store.close(),

    // Bytes already passed the size limit and magic check in plugin.ts; this
    // re-checks both, reads the pages, chunks, finds topics and stores everything.
    // The format comes from the filename's extension (and a content type, when given).
    async ingest(bytes: Uint8Array, filename: string, tutorId: string = DEFAULT_TUTOR_ID, kind: DocKind = DEFAULT_DOC_KIND, contentType = ''): Promise<Reply> {
      const name = decodeFilename(filename)
      const format = uploadFormat(name, contentType)
      if (!format || !hasMagic(format, bytes)) return fail(415, refusedFormat(name, contentType, format))
      const read = await readPages(format, bytes)
      if (!('pages' in read)) return read
      if (!read.pages.some((p) => p.length > 0)) return fail(422, 'no-text')
      return ingestPages(titleFromFilename(filename), read.pages, tutorId, { bytes, ext: format }, kind)
    },

    hasKey: () => !!opts.readKey(),

    // Audio bytes (size and type already checked in plugin.ts) -> transcript -> a document in that class.
    async lecture(bytes: Uint8Array, contentType: string, filename: string, tutorId: string): Promise<Reply> {
      const mimeType = audioType(contentType)
      if (!mimeType) return fail(415, 'not-audio')
      if (bytes.length === 0) return fail(400, 'bad-request')
      if (mimeType === 'audio/wav' && isSilentPcmWav(bytes)) return fail(422, 'no-text')
      const key = opts.readKey()
      if (!key) return fail(503, 'no-key')
      const out = await transcribe({ bytes, mimeType, key, gemini })
      if (!out.ok) return fail(out.status, out.error)
      return ingestPages(lectureTitle(filename), out.pages, tutorId, { bytes: new TextEncoder().encode(out.pages.join('\n\n')), ext: 'txt' })
    },

    async lesson(documentId: string): Promise<Reply> {
      if (!DOC_ID.test(documentId)) return fail(400, 'bad-request')
      const doc = store.getDocument(documentId)
      if (!doc) return fail(404, 'not-found')
      const original = () => (extOf(doc.savedPath) === 'pdf' ? originalBytes(doc) : null)
      return { status: 200, body: await lessonPack({ store, doc, key: opts.readKey(), gemini, original }) }
    },

    // No tutorId = every class (back-compat).
    list(tutorId?: string): Reply {
      return { status: 200, body: store.listDocuments(tutorId).map(info) }
    },

    remove(documentId: string): Reply {
      if (!DOC_ID.test(documentId)) return fail(400, 'bad-request')
      const doc = store.getDocument(documentId)
      if (!doc) return fail(404, 'not-found')
      const path = resolve(opts.dataDir, doc.savedPath)
      if (!path.startsWith(resolve(uploadsDir) + sep)) return fail(400, 'bad-request')
      // Remove only this stored upload; never a directory or a client-supplied path.
      rmSync(path, { force: true })
      store.deleteDocument(documentId)
      return { status: 200, body: { ok: true } }
    },

    page(documentId: string, pageRaw: string): Reply {
      if (!DOC_ID.test(documentId) || !/^\d{1,4}$/.test(pageRaw)) return fail(400, 'bad-request')
      const doc = store.getDocument(documentId)
      const page = Number(pageRaw)
      if (!doc || page < 1 || page > doc.pageCount) return fail(404, 'not-found')
      const text = store.pageText(documentId, page) ?? ''
      const body: PageText = {
        documentId,
        page,
        text,
        chunks: store.pageChunks(documentId, page).map((c) => ({ id: c.id, page: c.page, startOffset: c.startOffset, endOffset: c.endOffset })),
      }
      return { status: 200, body }
    },

    // The stored original, opened whole in a new tab. The path comes from the
    // db row (never the request) and must resolve inside the uploads dir.
    file(documentId: string): Reply {
      if (!DOC_ID.test(documentId)) return fail(400, 'bad-request')
      const doc = store.getDocument(documentId)
      if (!doc) return fail(404, 'not-found')
      const ext = extOf(doc.savedPath)
      const served = DOCS_CONFIG.originalTypes[ext]
      const path = resolve(opts.dataDir, doc.savedPath)
      if (!served || !path.startsWith(resolve(uploadsDir) + sep) || !existsSync(path)) return fail(404, 'not-found')
      return { status: 200, body: null, file: { path, type: served.type, inline: served.inline, name: `${doc.title}.${ext}` } }
    },

    async chat(payload: unknown): Promise<Reply> {
      if (!isObj(payload) || typeof payload.documentId !== 'string' || typeof payload.question !== 'string') return fail(400, 'bad-request')
      const documentId = payload.documentId
      const question = payload.question.replace(/\s+/g, ' ').trim()
      if (!DOC_ID.test(documentId) || !question) return fail(400, 'bad-request')
      if (question.length > DOCS_CONFIG.limits.maxQuestionChars) return fail(413, 'too-large')
      if (!store.getDocument(documentId)) return fail(404, 'not-found')
      const out = await groundedChat({ store, documentId, question, key: opts.readKey(), gemini })
      return out.ok ? { status: 200, body: out.answer } : fail(out.status, out.error)
    },

    async quiz(payload: unknown): Promise<Reply> {
      if (!isObj(payload) || typeof payload.documentId !== 'string' || !DOC_ID.test(payload.documentId)) return fail(400, 'bad-request')
      const topicId = payload.topicId === undefined || payload.topicId === null ? null : payload.topicId
      if (topicId !== null && (typeof topicId !== 'string' || !TOPIC_ID.test(topicId))) return fail(400, 'bad-request')
      if (!store.getDocument(payload.documentId)) return fail(404, 'not-found')
      const out = await buildQuiz({ store, documentId: payload.documentId, topicId, key: opts.readKey(), gemini })
      return out.ok ? { status: 200, body: out.quiz } : fail(out.status, out.error)
    },

    submit(payload: unknown): Reply {
      if (!isObj(payload)) return fail(400, 'bad-request')
      const { questionId, choice, attemptId } = payload
      if (typeof questionId !== 'string' || !QUESTION_ID.test(questionId)) return fail(400, 'bad-request')
      if (typeof attemptId !== 'string' || !ATTEMPT_ID.test(attemptId) || typeof choice !== 'number') return fail(400, 'bad-request')
      const out = submitAnswer(store, questionId, choice, attemptId)
      return out.ok ? { status: 200, body: out.result } : fail(out.status, out.error)
    },
  }
}

export type DocsService = ReturnType<typeof createDocsService>
