import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Citation, TopicInfo } from '../../shared/docsTypes.ts'
import type { Chunk } from './text.ts'

// Data access for documents, chunks, topics, quiz questions and attempts
// (node:sqlite, FTS5 for retrieval). Every read is scoped by documentId, so an
// owner column can be added here later without touching the handlers.

export interface DocumentRow {
  id: string
  title: string
  savedPath: string // relative to the data dir; never sent to a client
  pageCount: number
  createdAt: string
}

export interface QuestionRow {
  id: string
  documentId: string
  topicId: string
  prompt: string
  choices: string[]
  answerIndex: number
  explanation: string
  citation: Citation
}

export interface AttemptRow {
  attemptId: string
  questionId: string
  choice: number
  correct: boolean
  firstTry: boolean
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, savedPath TEXT NOT NULL, pageCount INTEGER NOT NULL, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pages (documentId TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (documentId, page));
CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, documentId TEXT NOT NULL, page INTEGER NOT NULL, startOffset INTEGER NOT NULL, endOffset INTEGER NOT NULL, text TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS chunks_doc ON chunks (documentId, page, startOffset);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(chunkId UNINDEXED, documentId UNINDEXED, text, tokenize = 'porter unicode61');
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, documentId TEXT NOT NULL, title TEXT NOT NULL, keywordsJson TEXT NOT NULL, firstPage INTEGER NOT NULL, ord INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, documentId TEXT NOT NULL, topicId TEXT NOT NULL, prompt TEXT NOT NULL, choicesJson TEXT NOT NULL, answerIndex INTEGER NOT NULL, explanation TEXT NOT NULL, citationJson TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attempts (seq INTEGER PRIMARY KEY AUTOINCREMENT, attemptId TEXT NOT NULL UNIQUE, questionId TEXT NOT NULL, choice INTEGER NOT NULL, correct INTEGER NOT NULL, createdAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_question ON attempts (questionId, seq);
`

type Row = Record<string, unknown>
const str = (v: unknown) => String(v ?? '')
const num = (v: unknown) => Number(v ?? 0)

function toChunk(r: Row): Chunk {
  return { id: str(r.id), documentId: str(r.documentId), page: num(r.page), startOffset: num(r.startOffset), endOffset: num(r.endOffset), text: str(r.text) }
}

function toTopic(r: Row): TopicInfo {
  return { id: str(r.id), documentId: str(r.documentId), title: str(r.title), keywords: JSON.parse(str(r.keywordsJson)) as string[], firstPage: num(r.firstPage) }
}

function toQuestion(r: Row): QuestionRow {
  return {
    id: str(r.id),
    documentId: str(r.documentId),
    topicId: str(r.topicId),
    prompt: str(r.prompt),
    choices: JSON.parse(str(r.choicesJson)) as string[],
    answerIndex: num(r.answerIndex),
    explanation: str(r.explanation),
    citation: JSON.parse(str(r.citationJson)) as Citation,
  }
}

export type DocsStore = ReturnType<typeof openStore>

export function openStore(dbPath: string) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)

  const inTransaction = <T>(fn: () => T): T => {
    db.exec('BEGIN')
    try {
      const out = fn()
      db.exec('COMMIT')
      return out
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  return {
    close: () => db.close(),

    insertDocument(doc: DocumentRow, pages: string[], chunks: Chunk[], topics: TopicInfo[]) {
      inTransaction(() => {
        db.prepare('INSERT INTO documents (id, title, savedPath, pageCount, createdAt) VALUES (?, ?, ?, ?, ?)').run(doc.id, doc.title, doc.savedPath, doc.pageCount, doc.createdAt)
        const page = db.prepare('INSERT INTO pages (documentId, page, text) VALUES (?, ?, ?)')
        pages.forEach((text, i) => page.run(doc.id, i + 1, text))
        const chunk = db.prepare('INSERT INTO chunks (id, documentId, page, startOffset, endOffset, text) VALUES (?, ?, ?, ?, ?, ?)')
        const fts = db.prepare('INSERT INTO chunks_fts (chunkId, documentId, text) VALUES (?, ?, ?)')
        for (const c of chunks) {
          chunk.run(c.id, c.documentId, c.page, c.startOffset, c.endOffset, c.text)
          fts.run(c.id, c.documentId, c.text)
        }
        const topic = db.prepare('INSERT INTO topics (id, documentId, title, keywordsJson, firstPage, ord) VALUES (?, ?, ?, ?, ?, ?)')
        topics.forEach((t, i) => topic.run(t.id, t.documentId, t.title, JSON.stringify(t.keywords), t.firstPage, i))
      })
    },

    listDocuments(): DocumentRow[] {
      return (db.prepare('SELECT id, title, savedPath, pageCount, createdAt FROM documents ORDER BY createdAt DESC, id').all() as Row[]).map((r) => ({
        id: str(r.id),
        title: str(r.title),
        savedPath: str(r.savedPath),
        pageCount: num(r.pageCount),
        createdAt: str(r.createdAt),
      }))
    },

    getDocument(id: string): DocumentRow | null {
      const r = db.prepare('SELECT id, title, savedPath, pageCount, createdAt FROM documents WHERE id = ?').get(id) as Row | undefined
      return r ? { id: str(r.id), title: str(r.title), savedPath: str(r.savedPath), pageCount: num(r.pageCount), createdAt: str(r.createdAt) } : null
    },

    topics(documentId: string): TopicInfo[] {
      return (db.prepare('SELECT * FROM topics WHERE documentId = ? ORDER BY ord').all(documentId) as Row[]).map(toTopic)
    },

    pageText(documentId: string, page: number): string | null {
      const r = db.prepare('SELECT text FROM pages WHERE documentId = ? AND page = ?').get(documentId, page) as Row | undefined
      return r ? str(r.text) : null
    },

    pageChunks(documentId: string, page: number): Chunk[] {
      return (db.prepare('SELECT * FROM chunks WHERE documentId = ? AND page = ? ORDER BY startOffset').all(documentId, page) as Row[]).map(toChunk)
    },

    allChunks(documentId: string): Chunk[] {
      return (db.prepare('SELECT * FROM chunks WHERE documentId = ? ORDER BY page, startOffset').all(documentId) as Row[]).map(toChunk)
    },

    firstChunks(documentId: string, limit: number): Chunk[] {
      return (db.prepare('SELECT * FROM chunks WHERE documentId = ? ORDER BY page, startOffset LIMIT ?').all(documentId, limit) as Row[]).map(toChunk)
    },

    getChunk(documentId: string, chunkId: string): Chunk | null {
      const r = db.prepare('SELECT * FROM chunks WHERE id = ? AND documentId = ?').get(chunkId, documentId) as Row | undefined
      return r ? toChunk(r) : null
    },

    // BM25 top-k chunks of ONE document for an already-sanitised MATCH expression.
    search(documentId: string, match: string, limit: number): Chunk[] {
      const rows = db
        .prepare(
          `SELECT c.* FROM chunks_fts f JOIN chunks c ON c.id = f.chunkId
           WHERE chunks_fts MATCH ? AND f.documentId = ? ORDER BY bm25(chunks_fts) LIMIT ?`,
        )
        .all(match, documentId, limit) as Row[]
      return rows.map(toChunk)
    },

    insertQuestions(questions: QuestionRow[]) {
      inTransaction(() => {
        const q = db.prepare('INSERT INTO questions (id, documentId, topicId, prompt, choicesJson, answerIndex, explanation, citationJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        for (const x of questions) q.run(x.id, x.documentId, x.topicId, x.prompt, JSON.stringify(x.choices), x.answerIndex, x.explanation, JSON.stringify(x.citation))
      })
    },

    getQuestion(id: string): QuestionRow | null {
      const r = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as Row | undefined
      return r ? toQuestion(r) : null
    },

    // Records an attempt once per attemptId and returns the stored row (a replay
    // returns the original). firstTry = no earlier attempt at that question.
    recordAttempt(attemptId: string, questionId: string, choice: number, correct: boolean): AttemptRow {
      db.prepare('INSERT OR IGNORE INTO attempts (attemptId, questionId, choice, correct, createdAt) VALUES (?, ?, ?, ?, ?)').run(attemptId, questionId, choice, correct ? 1 : 0, new Date().toISOString())
      const r = db.prepare('SELECT seq, attemptId, questionId, choice, correct FROM attempts WHERE attemptId = ?').get(attemptId) as Row
      const earlier = db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE questionId = ? AND seq < ?').get(str(r.questionId), num(r.seq)) as Row
      return { attemptId: str(r.attemptId), questionId: str(r.questionId), choice: num(r.choice), correct: num(r.correct) === 1, firstTry: num(earlier.n) === 0 }
    },

    attemptCount(questionId: string): number {
      return num((db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE questionId = ?').get(questionId) as Row).n)
    },
  }
}
