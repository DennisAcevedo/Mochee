import { create } from 'zustand'
import { notesTabs } from '../../shared/lessonNotes'
import { CELEBRATIONS, type Celebration } from '../character/blender/config'
import { script } from '../data/mockLesson'
import { BUILTIN_TOPIC_REF, GROWTH, isExperimentRunning, skipExperiment, useExperimentRun } from '../growth'
import { useDirector, type LoopClip, type Spot } from '../state/director'
import { useGrowth } from '../state/growth'
import { canCelebrate, useProgress, type CoinReason } from '../state/progress'
import { selectSection, useTutorStore, type Mic, type Mode } from '../state/store'
import { stripMarks } from './markup'
import type { LatencyTrace } from './latency'
import { openCelebrations, pickNoRepeat } from './roam'
import { prefetchSpeech, setVoiceEnabled, speak, speakingText, stopSpeaking } from './speech'
import { QUIZ_FEEDBACK, RESOLVED_STEPS, type ResolvedStep } from './walkthrough'

// Plays the guided lesson (walkthrough.ts) through the director and the tutor
// store: walk to the step's spot, set the stage, gesture, then say the line
// (transcript + voice + caption) and move on after a short gap while playing.
// The quick-check step waits for the answer. A student question holds the
// lesson and picks it back up once the answer has been said. A return
// experiment (src/growth) owns the stage while it runs: the lesson waits.
// Play mode shuts the lesson (the gate below, driven by src/play/lessonMode.ts).

const RUNNER = {
  walkMs: 950, // time to cross between spots before he starts talking
  gapMs: 650, // breath between steps while playing
  autoStartMs: 1400, // after the intro hands over to the live lesson
  hintDelayMs: 1300, // a wrong answer: the shrug plays out (1.2 s clip), then he goes to the notes
} as const

// Where a wrong quick-check answer sends him: the notes line that unlocks it
// (waits are start minus arrival), pointed at from in front of the notes window.
const QUIZ_HINT = { line: 'l4-wait', spot: 'left' as Spot, loop: 'point_left' as LoopClip } as const

// One-time rewards per run; `section` takes the finished section's index after it.
const REWARD_KEYS = { quiz: 'reward:quizCorrect', lesson: 'reward:lessonDone', section: 'reward:section:' } as const

export type RunPhase = 'idle' | 'walking' | 'speaking' | 'gap' | 'waiting' | 'done'

export interface WalkthroughState {
  steps: ResolvedStep[]
  index: number
  started: boolean
  playing: boolean // auto-advance on
  phase: RunPhase
  lineDone: boolean // the current step's line has been said in full
  held: boolean // paused for a student question; picks up after the answer
  quizResult: 'correct' | 'wrong' | null
  reached: string[] // REWARD_KEYS markers already paid
  loopOverride: LoopClip | null // the loop the lesson wants right now; null = StageDirector's default
  muted: boolean

  start: () => void
  next: () => void
  back: () => void
  goTo: (index: number) => void
  pause: () => void
  resume: () => void
  togglePlay: () => void
  restart: () => void
  setMuted: (muted: boolean) => void
  setLoopOverride: (loop: LoopClip | null) => void
  hold: () => void
  release: () => void
  stop: () => void
}

// ---- Timers and helpers (module scope: one lesson at a time)

const timers = new Set<ReturnType<typeof setTimeout>>()
let heldPhase: RunPhase = 'idle'
let expectLine: string | null = null // the line we're about to say ourselves, so the voice hook skips it
let hinting = false // pointing at the notes after a wrong answer; cancelled with the timers

function later(ms: number, fn: () => void) {
  const t = setTimeout(() => {
    timers.delete(t)
    fn()
  }, ms)
  timers.add(t)
}

// Cancelling can shut the play-mode gate (below) itself: it records a pending
// quiz answer, which can master the topic, and the mastery invite (mode
// 'celebrate') shuts the lesson. Callers that go on to speak check the gate
// again afterwards. The student's press that got here is then not a request to
// leave the invite: whatever it asked for stays owed.
function cancelAll() {
  const open = gate === null
  timers.forEach(clearTimeout)
  timers.clear()
  stopSpeaking()
  recordQuiz()
  endHint()
  if (open && gate) byStudent = false
}

function micIdle() {
  if (useTutorStore.getState().mic === 'speaking') useTutorStore.setState({ mic: 'idle' })
}

