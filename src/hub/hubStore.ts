import { useEffect } from 'react'
import { create } from 'zustand'
import { useDocs } from '../ui/Drawers/docsStore'

// Which Study hub view the Learning drawer shows. 'home' is the card grid.
export type HubView = 'home' | 'upload' | 'quiz' | 'chat' | 'tutor' | 'record' | 'mini'

interface HubState {
  view: HubView
  go: (view: HubView) => void
}

export const useHub = create<HubState>((set) => ({
  view: 'home',
  go: (view) => set({ view }),
}))

// When this page was opened: documents created after it get a NEW chip.
export const VISIT_START = Date.now()

export const isNewThisVisit = (createdAt: string) => Date.parse(createdAt) >= VISIT_START

interface StudyDebug {
  view: HubView
  tutorId: string | null
  docs: number
}

declare global {
  interface Window {
    __ggStudy?: StudyDebug
  }
}

// Dev only: a live snapshot for the e2e (window.__ggStudy).
export function useStudyDebug() {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const write = () => {
      const d = useDocs.getState()
      window.__ggStudy = { view: useHub.getState().view, tutorId: d.tutorId, docs: d.documents.length }
    }
    write()
    const a = useHub.subscribe(write)
    const b = useDocs.subscribe(write)
    return () => {
      a()
      b()
      delete window.__ggStudy
    }
  }, [])
}
