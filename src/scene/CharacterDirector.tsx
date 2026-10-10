import { useEffect } from 'react'
import { performAction, setExpression } from '../character/controller'
import { selectExpression, selectPose, selectSpeaking, useTutorStore } from '../state/store'

// The single bridge from app state to the character. Renders nothing.
export function CharacterDirector() {
  const pose = useTutorStore(selectPose)
  const expression = useTutorStore(selectExpression)
  const speaking = useTutorStore(selectSpeaking)

  useEffect(() => {
    performAction('pose', { pose })
  }, [pose])

  useEffect(() => {
    performAction('speak', { on: speaking })
  }, [speaking])

  useEffect(() => {
    setExpression(expression)
  }, [expression])

  return null
}
