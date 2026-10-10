import { create } from 'zustand'
import { lectureBoard, quiz } from '../data/mockLesson'
import { boardShows, type BoardPart } from '../data/stageContent'
import { notesTabs } from '../../shared/lessonNotes'
import { useDirector } from '../state/director'
import { useTutorStore } from '../state/store'
import { useMode } from '../state/mode'
import { askGemini, mockReply, type AskSource } from './askGemini'
import { ASK_LIMITS, ASK_LINES, type AskReply, type AskTurn } from '../../shared/askTypes'
import { isLoopGesture, isOneShotGesture } from './askGestures'
import { stripMarks } from './markup'
import { startLatency, type LatencyTrace } from './latency'
import { sayLine, useWalkthrough } from './runner'
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
      ? `Quick check: ${quiz.prompt}${quiz.bold}${quiz.promptTail} Options: ${quiz.options.join(', ')}. ` +
        `Student picked: ${t.answer === null ? 'nothing yet' : quiz.options[t.answer]}`
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
  const d = useDirector.getState()
  const line = reply.highlight ? ASK_LINES.find((l) => l.id === reply.highlight) : undefined
  const focus = line ? 'notes' : reply.focus
  if (line) {
    d.setNotesTab(line.tabIndex)
    d.setHighlight(line.id)
  }
  if (focus === 'notes') d.walkTo('left')
  if (focus === 'board') d.walkTo('right')
  if (focus !== 'none') d.setFocus(focus)

  const pointing = focus === 'notes' ? 'point_left' : focus === 'board' ? 'point_right' : 'talk'
  const loop = isLoopGesture(reply.gesture) && reply.gesture !== 'talk' ? reply.gesture : pointing
  if (isOneShotGesture(reply.gesture)) d.play(reply.gesture, { vary: true })

  const w = useWalkthrough.getState()
  w.setLoopOverride(loop)
  sayLine(reply.answer, () => {
    useWalkthrough.getState().setLoopOverride(null)
    useWalkthrough.getState().release()
  }, undefined, trace)
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
  void askGemini({ question, context: lessonContext(), history: recentHistory() }, abort.signal).then((reply) => {
    unsubscribe()
    unsubscribeMode()
    if (my !== seq || abort.signal.aborted) { trace.finish('cancelled'); return }
    pendingAnswer = null
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
    useTutorStore.getState().ask(heard || fallbackQuestion, fallbackReply)
  } finally {
    finishing = false
  }
}
