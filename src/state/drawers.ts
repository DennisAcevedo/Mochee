import { create } from 'zustand'

// The app-shell drawer that sits over the stage: Learning (the study hub with
// grounded chat and the document quiz, uploaded PDFs, the page viewer). Below
// the sheet breakpoint it becomes a bottom sheet that the dock opens.

// A cited passage to show in the Learning drawer's page viewer.
export interface CitationTarget {
  documentId: string
  page: number
  quote: string
}

export interface DrawersState {
  learningOpen: boolean
  documentId: string | null // null = the built-in lesson (CS111 Lecture 4)
  citation: CitationTarget | null
  sheetMode: boolean // narrow viewport: a bottom sheet instead of a side panel

  open: () => void
  close: () => void
  toggle: () => void
  selectDocument: (documentId: string | null) => void
  openCitation: (citation: CitationTarget) => void
  setSheetMode: (sheetMode: boolean) => void
}

export const useDrawers = create<DrawersState>((set) => ({
  learningOpen: true,
  documentId: null,
  citation: null,
  sheetMode: false,

  open: () => set({ learningOpen: true }),
  close: () => set({ learningOpen: false }),
  toggle: () => set((s) => ({ learningOpen: !s.learningOpen })),
  // A new document drops a citation that belongs to another one.
  selectDocument: (documentId) =>
    set((s) => ({ documentId, citation: s.citation && s.citation.documentId === documentId ? s.citation : null })),
  // The study hub follows a new citation to its reader (StudyHub).
  openCitation: (citation) => set({ citation, documentId: citation.documentId, learningOpen: true }),
  // Entering sheet mode folds the sheet away so the stage (and the tutor)
  // stays in view; the dock opens it.
  setSheetMode: (sheetMode) => set((s) => (sheetMode && !s.sheetMode ? { sheetMode, learningOpen: false } : { sheetMode })),
}))
