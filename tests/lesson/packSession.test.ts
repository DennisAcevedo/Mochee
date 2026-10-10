import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { notesTabs } from '../../shared/lessonNotes.ts'
import type { LessonPack } from '../../shared/lessonPack.ts'
import {
  packBoard,
  packNotes,
  packNotesTabs,
  packStepSection,
  packToWalkthrough,
  QUIZ_STEP_ID,
  resolvePackSteps,
  sectionPages,
  useLessonPack,
} from '../../src/lesson/packSession.ts'

// The fixture pack reuses the hand-written CS111 notes (shared/lessonNotes.ts)
// as its document text, so no lesson content is invented for the tests. Pages
// follow the notes tabs' footers (Lecture 3 p. 4, Lecture 4 p. 7, cheat sheet).
const [lec4, lec3, cheat] = notesTabs
const text = (tab: typeof lec4, id: string) => {
  const line = tab.lines.find((l) => l.id === id)
  if (!line) throw new Error(`fixture: no line ${id}`)
  return line.text
}

function fixturePack(): LessonPack {
  return {
    documentId: 'doc-cs111',
    title: 'CS111 Lectures 3-4',
    source: 'outline',
    createdAt: '2026-10-10T12:00:00.000Z',
    checkQuestionIds: ['q1', 'q2'],
    sections: [
      {
        title: 'Processes and the CPU',
        topicId: 't-proc',
        page: 4,
        mins: 4,
        say: [text(lec3, 'l3-states'), text(lec3, 'l3-sched')],
        notes: {
          head: text(lec3, 'l3-title'),
          lines: [
            { text: text(lec3, 'l3-states'), page: 4 },
            { text: text(lec3, 'l3-sched'), page: 5 },
            { text: text(lec3, 'l3-switch'), page: 12 }, // outside 4..7: dropped
          ],
        },
        board: { head: text(lec3, 'l3-sched'), lines: [text(lec3, 'l3-switch')] },
      },
      {
        title: 'First-come, first-served',
        topicId: 't-fcfs',
        page: 7,
        mins: 6,
        say: [text(lec4, 'l4-def'), text(lec4, 'l4-queue'), text(lec4, 'l4-wait'), text(lec4, 'l4-convoy')],
        notes: {
          head: text(lec4, 'l4-title'),
          lines: [
            { text: text(lec4, 'l4-def'), page: 7 },
            { text: text(lec4, 'l4-queue'), page: 7 },
          ],
        },
        board: { head: text(lec4, 'l4-wait'), lines: [text(lec4, 'l4-example'), text(lec4, 'l4-convoy')] },
      },
      {
        title: 'Average wait, same 3 jobs',
        topicId: null,
        page: 9,
        mins: 3,
        say: [text(cheat, 'cs-title')],
        notes: {
          head: text(cheat, 'cs-title'),
          lines: [
            { text: text(cheat, 'cs-fcfs'), page: 9 },
            { text: text(cheat, 'cs-sjf'), page: 10 },
            { text: text(cheat, 'cs-rr'), page: 3 }, // before the section: dropped
          ],
        },
        board: { head: text(cheat, 'cs-title'), lines: [] },
      },
    ],
  }
}