// ---- Play mode gate
//
// While the stage is in play (src/play/lessonMode.ts holds the gate), no step
// is said: a request to play or to say a step only moves the lesson to that
// step and tells the gate what it owes ('play' = auto-play on, 'step' = say
// this step once). The gate settles it once he is back on his spot in Study,
// and brings him back to Study when the request came from the student's own
// lesson controls.

export type Owed = 'play' | 'step'
export interface LessonGate {
  owe: (what: Owed, byStudent: boolean) => void
}

let gate: LessonGate | null = null
export function shutLesson(next: LessonGate | null) {
  gate = next
}

// Inside one of the student's own lesson controls (Start, Next, Back, a step, Play, Restart).
let byStudent = false
function asStudent(fn: () => void) {
  const was = byStudent
  byStudent = true
  try {
    fn()
  } finally {
    byStudent = was
  }
}

// Silences his current line (a step, quiz feedback, a tab's line) and drops the lesson's pending beats.
export function hush() {
  cancelAll()
  micIdle()
}

// Says the current step once without turning auto-play on: a Next or Back the student pressed in play mode.
export function replayStep() {
  const s = useWalkthrough.getState()
  if (s.started) apply(s.index)
}

// Shut: go to the step without a word, and leave it owed.
function owe(index: number) {
  const s = useWalkthrough.getState()
  if (!s.steps[index]) return
  const what: Owed = s.playing ? 'play' : 'step'
  cancelAll()
  micIdle()
  useWalkthrough.setState({ index, phase: 'idle', playing: false, lineDone: false, held: false, quizResult: null, loopOverride: null })
  gate?.owe(what, byStudent)
}

// Says a line: transcript (plain, plus the marked copy for its key terms), caption (with **bold**), voice. onEnd runs
// when the voice or the reading timer finishes, never after a cancel.
export function sayLine(text: string, onEnd?: () => void, extra?: { mode?: Mode; answer?: number | null }, trace?: LatencyTrace) {
  const plain = stripMarks(text)
  expectLine = plain
  useTutorStore.getState().tutorSays(plain, extra, text)
  expectLine = null
  useDirector.getState().setCaption(text)
  speak(text, () => {
    micIdle()
    onEnd?.()
  }, trace)
}

function rewardOnce(key: string, reason: CoinReason) {
  const { reached } = useWalkthrough.getState()
  if (reached.includes(key)) return
  useWalkthrough.setState({ reached: [...reached, key] })
  useProgress.getState().award(reason)
}

// Puts the room in the step's state (no talking).
function setStage(step: ResolvedStep) {
  const d = useDirector.getState()
  d.walkTo(step.spot)
  d.setFocus(step.focus)
  d.setNotesTab(step.notesTab)
  d.setHighlight(step.highlight)
  d.setBoardReveal(step.boardReveal)
  const t = useTutorStore.getState()
  // A fresh quick check every time the quiz step is reached.
  if (t.mode !== step.mode || step.wait === 'quiz') useTutorStore.setState({ mode: step.mode, answer: null })
}

function apply(index: number) {
  if (gate) return owe(index)
  cancelAll()
  if (gate) return owe(index) // the cancel just shut it (cancelAll)
  const s = useWalkthrough.getState()
  const step = s.steps[index]
  if (!step) return
  // Roaming counts as being somewhere else: walkTo (setStage) calls him back.
  const d = useDirector.getState()
  const moving = d.spot !== step.spot || d.roamX !== null
  useWalkthrough.setState({
    index,
    phase: moving ? 'walking' : 'speaking',
    lineDone: false,
    held: false,
    quizResult: null,
    loopOverride: moving ? 'walk' : step.loop,
  })
  // Reaching the closing step completes the lesson; its line is the send-off.
  if (index === s.steps.length - 1) rewardOnce(REWARD_KEYS.lesson, 'lessonDone')
  setStage(step)
  // Synthesize during the walk and keep a small look-ahead; don't spend the
  // daily voice budget generating an entire lesson the student may never hear.
  prefetchSpeech(step.say)
  const upcoming = s.steps[index + 1]
  if (upcoming) prefetchSpeech(upcoming.say)
  if (step.wait === 'quiz') {
    prefetchSpeech(QUIZ_FEEDBACK.correct)
    prefetchSpeech(QUIZ_FEEDBACK.wrong)
  }
  if (moving) later(RUNNER.walkMs, () => speakStep(step))
  else speakStep(step)
}

// Steps whose gesture and fx already played this run: pressing play again
// (or stepping back to one) replays the line, not the wave, hop or confetti.
const performed = new Set<string>()

