import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createRoomVisits } from '../../src/play/roomVisits.ts'

it('remembers Study and Play independently for each tutor, including a fresh session', () => {
  let saved: string | null = null
  const storage = () => ({ getItem: () => saved, setItem: (_: string, value: string) => { saved = value } })
  const visits = createRoomVisits(storage)
  assert.equal(visits.enter('one', 'study'), true)
  assert.equal(visits.enter('one', 'study'), false)
  assert.equal(visits.enter('one', 'play'), true)
  assert.equal(visits.enter('two', 'study'), true)
  const reloaded = createRoomVisits(storage)
  assert.equal(reloaded.enter('one', 'study'), false)
  assert.equal(reloaded.enter('one', 'play'), false)
  assert.equal(reloaded.enter('two', 'play'), true)
})

it('keeps session memory if storage is unavailable', () => {
  const visits = createRoomVisits(() => { throw new Error('Storage blocked') })
  assert.equal(visits.enter('one', 'study'), true)
  assert.equal(visits.enter('one', 'study'), false)
  assert.equal(visits.enter('one', 'play'), true)
})

it('recovers from malformed storage and remembers an interrupted entry', () => {
  let saved = '{broken'
  const visits = createRoomVisits(() => ({ getItem: () => saved, setItem: (_, value) => { saved = value } }))
  assert.equal(visits.enter('one', 'play'), true)
  // Leaving before the welcome begins still counts as a visit.
  assert.equal(visits.enter('one', 'play'), false)
  assert.ok(Array.isArray(JSON.parse(saved)))
})
