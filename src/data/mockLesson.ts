// All placeholder lesson content from the design export lives here.
// Stage 2 replaces this with parsed PDF content and Gemini output.

export interface NoteFile {
  name: string
  pages: number
  active?: boolean
}

export interface TranscriptLine {
  who: 'tutor' | 'student'
  time: string
  text: string
  live?: boolean
  greeting?: boolean // the opening line the intro types in
}

export interface GanttSegment {
  label: string
  flex: number
  tone: 'p1' | 'p2' | 'p3'
}

export interface Quiz {
  prompt: string
  bold: string
  promptTail: string
  options: string[]
  correctIndex: number
}

export const notes: NoteFile[] = [
  { name: 'CS111 Lecture 4.pdf', pages: 18, active: true },
  { name: 'CS111 Lecture 3.pdf', pages: 22 },
  { name: 'Scheduling cheat sheet.pdf', pages: 2 },
]

// The transcript starts empty; the intro types script.greeting in as line one.

export const lectureBoard = {
  sectionLabel: '02 · First-come, first-served',
  heading: 'FCFS: run jobs in arrival order',
  gantt: [
    { label: 'P1 · 24 ms', flex: 24, tone: 'p1' },
    { label: 'P2', flex: 3, tone: 'p2' },
    { label: 'P3', flex: 3, tone: 'p3' },
  ] as GanttSegment[],
  ticks: { start: '0', mid: '24', midPercent: 80, end: '30' },
  workingLine: 'avg wait = (0+24+27) ÷ 3',
  result: '17 ms',
  footnote: 'Run the short jobs first and the same three processes average just 3 ms.',
}

export const quiz: Quiz = {
  prompt: 'The same jobs arrive as ',
  bold: 'P2, P3, P1',
  promptTail: ' (3, 3, 24 ms). What is the average wait under FCFS?',
  options: ['6 ms', '3 ms', '17 ms', '9 ms'],
  correctIndex: 1,
}

export const quizBoard = {
  sectionLabel: '05 · Quick check',
  heading: 'Quick check',
}

export const feedback = {
  idle: 'Tap an answer, or say it out loud.',
  correct: 'Correct. Short jobs first keeps the wait low.',
  wrong: 'Try again. Hint: list each start time.',
}

export const script = {
  greeting: "Oh! Hi, I'm awake. Today is CPU scheduling, starting with first-come, first-served.",
  quizIntro: "Let's check that it stuck. Same three jobs, new arrival order. What's the average wait?",
  backToLecture: 'Back to the lecture. Next up: shortest job first.',
  correct: 'Yes! 3 ms. The waits are 0, 3 and 6, because the long job goes last.',
  wrong: 'Not quite. Write out when each job starts: P2 at 0, P3 at 3, P1 at 6. Now average those.',
  voiceQuestion: 'Why is FCFS bad when a long job arrives first?',
  voiceReply:
    "Because every short job queues behind it. That's called the convoy effect, and it's why the average wait jumps to 17 ms.",
  genericReply: 'Good question. Let me tie that back to the board.',
}

export const replyDelayMs = 900
