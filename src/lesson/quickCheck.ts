import { create } from 'zustand'
import { fetchQuiz, submitQuiz } from '../ui/Drawers/docsClient'
import { stripMarks } from './markup'
import { useLessonPack } from './packSession'

// The lesson's Quick check: a few multiple-choice questions on the board, one
// at a time. The built-in CS111 lesson has its own; a lesson built from an
// uploaded document asks that document's questions (POST /api/quiz writes
// them, POST /api/quiz/submit checks an answer, so the answer never reaches
// the browser first). runner.ts says the feedback and moves the lesson on;
// BoardQuiz.tsx draws the current question.

export const QUICK_CHECK = {
  count: 3, // questions per Quick check
  explanationMax: 160, // characters of a document question's explanation he says
} as const

export interface CheckQuestion {
  id: string
  prompt: string // may mark one **bold** run, drawn highlighted on the board
  choices: string[]
  correctIndex?: number // built-in questions only: a document's answer stays on the server
  page?: number // where a document question's answer is
  hintLine?: string // built-in: the notes line he points at after a miss
  why: string // the reason, said when a second miss reveals the answer
  topic: string // what to look at again, for the recap
  praise: string // said on a right answer (built-in; a document's comes from the server)
  hint: string // said on a wrong one
  boardRight: string // the board's feedback pill
  boardWrong: string
}

// The built-in CS111 lesson's questions (FCFS on the board's three jobs).
export const BUILTIN_QUESTIONS: CheckQuestion[] = [
  {
    id: 'cs111-fcfs-order',
    prompt: 'The same jobs arrive as **P2, P3, P1** (3, 3, 24 ms). What is the average wait under FCFS?',
    choices: ['6 ms', '3 ms', '17 ms', '9 ms'],
    correctIndex: 1,
    hintLine: 'l4-wait',
    why: 'The waits are **0, 3 and 6**, because the long job goes last.',
    topic: 'waiting times',
    praise: '**Yes!** 3 ms. The waits are **0, 3 and 6**, because the long job goes last.',
    hint: 'Not quite. Write out when each job starts: **P2 at 0, P3 at 3, P1 at 6**. Now average those.',
    boardRight: 'Correct. Short jobs first keeps the wait low.',
    boardWrong: 'Try again. Hint: list each start time.',
  },
  {
    id: 'cs111-fcfs-preempt',
    prompt: 'Once a job starts under **FCFS**, what happens when a shorter job arrives?',
    choices: ['It jumps ahead', 'It waits its turn', 'Both share the CPU', 'The long job restarts'],
    correctIndex: 1,
    hintLine: 'l4-queue',
    why: 'FCFS is **non-preemptive**: a running job always finishes first.',
    topic: 'preemption',
    praise: '**Right!** FCFS never interrupts a job, so the short one **waits its turn**.',
    hint: 'Not quite. Remember: FCFS is **non-preemptive**. Once a job starts, nothing cuts in.',
    boardRight: 'Correct. FCFS never preempts.',
    boardWrong: 'Try again. Hint: can FCFS interrupt a job?',
  },
  {
    id: 'cs111-sjf-wait',
    prompt: 'P1 = 24 ms, P2 = P3 = 3 ms, all at time 0. What is the average wait under **SJF**?',
    choices: ['17 ms', '9 ms', '3 ms', '0 ms'],
    correctIndex: 2,
    hintLine: 'l4-convoy',
    why: 'Shortest first gives waits of **0, 3 and 6**, so the average is 3 ms.',
    topic: 'SJF',
    praise: '**Yes!** Shortest first: the waits are **0, 3 and 6**, so the average is 3 ms.',
    hint: 'Close! Run the **short jobs first**, then average when each one starts.',
    boardRight: 'Correct. SJF puts short jobs first.',
    boardWrong: 'Try again. Hint: run P2 and P3 first.',
  },
]

export type CheckStatus = 'ready' | 'loading' | 'empty'

export interface QuickCheckState {
  documentId: string | null // null = the built-in lesson
  status: CheckStatus
  questions: CheckQuestion[]
  index: number
  picked: number | null // the current question's latest pick
  result: 'correct' | 'wrong' | null
  checking: boolean // a document answer is being checked
  firstTry: boolean // the current question has not been missed yet
  misses: number // wrong picks on the current question
  revealed: number | null // the right choice, shown after a second miss
  score: number // questions right on the first try
  missed: string[] // topics of the questions missed at least once, for the recap
}

const fresh = { index: 0, picked: null, result: null, checking: false, firstTry: true, misses: 0, revealed: null, score: 0, missed: [] as string[] }

export const useQuickCheck = create<QuickCheckState>(() => ({
  documentId: null,
  status: 'ready',
  questions: BUILTIN_QUESTIONS.slice(0, QUICK_CHECK.count),
  ...fresh,
}))

export const currentQuestion = (s: QuickCheckState = useQuickCheck.getState()): CheckQuestion | null => s.questions[s.index] ?? null
export const isLastQuestion = (s: QuickCheckState = useQuickCheck.getState()) => s.index >= s.questions.length - 1

