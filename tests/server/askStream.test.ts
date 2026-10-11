import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { firstSentence, partialString, restAfter } from '../../shared/askStream.ts'

// The streamed ask reply (shared/askStream.ts): reading fields out of a JSON
// reply that is still arriving, and finding the first sentence he can say.

describe('ask stream: partial JSON', () => {
  it('reads a field before its closing quote arrives', () => {
    assert.deepEqual(partialString('{"gesture":"talk","answer":"FCFS runs jo', 'answer'), { value: 'FCFS runs jo', closed: false })
    assert.deepEqual(partialString('{"gesture":"talk","answer":"', 'gesture'), { value: 'talk', closed: true })
  })

  it('is null until the field has started', () => {
    assert.equal(partialString('{"gesture":"talk","ans', 'answer'), null)
  })

  it('decodes escapes and leaves a half-written one out', () => {
    assert.equal(partialString('{"answer":"say \\"hi\\"\\nnow \\u00e9', 'answer')?.value, 'say "hi"\nnow é')
    assert.equal(partialString('{"answer":"cut \\', 'answer')?.value, 'cut ')
    assert.equal(partialString('{"answer":"cut \\u00', 'answer')?.value, 'cut ')
  })
})

describe('ask stream: first sentence', () => {
  it('waits for the space after the stop, so 3.5 is not a break', () => {
    assert.equal(firstSentence('FCFS averages 3.5'), null)
    assert.equal(firstSentence('FCFS runs jobs in order.'), null)
    assert.equal(firstSentence('FCFS runs jobs in order. Then'), 'FCFS runs jobs in order.')
  })

  it('skips a stop that is too early or inside **bold**', () => {
    assert.equal(firstSentence('Hi! FCFS runs jobs in order. Next'), 'Hi! FCFS runs jobs in order.')
    assert.equal(firstSentence('It is **first come. first served** here. Next'), 'It is **first come. first served** here.')
  })

  it('splits off the rest, and never repeats a line that does not match', () => {
    assert.equal(restAfter('One sentence here. And the rest.', 'One sentence here.'), 'And the rest.')
    assert.equal(restAfter('Something else entirely.', 'One sentence here.'), '')
  })
})
