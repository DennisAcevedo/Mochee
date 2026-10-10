import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DocumentInfo, PageText } from '../../src/lesson/docsTypes.ts'
import { DOCS_CONFIG } from './config.ts'
import { callGemini } from './gemini.ts'
import { extractPages, PdfError } from './pdf.ts'
import { buildQuiz, submitAnswer, ATTEMPT_ID, QUESTION_ID } from './quiz.ts'
import { openStore, type DocsStore, type DocumentRow } from './store.ts'
import { chunkPage, decodeFilename, titleFromFilename, type Chunk } from './text.ts'
import { extractTopics } from './topics.ts'
import { groundedChat, type GeminiFn } from './tutor.ts'

// The documents backend as plain operations (no HTTP): ingest, list, page,
// chat, quiz, submit. Each returns { status, body } so plugin.ts only moves
// bytes, and the tests drive the same code without a server.

export const DOC_ID = /^[a-f0-9]{16}$/
export const TOPIC_ID = /^[a-f0-9]{16}-t\d{1,2}$/

export interface Reply {
  status: number
  body: unknown
}

export interface ServiceOptions {
  dataDir: string // absolute
  readKey: () => string | null // Gemini key, read per call; null = demo mode
  gemini?: GeminiFn // injectable for tests
}

const fail = (status: number, error: string): Reply => ({ status, body: { error } })
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function createDocsService(opts: ServiceOptions) {
  const uploadsDir = join(opts.dataDir, DOCS_CONFIG.uploadsDir)
  mkdirSync(uploadsDir, { recursive: true })
  const store: DocsStore = openStore(join(opts.dataDir, DOCS_CONFIG.dbFile))
  const gemini = opts.gemini ?? callGemini

  const info = (doc: DocumentRow): DocumentInfo => ({ id: doc.id, title: doc.title, pageCount: doc.pageCount, createdAt: doc.createdAt, topics: store.topics(doc.id) })

  return {
    store,
    close: () => store.close(),

    // Bytes already passed the size limit and magic check in plugin.ts; this
    // re-checks the magic, parses, chunks, finds topics and stores everything.
    async ingest(bytes: Uint8Array, filename: string): Promise<Reply> {
      if (!/\.pdf$/i.test(decodeFilename(filename))) return fail(415, 'not-pdf')
      let pages: string[]
      try {
        pages = await extractPages(bytes)
      } catch (e) {
        if (e instanceof PdfError) return fail(e.code === 'too-large' ? 413 : 415, e.code)
        throw e
      }
      if (!pages.some((p) => p.length > 0)) return fail(422, 'no-text')

      const id = randomBytes(8).toString('hex')
      const title = titleFromFilename(filename)
      const savedPath = `${DOCS_CONFIG.uploadsDir}/${id}.pdf`
      const chunks: Chunk[] = pages.flatMap((text, i) => chunkPage(id, i + 1, text))
      const topics = await extractTopics({ documentId: id, title, pages, key: opts.readKey(), gemini })
      const doc: DocumentRow = { id, title, savedPath, pageCount: pages.length, createdAt: new Date().toISOString() }
      const file = join(uploadsDir, `${id}.pdf`)
      writeFileSync(file, bytes, { flag: 'wx' })
      try {
        store.insertDocument(doc, pages, chunks, topics)
      } catch (e) {
        rmSync(file, { force: true })
        throw e
      }
      return { status: 201, body: info(doc) }
    },

    list(): Reply {
      return { status: 200, body: store.listDocuments().map(info) }
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
