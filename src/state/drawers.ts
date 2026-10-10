import { create } from 'zustand'

// The two app-shell drawers that sit over the stage. LEFT: Learning (the
// built-in lesson, uploaded PDFs, the page viewer). RIGHT: Quest (walkthrough
// checklist + growth, grounded chat, document quiz). Below the sheet
// breakpoint they become bottom sheets and only one is open at a time.

export type DrawerId = 'learning' | 'quest'
export type QuestTab = 'quest' | 'chat' | 'quiz'

// A cited passage to show in the Learning drawer's page viewer.
export interface CitationTarget {
  documentId: string
  page: number
  quote: string
}

export interface DrawersState {
  learningOpen: boolean
  questOpen: boolean
  questTab: QuestTab
  documentId: string | null // null = the built-in lesson (CS111 Lecture 4)
  citation: CitationTarget | null
  sheetMode: boolean // narrow viewport: bottom sheets, one open at a time

  open: (which: DrawerId) => void
  close: (which: DrawerId) => void
  toggle: (which: DrawerId) => void
  setTab: (tab: QuestTab) => void
  selectDocument: (documentId: string | null) => void
  openCitation: (citation: CitationTarget) => void
  setSheetMode: (sheetMode: boolean) => void
}

const KEY: Record<DrawerId, 'learningOpen' | 'questOpen'> = { learning: 'learningOpen', quest: 'questOpen' }
const OTHER: Record<DrawerId, DrawerId> = { learning: 'quest', quest: 'learning' }

// Opening one sheet closes the other on narrow screens; side panels coexist.
const opened = (s: DrawersState, which: DrawerId) =>
  s.sheetMode ? { [KEY[which]]: true, [KEY[OTHER[which]]]: false } : { [KEY[which]]: true }

export const useDrawers = create<DrawersState>((set) => ({
  learningOpen: true,
  questOpen: true,
  questTab: 'quest',
  documentId: null,
  citation: null,
  sheetMode: false,

  open: (which) => set((s) => opened(s, which)),
  close: (which) => set({ [KEY[which]]: false }),
  toggle: (which) => set((s) => (s[KEY[which]] ? { [KEY[which]]: false } : opened(s, which))),
  setTab: (questTab) => set({ questTab }),
  // A new document drops a citation that belongs to another one.
  selectDocument: (documentId) =>
    set((s) => ({ documentId, citation: s.citation && s.citation.documentId === documentId ? s.citation : null })),
  openCitation: (citation) => set((s) => ({ citation, documentId: citation.documentId, ...opened(s, 'learning') })),
  // Entering sheet mode folds both sheets away so the stage (and the tutor)
  // stays in view; the dock opens either one.
  setSheetMode: (sheetMode) =>
    set((s) => (sheetMode && !s.sheetMode ? { sheetMode, learningOpen: false, questOpen: false } : { sheetMode })),
}))
