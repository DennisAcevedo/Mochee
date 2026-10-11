import type { Subject } from '../data/catalog'
import { script } from '../data/mockLesson'
import { CS111_OUTLINE, type LessonStep, type OutlineItem } from '../state/library'

// Turns a new tutor's notes into a lesson. The Create wizard only talks to
// this function: swap the body for Gemini and the UI stays as it is.

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
  index: number // which line is in progress
  total: number
  label: string
}

export interface GeneratedLesson {
  outline: OutlineItem[]
  steps: LessonStep[]
}

const STEP_MS = 1150 // the export's pacing

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

// The progress lines shown while studying (studyLines() in the export).
export function studyLabels(files: StudyFile[]): string[] {
  const first = (files[0]?.name ?? 'your notes').replace(/\.pdf$/i, '').replace(/^CS\d+\s*/i, '')
  return [
    `Reading ${files.length} file${files.length === 1 ? '' : 's'}`,
    `Found 5 topics in ${first}`,
    'Pulled out 18 key terms',
    'Wrote 12 practice questions',
    'Built your lesson outline',
  ]
}

// Placeholder: fakes the progress and returns the CS111 lesson.
export async function generateLesson(
  _draft: LessonDraft,
  files: StudyFile[],
  onProgress: (p: StudyProgress) => void,
  signal?: AbortSignal,
): Promise<GeneratedLesson> {
  const labels = studyLabels(files)
  for (let i = 0; i < labels.length; i++) {
    onProgress({ index: i, total: labels.length, label: labels[i] })
    await wait(STEP_MS, signal)
  }
  return {
    outline: CS111_OUTLINE,
    steps: [{ section: 1, say: script.greeting }],
  }
}
