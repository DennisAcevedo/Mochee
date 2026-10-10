import { BrowserWindow3D } from './BrowserWindow3D'

// The room's one browser window, left of the tutor. It opens on the lesson
// notes tabs, the lecture board and the Quick check; the student can add,
// close, reorder and move tabs, and the walkthrough reclaims (or reopens) the
// tab it needs (lessonSync.ts).
export function NotesWindow() {
  return <BrowserWindow3D />
}
