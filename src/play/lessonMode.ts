import type { LessonGate, Owed, RunPhase } from '../lesson/runner.ts'
import type { StageMode } from '../state/mode.ts'

// The guided lesson and the stage mode. Pure (every effect comes in through
// deps), so tests/ui/playModeLesson.test.ts drives it with fakes;
// useLessonMode.ts wires it to the real stores.
//
// Rules:
// (a) Play shuts the lesson: entering stops his line at once
//     and pauses the walkthrough, and while shut the runner says no step.
//     Whatever asks the lesson to play meanwhile (a toy or the boss handing
//     it back, the auto-start) only leaves it owed. A chat answer the student
//     asked for may still finish: the hush skips a held lesson. Going back
//     to Play before he is home keeps it shut and cuts any step line that
//     got through anyway.
// (b) Back in Study the lesson opens again once he has glided back onto his
//     spot (body on his feet, the gap to the spot small or no longer
//     shrinking, the world cross-fade over), and only then picks up what it
//     owes: from the start of the current step's line, and only if it was
//     playing when the student left or someone asked for it since.
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
  // The walkthrough as the student last saw it in Study: another listener on
  // the mode change may already have paused it when ours runs.
  leaving: () => LessonRunView
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
      owed = what === 'play' || owed === 'play' ? 'play' : 'step'
      if (byStudent) deps.toStudy()
    },
  }

  const cancelReturn = () => {
    stopReturn?.()
    stopReturn = null
  }

  function enter() {
    cancelReturn()
    if (shut) {
      // Back to Play before the way home finished: already shut. A step line that got through anyway is
      // cut the moment the mode changes, and stays owed.
      const r = deps.run()
      if (deps.presenting(r.phase)) {
        if (!r.lineDone) owed ??= 'step'
        deps.hush()
        deps.pause()
      }
      return
    }
    const was = deps.leaving()
    owed = was.started && was.playing && was.phase !== 'done' ? 'play' : null
    // Shut first: a hush can finish a quiz answer that switches the mode again.
    shut = true
    deps.shut(gate)
    if (!deps.run().held) deps.hush()
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
