import { createContext, useContext } from 'react'
import type { Tutor } from './library'

// The tutor whose lesson is open. Provided by LessonPage.
export const CurrentTutorContext = createContext<Tutor | null>(null)

export function useCurrentTutor(): Tutor {
  const tutor = useContext(CurrentTutorContext)
  if (!tutor) throw new Error('useCurrentTutor() outside a lesson')
  return tutor
}
