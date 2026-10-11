import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeAccessory, type Accessory, type TutorLook } from '../character/look'
import type { Subject } from '../data/catalog'
import { notes as cs111Notes, script } from '../data/mockLesson'

// The user's tutors, persisted to localStorage. File contents live in
// fileStore.ts (IndexedDB); only their metadata is here.

export interface TutorFile {
  id: string
  name: string
  size: number // bytes
  pages?: number
  sample?: boolean // "Use sample CS111 notes": metadata only, no File behind it
}

export interface OutlineItem {
  title: string
  mins: number
}

// One beat of the generated lesson. Gemini fills these in later; for now the
// only consumer is the intro's greeting line.
export interface LessonStep {
  section: number
  say: string
}

export interface Tutor {
  id: string
  name: string
  subject: Subject
  cap: string
  accessory: Accessory
  accessoryColors: Partial<Record<Accessory, string>>
  files: TutorFile[]
  outline: OutlineItem[]
  sectionsDone: number
  lastStudied: number | null // ms epoch
  createdAt: number
}

interface LibraryState {
  tutors: Tutor[]
  steps: Record<string, LessonStep[]> // by tutor id
  addTutor: (tutor: Tutor, steps: LessonStep[]) => void
  addFiles: (id: string, files: TutorFile[]) => void
  touchStudied: (id: string) => void
  removeTutor: (id: string) => void // the tutor and its lesson steps; its PDFs live in fileStore
}

const DAY = 86_400_000

export const CS111_ID = 'cs111'

export const CS111_OUTLINE: OutlineItem[] = [
  { title: 'Why schedule at all?', mins: 4 },
  { title: 'First-come, first-served', mins: 6 },
  { title: 'Shortest job first', mins: 6 },
  { title: 'Round robin', mins: 7 },
  { title: 'Quick check', mins: 3 },
]

const MB = 1_000_000

