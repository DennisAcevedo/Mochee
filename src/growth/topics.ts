import { create } from 'zustand'
import { DOCS_ROUTES, type DocumentInfo, type TopicInfo } from '../../shared/docsTypes'
import type { TopicRef } from '../state/growth'
import { GROWTH } from './config'

// Where topics come from: the built-in CS111 lesson plus the student's own
// documents (GET /api/documents). The documents backend lands in parallel, so
// every fetch tolerates 404s, bad JSON and network errors by keeping what it
// had. The room (books) and ability matching read this store.

// The built-in lesson's topic (mockLesson / shared/lessonNotes: FCFS, P1 24 / P2 3 / P3 3).
export const BUILTIN_TOPIC: { id: string; title: string; keywords: string[] } = {
  id: 'cs111-fcfs',
  title: 'First-come, first-served',
  keywords: ['FCFS', 'Convoy effect', 'Arrival order'],
}

// What the built-in quiz passes to recordAnswer.
export const BUILTIN_TOPIC_REF: TopicRef = { id: BUILTIN_TOPIC.id, title: BUILTIN_TOPIC.title, documentId: null }

// A topic as the room and matcher see it (built-in or from a document).
export interface RoomTopic {
  id: string
  title: string
  keywords: string[]
  documentId: string | null
}

export type DocsStatus = 'idle' | 'loading' | 'ok' | 'unavailable'

interface DocsState {
  documents: DocumentInfo[] // from the server
  local: DocumentInfo[] // added in the browser (lab, offline demo), never sent anywhere
  status: DocsStatus
  refresh: () => Promise<void>
  addLocalDocument: (doc: DocumentInfo) => void
  clearLocal: () => void
}

function isDocument(d: unknown): d is DocumentInfo {
  const o = d as DocumentInfo
  return !!o && typeof o.id === 'string' && typeof o.title === 'string' && Array.isArray(o.topics)
}

function cleanTopic(t: TopicInfo, documentId: string): TopicInfo | null {
  if (!t || typeof t.id !== 'string' || typeof t.title !== 'string') return null
  const keywords = Array.isArray(t.keywords) ? t.keywords.filter((k): k is string => typeof k === 'string') : []
  return { ...t, documentId, keywords }
}

let inflight: Promise<void> | null = null

export const useRoomDocs = create<DocsState>((set) => ({
  documents: [],
  local: [],
  status: 'idle',
  refresh: () => {
    if (inflight) return inflight
    set((s) => ({ status: s.status === 'ok' ? 'ok' : 'loading' }))
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), GROWTH.documentsTimeoutMs)
    inflight = fetch(DOCS_ROUTES.documents, { signal: ctrl.signal, headers: { accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        const body: unknown = await res.json()
        if (!Array.isArray(body)) throw new Error('not a list')
        const documents = body.filter(isDocument).map((d) => ({
          ...d,
          topics: d.topics.map((t) => cleanTopic(t, d.id)).filter((t): t is TopicInfo => t !== null),
        }))
        set({ documents, status: 'ok' })
      })
      .catch(() => {
        // Backend missing or down: keep the last good list.
        set((s) => ({ status: s.status === 'ok' ? 'ok' : 'unavailable' }))
      })
      .finally(() => {
        window.clearTimeout(timer)
        inflight = null
      })
    return inflight
  },
  addLocalDocument: (doc) => set((s) => ({ local: [...s.local.filter((d) => d.id !== doc.id), doc] })),
  clearLocal: () => set({ local: [] }),
}))

// Re-read the documents list now (call after an upload finishes).
export function refreshDocuments(): Promise<void> {
  return useRoomDocs.getState().refresh()
}

export function allDocuments(s: Pick<DocsState, 'documents' | 'local'>): DocumentInfo[] {
  const seen = new Set(s.documents.map((d) => d.id))
  return [...s.documents, ...s.local.filter((d) => !seen.has(d.id))]
}

// Every topic the room knows: the built-in one first, then each document's.
export function allTopics(s: Pick<DocsState, 'documents' | 'local'>): RoomTopic[] {
  const out: RoomTopic[] = [{ ...BUILTIN_TOPIC, documentId: null }]
  const seen = new Set([BUILTIN_TOPIC.id])
  for (const d of allDocuments(s)) {
    for (const t of d.topics) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      out.push({ id: t.id, title: t.title, keywords: t.keywords, documentId: d.id })
    }
  }
  return out
}

// Keywords for a topic id, from the built-in lesson or a known document.
export function keywordsFor(topicId: string): string[] {
  return allTopics(useRoomDocs.getState()).find((t) => t.id === topicId)?.keywords ?? []
}

// A document built from the built-in lesson's data, for the lab and offline
// demos: the scheduling cheat sheet with its SJF and round-robin topics.
export function sampleDocument(n: number): DocumentInfo {
  const samples: { title: string; topics: Omit<TopicInfo, 'documentId'>[] }[] = [
    {
      title: 'Scheduling cheat sheet',
      topics: [{ id: 'sched-sjf', title: 'Shortest job first', keywords: ['SJF', 'Burst time', 'Avg wait 3 ms'], firstPage: 1 }],
    },
    {
      title: 'CS111 Lecture 5',
      topics: [{ id: 'sched-rr', title: 'Round robin', keywords: ['Quantum', 'Time slice', 'Preempt'], firstPage: 2 }],
    },
    {
      title: 'CS111 Lecture 3',
      topics: [{ id: 'proc-states', title: 'Process states', keywords: ['Ready', 'Running', 'Waiting'], firstPage: 4 }],
    },
  ]
  const pick = samples[n % samples.length]
  const id = `local-${n}`
  return {
    id,
    title: pick.title,
    pageCount: 2,
    createdAt: new Date(0).toISOString(),
    tutorId: 'cs111', // DEFAULT_TUTOR_ID in shared/lessonPack.ts: the sample CS111 class
    original: 'pdf',
    kind: 'class',
    topics: pick.topics.map((t) => ({ ...t, id: n < samples.length ? t.id : `${t.id}-${n}`, documentId: id })),
  }
}
