import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, describe, test } from 'node:test'
import type { DocumentInfo, PageText } from '../../shared/docsTypes.ts'
import { DEFAULT_TUTOR_ID, STUDY_LIMITS, STUDY_ROUTES, type LessonPack } from '../../shared/lessonPack.ts'
import type { GeminiCall, GeminiResult } from '../../server/docs/gemini.ts'
import { paginate } from '../../server/docs/lecture.ts'
import { docsMiddleware } from '../../server/docs/plugin.ts'
import { createDocsService } from '../../server/docs/service.ts'
import { buildPdf } from './fixturePdf.ts'

// Per-class documents, lesson packs and recorded lectures. Offline: Gemini is
// absent or a scripted fake, so nothing here calls the real API.

const pdf = buildPdf()

function freshService(gemini?: (c: GeminiCall) => Promise<GeminiResult>, key: string | null = null, dataDir = mkdtempSync(join(tmpdir(), 'gg-study-'))) {
  const service = createDocsService({ dataDir, readKey: () => key, gemini })
  return { dataDir, service, dispose: () => (service.close(), rmSync(dataDir, { recursive: true, force: true })) }
}

describe('documents per class', () => {
  test('list filters by tutorId; no filter lists every class; legacy rows read as the default class', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'gg-study-legacy-'))
    // A database from before classes existed: no tutorId column.
    const old = new DatabaseSync(join(dataDir, 'geminiguy.db'))
    old.exec('CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, savedPath TEXT NOT NULL, pageCount INTEGER NOT NULL, createdAt TEXT NOT NULL)')
    old.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?)').run('00000000000000aa', 'Old notes', 'uploads/00000000000000aa.pdf', 1, '2026-01-01T00:00:00.000Z')
    old.close()

    const ctx = freshService(undefined, null, dataDir)
    try {
      const a = (await ctx.service.ingest(pdf, 'Lecture%204.pdf', 'math2')).body as DocumentInfo
      const b = (await ctx.service.ingest(pdf, 'Lecture%205.pdf')).body as DocumentInfo
      assert.equal(a.tutorId, 'math2')
      assert.equal(b.tutorId, DEFAULT_TUTOR_ID)

      const math = ctx.service.list('math2').body as DocumentInfo[]
      assert.deepEqual(math.map((d) => d.id), [a.id])
      const def = ctx.service.list(DEFAULT_TUTOR_ID).body as DocumentInfo[]
      assert.deepEqual(new Set(def.map((d) => d.id)), new Set([b.id, '00000000000000aa']))
      assert.ok(def.every((d) => d.tutorId === DEFAULT_TUTOR_ID))
      assert.equal((ctx.service.list().body as DocumentInfo[]).length, 3)
      assert.deepEqual(ctx.service.list('nobody').body, [])
    } finally {
      ctx.dispose()
    }
  })
})

describe('lesson pack', () => {
  test('outline without a key: one section per topic, page ranges, real text, cached', async () => {
    const ctx = freshService()
    try {
      const doc = (await ctx.service.ingest(pdf, 'CS111%20Lecture%204.pdf')).body as DocumentInfo
      const res = await ctx.service.lesson(doc.id)
      assert.equal(res.status, 200)
      const pack = res.body as LessonPack
      assert.equal(pack.source, 'outline')
      assert.equal(pack.documentId, doc.id)
      assert.equal(pack.sections.length, Math.min(doc.topics.length, STUDY_LIMITS.maxSections))
      const pages = [1, 2].map((n) => (ctx.service.page(doc.id, String(n)).body as PageText).text)
      pack.sections.forEach((s, i) => {
        const topic = doc.topics[i]
        assert.equal(s.title, topic.title)
        assert.equal(s.topicId, topic.id)
        assert.equal(s.page, topic.firstPage)
        const to = doc.topics[i + 1] ? Math.max(topic.firstPage, doc.topics[i + 1].firstPage - 1) : doc.pageCount
        assert.ok(s.mins >= 2 && s.mins <= 8)
        for (const line of s.notes.lines) {
          assert.ok(line.page >= topic.firstPage && line.page <= to, `notes page ${line.page} inside ${topic.firstPage}-${to}`)
          assert.ok(pages[line.page - 1].replace(/\s+/g, ' ').includes(line.text.replace(/…$/, '')), 'notes line is the page’s own text')
        }
      })
      const again = (await ctx.service.lesson(doc.id)).body as LessonPack
      assert.equal(again.createdAt, pack.createdAt, 'second call is the cached pack')
      assert.deepEqual(again.sections, pack.sections)
      assert.equal((await ctx.service.lesson('ffffffffffffffff')).status, 404)
      assert.equal((await ctx.service.lesson('../x')).status, 400)
    } finally {
      ctx.dispose()
    }
  })

  test('gemini pack keeps in-range notes and drops out-of-range ones', async () => {
    let lessonCalls = 0
    const fake = async (c: GeminiCall): Promise<GeminiResult> => {
      if (!c.system.includes('tutoring session')) return { ok: false, error: 'upstream' } // topics -> heuristic
      lessonCalls++
      return {
        ok: true,
        json: {
          sections: [
            {
              section: 1,
              mins: 30,
              say: ['FCFS runs jobs in arrival order.', 'Short jobs can wait behind long ones.'],
              notesHead: 'FCFS',
              notes: [
                { text: 'Jobs run in arrival order.', page: 1 },
                { text: 'Invented page.', page: 99 },
              ],
              boardHead: 'Rule',
              board: ['first come, first served'],
            },
          ],
        },
      }
    }
    const ctx = freshService(fake, 'test-key')
    try {
      const doc = (await ctx.service.ingest(pdf, 'CS111.pdf')).body as DocumentInfo
      const pack = (await ctx.service.lesson(doc.id)).body as LessonPack
      assert.equal(pack.source, 'gemini')
      assert.equal(lessonCalls, 1)
      const first = pack.sections[0]
      assert.equal(first.mins, 8, 'mins clamped')
      assert.deepEqual(first.notes.lines.map((l) => l.page), [1], 'page 99 dropped')
      await ctx.service.lesson(doc.id)
      assert.equal(lessonCalls, 1, 'cache hit: no second Gemini call')
    } finally {
      ctx.dispose()
    }
  })
})

