import type { Subject } from '../data/catalog'
import { script } from '../data/mockLesson'
import type { DocumentInfo } from '../../shared/docsTypes'
import type { LessonPack } from '../../shared/lessonPack'
import { CS111_OUTLINE, type LessonStep, type OutlineItem } from '../state/library'
import { deleteDocument, errorText, fetchLessonPack, uploadFile, type DocsErrorCode } from '../ui/Drawers/docsClient'

// Turns a new tutor's notes into a lesson for the Create wizard. Real files go
// through the documents backend (the same one the Learning drawer uses): each
// is uploaded to the new tutor's class, which reads its pages and finds its
// topics, then the first file's lesson pack is written and becomes the
// tutor's guided lesson. The sample notes are the built-in CS111 lesson.

export interface LessonDraft {
  name: string
  subject: Subject
}

export interface StudyFile {
  name: string
  size: number
  file?: File // missing for the sample notes
}

export interface StudyProgress {
  index: number // which line is in progress (a line's label can change while it is)
  total: number
  label: string
}

export interface GeneratedLesson {
  outline: OutlineItem[]
  steps: LessonStep[]
  lessonDoc?: string // the uploaded document the guided lesson is built from
  builtIn?: boolean // the sample notes: the hand-written CS111 lesson
  pages: Record<string, number> // page counts by file name, for the tutor's file list
}

// Something went wrong reading the notes: a docsClient error code, or
// 'no-topics' when nothing teachable was found. studyErrorText() words it.
export class StudyError extends Error {
  constructor(
    readonly code: DocsErrorCode | 'no-topics',
    readonly file?: string,
  ) {
    super(code)
  }
}

export function studyErrorText(e: StudyError): string {
  const what = e.code === 'no-topics' ? 'No topics were found in your notes, so there is nothing to teach yet. Try a file with more text.' : errorText(e.code)
  return e.file ? `${e.file}: ${what}` : what
}

const QUICK_CHECK: OutlineItem = { title: 'Quick check', mins: 3 }
const SAMPLE_MS = 700 // the sample lesson is built in; a short beat per line so it reads

const aborted = () => new DOMException('Aborted', 'AbortError')

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(aborted())
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(aborted())
    })
  })

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const shortName = (name: string) => name.replace(/\.[a-z0-9]+$/i, '')

// The outline and opening line a lesson pack gives the tutor.
export function lessonFromPack(pack: LessonPack, name: string): Pick<GeneratedLesson, 'outline' | 'steps'> {
  const outline = [...pack.sections.map((s): OutlineItem => ({ title: s.title, mins: s.mins })), QUICK_CHECK]
  const first = pack.sections[0]?.title
  const greeting = `Oh! Hi, I'm ${name}. I read ${pack.title}${first ? `, so let's start with ${first}` : ''}.`
  return { outline, steps: [{ section: 1, say: greeting }] }
}

export async function generateLesson(
  draft: LessonDraft,
  files: StudyFile[],
  tutorId: string,
  onProgress: (p: StudyProgress) => void,
  signal?: AbortSignal,
): Promise<GeneratedLesson> {
  const real = files.flatMap((f) => (f.file ? [f.file] : []))
  if (!real.length) return sampleLesson(onProgress, signal)

  const total = real.length + 1
  const uploaded: DocumentInfo[] = []
  // Leaving the wizard part-way removes what was uploaded for a tutor that will never exist.
  const undo = () => uploaded.forEach((d) => void deleteDocument(d.id))
  try {
    for (const [i, file] of real.entries()) {
      const label = `Reading ${file.name}`
      onProgress({ index: i, total, label })
      const res = await uploadFile(file, (f) => onProgress({ index: i, total, label: f < 1 ? `${label} (${Math.round(f * 100)}%)` : label }), tutorId)
      if (signal?.aborted) throw aborted()
      if (!res.ok) throw new StudyError(res.error, file.name)
      uploaded.push(res.data)
      onProgress({ index: i, total, label: `Found ${plural(res.data.topics.length, 'topic')} in ${shortName(file.name)}` })
    }
    // The first file with topics is the lesson; the rest stay in the class's material.
    const main = uploaded.find((d) => d.topics.length > 0) ?? uploaded[0]
    onProgress({ index: real.length, total, label: `Writing your lesson from ${main.title || shortName(real[uploaded.indexOf(main)].name)}` })
    const pack = await fetchLessonPack(main.id)
    if (signal?.aborted) throw aborted()
    if (!pack.ok) throw new StudyError(pack.error)
    if (!pack.data.sections.length) throw new StudyError('no-topics')
    onProgress({ index: total, total, label: `Built a ${pack.data.sections.length}-section lesson` })
    return {
      ...lessonFromPack(pack.data, draft.name),
      lessonDoc: main.id,
      pages: Object.fromEntries(uploaded.map((d, i) => [real[i].name, d.pageCount])),
    }
  } catch (e) {
    undo()
    throw e
  }
}

// "Use sample CS111 notes": the built-in lesson those notes are.
async function sampleLesson(onProgress: (p: StudyProgress) => void, signal?: AbortSignal): Promise<GeneratedLesson> {
  const labels = ['Opening the sample CS111 notes', `Loaded the ${plural(CS111_OUTLINE.length, 'section')} CS111 scheduling lesson`]
  for (const [i, label] of labels.entries()) {
    onProgress({ index: i, total: labels.length, label })
    await wait(SAMPLE_MS, signal)
  }
  return { outline: CS111_OUTLINE, steps: [{ section: 1, say: script.greeting }], builtIn: true, pages: {} }
}
