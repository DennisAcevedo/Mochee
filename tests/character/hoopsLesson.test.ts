import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lessonTakesStage, type LessonView } from '../../src/scene/hoops/staging.ts'

// The lesson around play (src/scene/hoops/staging.ts): a ball move yields at
// once when the lesson takes the stage mid-move, rather than being cut by it.

describe('staging: the lesson around play', () => {
  const v = (playing: boolean, presenting: boolean): LessonView => ({ playing, presenting })

  it('a move yields the moment the lesson starts presenting mid-move (the resume that cut it)', () => {
    // The student's resume: playing and the step's walk / line in the same beat.
    assert.ok(lessonTakesStage(v(false, false), v(true, true)))
    // A line presented without playing (a tab's line, quiz feedback).
    assert.ok(lessonTakesStage(v(false, false), v(false, true)))
  })

  it('a resume that has not walked him anywhere yet lets the move play on, until its step presents', () => {
    // Held for a question, or waiting on the quick check: only playing flips.
    assert.ok(!lessonTakesStage(v(false, false), v(true, false)))
    // The release then presents the step: now it yields.
    assert.ok(lessonTakesStage(v(true, false), v(true, true)))
  })

  it('already presenting (between a step walk and its line), or going quiet: nothing new', () => {
    assert.ok(!lessonTakesStage(v(true, true), v(true, true)))
    assert.ok(!lessonTakesStage(v(true, true), v(false, false)))
    assert.ok(!lessonTakesStage(v(false, false), v(false, false)))
  })
})