let loadSeq = 0

// Which questions the Quick check asks: the built-in lesson's, or a
// document's (fetched once per document while its lesson runs).
export function prepareQuickCheck(documentId: string | null) {
  const s = useQuickCheck.getState()
  if (documentId === null) {
    if (s.documentId !== null || s.status !== 'ready') useQuickCheck.setState({ documentId: null, status: 'ready', questions: BUILTIN_QUESTIONS.slice(0, QUICK_CHECK.count), ...fresh })
    return
  }
  if (s.documentId === documentId && s.status !== 'empty') return
  const seq = ++loadSeq
  useQuickCheck.setState({ documentId, status: 'loading', questions: [], ...fresh })
  void fetchQuiz(documentId).then((res) => {
    if (seq !== loadSeq) return
    const qs = res.ok ? res.data.questions.slice(0, QUICK_CHECK.count) : []
    if (!qs.length) return useQuickCheck.setState({ status: 'empty' })
    useQuickCheck.setState({
      status: 'ready',
      questions: qs.map(
        (q): CheckQuestion => ({
          id: q.id,
          prompt: q.prompt,
          choices: q.choices,
          page: q.page,
          praise: '**Correct!**',
          hint: `Not quite. Have another look at **page ${q.page}**, then try again.`,
          why: '',
          topic: `page ${q.page}`,
          boardRight: 'Correct!',
          boardWrong: `Try again. Hint: page ${q.page}.`,
        }),
      ),
      ...fresh,
    })
  })
}

// Back to the first question (the Quick check step starts or replays).
export function restartQuickCheck() {
  useQuickCheck.setState({ ...fresh })
}

// On to the next question. False when that was the last one.
export function nextQuestion(): boolean {
  const s = useQuickCheck.getState()
  if (isLastQuestion(s)) return false
  useQuickCheck.setState({ index: s.index + 1, picked: null, result: null, checking: false, firstTry: true, misses: 0, revealed: null })
  return true
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)

export interface CheckOutcome {
  correct: boolean
  revealed: boolean // a second miss: the answer is shown and the check moves on
  say: string // the feedback line, **bold** marks allowed
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

// What he says at the end: the first-try score and what to look at again.
export function quickCheckRecap(s: QuickCheckState = useQuickCheck.getState()): string {
  const n = s.questions.length
  const head = `That's the quick check: **${s.score} of ${n}** on the first try.`
  if (!s.missed.length) return `${head} Perfect run!`
  return `${head} Worth another look: **${[...new Set(s.missed)].join(' and ')}**.`
}

// Checks a pick on the current question. Null when it can't be checked now
// (already right, still checking, no question, or the server didn't answer).
export async function answerQuickCheck(choice: number): Promise<CheckOutcome | null> {
  const s = useQuickCheck.getState()
  const q = currentQuestion(s)
  if (!q || s.result === 'correct' || s.revealed !== null || s.checking || choice < 0 || choice >= q.choices.length) return null
  let correct: boolean
  let praise = q.praise
  let why = q.why
  let rightChoice = q.correctIndex ?? -1
  if (q.correctIndex !== undefined) correct = choice === q.correctIndex
  else {
    useQuickCheck.setState({ checking: true, picked: choice })
    const res = await submitQuiz({ questionId: q.id, choice, attemptId: crypto.randomUUID() })
    if (currentQuestion() !== q) return null // moved on while checking
    if (!res.ok) {
      useQuickCheck.setState({ checking: false, picked: null })
      return null
    }
    correct = res.data.correct
    rightChoice = res.data.correctChoice
    const reason = clip(stripMarks(res.data.explanation ?? '').trim(), QUICK_CHECK.explanationMax)
    if (reason) praise = `**Correct!** ${reason}`
    why = reason
  }
  const now = useQuickCheck.getState()
  const misses = now.misses + (correct ? 0 : 1)
  // A second miss shows the right answer and moves on, instead of guessing on.
  const reveal = !correct && misses >= 2 && rightChoice >= 0
  useQuickCheck.setState({
    picked: choice,
    result: correct ? 'correct' : 'wrong',
    checking: false,
    firstTry: correct ? now.firstTry : false,
    misses,
    revealed: reveal ? rightChoice : null,
    score: now.score + (correct && now.firstTry ? 1 : 0),
    missed: correct || now.missed.includes(q.topic) ? now.missed : [...now.missed, q.topic],
  })
  if (reveal) return { correct: false, revealed: true, say: `The answer is **${LETTERS[rightChoice]}: ${q.choices[rightChoice]}**.${why ? ` ${why}` : ''}` }
  return { correct, revealed: false, say: correct ? praise : q.hint }
}

// A document lesson starting fetches its questions while it plays, so they
// are ready by the Quick check; the built-in lesson's are always there.
useLessonPack.subscribe((s, prev) => {
  if (s.pack?.documentId !== prev.pack?.documentId) prepareQuickCheck(s.pack?.documentId ?? null)
})
