import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listenHandsFree, type HandsFreeRecognizer } from '../../src/lesson/handsFree.ts'

function fixture() {
  const instances: Rec[] = []
  class Rec implements HandsFreeRecognizer {
    lang = ''; continuous = false; interimResults = false
    onresult: HandsFreeRecognizer['onresult'] = null
    onend: HandsFreeRecognizer['onend'] = null
    onerror: HandsFreeRecognizer['onerror'] = null
    aborted = false
    constructor() { instances.push(this) }
    start() {}
    stop() { this.result('Why does the short job wait?', true); this.onend?.() }
    abort() { this.aborted = true }
    result(text: string, final = false) {
      this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: final })] })
    }
  }
  const questions: string[] = [], errors: string[] = [], previews: string[] = []
  const cancel = listenHandsFree(Rec, { onText: (s) => previews.push(s), onQuestion: (s) => questions.push(s), onError: (s) => errors.push(s) }, { silence: 1800, restart: 700, stop: 1500 })
  return { instances, questions, errors, previews, cancel }
}

test('a pause sends the final corrected question once and releases recognition before submission', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture(); t.after(f.cancel)
  f.instances[0].result('Why does the short')
  t.mock.timers.tick(1700)
  assert.deepEqual(f.questions, [])
  f.instances[0].result('Why does the short job')
  t.mock.timers.tick(1800)
  assert.deepEqual(f.questions, ['Why does the short job wait?'])
  assert.equal(f.instances[0].aborted, true)
  t.mock.timers.tick(10000)
  assert.equal(f.questions.length, 1)
  assert.equal(f.instances.length, 1)
})

test('silent sessions restart without submitting a fabricated question', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture(); t.after(f.cancel)
  const staleEnd = f.instances[0].onend
  f.instances[0].onerror?.({ error: 'no-speech' })
  t.mock.timers.tick(700)
  staleEnd?.()
  assert.equal(f.instances.length, 2)
  assert.equal(f.instances[1].aborted, false)
  assert.deepEqual(f.questions, [])
  assert.deepEqual(f.errors, [])
})

test('permission and network errors stop rather than repeatedly requesting access', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  for (const error of ['not-allowed', 'network', 'audio-capture']) {
    const f = fixture(); t.after(f.cancel)
    f.instances[0].onerror?.({ error })
    t.mock.timers.tick(10000)
    assert.equal(f.instances.length, 1)
    assert.equal(f.errors.length, 1)
    assert.deepEqual(f.questions, [])
    assert.equal(f.instances[0].aborted, true)
  }
})

test('pausing or leaving cancels pending recognition and ignores late results', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const lateResult = f.instances[0].onresult
  f.instances[0].result('An unfinished question')
  f.cancel()
  lateResult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'late question' }], { isFinal: true })] })
  t.mock.timers.tick(10000)
  assert.deepEqual(f.questions, [])
  assert.deepEqual(f.previews, ['An unfinished question'])
  assert.equal(f.instances[0].aborted, true)
})

test('browser ending a spoken session submits its transcript once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture(); t.after(f.cancel)
  f.instances[0].result('What is a queue?', true)
  f.instances[0].onend?.()
  t.mock.timers.tick(10000)
  assert.deepEqual(f.questions, ['What is a queue?'])
})
