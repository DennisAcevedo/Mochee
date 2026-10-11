import { create } from 'zustand'
import type { Expression, Pose } from '../animation/config'
import {
  quiz,
  script,
  type TranscriptLine,
} from '../data/mockLesson'
import { askTutor, beginListening, endListening } from '../lesson/askFlow'

export type Mode = 'lecture' | 'quiz'
export type Mic = 'idle' | 'listening' | 'speaking'
export type Phase = 'start' | 'intro' | 'live' // start screen, intro sequence, lesson

export interface TutorState {
  mode: Mode
  mic: Mic
  lines: TranscriptLine[]
  answer: number | null
  draft: string
  panelOpen: boolean
  stageW: number
  toast: string | null
  awaitingReply: boolean // between a student line and the tutor's answer
  phase: Phase
  introPose: Pose | null // the intro's pose override (sleep, wake, wave); null hands back to the lesson
  roomShown: boolean // the intro has revealed the room and the Blender tutor (true from then on, through live)

  tutorSays: (text: string, extra?: Partial<Pick<TutorState, 'mode' | 'answer'>>, marked?: string) => void
  ask: (text: string, reply: string) => void
  setMode: (mode: Mode) => void
  pick: (index: number) => void
  togglePanel: () => void
  setDraft: (draft: string) => void
  sendDraft: () => void
  startListening: () => void
  finishListening: () => void
  setStageW: (w: number) => void
  showToast: (message: string) => void
  hideToast: () => void
  setPhase: (phase: Phase) => void
  setIntroPose: (pose: Pose | null) => void
  // Per-tutor settings for the session; resetSession() without args reuses the last ones.
  session: SessionConfig
  resetSession: (config?: SessionConfig) => void
  startGreeting: () => void
  typeGreeting: (chars: number) => void
  completeGreeting: () => void
}

let replyTimer: ReturnType<typeof setTimeout> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined

