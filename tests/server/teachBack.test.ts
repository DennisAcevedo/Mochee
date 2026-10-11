import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import type { TeachBackChallenge, TeachBackResult } from '../../shared/teachBack.ts'
import { createDocsService } from '../../server/docs/service.ts'
import { chunkPage } from '../../server/docs/text.ts'
import type { GeminiFn } from '../../server/docs/tutor.ts'
import { callGemini, type GeminiResult } from '../../server/docs/gemini.ts'

const documentId = 'aaaaaaaaaaaaaaaa'
const topicId = `${documentId}-t1`
const passage = 'First come first served runs jobs in arrival order. A long job can delay shorter jobs behind it.'
const chunks = chunkPage(documentId, 1, passage)
const explanation = 'Jobs run in arrival order, like people joining a queue. A long job makes other jobs wait.'
const rubric = {
  prompt: 'Explain first come first served scheduling and one possible drawback in your own words.',
  criteria: [
    { concept: 'Arrival order', expected: 'Jobs run in the order they arrive.', chunkId: chunks[0].id, quote: 'First come first served runs jobs in arrival order.' },
    { concept: 'Convoy effect', expected: 'A long job delays short jobs queued behind it.', chunkId: chunks[0].id, quote: 'A long job can delay shorter jobs behind it.' },
  ],
}
const evaluation = {
  summary: 'You explained the order clearly. Add which jobs are delayed by the long job.',
  items: [
    { id: 'c1', status: 'correct', feedback: 'Your queue analogy captures arrival order.', studentQuote: 'Jobs run in arrival order' },
    { id: 'c2', status: 'partial', feedback: 'Explain that even short jobs must wait behind the long job.', studentQuote: 'A long job makes other jobs wait.' },
  ],
  nextQuestion: 'What happens to a short job that arrives just after a long one?',
}

function fixture(t: { after: (fn: () => void) => void }, gemini: GeminiFn = async (call) => ({ ok: true, json: 'criteria' in (call.schema.properties as object) ? rubric : evaluation }), key: string | null = 'test-only') {
  const dataDir = mkdtempSync(join(tmpdir(), 'gg-teachback-'))
  const service = createDocsService({ dataDir, readKey: () => key, gemini })
  service.store.insertDocument({ id: documentId, title: 'Test scheduling notes', savedPath: 'uploads/test.txt', pageCount: 1,
    createdAt: new Date().toISOString(), tutorId: 'test-class', kind: 'class' }, [passage], chunks,
    [{ id: topicId, documentId, title: 'First come first served', keywords: ['scheduling', 'arrival', 'jobs'], firstPage: 1 }])
  t.after(() => {
    service.close()
    assert.ok(resolve(dataDir).startsWith(resolve(tmpdir()) + '\\') || resolve(dataDir).startsWith(resolve(tmpdir()) + '/'))
    rmSync(dataDir, { recursive: true, force: true })
  })
  return service
}
async function start(service: ReturnType<typeof fixture>) {
  const reply = await service.teachBackStart({ documentId, topicId })
  assert.equal(reply.status, 200)
  return reply.body as TeachBackChallenge
}

test('prepares once, keeps the answer private, and grades with source citations and a derived score', async (t) => {
  let calls = 0
  const service = fixture(t, async (call) => { calls++; return { ok: true, json: 'criteria' in (call.schema.properties as object) ? rubric : { ...evaluation, score: 100, coins: 9999 } } })
  const [challenge, duplicate] = await Promise.all([start(service), start(service)])
  assert.deepEqual(challenge, duplicate)
  assert.equal(calls, 1)
  assert.equal('criteria' in challenge, false)
  assert.equal('expected' in challenge, false)
  assert.deepEqual(await start(service), challenge)
  const submission = { sessionId: challenge.id, attemptId: 'attempt-0001', explanation }
  const [a, b] = await Promise.all([service.teachBackGrade(submission), service.teachBackGrade(submission)])
  assert.equal(a.status, 200)
  assert.deepEqual(a, b)
  assert.equal(calls, 2, 'concurrent duplicate uses the same grading call')
  const result = a.body as TeachBackResult
  assert.equal(result.score, 75, 'model-provided score/reward cannot override the rubric calculation')
  assert.equal('coins' in result, false)
  assert.equal(result.items[1].status, 'partial')
  assert.equal(result.items[1].citation.page, 1)
  assert.equal(result.items[1].citation.quote, rubric.criteria[1].quote)
  assert.deepEqual(await service.teachBackGrade(submission), a)
  assert.equal(calls, 2, 'replay is cached')
  assert.equal((await service.teachBackGrade({ ...submission, explanation: explanation + ' Changed.' })).status, 409)
})

