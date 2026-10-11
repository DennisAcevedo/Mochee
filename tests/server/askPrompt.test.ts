import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SYSTEM_INSTRUCTION } from '../../server/geminiProxy.ts'

// The ask box's system prompt (POST /api/ask). The tutor and the student face
// each other across the stage, so "his left" would be the student's right:
// the window is placed from the student's side, and the model is told how to
// say it out loud.

describe('ask prompt: sides', () => {
  it('never places the window on "his left"', () => {
    assert.doesNotMatch(SYSTEM_INSTRUCTION, /\bhis left\b/i)
  })

  it('places it on the student\'s left and asks for "on your left" when speaking', () => {
    assert.match(SYSTEM_INSTRUCTION, /student's left/)
    assert.match(SYSTEM_INSTRUCTION, /"on your left"/)
  })
})