function speakStep(step: ResolvedStep) {
  const d = useDirector.getState()
  useWalkthrough.setState({ phase: 'speaking', loopOverride: step.loop })
  const first = !performed.has(step.id)
  performed.add(step.id)
  if (first && step.gesture) d.play(step.gesture)
  if (first && step.fx) d.burst(step.fx[0], step.fx[1])
  if (step.cue) {
    const cue = step.cue
    later(cue.afterMs, () => useDirector.getState().setHighlight(cue.highlight))
  }
  sayLine(step.say, () => lineEnded(step))
}

function lineEnded(step: ResolvedStep) {
  useWalkthrough.setState({ lineDone: true })
  if (step.wait === 'quiz' && useWalkthrough.getState().quizResult !== 'correct') {
    useWalkthrough.setState({ phase: 'waiting', loopOverride: null })
    return
  }
  advanceOrFinish()
}

function advanceOrFinish() {
  const { index, playing, steps } = useWalkthrough.getState()
  if (index >= steps.length - 1) {
    useWalkthrough.setState({ phase: 'done', playing: false, loopOverride: null })
    rewardOnce(REWARD_KEYS.lesson, 'lessonDone')
    return
  }
  if (!playing) {
    useWalkthrough.setState({ phase: 'idle', loopOverride: null })
    return
  }
  // Keep the step's loop through the gap: dropping to idle for 650 ms made him
  // lower his arm and restart the point clip between two board steps.
  useWalkthrough.setState({ phase: 'gap' })
  later(RUNNER.gapMs, () => apply(index + 1))
}

export const presenting = (phase: RunPhase) => phase === 'walking' || phase === 'speaking' || phase === 'gap'

// ---- Quick check

// A right answer's celebration: random among the CELEBRATIONS he can do (the
// non-dances, bounce and the dances bought), never the same one twice in a row
// (the drawers' quiz uses it too, tutorCues.ts).
let lastCelebration: Celebration | null = null
export function nextCelebration(rng: () => number = Math.random): Celebration {
  const { owned } = useProgress.getState()
  const open = openCelebrations(CELEBRATIONS, (c) => canCelebrate(owned, c))
  lastCelebration = pickNoRepeat(open, lastCelebration, rng)
  return lastCelebration
}

function celebrate() {
  const d = useDirector.getState()
  d.play(nextCelebration(), { vary: true }) // a hop or celebrate pick rotates through the cheers (CLIP_VARIANTS)
  d.burst('confetti', 'board')
  d.burst('stars', 'tutor')
  rewardOnce(REWARD_KEYS.quiz, 'quizCorrect')
}

// After a wrong answer's shrug: open the notes on the line that helps, walk
// over and point at it while the feedback plays. The focus (and so the
// camera) stays put, so the quick-check keys stay where the student saw them.
function showHint() {
  if (useTutorStore.getState().mic !== 'speaking') return // the feedback already ended: no hint to point at
  const d = useDirector.getState()
  const tab = notesTabs.findIndex((t) => t.lines.some((l) => l.id === QUIZ_HINT.line))
  if (tab >= 0) d.setNotesTab(tab)
  d.setHighlight(QUIZ_HINT.line)
  d.walkTo(QUIZ_HINT.spot)
  useWalkthrough.setState({ loopOverride: QUIZ_HINT.loop })
  hinting = true
}

function endHint() {
  if (!hinting) return
  hinting = false
  if (useWalkthrough.getState().loopOverride === QUIZ_HINT.loop) useWalkthrough.setState({ loopOverride: null })
}

// The built-in quiz's answer counts toward topic mastery once its feedback
// line is over (or cut short), so a newly learned ability gets its own beat
// instead of talking over the feedback. True when this answer taught him one.
let pendingAnswer: boolean | null = null
function recordQuiz(): boolean {
  if (pendingAnswer === null) return false
  const correct = pendingAnswer
  pendingAnswer = null
  const learned = useGrowth.getState().learnedId
  useGrowth.getState().recordAnswer(BUILTIN_TOPIC_REF, correct)
  return useGrowth.getState().learnedId !== learned
}

