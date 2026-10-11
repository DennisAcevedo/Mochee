import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LessonGate, Owed } from '../../src/lesson/runner.ts'
import { createLessonMode, type LessonReturn, type LessonRunView } from '../../src/play/lessonMode.ts'

// The lesson in play mode (src/play/lessonMode.ts) against a fake walkthrough
// that behaves like src/lesson/runner.ts where it matters: while the gate is
// shut, resume() and every step request only report what they owe; with it
// open, they say a line (logged in `said`).

const TUNING: LessonReturn = { pollMs: 100, minMs: 420, nearM: 0.1, stillM: 0.006, maxMs: 6000 }

interface Fake {
  run: LessonRunView & { index: number; lineDone: boolean }
  gate: LessonGate | null
  said: string[] // 'line:<index>' each time a step's line starts
  mode: string
  gap: number | null
  t: number
  tick: (() => void) | null
  onCancel: (() => void) | null // runner.ts cancelAll() side effects (recording a quiz answer can master the topic)
}

const presenting = (phase: string) => phase === 'walking' || phase === 'speaking' || phase === 'gap'

function setup(run: Partial<Fake['run']> = {}) {
  const f: Fake = {
    run: { started: true, playing: true, phase: 'speaking', held: false, index: 2, lineDone: false, ...run },
    gate: null,
    said: [],
    mode: 'study',
    gap: 0,
    t: 0,
    tick: null,
    onCancel: null,
  }
  const log: string[] = []
  // runner.ts in miniature: apply() goes through the gate first, cancels the
  // current beat, then checks the gate again (the cancel can shut it).
  const apply = (index: number, byStudent: boolean) => {
    const owe = (student: boolean) => {
      const what: Owed = f.run.playing ? 'play' : 'step'
      Object.assign(f.run, { index, phase: 'idle', playing: false, lineDone: false })
      f.gate?.owe(what, student)
    }
    if (f.gate) return owe(byStudent)
    const cancel = f.onCancel
    f.onCancel = null
    cancel?.()
    if (f.gate) return owe(false)
    Object.assign(f.run, { index, phase: 'speaking', lineDone: false })
    f.said.push(`line:${index}`)
  }
  const resume = (byStudent = false) => {
    if (f.gate && f.run.started && f.run.phase !== 'done') return f.gate.owe('play', byStudent)
    f.run.playing = true
    if (f.run.held || f.run.phase === 'waiting' || f.run.phase === 'speaking') return
    apply(f.run.lineDone ? f.run.index + 1 : f.run.index, byStudent)
  }
  const ctl = createLessonMode({
    run: () => f.run,
    presenting,
    pause: () => {
      log.push('pause')
      f.run.playing = false
      if (presenting(f.run.phase)) f.run.phase = 'idle'
    },
    resume: () => resume(),
    replay: () => apply(f.run.index, false),
    hush: () => log.push('hush'),
    shut: (g) => {
      f.gate = g
    },
    toStudy: () => {
      f.mode = 'study'
      ctl.onMode('study')
    },
    gap: () => f.gap,
    every: (_ms, fn) => {
      f.tick = fn
      return () => {
        f.tick = null
      }
    },
    now: () => f.t,
    tuning: TUNING,
  })
  const setMode = (mode: 'study' | 'play') => {
    f.mode = mode
    ctl.onMode(mode)
  }
  // Advance the return poll by `ms`, one check per pollMs; `gapAt` moves him meanwhile.
  const wait = (ms: number, gapAt?: (t: number) => number | null) => {
    for (let n = 0; n < ms / TUNING.pollMs; n++) {
      f.t += TUNING.pollMs
      if (gapAt) f.gap = gapAt(f.t)
      f.tick?.()
    }
  }
  const student = {
    next: () => apply(f.run.index + 1, true),
    back: () => apply(f.run.index - 1, true),
    play: () => resume(true),
  }
  // Another listener on the mode change (src/scene/hoops/lessonQuiet.ts) pauses the lesson before ours runs.
  const otherGuardPausesFirst = () => {
    f.run.playing = false
    f.run.phase = 'idle'
  }
  return { f, ctl, log, setMode, wait, resume, student, otherGuardPausesFirst }
}

describe('play mode shuts the lesson (rule a)', () => {
  it('entering play stops the line at once and pauses the lesson', () => {
    const { f, ctl, log, setMode } = setup()
    setMode('play')
    assert.deepEqual(log, ['hush', 'pause'])
    assert.equal(f.run.playing, false)
    assert.equal(f.run.phase, 'idle')
    assert.ok(f.gate, 'the runner gate is shut')
    assert.deepEqual(ctl.view(), { shut: true, owed: null, returning: false })
  })

  it('a chat answer in flight is cut off even when the lesson is held', () => {
    const { log, setMode } = setup({ held: true, phase: 'idle' })
    setMode('play')
    assert.deepEqual(log, ['hush', 'pause'])
  })

  it('nothing un-pauses it in play: hoops, the boss end, the auto-start', () => {
    const { f, ctl, setMode, resume } = setup({ playing: false, phase: 'idle' })
    setMode('play')
    assert.equal(ctl.view().owed, null, 'paused by the student before play: nothing owed')
    resume() // BallProp finish / fight stop, all non-student
    resume()
    assert.deepEqual(f.said, [])
    assert.equal(f.run.playing, false)
    assert.equal(f.mode, 'play', 'a non-student request never pulls him out of play')
    assert.equal(ctl.view().owed, null)
  })
})

