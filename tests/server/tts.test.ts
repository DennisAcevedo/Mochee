import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { ttsMiddleware } from '../../server/ttsProxy.ts'

function latch() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

async function setup(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'gg-stream-'))
  let stream!: ReadableStreamDefaultController<Uint8Array>
  let calls = 0
  const connected = latch()
  const aborted = latch()
  let signal!: AbortSignal
  const middleware = ttsMiddleware(() => root, {
    readKey: () => 'test-key-never-sent-to-a-real-provider',
    fetch: async (url, init) => {
      calls++
      assert.match(String(url), /\/stream\?output_format=mp3_44100_128$/)
      signal = init!.signal as AbortSignal
      const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller } })
      signal.addEventListener('abort', () => {
        aborted.release()
        try { stream.error(new Error('aborted')) } catch { /* already closed */ }
      }, { once: true })
      connected.release()
      return new Response(body, { headers: { 'content-type': 'audio/mpeg' } })
    },
  })
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(root, { recursive: true, force: true })
  })
  const address = server.address() as { port: number }
  const post = (text: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${address.port}/api/tts`, {
    method: 'POST', ...init,
    headers: { 'content-type': 'application/json', ...init.headers }, body: JSON.stringify({ text }),
  })
  return {
    post, connected: connected.promise, aborted: aborted.promise, root,
    calls: () => calls, signal: () => signal,
    chunk: (text: string) => stream.enqueue(new TextEncoder().encode(text)),
    end: () => stream.close(),
    fail: () => stream.error(new Error('private upstream message')),
    files: () => readdirSync(join(root, 'tmp/tts-cache')).filter((name) => name.endsWith('.mp3')),
  }
}

test('TTS sends bytes before synthesis ends, shares late joins, then caches the complete clip', { timeout: 6000 }, async (t) => {
  const app = await setup(t)
  const first = app.post('Hello streaming tutor')
  await app.connected
  app.chunk('first-')
  const response = await first
  assert.equal(response.headers.get('x-tts-cache'), 'miss')
  assert.match(response.headers.get('server-timing')!, /tts;dur=/)
  const reader = response.body!.getReader()
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'first-')
  // The upstream is still open: a buffering implementation would time out above.
  const second = await app.post('Hello streaming tutor')
  const secondReader = second.body!.getReader()
  assert.equal(new TextDecoder().decode((await secondReader.read()).value), 'first-')
  app.chunk('last')
  app.end()
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'last')
  assert.equal(new TextDecoder().decode((await secondReader.read()).value), 'last')
  assert.equal((await reader.read()).done, true)
  assert.equal((await secondReader.read()).done, true)
  assert.equal(app.calls(), 1)
  assert.equal(app.files().length, 1)
  const cached = await app.post('Hello streaming tutor')
  assert.equal(cached.headers.get('x-tts-cache'), 'hit')
  assert.equal(await cached.text(), 'first-last')
  assert.equal(app.calls(), 1)
  const budget = JSON.parse(readFileSync(join(app.root, 'tmp/tts-cache/budget.json'), 'utf8'))
  assert.equal(budget.billed, 'Hello streaming tutor'.length)
})

test('cancelling one listener keeps the shared synthesis alive for another', { timeout: 6000 }, async (t) => {
  const app = await setup(t)
  const cancel = new AbortController()
  const first = app.post('Shared line', { signal: cancel.signal })
  await app.connected
  app.chunk('one')
  const firstResponse = await first
  await firstResponse.body!.getReader().read()
  const second = await app.post('Shared line')
  cancel.abort()
  app.chunk('two')
  app.end()
  assert.equal(await second.text(), 'onetwo')
  assert.equal(app.calls(), 1)
  assert.equal(app.files().length, 1)
})

test('cancelling the last listener aborts upstream and never caches partial audio', { timeout: 6000 }, async (t) => {
  const app = await setup(t)
  const cancel = new AbortController()
  const pending = app.post('Interrupted line', { signal: cancel.signal })
  await app.connected
  app.chunk('partial')
  const response = await pending
  await response.body!.getReader().read()
  cancel.abort()
  await app.aborted
  assert.equal(app.signal().aborted, true)
  assert.equal(app.files().length, 0)
})

test('an upstream failure after headers terminates the stream and is not cached', { timeout: 6000 }, async (t) => {
  const app = await setup(t)
  const pending = app.post('Broken stream')
  await app.connected
  app.chunk('partial')
  const response = await pending
  const reader = response.body!.getReader()
  await reader.read()
  app.fail()
  await assert.rejects(reader.read())
  assert.equal(app.files().length, 0)
})

test('upstream failure before audio returns a short error without provider details', { timeout: 6000 }, async (t) => {
  const app = await setup(t)
  const pending = app.post('Failure before audio')
  await app.connected
  app.fail()
  const response = await pending
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { error: 'upstream' })
  assert.equal(app.files().length, 0)
})

test('cross-site speech requests are rejected before contacting the provider', { timeout: 6000 }, async (t) => {
  const app = await setup(t)
  const response = await app.post('Blocked', { headers: { origin: 'https://other.example' } })
  assert.equal(response.status, 403)
  assert.equal(app.calls(), 0)
})