// pick() in the store has already put the feedback line in the transcript.
function onQuizAnswer(correct: boolean) {
  useWalkthrough.setState({ held: false }) // the answer takes the floor from any pending question
  const w = useWalkthrough.getState()
  const onQuizStep = w.started && w.steps[w.index]?.wait === 'quiz'
  if (!onQuizStep && presenting(w.phase)) w.pause()
  cancelAll()
  pendingAnswer = correct
  useTutorStore.setState({ mic: 'speaking' })
  const d = useDirector.getState()
  const text = correct ? QUIZ_FEEDBACK.correct : QUIZ_FEEDBACK.wrong
  if (correct) celebrate()
  else {
    d.play('shrug', { urgent: true, vary: true }) // over a step gesture still queued from his walk in; shrug, facepalm, headshake in turn
    later(RUNNER.hintDelayMs, showHint)
  }
  d.setCaption(text)
  if (onQuizStep) useWalkthrough.setState({ quizResult: correct ? 'correct' : 'wrong', phase: 'speaking', loopOverride: null })
  speak(text, () => {
    micIdle()
    const learned = recordQuiz()
    // The hint has been said. He stays by the notes (the lane never covers the
    // quick-check keys): a walk back here would hold a right answer's dance
    // until he arrived, since one-shots wait out a walk.
    endHint()
    if (!onQuizStep) return
    if (correct) {
      useWalkthrough.setState({ lineDone: true })
      // He shows off what he just learned before the lesson moves on.
      if (learned) later(GROWTH.celebrate.captionMs, advanceOrFinish)
      else advanceOrFinish()
    } else useWalkthrough.setState({ phase: 'waiting' })
  })
}

// A tutor line the lesson didn't say itself (the board's Quick check tab, the
// quiz options): give it a voice and a caption too. Not in play mode: a quick
// check answer still gets its feedback, a tab's line stays in the transcript.
// `micBefore` is the mic before tutorSays flagged it as speaking for this line.
function onOtherLine(text: string, micBefore: Mic) {
  if (text === script.correct) return onQuizAnswer(true)
  if (text === script.wrong) return onQuizAnswer(false)
  if (!gate) {
    useWalkthrough.setState({ held: false }) // this line takes the floor from any pending question
    const w = useWalkthrough.getState()
    if (presenting(w.phase)) w.pause()
  }
  // Shut, or the pause just shut it (cancelAll): the line stays unvoiced, so the
  // mic goes back to what it was, unless something else (a chat answer) is still talking.
  if (gate) {
    if (speakingText() === null) useTutorStore.setState({ mic: micBefore === 'speaking' ? 'idle' : micBefore })
    return
  }
  useTutorStore.setState({ mic: 'speaking' })
  useDirector.getState().setCaption(text)
  speak(text, micIdle)
}

// ---- Store

const initialRun = () => ({
  index: 0,
  started: false,
  playing: false,
  phase: 'idle' as RunPhase,
  lineDone: false,
  held: false,
  quizResult: null as 'correct' | 'wrong' | null,
  loopOverride: null as LoopClip | null,
})

// Starting and restarting, shared by the student's controls (the store
// actions, inside asStudent) and the lesson's own callers (the auto-start, resume).
function begin() {
  performed.clear()
  useWalkthrough.setState({ started: true, playing: true })
  apply(0)
}

function startOver() {
  const shutBefore = gate !== null
  cancelAll()
  micIdle()
  // Unless the cancel just opened the mastery invite (cancelAll): its celebration has the stage.
  if (shutBefore || !gate) useDirector.getState().resetStage()
  performed.clear()
  useWalkthrough.setState({ ...initialRun(), started: true, playing: true })
  apply(0)
}

