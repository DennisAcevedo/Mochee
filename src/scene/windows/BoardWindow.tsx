// The room used to have a second window on the right for the lecture board
// and the Quick check. They are tabs of the one browser window now
// (NotesWindow.tsx), so this renders nothing; it stays exported while
// LessonRoom.tsx and lab/worlds.tsx still mount it.
export function BoardWindow() {
  return null
}
