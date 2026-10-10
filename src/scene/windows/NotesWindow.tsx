import { BrowserWindow3D } from './BrowserWindow3D'

// The left window. It opens on the lesson notes tabs (notesTabs); the student
// can add, close, reorder and move tabs, and the walkthrough reclaims the
// notes tab it needs (lessonSync.ts). The page itself is NotesPage.tsx.
export function NotesWindow() {
  return <BrowserWindow3D id="notes" />
}