describe('lectures', () => {
  test('transcript is paged on paragraph boundaries and saved in the class', async () => {
    const para = (n: number) => `Paragraph ${n}. ${'The scheduler picks the next ready job from the queue. '.repeat(8).trim()}`
    const paragraphs = [1, 2, 3, 4, 5].map(para)
    const calls: GeminiCall[] = []
    const fake = async (c: GeminiCall): Promise<GeminiResult> => {
      calls.push(c)
      if (c.inline) return { ok: true, json: { speech: true, paragraphs } }
      return { ok: false, error: 'upstream' }
    }
    const ctx = freshService(fake, 'test-key')
    try {
      const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])
      const res = await ctx.service.lecture(audio, 'audio/webm;codecs=opus', 'Week%203.webm', 'math2')
      assert.equal(res.status, 201)
      const doc = res.body as DocumentInfo
      assert.equal(doc.title, 'Week 3')
      assert.equal(doc.tutorId, 'math2')
      const audioCall = calls.find((c) => c.inline)
      assert.ok(audioCall)
      assert.equal(audioCall.inline?.mimeType, 'audio/webm')
      assert.equal(audioCall.inline?.base64, Buffer.from(audio).toString('base64'))
      assert.ok(doc.pageCount >= 2)
      const p1 = (ctx.service.page(doc.id, '1').body as PageText).text
      assert.ok(p1.startsWith('Paragraph 1.'))
      assert.ok(p1.length <= 1500)
      assert.ok(doc.topics.length >= 1, 'the PDF topic pipeline ran on the transcript')

      const untitled = (await ctx.service.lecture(audio, 'audio/ogg', '', 'math2')).body as DocumentInfo
      assert.match(untitled.title, /^Lecture \d{4}-\d{2}-\d{2}$/)
      assert.equal((await ctx.service.lecture(audio, 'video/mp4', 'x', 'math2')).status, 415)
    } finally {
      ctx.dispose()
    }
  })

  // A 16-bit mono PCM WAV of `seconds`; amp 0 = silence.
  const pcmWav = (seconds: number, amp: number): Uint8Array => {
    const n = 16000 * seconds
    const buf = Buffer.alloc(44 + n * 2)
    buf.write('RIFF', 0)
    buf.writeUInt32LE(36 + n * 2, 4)
    buf.write('WAVEfmt ', 8)
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20) // PCM
    buf.writeUInt16LE(1, 22) // mono
    buf.writeUInt32LE(16000, 24)
    buf.writeUInt32LE(32000, 28)
    buf.writeUInt16LE(2, 32)
    buf.writeUInt16LE(16, 34)
    buf.write('data', 36)
    buf.writeUInt32LE(n * 2, 40)
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(amp * Math.sin(i / 8)), 44 + i * 2)
    return new Uint8Array(buf)
  }

  test('a silent WAV is refused before Gemini is called, and nothing is saved', async () => {
    let calls = 0
    const ctx = freshService(async () => {
      calls++
      return { ok: true, json: { speech: true, paragraphs: ['Lateral inhibition sharpens edges.'] } }
    }, 'test-key')
    try {
      const res = await ctx.service.lecture(pcmWav(1, 0), 'audio/wav', 'quiet.wav', 'math2')
      assert.equal(res.status, 422)
      assert.deepEqual(res.body, { error: 'no-text' })
      assert.equal(calls, 0, 'silence never reaches Gemini')
      assert.equal((ctx.service.list('math2').body as DocumentInfo[]).length, 0)
    } finally {
      ctx.dispose()
    }
  })

  test('when Gemini hears no speech, its paragraphs are discarded and nothing is saved', async () => {
    const ctx = freshService(async (c) => (c.inline ? { ok: true, json: { speech: false, paragraphs: ['An invented lecture.'] } } : { ok: false, error: 'upstream' }), 'test-key')
    try {
      const res = await ctx.service.lecture(pcmWav(1, 8000), 'audio/wav', 'tone.wav', 'math2')
      assert.equal(res.status, 422)
      assert.deepEqual(res.body, { error: 'no-text' })
      assert.equal((ctx.service.list('math2').body as DocumentInfo[]).length, 0)
    } finally {
      ctx.dispose()
    }
  })

  test('paginate never exceeds the page size and keeps every word', () => {
    const paras = ['Short one.', 'A'.repeat(4000), 'Tail sentence here. Another one.']
    const pages = paginate(paras, 1500)
    assert.ok(pages.every((p) => p.length <= 1500))
    assert.equal(pages.join('').replace(/\s+/g, ''), paras.join('').replace(/\s+/g, ''))
  })
})