describe('back to study (rule b)', () => {
  it('immediately cuts a play greeting or answer before waiting for the return', () => {
    const { f, log, setMode, wait } = setup({ playing: false, phase: 'idle', held: true })
    setMode('play')
    log.length = 0
    setMode('study')
    assert.deepEqual(log, ['hush'])
    assert.deepEqual(f.said, [])
    wait(1000)
    assert.deepEqual(f.said, [], 'a paused lesson does not restart on its own')
  })
  it('opens the gate once he is home but leaves the lesson paused', () => {
    const { f, ctl, setMode, wait } = setup()
    setMode('play')
    f.gap = 1.6 // thrown across the room
    setMode('study')
    assert.ok(ctl.view().returning)
    wait(300, (t) => 1.6 * Math.exp((-3 * t) / 1000))
    assert.deepEqual(f.said, [], 'nothing while the world fades and he glides back')
    assert.ok(f.gate, 'still shut while he is away')
    wait(1200, (t) => 1.6 * Math.exp((-3 * t) / 1000))
    assert.deepEqual(f.said, [], 'returning never resumes the old script')
    assert.equal(f.gate, null)
    assert.equal(f.run.playing, false)
    assert.deepEqual(ctl.view(), { shut: false, owed: null, returning: false })
  })

  it('a finished line does not start the next step on return', () => {
    const { f, setMode, wait } = setup({ phase: 'gap', lineDone: true })
    setMode('play')
    setMode('study')
    wait(500)
    assert.deepEqual(f.said, [])
  })

  it('waits at least the cross-fade even when he never left his spot', () => {
    const { f, setMode, wait, student } = setup()
    setMode('play')
    student.play()
    wait(TUNING.minMs - TUNING.pollMs)
    assert.deepEqual(f.said, [])
    wait(TUNING.pollMs * 2)
    assert.deepEqual(f.said, ['line:2'])
  })

  it('does not wait while he is held or flying, then settles on a parked offset', () => {
    const { f, setMode, wait, student } = setup()
    setMode('play')
    f.gap = null
    student.play()
    wait(2000)
    assert.deepEqual(f.said, [], 'off his feet: keep waiting')
    wait(500, () => 0.4) // landed, standing 0.4 m off his spot and staying there
    assert.deepEqual(f.said, ['line:2'])
  })

  it('gives up waiting after maxMs', () => {
    const { f, setMode, wait, student } = setup()
    setMode('play')
    f.gap = null
    student.play()
    wait(TUNING.maxMs + TUNING.pollMs)
    assert.deepEqual(f.said, ['line:2'])
  })

  it('another guard pausing it first still leaves the return quiet', () => {
    const { f, ctl, setMode, wait, otherGuardPausesFirst } = setup()
    otherGuardPausesFirst()
    setMode('play')
    assert.equal(ctl.view().owed, null)
    setMode('study')
    wait(500)
    assert.deepEqual(f.said, [])
  })

  it('stays paused when the student had paused it', () => {
    const { f, setMode, wait } = setup({ playing: false, phase: 'idle' })
    setMode('play')
    setMode('study')
    wait(1000)
    assert.deepEqual(f.said, [])
    assert.equal(f.gate, null, 'open again for his own controls')
    assert.equal(f.run.playing, false)
  })

  it('a finished or never-started lesson says nothing on the way back', () => {
    for (const run of [{ phase: 'done', playing: false }, { started: false, playing: false, phase: 'idle' }]) {
      const { f, setMode, wait } = setup(run)
      setMode('play')
      setMode('study')
      wait(1000)
      assert.deepEqual(f.said, [])
    }
  })

  it('flipping back to play mid-way cancels the return', () => {
    const { f, ctl, setMode, wait } = setup()
    setMode('play')
    f.gap = 2
    setMode('study')
    wait(200, () => 2)
    setMode('play')
    assert.deepEqual(ctl.view(), { shut: true, owed: null, returning: false })
    wait(2000, () => 0)
    assert.deepEqual(f.said, [])
  })
})

describe("the student's own controls (rule c)", () => {
  it('Play in play mode brings him back to Study, then the lesson plays', () => {
    const { f, setMode, wait, student } = setup({ playing: false, phase: 'idle' })
    setMode('play')
    student.play()
    assert.equal(f.mode, 'study')
    assert.deepEqual(f.said, [], 'not a word until he is home')
    wait(500)
    assert.deepEqual(f.said, ['line:2'])
    assert.equal(f.run.playing, true)
  })

  it('Next while paused says that one step and leaves auto-play off', () => {
    const { f, setMode, wait, student } = setup({ playing: false, phase: 'idle' })
    setMode('play')
    student.next()
    assert.equal(f.mode, 'study')
    assert.equal(f.run.index, 3)
    wait(500)
    assert.deepEqual(f.said, ['line:3'])
    assert.equal(f.run.playing, false)
  })

  it('Back after leaving a playing lesson says one step without auto-play', () => {
    const { f, setMode, wait, student } = setup()
    setMode('play')
    student.back()
    wait(500)
    assert.deepEqual(f.said, ['line:1'])
    assert.equal(f.run.playing, false)
  })

  it('with the gate open (study) the controls speak at once', () => {
    const { f, student } = setup({ playing: false, phase: 'idle' })
    student.next()
    assert.deepEqual(f.said, ['line:3'])
    assert.equal(f.mode, 'study')
  })
})

describe('lifecycle', () => {
  it('dispose opens the gate and stops the return poll', () => {
    const { f, ctl, setMode } = setup()
    setMode('play')
    setMode('study')
    ctl.dispose()
    assert.equal(f.gate, null)
    assert.equal(f.tick, null)
    assert.deepEqual(ctl.view(), { shut: false, owed: null, returning: false })
  })

  it('study on mount (gate never shut) is a no-op', () => {
    const { f, ctl, log } = setup()
    ctl.onMode('study')
    assert.deepEqual(log, [])
    assert.equal(f.tick, null)
    assert.equal(f.gate, null)
  })
})
