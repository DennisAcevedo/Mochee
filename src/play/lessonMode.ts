import type { LessonGate, Owed, RunPhase } from '../lesson/runner.ts'
import type { StageMode } from '../state/mode.ts'

// The guided lesson and the stage mode. Pure (every effect comes in through
// deps), so tests/ui/playModeLesson.test.ts drives it with fakes;
// useLessonMode.ts wires it to the real stores.
//
// Rules:
// (a) Play shuts the lesson: entering stops his line at once
//     and pauses the walkthrough, and while shut the runner says no step.
//     Automatic resume requests are ignored. A chat answer the student
//     asked for is also cancelled on a room change. Switching
//     back to Play before he arrives keeps it shut and cuts any step line that
//     got through anyway.
// (b) Back in Study the lesson opens again once he has glided back onto his
//     spot (body on his feet, the gap to the spot small or no longer
//     shrinking, the world cross-fade over). Returning stays quiet unless
//     the student explicitly used a lesson control to request playback.
// (c) The student's own lesson controls (Start, Play, Next, Back, a step,
//     Restart) pressed while shut bring him back to Study; (b) does the rest.

export interface LessonReturn {
  pollMs: number // how often the way back is checked
  minMs: number // at least the world cross-fade
  nearM: number // metres from his spot that count as there
  stillM: number // or: the gap moved less than this between two checks
  maxMs: number // never wait longer than this for him
}

export interface LessonRunView {
  started: boolean
  playing: boolean
  phase: RunPhase
  held: boolean
  lineDone: boolean
}

export interface LessonModeDeps {
  run: () => LessonRunView
  presenting: (phase: RunPhase) => boolean // runner.ts presenting(): a step is walking in, being said, or in its gap
  pause: () => void // the walkthrough's pause()
  resume: () => void // the walkthrough's resume()
  replay: () => void // says the current step once, auto-play left off
  hush: () => void // silences his current line
  shut: (gate: LessonGate | null) => void
  toStudy: () => void
  gap: () => number | null // metres from his body to his spot; null while he is off his feet
  every: (ms: number, fn: () => void) => () => void // repeating timer; returns its cancel
  now: () => number
  tuning: LessonReturn
}

export interface LessonMode {
  onMode: (mode: StageMode) => void
  dispose: () => void
  view: () => { shut: boolean; owed: Owed | null; returning: boolean }
}

export function createLessonMode(deps: LessonModeDeps): LessonMode {
  const t = deps.tuning
  let shut = false
  let owed: Owed | null = null
  let stopReturn: (() => void) | null = null

  const gate: LessonGate = {
    owe: (what, byStudent) => {
      if (!byStudent) return
      owed = what === 'play' || owed === 'play' ? 'play' : 'step'
      deps.toStudy()
    },
  }

  const cancelReturn = () => {
    stopReturn?.()
    stopReturn = null
  }

  function enter() {
    cancelReturn()
    owed = null
    if (shut) {
      // Back to Play before arriving: already shut. A step line that got through is
      // cut the moment the mode changes.
      const r = deps.run()
      deps.hush()
      if (deps.presenting(r.phase)) {
        deps.pause()
      }
      return
    }
    // Shut first: a hush can finish a quiz answer that switches the mode again.
    shut = true
    deps.shut(gate)
    deps.hush()
    deps.pause()
  }

  function open() {
    cancelReturn()
    shut = false
    deps.shut(null)
    const what = owed
    owed = null
    if (!what || !deps.run().started) return
    if (what === 'play') deps.resume()
    else deps.replay()
  }

  function leave() {
    if (!shut || stopReturn) return
    // Play greetings and chat do not use the lesson's presenting phase.
    // Cut them before waiting for the return movement, too.
    deps.hush()
    const since = deps.now()
    let last: number | null = null
    stopReturn = deps.every(t.pollMs, () => {
      const gap = deps.gap()
      const waited = deps.now() - since
      const settled = gap !== null && (gap <= t.nearM || (last !== null && Math.abs(gap - last) <= t.stillM))
      last = gap
      if ((settled && waited >= t.minMs) || waited >= t.maxMs) open()
    })
  }

  return {
    onMode: (mode) => (mode === 'study' ? leave() : enter()),
    dispose: () => {
      cancelReturn()
      owed = null
      if (!shut) return
      shut = false
      deps.shut(null)
    },
    view: () => ({ shut, owed, returning: stopReturn !== null }),
  }
}
