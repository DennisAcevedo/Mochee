// The lesson's notes-window content. Shared: the UI renders these lines, and the
// ask server lists their ids in Gemini's prompt and checks highlights against
// them. Every line has a stable id so the walkthrough can highlight it. Same
// CPU-scheduling lesson as mockLesson.ts (P1 = 24 ms, P2 = P3 = 3 ms).

export type LineKind = 'title' | 'heading' | 'text' | 'key' | 'row'

export interface NoteLine {
  id: string
  kind: LineKind
  text: string
  cells?: string[] // for kind 'row'
  color?: 'teal' | 'coral' | 'sun' | 'violet' | 'lime' | 'pink'
}

export interface NoteTab {
  title: string // tab label
  url: string // omnibox text
  page: string // footer, e.g. "p. 7 of 18"
  lines: NoteLine[]
}

// A notes tab built from an uploaded document's LessonPack (src/lesson/packSession.ts):
// the same shape NotesPage renders, with the page each line comes from.
export interface CitedNoteLine extends NoteLine {
  page: number
}

export interface CitedNoteTab extends NoteTab {
  lines: CitedNoteLine[]
}

// Stable ids of a pack's notes lines: p<section>-head for the heading,
// p<section>-l<i> for notes.lines[i] (i = index in the pack, kept even when
// a line is dropped for citing a page outside its section).
export const packHeadId = (section: number) => `p${section}-head`
export const packLineId = (section: number, i: number) => `p${section}-l${i}`

export const notesTabs: NoteTab[] = [
  {
    title: 'CS111 Lecture 4.pdf',
    url: 'notes/cs111-lecture-4.pdf#page=7',
    page: 'p. 7 of 18',
    lines: [
      { id: 'l4-title', kind: 'title', text: '4.2 First-come, first-served' },
      { id: 'l4-def', kind: 'text', text: 'The CPU runs jobs in the exact order they arrive.' },
      { id: 'l4-queue', kind: 'key', text: 'One FIFO ready queue. No preemption.', color: 'teal' },
      { id: 'l4-wait', kind: 'text', text: 'Waiting time = start time - arrival time.' },
      { id: 'l4-convoy', kind: 'key', text: 'Convoy effect: short jobs stuck behind a long one.', color: 'coral' },
      { id: 'l4-example', kind: 'text', text: 'Example: P1 = 24 ms, P2 = 3 ms, P3 = 3 ms, all arrive at 0.' },
    ],
  },
  {
    title: 'CS111 Lecture 3.pdf',
    url: 'notes/cs111-lecture-3.pdf#page=4',
    page: 'p. 4 of 22',
    lines: [
      { id: 'l3-title', kind: 'title', text: '3.1 Processes and the CPU' },
      { id: 'l3-states', kind: 'text', text: 'States: new, ready, running, waiting, done.' },
      { id: 'l3-sched', kind: 'key', text: 'The scheduler picks which ready job runs next.', color: 'violet' },
      { id: 'l3-switch', kind: 'text', text: 'Switching jobs costs a context switch.' },
    ],
  },
  {
    title: 'Scheduling cheat sheet.pdf',
    url: 'notes/scheduling-cheat-sheet.pdf',
    page: 'p. 1 of 2',
    lines: [
      { id: 'cs-title', kind: 'title', text: 'Average wait, same 3 jobs' },
      { id: 'cs-head', kind: 'row', text: 'header', cells: ['Policy', 'Order', 'Avg wait'] },
      { id: 'cs-fcfs', kind: 'row', text: 'FCFS', cells: ['FCFS', 'P1 P2 P3', '17 ms'], color: 'coral' },
      { id: 'cs-sjf', kind: 'row', text: 'SJF', cells: ['SJF', 'P2 P3 P1', '3 ms'], color: 'lime' },
      { id: 'cs-rr', kind: 'row', text: 'RR', cells: ['RR q=4', 'time slices', '5.67 ms'], color: 'sun' },
    ],
  },
]
