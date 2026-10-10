import { create } from 'zustand'
import type { LessonPack, LessonSection } from '../../shared/lessonPack.ts'
import { packHeadId, packLineId, type CitedNoteLine, type CitedNoteTab } from '../../shared/lessonNotes.ts'
import type { ResolvedStep, StepColor, WalkStep } from './walkthrough.ts'

// A tutor session built from an uploaded document's LessonPack. The hub's
// Start Tutor Session calls useLessonPack.start(pack, section); while a pack
// is set, the lesson room plays packToWalkthrough(pack, section) instead of
// the hand-written WALKTHROUGH, the notes window shows packNotesTabs(pack)
// (notes tab N = section N) and the board shows packBoard(pack, N).
//
// Everything said or shown comes from the pack (the document's own text and
// topics). The only words added here are the framing around it ("Ready?",
// "Quick check!"). No React, no three: tests/lesson/*.test.ts import this
// file directly under node --test.

export interface LessonPackState {
  pack: LessonPack | null
  section: number
  start(pack: LessonPack, section: number): void
  clear(): void
}

export const useLessonPack = create<LessonPackState>((set) => ({
  pack: null,
  section: 0,
  start: (pack, section) => set({ pack, section: clampSection(pack, section) }),
  clear: () => set({ pack: null, section: 0 }),
}))

const clampSection = (pack: LessonPack, section: number) =>
  Math.max(0, Math.min(pack.sections.length - 1, Number.isFinite(section) ? Math.floor(section) : 0))

// ---- Pages

export interface PageRange {
  from: number
  to: number // inclusive; Infinity for the last section (the pack has no page count)
}

// A section runs from its first page to the first page of the next section
// (inclusive: a topic can end on the page where the next one starts).
export function sectionPages(pack: LessonPack, section: number): PageRange {
  const sec = pack.sections[section]
  const next = pack.sections[section + 1]
  const from = sec?.page ?? 1
  return { from, to: next ? Math.max(from, next.page) : Number.POSITIVE_INFINITY }
}

const inRange = (page: number, r: PageRange) => Number.isFinite(page) && page >= r.from && page <= r.to

// The section's notes lines that cite a page inside the section, with their
// index in the pack (the line id keeps that index, so ids are stable).
function citedLines(pack: LessonPack, section: number): { line: LessonSection['notes']['lines'][number]; i: number }[] {
  const sec = pack.sections[section]
  if (!sec) return []
  const range = sectionPages(pack, section)
  return sec.notes.lines.map((line, i) => ({ line, i })).filter(({ line }) => inRange(line.page, range))
}

// ---- Notes window

const NOTE_COLORS = ['teal', 'coral', 'violet', 'lime', 'sun', 'pink'] as const

// Section `section` as a notes tab: heading as the title line, then each
// cited notes line (alternating plain text and colour key chips).
export function packNotes(pack: LessonPack, section: number): CitedNoteTab {
  const sec = pack.sections[section]
  if (!sec) throw new RangeError(`packNotes: no section ${section} in ${pack.documentId}`)
  const lines: CitedNoteLine[] = [
    { id: packHeadId(section), kind: 'title', text: sec.notes.head || sec.title, page: sec.page },
    ...citedLines(pack, section).map(({ line, i }): CitedNoteLine =>
      i % 2 === 1
        ? { id: packLineId(section, i), kind: 'key', text: line.text, page: line.page, color: NOTE_COLORS[(section + i) % NOTE_COLORS.length] }
        : { id: packLineId(section, i), kind: 'text', text: line.text, page: line.page },
    ),
  ]
  return {
    title: `${sec.title}.pdf`,
    url: `docs/${encodeURIComponent(pack.documentId)}/page/${sec.page}`,
    page: `p. ${sec.page}`,
    lines,
  }
}

// Every section as a notes tab, in order: the drop-in for notesTabs while a pack is active.
export const packNotesTabs = (pack: LessonPack): CitedNoteTab[] => pack.sections.map((_, s) => packNotes(pack, s))

// ---- Board window

// A section's board. boardReveal = n shows the first n parts: part 0 is the
// heading, part k (1..lines.length) is lines[k - 1]; `parts` reveals all of it.
export interface PackBoard {
  sectionLabel: string // '02 · Topic title'
  heading: string
  lines: string[]
  page: number
  parts: number
}