describe('packToWalkthrough', () => {
  const pack = fixturePack()
  const steps = packToWalkthrough(pack, 0)

  it('orders hello, then per section its notes steps and board, then the quick check', () => {
    assert.deepEqual(
      steps.map((s) => s.id),
      ['p0-hello', 'p0-n0', 'p0-n1', 'p0-board', 'p1-n0', 'p1-n1', 'p1-board', 'p2-n0', 'p2-n1', 'p2-board', QUIZ_STEP_ID],
    )
  })

  it('gives every step and every notes line a unique id', () => {
    const ids = steps.map((s) => s.id)
    assert.equal(new Set(ids).size, ids.length)
    const lineIds = packNotesTabs(pack).flatMap((t) => t.lines.map((l) => l.id))
    assert.equal(new Set(lineIds).size, lineIds.length)
    for (const id of lineIds) assert.match(id, /^p\d+-(l\d+|head)$/)
  })

  it('highlights a line that exists in the notes tab the step shows', () => {
    const tabs = packNotesTabs(pack)
    for (const step of resolvePackSteps(steps)) {
      if (!step.highlight) continue
      assert.ok(
        tabs[step.notesTab].lines.some((l) => l.id === step.highlight),
        `${step.id} highlights ${step.highlight}, not on tab ${step.notesTab}`,
      )
      assert.equal(step.notesTab, packStepSection(step.id))
      assert.equal(step.focus, 'notes')
    }
  })

  it('teaches from the left spot beside the one window: the notes for a section, then the board tab for its reveal', () => {
    const resolved = resolvePackSteps(steps)
    for (const step of resolved.filter((s) => /-n\d+$/.test(s.id))) {
      assert.equal(step.spot, 'left')
      assert.equal(step.boardReveal, 0)
    }
    for (const step of resolved.filter((s) => s.id.endsWith('-board'))) {
      const s = packStepSection(step.id)!
      assert.equal(step.spot, 'left')
      assert.equal(step.loop, 'point_left')
      assert.equal(step.focus, 'board')
      assert.equal(step.boardReveal, packBoard(pack, s).parts)
    }
  })

  it("says the section's say lines in order, the leftovers on the board step", () => {
    const say = (id: string) => steps.find((s) => s.id === id)?.say
    assert.equal(say('p1-n0'), pack.sections[1].say[0])
    assert.equal(say('p1-n1'), pack.sections[1].say[1])
    assert.equal(say('p1-board'), `${pack.sections[1].say[2]} ${pack.sections[1].say[3]}`)
    // Section 2 has one say line for two notes lines: the second says its notes line.
    assert.equal(say('p2-n1'), pack.sections[2].notes.lines[1].text)
  })

  it('cites a page inside its section for every notes line', () => {
    pack.sections.forEach((_, s) => {
      const range = sectionPages(pack, s)
      for (const line of packNotes(pack, s).lines) {
        assert.ok(line.page >= range.from && line.page <= range.to, `${line.id} cites p. ${line.page}, outside ${range.from}-${range.to}`)
      }
    })
    // The two off-section lines are left out, and their ids are not reused.
    assert.ok(!packNotes(pack, 0).lines.some((l) => l.id === 'p0-l2'))
    assert.ok(!packNotes(pack, 2).lines.some((l) => l.id === 'p2-l2'))
  })

  it('skips the sections before startSection', () => {
    const later = packToWalkthrough(pack, 1)
    assert.equal(later[0].id, 'p1-hello')
    assert.ok(later.every((s) => packStepSection(s.id) !== 0))
    assert.deepEqual(
      later.map((s) => s.id),
      ['p1-hello', 'p1-n0', 'p1-n1', 'p1-board', 'p2-n0', 'p2-n1', 'p2-board', QUIZ_STEP_ID],
    )
    // Out-of-range starts clamp to a real section.
    assert.equal(packToWalkthrough(pack, 99)[0].id, 'p2-hello')
    assert.equal(packToWalkthrough(pack, -3)[0].id, 'p0-hello')
  })

  it('ends on the one quick check, which waits for the answer', () => {
    for (const start of [0, 1, 2]) {
      const run = packToWalkthrough(pack, start)
      const last = run[run.length - 1]
      assert.equal(last.id, QUIZ_STEP_ID)
      assert.equal(last.wait, 'quiz')
      assert.equal(last.mode, 'quiz')
      assert.equal(last.spot, 'left', 'the Quick check is a tab of the window on his left')
      assert.equal(last.loop, 'point_left')
      assert.equal(run.filter((s) => s.wait === 'quiz').length, 1)
    }
  })

  it('a pack with no sections is just the quick check', () => {
    const steps = packToWalkthrough({ ...pack, sections: [] }, 0)
    assert.deepEqual(
      steps.map((s) => s.id),
      [QUIZ_STEP_ID],
    )
  })
})

describe('packNotes / packBoard', () => {
  const pack = fixturePack()

  it('builds the NoteTab shape NotesPage renders', () => {
    const tab = packNotes(pack, 1)
    assert.equal(tab.title, 'First-come, first-served.pdf')
    assert.equal(tab.page, 'p. 7')
    assert.equal(tab.url, 'docs/doc-cs111/page/7')
    assert.deepEqual(
      tab.lines.map((l) => [l.id, l.kind]),
      [
        ['p1-head', 'title'],
        ['p1-l0', 'text'],
        ['p1-l1', 'key'],
      ],
    )
    assert.equal(tab.lines[0].text, pack.sections[1].notes.head)
  })

  it('reveals the board heading first, then each line', () => {
    const b = packBoard(pack, 1)
    assert.equal(b.sectionLabel, '02 · First-come, first-served')
    assert.equal(b.heading, pack.sections[1].board.head)
    assert.deepEqual(b.lines, pack.sections[1].board.lines)
    assert.equal(b.parts, 3)
    assert.equal(packBoard(pack, 2).parts, 1)
  })
})

describe('useLessonPack', () => {
  it('starts on a clamped section and clears', () => {
    const pack = fixturePack()
    useLessonPack.getState().start(pack, 7)
    assert.equal(useLessonPack.getState().pack, pack)
    assert.equal(useLessonPack.getState().section, 2)
    useLessonPack.getState().clear()
    assert.equal(useLessonPack.getState().pack, null)
    assert.equal(useLessonPack.getState().section, 0)
  })
})
