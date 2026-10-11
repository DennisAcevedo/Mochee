import { useEffect } from 'react'
import { create } from 'zustand'
import type { DocKind, DocumentInfo, TopicInfo } from '../../../shared/docsTypes'
import { listDocuments, uploadFile, type DocsErrorCode } from './docsClient'

// The student's uploaded documents as the drawer sees them, plus the backend's
// readiness. The Learning drawer lists them, the quiz looks up topic titles
// and the board's new-tab page offers them, so it lives outside any component.

export type DocsStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UploadState {
  name: string
  progress: number // 0..1 of bytes sent
  phase: 'sending' | 'indexing' // indexing = bytes sent, the server is splitting + indexing
  kind: DocKind
}

interface DocsState {
  status: DocsStatus
  error: DocsErrorCode | null
  documents: DocumentInfo[]
  upload: UploadState | null
  uploadError: DocsErrorCode | null
  tutorId: string | null // the class whose material is listed (null = every class)
  setTutor: (tutorId: string | null) => void
  addDocument: (doc: DocumentInfo) => void
  refresh: () => Promise<void>
  addFile: (file: File, kind: DocKind) => Promise<DocumentInfo | null>
  clearUploadError: () => void
}

export const useDocs = create<DocsState>((set, get) => ({
  status: 'idle',
  error: null,
  documents: [],
  upload: null,
  uploadError: null,
  tutorId: null,

  // Switching class drops the old class's list and loads the new one.
  setTutor: (tutorId) => {
    if (get().tutorId === tutorId) return
    set({ tutorId, documents: [], status: 'idle', error: null })
    void get().refresh()
  },

  addDocument: (doc) => {
    // An upload that lands after a class switch belongs to its own class, not the one now listed.
    const cur = get().tutorId
    if (cur !== null && doc.tutorId !== cur) return
    set((s) => ({ status: 'ready', error: null, documents: [doc, ...s.documents.filter((d) => d.id !== doc.id)] }))
  },

  refresh: async () => {
    if (get().status === 'loading') return
    const tutorId = get().tutorId
    set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading' }))
    const res = await listDocuments(tutorId ?? undefined)
    if (get().tutorId !== tutorId) return // the class changed while this was in flight
    if (res.ok) set({ status: 'ready', error: null, documents: Array.isArray(res.data) ? res.data : [] })
    else set({ status: 'error', error: res.error })
  },

  addFile: async (file, kind) => {
    if (get().upload) return null
    set({ upload: { name: file.name, progress: 0, phase: 'sending', kind }, uploadError: null })
    const res = await uploadFile(
      file,
      (progress) => set((s) => (s.upload ? { upload: { ...s.upload, progress, phase: progress >= 1 ? 'indexing' : 'sending' } } : {})),
      get().tutorId ?? undefined,
      kind,
    )
    if (!res.ok) {
      set({ upload: null, uploadError: res.error })
      return null
    }
    const doc = res.data
    set((s) => ({
      upload: null,
      status: 'ready',
      error: null,
      documents: [doc, ...s.documents.filter((d) => d.id !== doc.id)],
    }))
    return doc
  },

  clearUploadError: () => set({ uploadError: null }),
}))

export const findDocument = (id: string | null) => (id ? (useDocs.getState().documents.find((d) => d.id === id) ?? null) : null)

export function findTopic(topicId: string): TopicInfo | null {
  for (const d of useDocs.getState().documents) {
    const t = d.topics.find((x) => x.id === topicId)
    if (t) return t
  }
  return null
}

// Loads the list once, then retries whenever the tab regains focus while the
// backend is not ready (it is being built in parallel and may appear later).
export function useDocsAutoRefresh() {
  useEffect(() => {
    const { status, refresh } = useDocs.getState()
    if (status === 'idle') void refresh()
    const onFocus = () => {
      if (useDocs.getState().status !== 'ready') void useDocs.getState().refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
}
