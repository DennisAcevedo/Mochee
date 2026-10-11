import { create } from 'zustand'
import { DOCS_ROUTES, type DocumentInfo, type TopicInfo } from '../../shared/docsTypes'
import type { TopicRef } from '../state/growth'
import { GROWTH } from './config'

// Where topics come from: the built-in CS111 lesson plus the student's own
// documents (GET /api/documents). The documents backend lands in parallel, so
// every fetch tolerates 404s, bad JSON and network errors by keeping what it
// had. The room's books read this store.

// The built-in lesson's topic (mockLesson / shared/lessonNotes: FCFS), as its quiz passes it to recordAnswer.
export const BUILTIN_TOPIC_REF: TopicRef = { id: 'cs111-fcfs', title: 'First-come, first-served', documentId: null }

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
