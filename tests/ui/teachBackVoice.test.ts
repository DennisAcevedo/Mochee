import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { teachBackSpeech } from '../../src/hub/teachBackSpeech.ts'
import { startTeachBackRecording } from '../../src/hub/teachBackRecording.ts'
import type { TeachBackResult } from '../../shared/teachBack.ts'

function replace(t: TestContext, name: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else Reflect.deleteProperty(globalThis, name) })
}
function setup(t: TestContext) {
  let stopped = 0
  const stream = { getTracks: () => [{ stop: () => { stopped++ } }] }
  class Recorder {
    static isTypeSupported() { return true }
    state = 'inactive'
    mimeType = 'audio/webm'
    onstop: (() => void) | null = null
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onerror: (() => void) | null = null
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['final audio chunk']) }); this.onstop?.() }) }
  }
  replace(t, 'MediaRecorder', Recorder)
  replace(t, 'navigator', { mediaDevices: { getUserMedia: async () => stream } })
  replace(t, 'window', {})
  replace(t, 'AudioContext', undefined)
  return { stream, stopped: () => stopped }
}

test('spoken feedback includes the real score and reason, capped at one short paragraph', () => {
  const result = { score: 75, summary: 'You explained arrival order clearly.\n\nAdd how the long job delays shorter jobs.' } as TeachBackResult
  assert.equal(teachBackSpeech(result), 'You scored 75 out of 100. You explained arrival order clearly. Add how the long job delays shorter jobs.')
  const long = teachBackSpeech({ ...result, summary: 'Detailed explanation '.repeat(150) })
  assert.ok(long.split(/\s+/).length <= 75)
  assert.ok(!long.includes('\n'))
})

test('Finish includes the final audio chunk and releases the microphone', async (t) => {
  const fake = setup(t)
  const ctrl = new AbortController()
  let complete: ((blob: Blob) => void) | undefined
  const done = new Promise<Blob>((resolve) => { complete = resolve })
  const rec = await startTeachBackRecording({ signal: ctrl.signal, onPreview() {}, onLevel() {}, onError: assert.fail, onComplete: (blob) => complete!(blob) })
  rec!.stop()
  const blob = await done
  assert.equal(await blob.text(), 'final audio chunk')
  assert.equal(fake.stopped(), 1)
})

test('leaving before microphone permission resolves closes the late stream without starting', async (t) => {
  const fake = setup(t)
  let grant: ((stream: unknown) => void) | undefined
  replace(t, 'navigator', { mediaDevices: { getUserMedia: () => new Promise((resolve) => { grant = resolve }) } })
  const ctrl = new AbortController()
  const pending = startTeachBackRecording({ signal: ctrl.signal, onPreview() {}, onLevel() {}, onError: assert.fail, onComplete: () => assert.fail('must not send cancelled recording') })
  ctrl.abort(); grant!(fake.stream)
  assert.equal(await pending, null)
  assert.equal(fake.stopped(), 1)
})

test('cancel discards the take and a denied microphone offers typing', async (t) => {
  const fake = setup(t)
  const ctrl = new AbortController()
  const rec = await startTeachBackRecording({ signal: ctrl.signal, onPreview() {}, onLevel() {}, onError: assert.fail, onComplete: () => assert.fail('cancelled audio must not be submitted') })
  rec!.cancel()
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(fake.stopped(), 1)
  replace(t, 'navigator', { mediaDevices: { getUserMedia: async () => { throw { name: 'NotAllowedError' } } } })
  let error = ''
  assert.equal(await startTeachBackRecording({ signal: new AbortController().signal, onPreview() {}, onLevel() {}, onError: (message) => { error = message }, onComplete: () => assert.fail('no recording') }), null)
  assert.match(error, /blocked.*Type instead/)
})
