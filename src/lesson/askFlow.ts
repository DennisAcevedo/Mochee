import { create } from 'zustand'
import { lectureBoard } from '../data/mockLesson'
import { currentQuestion, useQuickCheck } from './quickCheck'
import { boardShows, type BoardPart } from '../data/stageContent'
import { notesTabs } from '../../shared/lessonNotes'
import { useDirector } from '../state/director'
import { useTutorStore } from '../state/store'
import { useMode } from '../state/mode'
import { askGeminiStream, mockReply, type AskSource } from './askGemini'
import type { AskStart } from '../../shared/askStream'
import { ASK_LIMITS, ASK_LINES, type AskLesson, type AskReply, type AskTurn } from '../../shared/askTypes'
import { packBoard, packBoardShows, packNotes, packStepSection, useLessonPack } from './packSession'
import { isLoopGesture, isOneShotGesture } from './askGestures'
import { stripMarks } from './markup'
import { startLatency, type LatencyTrace } from './latency'
import { sayLine, sayLineStreamed, useWalkthrough } from './runner'
import { startLoop } from '../scene/windows/pointGate'
import { isRecognizing, startRecognition, stopRecognition, stopSpeaking } from './speech'

// The ask box and the mic, end to end: the student's line goes in the
// transcript (store.ask), the lesson holds, he thinks, Gemini answers through
// the server proxy (or the scripted reply if it can't), then he walks to the
// window the answer is about, points, highlights the line and says it.

const ASK_FLOW = {
  offlineToast: 'Gemini is offline, so I used my notes.',
} as const

// What the last answer came from, for the lab page and the UI.
export const useAskStatus = create<{ pending: boolean; source: AskSource | null; model: string | null }>(() => ({
  pending: false,
  source: null,
  model: null,
}))

let seq = 0
let finishing = false
let pendingAnswer: AbortController | null = null

// Invalidate both a request still loading and a streamed answer whose first
// sentence already played. Late chunks must not speak in a different room.
export function cancelTutorAnswer() {
  seq++
  pendingAnswer?.abort()
  pendingAnswer = null
  useAskStatus.setState({ pending: false })
  useTutorStore.setState({ awaitingReply: false })
  useWalkthrough.setState({ held: false })
}

const BOARD_TEXT: Record<BoardPart, string> = {
  heading: lectureBoard.heading,
  p1: 'Gantt: P1 runs 0 to 24 ms',
  p2p3: 'P2 runs 24 to 27, P3 runs 27 to 30',
  ticks: 'time axis 0, 24, 30',
  working: lectureBoard.workingLine,
  result: `average wait = ${lectureBoard.result}`,
  footnote: lectureBoard.footnote,
}

// A short text picture of what's on screen, so the answer can refer to it.
// A notebook's lesson (a pack from an uploaded document): its title and
// topics, and the current topic's notes and board as the window shows them.
function packContext(): { context: { step: string; notes: string; board: string }; lesson: AskLesson } | null {
  const pack = useLessonPack.getState().pack
  if (!pack || !pack.sections.length) return null
  const w = useWalkthrough.getState()
  const d = useDirector.getState()
  const step = w.steps[w.index]
  const last = pack.sections.length - 1
  const section = Math.min(last, Math.max(0, (step && packStepSection(step.id)) ?? d.notesTab ?? 0))
  const tab = packNotes(pack, section)
  const board = packBoard(pack, section)
  const shown = [board.heading, ...board.lines].filter((_, part) => packBoardShows(part, d.boardReveal))
  return {
    lesson: { title: pack.title, topics: pack.sections.map((s) => s.title) },
    context: {
      step: w.started && step ? `${step.title}: ${stripMarks(step.say)}` : `Lesson not started yet (document: ${pack.title})`,
      notes: `${tab.title} (${tab.page}): ` + tab.lines.map((l) => `${l.id === d.highlight ? '[highlighted] ' : ''}${l.text}`).join(' / '),
      board: useTutorStore.getState().mode === 'quiz' ? quizText() : shown.join(' / ') || 'empty',
    },
  }
}