test('rejects missing keys, invalid requests, and a topic from a different document before any model call', async (t) => {
  let calls = 0
  const service = fixture(t, async () => { calls++; throw new Error('must not call') }, null)
  assert.equal((await service.teachBackStart({ documentId, topicId })).status, 503)
  assert.equal((await service.teachBackStart({ documentId: '../bad', topicId })).status, 400)
  assert.equal((await service.teachBackStart({ documentId, topicId: 'bbbbbbbbbbbbbbbb-t1' })).status, 404)
  assert.equal((await service.teachBackGrade({ sessionId: 'tb' + documentId, attemptId: 'attempt-0001', explanation: 'short' })).status, 400)
  assert.equal((await service.teachBackGrade({ sessionId: 'tb' + documentId, attemptId: 'attempt-0001', explanation: 'x'.repeat(3001) })).status, 400)
  assert.equal(calls, 0)
})

test('retries fabricated source evidence once, then refuses to prepare a gradeable exercise', async (t) => {
  let calls = 0
  const service = fixture(t, async () => { calls++; return { ok: true, json: { ...rubric, criteria: rubric.criteria.map((c) => ({ ...c, quote: 'This quotation does not exist in the document.' })) } } })
  assert.deepEqual(await service.teachBackStart({ documentId, topicId }), { status: 502, body: { error: 'teach-back-unverified' } })
  assert.equal(calls, 2)
  assert.equal(service.store.teachBackForTopic(topicId), null)
})

test('rejects invented student quotes and missing or duplicate criteria without recording an attempt', async (t) => {
  for (const items of [
    evaluation.items.map((i) => ({ ...i, studentQuote: 'I said something completely different.' })),
    [evaluation.items[0], evaluation.items[0]],
    [evaluation.items[0]],
  ]) {
    const service = fixture(t, async (call) => ({ ok: true, json: 'criteria' in (call.schema.properties as object) ? rubric : { ...evaluation, items } }))
    const challenge = await start(service)
    const reply = await service.teachBackGrade({ sessionId: challenge.id, attemptId: 'invalid-0001', explanation })
    assert.equal(reply.status, 502)
    assert.equal(service.store.getTeachBackAttempt('invalid-0001'), null)
  }
})

test('missing and incorrect concepts receive no credit; model failure never creates a grade', async (t) => {
  let fail = false
  const service = fixture(t, async (call) => fail ? { ok: false, error: 'timeout' } : { ok: true, json: 'criteria' in (call.schema.properties as object) ? rubric : {
    ...evaluation, items: [{ ...evaluation.items[0], status: 'missing', studentQuote: '' }, { ...evaluation.items[1], status: 'incorrect' }],
  } })
  const challenge = await start(service)
  const result = await service.teachBackGrade({ sessionId: challenge.id, attemptId: 'attempt-0001', explanation })
  assert.equal((result.body as TeachBackResult).score, 0)
  fail = true
  assert.equal((await service.teachBackGrade({ sessionId: challenge.id, attemptId: 'attempt-0002', explanation })).status, 504)
  assert.equal(service.store.getTeachBackAttempt('attempt-0002'), null)
})

test('deleting material removes the rubric and grades and prevents in-flight grading from saving', async (t) => {
  let release: (() => void) | undefined
  const service = fixture(t, async (call) => {
    if ('criteria' in (call.schema.properties as object)) return { ok: true, json: rubric }
    if (release !== undefined) await new Promise<void>((resolve) => { release = resolve })
    return { ok: true, json: evaluation }
  })
  const challenge = await start(service)
  await service.teachBackGrade({ sessionId: challenge.id, attemptId: 'attempt-0001', explanation })
  release = () => {}
  const pending = service.teachBackGrade({ sessionId: challenge.id, attemptId: 'attempt-0002', explanation })
  assert.equal(service.remove(documentId).status, 200)
  release()
  assert.equal((await pending).status, 404)
  assert.equal(service.store.getTeachBackSession(challenge.id), null)
  assert.equal(service.store.getTeachBackAttempt('attempt-0001'), null)
  assert.equal(service.store.getTeachBackAttempt('attempt-0002'), null)
})

