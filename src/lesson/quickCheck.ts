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
  score: number // questions right on the first try
}

const fresh = { index: 0, picked: null, result: null, checking: false, firstTry: true, score: 0 } as const

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
  useQuickCheck.setState({ index: s.index + 1, picked: null, result: null, checking: false, firstTry: true })
  return true
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)

export interface CheckOutcome {
  correct: boolean
  say: string // the feedback line, **bold** marks allowed
}

// Checks a pick on the current question. Null when it can't be checked now
// (already right, still checking, no question, or the server didn't answer).
export async function answerQuickCheck(choice: number): Promise<CheckOutcome | null> {
  const s = useQuickCheck.getState()
  const q = currentQuestion(s)
  if (!q || s.result === 'correct' || s.checking || choice < 0 || choice >= q.choices.length) return null
  let correct: boolean
  let praise = q.praise
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
    const why = stripMarks(res.data.explanation ?? '').trim()
    if (why) praise = `**Correct!** ${clip(why, QUICK_CHECK.explanationMax)}`
  }
  const first = useQuickCheck.getState().firstTry
  useQuickCheck.setState({
    picked: choice,
    result: correct ? 'correct' : 'wrong',
    checking: false,
    firstTry: correct ? first : false,
    score: useQuickCheck.getState().score + (correct && first ? 1 : 0),
  })
  return { correct, say: correct ? praise : q.hint }
}

// A document lesson starting fetches its questions while it plays, so they
// are ready by the Quick check; the built-in lesson's are always there.
useLessonPack.subscribe((s, prev) => {
  if (s.pack?.documentId !== prev.pack?.documentId) prepareQuickCheck(s.pack?.documentId ?? null)
})
