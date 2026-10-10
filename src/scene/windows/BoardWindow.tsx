import { BrowserWindow3D } from './BrowserWindow3D'

// The right window. It opens on the lecture board ('Board · FCFS') and the
// Quick check; a click on either drives the tutor store's mode as before, and
// the walkthrough reclaims whichever it needs (lessonSync.ts). The pages are
// LectureBoard.tsx and BoardQuiz.tsx.
export function BoardWindow() {
  return <BrowserWindow3D id="board" />
}
