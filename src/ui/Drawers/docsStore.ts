import { useEffect } from 'react'
import { create } from 'zustand'
import type { DocumentInfo, TopicInfo } from '../../../shared/docsTypes'
import { listDocuments, uploadPdf, type DocsErrorCode } from './docsClient'

// The student's uploaded documents as the drawers see them, plus the backend's
// readiness. Both drawers read it (Learning lists them, Quest looks up topic
// titles), so it lives outside either component.

export type DocsStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UploadState {
  name: string
  progress: number // 0..1 of bytes sent
  phase: 'sending' | 'indexing' // indexing = bytes sent, the server is splitting + indexing
}

interface DocsState {
  status: DocsStatus
  error: DocsErrorCode | null
  documents: DocumentInfo[]
  upload: UploadState | null
  uploadError: DocsErrorCode | null
  refresh: () => Promise<void>
  addPdf: (file: File) => Promise<DocumentInfo | null>
  clearUploadError: () => void
}

export const useDocs = create<DocsState>((set, get) => ({
  status: 'idle',
  error: null,
  documents: [],
  upload: null,
  uploadError: null,

  refresh: async () => {
    if (get().status === 'loading') return
    set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading' }))
    const res = await listDocuments()
    if (res.ok) set({ status: 'ready', error: null, documents: Array.isArray(res.data) ? res.data : [] })
    else set({ status: 'error', error: res.error })
  },

  addPdf: async (file) => {
    if (get().upload) return null
    set({ upload: { name: file.name, progress: 0, phase: 'sending' }, uploadError: null })
    const res = await uploadPdf(file, (progress) =>
      set((s) => (s.upload ? { upload: { ...s.upload, progress, phase: progress >= 1 ? 'indexing' : 'sending' } } : {})),
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