export const useWalkthrough = create<WalkthroughState>((set, get) => ({
  ...initialRun(),
  steps: RESOLVED_STEPS,
  reached: [],
  muted: false,

  start: () => asStudent(begin),

  // Moving through the lesson during a return experiment skips it. The index
  // is read first: ending the run can resume the lesson synchronously.
  next: () =>
    asStudent(() => {
      const { index, steps, started } = get()
      if (isExperimentRunning()) skipExperiment()
      if (!started) return begin()
      if (index < steps.length - 1) apply(index + 1)
    }),

  back: () =>
    asStudent(() => {
      const { index, started } = get()
      if (isExperimentRunning()) skipExperiment()
      if (started && index > 0) apply(index - 1)
    }),

  // Jumping to a step (progress track) plays on from there.
  goTo: (index) =>
    asStudent(() => {
      if (isExperimentRunning()) skipExperiment()
      set({ started: true, playing: true })
      apply(Math.max(0, Math.min(index, get().steps.length - 1)))
    }),

  pause: () => {
    const { phase } = get()
    set({ playing: false })
    if (presenting(phase)) {
      cancelAll()
      micIdle()
      set({ phase: 'idle', loopOverride: null })
    }
  },

  resume: () => {
    const s = get()
    // Play mode: nothing is said; the gate keeps the request for the way back.
    if (gate && s.started && s.phase !== 'done') return gate.owe('play', byStudent)
    // Asked to play during a return experiment: carry on once it ends (connectLesson).
    if (isExperimentRunning()) return set({ playing: true })
    if (!s.started) return begin()
    if (s.phase === 'done') return startOver()
    set({ playing: true })
    if (s.held || s.phase === 'waiting' || presenting(s.phase)) return
    if (!s.lineDone) apply(s.index)
    else if (s.index < s.steps.length - 1) apply(s.index + 1)
    else advanceOrFinish()
  },

  togglePlay: () =>
    asStudent(() => {
      const s = get()
      if (s.playing && s.started && s.phase !== 'done') s.pause()
      else s.resume()
    }),

  restart: () => asStudent(startOver),

  setMuted: (muted) => {
    setVoiceEnabled(!muted)
    set({ muted })
  },

  setLoopOverride: (loopOverride) => set({ loopOverride }),

  // A student question (typed or spoken) takes the floor.
  hold: () => {
    const s = get()
    if (!s.started || s.held) return
    heldPhase = s.phase
    if (presenting(s.phase)) cancelAll()
    set({ held: true, phase: s.phase === 'waiting' || s.phase === 'done' ? s.phase : 'idle', loopOverride: null })
  },

  // The answer has been said: pick the lesson back up where it was.
  release: () => {
    const s = get()
    if (!s.held) return
    set({ held: false })
    const step = s.steps[s.index]
    const quizOpen = step.wait === 'quiz' && s.quizResult !== 'correct'
    if (heldPhase === 'waiting' || (quizOpen && s.lineDone)) {
      setStage(step) // back to the board for the quick check
      set({ phase: 'waiting' })
    } else if (!s.playing) {
      return
    } else if (s.lineDone) {
      advanceOrFinish() // the line (or the quiz praise) was already said: carry on
    } else {
      apply(s.index) // the line was cut off: say it again
    }
  },

  // Leaving the lesson: silence and reset (rewards and the mute choice stay).
  stop: () => {
    useTutorStore.setState({ awaitingReply: false })
    cancelAll()
    micIdle()
    set(initialRun())
  },
}))

// Hooks the lesson up to the tutor store: voices lines the lesson didn't say
// itself, reacts to quick-check answers, and (optionally) starts the lesson
// once the intro hands over. Returns the disconnect (also stops the lesson).
export function connectLesson({ autoStart = true }: { autoStart?: boolean } = {}): () => void {
  let autoTimer: ReturnType<typeof setTimeout> | undefined
  const maybeAutoStart = () => {
    if (useTutorStore.getState().phase === 'intro') prefetchSpeech(RESOLVED_STEPS[0].say)
    if (!autoStart || autoTimer || useWalkthrough.getState().started) return
    if (useTutorStore.getState().phase !== 'live') return
    autoTimer = setTimeout(() => {
      autoTimer = undefined
      if (isExperimentRunning()) return // starts when the experiment ends (below)
      // Not the student's own press: in play mode it waits for Study instead of pulling him there.
      if (!useWalkthrough.getState().started && useTutorStore.getState().phase === 'live') begin()
    }, RUNNER.autoStartMs)
  }

  // A return experiment pauses a playing lesson; when it ends the lesson
  // carries on, or starts if it was still waiting to.
  let pausedForRun = false
  const unsubRun = useExperimentRun.subscribe((s, prev) => {
    const w = useWalkthrough.getState()
    if (s.run && !prev.run && w.started && w.playing && w.phase !== 'done') {
      pausedForRun = true
      w.pause()
    } else if (!s.run && prev.run) {
      if (pausedForRun || w.playing) w.resume()
      else maybeAutoStart()
      pausedForRun = false
    }
  })

  const unsub = useTutorStore.subscribe((s, prev) => {
    if (s.phase !== prev.phase) maybeAutoStart()
    // A section finished: the header's "Section N of M" moved on. Paid once per section per
    // run (rewardOnce), so stepping back and forward over it pays nothing more.
    const from = selectSection(prev)
    if (selectSection(s) > from && useWalkthrough.getState().started) rewardOnce(`${REWARD_KEYS.section}${from}`, 'sectionDone')
    if (s.lines.length <= prev.lines.length) return
    const last = s.lines[s.lines.length - 1]
    if (!last || last.who !== 'tutor' || last.greeting || !last.text || last.text === expectLine) return
    onOtherLine(last.text, prev.mic)
  })
  maybeAutoStart()

  return () => {
    unsub()
    unsubRun()
    clearTimeout(autoTimer)
    useWalkthrough.getState().stop()
  }
}