// The Quick check's current question as the board shows it (no answer: a document's stays on the server).
function quizText() {
  const qc = useQuickCheck.getState()
  const q = currentQuestion(qc)
  if (!q) return 'Quick check: questions still loading'
  const picked = qc.picked === null ? 'nothing yet' : `${q.choices[qc.picked]} (${qc.result ?? 'checking'})`
  return `Quick check question ${qc.index + 1} of ${qc.questions.length}: ${stripMarks(q.prompt)} Options: ${q.choices.join(', ')}. Student picked: ${picked}. Do not reveal the answer; give a hint.`
}

function lessonContext() {
  const w = useWalkthrough.getState()
  const d = useDirector.getState()
  const t = useTutorStore.getState()
  const step = w.steps[w.index]
  const tab = notesTabs[d.notesTab] ?? notesTabs[0]
  const notes =
    `${tab.title}: ` +
    tab.lines.map((l) => `${l.id === d.highlight ? '[highlighted] ' : ''}${l.cells ? l.cells.join(' | ') : l.text}`).join(' / ')
  const board =
    t.mode === 'quiz'
      ? quizText()
      : (Object.keys(BOARD_TEXT) as BoardPart[])
          .filter((p) => boardShows(p, d.boardReveal))
          .map((p) => BOARD_TEXT[p])
          .join(' / ') || 'empty'
  return {
    step: w.started ? `${step.title}: ${stripMarks(step.say)}` : 'Lesson not started yet (topic: FCFS CPU scheduling)',
    notes,
    board,
  }
}

function recentHistory(): AskTurn[] {
  const lines = useTutorStore.getState().lines
  return lines
    .slice(0, -1) // the question itself goes separately
    .filter((l) => l.text && !l.greeting)
    .slice(-ASK_LIMITS.history)
    .map((l) => ({ who: l.who, text: l.text }))
}

// Walk, focus, highlight, gesture, then say the answer; the lesson resumes after.
function deliver(reply: AskReply, trace: LatencyTrace) {
  stage(reply)
  sayLine(reply.answer, afterAnswer, undefined, trace)
}

// The answer is over: his loop goes back to the lesson's, and the lesson resumes.
function afterAnswer() {
  useWalkthrough.getState().setLoopOverride(null)
  useWalkthrough.getState().release()
}

// Walk, focus, highlight and gesture for an answer (all but saying it).
function stage(reply: Pick<AskReply, 'gesture' | 'focus' | 'highlight'>) {
  const d = useDirector.getState()
  const line = reply.highlight ? ASK_LINES.find((l) => l.id === reply.highlight) : undefined
  const focus = line ? 'notes' : reply.focus
  if (line) {
    d.setNotesTab(line.tabIndex)
    d.setHighlight(line.id)
  }
  // Notes, board and quick check are all tabs of the one window on his left.
  if (focus !== 'none') {
    d.walkTo('left')
    d.setFocus(focus)
  }

  const pointing = focus === 'none' ? 'talk' : 'point_left'
  // Everything he can point at lives in the window on his left: a model 'point_right' means that window too.
  const g = reply.gesture === 'point_right' ? 'point_left' : reply.gesture
  const loop = isLoopGesture(g) && g !== 'talk' ? g : pointing
  if (isOneShotGesture(reply.gesture)) d.play(reply.gesture, { vary: true })

  // A point waits for the camera to settle on the focused window (talk until
  // then), and with no window focused he talks instead (pointGate.ts).
  const my = seq
  startLoop(loop, (l) => useWalkthrough.getState().setLoopOverride(l), () => my === seq && useWalkthrough.getState().loopOverride === 'talk')
}