// The four tutors from design/Tutor Home.dc.html.
function seedTutors(now: number): Tutor[] {
  const files = (names: [string, number, number?][], prefix: string): TutorFile[] =>
    names.map(([name, size, pages], i) => ({ id: `${prefix}-${i}`, name, size, pages, sample: true }))
  return [
    {
      id: CS111_ID,
      name: 'CS111 · Operating Systems',
      subject: 'Computer science',
      cap: '',
      accessory: 'glasses',
      accessoryColors: { glasses: '#2b2b33' },
      files: [
        ...cs111Notes.map((n, i) => ({ id: `cs111-${i}`, name: n.name, size: n.pages * 0.13 * MB, pages: n.pages, sample: true })),
        { id: 'cs111-3', name: 'CS111 Lecture 2.pdf', size: 2.1 * MB, pages: 16, sample: true },
      ],
      outline: CS111_OUTLINE,
      sectionsDone: 3,
      lastStudied: now - 2 * DAY,
      createdAt: now - 30 * DAY,
    },
    {
      id: 'bio82',
      name: 'BIO 82 · Genetics',
      subject: 'Biology',
      cap: '#4c9a6a',
      accessory: 'leaf',
      accessoryColors: { leaf: '#62b46e' },
      files: files(
        [
          ['Genetics Lecture 1.pdf', 2.8 * MB, 24],
          ['Genetics Lecture 2.pdf', 3.2 * MB, 27],
          ['Mendel reading.pdf', 0.9 * MB, 12],
          ['Problem set 1.pdf', 0.3 * MB, 4],
          ['Problem set 2.pdf', 0.4 * MB, 5],
          ['Pedigree worksheet.pdf', 0.2 * MB, 2],
        ],
        'bio82',
      ),
      outline: [
        { title: "Mendel's laws", mins: 5 },
        { title: 'Punnett squares', mins: 6 },
        { title: 'Linkage and recombination', mins: 7 },
        { title: 'Pedigree analysis', mins: 6 },
        { title: 'Population genetics', mins: 7 },
        { title: 'Quick check', mins: 3 },
      ],
      sectionsDone: 1,
      lastStudied: now - 1 * DAY,
      createdAt: now - 21 * DAY,
    },
    {
      id: 'chem31a',
      name: 'CHEM 31A · Chemical Principles',
      subject: 'Chemistry',
      cap: '#d9824a',
      accessory: 'headphones',
      accessoryColors: { headphones: '#5cc4c9' },
      files: files(
        [
          ['Atomic structure.pdf', 2.2 * MB, 19],
          ['Periodic trends.pdf', 1.6 * MB, 14],
          ['Bonding notes.pdf', 1.9 * MB, 17],
        ],
        'chem31a',
      ),
      outline: [
        { title: 'Atoms and electrons', mins: 5 },
        { title: 'Periodic trends', mins: 6 },
        { title: 'Chemical bonding', mins: 7 },
        { title: 'Quick check', mins: 3 },
      ],
      sectionsDone: 4,
      lastStudied: now - 7 * DAY,
      createdAt: now - 40 * DAY,
    },
    {
      id: 'math51',
      name: 'MATH 51 · Linear Algebra',
      subject: 'Math',
      cap: '#c4566e',
      accessory: 'scarf',
      accessoryColors: { scarf: '#f2b84b' },
      files: files(
        [
          ['Vectors and spans.pdf', 1.4 * MB, 12],
          ['Matrices.pdf', 2.0 * MB, 18],
          ['Linear independence.pdf', 1.1 * MB, 10],
          ['Determinants.pdf', 1.3 * MB, 11],
          ['Eigen problem set.pdf', 0.5 * MB, 6],
        ],
        'math51',
      ),
      outline: [
        { title: 'Vectors and spans', mins: 5 },
        { title: 'Matrix multiplication', mins: 6 },
        { title: 'Linear independence', mins: 6 },
        { title: 'Bases and dimension', mins: 7 },
        { title: 'Determinants', mins: 6 },
        { title: 'Eigenvalues', mins: 7 },
        { title: 'Quick check', mins: 3 },
      ],
      sectionsDone: 2,
      lastStudied: now - 3 * DAY,
      createdAt: now - 14 * DAY,
    },
  ]
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      tutors: seedTutors(Date.now()),
      steps: { [CS111_ID]: [{ section: 1, say: script.greeting }] },

      addTutor: (tutor, steps) =>
        set((s) => ({ tutors: [tutor, ...s.tutors.filter((t) => t.id !== tutor.id)], steps: { ...s.steps, [tutor.id]: steps } })),

      addFiles: (id, files) =>
        set((s) => ({
          tutors: s.tutors.map((t) =>
            t.id === id ? { ...t, files: [...t.files, ...files.filter((f) => !t.files.some((g) => g.name === f.name))] } : t,
          ),
        })),

      touchStudied: (id) => set((s) => ({ tutors: s.tutors.map((t) => (t.id === id ? { ...t, lastStudied: Date.now() } : t)) })),

      removeTutor: (id) =>
        set((s) => {
          const steps = { ...s.steps }
          delete steps[id]
          return { tutors: s.tutors.filter((t) => t.id !== id), steps }
        }),
    }),
    { name: 'tutor-library', version: 1, partialize: (s) => ({ tutors: s.tutors, steps: s.steps }) },
  ),
)

export const useTutor = (id: string | undefined) => useLibrary((s) => s.tutors.find((t) => t.id === id))

export function lookOf(t: Pick<Tutor, 'cap' | 'accessory' | 'accessoryColors'>): TutorLook {
  const accessory = normalizeAccessory(t.accessory)
  return { cap: t.cap, accessory, accColor: t.accessoryColors[accessory] ?? '' }
}

export function newTutorId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
  return `${slug || 'tutor'}-${Math.random().toString(36).slice(2, 7)}`
}

export function formatBytes(bytes: number): string {
  return bytes > 1e6 ? (bytes / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1e3)) + ' KB'
}

// "Last studied 2 days ago", in the export's voice.
export function lastStudiedLabel(ts: number | null, now = Date.now()): string {
  if (ts === null) return 'Not studied yet'
  const days = Math.floor((startOfDay(now) - startOfDay(ts)) / DAY)
  if (days <= 0) return now - ts < 3_600_000 ? 'Last studied just now' : 'Last studied today'
  if (days === 1) return 'Last studied yesterday'
  if (days < 7) return `Last studied ${days} days ago`
  if (days < 14) return 'Last studied last week'
  if (days < 60) return `Last studied ${Math.floor(days / 7)} weeks ago`
  return `Last studied ${Math.floor(days / 30)} months ago`
}

function startOfDay(ts: number) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