describe('study routes over HTTP', () => {
  let server: Server
  let base: { host: string; port: number }
  let dataDir: string
  let close: () => void

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'gg-study-http-'))
    const mw = docsMiddleware({ root: dataDir, dataDir, readKey: () => null, maxAudioBytes: 1024 })
    close = () => mw.service().close()
    server = createServer((req, res) => mw(req, res, () => ((res.statusCode = 404), res.end('fallthrough'))))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = { host: '127.0.0.1', port: (server.address() as AddressInfo).port }
  })
  after(() => {
    server.close()
    close()
    rmSync(dataDir, { recursive: true, force: true })
  })

  function send(path: string, method: string, headers: Record<string, string>, body?: Buffer): Promise<{ status: number; json: unknown }> {
    return new Promise((resolve, reject) => {
      const req = request({ ...base, path, method, headers }, (res) => {
        const parts: Buffer[] = []
        res.on('data', (c: Buffer) => parts.push(c))
        res.on('end', () => {
          const text = Buffer.concat(parts).toString('utf8')
          let json: unknown = text
          try {
            json = JSON.parse(text)
          } catch {
            /* not json */
          }
          resolve({ status: res.statusCode ?? 0, json })
        })
      })
      req.on('error', reject)
      if (body) req.write(body)
      req.end()
    })
  }

  test('lectures: 503 no-key without a key, 415 for non-audio, 403 cross-site', async () => {
    const audio = Buffer.from([1, 2, 3, 4])
    const ok = await send(STUDY_ROUTES.lectures, 'POST', { 'content-type': 'audio/webm;codecs=opus', 'x-tutor-id': 'math2' }, audio)
    assert.deepEqual(ok, { status: 503, json: { error: 'no-key' } })
    const bad = await send(STUDY_ROUTES.lectures, 'POST', { 'content-type': 'text/plain' }, audio)
    assert.deepEqual(bad, { status: 415, json: { error: 'not-audio' } })
    const cross = await send(STUDY_ROUTES.lectures, 'POST', { 'content-type': 'audio/webm', origin: 'http://evil.example' }, audio)
    assert.equal(cross.status, 403)
    assert.equal((await send(STUDY_ROUTES.lectures, 'GET', {})).status, 405)
  })

  test('documents?tutorId filters, upload reads x-tutor-id, lesson route answers JSON', async () => {
    const up = await send('/api/documents', 'POST', { 'content-type': 'application/pdf', 'x-filename': 'a.pdf', 'x-tutor-id': 'bio101' }, pdf)
    assert.equal(up.status, 201)
    const doc = up.json as DocumentInfo
    assert.equal(doc.tutorId, 'bio101')
    assert.equal(((await send('/api/documents?tutorId=bio101', 'GET', {})).json as DocumentInfo[]).length, 1)
    assert.equal(((await send(`/api/documents?tutorId=${DEFAULT_TUTOR_ID}`, 'GET', {})).json as DocumentInfo[]).length, 0)
    assert.equal(((await send('/api/documents', 'GET', {})).json as DocumentInfo[]).length, 1)
    assert.equal((await send('/api/documents?tutorId=bad%20id!', 'GET', {})).status, 400)
    const bad = await send('/api/documents', 'POST', { 'content-type': 'application/pdf', 'x-filename': 'a.pdf', 'x-tutor-id': '../x' }, pdf)
    assert.equal(bad.status, 400)

    const lesson = await send(STUDY_ROUTES.lesson(doc.id), 'POST', { 'content-type': 'application/json' }, Buffer.from('{}'))
    assert.equal(lesson.status, 200)
    assert.equal((lesson.json as LessonPack).source, 'outline')
    assert.equal((await send(STUDY_ROUTES.lesson(doc.id), 'POST', { 'content-type': 'text/plain' }, Buffer.from('x'))).status, 415)
    assert.equal((await send(STUDY_ROUTES.lesson(doc.id), 'GET', {})).status, 405)
  })
})