test('a temporary preparation failure retries automatically; an incomplete grade retries with more room', async (t) => {
  let preparations = 0
  const gradeBudgets: number[] = []
  const service = fixture(t, async (call) => {
    if ('criteria' in (call.schema.properties as object)) {
      preparations++
      return preparations === 1 ? { ok: false, error: 'upstream', status: 503 } : { ok: true, json: rubric }
    }
    gradeBudgets.push(call.maxOutputTokens)
    return gradeBudgets.length === 1 ? { ok: false, error: 'parse', truncated: true } : { ok: true, json: evaluation }
  })
  const challenge = await start(service)
  assert.equal(preparations, 2)
  const result = await service.teachBackGrade({ sessionId: challenge.id, attemptId: 'retry-000001', explanation })
  assert.equal(result.status, 200)
  assert.equal((result.body as TeachBackResult).score, 75)
  assert.deepEqual(gradeBudgets, [4096, 8192])
})

test('persistent provider failures show specific errors and retry only recoverable failures', async (t) => {
  const cases: { failure: GeminiResult; error: string; calls: number }[] = [
    { failure: { ok: false, error: 'upstream', status: 429 }, error: 'teach-back-busy', calls: 2 },
    { failure: { ok: false, error: 'upstream', status: 403 }, error: 'teach-back-auth', calls: 1 },
    { failure: { ok: false, error: 'upstream', status: 404 }, error: 'teach-back-model', calls: 1 },
    { failure: { ok: false, error: 'upstream', status: 400 }, error: 'teach-back-request', calls: 1 },
    { failure: { ok: false, error: 'network' }, error: 'teach-back-unavailable', calls: 2 },
    { failure: { ok: false, error: 'parse' }, error: 'teach-back-unverified', calls: 2 },
    { failure: { ok: false, error: 'parse', truncated: true }, error: 'teach-back-incomplete', calls: 2 },
  ]
  for (const c of cases) {
    let calls = 0
    const service = fixture(t, async () => { calls++; return c.failure })
    const result = await service.teachBackStart({ documentId, topicId })
    assert.deepEqual(result.body, { error: c.error })
    assert.equal(calls, c.calls)
    assert.equal(service.store.teachBackForTopic(topicId), null)
  }
})

test('Gemini transport recognizes truncated JSON without returning provider text', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ candidates: [{
    finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"summary":"unfinished' }] },
  }] }))
  const result = await callGemini({ key: 'test-only', system: 'test', user: 'synthetic fixture', schema: {}, temperature: 0, maxOutputTokens: 20 })
  assert.deepEqual(result, { ok: false, error: 'parse', truncated: true })
})

test('spoken explanations are transcribed verbatim without creating library documents or correcting mistakes', async (t) => {
  const spoken = 'I think the last job goes first, so I might have the order backwards.'
  const service = fixture(t, async (call) => {
    assert.match(call.system, /Do not answer questions, correct mistakes/)
    assert.equal(call.inline?.mimeType, 'audio/webm')
    return { ok: true, json: { speech: true, text: spoken } }
  })
  const before = service.store.listDocuments().length
  assert.deepEqual(await service.teachBackTranscribe(new Uint8Array([1, 2, 3]), 'audio/webm;codecs=opus'), { status: 200, body: { text: spoken } })
  assert.equal(service.store.listDocuments().length, before)
})

test('audio input rejects invalid types, oversize takes, silence and excessive transcripts', async (t) => {
  let speech = false
  const service = fixture(t, async () => ({ ok: true, json: { speech, text: speech ? 'x'.repeat(3001) : '' } }))
  const bytes = new Uint8Array([1, 2, 3])
  assert.equal((await service.teachBackTranscribe(bytes, 'text/plain')).status, 415)
  assert.equal((await service.teachBackTranscribe(new Uint8Array(), 'audio/webm')).status, 400)
  assert.equal((await service.teachBackTranscribe(new Uint8Array(4 * 1024 * 1024 + 1), 'audio/webm')).status, 413)
  assert.deepEqual((await service.teachBackTranscribe(bytes, 'audio/webm')).body, { error: 'teach-back-no-speech' })
  speech = true
  assert.deepEqual((await service.teachBackTranscribe(bytes, 'audio/webm')).body, { error: 'teach-back-too-long' })
})
