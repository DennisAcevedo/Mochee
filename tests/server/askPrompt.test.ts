import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { courseInstruction, SYSTEM_INSTRUCTION } from '../../server/geminiProxy.ts'

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

// A class with no notes yet (POST /api/ask with `course`): a general tutor for
// it that never claims to have read notes, with nothing on screen to point at.
describe('ask prompt: a class with no notes', () => {
  it('names the class and does not pretend to have its notes', () => {
    const p = courseInstruction('BIO 82 · Genetics')
    assert.match(p, /"BIO 82 · Genetics"/)
    assert.match(p, /No notes have been uploaded/)
    assert.match(p, /Do not claim to have read their notes/)
    assert.doesNotMatch(p, /FCFS/)
  })

  it('never points at the empty window', () => {
    assert.match(courseInstruction('Math'), /never point_left or point_right/)
  })
})