// Called by store.ask() after the student's line is in the transcript.
export function askTutor(question: string, fallback: string) {
  const my = ++seq
  pendingAnswer?.abort()
  const abort = new AbortController()
  pendingAnswer = abort
  const trace = startLatency('question')
  useWalkthrough.getState().hold()
  stopSpeaking()
  useDirector.getState().setCaption(null)
  useAskStatus.setState({ pending: true })
  const unsubscribe = useTutorStore.subscribe((state, previous) => {
    if ((previous.awaitingReply && !state.awaitingReply) || (state.phase !== previous.phase && state.phase !== 'live')) {
      abort.abort()
      if (pendingAnswer === abort) {
        pendingAnswer = null
        useAskStatus.setState({ pending: false })
      }
    }
  })
  const unsubscribeMode = useMode.subscribe((state, previous) => {
    if (state.mode === previous.mode || pendingAnswer !== abort) return
    abort.abort()
    useTutorStore.setState({ awaitingReply: false })
    useWalkthrough.setState({ held: false })
  })
  const mode = useMode.getState().mode
  // A notebook's lesson describes itself; a class with no notes yet gets a
  // general tutor for its name; otherwise the built-in CS111 lesson.
  const notebook = packContext()
  const empty = useLessonPack.getState().empty
  const request = notebook
    ? { context: notebook.context, lesson: notebook.lesson }
    : empty !== null
      ? { context: { step: 'No notes uploaded yet', notes: 'nothing yet', board: 'nothing yet' }, course: { title: empty } }
      : { context: lessonContext() }
  // Streamed: he starts talking at the answer's first sentence, and the rest
  // follows as it arrives (sayLineStreamed).
  let started = false
  let settleRest: (r: { full: string; rest: string } | null) => void = () => {}
  const rest = new Promise<{ full: string; rest: string } | null>((resolve) => (settleRest = resolve))
  const onStart = (start: AskStart) => {
    if (my !== seq || abort.signal.aborted || !useTutorStore.getState().awaitingReply) return
    started = true
    // He is answering now: saying the line ends awaitingReply, which must not cancel the stream.
    unsubscribe()
    unsubscribeMode()
    trace.mark('answerReady')
    useAskStatus.setState({ pending: false, source: 'gemini', model: null })
    stage(start)
    sayLineStreamed(start.first, rest, afterAnswer, () => my === seq && !abort.signal.aborted, trace)
  }
  void askGeminiStream({ question, ...request, history: recentHistory(), mode }, onStart, abort.signal).then((result) => {
    if (pendingAnswer === abort) pendingAnswer = null
    if (started) {
      settleRest(result && { full: result.reply.answer, rest: result.rest })
      if (result && my === seq) useAskStatus.setState({ model: result.reply.model ?? null })
      return
    }
    const reply = result?.reply ?? null
    unsubscribe()
    unsubscribeMode()
    if (my !== seq || abort.signal.aborted) { trace.finish('cancelled'); return }
    trace.mark('answerReady')
    // Something else took the floor while he thought (a quiz pick, a mode
    // switch, a reset): drop the answer, but free the chat and the lesson.
    if (!useTutorStore.getState().awaitingReply) {
      useAskStatus.setState({ pending: false })
      useWalkthrough.setState({ held: false })
      trace.finish('cancelled')
      return
    }
    useAskStatus.setState({ pending: false, source: reply ? 'gemini' : 'mock', model: reply?.model ?? null })
    if (!reply) useTutorStore.getState().showToast(ASK_FLOW.offlineToast)
    if (!reply) trace.mark('answerFallback')
    deliver(reply ?? mockReply(fallback), trace)
  })
}

// store.startListening(): he stops talking and listens; the field shows what he hears.
export function beginListening() {
  useTutorStore.setState({ awaitingReply: false })
  useWalkthrough.getState().hold()
  stopSpeaking()
  useDirector.getState().setCaption(null)
  startRecognition((heard) => useTutorStore.setState({ draft: heard }))
}

// store.finishListening(): ask what was heard, or the scripted question when
// the browser can't transcribe (or heard nothing).
export async function endListening(fallbackQuestion: string, fallbackReply: string) {
  if (finishing) return
  finishing = true
  try {
    const heard = isRecognizing() ? (await stopRecognition()).trim() : ''
    if (useTutorStore.getState().mic !== 'listening') return
    // The scripted stand-in question is about the CS111 lesson: a tutor's own
    // lesson just goes back to listening for nothing heard.
    const { pack, empty } = useLessonPack.getState()
    if (!heard && (pack || empty !== null)) {
      useTutorStore.setState({ mic: 'idle' })
      useWalkthrough.getState().release()
      return
    }
    useTutorStore.getState().ask(heard || fallbackQuestion, fallbackReply)
  } finally {
    finishing = false
  }
}