function now(): string {
  const d = new Date()
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function clearLive(lines: TranscriptLine[]): TranscriptLine[] {
  return lines.map((l) => ({ ...l, live: false }))
}

// Everything the start screen resets (stageW is measured, so it stays).
export interface SessionConfig {
  greeting: string // the line the intro types in
  sectionCount: number // outline length; the quiz is the last section
}

const DEFAULT_SESSION: SessionConfig = { greeting: script.greeting, sectionCount: 5 }

function initialSession() {
  return {
    mode: 'lecture' as Mode,
    mic: 'idle' as Mic,
    lines: [] as TranscriptLine[],
    answer: null,
    draft: '',
    panelOpen: true,
    toast: null,
    awaitingReply: false,
    phase: 'start' as Phase,
    introPose: 'sleep' as Pose | null,
    roomShown: false,
  }
}

const greetingText = (s: TutorState, chars: number) =>
  s.lines.map((l) => (l.greeting ? { ...l, text: s.session.greeting.slice(0, chars) } : l))

export const useTutorStore = create<TutorState>((set, get) => ({
  ...initialSession(),
  session: DEFAULT_SESSION,
  stageW: 1000,

  tutorSays: (text, extra = {}, marked) =>
    set((s) => ({
      ...extra,
      mic: 'speaking',
      awaitingReply: false,
      lines: [...clearLive(s.lines), { who: 'tutor', time: now(), text, live: true, ...(marked && marked !== text ? { marked } : {}) }],
    })),

  ask: (text, reply) => {
    set((s) => ({
      mic: 'idle',
      draft: '',
      awaitingReply: true,
      lines: [...clearLive(s.lines), { who: 'student', time: now(), text }],
    }))
    clearTimeout(replyTimer)
    // Gemini answers through the server proxy; `reply` is the scripted fallback.
    askTutor(text, reply)
  },

  setMode: (mode) => {
    if (mode === get().mode) return
    if (mode === 'quiz') get().tutorSays(script.quizIntro, { mode, answer: null })
    else get().tutorSays(script.backToLecture, { mode, answer: null })
  },

  pick: (index) => {
    if (get().answer === quiz.correctIndex) return
    if (index === quiz.correctIndex) get().tutorSays(script.correct, { answer: index })
    else get().tutorSays(script.wrong, { answer: index })
  },

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setDraft: (draft) => set({ draft }),

  sendDraft: () => {
    const text = get().draft.trim()
    if (text) get().ask(text, script.genericReply)
  },

  startListening: () => {
    clearTimeout(replyTimer)
    set({ mic: 'listening' })
    beginListening() // transcribes with SpeechRecognition when the browser has it
  },

  finishListening: () => {
    if (get().mic !== 'listening') return
    // Asks what was heard, or the scripted voice question when nothing was transcribed.
    void endListening(script.voiceQuestion, script.voiceReply)
  },

  setStageW: (stageW) => {
    if (stageW !== get().stageW) set({ stageW })
  },

  showToast: (toast) => {
    clearTimeout(toastTimer)
    set({ toast })
    toastTimer = setTimeout(() => set({ toast: null }), 2400)
  },
  hideToast: () => {
    clearTimeout(toastTimer)
    set({ toast: null })
  },

  setPhase: (phase) => set({ phase }),
  setIntroPose: (introPose) => set({ introPose }),

  resetSession: (config) => {
    clearTimeout(replyTimer)
    clearTimeout(toastTimer)
    set({ ...initialSession(), ...(config ? { session: config } : {}) })
  },

  // The greeting types in through typeGreeting(), driven by the intro timeline.
  startGreeting: () =>
    set((s) => ({
      mic: 'speaking',
      lines: [...clearLive(s.lines), { who: 'tutor', time: now(), text: '', live: true, greeting: true }],
    })),
  typeGreeting: (chars) => set((s) => ({ lines: greetingText(s, chars) })),

  // Full text, then go quiet, unless the student has already taken over.
  completeGreeting: () =>
    set((s) => {
      if (!s.lines.some((l) => l.greeting)) {
        return { mic: 'idle', lines: [...clearLive(s.lines), { who: 'tutor', time: now(), text: s.session.greeting, live: true, greeting: true }] }
      }
      const last = s.lines[s.lines.length - 1]
      return { lines: greetingText(s, s.session.greeting.length), ...(last?.greeting && s.mic === 'speaking' ? { mic: 'idle' as Mic } : {}) }
    }),
}))

// The mock lecture on the board is section 2 (index 1) of the outline.
const LECTURE_SECTION = 1

// Derived values, mirroring renderVals() in the export.
export const selectIsQuiz = (s: TutorState) => s.mode === 'quiz'
export const selectSection = (s: TutorState) =>
  s.mode === 'quiz' ? s.session.sectionCount - 1 : Math.min(LECTURE_SECTION, s.session.sectionCount - 1)
export const selectSpeaking = (s: TutorState) => s.mic === 'speaking'
export const selectListening = (s: TutorState) => s.mic === 'listening'
export const selectAnsweredRight = (s: TutorState) =>
  s.mode === 'quiz' && s.answer === quiz.correctIndex
export const selectAnsweredWrong = (s: TutorState) =>
  s.mode === 'quiz' && s.answer !== null && s.answer !== quiz.correctIndex

// Pose priority, using the states from design/Tutor Character.dc.html.
// `point` has no trigger on the main screen yet; the export never selected it either.
export const selectPose = (s: TutorState): Pose => {
  if (s.introPose) return s.introPose
  if (selectAnsweredRight(s)) return 'celebrate'
  if (selectAnsweredWrong(s)) return 'shrug'
  if (s.mic === 'listening') return 'listen'
  if (s.awaitingReply) return 'think'
  return 'explain'
}

// tutor-3d.js derives the face from the pose; `happy` is the only explicit override.
export const selectExpression = (s: TutorState): Expression => (selectAnsweredRight(s) ? 'happy' : 'neutral')