export function packBoard(pack: LessonPack, section: number): PackBoard {
  const sec = pack.sections[section]
  if (!sec) throw new RangeError(`packBoard: no section ${section} in ${pack.documentId}`)
  const lines = sec.board.lines.filter((l) => l.trim() !== '')
  return {
    sectionLabel: `${String(section + 1).padStart(2, '0')} · ${sec.title}`,
    heading: sec.board.head || sec.title,
    lines,
    page: sec.page,
    parts: 1 + lines.length,
  }
}

export const packBoardShows = (part: number, reveal: number) => part < reveal

// ---- Walkthrough

const STEP_COLORS: readonly StepColor[] = ['teal', 'violet', 'coral', 'lime', 'sun', 'pink', 'indigo']
const TITLE_MAX = 34

const clip = (s: string, max = TITLE_MAX) => {
  const t = s.replace(/\*\*/g, '').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

export const QUIZ_STEP_ID = 'quiz'

// The section a pack step belongs to ('p2-n1' -> 2), or null for the quick check.
export function packStepSection(id: string): number | null {
  const m = /^p(\d+)-/.exec(id)
  return m ? Number(m[1]) : null
}

// The guided lesson for a pack, from startSection on. Per section: a hello
// (first section only), one notes step per cited notes line (walk to the
// notes, highlight p<s>-l<i>, say the section's say line i, or the notes line
// itself when the say lines run out), then the board reveal (any say lines
// left over are said here). It ends on the Quick check (wait: 'quiz').
// notesTab is the section index, matching packNotesTabs(pack).
export function packToWalkthrough(pack: LessonPack, startSection: number): WalkStep[] {
  const steps: WalkStep[] = []
  const color = () => STEP_COLORS[steps.length % STEP_COLORS.length]
  const first = clampSection(pack, startSection)
  if (pack.sections.length === 0) return [quizStep(pack, 'teal')]

  for (let s = first; s < pack.sections.length; s++) {
    const sec = pack.sections[s]
    const say = sec.say.map((l) => l.trim()).filter(Boolean)
    const board = packBoard(pack, s)

    if (s === first) {
      steps.push({
        id: `p${s}-hello`,
        title: 'Ready, set, learn',
        say: `Ready? Today we're learning from **${pack.title}**, starting with **${sec.title}**.`,
        color: color(),
        spot: 'center',
        focus: 'none',
        notesTab: s,
        boardReveal: 0,
        mode: 'lecture',
        gesture: 'wave',
      })
    }

    const lines = citedLines(pack, s)
    lines.forEach(({ line, i }, k) => {
      steps.push({
        id: `p${s}-n${i}`,
        title: clip(k === 0 ? sec.title : line.text),
        say: say[k] ?? line.text,
        color: color(),
        ...(k === 0 ? { spot: 'left' as const, focus: 'notes' as const, notesTab: s, boardReveal: 0, mode: 'lecture' as const } : {}),
        highlight: packLineId(s, i),
        loop: 'point_left',
      })
    })

    const rest = say.slice(lines.length)
    steps.push({
      id: `p${s}-board`,
      title: clip(board.heading),
      say: rest.length ? rest.join(' ') : `To the board: **${board.heading}**.`,
      color: color(),
      spot: 'right',
      focus: 'board',
      notesTab: s,
      mode: 'lecture',
      boardReveal: board.parts,
      loop: 'point_right',
      fx: ['sparkles', 'board'],
    })
  }

  steps.push(quizStep(pack, color()))
  return steps
}

// The steps with the carried-over stage filled in, like RESOLVED_STEPS in
// walkthrough.ts: what useWalkthrough's `steps` holds.
export function resolvePackSteps(steps: WalkStep[]): ResolvedStep[] {
  return steps.reduce<ResolvedStep[]>((acc, step) => {
    const prev = acc[acc.length - 1]
    acc.push({
      ...step,
      spot: step.spot ?? prev?.spot ?? 'center',
      focus: step.focus ?? prev?.focus ?? 'none',
      notesTab: step.notesTab ?? prev?.notesTab ?? 0,
      boardReveal: step.boardReveal ?? prev?.boardReveal ?? 0,
      mode: step.mode ?? prev?.mode ?? 'lecture',
      highlight: step.highlight ?? null,
      loop: step.loop ?? 'talk',
    })
    return acc
  }, [])
}

function quizStep(pack: LessonPack, color: StepColor): WalkStep {
  return {
    id: QUIZ_STEP_ID,
    title: 'Quick check',
    say: `**Quick check!** Let's see what stuck from **${pack.title}**. Tap an answer.`,
    color,
    spot: 'right',
    focus: 'board',
    mode: 'quiz',
    loop: 'point_right',
    gesture: 'hop',
    wait: 'quiz',
  }
}
