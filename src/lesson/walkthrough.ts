import { BOARD_PARTS } from '../data/stageContent'
import type { Focus, FxKind, FxTarget, LoopClip, OneShotClip, Spot } from '../state/director'
import type { Mode } from '../state/store'
import type { PALETTE } from '../scene/layout3d'

// The guided FCFS lesson as data. The runner (runner.ts) plays it step by
// step through the director: walk, focus a window, switch tabs, highlight a
// line, reveal the board, gesture, and say the line (voice + caption +
// transcript). Lines mark key terms with **bold**; the caption colours them.
//
// spot / focus / notesTab / boardReveal / mode carry over from the previous
// step when omitted, so jumping to any step rebuilds the same stage.
// highlight, loop, gesture, fx and cue belong to their step only.

export type StepColor = Exclude<keyof typeof PALETTE, 'ink' | 'wall' | 'floor'>

export interface WalkStep {
  id: string
  title: string // short label for the walkthrough bar
  say: string // spoken line, **bold** key terms
  color: StepColor // accent for the bar chip and progress segment
  spot?: Spot
  focus?: Focus
  notesTab?: number
  boardReveal?: number
  mode?: Mode
  highlight?: string | null
  loop?: LoopClip // what he does while saying the line (default talk)
  gesture?: OneShotClip // fired as the line starts
  fx?: [FxKind, FxTarget]
  cue?: { afterMs: number; highlight: string } // a second highlight partway through the line
  wait?: 'quiz' // stay on this step until the quick check is answered
}

// Notes tabs (index into notesTabs, shared/lessonNotes.ts).
const LECTURE_4 = 0
const CHEAT_SHEET = 2
const ALL_BOARD = BOARD_PARTS.length
const reveal = (part: (typeof BOARD_PARTS)[number]) => BOARD_PARTS.indexOf(part) + 1

export const WALKTHROUGH: WalkStep[] = [
  {
    id: 'hello',
    title: 'Ready, set, learn',
    say: "Ready? Today we're learning **first-come, first-served** scheduling. Let's walk through it together!",
    color: 'teal',
    spot: 'center',
    focus: 'none',
    notesTab: LECTURE_4,
    boardReveal: 0,
    mode: 'lecture',
    gesture: 'wave',
  },
  {
    id: 'notes',
    title: 'Open Lecture 4',
    say: 'First, the notes. Section 4.2 of **Lecture 4** is all about **FCFS**.',
    color: 'violet',
    spot: 'left',
    focus: 'notes',
    notesTab: LECTURE_4,
    highlight: 'l4-title',
    loop: 'point_left',
  },
  {
    id: 'idea',
    title: 'The big idea',
    say: 'The idea is simple: the CPU runs jobs in the **exact order they arrive**. First come, first served!',
    color: 'coral',
    highlight: 'l4-def',
    loop: 'point_left',
  },
  {
    id: 'queue',
    title: 'One queue, no preemption',
    say: "Jobs wait in one **FIFO ready queue**, and there's **no preemption**. Once a job starts, it runs to the end.",
    color: 'lime',
    highlight: 'l4-queue',
    loop: 'point_left',
  },
  {
    id: 'board',
    title: 'To the board',
    say: "Let's try it on the board. Three jobs, **P1, P2 and P3**, all arrive at time **zero**.",
    color: 'sun',
    spot: 'left',
    focus: 'board',
    mode: 'lecture',
    boardReveal: reveal('heading'),
    loop: 'point_left',
  },
  {
    id: 'p1',
    title: 'P1 goes first',
    say: '**P1** got in line first, so it runs first, for a long **24 milliseconds**.',
    color: 'teal',
    boardReveal: reveal('p1'),
    loop: 'point_left',
  },
  {
    id: 'p2p3',
    title: 'Then P2 and P3',
    say: 'Then **P2** and **P3** take just **3 ms** each. P2 starts at **24**, and P3 starts at **27**.',
    color: 'pink',
    boardReveal: reveal('ticks'),
    loop: 'point_left',
  },
  {
    id: 'working',
    title: 'Add up the waits',
    say: 'Waiting time is **start minus arrival**, so the waits are **0, 24 and 27**. Add them up and divide by **3**.',
    color: 'violet',
    boardReveal: reveal('working'),
    loop: 'talk',
  },
  {
    id: 'result',
    title: '17 ms on average',
    say: "That's an average wait of **17 milliseconds**. Ouch! The short jobs did most of the waiting.",
    color: 'coral',
    boardReveal: reveal('result'),
    gesture: 'hop',
    fx: ['sparkles', 'board'],
  },
  {
    id: 'convoy',
    title: 'The convoy effect',
    say: "That's the **convoy effect**: short jobs stuck behind one long job, like cars behind a slow truck.",
    color: 'indigo',
    spot: 'left',
    focus: 'notes',
    notesTab: LECTURE_4,
    boardReveal: ALL_BOARD,
    highlight: 'l4-convoy',
    loop: 'point_left',
  },
  {
    id: 'sjf',
    title: 'Shortest job first wins',
    say: 'The cheat sheet compares them. **FCFS** averages **17 ms**, but **shortest job first** runs the quick jobs first and waits just **3 ms**.',
    color: 'lime',
    notesTab: CHEAT_SHEET,
    highlight: 'cs-fcfs',
    cue: { afterMs: 2600, highlight: 'cs-sjf' },
    loop: 'point_left',
  },
  {
    id: 'quiz',
    title: 'Quick check',
    say: "**Quick check!** Same jobs, new order: **P2, P3, then P1**. What's the average wait under **FCFS**? Tap an answer.",
    color: 'sun',
    spot: 'left',
    focus: 'board',
    mode: 'quiz',
    loop: 'point_left',
    gesture: 'hop',
    wait: 'quiz',
  },
  {
    id: 'wrap',
    title: 'You did it!',
    say: 'You did it! **FCFS** is simple and fair, but watch out for the **convoy effect**. Now come **play with me** and level me up!',
    color: 'pink',
    spot: 'center',
    focus: 'none',
    gesture: 'celebrate',
    fx: ['confetti', 'tutor'],
  },
]

// What he says when the quick check is answered. Plain text matches
// script.correct / script.wrong in mockLesson.ts (the store's pick() says those).
export const QUIZ_FEEDBACK = {
  correct: '**Yes!** 3 ms. The waits are **0, 3 and 6**, because the long job goes last.',
  wrong: 'Not quite. Write out when each job starts: **P2 at 0, P3 at 3, P1 at 6**. Now average those.',
} as const

export interface ResolvedStep extends WalkStep {
  spot: Spot
  focus: Focus
  notesTab: number
  boardReveal: number
  mode: Mode
  highlight: string | null
  loop: LoopClip
}

// Every step with the carried-over stage filled in.
export const RESOLVED_STEPS: ResolvedStep[] = WALKTHROUGH.reduce<ResolvedStep[]>((acc, step) => {
  const prev = acc[acc.length - 1]
  acc.push({
    ...step,
    spot: step.spot ?? prev?.spot ?? 'center',
    focus: step.focus ?? prev?.focus ?? 'none',
    notesTab: step.notesTab ?? prev?.notesTab ?? 0,
    boardReveal: step.boardReveal ?? prev?.boardReveal ?? ALL_BOARD,
    mode: step.mode ?? prev?.mode ?? 'lecture',
    highlight: step.highlight ?? null,
    loop: step.loop ?? 'talk',
  })
  return acc
}, [])
